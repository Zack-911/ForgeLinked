import { ArgType, NativeFunction } from '@tryforge/forgescript';
declare enum EqBand {
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
    Band26KHz = 14
}
declare enum Gain {
    Muted = -0.25,
    Disable = 0,
    VeryLow = 0.25,
    Half = 0.5,
    SlightBoost = 0.75,
    Normal = 1,
    Boosted = 1.25,
    StrongBoost = 1.5,
    Double = 2
}
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    type: ArgType.Guild;
    required: false;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Enum;
    enum: typeof EqBand;
    required: true;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Enum;
    enum: typeof Gain;
    required: true;
    rest: false;
}], true>;
export default _default;
