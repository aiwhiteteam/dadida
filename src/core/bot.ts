import type { DadidaConfig, DadidaContext, Logger, Platform } from './types.js'
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

  return {
    async start() {
      platform = config.platform.create()
      const ctx: DadidaContext = {
        platform,
        logger,
        classifications: {},
      }

      platform.onMessage(async (message) => {
        const messageCtx: DadidaContext = { ...ctx, classifications: {} }
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
      await platform?.disconnect()
      logger.info('Disconnected')
    },
  }
}
