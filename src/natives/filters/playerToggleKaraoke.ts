import { ArgType, NativeFunction } from '@tryforge/forgescript'

import { ForgeLinked } from '../../index.js'

export default new NativeFunction({
  name: '$playerToggleKaraoke',
  description: 'Enable / Disables a Karaoke like Filter Effect',
  version: '2.1.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to toggle karaoke for',
      type: ArgType.Guild,
      required: false,
      rest: false,
    },
    {
      name: 'level',
      description: 'The level for the karaoke effect',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
    {
      name: 'monoLevel',
      description: 'The mono level for the karaoke effect',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
    {
      name: 'filterBand',
      description: 'The filter band for the karaoke effect',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
    {
      name: 'filterWidth',
      description: 'The filter width for the karaoke effect',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
  ],
  output: ArgType.Json,
  async execute(ctx, [guildId, level, monoLevel, filterBand, filterWidth]) {
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
      await player.filterManager.toggleKaraoke(
        level as number | undefined,
        monoLevel as number | undefined,
        filterBand as number | undefined,
        filterWidth as number | undefined,
      )
      return this.successJSON({
        success: true,
        active: player.filterManager.filters.karaoke,
        filters: player.filterManager.filters,
        data: player.filterManager.data,
      })
    } catch (err) {
      return this.customError(
        `Failed to toggle karaoke: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
