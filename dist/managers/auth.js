"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalSearchAuthManager = exports.localSearchHeaders = exports.localSearchUserAgent = void 0;
const buffer_1 = require("buffer");
const crypto_1 = __importDefault(require("crypto"));
exports.localSearchUserAgent = 'Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0';
exports.localSearchHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'identity, gzip, br',
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
    currentTotpSecret = null;
    currentTotpVersion = null;
    lastSecretFetchTime = 0;
    secretFetchInterval = 60 * 60 * 1000;
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
        try {
            const primarySecret = { secret: ',7/*F("rLJ2oxaKL^f+E1xvP@N', version: '61' };
            return await this.performSpotifyTokenRequest(this.decodeSpotifySecret(primarySecret.secret).toString('hex'), primarySecret.version);
        }
        catch {
            try {
                await this.ensureTotpSecrets();
                if (this.currentTotpSecret && this.currentTotpVersion) {
                    return await this.performSpotifyTokenRequest(this.currentTotpSecret, this.currentTotpVersion);
                }
            }
            catch { }
            return this.getSpotifyEmbedToken();
        }
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
    async ensureTotpSecrets() {
        const now = Date.now();
        if (this.currentTotpSecret && now - this.lastSecretFetchTime < this.secretFetchInterval)
            return;
        try {
            const secrets = await this.fetchJson('https://raw.githubusercontent.com/xyloflake/spot-secrets-go/refs/heads/main/secrets/secretDict.json', { headers: { Accept: 'application/json' } });
            const newestVersion = Math.max(...Object.keys(secrets).map(Number)).toString();
            const secretData = secrets[newestVersion];
            if (!secretData)
                throw new Error('Missing Spotify secret');
            const mappedData = secretData.map((value, index) => value ^ ((index % 33) + 9));
            this.currentTotpSecret = buffer_1.Buffer.from(mappedData.join(''), 'utf8').toString('hex');
            this.currentTotpVersion = newestVersion;
            this.lastSecretFetchTime = now;
        }
        catch {
            if (this.currentTotpSecret)
                return;
            const fallbackData = [
                99, 111, 47, 88, 49, 56, 118, 65, 52, 67, 50, 104, 117, 101, 55, 94, 95, 75, 94, 49, 69, 36,
                85, 64, 74, 60,
            ];
            const mapped = fallbackData.map((value, index) => value ^ ((index % 33) + 9));
            this.currentTotpSecret = buffer_1.Buffer.from(mapped.join(''), 'utf8').toString('hex');
            this.currentTotpVersion = '19';
        }
    }
    async performSpotifyTokenRequest(secretHex, version) {
        let serverTimeMs = Date.now();
        try {
            const timeData = await this.fetchJson('https://open.spotify.com/api/server-time', { headers: { 'User-Agent': exports.localSearchUserAgent } });
            serverTimeMs = timeData.serverTime || serverTimeMs;
        }
        catch { }
        const url = new URL('https://open.spotify.com/api/token');
        url.searchParams.append('reason', 'init');
        url.searchParams.append('productType', 'mobile-web-player');
        url.searchParams.append('totp', this.generateSpotifyTOTP(secretHex, Date.now(), 30));
        url.searchParams.append('totpServer', this.generateSpotifyTOTP(secretHex, serverTimeMs, 900));
        url.searchParams.append('totpVer', version);
        const data = await this.fetchJson(url.toString(), {
            method: 'GET',
            headers: {
                ...exports.localSearchHeaders,
                'User-Agent': exports.localSearchUserAgent,
                Origin: 'https://open.spotify.com/',
                Referer: 'https://open.spotify.com/',
                Accept: 'application/json',
            },
        });
        return data.accessToken;
    }
    decodeSpotifySecret(encoded) {
        const byteValues = encoded
            .split('')
            .map((char, index) => char.charCodeAt(0) ^ ((index % 33) + 9));
        return buffer_1.Buffer.from(buffer_1.Buffer.from(byteValues.join(''), 'utf8').toString('hex'), 'hex');
    }
    generateSpotifyTOTP(secretHex, timestampMs, step) {
        const counter = Math.floor(timestampMs / 1000 / step);
        const buf = buffer_1.Buffer.alloc(8);
        buf.writeBigInt64BE(BigInt(counter));
        const hmac = crypto_1.default.createHmac('sha1', buffer_1.Buffer.from(secretHex, 'hex'));
        hmac.update(buf);
        const digest = hmac.digest();
        const offset = (digest[digest.length - 1] ?? 0) & 0xf;
        const code = (((digest[offset] ?? 0) & 0x7f) << 24) |
            (((digest[offset + 1] ?? 0) & 0xff) << 16) |
            (((digest[offset + 2] ?? 0) & 0xff) << 8) |
            ((digest[offset + 3] ?? 0) & 0xff);
        return (code % 1000000).toString().padStart(6, '0');
    }
    async fetchJson(url, init) {
        const text = await this.fetchText(url, init);
        return JSON.parse(text);
    }
    async fetchText(url, init) {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
        if (!res.ok)
            throw new Error(`Request failed: ${res.status}`);
        return res.text();
    }
}
exports.LocalSearchAuthManager = LocalSearchAuthManager;
//# sourceMappingURL=auth.js.map