# ForgeLinked v2 🌋
Music made stronger with Lavalink for ForgeScript.

---

## ✨ Features
- Simple and easy-to-use ForgeScript functions
- Support for multiple event listeners
- Support for different audio providers
- Playlist & queue management
- Lavalink v4 ready

---

## 📦 Installation

Install via npm, yarn, pnpm etc:

```bash
npm install @tryforge/forge.linked
```

---

## 🚀 Setup

First, import ForgeClient and ForgeLinked in your main file:

```js
const { ForgeClient } = require('@tryforge/forgescript')
const { ForgeLinked } = require('@tryforge/forge.linked')
import * as dotenv from 'dotenv'
dotenv.config()

const lavalink = new ForgeLinked({
  nodes: [
    {
      id: "Public Lavalink Server",
      host: "lavalink.zack911.xyz",   // or your VPS IP/domain
      port: 443,
      authorization: "ZackIsSoCool", // ✅ must be 'authorization'
      secure: true
    }    
  ],
  playerOptions: {
    defaultSearchPlatform: "youtube"
  },
  events: ['linkedPlayerCreate', 'linkedPlayerDestroy']
})

const client = new ForgeClient({
  intents: [
    'Guilds',
    'GuildMessages',
    'MessageContent',
    'GuildVoiceStates'
  ],
  events: ['messageCreate'],
  extensions: [lavalink],
  prefixes: ['.']
})

client.commands.add({
  name: 'e',
  type: 'messageCreate',
  code: '$onlyForUsers[Not for you!;$botOwnerID] $eval[$message]'
})

client.login(process.env.BOT_TOKEN)
```

---

## ⚙️ Lavalink Configuration

Provide Lavalink server details inside `nodes`:

```js
const lavalink = new ForgeLinked({
  nodes: [
    {
      id: "Main Node",
      host: "lavalink.example.com",
      port: 2333,
      authorization: "youshallnotpass",
      secure: false
    }
  ]
})
```

> 🔑 You can find public Lavalink nodes online or [host your own](https://github.com/freyacodes/Lavalink).

---

## 💡 Tips

### Default Search Engine

Set a default search engine in `playerOptions`:

```js
const lavalink = new ForgeLinked({
  playerOptions: {
    defaultSearchPlatform: 'youtube'
  }
})
```

Available:

* `youtube`
* `youtube music`
* `soundcloud`
* `spotify` (if enabled)

### Configure Autoplay

Tweak how the built-in autoplay engine fetches related tracks via `autoplayOptions`:

```js
const lavalink = new ForgeLinked({
  autoplayOptions: {
    maxFetchTracks: 1, // maximum tracks to queue per trigger (pre-fills the queue)
    retryLimit: 3, // retries if no track could be added
    retryDuration: 5000, // delay (ms) between retries
  },
})
```

These options only affect the **built-in** autoplay engine. Autoplay must also be enabled per-player using `$playerSetAutoPlay` or `$playerToggleAutoPlay`.

---

## 📄 License

ForgeLinked v2 is licensed under the **GPL-3 License**.
See [LICENSE](https://github.com/Zack-911/ForgeLinked/blob/main/LICENSE.md) for more info.