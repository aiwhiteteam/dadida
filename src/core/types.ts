export interface DadidaMessage {
  id: string
  content: string
  authorId: string
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
  classifications: Classification
}

export interface Platform {
  name: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  onMessage(handler: (message: DadidaMessage) => Promise<void>): void
  reply(channelId: string, messageId: string, text: string): Promise<void>
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
}

export interface DadidaPlugin {
  name: string
  filter?: (message: DadidaMessage, ctx: DadidaContext) => Promise<boolean | void>
  classify?: (message: DadidaMessage, ctx: DadidaContext) => Promise<Classification | void>
  policy?: (classification: Classification, message: DadidaMessage, ctx: DadidaContext) => Promise<PolicyDecision | void>
  action?: (decision: PolicyDecision, message: DadidaMessage, ctx: DadidaContext) => Promise<void>
  onReady?: (ctx: DadidaContext) => Promise<void>
  onError?: (error: Error, ctx: DadidaContext) => Promise<void>
}
