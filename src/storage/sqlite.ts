import Database from 'better-sqlite3'
import type { DadidaMessage } from '../core/types.js'

export interface StoredMessage {
  id: string
  content: string
  authorId: string
  authorName: string
  channelId: string
  platform: string
  timestamp: number
}

export interface SearchOptions {
  query?: string
  authorId?: string
  channelId?: string
  before?: number
  after?: number
  limit?: number
}

export class MessageStore {
  private db: Database.Database

  constructor(dbPath: string = './dadida.db') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    // Wait (instead of throwing SQLITE_BUSY) if another writer holds the lock —
    // e.g. the live bot and a backfill script writing the same db concurrently.
    this.db.pragma('busy_timeout = 5000')
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL DEFAULT '',
        channel_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_channel_time
        ON messages(channel_id, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_messages_author
        ON messages(author_id, timestamp DESC);
    `)

    // Migrate existing databases that predate the author_name column.
    const hasAuthorName = this.db.prepare(
      `SELECT name FROM pragma_table_info('messages') WHERE name='author_name'`
    ).get()
    if (!hasAuthorName) {
      this.db.exec(`ALTER TABLE messages ADD COLUMN author_name TEXT NOT NULL DEFAULT ''`)
    }

    const ftsExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'`
    ).get()

    if (!ftsExists) {
      this.db.exec(`
        CREATE VIRTUAL TABLE messages_fts USING fts5(
          content,
          content=messages,
          content_rowid=rowid
        );

        CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, content)
          VALUES (new.rowid, new.content);
        END;
      `)
    }
  }

  store(message: DadidaMessage): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO messages (id, content, author_id, author_name, channel_id, platform, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.id,
      message.content,
      message.authorId,
      message.authorName,
      message.channelId,
      message.platform,
      message.timestamp.getTime(),
    )
  }

  search(options: SearchOptions): StoredMessage[] {
    const limit = options.limit ?? 20
    const conditions: string[] = []
    const params: unknown[] = []

    if (options.query) {
      conditions.push(`id IN (SELECT id FROM messages WHERE rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?))`)
      params.push(options.query)
    }
    if (options.authorId) {
      conditions.push('author_id = ?')
      params.push(options.authorId)
    }
    if (options.channelId) {
      conditions.push('channel_id = ?')
      params.push(options.channelId)
    }
    if (options.before) {
      conditions.push('timestamp < ?')
      params.push(options.before)
    }
    if (options.after) {
      conditions.push('timestamp > ?')
      params.push(options.after)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit)

    const rows = this.db.prepare(
      `SELECT id, content, author_id, author_name, channel_id, platform, timestamp
       FROM messages ${where}
       ORDER BY timestamp DESC
       LIMIT ?`
    ).all(...params) as Array<{
      id: string
      content: string
      author_id: string
      author_name: string
      channel_id: string
      platform: string
      timestamp: number
    }>

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      authorId: row.author_id,
      authorName: row.author_name,
      channelId: row.channel_id,
      platform: row.platform,
      timestamp: row.timestamp,
    }))
  }

  getRecent(channelId: string, limit: number = 20): StoredMessage[] {
    const rows = this.db.prepare(
      `SELECT id, content, author_id, author_name, channel_id, platform, timestamp
       FROM messages
       WHERE channel_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`
    ).all(channelId, limit) as Array<{
      id: string
      content: string
      author_id: string
      author_name: string
      channel_id: string
      platform: string
      timestamp: number
    }>

    return rows.reverse().map((row) => ({
      id: row.id,
      content: row.content,
      authorId: row.author_id,
      authorName: row.author_name,
      channelId: row.channel_id,
      platform: row.platform,
      timestamp: row.timestamp,
    }))
  }

  close(): void {
    this.db.close()
  }
}
