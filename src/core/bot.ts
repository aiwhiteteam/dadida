import type { DadidaConfig, DadidaContext, Logger, Platform, MessageStore } from './types.js'
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

export function createBot(config: DadidaConfig): DadidaBot {
  const logger = config.logger ?? defaultLogger
  let platform: Platform
  let store: MessageStore | null = null

  return {
    async start() {
      if (config.storage) {
        const { MessageStore: SqliteStore } = await import('../storage/sqlite.js')
        store = new SqliteStore(config.storage.dbPath)
        logger.info('Message store initialized')
      }

      platform = config.platform.create()
      const ctx: DadidaContext = {
        platform,
        logger,
        classifications: {},
        store,
        recentMessages: [],
      }

      platform.onMessage(async (message) => {
        store?.store(message)

        const recentMessages = store?.getRecent(message.channelId, 20) ?? []

        const messageCtx: DadidaContext = {
          ...ctx,
          classifications: {},
          recentMessages,
        }
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
          await plugin.onReady(ctx)
        }
      }

      logger.info(`Bot started with ${config.plugins.length} plugin(s)`)
    },

    async stop() {
      logger.info('Shutting down...')
      store?.close()
      await platform?.disconnect()
      logger.info('Disconnected')
    },
  }
}
