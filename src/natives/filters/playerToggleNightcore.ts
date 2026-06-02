import { ArgType, NativeFunction } from '@tryforge/forgescript'

import { ForgeLinked } from '../../index.js'

export default new NativeFunction({
  name: '$playerToggleNightcore',
  description:
    'Enables / Disables a Nightcore-like filter Effect. Disables/Overrides both: custom and Vaporwave Filter',
  version: '2.1.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to toggle nightcore for',
      type: ArgType.Guild,
      required: false,
      rest: false,
    },
    {
      name: 'speed',
      description: 'The speed for the nightcore effect',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
    {
      name: 'pitch',
      description: 'The pitch for the nightcore effect',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
    {
      name: 'rate',
      description: 'The rate for the nightcore effect',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
  ],
  output: ArgType.Json,
  async execute(ctx, [guildId, speed, pitch, rate]) {
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
      const res = await player.filterManager.toggleNightcore(
        speed as number | undefined,
        pitch as number | undefined,
        rate as number | undefined,
      )
      return this.successJSON(res)
    } catch (err) {
      return this.customError(
        `Failed to toggle nightcore: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
