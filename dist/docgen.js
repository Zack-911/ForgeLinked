"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
// Custom enums used in native function args/outputs.
// These must be exposed so generateMetadata can resolve them via enumToArray()
// instead of crashing with "Cannot convert undefined or null to object".
var AudioOutput;
(function (AudioOutput) {
    AudioOutput["Mono"] = "mono";
    AudioOutput["Stereo"] = "stereo";
    AudioOutput["Left"] = "left";
    AudioOutput["Right"] = "right";
})(AudioOutput || (AudioOutput = {}));
var EqBand;
(function (EqBand) {
    EqBand[EqBand["Band60Hz"] = 0] = "Band60Hz";
    EqBand[EqBand["Band170Hz"] = 1] = "Band170Hz";
    EqBand[EqBand["Band310Hz"] = 2] = "Band310Hz";
    EqBand[EqBand["Band600Hz"] = 3] = "Band600Hz";
    EqBand[EqBand["Band1KHz"] = 4] = "Band1KHz";
    EqBand[EqBand["Band3KHz"] = 5] = "Band3KHz";
    EqBand[EqBand["Band6KHz"] = 6] = "Band6KHz";
    EqBand[EqBand["Band12KHz"] = 7] = "Band12KHz";
    EqBand[EqBand["Band14KHz"] = 8] = "Band14KHz";
    EqBand[EqBand["Band16KHz"] = 9] = "Band16KHz";
    EqBand[EqBand["Band18KHz"] = 10] = "Band18KHz";
    EqBand[EqBand["Band20KHz"] = 11] = "Band20KHz";
    EqBand[EqBand["Band22KHz"] = 12] = "Band22KHz";
    EqBand[EqBand["Band24KHz"] = 13] = "Band24KHz";
    EqBand[EqBand["Band26KHz"] = 14] = "Band26KHz";
})(EqBand || (EqBand = {}));
var Gain;
(function (Gain) {
    Gain[Gain["Muted"] = -0.25] = "Muted";
    Gain[Gain["VeryLow"] = 0.25] = "VeryLow";
    Gain[Gain["Half"] = 0.5] = "Half";
    Gain[Gain["SlightBoost"] = 0.75] = "SlightBoost";
    Gain[Gain["Normal"] = 1] = "Normal";
    Gain[Gain["Boosted"] = 1.25] = "Boosted";
    Gain[Gain["StrongBoost"] = 1.5] = "StrongBoost";
    Gain[Gain["Double"] = 2] = "Double";
})(Gain || (Gain = {}));
var LoopMode;
(function (LoopMode) {
    LoopMode["OFF"] = "off";
    LoopMode["TRACK"] = "track";
    LoopMode["QUEUE"] = "queue";
})(LoopMode || (LoopMode = {}));
(0, forgescript_1.generateMetadata)(`${__dirname}/natives`, 'native', 'ForgeLinkedEvents', false, {
    AudioOutput,
    EqBand,
    Gain,
    LoopMode,
}, `${__dirname}/events`);
//# sourceMappingURL=docgen.js.map