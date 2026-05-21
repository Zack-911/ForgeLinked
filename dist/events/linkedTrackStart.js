"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("..");
const ForgeLinkedEventManager_1 = require("../structures/ForgeLinkedEventManager");
exports.default = new ForgeLinkedEventManager_1.ForgeLinkedEventHandler({
    name: 'linkedTrackStart',
    version: '2.0.0',
    description: 'Triggered when a track starts playing',
    listener(player, track, payload) {
        if (track?.pluginInfo?.clientData?.previousTrack) {
            delete track.pluginInfo.clientData.previousTrack;
        }
        const commands = this.getExtension(__1.ForgeLinked, true).commands.get('linkedTrackStart');
        const guild = this.guilds.cache.get(player.guildId);
        for (const command of commands) {
            forgescript_1.Interpreter.run({
                obj: guild,
                client: this,
                command,
                data: command.compiled.code,
                extras: { player, track, payload },
            });
        }
    },
});
//# sourceMappingURL=linkedTrackStart.js.map