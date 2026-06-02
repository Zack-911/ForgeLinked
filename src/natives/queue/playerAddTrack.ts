import { ArgType, NativeFunction } from '@tryforge/forgescript'
import { User } from 'discord.js'
import { SearchPlatform } from 'lavalink-client'

import { ForgeLinked } from '../../index.js'

export default new NativeFunction({
  name: '$playerAddTrack',
  description: 'Add a track to a player',
  version: '1.0.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to add the track to',
      type: ArgType.Guild,
      required: true,
      rest: false,
    },
    {
      name: 'query',
      description: 'The query to search for',
      type: ArgType.String,
      required: true,
      rest: false,
    },
    {
      name: 'source',
      description: 'The source to use',
      type: ArgType.String,
      required: false,
      rest: false,
    },
  ],
  output: ArgType.Json,
  async execute(ctx, [guildId, query, source]) {
    try {
      const extension = ctx.client.getExtension(ForgeLinked, true)
      if (!extension) return this.customError('ForgeLinked extension not found')

      const lavalink = extension.lavalink
      const player = lavalink.getPlayer(guildId.id)

      if (!player) return this.customError('Player not found for this guild.')

      if (!player.connected) {
        try {
          await player.connect()
        } catch (connErr) {
          return this.customError(
            `Failed to connect to voice: ${connErr instanceof Error ? connErr.message : 'Unknown error'}`,
          )
        }
      }

      const result = await player
        .search({ query, source: source as SearchPlatform }, ctx.member)
        .catch(() => null)

      if (!result || !result.tracks.length || result.loadType === 'empty') {
        return this.customError('No results found for the provided query.')
      }

      if (result.loadType === 'error') {
        return this.customError('An error occurred while fetching the track.')
      }

      if (result.loadType === 'playlist') {
        player.queue.add(result.tracks)
      } else {
        player.queue.add(result.tracks[0])
      }

      if (!player.playing && !player.paused) {
        try {
          await player.play()
        } catch (playErr) {
          return this.customError(
            `Failed to start playback: ${playErr instanceof Error ? playErr.message : String(playErr)}`,
          )
        }
      }

      const requester = result.tracks[0].requester as User

      // Duration helpers
      const firstTrack = result.tracks[0]
      const rawDurationMs: number = firstTrack.info.duration ?? 0
      const isStream: boolean = firstTrack.info.isStream ?? false

      // Total playlist duration in ms (sum of all tracks)
      const playlistDurationMs: number =
        result.loadType === 'playlist'
          ? result.tracks.reduce((acc, t) => acc + (t.info.duration ?? 0), 0)
          : rawDurationMs

      return this.successJSON({
        status: 'success',
        type: result.loadType,
        message:
          result.loadType === 'playlist'
            ? `Queued ${result.tracks.length} tracks from ${result.playlist?.title}`
            : `Queued ${firstTrack.info.title}`,
        playlistName: result.loadType === 'playlist' ? result.playlist?.title : null,
        playlistUri: result.loadType === 'playlist' ? result.playlist?.uri : null,
        trackCount: result.loadType === 'playlist' ? result.tracks.length : 1,
        trackTitle: result.loadType !== 'playlist' ? firstTrack.info.title : null,
        trackAuthor: result.loadType !== 'playlist' ? firstTrack.info.author : null,
        trackUri: result.loadType !== 'playlist' ? firstTrack.info.uri : null,
        trackImage: firstTrack.info.artworkUrl,
        trackDuration: isStream ? null : rawDurationMs,
        trackDurationFormatted: isStream ? 'LIVE' : formatDuration(rawDurationMs),
        playlistDuration: result.loadType === 'playlist' ? playlistDurationMs : null,
        playlistDurationFormatted:
          result.loadType === 'playlist' ? formatDuration(playlistDurationMs) : null,
        isStream,
        requester: requester?.id || 'Unknown',
      })
    } catch (error: any) {
      return this.customError(`Internal Error: ${error.message ?? 'Unknown'}`)
    }
  },
})

/** Converts milliseconds to a human-readable HH:MM:SS (or MM:SS) string */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
