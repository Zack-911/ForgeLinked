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
        this.emitter.emit('error', err as Error)
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
    this.lavalink.nodeManager.on('error', (error) => {
      Logger.error('Lavalink Error:', error)
    })
    console.debug(`ForgeLink: Initialized in ${Date.now() - start}ms`)
  }

  /* ---------------------------------------------------------------------- */
  /*  Recommendation-based autoplay engine                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * Detects which LavaSrc recommendation source to use (`sprec`, `dzrec`, …)
   * based on the URI of the last played track, and returns the full query
   * string to pass to `player.search()`.
   *
   * Returns `null` when the URI doesn't match any known recommendation source;
   * the caller will fall back to a YouTube Music radio search in that case.
   *
   * Platform coverage (requires LavaSrc plugin on the Lavalink server):
   *   Spotify     → sprec:<trackId>
   *   Deezer      → dzrec:<trackId>
   *   Apple Music → amsearch:<title author> (no native rec prefix in LavaSrc)
   *   Yandex      → ymrec:<trackId>
   *   VK Music    → vkrec:<trackId>
   *   Tidal       → tdrec:<trackId>
   *   Qobuz       → qbrec:<trackId>
   *   Pandora     → pdrec:<trackId>
   *   JioSaavn    → jsrec:<trackId>
   */
  private _resolveRecQuery(
    uri: string,
    title: string,
    author: string,
  ): { query: string; source: SearchPlatform } | null {
    // ── Spotify ─────────────────────────────────────────────────────────────
    const spotifyMatch =
      uri.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/) ??
      uri.match(/spotify:track:([A-Za-z0-9]+)/)
    if (spotifyMatch) return { query: spotifyMatch[1], source: 'sprec' as SearchPlatform }

    // ── Deezer ──────────────────────────────────────────────────────────────
    const deezerMatch = uri.match(/deezer\.com\/(?:\w+\/)?track\/(\d+)/)
    if (deezerMatch) return { query: deezerMatch[1], source: 'dzrec' as SearchPlatform }

    // ── Yandex Music ────────────────────────────────────────────────────────
    const yandexMatch = uri.match(/music\.yandex\.[a-z]+\/album\/\d+\/track\/(\d+)/)
    if (yandexMatch) return { query: yandexMatch[1], source: 'ymrec' as SearchPlatform }

    // ── VK Music ────────────────────────────────────────────────────────────
    const vkMatch = uri.match(/vk\.com\/audio(-?\d+_\d+)/)
    if (vkMatch) return { query: vkMatch[1], source: 'vkrec' as SearchPlatform }

    // ── Tidal ────────────────────────────────────────────────────────────────
    const tidalMatch = uri.match(/tidal\.com\/(?:\w+\/)?track\/(\d+)/)
    if (tidalMatch) return { query: tidalMatch[1], source: 'tdrec' as SearchPlatform }

    // ── Qobuz ───────────────────────────────────────────────────────────────
    const qobuzMatch = uri.match(/qobuz\.com\/(?:\w+-\w+\/)?track\/([A-Za-z0-9]+)/)
    if (qobuzMatch) return { query: qobuzMatch[1], source: 'qbrec' as SearchPlatform }

    // ── Pandora ──────────────────────────────────────────────────────────────
    const pandoraMatch = uri.match(/pandora\.com\/.*\/TR:(\d+)/)
    if (pandoraMatch) return { query: pandoraMatch[1], source: 'pdrec' as SearchPlatform }

    // ── JioSaavn ────────────────────────────────────────────────────────────
    if (uri.includes('jiosaavn.com') || uri.includes('saavn.com')) {
      // JioSaavn rec uses song title + author as the seed query
      return { query: `${title} ${author}`.trim(), source: 'jsrec' as SearchPlatform }
    }

    return null
  }

  /**
   * Builds the autoplay function passed to lavalink-client's `onEmptyQueue`.
   *
   * Priority:
   *   1. User-supplied `autoPlayFunction` → used as-is (full override).
   *   2. Built-in recommendation engine (only fires when `player.autoPlay === true`):
   *      a. Detect track's source → use platform-native `{platform}rec:{id}` (LavaSrc).
   *      b. YouTube / YouTube Music → text search by title + author.
   *      c. SoundCloud → `scsearch:{title} {author} related`.
   *      d. Generic fallback → configured `defaultAutoPlaySource` or `ytmsearch`.
   *      Results are deduplicated against the current queue + play history.
   */
  private _buildAutoPlayFunction():
    | ((player: Player, lastPlayedTrack: Track) => Promise<void>)
    | undefined {
    if (this.options.autoPlayFunction) return this.options.autoPlayFunction

    return async (player: Player, lastPlayedTrack: Track): Promise<void> => {
      if (!(player as any).autoPlay) return

      try {
        const { uri = '', title = '', author = '' } = lastPlayedTrack.info
        const fallbackQuery = `${title} ${author}`.trim() || 'popular music'
        const defaultYouTubeSearchSource =
          this.options.defaultAutoPlaySource ??
          (this.options.playerOptions?.defaultSearchPlatform as SearchPlatform | undefined) ??
          ('ytsearch' as SearchPlatform)

        /* ── 1. Build the recommendation query ─────────────────────────── */
        let query: string
        let source: SearchPlatform

        // LavaSrc platform-native recommendations
        const recResolved = this._resolveRecQuery(uri, title, author)
        const isYouTubeTrack =
          uri.includes('youtube.com') ||
          uri.includes('youtu.be') ||
          uri.startsWith('https://www.youtube')

        if (recResolved) {
          // Native LavaSrc rec — seed with the track id / title
          query = recResolved.query
          source = recResolved.source
        } else if (isYouTubeTrack) {
          // YouTube URL/radio lookups often return the same track or hit REST timeouts.
          query = fallbackQuery
          source = defaultYouTubeSearchSource
        } else if (uri.includes('soundcloud.com')) {
          // SoundCloud — search for related tracks by genre/title
          query = `${title} ${author}`.trim()
          source = 'scsearch' as SearchPlatform
        } else if (uri.startsWith('http')) {
          query = uri
          source = this.options.defaultAutoPlaySource ?? ('ytmsearch' as SearchPlatform)
        } else {
          // Generic fallback: honour user config or default to ytmsearch
          source =
            this.options.defaultAutoPlaySource ??
            (this.options.playerOptions?.defaultSearchPlatform as SearchPlatform | undefined) ??
            ('ytmsearch' as SearchPlatform)
          query = fallbackQuery
        }

        /* ── 2. Fetch recommendations ───────────────────────────────────── */
        const result = await player
          .search({ query, source }, lastPlayedTrack.requester)
          .catch(() => null)

        if (
          !result ||
          !result.tracks.length ||
          result.loadType === 'empty' ||
          result.loadType === 'error'
        ) {
          // Platform rec / direct URL lookup failed — use a text search fallback.
          // YouTube URL lookups can hit Lavalink's REST timeout before returning radio results.
          if (recResolved || query === uri || isYouTubeTrack) {
            const fallbackSource = recResolved
              ? ('ytmsearch' as SearchPlatform)
              : isYouTubeTrack
                ? ('ytmsearch' as SearchPlatform)
                : (this.options.defaultAutoPlaySource ??
                  (this.options.playerOptions?.defaultSearchPlatform as
                    | SearchPlatform
                    | undefined) ??
                  ('ytsearch' as SearchPlatform))
            const fallback = await player
              .search({ query: fallbackQuery, source: fallbackSource }, lastPlayedTrack.requester)
              .catch(() => null)

            const fallbackTracks = recResolved
              ? (fallback?.tracks ?? [])
              : (fallback?.tracks?.filter((t: any) => t.info?.uri !== uri) ?? [])

            if (!fallbackTracks.length) {
              Logger.warn(`ForgeLinked autoplay: no recommendations found for "${title}"`)
              return
            }

            const fbTrack = fallbackTracks[0]
            player.queue.add(fbTrack)
            return
          }

          Logger.warn(`ForgeLinked autoplay: no results found for "${query}"`)
          return
        }

        /* ── 3. Deduplicate against queue + history ─────────────────────── */
        const played = new Set<string>([
          ...(player.queue.previous?.map((t: any) => t.info?.uri).filter(Boolean) ?? []),
          uri, // the track that just ended
        ])

        const queued = new Set<string>(
          player.queue.tracks?.map((t: any) => t.info?.uri).filter(Boolean) ?? [],
        )

        const fresh = result.tracks.filter(
          (t: any) => !played.has(t.info?.uri) && !queued.has(t.info?.uri),
        )

        if (!fresh.length && !recResolved && query === uri) {
          const textFallback = await player
            .search(
              {
                query: fallbackQuery,
                source: 'ytmsearch' as SearchPlatform,
              },
              lastPlayedTrack.requester,
            )
            .catch(() => null)

          if (textFallback?.tracks.length) {
            const freshFb = textFallback.tracks.filter(
              (t: any) => !played.has(t.info?.uri) && !queued.has(t.info?.uri),
            )
            // Exclude the exact track that just ended as a hard filter
            const poolFb = (freshFb.length ? freshFb : textFallback.tracks).filter(
              (t: any) => t.info?.uri !== uri,
            )
            if (poolFb.length) {
              const pickFb = poolFb.slice(0, 10)[
                Math.floor(Math.random() * Math.min(poolFb.length, 10))
              ]
              player.queue.add(pickFb)
              return
            }
          }
        }

        const pool = fresh.length ? fresh : result.tracks.filter((t: any) => t.info?.uri !== uri)
        if (!pool.length) {
          Logger.warn(`ForgeLinked autoplay: all candidates were duplicates for "${title}"`)
          return
        }
        const candidates = pool.slice(0, 10)
        const pick = candidates[Math.floor(Math.random() * candidates.length)]

        player.queue.add(pick)
      } catch (err) {
        Logger.error('ForgeLinked autoplay error:', err)
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Exports                                   */
/* -------------------------------------------------------------------------- */

export type { PlayerEvents, SearchPlatform, LavalinkNodeOptions }
