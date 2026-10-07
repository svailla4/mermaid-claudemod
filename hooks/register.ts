import type { Register } from 'claude-code'

import { drawDiagram } from './draw.ts'
import { splitFences } from './fences.ts'

// Cells the transcript takes before a reply's text (the bullet and its gap)
// plus a margin, so drawn lines never touch the edge.
const INDENT = 4
const DEFAULT_COLUMNS = 100

export const STEERING = {
  id: 'mermaid-render:diagrams',
  text: [
    'When a diagram would help (architecture, data flow, a state machine, a sequence of calls, entity relationships),',
    'write it as a fenced ```mermaid block using flowchart, sequenceDiagram, stateDiagram-v2, classDiagram or erDiagram',
    'instead of drawing ASCII art by hand: the terminal renders these blocks as diagrams.',
    'Keep node labels short and prefer `flowchart TD` so the drawing stays under about 100 columns.',
  ].join(' '),
  scope: 'session',
} as const

/** The reply's markdown with each diagram fence replaced by its drawing. */
export function renderReply(text: string, width: number): string | undefined {
  const segments = splitFences(text)
  if (!segments.some(s => s.kind === 'mermaid')) return undefined

  return segments
    .map(s => {
      if (s.kind === 'md') return s.text

      const drawn = drawDiagram(s.source, width)
      if (drawn.ok) return '```\n' + drawn.art + '\n```'

      // Only a fence that said `mermaid` gets a note; an unlabeled one that
      // merely looked like a diagram stays exactly as written.
      return s.isLabeled ? `${s.raw}\n*mermaid: not drawn (${drawn.error})*` : s.raw
    })
    .join('\n')
}

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!e.surfaces.includes('terminal')) return result

    return { sections: [...result.sections.filter(s => s.id !== STEERING.id), STEERING] }
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    // The desktop and editor draw their own way; a summary row keeps its mark.
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)

    const width = Math.max(40, (e.viewport?.columns ?? DEFAULT_COLUMNS) - INDENT)
    const text = renderReply(e.props.text, width)

    return text === undefined ? next(e) : next({ ...e, props: { ...e.props, text } })
  })
}
