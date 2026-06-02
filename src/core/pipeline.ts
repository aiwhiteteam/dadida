import type {
  DadidaMessage,
  DadidaPlugin,
  DadidaContext,
  Classification,
  PolicyDecision,
} from './types.js'

export async function runPipeline(
  message: DadidaMessage,
  plugins: DadidaPlugin[],
  ctx: DadidaContext,
): Promise<void> {
  for (const plugin of plugins) {
    if (!plugin.filter) continue
    try {
      const result = await plugin.filter(message, ctx)
      if (result === false) {
        ctx.logger.debug(`Filtered by plugin: ${plugin.name}`, {
          messageId: message.id,
        })
        return
      }
    } catch (error) {
      ctx.logger.error(`Filter error in plugin: ${plugin.name}`, {
        error: String(error),
      })
    }
  }

  const classifications: Record<string, Classification> = {}
  for (const plugin of plugins) {
    if (!plugin.classify) continue
    try {
      const result = await plugin.classify(message, ctx)
      if (result) {
        classifications[plugin.name] = result
      }
    } catch (error) {
      ctx.logger.error(`Classify error in plugin: ${plugin.name}`, {
        error: String(error),
      })
    }
  }
  ctx.classifications = classifications

  let decision: PolicyDecision = { shouldAct: false }
  for (const plugin of plugins) {
    if (!plugin.policy) continue
    try {
      const result = await plugin.policy(classifications, message, ctx)
      if (result) {
        if (!result.shouldAct) {
          ctx.logger.debug(`Policy declined by plugin: ${plugin.name}`, {
            messageId: message.id,
          })
          continue
        }
        decision = result
      }
    } catch (error) {
      ctx.logger.error(`Policy error in plugin: ${plugin.name}`, {
        error: String(error),
      })
      return
    }
  }

  if (!decision.shouldAct) return

  for (const plugin of plugins) {
    if (!plugin.action) continue
    try {
      await plugin.action(decision, message, ctx)
    } catch (error) {
      ctx.logger.error(`Action error in plugin: ${plugin.name}`, {
        error: String(error),
      })
    }
  }
}
