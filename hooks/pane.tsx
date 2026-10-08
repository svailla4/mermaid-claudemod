// The side pane: the diagrams gathered from plans and replies, one shown at a
// time, `◀` and `▶` (or p and n) to step between them. A drawing wider than
// the pane scrolls in the same box as a reply's.

import type { Elements, RenderElement } from 'claude-code'

import type { Gallery } from '../types'
import { viewerProps } from './compose.tsx'
import type { Draw } from './draw.ts'
import { paintFor, paintLine } from './paint.ts'

/** The pane's id, and the title it opens under. */
export const PANE = 'diagrams'
export const PANE_TITLE = 'Diagrams'

type Terminal = Pick<Elements['terminal'], 'Box' | 'Button' | 'Client' | 'Text'>

/** The pane's body: cells across and rows down, and whether a drawing in it can be panned. */
export type PaneRoom = { columns: number; rows: number; canScroll: boolean }

// The rows the toggle takes above the drawing, the gap under it included.
const TOGGLE_ROWS = 2

/** A short, stable name for a source, so each diagram's scroll box keeps its own place. */
function keyOf(source: string): string {
  let hash = 5381
  for (let i = 0; i < source.length; i++) hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0
  return `diagram-${hash.toString(36)}`
}

/** The pane's tree: the toggle, then the diagram shown, drawn to fit `room`. */
export function drawPane(elements: Terminal, gallery: Gallery, draw: Draw, room: PaneRoom, onStep: (by: number) => void): RenderElement {
  const { Box, Button, Client, Text } = elements
  const shown = gallery.diagrams[gallery.index]
  if (!shown) {
    return <Text dimColor>No diagrams yet. The diagrams of a plan, and of replies, gather here.</Text>
  }

  const count = gallery.diagrams.length
  const toggle = (
    <Box flexDirection="row" marginBottom={1}>
      <Button key="prev" label="◀" hotkey="p" onPress={() => onStep(-1)} />
      <Box flexGrow={1} flexShrink={1} paddingX={1}>
        <Text wrap="truncate-end">
          <Text dimColor>{`${gallery.index + 1}/${count} · `}</Text>
          {shown.title}
          {shown.origin === 'plan' ? <Text dimColor> (plan)</Text> : ''}
        </Text>
      </Box>
      <Button key="next" label="▶" hotkey="n" onPress={() => onStep(1)} />
    </Box>
  )

  const drawn = draw(shown.source, room.columns)
  let body: RenderElement
  if (!drawn.ok) {
    body = <Text dimColor>{`Not drawn: ${drawn.error}`}</Text>
  } else {
    const paint = paintFor(drawn.lines)
    body =
      drawn.width <= room.columns && paint !== 'none' ? (
        <Box flexDirection="column">{drawn.lines.map(l => paintLine(Text, l, paint))}</Box>
      ) : (
        <Client
          key={keyOf(shown.source)}
          module="./viewer.tsx"
          props={viewerProps({ lines: drawn.lines, width: drawn.width, title: drawn.kind }, room.canScroll)}
          width={room.columns}
          height={Math.max(4, Math.min(drawn.lines.length + 2, room.rows - TOGGLE_ROWS))}
        />
      )
  }

  return (
    <Box flexDirection="column">
      {toggle}
      {body}
    </Box>
  )
}
