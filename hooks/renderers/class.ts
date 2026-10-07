// Class diagrams, drawn by the library, with each class's name as a heading.

import type { DiagramRenderer } from '../diagram.ts'
import { cellsOf, ROLE } from '../styled.ts'
import type { StyledLine } from '../styled.ts'
import { drawAscii } from './ascii.ts'

/**
 * The lines with each class's header (its name, and a `<<stereotype>>` over
 * it) styled as a heading: the label rows of a box above its first `├`
 * divider, where its members start.
 */
function headClasses(lines: StyledLine[]): StyledLine[] {
  const grid = lines.map(l => cellsOf(l.text))

  // Whether the box side at (x, y) runs up to the box's top corner unbroken.
  const isHeader = (x: number, y: number) => {
    let up = y - 1
    while (up >= 0 && grid[up]![x] === '│') up--
    return grid[up]?.[x] === '┌'
  }

  return lines.map((l, y) => {
    const cells = grid[y]!
    // The column of the nearest box side to the left, carried along the row.
    let side = -1
    let header = false
    const roles = Array.from(l.roles, (r, x) => {
      if (cells[x] === '│') {
        side = x
        header = isHeader(x, y)
      }
      return r === ROLE.label && side >= 0 && header ? ROLE.heading : r
    })
    return { text: l.text, roles: roles.join('') }
  })
}

export const classDiagram: DiagramRenderer = {
  kind: 'classDiagram',
  matches: header => /^classDiagram\s*$/.test(header),
  draw: (body, width) => headClasses(drawAscii(body, width)),
}
