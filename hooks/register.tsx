import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { DiagramView } from '../types'
import { drawDiagram } from './draw.ts'
import { splitFences } from './fences.ts'

// Cells the transcript takes before a reply's text (the bullet and its gap)
// plus a margin, so drawn lines never touch the edge.
const INDENT = 4
const DEFAULT_COLUMNS = 100

const PANE = 'mermaid-diagram'
const STEP = 20
const view = atom({ plugin: 'mermaid-render', key: 'view' } as const, null as DiagramView | null)

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

// Every diagram drawn in this session gets a number, in the order first
// seen, so `/diagram <n>` can open it; a reload numbers them again as the
// transcript redraws.
const numbers = new Map<string, number>()
const sources: string[] = []
let lastCut: number | undefined

function numberOf(source: string): number {
  let n = numbers.get(source)
  if (n === undefined) {
    sources.push(source)
    n = sources.length
    numbers.set(source, n)
  }
  return n
}

/**
 * A reply as drawn: runs of markdown (fitting diagrams already drawn in
 * them), and the diagrams too wide to fit, which the caller shows in a scroll
 * box where it can, else cut with a hint.
 */
export type Part = { kind: 'text'; text: string } | { kind: 'wide'; n: number; lines: string[]; width: number; art: string }

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
      const n = numberOf(s.source)
      lastCut = n
      parts.push({ kind: 'wide', n, lines: drawn.lines, width: drawn.fullWidth, art: drawn.art })
    }
  }

  return parts
}

/** A wide diagram as text: cut to fit, with the command that scrolls it. */
function cutWithHint(part: Extract<Part, { kind: 'wide' }>): string {
  return '```\n' + part.art + `\n\`\`\`\n*Cut to fit (${part.width} columns): \`/diagram ${part.n}\` opens it scrollable*`
}

/** The reply's markdown with each diagram fence replaced by its drawing. */
export function renderReply(text: string, width: number): string | undefined {
  return planReply(text, width)
    ?.map(p => (p.kind === 'text' ? p.text : cutWithHint(p)))
    .join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'diagram',
      description: 'Open a Mermaid diagram from this session in a pane you can scroll sideways: /diagram [n]',
    })
    return next(e)
  })

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

    // Mouse and focus reach a scroll box only in the fullscreen layout; on the
    // main screen a wide diagram is cut, with /diagram to scroll it.
    if (!e.viewport?.isFullscreen || !parts.some(p => p.kind === 'wide')) {
      const text = parts.map(p => (p.kind === 'text' ? p.text : cutWithHint(p))).join('\n')
      return next({ ...e, props: { ...e.props, text } })
    }

    // The engine draws the text around each scroll box, as it draws any reply.
    const { Box, Client } = $.ui.resolve(e)
    const maxRows = Math.max(8, (e.viewport.rows ?? 40) - 12)
    const children = []
    let isFirst = e.props.isFirstOfReply

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
            key={`diagram-${part.n}`}
            module="./viewer.tsx"
            props={{ lines: part.lines, width: part.width }}
            width="100%"
            height={Math.min(part.lines.length, maxRows) + 1}
          />
        </Box>,
      )
    }

    return <Box flexDirection="column">{children}</Box>
  })

  on('command.run', { command: 'diagram' }, async ($, e) => {
    const asked = e.args.trim()
    const n = asked === '' ? (lastCut ?? sources.length) : Number(asked)
    const source = Number.isInteger(n) ? sources[n - 1] : undefined

    if (source === undefined) {
      const known = sources.length === 0 ? 'none cut to fit yet' : `1 to ${sources.length}`
      return { text: `No diagram ${asked || 'to open'} (diagrams this session: ${known}).` }
    }

    await update($, view, () => ({ n, source, offset: 0 }))
    const opened = await $.ui.open({ id: PANE, title: `Diagram ${n}`, focus: true, closeOnEscape: true })

    return {
      text: opened.isPlaced
        ? `Diagram ${n} opened: h/l scroll sideways, 0 back to the start, Esc closes.`
        : `Diagram ${n} could not open: ${opened.reason}.`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const shown = await read($, view)
    if (!shown) return <Text dimColor>No diagram open. Use /diagram [n].</Text>

    const width = Math.max(20, e.props.bodyColumns || DEFAULT_COLUMNS)
    const drawn = drawDiagram(shown.source, width)
    if (!drawn.ok) return <Text>mermaid: {drawn.error}</Text>

    const last = Math.max(0, drawn.fullWidth - STEP)
    const offset = Math.min(shown.offset, last)
    const move = (to: (offset: number) => number) =>
      update($, view, v => (v ? { ...v, offset: Math.max(0, Math.min(last, to(Math.min(v.offset, last)))) } : v))

    return (
      <Box flexDirection="column">
        <Box>
          <Button key="left" hotkey="h" label="◀ left" onPress={() => move(o => o - STEP)} />
          <Text> </Text>
          <Button key="right" hotkey="l" label="right ▶" onPress={() => move(o => o + STEP)} />
          <Text> </Text>
          <Button key="start" hotkey="0" label="start" onPress={() => move(() => 0)} />
          <Text dimColor>
            {'  '}column {offset + 1} of {drawn.fullWidth}
          </Text>
        </Box>
        <Text> </Text>
        {drawn.lines.map(line => (
          <Text wrap="truncate-end">{Array.from(line).slice(offset).join('') || ' '}</Text>
        ))}
      </Box>
    )
  })
}
