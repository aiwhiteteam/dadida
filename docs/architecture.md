# Architecture

## Layers

```
discord.js            Platform API (WebSocket, events, send messages)
    ↓
Dadida                Community presence layer (observe → decide → act)
    ↓
@openai/agents        Agent reasoning (structured output, tools, guardrails)
```

Dadida owns **when** and **whether** to engage. OpenAI Agents SDK owns **how** the agent reasons.

## Core Pipeline

Every message flows through a fixed pipeline:

```
Message → Filter → Classify → Policy → Action
```

| Stage | Purpose | On error |
|-------|---------|----------|
| Filter | Should we even look at this? | Fail-open (continue) |
| Classify | What is this message about? | Skip |
| Policy | Should the persona act? | Fail-closed (no action) |
| Action | Execute the response | Log, continue |

Plugins implement whichever hooks they need. Registration order determines execution order.

## Plugin System

Follows the Vite/Rollup pattern — plugins are functions returning plain objects:

```ts
function myPlugin(): DadidaPlugin {
  return {
    name: 'my-plugin',
    async classify(message, ctx) { ... },
    async policy(classifications, message, ctx) { ... },
    async action(decision, message, ctx) { ... },
  }
}
```

No classes, no inheritance, no registry. Just composition.

## Context (Typed Container)

`DadidaContext` uses a typed get/set bag instead of growing interface fields:

```ts
// Set
ctx.set('store', myStore)

// Get
const store = ctx.get<MessageStore>('store')
```

Fixed fields on context: `platform`, `logger`, `classifications`, `recentMessages`.
Everything else goes through the container.

## Classifications (Namespaced)

Each plugin's classify result is stored under its plugin name:

```ts
ctx.classifications = {
  'investing-classifier': { is_investing_related: true, confidence: 0.92 },
  'moderator': { is_violation: false, severity: 'none' },
}
```

No key collisions. Policy hooks receive the full namespaced map.

## Platform Interface

```ts
interface Platform {
  name: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  onMessage(handler): void
  reply(channelId, messageId, text): Promise<void>
  mute(channelId, userId, durationSeconds, reason?): Promise<void>
  sendMessage(channelId, text): Promise<void>
}
```

Discord is the first implementation. Adding Slack/Telegram means implementing this interface — zero changes to core.

## Storage

Optional. Injected via config:

```ts
createBot({
  store: new SqliteMessageStore('./data/messages.db'),
})
```

`MessageStore` is an interface — swap SQLite for Postgres or any other implementation without touching framework code.

Stored messages are searchable via `createHistoryTool()` which exposes an `@openai/agents` tool the persona can call on demand.

## Persona Files

```
personas/
├── identity.md     ← facts (name, role, vibe) — rarely changes
├── soul.md         ← behavior (voice, style, boundaries) — refined over time
knowledge/
├── *.md            ← domain knowledge — updated frequently
```

Loaded at startup as plain strings, concatenated into agent `instructions`. No YAML, no frontmatter, no parsing — just markdown.

## Design Decisions

1. **Plugins are functions, not classes** — composable, testable, no `this` confusion
2. **Pipeline is deterministic** — code decides, not the LLM
3. **Platform is an interface** — framework doesn't depend on discord.js directly
4. **Store is optional** — bot works without persistence
5. **No middleware/onion model** — lifecycle hooks are the right pattern for "each stage does different work"
6. **No YAML config for business logic** — users write TypeScript
7. **Single package** — split to monorepo when needed, not before
