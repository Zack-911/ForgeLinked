import { Interpreter } from '@tryforge/forgescript'
import { Guild } from 'discord.js'

import { ForgeLinked } from '..'
import { ForgeLinkedEventHandler } from '../structures/ForgeLinkedEventManager'

export default new ForgeLinkedEventHandler({
  name: 'linkedTrackStart',
  version: '2.0.0',
  description: 'Triggered when a track starts playing',
  listener(player, track, payload) {
    if (track?.pluginInfo?.clientData?.previousTrack) {
      delete track.pluginInfo.clientData.previousTrack
    }

    const commands = this.getExtension(ForgeLinked, true).commands.get('linkedTrackStart')
    const guild = this.guilds.cache.get(player.guildId) as Guild

    for (const command of commands) {
      Interpreter.run({
        obj: guild,
        client: this,
        command,
        data: command.compiled.code,
        extras: { player, track, payload },
      })
    }
  },
})
