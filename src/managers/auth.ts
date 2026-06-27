import { Buffer } from 'buffer'
import crypto from 'crypto'

export const localSearchUserAgent =
  'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0'

export const localSearchHeaders = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Encoding': 'gzip, br',
  'Accept-Language': 'en-US,en;q=0.9',
  Connection: 'keep-alive',
  Priority: 'u=0, i',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent': localSearchUserAgent,
}

export interface SpotifyAuth {
  accessToken: string
  clientToken: string
}

export class LocalSearchAuthManager {
  private soundCloudClientId?: string
  private spotifyAccessToken?: string
  private spotifyClientToken?: string
  private currentTotpSecret: string | null = null
  private currentTotpVersion: string | null = null
  private lastSecretFetchTime = 0
  private readonly secretFetchInterval = 60 * 60 * 1000

  async getSoundCloudClientId(refresh = false): Promise<string | undefined> {
    if (!refresh && this.soundCloudClientId) return this.soundCloudClientId

    try {
      const text = await this.fetchText('https://m.soundcloud.com', {
        method: 'GET',
        headers: localSearchHeaders,
      })

      this.soundCloudClientId = text.split('"clientId":"')[1]?.split('"')[0]
      return this.soundCloudClientId
    } catch {
      return undefined
    }
  }

  async getSpotifyAuth(refresh = false): Promise<SpotifyAuth | null> {
    if (!refresh && this.spotifyAccessToken && this.spotifyClientToken) {
      return { accessToken: this.spotifyAccessToken, clientToken: this.spotifyClientToken }
    }

    const [clientToken, accessToken] = await Promise.all([
      this.getSpotifyClientToken(),
      this.getSpotifyAccessToken(),
    ])

    if (!clientToken || !accessToken) return null

    this.spotifyClientToken = clientToken
    this.spotifyAccessToken = accessToken

    return { accessToken, clientToken }
  }

  private async getSpotifyClientToken(): Promise<string | undefined> {
    const body = {
      client_data: {
        client_version: '1.0',
        client_id: 'f6a40776580943a7bc5173125a1e8832',
        js_sdk_data: {},
      },
    }

    try {
      const data = await this.fetchJson<{ granted_token?: { token?: string } }>(
        'https://clienttoken.spotify.com/v1/clienttoken',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            ...localSearchHeaders,
            Origin: 'https://clienttoken.spotify.com',
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      )

      return data.granted_token?.token
    } catch {
      return undefined
    }
  }

  private async getSpotifyAccessToken(): Promise<string | undefined> {
    try {
      const primarySecret = { secret: ',7/*F("rLJ2oxaKL^f+E1xvP@N', version: '61' }
      return await this.performSpotifyTokenRequest(
        this.decodeSpotifySecret(primarySecret.secret).toString('hex'),
        primarySecret.version,
      )
    } catch {
      try {
        await this.ensureTotpSecrets()
        if (this.currentTotpSecret && this.currentTotpVersion) {
          return await this.performSpotifyTokenRequest(
            this.currentTotpSecret,
            this.currentTotpVersion,
          )
        }
      } catch {}

      return this.getSpotifyEmbedToken()
    }
  }

  private async getSpotifyEmbedToken(): Promise<string | undefined> {
    const ids = [
      '4PTG3Z6ehGkBFwjybzWkR8',
      '2yR2sziCF4WEs3klW1F38d',
      '0IuVhCflrQPMGRrOyoY5RW',
      '2yWlGEgEfPot0lv3OAjuG3',
      '4Xfp9BcKrKYmxJPxn68Yb8',
      '7uuJqaRjSXzja6VGgDpWem',
    ]
    const id = ids[Math.floor(Math.random() * ids.length)]

    try {
      const text = await this.fetchText(`https://open.spotify.com/embed/track/${id}`, {
        headers: {
          ...localSearchHeaders,
        },
      })

      return text.split('"accessToken":"')[1]?.split('"')[0]
    } catch {
      return undefined
    }
  }

  private async ensureTotpSecrets(): Promise<void> {
    const now = Date.now()
    if (this.currentTotpSecret && now - this.lastSecretFetchTime < this.secretFetchInterval) return

    try {
      const secrets = await this.fetchJson<Record<string, number[]>>(
        'https://raw.githubusercontent.com/xyloflake/spot-secrets-go/refs/heads/main/secrets/secretDict.json',
        { headers: { Accept: 'application/json' } },
      )

      const newestVersion = Math.max(...Object.keys(secrets).map(Number)).toString()
      const secretData = secrets[newestVersion]
      if (!secretData) throw new Error('Missing Spotify secret')

      const mappedData = secretData.map((value, index) => value ^ ((index % 33) + 9))
      this.currentTotpSecret = Buffer.from(mappedData.join(''), 'utf8').toString('hex')
      this.currentTotpVersion = newestVersion
      this.lastSecretFetchTime = now
    } catch {
      if (this.currentTotpSecret) return

      const fallbackData = [
        99, 111, 47, 88, 49, 56, 118, 65, 52, 67, 50, 104, 117, 101, 55, 94, 95, 75, 94, 49, 69, 36,
        85, 64, 74, 60,
      ]
      const mapped = fallbackData.map((value, index) => value ^ ((index % 33) + 9))
      this.currentTotpSecret = Buffer.from(mapped.join(''), 'utf8').toString('hex')
      this.currentTotpVersion = '19'
    }
  }

  private async performSpotifyTokenRequest(
    secretHex: string,
    version: string,
  ): Promise<string | undefined> {
    let serverTimeMs = Date.now()

    try {
      const timeData = await this.fetchJson<{ serverTime?: number }>(
        'https://open.spotify.com/api/server-time',
        { headers: { 'User-Agent': localSearchUserAgent } },
      )
      serverTimeMs = timeData.serverTime || serverTimeMs
    } catch {}

    const url = new URL('https://open.spotify.com/api/token')
    url.searchParams.append('reason', 'init')
    url.searchParams.append('productType', 'mobile-web-player')
    url.searchParams.append('totp', this.generateSpotifyTOTP(secretHex, Date.now(), 30))
    url.searchParams.append('totpServer', this.generateSpotifyTOTP(secretHex, serverTimeMs, 900))
    url.searchParams.append('totpVer', version)

    const data = await this.fetchJson<{ accessToken?: string }>(url.toString(), {
      method: 'GET',
      headers: {
        ...localSearchHeaders,
        'User-Agent': localSearchUserAgent,
        Origin: 'https://open.spotify.com/',
        Referer: 'https://open.spotify.com/',
        Accept: 'application/json',
      },
    })

    return data.accessToken
  }

  private decodeSpotifySecret(encoded: string): Buffer {
    const byteValues = encoded
      .split('')
      .map((char, index) => char.charCodeAt(0) ^ ((index % 33) + 9))
    return Buffer.from(Buffer.from(byteValues.join(''), 'utf8').toString('hex'), 'hex')
  }

  private generateSpotifyTOTP(secretHex: string, timestampMs: number, step: number): string {
    const counter = Math.floor(timestampMs / 1000 / step)
    const buf = Buffer.alloc(8)
    buf.writeBigInt64BE(BigInt(counter))

    const hmac = crypto.createHmac('sha1', Buffer.from(secretHex, 'hex'))
    hmac.update(buf)
    const digest = hmac.digest()
    const offset = (digest[digest.length - 1] ?? 0) & 0xf
    const code =
      (((digest[offset] ?? 0) & 0x7f) << 24) |
      (((digest[offset + 1] ?? 0) & 0xff) << 16) |
      (((digest[offset + 2] ?? 0) & 0xff) << 8) |
      ((digest[offset + 3] ?? 0) & 0xff)

    return (code % 1000000).toString().padStart(6, '0')
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const text = await this.fetchText(url, init)
    return JSON.parse(text) as T
  }

  private async fetchText(url: string, init: RequestInit): Promise<string> {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    return res.text()
  }
}
