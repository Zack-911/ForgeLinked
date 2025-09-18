import { ArgType, NativeFunction } from '@tryforge/forgescript'

import { ForgeLinked } from '../../index.js'

export default new NativeFunction({
  name: '$playerQueueTime',
  description: 'Get the queue time of a player',
  version: '1.0.0',
  brackets: false,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to get the queue time for',
      type: ArgType.Guild,
      required: false,
      rest: false,
    },
  ],
  output: ArgType.Number,
  execute(ctx, [guildId]) {
    const linked = ctx.client.getExtension(ForgeLinked, true).lavalink
    if (!linked) return this.customError('ForgeLinked is not initialized')
    if (!guildId) guildId = ctx.guild
    if (!guildId)
      return this.customError(
        'Unable to find any guild. Ensure this command was ran inside of a guild and not dms or a group chat',
      )
    const player = linked.getPlayer(guildId.id)
    if (!player) return this.customError('Player not found')
    return this.success(player.queue.utils.totalDuration())
  },
})
