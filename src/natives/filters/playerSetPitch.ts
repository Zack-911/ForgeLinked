import { ArgType, NativeFunction } from '@tryforge/forgescript'

import { ForgeLinked } from '../../index.js'

export default new NativeFunction({
  name: '$playerSetPitch',
  description:
    'Set custom filter.timescale#pitch. This method disables both: nightcore & vaporwave. Use 1 to reset.',
  version: '2.1.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to set the pitch for',
      type: ArgType.Guild,
      required: false,
      rest: false,
    },
    {
      name: 'pitch',
      description: 'The pitch to set',
      type: ArgType.Number,
      required: true,
      rest: false,
    },
  ],
  output: ArgType.Json,
  async execute(ctx, [guildId, pitch]) {
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
      if (pitch <= 0) return this.customError('Pitch must be greater than 0 (use 1 to reset)')
      const res = await player.filterManager.setPitch(pitch)
      return this.successJSON(res)
    } catch (err) {
      return this.customError(
        `Failed to set pitch: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
