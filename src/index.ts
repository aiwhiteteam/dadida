export { createBot } from './core/bot.js'
export { definePlugin } from './core/plugin.js'
export { discord } from './platforms/discord.js'
export { loadPersona, loadKnowledge } from './persona/loader.js'

export type {
  DadidaBot,
} from './core/bot.js'

export type {
  DadidaMessage,
  DadidaPlugin,
  DadidaConfig,
  DadidaContext,
  Classification,
  PolicyDecision,
  Platform,
  PlatformConfig,
  Logger,
} from './core/types.js'

export type {
  DiscordConfig,
} from './platforms/discord.js'

