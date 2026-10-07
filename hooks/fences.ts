// Find Mermaid diagrams in a reply's markdown.
//
// A closed fence is a diagram when its info string says `mermaid`/`mmd`, or
// when it is unlabeled (or `text`) and its first meaningful line is the
// header of a diagram kind the mod draws. Unclosed fences (a reply still
// streaming) are left alone until they close.

import { diagramBody, headerOf } from './diagram.ts'

export type Segment =
  | { kind: 'md'; text: string }
  | { kind: 'mermaid'; source: string; raw: string; isLabeled: boolean }

/** Whether a diagram's trimmed first line is the header of a kind the mod draws. */
export type IsDiagramHeader = (header: string) => boolean

const LABELS = new Set(['mermaid', 'mmd'])
const PLAIN_LABELS = new Set(['', 'text', 'txt', 'plain', 'plaintext'])

const OPEN = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/

/** Splits markdown into text and diagram segments, in order. */
export function splitFences(text: string, isDiagramHeader: IsDiagramHeader): Segment[] {
  const lines = text.split('\n')
  const segments: Segment[] = []
  let md: string[] = []
  let i = 0

  const flush = () => {
    if (md.length > 0) segments.push({ kind: 'md', text: md.join('\n') })
    md = []
  }

  while (i < lines.length) {
    const open = OPEN.exec(lines[i]!)

    if (!open) {
      md.push(lines[i]!)
      i++
      continue
    }

    const fence = open[2]!
    const label = (open[3] ?? '').toLowerCase()
    const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`)
    let end = i + 1

    while (end < lines.length && !close.test(lines[end]!)) end++

    if (end >= lines.length) {
      // Unclosed: the rest is still streaming, or isn't a fence at all.
      md.push(...lines.slice(i))
      break
    }

    const raw = lines.slice(i, end + 1).join('\n')
    const source = lines.slice(i + 1, end).join('\n')
    const isLabeled = LABELS.has(label)

    if (isLabeled || (PLAIN_LABELS.has(label) && isDiagramHeader(headerOf(diagramBody(source))))) {
      flush()
      segments.push({ kind: 'mermaid', source, raw, isLabeled })
    } else {
      md.push(...lines.slice(i, end + 1))
    }

    i = end + 1
  }

  flush()

  return segments
}
