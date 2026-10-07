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

/**
 * A reply as drawn: runs of markdown (diagrams that fit already drawn in
 * them), and the diagrams too wide to fit, each shown in a scroll box.
 */
export type Part = { kind: 'text'; text: string } | { kind: 'wide'; lines: string[]; width: number }

/** The reply split into parts, or undefined when it holds no diagram. */
export function planReply(text: string, width: number): Part[] | undefined {
  const segments = splitFences(text)
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

    const drawn = drawDiagram(s.source, width)
    if (!drawn.ok) {
      // Only a fence that said `mermaid` gets a note; an unlabeled one that
      // merely looked like a diagram stays exactly as written.
      pushText(s.isLabeled ? `${s.raw}\n*mermaid: not drawn (${drawn.error})*` : s.raw)
    } else if (!drawn.isCut) {
      pushText('```\n' + drawn.art + '\n```')
    } else {
      parts.push({ kind: 'wide', lines: drawn.lines, width: drawn.fullWidth })
    }
  }

  return parts
}

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!e.surfaces.includes('terminal')) return result

    return { sections: [...result.sections.filter(s => s.id !== STEERING.id), STEERING] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // The desktop and editor draw their own way; a summary row keeps its mark.
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)

    const width = Math.max(40, (e.viewport?.columns ?? DEFAULT_COLUMNS) - INDENT)
    const parts = planReply(e.props.text, width)
    if (parts === undefined) return next(e)

    if (!parts.some(p => p.kind === 'wide')) {
      const text = parts.map(p => (p.kind === 'text' ? p.text : '')).join('\n')
      return next({ ...e, props: { ...e.props, text } })
    }

    // The engine draws the text around each scroll box, as it draws any reply.
    const { Box, Client } = $.ui.resolve(e)
    // Mouse and focus reach the box only in the fullscreen layout.
    const canScroll = e.viewport?.isFullscreen === true
    const maxRows = Math.max(8, (e.viewport?.rows ?? 40) - 12)
    const children = []
    let isFirst = e.props.isFirstOfReply
    let boxes = 0

    for (const part of parts) {
      if (part.kind === 'text') {
        if (part.text.trim() === '') continue
        children.push(await next({ ...e, props: { ...e.props, text: part.text, isFirstOfReply: isFirst } }))
        isFirst = false
        continue
      }
      children.push(
        <Box borderStyle="round" flexDirection="column" marginLeft={2} width={width}>
          <Client
            key={`diagram-${boxes++}`}
            module="./viewer.tsx"
            props={{ lines: part.lines, width: part.width, canScroll }}
            width="100%"
            height={Math.min(part.lines.length, maxRows) + 1}
          />
        </Box>,
      )
    }

    return <Box flexDirection="column">{children}</Box>
  })
}
