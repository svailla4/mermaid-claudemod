// Draw one Mermaid diagram as Unicode box art that fits a width.

import { renderMermaidASCII } from './vendor/beautiful-mermaid-ascii.js'
import type { AsciiRenderOptions } from './vendor/beautiful-mermaid-ascii.js'
import { diagramBody } from './fences.ts'

export type Drawn = { ok: true; art: string } | { ok: false; error: string }

const ROOMY: AsciiRenderOptions = { paddingX: 4, paddingY: 2, boxBorderPadding: 1, colorMode: 'none' }
const TIGHT: AsciiRenderOptions = { paddingX: 2, paddingY: 1, boxBorderPadding: 0, colorMode: 'none' }
const SIDEWAYS = /^(\s*(?:graph|flowchart)\s+)(LR|RL)\b/

const cache = new Map<string, Drawn>()
const CACHE_LIMIT = 200

/** Display width in terminal cells (box-drawing glyphs are one cell each). */
export function widthOf(line: string): number {
  return Array.from(line).length
}

function tidy(art: string): string[] {
  const lines = art.split('\n').map(l => l.replace(/\s+$/, ''))

  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  return lines
}

function widest(lines: string[]): number {
  return lines.reduce((w, l) => Math.max(w, widthOf(l)), 0)
}

function cut(line: string, width: number): string {
  const chars = Array.from(line)

  return chars.length <= width ? line : chars.slice(0, width - 1).join('') + '…'
}

/**
 * Renders `source` to fit `width` columns: roomy spacing, then tight, then a
 * left-right flowchart turned top-down; the narrowest attempt wins when none
 * fits, its lines cut at the width.
 */
export function drawDiagram(source: string, width: number): Drawn {
  const id = `${width}\u0000${source}`
  const hit = cache.get(id)
  if (hit) return hit

  const body = diagramBody(source)
  const attempts: Array<[string, AsciiRenderOptions]> = [
    [body, ROOMY],
    [body, TIGHT],
  ]
  if (SIDEWAYS.test(body)) attempts.push([body.replace(SIDEWAYS, '$1TD'), TIGHT])

  let best: string[] | undefined
  let drawn: Drawn

  try {
    for (const [text, options] of attempts) {
      const lines = tidy(renderMermaidASCII(text, options))
      if (!best || widest(lines) < widest(best)) best = lines
      if (widest(lines) <= width) break
    }
    drawn = { ok: true, art: best!.map(l => cut(l, width)).join('\n') }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    drawn = { ok: false, error: message.split('\n')[0]!.slice(0, 160) }
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  cache.set(id, drawn)

  return drawn
}
