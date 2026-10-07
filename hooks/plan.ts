// Plan a reply: which diagrams are drawn in its markdown and which need a
// scroll box of their own.

import type { Draw } from './draw.ts'
import type { Segment } from './fences.ts'

/**
 * A reply as drawn: runs of markdown (diagrams that fit already drawn in
 * them), and the diagrams too wide to fit, each shown in a scroll box.
 */
export type Part = { kind: 'text'; text: string } | { kind: 'wide'; lines: string[]; width: number }

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
    } else if (drawn.width <= width) {
      pushText('```\n' + drawn.lines.join('\n') + '\n```')
    } else {
      parts.push({ kind: 'wide', lines: drawn.lines, width: drawn.width })
    }
  }

  return parts
}
