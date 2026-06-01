import { createBot, discord } from 'dadida'
import { investingClassifier } from './plugins/investing-classifier.js'
import { investorReply } from './plugins/investor-reply.js'

const bot = createBot({
  platform: discord({
    token: process.env.DISCORD_TOKEN!,
    channels: process.env.GENERAL_CHANNEL_ID
      ? [process.env.GENERAL_CHANNEL_ID]
      : undefined,
  }),
  plugins: [
    investingClassifier(),
    investorReply(),
  ],
})

process.on('SIGINT', () => bot.stop())
process.on('SIGTERM', () => bot.stop())

bot.start()
