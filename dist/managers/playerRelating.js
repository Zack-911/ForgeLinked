"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerRelatingManager = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const auth_js_1 = require("./auth.js");
class PlayerRelatingManager {
    options;
    auth;
    lockKey = 'forgelinked_autoplay_running';
    autoplayOptions;
    constructor(options = {}) {
        this.options = options;
        this.auth = options.auth ?? new auth_js_1.LocalSearchAuthManager();
        const raw = options.autoplayOptions ?? {};
        this.autoplayOptions = {
            maxFetchTracks: Math.max(1, Math.floor(raw.maxFetchTracks ?? 1)),
            retryLimit: Math.max(0, Math.floor(raw.retryLimit ?? 3)),
            retryDuration: Math.max(0, Math.floor(raw.retryDuration ?? 5000)),
        };
    }
    async autoplay(player, lastPlayedTrack) {
        if (!player.autoPlay)
            return;
        if (player.queue.tracks.length >= this.autoplayOptions.maxFetchTracks)
            return;
        if (player.getData(this.lockKey))
            return;
        player.setData(this.lockKey, true);
        try {
            const localCandidates = await this.relatedCandidates(lastPlayedTrack).catch(() => []);
            for (let attempt = 0; attempt <= this.autoplayOptions.retryLimit; attempt++) {
                await this.fillQueue(player, lastPlayedTrack, localCandidates);
                if (player.queue.tracks.length > 0)
                    return;
                if (attempt < this.autoplayOptions.retryLimit) {
                    await this.sleep(this.autoplayOptions.retryDuration);
                }
            }
            if (player.queue.tracks.length === 0) {
                forgescript_1.Logger.warn(`ForgeLinked autoplay: no usable related track found for "${lastPlayedTrack.info.title}"`);
            }
        }
        catch (err) {
            forgescript_1.Logger.error('ForgeLinked autoplay error:', err);
        }
        finally {
            player.deleteData(this.lockKey);
        }
    }
    async fillQueue(player, lastPlayedTrack, initialCandidates) {
        let baseTrack = lastPlayedTrack;
        let candidates = initialCandidates;
        let chains = 0;
        while (player.queue.tracks.length < this.autoplayOptions.maxFetchTracks) {
            const ok = await this.fetchOneTrack(player, baseTrack, candidates);
            if (ok)
                continue;
            // The chain depth is capped at retryLimit so it can't loop indefinitely.
            if (chains >= this.autoplayOptions.retryLimit)
                break;
            const last = player.queue.tracks[player.queue.tracks.length - 1];
            if (!last || last === baseTrack)
                break;
            baseTrack = last;
            candidates = await this.relatedCandidates(baseTrack).catch(() => []);
            chains++;
        }
    }
    async fetchOneTrack(player, lastPlayedTrack, localCandidates) {
        if (await this.queueLocalRelatedCandidate(player, lastPlayedTrack, localCandidates))
            return true;
        if (await this.queueLavalinkSearchCandidate(player, lastPlayedTrack))
            return true;
        return false;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async queueLocalRelatedCandidate(player, baseTrack, candidates) {
        if (!candidates.length)
            return false;
        const unblocked = candidates.filter((candidate) => !this.isBlockedCandidate(player, baseTrack, candidate));
        const shuffled = this.shuffleArray(unblocked);
        for (const candidate of shuffled) {
            const result = await player.search(candidate.url, baseTrack.requester).catch(() => null);
            if (!result ||
                !result.tracks.length ||
                result.loadType === 'empty' ||
                result.loadType === 'error') {
                continue;
            }
            const pick = this.pickTrack(player, baseTrack, result.tracks);
            if (!pick)
                continue;
            player.queue.add(pick);
            return true;
        }
        return false;
    }
    async queueLavalinkSearchCandidate(player, baseTrack) {
        for (const attempt of this.buildSearchAttempts(baseTrack)) {
            const result = await player
                .search({ query: attempt.query, source: attempt.source }, baseTrack.requester)
                .catch(() => null);
            if (!result ||
                !result.tracks.length ||
                result.loadType === 'empty' ||
                result.loadType === 'error') {
                continue;
            }
            const pick = this.pickTrack(player, baseTrack, result.tracks);
            if (!pick)
                continue;
            player.queue.add(pick);
            return true;
        }
        return false;
    }
    async relatedCandidates(track) {
        switch (this.sourceName(track)) {
            case 'youtube':
            case 'youtubemusic':
                return this.youtubeRelated(track);
            case 'soundcloud':
                return this.soundCloudRelated(track);
            case 'spotify':
                return this.spotifyRelated(track);
            case 'applemusic':
                return this.appleMusicRelated(track);
            default:
                return [];
        }
    }
    async youtubeRelated(track) {
        const videoId = this.youtubeVideoId(track);
        if (!videoId)
            return [];
        const client = {
            clientName: 1,
            clientVersion: '2.20261231',
            hl: 'en',
            gl: 'US',
        };
        const visitorData = await this.auth.getYoutubeVisitor().catch(() => undefined);
        if (visitorData)
            client.visitorData = visitorData;
        const res = await this.requestJson('https://m.youtube.com/youtubei/v1/next?prettyPrint=false&fields=contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results(lockupViewModel)', {
            method: 'POST',
            headers: {
                ...auth_js_1.localSearchHeaders,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ context: { client }, videoId }),
        });
        const results = res.data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results ??
            [];
        return results
            .map((item) => {
            const view = item.lockupViewModel;
            if (!view?.contentId || !String(view.contentType ?? '').endsWith('_VIDEO'))
                return null;
            return {
                source: 'youtube',
                identifier: view.contentId,
                url: `https://www.youtube.com/watch?v=${view.contentId}`,
                title: view.metadata?.lockupMetadataViewModel?.title?.content,
                author: view.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
                    ?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content,
            };
        })
            .filter((item) => !!item?.url);
    }
    async soundCloudRelated(track, refreshAuth = false) {
        const clientId = await this.auth.getSoundCloudClientId(refreshAuth);
        if (!clientId)
            return [];
        const trackId = await this.soundCloudTrackId(track, clientId);
        if (!trackId) {
            if (!refreshAuth)
                return this.soundCloudRelated(track, true);
            return [];
        }
        const url = new URL(`https://api-v2.soundcloud.com/tracks/${trackId}/related`);
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('limit', String(Math.min(this.autoplayOptions.maxFetchTracks, 20)));
        const res = await this.requestJson(url.toString(), {
            headers: auth_js_1.localSearchHeaders,
        });
        if (res.status === 401 && !refreshAuth)
            return this.soundCloudRelated(track, true);
        return (res.data?.collection ?? [])
            .map((item) => {
            if (!item.permalink_url)
                return null;
            return {
                source: 'soundcloud',
                identifier: item.id ? String(item.id) : undefined,
                url: item.permalink_url,
                title: item.title,
                author: item.user?.permalink ?? item.user?.username,
            };
        })
            .filter((item) => !!item?.url);
    }
    async spotifyRelated(track, refreshAuth = false) {
        const trackId = this.spotifyTrackId(track);
        if (!trackId)
            return [];
        const auth = await this.auth.getSpotifyAuth(refreshAuth);
        if (!auth)
            return [];
        const res = await this.requestJson('https://api-partner.spotify.com/pathfinder/v2/query', {
            method: 'POST',
            headers: {
                ...auth_js_1.localSearchHeaders,
                Accept: 'application/json',
                'App-Platform': 'WebPlayer',
                Authorization: `Bearer ${auth.accessToken}`,
                'Client-Token': auth.clientToken,
                'Content-Type': 'application/json',
                Origin: 'https://open.spotify.com',
            },
            body: JSON.stringify({
                variables: {
                    uri: `spotify:track:${trackId}`,
                    limit: Math.min(this.autoplayOptions.maxFetchTracks, 30),
                },
                operationName: 'internalLinkRecommenderTrack',
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: 'c77098ee9d6ee8ad3eb844938722db60570d040b49f41f5ec6e7be9160a7c86b',
                    },
                },
            }),
        });
        if ((res.status === 401 || res.status === 400) && !refreshAuth) {
            return this.spotifyRelated(track, true);
        }
        if (res.status === 403 || res.status === 429)
            return [];
        const items = res.data?.data?.seoRecommendedTrack?.items ?? [];
        return items
            .map((item) => {
            const data = item.data;
            if (!data?.id)
                return null;
            const artists = data.artists?.items
                ?.map((artist) => artist.profile?.name)
                .filter(Boolean)
                .join(', ') ?? '';
            return {
                source: 'spotify',
                identifier: data.id,
                url: `https://open.spotify.com/track/${data.id}`,
                title: data.name,
                author: artists,
            };
        })
            .filter((item) => !!item?.url);
    }
    async appleMusicRelated(track) {
        const baseTrackId = this.appleMusicTrackId(track);
        const candidates = [];
        const seen = new Set();
        for (const query of this.appleMusicSearchQueries(track)) {
            const url = new URL('https://itunes.apple.com/search');
            url.searchParams.set('term', query);
            url.searchParams.set('media', 'music');
            url.searchParams.set('entity', 'song');
            url.searchParams.set('limit', String(Math.min(this.autoplayOptions.maxFetchTracks, 50)));
            const res = await this.requestJson(url.toString(), {
                headers: auth_js_1.localSearchHeaders,
            });
            if (res.status >= 400)
                continue;
            for (const item of res.data?.results ?? []) {
                const trackId = item.trackId ? String(item.trackId) : undefined;
                if (!item.trackViewUrl || !trackId || trackId === baseTrackId)
                    continue;
                if (item.wrapperType !== 'track' || item.kind !== 'song')
                    continue;
                const key = trackId || item.trackViewUrl;
                if (seen.has(key))
                    continue;
                seen.add(key);
                candidates.push({
                    source: 'applemusic',
                    identifier: trackId,
                    url: item.trackViewUrl,
                    title: item.trackName,
                    author: item.artistName,
                });
            }
        }
        return candidates;
    }
    async soundCloudTrackId(track, clientId) {
        if (/^\d+$/.test(track.info.identifier))
            return track.info.identifier;
        if (!track.info.uri)
            return null;
        const url = new URL('https://api-v2.soundcloud.com/resolve');
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('url', track.info.uri);
        const res = await this.requestJson(url.toString(), {
            headers: auth_js_1.localSearchHeaders,
        });
        return res.data?.id ? String(res.data.id) : null;
    }
    buildSearchAttempts(track) {
        const sourceName = this.sourceName(track);
        const textQuery = this.textQuery(track);
        const attempts = [];
        const add = (query, source) => {
            const trimmed = query.trim();
            if (!trimmed || !source)
                return;
            const attempt = { query: trimmed, source: source };
            if (attempts.some((item) => item.query === attempt.query && item.source === attempt.source))
                return;
            attempts.push(attempt);
        };
        if (track.info.identifier) {
            switch (sourceName) {
                case 'spotify':
                    add(track.info.identifier, 'sprec');
                    break;
                case 'applemusic':
                case 'apple music':
                    add(track.info.identifier, 'amrec');
                    break;
                case 'deezer':
                    add(track.info.identifier, 'dzrec');
                    break;
                case 'yandex':
                case 'yandexmusic':
                    add(track.info.identifier, 'ymrec');
                    break;
                case 'vkmusic':
                case 'vk':
                    add(track.info.identifier, 'vkrec');
                    break;
                case 'tidal':
                    add(track.info.identifier, 'tdrec');
                    break;
                case 'qobuz':
                    add(track.info.identifier, 'qbrec');
                    break;
            }
        }
        if (sourceName === 'soundcloud')
            add(textQuery, 'scsearch');
        const broaderQueries = this.broaderTextQueries(track);
        for (const source of this.textSearchSources(sourceName)) {
            add(textQuery, source);
            for (const query of broaderQueries)
                add(query, source);
        }
        return attempts;
    }
    textSearchSources(sourceName) {
        const preferred = this.isTextSearchSource(this.options.defaultAutoPlaySource) &&
            sourceName !== 'youtube' &&
            sourceName !== 'youtubemusic'
            ? this.options.defaultAutoPlaySource
            : this.options.defaultSearchPlatform;
        return [preferred, 'ytmsearch', 'ytsearch'].filter((source, index, sources) => this.isTextSearchSource(source) && sources.indexOf(source) === index);
    }
    isTextSearchSource(source) {
        return typeof source === 'string' && source.endsWith('search');
    }
    pickTrack(player, baseTrack, tracks) {
        const blockedIdentifiers = new Set();
        const blockedUris = new Set();
        const block = (track) => {
            if (!track)
                return;
            if (track.info.identifier)
                blockedIdentifiers.add(track.info.identifier);
            if (track.info.uri)
                blockedUris.add(track.info.uri);
        };
        block(baseTrack);
        block(player.queue.current);
        for (const track of player.queue.previous ?? [])
            block(track);
        for (const track of player.queue.tracks ?? [])
            block(track);
        const pool = tracks.filter((track) => {
            if (track.info.identifier && blockedIdentifiers.has(track.info.identifier))
                return false;
            if (track.info.uri && blockedUris.has(track.info.uri))
                return false;
            return !this.hasSimilarTitle(baseTrack, track);
        });
        if (!pool.length)
            return null;
        return this.shuffleArray(pool)[0];
    }
    isBlockedCandidate(player, baseTrack, candidate) {
        if (candidate.url === baseTrack.info.uri || candidate.identifier === baseTrack.info.identifier)
            return true;
        if (this.hasSimilarLocalTitle(baseTrack, candidate))
            return true;
        const queuedTracks = [
            player.queue.current,
            ...(player.queue.previous ?? []),
            ...(player.queue.tracks ?? []),
        ];
        return queuedTracks.some((track) => {
            if (!track)
                return false;
            if (candidate.url && track.info.uri === candidate.url)
                return true;
            return !!candidate.identifier && track.info.identifier === candidate.identifier;
        });
    }
    hasSimilarLocalTitle(baseTrack, candidate) {
        const baseTitle = this.normalize(baseTrack.info.title);
        const candidateTitle = this.normalize(candidate.title ?? '');
        if (!baseTitle || !candidateTitle)
            return false;
        if (baseTitle === candidateTitle)
            return true;
        const baseAuthor = this.normalize(baseTrack.info.author);
        const candidateAuthor = this.normalize(candidate.author ?? '');
        if (baseAuthor && candidateAuthor && baseAuthor === candidateAuthor) {
            return baseTitle.includes(candidateTitle) || candidateTitle.includes(baseTitle);
        }
        return false;
    }
    hasSimilarTitle(baseTrack, candidate) {
        const baseTitle = this.normalize(baseTrack.info.title);
        const candidateTitle = this.normalize(candidate.info.title);
        if (!baseTitle || !candidateTitle)
            return false;
        if (baseTitle === candidateTitle)
            return true;
        const baseAuthor = this.normalize(baseTrack.info.author);
        const candidateAuthor = this.normalize(candidate.info.author);
        if (baseAuthor && candidateAuthor && baseAuthor === candidateAuthor) {
            return baseTitle.includes(candidateTitle) || candidateTitle.includes(baseTitle);
        }
        return false;
    }
    sourceName(track) {
        const source = String(track.info.sourceName ?? '')
            .toLowerCase()
            .replace(/\s+/g, '');
        if (source)
            return source;
        const uri = track.info.uri.toLowerCase();
        if (uri.includes('music.youtube.com'))
            return 'youtubemusic';
        if (uri.includes('youtube.com') || uri.includes('youtu.be'))
            return 'youtube';
        if (uri.includes('soundcloud.com'))
            return 'soundcloud';
        if (uri.includes('spotify.com'))
            return 'spotify';
        if (uri.includes('music.apple.com'))
            return 'applemusic';
        if (uri.includes('deezer.com'))
            return 'deezer';
        return '';
    }
    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    normalize(value) {
        return value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }
    textQuery(track) {
        return `${track.info.author} ${track.info.title}`.trim() || track.info.title || 'popular music';
    }
    broaderTextQueries(track) {
        const author = track.info.author.trim();
        if (!author)
            return ['popular music'];
        return [`${author} mix`, `${author} songs`];
    }
    youtubeVideoId(track) {
        if (/^[A-Za-z0-9_-]{11}$/.test(track.info.identifier))
            return track.info.identifier;
        return (track.info.uri.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] ??
            track.info.uri.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1] ??
            track.info.uri.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/)?.[1] ??
            null);
    }
    spotifyTrackId(track) {
        if (/^[A-Za-z0-9]{22}$/.test(track.info.identifier))
            return track.info.identifier;
        return (track.info.identifier.match(/spotify:track:([A-Za-z0-9]+)/)?.[1] ??
            track.info.uri.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/)?.[1] ??
            track.info.uri.match(/spotify:track:([A-Za-z0-9]+)/)?.[1] ??
            null);
    }
    appleMusicTrackId(track) {
        if (/^\d+$/.test(track.info.identifier))
            return track.info.identifier;
        return track.info.uri.match(/[?&]i=(\d+)/)?.[1] ?? null;
    }
    appleMusicSearchQueries(track) {
        const queries = [];
        const add = (query) => {
            const trimmed = query?.trim();
            if (!trimmed || queries.includes(trimmed))
                return;
            queries.push(trimmed);
        };
        const author = track.info.author.trim();
        const title = track.info.title.trim();
        const album = String(track.pluginInfo?.albumName ?? '').trim();
        add(author);
        if (author && album)
            add(`${author} ${album}`);
        if (author && title)
            add(`${author} ${title}`);
        add(this.textQuery(track));
        return queries.length ? queries : ['popular music'];
    }
    async requestJson(url, init) {
        try {
            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
            const text = await res.text();
            try {
                return { status: res.status, data: JSON.parse(text) };
            }
            catch {
                return { status: res.status, data: null };
            }
        }
        catch {
            return { status: 0, data: null };
        }
    }
}
exports.PlayerRelatingManager = PlayerRelatingManager;
//# sourceMappingURL=playerRelating.js.map