"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeLinked = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const lavalink_client_1 = require("lavalink-client");
const path_1 = __importDefault(require("path"));
const tiny_typed_emitter_1 = require("tiny-typed-emitter");
const playerRelating_js_1 = require("./managers/playerRelating.js");
const ForgeLinkedCommandManager_js_1 = require("./structures/ForgeLinkedCommandManager.js");
/* -------------------------------------------------------------------------- */
/*                               ForgeLink Class                              */
/* -------------------------------------------------------------------------- */
class ForgeLinked extends forgescript_1.ForgeExtension {
    options;
    name = 'ForgeLink';
    description = 'ForgeScript integration with lavalink-client';
    version = '2.3.0';
    client;
    lavalink;
    commands;
    emitter = new tiny_typed_emitter_1.TypedEmitter();
    constructor(options) {
        super();
        this.options = options;
    }
    async init(client) {
        const start = Date.now();
        this.client = client;
        this.lavalink = new lavalink_client_1.LavalinkManager({
            nodes: this.options.nodes,
            sendToShard: (guildId, payload) => {
                const guild = this.client.guilds.cache.get(guildId);
                if (guild)
                    guild.shard.send(payload);
                return Promise.resolve();
            },
            autoSkip: this.options.autoSkip ?? true,
            autoSkipOnResolveError: this.options.autoSkipOnResolveError ?? true,
            emitNewSongsOnly: this.options.emitNewSongsOnly ?? true,
            playerOptions: {
                applyVolumeAsFilter: this.options.playerOptions?.applyVolumeAsFilter ?? false,
                clientBasedPositionUpdateInterval: this.options.playerOptions?.clientBasedPositionUpdateInterval ?? 50,
                defaultSearchPlatform: this.options.playerOptions?.defaultSearchPlatform ?? 'ytsearch',
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
        });
        this.commands = new ForgeLinkedCommandManager_js_1.ForgeLinkedCommandManager(this.client);
        this.lavalink.on('trackStart', (_player, track) => {
            if (track?.pluginInfo?.clientData?.previousTrack) {
                delete track.pluginInfo.clientData.previousTrack;
            }
        });
        forgescript_1.EventManager.load('ForgeLinked', __dirname + `/events`);
        if (this.options.events?.length) {
            this.client.events.load('ForgeLinked', this.options.events);
        }
        const sendRawData = (packet, attempts = 0) => {
            this.lavalink.sendRawData(packet).catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                const nodeNotReady = message.includes('Lavalink Node is either not ready or not up to date') ||
                    message.includes('Lavalink-Node is either not ready or not up to date');
                if (nodeNotReady) {
                    if (attempts < 5)
                        setTimeout(() => sendRawData(packet, attempts + 1), 1000);
                    return;
                }
                console.error('Failed to send raw data to Lavalink:', err);
            });
        };
        client.on('raw', sendRawData);
        this.load(path_1.default.join(__dirname, './natives'));
        client.on('clientReady', async () => {
            // Register the connect listener BEFORE init() so we never miss a node
            // connection - including fallback reconnects when one of multiple nodes
            // fails during initialisation and comes back later.
            this.lavalink.nodeManager.on('connect', (node) => {
                const nodeData = {
                    id: node.id,
                    info: node.info,
                };
                this.emitter.emit('linkedNodeConnect', [nodeData]);
            });
            try {
                await this.lavalink.init({
                    id: client.user.id,
                    username: client.user.username,
                });
            }
            catch (err) {
                // One or more nodes failed to connect on startup.
                // We intentionally do NOT return here - remaining nodes may still be
                // healthy, and failed nodes will fire 'connect' via the listener above
                // once they come back (fallback behaviour).
                forgescript_1.Logger.error('Lavalink failed to initialize:', err);
                this._emitError(err);
            }
        });
        if (this.options.events?.length) {
            for (const linkedEvent of this.options.events) {
                const lavalinkEvent = linkedEvent.startsWith('linked')
                    ? linkedEvent.charAt(6).toLowerCase() + linkedEvent.slice(7)
                    : linkedEvent;
                this.lavalink.on(lavalinkEvent, (...args) => {
                    this.emitter.emit(linkedEvent, ...args);
                });
            }
        }
        this.lavalink.nodeManager.on('error', (node, error) => {
            forgescript_1.Logger.error(`Lavalink node "${node.id}" error:`, error);
            this._emitError(error);
        });
        console.debug(`ForgeLink: Initialized in ${Date.now() - start}ms`);
    }
    _emitError(error) {
        if (this.emitter.listenerCount('error') === 0)
            return;
        this.emitter.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
    _buildAutoPlayFunction() {
        if (this.options.autoPlayFunction)
            return this.options.autoPlayFunction;
        const relating = new playerRelating_js_1.PlayerRelatingManager({
            defaultAutoPlaySource: this.options.defaultAutoPlaySource,
            defaultSearchPlatform: this.options.playerOptions?.defaultSearchPlatform,
            autoplayOptions: this.options.autoplayOptions,
        });
        return (player, lastPlayedTrack) => relating.autoplay(player, lastPlayedTrack);
    }
}
exports.ForgeLinked = ForgeLinked;
//# sourceMappingURL=index.js.map