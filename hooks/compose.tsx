// Compose a planned reply into what the terminal draws: the engine draws the
// markdown, as it draws any reply, and each wide diagram sits in a bordered
// scroll box between those runs.

import type { Elements, RenderElement } from 'claude-code'

import type { Part } from './plan.ts'

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
}

export async function composeReply(
  parts: Part[],
  // Resolved only when a box is drawn, as resolving runs other plugins' hooks.
  elements: () => Pick<Elements['terminal'], 'Box' | 'Client'>,
  drawText: DrawText,
  layout: Layout,
): Promise<RenderElement> {
  // Every diagram fits: one markdown run, drawn as the reply would be.
  if (!parts.some(p => p.kind === 'wide')) {
    const text = parts.map(p => (p.kind === 'text' ? p.text : '')).join('\n')
    return drawText(text, layout.isFirstOfReply)
  }

  const { Box, Client } = elements()
  const children = []
  let isFirst = layout.isFirstOfReply
  let boxes = 0

  for (const part of parts) {
    if (part.kind === 'text') {
      if (part.text.trim() === '') continue
      children.push(await drawText(part.text, isFirst))
      isFirst = false
      continue
    }
    children.push(
      <Box borderStyle="round" flexDirection="column" marginLeft={2} width={layout.width}>
        <Client
          key={`diagram-${boxes++}`}
          module="./viewer.tsx"
          props={{ lines: part.lines, width: part.width, canScroll: layout.canScroll }}
          width="100%"
          height={Math.min(part.lines.length, layout.maxRows) + 1}
        />
      </Box>,
    )
  }

  return <Box flexDirection="column">{children}</Box>
}
