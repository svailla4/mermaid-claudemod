// A scroll box for one drawing too big for its place in the transcript: a
// window onto the drawing that pans by dragging, or by keys once clicked.
//
// Runs as a surface module (a `Client`): on the drawing thread, no `$`, its
// own state kept across the plugin's redraws.

import type { ClientModule } from 'claude-code'

export type ViewerProps = { lines: string[]; width: number }

type Drag = { px: number; py: number; x: number; y: number }
type ViewerState = { x: number; y: number; drag?: Drag }

const KEY_STEP = 8

const Viewer: ClientModule<ViewerProps, ViewerState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const rows = Math.max(1, surface.rows - 1)
  const columns = Math.max(1, surface.columns)
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
  const shown = props.lines.slice(y, y + rows)
  const span = `columns ${x + 1}–${Math.min(props.width, x + columns)} of ${props.width}`
  const down = maxY > 0 ? `, rows ${y + 1}–${y + shown.length} of ${props.lines.length}` : ''

  return (
    <Box flexDirection="column">
      {shown.map(line => (
        <Text wrap="truncate-end">{Array.from(line).slice(x, x + columns).join('') || ' '}</Text>
      ))}
      <Text dimColor wrap="truncate-end">
        drag to pan, or click and use ← → ↑ ↓ (Home/End) · {span}
        {down}
      </Text>
    </Box>
  )
}

export default Viewer
