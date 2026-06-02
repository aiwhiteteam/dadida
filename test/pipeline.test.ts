import { describe, it, expect, vi } from 'vitest'
import { runPipeline } from '../src/core/pipeline.js'
import type { DadidaMessage, DadidaContext, DadidaPlugin } from '../src/core/types.js'

function makeMessage(content = 'test'): DadidaMessage {
  return {
    id: '1',
    content,
    authorId: 'user1',
    authorIsBot: false,
    channelId: 'ch1',
    platform: 'discord',
    timestamp: new Date(),
    raw: null,
  }
}

function makeContext(): DadidaContext {
  const bag = new Map<string, unknown>()
  return {
    platform: {} as any,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    classifications: {},
    recentMessages: [],
    get: (key: string) => bag.get(key),
    set: (key: string, value: unknown) => { bag.set(key, value) },
  }
}

describe('pipeline', () => {
  it('runs filter → classify → policy → action in order', async () => {
    const order: string[] = []

    const plugin: DadidaPlugin = {
      name: 'test',
      async filter() { order.push('filter') },
      async classify() { order.push('classify'); return { topic: 'finance' } },
      async policy() { order.push('policy'); return { shouldAct: true, action: 'reply' } },
      async action() { order.push('action') },
    }

    await runPipeline(makeMessage(), [plugin], makeContext())
    expect(order).toEqual(['filter', 'classify', 'policy', 'action'])
  })

  it('stops pipeline when filter returns false', async () => {
    const actionFn = vi.fn()

    const plugins: DadidaPlugin[] = [
      { name: 'blocker', async filter() { return false } },
      { name: 'actor', action: actionFn },
    ]

    await runPipeline(makeMessage(), plugins, makeContext())
    expect(actionFn).not.toHaveBeenCalled()
  })

  it('filter errors are fail-open', async () => {
    const classifyFn = vi.fn(async () => ({ result: true }))

    const plugins: DadidaPlugin[] = [
      { name: 'broken-filter', async filter() { throw new Error('boom') } },
      { name: 'classifier', classify: classifyFn },
    ]

    await runPipeline(makeMessage(), plugins, makeContext())
    expect(classifyFn).toHaveBeenCalled()
  })

  it('policy errors are fail-closed', async () => {
    const actionFn = vi.fn()

    const plugins: DadidaPlugin[] = [
      { name: 'broken-policy', async policy() { throw new Error('boom') } },
      { name: 'actor', action: actionFn },
    ]

    await runPipeline(makeMessage(), plugins, makeContext())
    expect(actionFn).not.toHaveBeenCalled()
  })

  it('namespaces classifications by plugin name', async () => {
    const ctx = makeContext()

    const plugins: DadidaPlugin[] = [
      { name: 'classifier-a', async classify() { return { score: 0.9 } } },
      { name: 'classifier-b', async classify() { return { score: 0.3 } } },
    ]

    await runPipeline(makeMessage(), plugins, ctx)

    expect(ctx.classifications['classifier-a']).toEqual({ score: 0.9 })
    expect(ctx.classifications['classifier-b']).toEqual({ score: 0.3 })
  })

  it('does not act when the only policy declines (shouldAct false)', async () => {
    const actionFn = vi.fn()

    const plugins: DadidaPlugin[] = [
      { name: 'rejector', async policy() { return { shouldAct: false } } },
      { name: 'actor', action: actionFn },
    ]

    await runPipeline(makeMessage(), plugins, makeContext())
    expect(actionFn).not.toHaveBeenCalled()
  })

  it('a declining policy does not block a later acting plugin', async () => {
    const actionFn = vi.fn()

    const plugins: DadidaPlugin[] = [
      { name: 'decliner', async policy() { return { shouldAct: false } } },
      { name: 'responder', async policy() { return { shouldAct: true, action: 'reply' } }, action: actionFn },
    ]

    await runPipeline(makeMessage(), plugins, makeContext())
    expect(actionFn).toHaveBeenCalled()
  })

  it('runs all action plugins when policy passes', async () => {
    const action1 = vi.fn()
    const action2 = vi.fn()

    const plugins: DadidaPlugin[] = [
      { name: 'policy', async policy() { return { shouldAct: true, action: 'reply' } } },
      { name: 'action1', action: action1 },
      { name: 'action2', action: action2 },
    ]

    await runPipeline(makeMessage(), plugins, makeContext())
    expect(action1).toHaveBeenCalled()
    expect(action2).toHaveBeenCalled()
  })

  it('action errors do not stop other actions', async () => {
    const action2 = vi.fn()

    const plugins: DadidaPlugin[] = [
      { name: 'policy', async policy() { return { shouldAct: true, action: 'reply' } } },
      { name: 'broken', async action() { throw new Error('boom') } },
      { name: 'action2', action: action2 },
    ]

    await runPipeline(makeMessage(), plugins, makeContext())
    expect(action2).toHaveBeenCalled()
  })
})
