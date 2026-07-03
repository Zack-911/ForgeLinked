"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalSearchAuthManager = exports.localSearchHeaders = exports.localSearchUserAgent = void 0;
exports.localSearchUserAgent = 'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0';
exports.localSearchHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, br',
    'Accept-Language': 'en-US,en;q=0.9',
    Connection: 'keep-alive',
    Priority: 'u=0, i',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': exports.localSearchUserAgent,
};
class LocalSearchAuthManager {
    soundCloudClientId;
    spotifyAccessToken;
    spotifyClientToken;
    async getSoundCloudClientId(refresh = false) {
        if (!refresh && this.soundCloudClientId)
            return this.soundCloudClientId;
        try {
            const text = await this.fetchText('https://m.soundcloud.com', {
                method: 'GET',
                headers: exports.localSearchHeaders,
            });
            this.soundCloudClientId = text.split('"clientId":"')[1]?.split('"')[0];
            return this.soundCloudClientId;
        }
        catch {
            return undefined;
        }
    }
    async getSpotifyAuth(refresh = false) {
        if (!refresh && this.spotifyAccessToken && this.spotifyClientToken) {
            return { accessToken: this.spotifyAccessToken, clientToken: this.spotifyClientToken };
        }
        const [clientToken, accessToken] = await Promise.all([
            this.getSpotifyClientToken(),
            this.getSpotifyAccessToken(),
        ]);
        if (!clientToken || !accessToken)
            return null;
        this.spotifyClientToken = clientToken;
        this.spotifyAccessToken = accessToken;
        return { accessToken, clientToken };
    }
    async getSpotifyClientToken() {
        const body = {
            client_data: {
                client_version: '1.0',
                client_id: 'f6a40776580943a7bc5173125a1e8832',
                js_sdk_data: {},
            },
        };
        try {
            const data = await this.fetchJson('https://clienttoken.spotify.com/v1/clienttoken', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    ...exports.localSearchHeaders,
                    Origin: 'https://clienttoken.spotify.com',
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });
            return data.granted_token?.token;
        }
        catch {
            return undefined;
        }
    }
    async getSpotifyAccessToken() {
        return this.getSpotifyEmbedToken();
    }
    async getSpotifyEmbedToken() {
        const ids = [
            '4PTG3Z6ehGkBFwjybzWkR8',
            '2yR2sziCF4WEs3klW1F38d',
            '0IuVhCflrQPMGRrOyoY5RW',
            '2yWlGEgEfPot0lv3OAjuG3',
            '4Xfp9BcKrKYmxJPxn68Yb8',
            '7uuJqaRjSXzja6VGgDpWem',
        ];
        const id = ids[Math.floor(Math.random() * ids.length)];
        try {
            const text = await this.fetchText(`https://open.spotify.com/embed/track/${id}`, {
                headers: {
                    ...exports.localSearchHeaders,
                },
            });
            return text.split('"accessToken":"')[1]?.split('"')[0];
        }
        catch {
            return undefined;
        }
    }
    async fetchJson(url, init) {
        const text = await this.fetchText(url, init);
        return JSON.parse(text);
    }
    async fetchText(url, init) {
        try {
            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
            if (!res.ok)
                throw new Error(`Request failed: ${res.status}`);
            return res.text();
        }
        catch {
            throw new Error('Fetch failed');
        }
    }
}
exports.LocalSearchAuthManager = LocalSearchAuthManager;
//# sourceMappingURL=auth.js.map