// Inline diagrams into markdown, for a row the mod cannot draw a tree of its
// own in (an approved plan): each diagram that fits becomes a plain block of
// box art the engine draws with the text around it.

import type { Draw } from './draw.ts'
import type { Segment } from './fences.ts'

/** The markdown with its diagrams drawn, or undefined when it holds none. */
export function inlineDiagrams(segments: Segment[], width: number, draw: Draw): string | undefined {
  if (!segments.some(s => s.kind === 'mermaid')) return undefined

  return segments
    .map(s => {
      if (s.kind === 'md') return s.text

      // A plain block wraps what is too wide, so that one keeps its source.
      const drawn = draw(s.source, width)
      if (!drawn.ok || drawn.width > width) return s.raw
      return '```\n' + drawn.lines.map(l => l.text).join('\n') + '\n```'
    })
    .join('\n')
}
