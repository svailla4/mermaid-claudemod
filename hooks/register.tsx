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

/** The reply's markdown with each diagram fence replaced by its drawing. */
export function renderReply(text: string, width: number): string | undefined {
  const segments = splitFences(text)
  if (!segments.some(s => s.kind === 'mermaid')) return undefined

  return segments
    .map(s => {
      if (s.kind === 'md') return s.text

      const drawn = drawDiagram(s.source, width)
      if (!drawn.ok) {
        // Only a fence that said `mermaid` gets a note; an unlabeled one that
        // merely looked like a diagram stays exactly as written.
        return s.isLabeled ? `${s.raw}\n*mermaid: not drawn (${drawn.error})*` : s.raw
      }

      const fence = '```\n' + drawn.art + '\n```'
      if (!drawn.isCut) return fence

      const n = numberOf(s.source)
      lastCut = n
      return `${fence}\n*Cut to fit (${drawn.fullWidth} columns): \`/diagram ${n}\` opens it scrollable*`
    })
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

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    // The desktop and editor draw their own way; a summary row keeps its mark.
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)

    const width = Math.max(40, (e.viewport?.columns ?? DEFAULT_COLUMNS) - INDENT)
    const text = renderReply(e.props.text, width)

    return text === undefined ? next(e) : next({ ...e, props: { ...e.props, text } })
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
