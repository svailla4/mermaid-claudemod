// Compose a planned reply into what the terminal draws: the engine draws the
// markdown, as it draws any reply, and each diagram sits between those runs,
// drawn in color in place, or in a scroll box when too wide for that.

import type { Elements, RenderElement } from 'claude-code'

import { paintFor, paintLine } from './paint.ts'
import type { Diagram, Part } from './plan.ts'
import type { ViewerProps } from './viewer.tsx'

/** Draws a run of the reply's markdown the engine's way. */
export type DrawText = (text: string, isFirstOfReply: boolean) => Promise<RenderElement>

export type Layout = {
  /** Cells a diagram may take. */
  width: number
  /** Most rows a scroll box shows. */
  maxRows: number
  /** Whether mouse and keys reach a scroll box (the fullscreen layout only). */
  canScroll: boolean
  isFirstOfReply: boolean
  /** The transcript's reply bullet, drawn for a reply that opens with a diagram. */
  bullet: string
}

type Terminal = Pick<Elements['terminal'], 'Box' | 'Client' | 'Text'>

// Cells left of a reply's text: the bullet and its gap.
const INSET = 2
// A scroll box's props cross to its drawing thread as JSON, at most 100,000 characters.
const MAX_PROPS = 95_000

/** The props of a scroll box: colors dropped, then rows, until they fit. */
export function viewerProps(part: Pick<Diagram, 'lines' | 'width' | 'title'>, canScroll: boolean): ViewerProps {
  const props: ViewerProps = { lines: part.lines, width: part.width, title: part.title, canScroll }
  if (JSON.stringify(props).length <= MAX_PROPS) return props

  props.lines = part.lines.map(l => ({ text: l.text, roles: '' }))
  let size = JSON.stringify(props).length
  while (size > MAX_PROPS && props.lines.length > 1) size -= JSON.stringify(props.lines.pop()).length + 1
  return props
}

export async function composeReply(
  parts: Part[],
  // Resolved only when a diagram is drawn, as resolving runs other plugins' hooks.
  elements: () => Terminal,
  drawText: DrawText,
  layout: Layout,
): Promise<RenderElement> {
  if (!parts.some(p => p.kind === 'diagram')) {
    const text = parts.map(p => (p.kind === 'text' ? p.text : '')).join('\n')
    return drawText(text, layout.isFirstOfReply)
  }

  const { Box, Client, Text } = elements()
  const shown = parts.filter(p => p.kind === 'diagram' || p.text.trim() !== '')
  const children: RenderElement[] = []
  let isFirst = layout.isFirstOfReply
  let boxes = 0

  for (const [i, part] of shown.entries()) {
    if (part.kind === 'text') {
      children.push(await drawText(part.text, isFirst))
      isFirst = false
      continue
    }

    const paint = paintFor(part.lines)
    if (part.fits && paint === 'none') {
      // Too big for a tree: the engine draws it as a plain block.
      children.push(await drawText('```\n' + part.lines.map(l => l.text).join('\n') + '\n```', isFirst))
      isFirst = false
      continue
    }

    // Air between a diagram and the text around it, which ends and starts flush.
    const margins = { marginTop: i > 0 ? 1 : 0, marginBottom: shown[i + 1]?.kind === 'text' ? 1 : 0 }
    const drawing = part.fits ? (
      <Box flexDirection="column">{part.lines.map(l => paintLine(Text, l, paint))}</Box>
    ) : (
      // Its frame is the viewer's own, so the title and status sit on it.
      <Client
        key={`diagram-${boxes++}`}
        module="./viewer.tsx"
        props={viewerProps(part, layout.canScroll)}
        width={layout.width}
        height={Math.min(part.lines.length, layout.maxRows) + 2}
      />
    )

    // A reply that opens with a diagram still opens with its bullet.
    children.push(
      <Box flexDirection="row" {...margins}>
        <Box minWidth={INSET} flexShrink={0}>
          {isFirst ? <Text color="text">{layout.bullet}</Text> : ' '}
        </Box>
        {drawing}
      </Box>,
    )
    isFirst = false
  }

  return <Box flexDirection="column">{children}</Box>
}
