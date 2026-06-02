import { ForgeClient, ForgeExtension } from '@tryforge/forgescript';
import { LavalinkManager, LavalinkNodeOptions, Player, PlayerEvents, SearchPlatform, Track } from 'lavalink-client';
import { ForgeLinkedCommandManager } from './structures/ForgeLinkedCommandManager.js';
import { IForgeLinkedEvents } from './structures/ForgeLinkedEventManager.js';
export interface ForgeLinkSetupOptions {
    nodes: LavalinkNodeOptions[];
    defaultVolume?: number;
    autoSkip?: boolean;
    autoSkipOnResolveError?: boolean;
    emitNewSongsOnly?: boolean;
    requesterTransformer?: (requester: unknown) => unknown;
    /**
     * Custom autoplay function. When provided, this fully overrides the built-in
     * autoplay behaviour. The function receives the player and the last played
     * track and should add at least one track to the queue to keep playback going.
     */
    autoPlayFunction?: (player: Player, lastPlayedTrack: Track) => Promise<void>;
    /**
     * Default search platform used by the built-in autoplay engine when looking
     * up related tracks. Defaults to the player's `defaultSearchPlatform`.
     * Common values: `'ytsearch'`, `'ytmsearch'`, `'scsearch'`.
     */
    defaultAutoPlaySource?: SearchPlatform;
    events?: Array<keyof IForgeLinkedEvents>;
    playerOptions?: {
        applyVolumeAsFilter?: boolean;
        clientBasedPositionUpdateInterval?: number;
        defaultSearchPlatform?: SearchPlatform;
        volumeDecrementer?: number;
        useUnresolvedData?: boolean;
        onDisconnect?: {
            autoReconnect?: boolean;
            destroyPlayer?: boolean;
        };
        onEmptyQueue?: {
            destroyAfterMs?: number;
        };
    };
    queueOptions?: {
        maxPreviousTracks?: number;
    };
    linksAllowed?: boolean;
    linksBlacklist?: string[];
    linksWhitelist?: string[];
}
export type TransformEvents<T> = {
    [P in keyof T]: T[P] extends unknown[] ? (...args: T[P]) => void : never;
};
export declare class ForgeLinked extends ForgeExtension {
    private readonly options;
    name: string;
    description: string;
    version: string;
    client: ForgeClient;
    lavalink: LavalinkManager;
    commands: ForgeLinkedCommandManager;
    private emitter;
    constructor(options: ForgeLinkSetupOptions);
    init(client: ForgeClient): Promise<void>;
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
    private _resolveRecQuery;
    /**
     * Builds the autoplay function passed to lavalink-client's `onEmptyQueue`.
     *
     * Priority:
     *   1. User-supplied `autoPlayFunction` → used as-is (full override).
     *   2. Built-in recommendation engine (only fires when `player.autoPlay === true`):
     *      a. Detect track's source → use platform-native `{platform}rec:{id}` (LavaSrc).
     *      b. YouTube / YouTube Music → `ytmsearch:{videoUrl}` (YTM radio/related tracks).
     *      c. SoundCloud → `scsearch:{title} {author} related`.
     *      d. Generic fallback → configured `defaultAutoPlaySource` or `ytmsearch`.
     *      Results are deduplicated against the current queue + play history.
     */
    private _buildAutoPlayFunction;
}
export type { PlayerEvents, SearchPlatform, LavalinkNodeOptions };
