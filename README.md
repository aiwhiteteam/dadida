# Dadida

Build AI personas for Discord community engagement & management.

Two ways to use:

- **🚀 Deploy** — use [dadida-starter](https://github.com/aiwhiteteam/dadida-starter) — clone, configure your persona, deploy to Railway / Fly.io / any VPS.
- **📦 Library** — `npm install dadida` and build your own bot with a decoupled, customizable plugin system.

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
// index.ts
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

# Development
npm run dev

# Production
npm run build && npm start
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

> For deployment, use [dadida-starter](https://github.com/aiwhiteteam/dadida-starter). The instructions below apply to the starter repo.

Dadida runs as a **long-lived worker process** (it holds a Discord gateway /
WebSocket connection). There is no HTTP server and no health-check endpoint — the
host just needs to keep one process alive. Run **exactly one instance**: a second
one opens a duplicate gateway connection and double-replies.

The [starter](https://github.com/aiwhiteteam/dadida-starter) ships a ready-to-use
`Dockerfile`, `.dockerignore`, and `fly.toml`.

### Docker

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/personas ./personas
COPY --from=build /app/knowledge ./knowledge
COPY package.json ./
CMD ["npm", "start"]
```

The container reads config from injected env vars — no `.env` file needed, since
the start script uses `--env-file-if-exists` and simply skips it when absent.

### Railway

1. Create a Railway project
2. Connect your GitHub repo
3. Set environment variables (at minimum `DISCORD_TOKEN` and `OPENAI_API_KEY`)
4. Build command: `npm run build`
5. Start command: `npm start`
6. Deploy — Railway runs it as a worker and monitors process health directly
   (no health check needed).

### Fly.io

Uses the bundled `fly.toml` (no `[http_service]` block on purpose — this is a
worker, not a web app).

```bash
fly launch --no-deploy
fly secrets set DISCORD_TOKEN=xxx OPENAI_API_KEY=xxx LISTEN_CHANNEL_IDS=xxx
fly deploy
fly scale count 1                           # one instance only
```

### Any VPS / Docker Host

```bash
docker build -t dadida-bot .
docker run -d --restart unless-stopped \
  -e DISCORD_TOKEN=xxx \
  -e OPENAI_API_KEY=xxx \
  -e LISTEN_CHANNEL_IDS=xxx \
  dadida-bot
```

### Persisting history

The bot writes message history to a SQLite file at `./data/messages.db`. On
container hosts that directory is **ephemeral and wiped on every redeploy**. To
keep history across restarts, mount a persistent volume at `/app/data`:

- **Fly.io**: `fly volumes create data --size 1`, then add a `[[mounts]]` block to
  `fly.toml` (`source = "data"`, `destination = "/app/data"`).
- **Docker / VPS**: add `-v dadida-data:/app/data` to `docker run`.
- **Railway**: attach a volume mounted at `/app/data`.

History is optional — without a volume the bot still runs, it just starts each
deploy with an empty memory.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `OPENAI_API_KEY` | Yes | OpenAI API key (used by @openai/agents) |
| `LISTEN_CHANNEL_IDS` | No | Channel ID(s) to listen on; comma-separate for several (`123,456`). Empty = all channels |
| `CONFIDENCE_THRESHOLD` | No | Minimum confidence (0–1) for the persona to reply. Default `0.75` |
| `ESCALATE_CHANNEL_ID` | No | Channel for moderator escalation alerts |
| `ESCALATE_MENTION` | No | Mention used on escalation when no escalation channel is set |

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
