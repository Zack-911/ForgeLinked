import { Player, SearchPlatform, Track } from 'lavalink-client';
import { LocalSearchAuthManager } from './auth.js';
export interface PlayerRelatingAutoplayOptions {
    maxFetchTracks: number;
    retryLimit: number;
    retryDuration: number;
}
export interface PlayerRelatingOptions {
    defaultAutoPlaySource?: SearchPlatform;
    defaultSearchPlatform?: SearchPlatform;
    auth?: LocalSearchAuthManager;
    autoplayOptions?: Partial<PlayerRelatingAutoplayOptions>;
}
export declare class PlayerRelatingManager {
    private readonly options;
    private readonly auth;
    private readonly lockKey;
    private readonly autoplayOptions;
    constructor(options?: PlayerRelatingOptions);
    autoplay(player: Player, lastPlayedTrack: Track): Promise<void>;
    private fillQueue;
    private fetchOneTrack;
    private sleep;
    private queueLocalRelatedCandidate;
    private queueLavalinkSearchCandidate;
    private relatedCandidates;
    private youtubeRelated;
    private soundCloudRelated;
    private spotifyRelated;
    private appleMusicRelated;
    private soundCloudTrackId;
    private buildSearchAttempts;
    private textSearchSources;
    private isTextSearchSource;
    private pickTrack;
    private isBlockedCandidate;
    private hasSimilarLocalTitle;
    private hasSimilarTitle;
    private sourceName;
    private shuffleArray;
    private normalize;
    private textQuery;
    private broaderTextQueries;
    private youtubeVideoId;
    private spotifyTrackId;
    private appleMusicTrackId;
    private appleMusicSearchQueries;
    private requestJson;
}
