import { tool } from '@openai/agents'
import { z } from 'zod'
import type { MessageStore } from './sqlite.js'

export function createHistoryTool(store: MessageStore) {
  return tool({
    name: 'search_history',
    description: 'Search message history in this community. Results include ISO timestamps and are returned newest first. Use this to find past discussions, prior trades, what a user said, and the latest relevant record on a topic.',
    parameters: z.object({
      query: z.string().optional().describe('Full-text search query (keywords)'),
      authorId: z.string().optional().describe('Filter by user ID'),
      channelId: z.string().optional().describe('Filter by channel ID'),
      limit: z.number().optional().describe(
        'Max results, default 20. Results are returned newest first by timestamp DESC.'
      ),
    }),
    execute: async (params) => {
      const results = store.search({
        query: params.query,
        authorId: params.authorId,
        channelId: params.channelId,
        limit: params.limit,
      })

      if (results.length === 0) return 'No messages found.'

      return results
        .map((m) => `[${new Date(m.timestamp).toISOString()}] ${m.authorName} <${m.authorId}>: ${m.content}`)
        .join('\n')
    },
  })
}
