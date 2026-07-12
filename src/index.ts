import { EventManager, ForgeClient, ForgeExtension, Logger } from '@tryforge/forgescript'
import {
  LavalinkManager,
  LavalinkNodeOptions,
  Player,
  PlayerEvents,
  SearchPlatform,
  Track,
} from 'lavalink-client'
import path from 'path'
import { TypedEmitter } from 'tiny-typed-emitter'

import { PlayerRelatingManager } from './managers/playerRelating.js'
import { ForgeLinkedCommandManager } from './structures/ForgeLinkedCommandManager.js'
import { IForgeLinkedEvents } from './structures/ForgeLinkedEventManager.js'

/* -------------------------------------------------------------------------- */
/*                                Type Options                                */
/* -------------------------------------------------------------------------- */

export interface ForgeLinkSetupOptions {
  nodes: LavalinkNodeOptions[]
  defaultVolume?: number
  autoSkip?: boolean
  autoSkipOnResolveError?: boolean
  emitNewSongsOnly?: boolean
  requesterTransformer?: (requester: unknown) => unknown
  /**
   * Custom autoplay function. When provided, this fully overrides the built-in
   * autoplay behaviour. The function receives the player and the last played
   * track and should add at least one track to the queue to keep playback going.
   */
  autoPlayFunction?: (player: Player, lastPlayedTrack: Track) => Promise<void>
  /**
   * Default search platform used by the built-in autoplay engine when looking
   * up related tracks. Defaults to the player's `defaultSearchPlatform`.
   * Common values: `'ytsearch'`, `'ytmsearch'`, `'scsearch'`.
   */
  defaultAutoPlaySource?: SearchPlatform
  events?: Array<keyof IForgeLinkedEvents>
  playerOptions?: {
    applyVolumeAsFilter?: boolean
    clientBasedPositionUpdateInterval?: number
    defaultSearchPlatform?: SearchPlatform
    volumeDecrementer?: number
    useUnresolvedData?: boolean
    onDisconnect?: {
      autoReconnect?: boolean
      destroyPlayer?: boolean
    }
    onEmptyQueue?: {
      destroyAfterMs?: number
    }
  }
  queueOptions?: {
    maxPreviousTracks?: number
  }
  autoplayOptions?: {
    maxFetchTracks?: number
    retryLimit?: number
    retryDuration?: number
  }
  linksAllowed?: boolean
  linksBlacklist?: string[]
  linksWhitelist?: string[]
}

export type TransformEvents<T> = {
  [P in keyof T]: T[P] extends unknown[] ? (...args: T[P]) => void : never
}

/* -------------------------------------------------------------------------- */
/*                               ForgeLink Class                              */
/* -------------------------------------------------------------------------- */

export class ForgeLinked extends ForgeExtension {
  name = 'ForgeLink'
  description = 'ForgeScript integration with lavalink-client'
  version = '2.3.0'

  public client!: ForgeClient
  public lavalink!: LavalinkManager
  public commands!: ForgeLinkedCommandManager

  private emitter = new TypedEmitter<TransformEvents<IForgeLinkedEvents>>()

  constructor(private readonly options: ForgeLinkSetupOptions) {
    super()
  }

  async init(client: ForgeClient) {
    const start = Date.now()
    this.client = client
    this.lavalink = new LavalinkManager({
      nodes: this.options.nodes,
      sendToShard: (guildId, payload) => {
        const guild = this.client.guilds.cache.get(guildId)
        if (guild) guild.shard.send(payload)
        return Promise.resolve()
      },
      autoSkip: this.options.autoSkip ?? true,
      autoSkipOnResolveError: this.options.autoSkipOnResolveError ?? true,
      emitNewSongsOnly: this.options.emitNewSongsOnly ?? true,
      playerOptions: {
        applyVolumeAsFilter: this.options.playerOptions?.applyVolumeAsFilter ?? false,
        clientBasedPositionUpdateInterval:
          this.options.playerOptions?.clientBasedPositionUpdateInterval ?? 50,
        defaultSearchPlatform:
          this.options.playerOptions?.defaultSearchPlatform ?? ('ytsearch' as SearchPlatform),
        volumeDecrementer: this.options.playerOptions?.volumeDecrementer ?? 0.75,
        useUnresolvedData: this.options.playerOptions?.useUnresolvedData ?? true,
        requesterTransformer: this.options.requesterTransformer,
        onDisconnect: {
          autoReconnect: this.options.playerOptions?.onDisconnect?.autoReconnect ?? true,
          destroyPlayer: this.options.playerOptions?.onDisconnect?.destroyPlayer ?? false,
        },
        onEmptyQueue: {
          destroyAfterMs: this.options.playerOptions?.onEmptyQueue?.destroyAfterMs ?? 30000,
          autoPlayFunction: this._buildAutoPlayFunction(),
        },
      },
      queueOptions: {
        maxPreviousTracks: this.options.queueOptions?.maxPreviousTracks ?? 10,
      },
      linksAllowed: this.options.linksAllowed ?? true,
      linksBlacklist: this.options.linksBlacklist ?? [],
      linksWhitelist: this.options.linksWhitelist ?? [],
    })

    this.commands = new ForgeLinkedCommandManager(this.client)

    this.lavalink.on('trackStart', (_player, track) => {
      if ((track as any)?.pluginInfo?.clientData?.previousTrack) {
        delete (track as any).pluginInfo.clientData.previousTrack
      }
    })

    EventManager.load('ForgeLinked', __dirname + `/events`)
    if (this.options.events?.length) {
      this.client.events.load('ForgeLinked', this.options.events)
    }

    const sendRawData = (packet: any, attempts = 0): void => {
      this.lavalink.sendRawData(packet).catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        const nodeNotReady =
          message.includes('Lavalink Node is either not ready or not up to date') ||
          message.includes('Lavalink-Node is either not ready or not up to date')

        if (nodeNotReady) {
          if (attempts < 5) setTimeout(() => sendRawData(packet, attempts + 1), 1000)
          return
        }

        console.error('Failed to send raw data to Lavalink:', err)
      })
    }

    client.on('raw', sendRawData)

    this.load(path.join(__dirname, './natives'))
    client.on('clientReady', async () => {
      // Register the connect listener BEFORE init() so we never miss a node
      // connection - including fallback reconnects when one of multiple nodes
      // fails during initialisation and comes back later.
      this.lavalink.nodeManager.on('connect', (node) => {
        const nodeData = {
          id: node.id,
          info: node.info,
        }

        this.emitter.emit('linkedNodeConnect', [nodeData])
      })

      try {
        await this.lavalink.init({
          id: client.user.id,
          username: client.user.username,
        })
      } catch (err) {
        // One or more nodes failed to connect on startup.
        // We intentionally do NOT return here - remaining nodes may still be
        // healthy, and failed nodes will fire 'connect' via the listener above
        // once they come back (fallback behaviour).
        Logger.error('Lavalink failed to initialize:', err)
        this._emitError(err)
      }
    })

    if (this.options.events?.length) {
      for (const linkedEvent of this.options.events) {
        const lavalinkEvent = linkedEvent.startsWith('linked')
          ? linkedEvent.charAt(6).toLowerCase() + linkedEvent.slice(7)
          : linkedEvent

        this.lavalink.on(lavalinkEvent as any, (...args: unknown[]) => {
          this.emitter.emit(linkedEvent as keyof IForgeLinkedEvents, ...(args as any))
        })
      }
    }
    this.lavalink.nodeManager.on('error', (node, error) => {
      Logger.error(`Lavalink node "${node.id}" error:`, error)
      this._emitError(error)
    })
    console.debug(`ForgeLink: Initialized in ${Date.now() - start}ms`)
  }

  private _emitError(error: unknown) {
    if (this.emitter.listenerCount('error') === 0) return

    this.emitter.emit('error', error instanceof Error ? error : new Error(String(error)))
  }

  private _buildAutoPlayFunction():
    ((player: Player, lastPlayedTrack: Track) => Promise<void>) | undefined {
    if (this.options.autoPlayFunction) return this.options.autoPlayFunction

    const relating = new PlayerRelatingManager({
      defaultAutoPlaySource: this.options.defaultAutoPlaySource,
      defaultSearchPlatform: this.options.playerOptions?.defaultSearchPlatform,
      autoplayOptions: this.options.autoplayOptions,
    })

    return (player: Player, lastPlayedTrack: Track): Promise<void> =>
      relating.autoplay(player, lastPlayedTrack)
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Exports                                   */
/* -------------------------------------------------------------------------- */

export type { PlayerEvents, SearchPlatform, LavalinkNodeOptions }
