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
                this.emitter.emit('error', err);
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
        this.lavalink.nodeManager.on('error', (error) => {
            forgescript_1.Logger.error('Lavalink Error:', error);
        });
        console.debug(`ForgeLink: Initialized in ${Date.now() - start}ms`);
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
    _resolveRecQuery(uri, title, author) {
        // ── Spotify ─────────────────────────────────────────────────────────────
        const spotifyMatch = uri.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/) ??
            uri.match(/spotify:track:([A-Za-z0-9]+)/);
        if (spotifyMatch)
            return { query: spotifyMatch[1], source: 'sprec' };
        // ── Deezer ──────────────────────────────────────────────────────────────
        const deezerMatch = uri.match(/deezer\.com\/(?:\w+\/)?track\/(\d+)/);
        if (deezerMatch)
            return { query: deezerMatch[1], source: 'dzrec' };
        // ── Yandex Music ────────────────────────────────────────────────────────
        const yandexMatch = uri.match(/music\.yandex\.[a-z]+\/album\/\d+\/track\/(\d+)/);
        if (yandexMatch)
            return { query: yandexMatch[1], source: 'ymrec' };
        // ── VK Music ────────────────────────────────────────────────────────────
        const vkMatch = uri.match(/vk\.com\/audio(-?\d+_\d+)/);
        if (vkMatch)
            return { query: vkMatch[1], source: 'vkrec' };
        // ── Tidal ────────────────────────────────────────────────────────────────
        const tidalMatch = uri.match(/tidal\.com\/(?:\w+\/)?track\/(\d+)/);
        if (tidalMatch)
            return { query: tidalMatch[1], source: 'tdrec' };
        // ── Qobuz ───────────────────────────────────────────────────────────────
        const qobuzMatch = uri.match(/qobuz\.com\/(?:\w+-\w+\/)?track\/([A-Za-z0-9]+)/);
        if (qobuzMatch)
            return { query: qobuzMatch[1], source: 'qbrec' };
        // ── Pandora ──────────────────────────────────────────────────────────────
        const pandoraMatch = uri.match(/pandora\.com\/.*\/TR:(\d+)/);
        if (pandoraMatch)
            return { query: pandoraMatch[1], source: 'pdrec' };
        // ── JioSaavn ────────────────────────────────────────────────────────────
        if (uri.includes('jiosaavn.com') || uri.includes('saavn.com')) {
            // JioSaavn rec uses song title + author as the seed query
            return { query: `${title} ${author}`.trim(), source: 'jsrec' };
        }
        return null;
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
    _buildAutoPlayFunction() {
        if (this.options.autoPlayFunction)
            return this.options.autoPlayFunction;
        return async (player, lastPlayedTrack) => {
            if (!player.autoPlay)
                return;
            try {
                const { uri = '', title = '', author = '' } = lastPlayedTrack.info;
                const fallbackQuery = `${title} ${author}`.trim() || 'popular music';
                const defaultYouTubeSearchSource = this.options.defaultAutoPlaySource ??
                    this.options.playerOptions?.defaultSearchPlatform ??
                    'ytsearch';
                /* ── 1. Build the recommendation query ─────────────────────────── */
                let query;
                let source;
                // LavaSrc platform-native recommendations
                const recResolved = this._resolveRecQuery(uri, title, author);
                const isYouTubeTrack = uri.includes('youtube.com') ||
                    uri.includes('youtu.be') ||
                    uri.startsWith('https://www.youtube');
                if (recResolved) {
                    // Native LavaSrc rec — seed with the track id / title
                    query = recResolved.query;
                    source = recResolved.source;
                }
                else if (isYouTubeTrack) {
                    // YouTube URL/radio lookups often return the same track or hit REST timeouts.
                    query = fallbackQuery;
                    source = defaultYouTubeSearchSource;
                }
                else if (uri.includes('soundcloud.com')) {
                    // SoundCloud — search for related tracks by genre/title
                    query = `${title} ${author}`.trim();
                    source = 'scsearch';
                }
                else if (uri.startsWith('http')) {
                    query = uri;
                    source = this.options.defaultAutoPlaySource ?? 'ytmsearch';
                }
                else {
                    // Generic fallback: honour user config or default to ytmsearch
                    source =
                        this.options.defaultAutoPlaySource ??
                            this.options.playerOptions?.defaultSearchPlatform ??
                            'ytmsearch';
                    query = fallbackQuery;
                }
                /* ── 2. Fetch recommendations ───────────────────────────────────── */
                const result = await player
                    .search({ query, source }, lastPlayedTrack.requester)
                    .catch(() => null);
                if (!result ||
                    !result.tracks.length ||
                    result.loadType === 'empty' ||
                    result.loadType === 'error') {
                    // Platform rec / direct URL lookup failed — use a text search fallback.
                    // YouTube URL lookups can hit Lavalink's REST timeout before returning radio results.
                    if (recResolved || query === uri || isYouTubeTrack) {
                        const fallbackSource = recResolved
                            ? 'ytmsearch'
                            : isYouTubeTrack
                                ? 'ytmsearch'
                                : (this.options.defaultAutoPlaySource ??
                                    this.options.playerOptions?.defaultSearchPlatform ??
                                    'ytsearch');
                        const fallback = await player
                            .search({ query: fallbackQuery, source: fallbackSource }, lastPlayedTrack.requester)
                            .catch(() => null);
                        const fallbackTracks = recResolved
                            ? (fallback?.tracks ?? [])
                            : (fallback?.tracks?.filter((t) => t.info?.uri !== uri) ?? []);
                        if (!fallbackTracks.length) {
                            forgescript_1.Logger.warn(`ForgeLinked autoplay: no recommendations found for "${title}"`);
                            return;
                        }
                        const fbTrack = fallbackTracks[0];
                        player.queue.add(fbTrack);
                        return;
                    }
                    forgescript_1.Logger.warn(`ForgeLinked autoplay: no results found for "${query}"`);
                    return;
                }
                /* ── 3. Deduplicate against queue + history ─────────────────────── */
                const played = new Set([
                    ...(player.queue.previous?.map((t) => t.info?.uri).filter(Boolean) ?? []),
                    uri, // the track that just ended
                ]);
                const queued = new Set(player.queue.tracks?.map((t) => t.info?.uri).filter(Boolean) ?? []);
                const fresh = result.tracks.filter((t) => !played.has(t.info?.uri) && !queued.has(t.info?.uri));
                if (!fresh.length && !recResolved && query === uri) {
                    const textFallback = await player
                        .search({
                        query: fallbackQuery,
                        source: 'ytmsearch',
                    }, lastPlayedTrack.requester)
                        .catch(() => null);
                    if (textFallback?.tracks.length) {
                        const freshFb = textFallback.tracks.filter((t) => !played.has(t.info?.uri) && !queued.has(t.info?.uri));
                        // Exclude the exact track that just ended as a hard filter
                        const poolFb = (freshFb.length ? freshFb : textFallback.tracks).filter((t) => t.info?.uri !== uri);
                        if (poolFb.length) {
                            const pickFb = poolFb.slice(0, 10)[Math.floor(Math.random() * Math.min(poolFb.length, 10))];
                            player.queue.add(pickFb);
                            return;
                        }
                    }
                }
                const pool = fresh.length ? fresh : result.tracks.filter((t) => t.info?.uri !== uri);
                if (!pool.length) {
                    forgescript_1.Logger.warn(`ForgeLinked autoplay: all candidates were duplicates for "${title}"`);
                    return;
                }
                const candidates = pool.slice(0, 10);
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                player.queue.add(pick);
            }
            catch (err) {
                forgescript_1.Logger.error('ForgeLinked autoplay error:', err);
            }
        };
    }
}
exports.ForgeLinked = ForgeLinked;
//# sourceMappingURL=index.js.map