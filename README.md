# Dadida

Build autonomous AI personas for Discord communities.

## Vision

Traditional Discord bots are reactive — they respond only when mentioned or triggered by a command.

Dadida enables AI personas to **observe**, **decide**, and **participate** naturally in community conversations. An AI persona continuously watches discussions and selectively engages when its participation adds value — just like a real community member.

```
Community Message
  → Observe (receive message)
  → Filter (should we even look at this?)
  → Classify (what is this about?)
  → Decide (should the persona engage?)
  → Participate (respond in character)
```

## Architecture

```
discord.js          → Discord WebSocket, events, API
        ↓
Dadida              → observe → filter → classify → decide → act
        ↓
@openai/agents      → agent reasoning, structured output, tools
        ↓
Dadida              → interpret result → execute action
```

Dadida is the **community presence layer**. It owns *when* and *whether* to engage. OpenAI Agents SDK handles *how* the agent reasons.

## Quick Start

### Install

```bash
npm install dadida @openai/agents zod
```

### Create a bot

```ts
// bot.ts
import { createBot, discord, definePlugin } from 'dadida'
import { Agent, run } from '@openai/agents'
import { z } from 'zod'

const classifier = new Agent({
  name: 'topic-classifier',
  instructions: 'Classify whether this message is about investing.',
  outputType: z.object({
    is_relevant: z.boolean(),
    confidence: z.number(),
  }),
})

const persona = new Agent({
  name: 'community-member',
  instructions: 'You are a helpful community member. Reply in 1-2 sentences.',
})

const bot = createBot({
  platform: discord({
    token: process.env.DISCORD_TOKEN!,
    channels: [process.env.CHANNEL_ID!],
  }),
  plugins: [
    definePlugin({
      name: 'my-persona',
      async classify(message) {
        const result = await run(classifier, message.content)
        return result.finalOutput ?? { is_relevant: false, confidence: 0 }
      },
      async policy(classification) {
        if (!classification.is_relevant || classification.confidence < 0.75) {
          return { shouldAct: false }
        }
        return { shouldAct: true, action: 'reply' }
      },
      async action(decision, message, ctx) {
        const result = await run(persona, message.content)
        if (result.finalOutput) {
          await ctx.platform.reply(message.channelId, message.id, result.finalOutput)
        }
      },
    }),
  ],
})

bot.start()
```

### Run

```bash
export DISCORD_TOKEN=your-token
export OPENAI_API_KEY=your-key
export CHANNEL_ID=your-channel-id

npx tsx bot.ts
```

## Plugin System

Plugins implement lifecycle hooks. A plugin can implement any combination of hooks:

| Hook | Purpose | Behavior on error |
|------|---------|------------------|
| `filter` | Should we process this message? | Fail-open (continue) |
| `classify` | What is this message about? | Skip classification |
| `policy` | Should the persona act? | Fail-closed (no action) |
| `action` | Execute the response | Log and continue |
| `onReady` | Bot connected | — |
| `onError` | Pipeline error | — |

```ts
import { definePlugin } from 'dadida'

export function myPlugin() {
  return definePlugin({
    name: 'my-plugin',
    async filter(message, ctx) {
      // return false to skip this message
    },
    async classify(message, ctx) {
      // return classification object
    },
    async policy(classification, message, ctx) {
      // return { shouldAct: true/false, action: '...' }
    },
    async action(decision, message, ctx) {
      // execute the action
    },
  })
}
```

## Persona Files

Define your AI persona's identity, personality, and knowledge as markdown files:

```
personas/
├── identity.md    ← the business card: name, role, vibe, avatar (facts, rarely changes)
├── soul.md        ← the personality: voice, tone, boundaries, examples (how you behave)
knowledge/
├── trading-rules.md   ← domain knowledge the persona can reference
└── current-views.md   ← updatable context (change often without touching personality)
```

Load them into your agent:

```ts
import { loadPersona, loadKnowledge } from 'dadida'
import { Agent } from '@openai/agents'

const responder = new Agent({
  name: 'my-persona',
  model: 'gpt-4.1-mini',
  instructions: [
    loadPersona('./personas/identity.md'),
    loadPersona('./personas/soul.md'),
    loadKnowledge('./knowledge/'),
  ].join('\n\n'),
})
```

Edit markdown to change personality or knowledge — no code changes needed.

## Self-Hosting

Dadida runs as a long-lived worker process (Discord WebSocket connection). No HTTP server required.

### Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["npx", "tsx", "bot.ts"]
```

### Railway

1. Create a Railway project
2. Connect your GitHub repo
3. Set environment variables:
   ```
   DISCORD_TOKEN=
   OPENAI_API_KEY=
   CHANNEL_ID=
   ```
4. Set start command: `npx tsx bot.ts`
5. Deploy — Railway runs it as a worker process

No health check endpoint needed. Railway monitors process health directly.

### Fly.io

```toml
# fly.toml
app = "my-dadida-bot"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
```

```bash
fly launch
fly secrets set DISCORD_TOKEN=xxx OPENAI_API_KEY=xxx CHANNEL_ID=xxx
fly deploy
```

Set machine count to 1 — you only need one instance for the Discord gateway connection.

### Any VPS / Docker Host

```bash
docker build -t dadida-bot .
docker run -d --restart unless-stopped \
  -e DISCORD_TOKEN=xxx \
  -e OPENAI_API_KEY=xxx \
  -e CHANNEL_ID=xxx \
  dadida-bot
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `OPENAI_API_KEY` | Yes | OpenAI API key (used by @openai/agents) |
| `CHANNEL_ID` | No | Restrict to specific channel(s) |

## Design Principles

- **Silent by default** — not every message deserves a response
- **LLM classifies, code decides** — deterministic policy gate, not prompt tricks
- **Fail-closed** — prefer false negatives over false positives
- **Plugins are functions** — no magic, no YAML, no auto-discovery
- **Platform-agnostic** — Discord first, extensible to Slack/Telegram

## Roadmap

- [ ] **Recent context** — fetch last N messages from channel, pass to agent as conversation context
- [ ] **Message history** — store all messages to SQLite, expose `search_history` tool to agent for on-demand retrieval
- [ ] **Memory system** — inspired by OpenClaw's three-layer architecture:

  | Layer | Storage | Purpose |
  |-------|---------|---------|
  | Session context | Recent N messages from channel | Immediate conversational awareness |
  | Message history | SQLite (all messages, auto-stored) | Agent searches on demand via tool |
  | Long-term memory | `MEMORY.md` | Curated durable facts |

- [ ] **Multi-agent** — multiple personas coexisting in one community (founder, moderator, support)
- [ ] **Channel awareness** — personas behave differently per channel
- [ ] **Human approval queue** — draft replies sent to admin channel before posting
- [ ] **Slack / Telegram connectors**
- [ ] **RAG tool** — `@openai/agents` tool for large knowledge base retrieval

## License

MIT
