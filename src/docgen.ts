import { generateMetadata } from '@tryforge/forgescript'

// Custom enums used in native function args/outputs.
// These must be exposed so generateMetadata can resolve them via enumToArray()
// instead of crashing with "Cannot convert undefined or null to object".

enum AudioOutput {
  Mono = 'mono',
  Stereo = 'stereo',
  Left = 'left',
  Right = 'right',
}

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

enum LoopMode {
  OFF = 'off',
  TRACK = 'track',
  QUEUE = 'queue',
}

generateMetadata(
  `${__dirname}/natives`,
  'native',
  'ForgeLinkedEvents',
  false,
  {
    AudioOutput,
    EqBand,
    Gain,
    LoopMode,
  },
  `${__dirname}/events`,
)
