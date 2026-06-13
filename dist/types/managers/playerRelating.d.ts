import { Player, SearchPlatform, Track } from 'lavalink-client';
import { LocalSearchAuthManager } from './auth.js';
export interface PlayerRelatingOptions {
    defaultAutoPlaySource?: SearchPlatform;
    defaultSearchPlatform?: SearchPlatform;
    auth?: LocalSearchAuthManager;
}
export declare class PlayerRelatingManager {
    private readonly options;
    private readonly auth;
    private readonly lockKey;
    constructor(options?: PlayerRelatingOptions);
    autoplay(player: Player, lastPlayedTrack: Track): Promise<void>;
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
    private normalize;
    private textQuery;
    private broaderTextQueries;
    private youtubeVideoId;
    private spotifyTrackId;
    private appleMusicTrackId;
    private appleMusicSearchQueries;
    private requestJson;
}
