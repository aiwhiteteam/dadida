#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const command = process.argv[2]

if (command === 'start' || !command) {
  const botFile = process.argv[3] || 'bot.ts'
  const botPath = resolve(process.cwd(), botFile)

  try {
    await import(pathToFileURL(botPath).href)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(`[dadida] Could not find bot file: ${botPath}`)
      console.error(`[dadida] Create a bot.ts file or specify one: dadida start ./my-bot.ts`)
      process.exit(1)
    }
    throw error
  }
} else {
  console.error(`[dadida] Unknown command: ${command}`)
  console.error(`[dadida] Usage: dadida start [bot-file]`)
  process.exit(1)
}
