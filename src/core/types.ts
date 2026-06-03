export interface DadidaMessage {
  id: string
  content: string
  authorId: string
  authorName: string
  authorIsBot: boolean
  channelId: string
  platform: string
  timestamp: Date
  raw: unknown
}

export type Classification = Record<string, unknown>

export interface PolicyDecision {
  shouldAct: boolean
  action?: string
  data?: Record<string, unknown>
}

export interface DadidaContext {
  platform: Platform
  logger: Logger
  classifications: Record<string, Classification>
  recentMessages: StoredMessage[]
  get<T = unknown>(key: string): T | undefined
  set<T = unknown>(key: string, value: T): void
}

export interface MessageStore {
  store(message: DadidaMessage): void
  search(options: { query?: string; authorId?: string; channelId?: string; before?: number; after?: number; limit?: number }): StoredMessage[]
  getRecent(channelId: string, limit?: number): StoredMessage[]
  close(): void
}

export interface StoredMessage {
  id: string
  content: string
  authorId: string
  authorName: string
  channelId: string
  platform: string
  timestamp: number
}

export interface Platform {
  name: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  onMessage(handler: (message: DadidaMessage) => Promise<void>): void
  reply(channelId: string, messageId: string, text: string): Promise<void>
  mute(channelId: string, userId: string, durationSeconds: number, reason?: string): Promise<void>
  sendMessage(channelId: string, text: string): Promise<void>
}

export interface PlatformConfig {
  create(): Platform
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  debug(message: string, data?: Record<string, unknown>): void
}

export interface DadidaConfig {
  platform: PlatformConfig
  plugins: DadidaPlugin[]
  logger?: Logger
  store?: MessageStore
}

export interface DadidaPlugin {
  name: string
  filter?: (message: DadidaMessage, ctx: DadidaContext) => Promise<boolean | void>
  classify?: (message: DadidaMessage, ctx: DadidaContext) => Promise<Classification | void>
  policy?: (classifications: Record<string, Classification>, message: DadidaMessage, ctx: DadidaContext) => Promise<PolicyDecision | void>
  action?: (decision: PolicyDecision, message: DadidaMessage, ctx: DadidaContext) => Promise<void>
  onReady?: (ctx: DadidaContext) => Promise<void>
  onError?: (error: Error, ctx: DadidaContext) => Promise<void>
}
