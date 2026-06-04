"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const index_js_1 = require("../../index.js");
exports.default = new forgescript_1.NativeFunction({
    name: '$playerToggleVibrato',
    description: 'Enables / Disables the Vibrato effect',
    version: '2.1.0',
    brackets: true,
    unwrap: true,
    args: [
        {
            name: 'guildId',
            description: 'The guild id to toggle vibrato for',
            type: forgescript_1.ArgType.Guild,
            required: false,
            rest: false,
        },
        {
            name: 'frequency',
            description: 'The frequency for the vibrato effect',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false,
        },
        {
            name: 'depth',
            description: 'The depth for the vibrato effect',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false,
        },
    ],
    output: forgescript_1.ArgType.Json,
    async execute(ctx, [guildId, frequency, depth]) {
        try {
            const linked = ctx.client.getExtension(index_js_1.ForgeLinked, true)?.lavalink;
            if (!linked)
                return this.customError('ForgeLinked is not initialized');
            if (!guildId)
                guildId = ctx.guild;
            if (!guildId)
                return this.customError('Unable to find any guild. Ensure this command was ran inside of a guild and not DMs or a group chat');
            const player = linked.getPlayer(guildId.id);
            if (!player)
                return this.customError('Player not found');
            if (!player.node?.connected)
                return this.customError('Lavalink node is not connected. Please wait for the node to reconnect.');
            const res = await player.filterManager.toggleVibrato(frequency, depth);
            return this.successJSON(JSON.stringify(res));
        }
        catch (err) {
            return this.customError(`Failed to toggle vibrato: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
});
//# sourceMappingURL=playerToggleVibrato.js.map