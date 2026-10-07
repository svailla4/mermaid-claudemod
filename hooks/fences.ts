// Find Mermaid diagrams in a reply's markdown.
//
// A closed fence is a diagram when its info string says `mermaid`/`mmd`, or
// when it is unlabeled (or `text`) and its first meaningful line is the
// header of a diagram kind the renderer draws. Unclosed fences (a reply still
// streaming) are left alone until they close.

export type Segment =
  | { kind: 'md'; text: string }
  | { kind: 'mermaid'; source: string; raw: string; isLabeled: boolean }

const LABELS = new Set(['mermaid', 'mmd'])
const PLAIN_LABELS = new Set(['', 'text', 'txt', 'plain', 'plaintext'])

// Headers of the kinds beautiful-mermaid's ASCII renderer draws. The keyword
// must be the whole first token: `graph = build()` is code, not a diagram.
const HEADER =
  /^(?:(?:graph|flowchart)(?:\s+(?:TD|TB|BT|LR|RL))?(?:\s*;.*)?|sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?)\s*$/

const OPEN = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/

/** The source with any front matter and leading `%%` comment lines removed. */
export function diagramBody(source: string): string {
  const lines = source.split('\n')
  let i = 0

  while (i < lines.length && lines[i]!.trim() === '') i++

  if (lines[i]?.trim() === '---') {
    const end = lines.findIndex((l, j) => j > i && l.trim() === '---')
    if (end !== -1) i = end + 1
  }

  while (i < lines.length && (lines[i]!.trim() === '' || lines[i]!.trim().startsWith('%%'))) i++

  return lines.slice(i).join('\n')
}

/** Whether a fence's contents begin with a diagram header we can draw. */
export function looksLikeDiagram(source: string): boolean {
  const first = diagramBody(source).split('\n')[0]?.trim() ?? ''

  return HEADER.test(first)
}

/** Splits markdown into text and diagram segments, in order. */
export function splitFences(text: string): Segment[] {
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

    if (isLabeled || (PLAIN_LABELS.has(label) && looksLikeDiagram(source))) {
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
