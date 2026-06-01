import {
  Client,
  GatewayIntentBits,
  type Message as DiscordMessage,
} from 'discord.js'
import type { Platform, PlatformConfig, DadidaMessage } from '../core/types.js'

export interface DiscordConfig {
  token: string
  channels?: string[]
}

class DiscordPlatform implements Platform {
  name = 'discord'
  private client: Client
  private config: DiscordConfig
  private messageHandler?: (message: DadidaMessage) => Promise<void>

  constructor(config: DiscordConfig) {
    this.config = config
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    })
  }

  async connect(): Promise<void> {
    this.client.on('messageCreate', (msg) => this.handleMessage(msg))
    await this.client.login(this.config.token)
  }

  async disconnect(): Promise<void> {
    this.client.destroy()
  }

  onMessage(handler: (message: DadidaMessage) => Promise<void>): void {
    this.messageHandler = handler
  }

  async reply(channelId: string, messageId: string, text: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId)
    if (!channel?.isTextBased() || !('messages' in channel)) return
    const msg = await channel.messages.fetch(messageId)
    await msg.reply(text)
  }

  async mute(channelId: string, userId: string, durationSeconds: number, reason?: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId)
    if (!channel || !('guild' in channel)) return
    const member = await channel.guild.members.fetch(userId)
    await member.timeout(durationSeconds * 1000, reason)
  }



  async sendMessage(channelId: string, text: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId)
    if (!channel?.isTextBased() || !('send' in channel)) return
    await channel.send(text)
  }

  private async handleMessage(msg: DiscordMessage): Promise<void> {
    if (msg.author.bot) return
    if (this.config.channels?.length && !this.config.channels.includes(msg.channelId)) return
    if (!msg.content.trim()) return

    const message: DadidaMessage = {
      id: msg.id,
      content: msg.content,
      authorId: msg.author.id,
      authorIsBot: msg.author.bot,
      channelId: msg.channelId,
      platform: 'discord',
      timestamp: msg.createdAt,
      raw: msg,
    }

    await this.messageHandler?.(message)
  }
}

export function discord(config: DiscordConfig): PlatformConfig {
  return {
    create: () => new DiscordPlatform(config),
  }
}
