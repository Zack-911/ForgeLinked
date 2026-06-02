import { ArgType, NativeFunction } from '@tryforge/forgescript'

import { ForgeLinked } from '../../index.js'

export default new NativeFunction({
  name: '$playerFiltersSetVolume',
  description: 'Set the Filter Volume',
  version: '2.1.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to set the volume for',
      type: ArgType.Guild,
      required: false,
      rest: false,
    },
    {
      name: 'volume',
      description: 'The volume to set',
      type: ArgType.Number,
      required: true,
      rest: false,
    },
  ],
  output: ArgType.Json,
  async execute(ctx, [guildId, volume]) {
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
      if (volume < 0 || volume > 5) return this.customError('Filter volume must be between 0 and 5')
      const res = await player.filterManager.setVolume(volume)
      return this.successJSON(res)
    } catch (err) {
      return this.customError(
        `Failed to set filter volume: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
