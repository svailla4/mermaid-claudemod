// Plan a reply: its runs of markdown, and between them the diagrams, each
// either drawn in place or, too wide for that, in a scroll box.

import type { Draw } from './draw.ts'
import type { Segment } from './fences.ts'
import type { StyledLine } from './styled.ts'

/** A drawn diagram: its lines, the widest's width, its kind, and whether it fits in place. */
export type Diagram = { kind: 'diagram'; lines: StyledLine[]; width: number; title: string; fits: boolean }

/** A reply as drawn: runs of markdown, and the diagrams between them. */
export type Part = { kind: 'text'; text: string } | Diagram

/** The reply's segments as parts, or undefined when they hold no diagram. */
export function planReply(segments: Segment[], width: number, draw: Draw): Part[] | undefined {
  if (!segments.some(s => s.kind === 'mermaid')) return undefined

  const parts: Part[] = []
  const pushText = (t: string) => {
    const last = parts[parts.length - 1]
    if (last?.kind === 'text') last.text += '\n' + t
    else parts.push({ kind: 'text', text: t })
  }

  for (const s of segments) {
    if (s.kind === 'md') {
      pushText(s.text)
      continue
    }

    const drawn = draw(s.source, width)
    if (!drawn.ok) {
      // Only a fence that said `mermaid` gets a note; an unlabeled one that
      // merely looked like a diagram stays exactly as written.
      pushText(s.isLabeled ? `${s.raw}\n*mermaid: not drawn (${drawn.error})*` : s.raw)
      continue
    }

    parts.push({
      kind: 'diagram',
      lines: drawn.lines,
      width: drawn.width,
      title: drawn.kind,
      fits: drawn.width <= width,
    })
  }

  return parts
}
