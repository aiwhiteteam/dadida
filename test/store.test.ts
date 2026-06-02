import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MessageStore } from '../src/storage/sqlite.js'
import { unlinkSync } from 'node:fs'
import type { DadidaMessage } from '../src/core/types.js'

const DB_PATH = '/tmp/dadida-test.db'

function makeMessage(overrides: Partial<DadidaMessage> = {}): DadidaMessage {
  return {
    id: Math.random().toString(36).slice(2),
    content: 'test message',
    authorId: 'user1',
    authorIsBot: false,
    channelId: 'ch1',
    platform: 'discord',
    timestamp: new Date(),
    raw: null,
    ...overrides,
  }
}

describe('MessageStore', () => {
  let store: MessageStore

  beforeEach(() => {
    try { unlinkSync(DB_PATH) } catch {}
    store = new MessageStore(DB_PATH)
  })

  afterEach(() => {
    store.close()
    try { unlinkSync(DB_PATH) } catch {}
  })

  it('stores and retrieves messages', () => {
    store.store(makeMessage({ id: '1', content: 'hello world' }))
    const recent = store.getRecent('ch1', 10)
    expect(recent).toHaveLength(1)
    expect(recent[0].content).toBe('hello world')
  })

  it('full-text search works', () => {
    store.store(makeMessage({ id: '1', content: 'NVDA earnings look great' }))
    store.store(makeMessage({ id: '2', content: 'what should we eat tonight' }))
    store.store(makeMessage({ id: '3', content: 'NVDA valuation is stretched' }))

    const results = store.search({ query: 'NVDA' })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.content.includes('NVDA'))).toBe(true)
  })

  it('filters by authorId', () => {
    store.store(makeMessage({ id: '1', authorId: 'alice', content: 'from alice' }))
    store.store(makeMessage({ id: '2', authorId: 'bob', content: 'from bob' }))

    const results = store.search({ authorId: 'alice' })
    expect(results).toHaveLength(1)
    expect(results[0].authorId).toBe('alice')
  })

  it('filters by channelId', () => {
    store.store(makeMessage({ id: '1', channelId: 'general' }))
    store.store(makeMessage({ id: '2', channelId: 'random' }))

    const results = store.search({ channelId: 'general' })
    expect(results).toHaveLength(1)
    expect(results[0].channelId).toBe('general')
  })

  it('getRecent returns in chronological order', () => {
    const t1 = new Date('2024-01-01')
    const t2 = new Date('2024-01-02')
    const t3 = new Date('2024-01-03')

    store.store(makeMessage({ id: '1', content: 'first', timestamp: t1 }))
    store.store(makeMessage({ id: '2', content: 'second', timestamp: t2 }))
    store.store(makeMessage({ id: '3', content: 'third', timestamp: t3 }))

    const recent = store.getRecent('ch1', 10)
    expect(recent[0].content).toBe('first')
    expect(recent[2].content).toBe('third')
  })

  it('respects limit', () => {
    for (let i = 0; i < 30; i++) {
      store.store(makeMessage({ id: String(i) }))
    }

    const results = store.search({ limit: 5 })
    expect(results).toHaveLength(5)
  })

  it('ignores duplicate message IDs', () => {
    store.store(makeMessage({ id: 'same', content: 'first' }))
    store.store(makeMessage({ id: 'same', content: 'second' }))

    const recent = store.getRecent('ch1', 10)
    expect(recent).toHaveLength(1)
    expect(recent[0].content).toBe('first')
  })
})
