import { ArgType, NativeFunction } from '@tryforge/forgescript'

import { ForgeLinked } from '../../index.js'

enum AudioOutput {
  Mono = 'mono',
  Stereo = 'stereo',
  Left = 'left',
  Right = 'right',
}

export default new NativeFunction({
  name: '$playerSetAudioOutput',
  description: 'Set the AudioOutput Filter',
  version: '2.1.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to set the audio output for',
      type: ArgType.Guild,
      required: false,
      rest: false,
    },
    {
      name: 'audioOutput',
      description: 'The audio output to set (mono, stereo, left, right)',
      type: ArgType.Enum,
      enum: AudioOutput,
      required: true,
      rest: false,
    },
  ],
  output: ArgType.Json,
  async execute(ctx, [guildId, audioOutput]) {
    try {
      const linked = ctx.client.getExtension(ForgeLinked, true)?.lavalink
      if (!linked) return this.customError('ForgeLinked is not initialized')
      if (!guildId) guildId = ctx.guild
      if (!guildId)
        return this.customError(
          'Unable to find any guild. Ensure this command was ran inside of a guild and not DMs or a group chat',
        )
      const player = linked.getPlayer(guildId.id)
      if (!player) return this.customError('Player not found')
      if (!player.node?.connected)
        return this.customError(
          'Lavalink node is not connected. Please wait for the node to reconnect.',
        )

      // Attempt the requested output; if it fails (e.g. Stereo unsupported by node),
      // fall back through the remaining output types so the player never silently breaks.
      const fallbackOrder: AudioOutput[] = [
        audioOutput as AudioOutput,
        AudioOutput.Stereo,
        AudioOutput.Mono,
        AudioOutput.Left,
        AudioOutput.Right,
      ]

      // Deduplicate while preserving order
      const attempts = [...new Set(fallbackOrder)]

      let lastErr: unknown
      for (const output of attempts) {
        try {
          await player.filterManager.setAudioOutput(output)
          // Success — if we fell back, log it so the user knows
          if (output !== audioOutput) {
            this.customError(
              `Failed to set audio output '${audioOutput}', fell back to '${output}'`,
            )
          }
          return this.success()
        } catch (err) {
          lastErr = err
          // Only continue looping if this wasn't the requested output (i.e., we are in fallback)
          if (output === audioOutput) continue
          break
        }
      }

      return this.customError(
        `Failed to set audio output '${audioOutput}': ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      )
    } catch (err) {
      return this.customError(
        `Failed to set audio output: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
