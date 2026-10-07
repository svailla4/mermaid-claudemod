// Sequence diagrams: roomy, then tight, then with long message and note text
// wrapped at 32 and then 20 characters.

import type { DiagramRenderer } from '../diagram.ts'
import { fitFirst } from '../fit.ts'
import { spacings, tight } from './ascii.ts'

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

export const sequence: DiagramRenderer = {
  kind: 'sequenceDiagram',
  matches: header => /^sequenceDiagram\s*$/.test(header),
  draw: (body, width) =>
    fitFirst([...spacings(body), tight(wrapMessages(body, 32)), tight(wrapMessages(body, 20))], width),
}
