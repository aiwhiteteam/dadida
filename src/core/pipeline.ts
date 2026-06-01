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
  // Filter phase — if any filter returns false, stop processing
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
      // Fail-open: filter errors don't block processing
    }
  }

  // Classify phase — merge all classification results
  let classification: Classification = {}
  for (const plugin of plugins) {
    if (!plugin.classify) continue
    try {
      const result = await plugin.classify(message, ctx)
      if (result) {
        classification = { ...classification, ...result }
      }
    } catch (error) {
      ctx.logger.error(`Classify error in plugin: ${plugin.name}`, {
        error: String(error),
      })
    }
  }
  ctx.classifications = classification

  // Policy phase — if any policy returns shouldAct: false, stop
  let decision: PolicyDecision = { shouldAct: false }
  for (const plugin of plugins) {
    if (!plugin.policy) continue
    try {
      const result = await plugin.policy(classification, message, ctx)
      if (result) {
        if (!result.shouldAct) {
          ctx.logger.debug(`Policy rejected by plugin: ${plugin.name}`, {
            messageId: message.id,
          })
          return
        }
        decision = result
      }
    } catch (error) {
      ctx.logger.error(`Policy error in plugin: ${plugin.name}`, {
        error: String(error),
      })
      // Fail-closed: policy errors mean no action
      return
    }
  }

  if (!decision.shouldAct) return

  // Action phase — run all matching action plugins
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
