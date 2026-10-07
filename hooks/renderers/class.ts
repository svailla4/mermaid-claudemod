// Class diagrams, drawn by the library, with each class's name as a heading.

import type { DiagramRenderer } from '../diagram.ts'
import { cellsOf, ROLE } from '../styled.ts'
import type { StyledLine } from '../styled.ts'
import { drawAscii } from './ascii.ts'

/**
 * The lines with each class's name row styled as a heading: the row right
 * under a box's top corner (member rows sit under a `├` divider instead).
 */
function headClasses(lines: StyledLine[]): StyledLine[] {
  return lines.map((l, i) => {
    const above = i > 0 ? cellsOf(lines[i - 1]!.text) : []
    const cells = cellsOf(l.text)
    // The column of the nearest box side to the left, carried along the row.
    let side = -1
    const roles = Array.from(l.roles, (r, x) => {
      if (cells[x] === '│') side = x
      return r === ROLE.label && side >= 0 && above[side] === '┌' ? ROLE.heading : r
    })
    return { text: l.text, roles: roles.join('') }
  })
}

export const classDiagram: DiagramRenderer = {
  kind: 'classDiagram',
  matches: header => /^classDiagram\s*$/.test(header),
  draw: (body, width) => headClasses(drawAscii(body, width)),
}
