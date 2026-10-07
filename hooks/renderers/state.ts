// State diagrams, reshaped first into what the library draws well.

import type { DiagramRenderer } from '../diagram.ts'
import { fitFirst } from '../fit.ts'
import { spacings } from './ascii.ts'

const SELF_LOOP = /^\s*([\w.-]+)\s*-->\s*([\w.-]+)\s*(?::\s*(.*))?$/

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

export const state: DiagramRenderer = {
  kind: 'stateDiagram',
  matches: header => /^stateDiagram(?:-v2)?\s*$/.test(header),
  draw(body, width) {
    const prepared = prepareState(body)
    const lines = fitFirst(spacings(prepared.body), width)

    return prepared.notes.length > 0 ? [...lines, '', ...prepared.notes] : lines
  },
}
