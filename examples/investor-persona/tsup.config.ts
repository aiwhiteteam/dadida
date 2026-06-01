import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['bot.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
})
