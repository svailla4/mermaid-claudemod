// A scroll box for one drawing too big for its place in the transcript: a
// framed window onto the drawing, its kind on the top edge and where it
// looks on the bottom one, that pans by dragging, or by keys once clicked.
//
// Runs as a surface module (a `Client`): on the drawing thread, no `$`, its
// own state kept across the plugin's redraws.

import type { ClientModule } from 'claude-code'

import { paintLine } from './paint.ts'
import { cellsOf, joinLines, padLine, plain, ROLE, sliceLine, span, styled, widthOf } from './styled.ts'
import type { StyledLine } from './styled.ts'

export type ViewerProps = { lines: StyledLine[]; width: number; title: string; canScroll: boolean }

type Drag = { px: number; py: number; x: number; y: number }
type ViewerState = { x: number; y: number; drag?: Drag }

const KEY_STEP = 8
// The frame takes a row above and below the drawing and a column each side.
const FRAME = 2

const frame = (s: string) => span(s, ROLE.guide)
const quiet = (s: string) => span(s, ROLE.detail)

/** Cells an edge has for its text, between its lead and its corner. */
const roomOf = (inner: number) => Math.max(0, inner - 3)

/** An edge of the frame with `text` set into it after a short lead: `╭─ text ───╮`. */
function edge(left: string, text: string, right: string, inner: number): StyledLine {
  const shown = cellsOf(text).slice(0, roomOf(inner)).join('')
  const rest = inner - 1 - (shown ? widthOf(shown) + 2 : 0)
  return styled(frame(left + '─'), shown ? ' ' : '', quiet(shown), shown ? ' ' : '', frame('─'.repeat(Math.max(0, rest)) + right))
}

/**
 * Where the window looks and how to move it, for the bottom edge: the parts
 * that fit `room`, the hint dropped first.
 */
function status(props: ViewerProps, x: number, y: number, columns: number, rows: number, room: number): string {
  const tall = props.lines.length > rows
  const parts = [
    `◀ ${x + 1}–${Math.min(props.width, x + columns)}/${props.width} ▶`,
    ...(tall ? [`▲ ${y + 1}–${Math.min(props.lines.length, y + rows)}/${props.lines.length} ▼`] : []),
    props.canScroll ? `drag or ←→${tall ? '↑↓' : ''}` : 'fullscreen to scroll',
  ]
  while (parts.length > 1 && widthOf(parts.join(' · ')) > room) parts.pop()
  return parts.join(' · ')
}

const Viewer: ClientModule<ViewerProps, ViewerState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const rows = Math.max(1, surface.rows - FRAME)
  const columns = Math.max(1, surface.columns - FRAME)
  const maxX = Math.max(0, props.width - columns)
  const maxY = Math.max(0, props.lines.length - rows)
  const clampX = (x: number) => Math.max(0, Math.min(maxX, x))
  const clampY = (y: number) => Math.max(0, Math.min(maxY, y))
  const current = (): ViewerState => surface.state ?? { x: 0, y: 0 }
  const moveTo = (x: number, y: number, drag?: Drag) => surface.setState({ x: clampX(x), y: clampY(y), drag })

  surface.onPointer(event => {
    const at = current()
    if (event.type === 'down') moveTo(at.x, at.y, { px: event.x, py: event.y, x: at.x, y: at.y })
    else if (event.type === 'move' && at.drag)
      moveTo(at.drag.x - (event.x - at.drag.px), at.drag.y - (event.y - at.drag.py), at.drag)
    else if (event.type === 'up' && at.drag) moveTo(at.x, at.y)
  })

  surface.onKey(event => {
    const at = current()
    const page = event.shift ? columns : KEY_STEP
    switch (event.key) {
      case 'left':
      case 'h':
        return moveTo(at.x - page, at.y)
      case 'right':
      case 'l':
        return moveTo(at.x + page, at.y)
      case 'up':
      case 'k':
        return moveTo(at.x, at.y - 1)
      case 'down':
      case 'j':
        return moveTo(at.x, at.y + 1)
      case 'pageup':
        return moveTo(at.x, at.y - rows)
      case 'pagedown':
        return moveTo(at.x, at.y + rows)
      case 'home':
      case '0':
        return moveTo(0, 0)
      case 'end':
      case '$':
        return moveTo(maxX, at.y)
    }
  })

  const x = clampX(current().x)
  const y = clampY(current().y)
  const side = styled(frame('│'))
  const body = Array.from({ length: rows }, (_, i) => {
    const l = props.lines[y + i] ?? plain('')
    return joinLines(side, padLine(sliceLine(l, x, x + columns), columns), side)
  })

  return (
    <Box flexDirection="column">
      {paintLine(Text, edge('╭', props.title, '╮', columns))}
      {body.map(l => paintLine(Text, l))}
      {paintLine(Text, edge('╰', status(props, x, y, columns, rows, roomOf(columns)), '╯', columns))}
    </Box>
  )
}

export default Viewer
