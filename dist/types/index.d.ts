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
    private _buildAutoPlayFunction;
}
export type { PlayerEvents, SearchPlatform, LavalinkNodeOptions };
