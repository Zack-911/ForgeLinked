import { ArgType, NativeFunction } from '@tryforge/forgescript'

import { ForgeLinked } from '../../index.js'

enum EqBand {
  Band60Hz = 0,
  Band170Hz = 1,
  Band310Hz = 2,
  Band600Hz = 3,
  Band1KHz = 4,
  Band3KHz = 5,
  Band6KHz = 6,
  Band12KHz = 7,
  Band14KHz = 8,
  Band16KHz = 9,
  Band18KHz = 10,
  Band20KHz = 11,
  Band22KHz = 12,
  Band24KHz = 13,
  Band26KHz = 14,
}

enum Gain {
  Muted = -0.25,
  VeryLow = 0.25,
  Half = 0.5,
  SlightBoost = 0.75,
  Normal = 1.0,
  Boosted = 1.25,
  StrongBoost = 1.5,
  Double = 2.0,
}

function resolveEnumNumber(
  enumObject: Record<string, string | number>,
  value: unknown,
): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  const enumValue = enumObject[value]
  if (typeof enumValue === 'number') return enumValue

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

export default new NativeFunction({
  name: '$playerFilterSetEQ',
  description: 'Sets the players equalizer band on-top of the existing ones',
  version: '2.1.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to set the equalizer for',
      type: ArgType.Guild,
      required: false,
      rest: false,
    },
    {
      name: 'eqBand',
      description: 'The band to set the equalizer for',
      type: ArgType.Enum,
      enum: EqBand,
      required: true,
      rest: false,
    },
    {
      name: 'gain',
      description: 'The gain to set the equalizer for',
      type: ArgType.Enum,
      enum: Gain,
      required: true,
      rest: false,
    },
  ],
  output: ArgType.Json,
  async execute(ctx, [guildId, band, gain]) {
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
      const resolvedBand = resolveEnumNumber(EqBand, band)
      const resolvedGain = resolveEnumNumber(Gain, gain)

      if (
        resolvedBand === undefined ||
        !Number.isInteger(resolvedBand) ||
        resolvedBand < 0 ||
        resolvedBand > 14
      ) {
        return this.customError('EQ band must be an integer between 0 and 14')
      }

      if (resolvedGain === undefined) return this.customError('EQ gain must be a number')

      await player.filterManager.setEQ({ band: resolvedBand, gain: resolvedGain })
      return this.successJSON({
        band: resolvedBand,
        gain: resolvedGain,
        success: true,
        equalizer: player.filterManager.equalizerBands.filter(Boolean),
      })
    } catch (err) {
      return this.customError(
        `Failed to set EQ: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
