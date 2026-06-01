import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

export function loadPersona(filePath: string): string {
  const absolute = resolve(filePath)
  return readFileSync(absolute, 'utf-8').trim()
}

export function loadKnowledge(dirPath: string): string {
  const absolute = resolve(dirPath)
  const files = readdirSync(absolute).filter((f) => f.endsWith('.md')).sort()
  const sections = files.map((file) => {
    const content = readFileSync(join(absolute, file), 'utf-8').trim()
    return content
  })
  return sections.join('\n\n---\n\n')
}
