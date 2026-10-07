// Draw one Mermaid diagram as Unicode box art that fits a width.

import { renderMermaidASCII } from './vendor/beautiful-mermaid-ascii.js'
import type { AsciiRenderOptions } from './vendor/beautiful-mermaid-ascii.js'
import { drawEr } from './er.ts'
import { diagramBody } from './fences.ts'

export type Drawn = { ok: true; art: string } | { ok: false; error: string }

// paddingY below 4 puts edge labels on box borders; border padding adds blank
// rows inside every box.
const ROOMY: AsciiRenderOptions = { paddingX: 4, paddingY: 4, boxBorderPadding: 0, colorMode: 'none' }
const TIGHT: AsciiRenderOptions = { paddingX: 2, paddingY: 4, boxBorderPadding: 0, colorMode: 'none' }
const SIDEWAYS = /^(\s*(?:graph|flowchart)\s+)(LR|RL)\b/
const ER = /^\s*erDiagram\s*(?:\n|$)/
const STATE = /^\s*stateDiagram(?:-v2)?\s*(?:\n|$)/
const SEQUENCE = /^\s*sequenceDiagram\s*(?:\n|$)/
// A message (`A->>B: text`, any arrow) or a note (`Note over A,B: text`).
const MESSAGE = /^(\s*(?:Note\b[^:]*|[^:]*?-{1,2}(?:>>|>|x|\))[^:]*):\s*)(.+)$/

function wrapWords(text: string, max: number): string {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.join('<br/>')
}

/** A sequence diagram with long message and note text wrapped at `max` characters. */
export function wrapMessages(body: string, max: number): string {
  return body
    .split('\n')
    .map(line => {
      const m = MESSAGE.exec(line)
      return m && !/<br\s*\/?>/i.test(m[2]!) ? m[1]! + wrapWords(m[2]!.trim(), max) : line
    })
    .join('\n')
}

const SELF_LOOP =/^\s*([\w.-]+)\s*-->\s*([\w.-]+)\s*(?::\s*(.*))?$/

/**
 * A state diagram as the renderer draws it well: top-level `[*]` become
 * `Start` and `End` states (the renderer draws them as empty boxes), and
 * self-transitions are taken out (it routes them as long detours) and
 * returned as notes to print under the drawing.
 */
export function prepareState(body: string): { body: string; notes: string[] } {
  const notes: string[] = []
  const usesStart = /\bStart\b/.test(body)
  const usesEnd = /\bEnd\b/.test(body)
  let depth = 0

  const lines = body.split('\n').flatMap(line => {
    const atTop = depth === 0
    depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0)
    if (!atTop) return [line]

    const loop = SELF_LOOP.exec(line)
    if (loop && loop[1] === loop[2]) {
      notes.push(`↻ ${loop[1]}${loop[3] ? `: ${loop[3].trim()}` : ''}`)
      return []
    }

    let out = line
    if (!usesStart) out = out.replace(/^(\s*)\[\*\](\s*-->)/, '$1Start$2')
    if (!usesEnd) out = out.replace(/(-->\s*)\[\*\](\s*(?::.*)?)$/, '$1End$2')
    return [out]
  })

  return { body: lines.join('\n'), notes }
}

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

  let body = diagramBody(source)
  let notes: string[] = []
  if (STATE.test(body)) ({ body, notes } = prepareState(body))

  const attempts: Array<[string, AsciiRenderOptions]> = [
    [body, ROOMY],
    [body, TIGHT],
  ]
  if (SIDEWAYS.test(body)) attempts.push([body.replace(SIDEWAYS, '$1TD'), TIGHT])
  if (SEQUENCE.test(body)) attempts.push([wrapMessages(body, 32), TIGHT], [wrapMessages(body, 20), TIGHT])

  let best: string[] | undefined
  let drawn: Drawn

  try {
    if (ER.test(body)) {
      best = drawEr(body, width)
    } else {
      for (const [text, options] of attempts) {
        const lines = tidy(renderMermaidASCII(text, options))
        if (!best || widest(lines) < widest(best)) best = lines
        if (widest(lines) <= width) break
      }
    }
    const lines = notes.length > 0 ? [...best!, '', ...notes] : best!
    drawn = { ok: true, art: lines.map(l => cut(l, width)).join('\n') }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    drawn = { ok: false, error: message.split('\n')[0]!.slice(0, 160) }
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  cache.set(id, drawn)

  return drawn
}
