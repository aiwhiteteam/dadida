import type { DadidaConfig, DadidaContext, Logger, Platform, MessageStore, StoredMessage, Classification } from './types.js'
import { runPipeline } from './pipeline.js'

const defaultLogger: Logger = {
  info: (msg, data) => console.log(`[dadida] ${msg}`, data ?? ''),
  warn: (msg, data) => console.warn(`[dadida] ${msg}`, data ?? ''),
  error: (msg, data) => console.error(`[dadida] ${msg}`, data ?? ''),
  debug: (msg, data) => console.debug(`[dadida] ${msg}`, data ?? ''),
}

export interface DadidaBot {
  start(): Promise<void>
  stop(): Promise<void>
}

function createContext(platform: Platform, logger: Logger, store: MessageStore | undefined): DadidaContext {
  const bag = new Map<string, unknown>()
  if (store) bag.set('store', store)

  return {
    platform,
    logger,
    classifications: {},
    recentMessages: [],
    get<T = unknown>(key: string): T | undefined {
      return bag.get(key) as T | undefined
    },
    set<T = unknown>(key: string, value: T): void {
      bag.set(key, value)
    },
  }
}

export function createBot(config: DadidaConfig): DadidaBot {
  const logger = config.logger ?? defaultLogger
  let platform: Platform

  return {
    async start() {
      platform = config.platform.create()
      const baseCtx = createContext(platform, logger, config.store)

      platform.onMessage(async (message) => {
        config.store?.store(message)
        const recentMessages = config.store?.getRecent(message.channelId, 20) ?? []

        const messageCtx = createContext(platform, logger, config.store)
        messageCtx.recentMessages = recentMessages

        try {
          await runPipeline(message, config.plugins, messageCtx)
        } catch (error) {
          logger.error('Pipeline error', { error: String(error) })
          for (const plugin of config.plugins) {
            if (plugin.onError) {
              await plugin.onError(error as Error, messageCtx).catch(() => {})
            }
          }
        }
      })

      await platform.connect()
      logger.info(`Connected to ${platform.name}`)

      for (const plugin of config.plugins) {
        if (plugin.onReady) {
          await plugin.onReady(baseCtx)
        }
      }

      logger.info(`Bot started with ${config.plugins.length} plugin(s)`)
    },

    async stop() {
      logger.info('Shutting down...')
      config.store?.close()
      await platform?.disconnect()
      logger.info('Disconnected')
    },
  }
}
