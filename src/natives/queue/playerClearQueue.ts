import { ArgType, NativeFunction } from '@tryforge/forgescript'

import { ForgeLinked } from '../../index.js'

export default new NativeFunction({
  name: '$playerClearQueue',
  description: 'Clear the queue of a player',
  version: '1.0.0',
  brackets: false,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to clear the queue for',
      type: ArgType.Guild,
      required: false,
      rest: false,
    },
  ],
  output: ArgType.Boolean,
  execute(ctx, [guildId]) {
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
      const lengthQ = player.queue.tracks.length
      if (lengthQ <= 0) return this.success(false)
      player.queue.splice(0, lengthQ)
      return this.success(true)
    } catch (err) {
      return this.customError(
        `Failed to clear queue: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
