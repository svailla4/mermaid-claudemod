// How each role looks in the terminal, and styled lines turned into Text
// elements. Colors are theme keys, so a drawing follows the person's theme,
// light or dark.

import type { Elements, RenderElement, TextProps } from 'claude-code'

import { ROLE, spansOf } from './styled.ts'
import type { Role, StyledLine } from './styled.ts'

/**
 * The look of each role; a role without one is drawn in the text's own color.
 * Frames step back so labels and edges lead; edge text is quiet and slanted
 * so it never reads as a node.
 */
export const LOOK: Partial<Record<Role, TextProps>> = {
  [ROLE.border]: { color: 'inactive' },
  [ROLE.edge]: { color: 'suggestion' },
  [ROLE.arrow]: { color: 'suggestion', bold: true },
  [ROLE.edgeLabel]: { dimColor: true, italic: true },
  [ROLE.guide]: { color: 'subtle' },
  [ROLE.heading]: { color: 'claude', bold: true },
  [ROLE.primaryKey]: { color: 'warning', bold: true },
  [ROLE.foreignKey]: { color: 'suggestion', bold: true },
  [ROLE.uniqueKey]: { color: 'merged', bold: true },
  [ROLE.detail]: { color: 'inactive' },
  [ROLE.comment]: { color: 'inactive', italic: true },
}

/** The `Text` constructor of the surface drawing the lines. */
export type TextElement = Elements['terminal']['Text']

/** Whether lines are drawn with their colors, as plain text, or not as a tree at all. */
export type Paint = 'color' | 'plain' | 'none'

// A tree may hold 20,000 nodes and 100,000 characters serialized; these leave
// room for the rest of the reply and for each node's own wrapping.
const MAX_NODES = 12_000
const MAX_CHARS = 80_000
const CHARS_PER_NODE = 60

const colored = (l: StyledLine) => spansOf(l).filter(s => LOOK[s.role] !== undefined).length

/** How the lines can be drawn as a tree within its bounds. */
export function paintFor(lines: readonly StyledLine[]): Paint {
  const text = lines.reduce((n, l) => n + l.text.length, 0)
  const fits = (nodes: number) => nodes <= MAX_NODES && text + nodes * CHARS_PER_NODE <= MAX_CHARS
  if (fits(lines.reduce((n, l) => n + 1 + colored(l), 0))) return 'color'
  if (fits(lines.length)) return 'plain'
  return 'none'
}

/** One line as a Text: its colored runs nested, uncolored runs as bare strings. */
export function paintLine(Text: TextElement, l: StyledLine, paint: Paint = 'color'): RenderElement {
  const children =
    paint === 'color'
      ? spansOf(l).map(s => {
          const look = LOOK[s.role]
          return look ? Text({ ...look, children: s.text }) : s.text
        })
      : [l.text]
  // An empty Text draws no row; a space keeps a blank line's place.
  return Text({ wrap: 'truncate-end', children: l.text === '' ? ' ' : children })
}
