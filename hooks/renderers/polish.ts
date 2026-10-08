// Tidy a drawing of the library's on its character grid: give each cell the
// role it shows, mend the junctions it leaves broken and drop the rows that
// only stretch it.

import { ROLE } from '../styled.ts'
import type { Role } from '../styled.ts'

/** One cell of a drawing. */
export type Cell = { ch: string; role: Role }
export type Grid = Cell[][]

const UP = 1
const RIGHT = 2
const DOWN = 4
const LEFT = 8
const OPPOSITE: Record<number, number> = { [UP]: DOWN, [DOWN]: UP, [LEFT]: RIGHT, [RIGHT]: LEFT }
const STEP: Array<[number, number, number]> = [
  [UP, 0, -1],
  [RIGHT, 1, 0],
  [DOWN, 0, 1],
  [LEFT, -1, 0],
]

// The light glyphs whose arms can be redrawn, by the arms they have.
const GLYPH: Record<number, string> = {
  [LEFT | RIGHT]: '─',
  [UP | DOWN]: '│',
  [RIGHT | DOWN]: '┌',
  [LEFT | DOWN]: '┐',
  [UP | RIGHT]: '└',
  [UP | LEFT]: '┘',
  [UP | DOWN | RIGHT]: '├',
  [UP | DOWN | LEFT]: '┤',
  [LEFT | RIGHT | DOWN]: '┬',
  [LEFT | RIGHT | UP]: '┴',
  [UP | DOWN | LEFT | RIGHT]: '┼',
}
const REDRAWN = new Map(Object.entries(GLYPH).map(([arms, ch]) => [ch, Number(arms)]))

// Every glyph that reaches out of its cell, for reading what touches a cell.
const ARMS = new Map<string, number>([
  ...REDRAWN,
  ['╭', RIGHT | DOWN],
  ['╮', LEFT | DOWN],
  ['╰', UP | RIGHT],
  ['╯', UP | LEFT],
  ['╌', LEFT | RIGHT],
  ['┄', LEFT | RIGHT],
  ['┈', LEFT | RIGHT],
  ['╎', UP | DOWN],
  ['┆', UP | DOWN],
  ['┊', UP | DOWN],
  // A shape's corners join the sides it shares with the box drawn on it.
  ...Array.from('◇◯()⌜⌝⌞⌟', (ch): [string, number] => [ch, UP | RIGHT | DOWN | LEFT]),
  ['▼', UP],
  ['▲', DOWN],
  ['►', LEFT],
  ['▶', LEFT],
  ['◄', RIGHT],
  ['◀', RIGHT],
])

const armsOf = (c: Cell | undefined) => (c ? (ARMS.get(c.ch) ?? 0) : 0)

// A class member's visibility marks, which the library draws as frame.
const VISIBILITY = '+-#~'
// The corners of decisions, circles, stadiums and hexagons.
const SHAPE_CORNERS = '◇◯()⌜⌝⌞⌟'

/**
 * Cells take the role they show: a shape's corners come tagged as text, and
 * are frame wherever a frame's edge runs from them; a class member's
 * visibility mark comes tagged as frame, and is text.
 */
function retag(grid: Grid): void {
  for (const row of grid) {
    row.forEach((c, x) => {
      const isEdgeOfFrame = (n: Cell | undefined) => n?.ch === '─' && n.role === ROLE.border
      const isCorner = SHAPE_CORNERS.includes(c.ch) && (isEdgeOfFrame(row[x - 1]) || isEdgeOfFrame(row[x + 1]))
      if (c.role === ROLE.label && isCorner) c.role = ROLE.border
      else if (c.role === ROLE.border && VISIBILITY.includes(c.ch)) c.role = ROLE.label
    })
  }
}

/**
 * Text between two pieces of a frame on its row is a node's label; any other
 * text (beside a line, under a junction, between lifelines) labels an edge.
 */
function classifyText(grid: Grid): void {
  for (const row of grid) {
    // The role of the nearest non-space, non-text cell to the left, carried along.
    let left: Role = ROLE.plain
    for (let x = 0; x < row.length; x++) {
      const c = row[x]!
      if (c.role !== ROLE.label) {
        if (c.ch !== ' ') left = c.role
        continue
      }
      let end = x
      while (end < row.length && (row[end]!.role === ROLE.label || row[end]!.ch === ' ')) end++
      const right = row[end]?.role ?? ROLE.plain
      const role = left === ROLE.border && right === ROLE.border ? ROLE.label : ROLE.edgeLabel
      for (let i = x; i < end; i++) if (row[i]!.role === ROLE.label) row[i]!.role = role
      x = end - 1
    }
  }
}

// The dashes a frame's edge or a divider is drawn with.
const DASHES = '─╌'

/**
 * A title the library writes into a frame's edge right after its corner
 * (`┌loop [x]─────┐`, `├[else]╌╌╌╌┤`) is a label on a frame, dashes and
 * all, and moves in a little with air around it (`┌─ loop [x] ──┐`) when
 * the edge has dashes to spare.
 */
function spaceTitles(grid: Grid): void {
  for (const row of grid) {
    for (let x = 0; x + 1 < row.length; x++) {
      const isText = (c: Cell | undefined) => c?.role === ROLE.label || c?.role === ROLE.edgeLabel
      if (!'┌╭├'.includes(row[x]!.ch) || !isText(row[x + 1])) continue
      let end = x + 1
      while (end < row.length && (isText(row[end]) || row[end]!.ch === ' ')) end++
      const dash = row[end]
      if (!dash || !DASHES.includes(dash.ch)) continue

      const title = row.slice(x + 1, end)
      for (const c of title) if (c.ch !== ' ') c.role = ROLE.label
      let dashes = 0
      while (row[end + dashes]?.ch === dash.ch) row[end + dashes++]!.role = ROLE.border
      if (dashes < 3) continue

      const gap: Cell = { ch: ' ', role: ROLE.plain }
      const rest = Array.from({ length: dashes - 3 }, () => ({ ...dash }))
      row.splice(x + 1, end + dashes - x - 1, { ...dash }, gap, ...title, { ...gap }, ...rest)
    }
  }
}

/**
 * Where a line meets another, a corner the library left (`┌───└───┐`) becomes
 * the junction the lines show (`┌───┴───┐`), and a box side an edge leaves
 * from gets its junction too (`└───┬───┘`). A frame an edge only crosses (a
 * loop over a lifeline) is left crossed.
 */
function mendJunctions(grid: Grid): void {
  const at = (x: number, y: number) => grid[y]?.[x]
  const mended: Array<[Cell, string]> = []
  // Whether the cell beside (x, y) in `dir` is an edge reaching into it.
  const reaches = (x: number, y: number, dir: number, roles: readonly Role[]) => {
    const [, dx, dy] = STEP.find(s => s[0] === dir)!
    const n = at(x + dx, y + dy)
    return n !== undefined && roles.includes(n.role) && (armsOf(n) & OPPOSITE[dir]!) !== 0
  }

  grid.forEach((row, y) =>
    row.forEach((c, x) => {
      const own = REDRAWN.get(c.ch)
      if (own === undefined || (c.role !== ROLE.edge && c.role !== ROLE.border)) return
      const isFrame = c.role === ROLE.border
      let arms = own
      for (const [dir] of STEP) {
        if (arms & dir) continue
        if (isFrame) {
          if (reaches(x, y, dir, [ROLE.edge]) && !reaches(x, y, OPPOSITE[dir]!, [ROLE.edge])) arms |= dir
        } else if (reaches(x, y, dir, [ROLE.edge, ROLE.arrow])) arms |= dir
      }
      if (arms !== own && GLYPH[arms]) mended.push([c, GLYPH[arms]!])
    }),
  )

  // Applied after reading, so one mend never feeds another.
  for (const [c, ch] of mended) c.ch = ch
}

const textOf = (row: Cell[]) => row.map(c => c.ch).join('')
const rolesOf = (row: Cell[]) => row.map(c => c.role).join('')

/** A row holding only vertical strokes: it stretches what crosses it and says nothing. */
const isStretch = (row: Cell[]) => row.every(c => ' │┆┊'.includes(c.ch))

/** A row holding only box sides and dividers, as an empty class section leaves twice. */
const isDivider = (row: Cell[]) => row.some(c => c.ch === '├') && row.every(c => ' │├─┤'.includes(c.ch))

/**
 * The grid without the rows that only stretch it: a run of identical stretch
 * or divider rows keeps one (edges drawn three rows long become one), and a
 * blank row inside boxes, framed by more of them above or below, goes.
 */
function squeeze(grid: Grid): Grid {
  const kept: Grid = []

  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!
    const prev = kept[kept.length - 1]
    const isRepeat = prev !== undefined && textOf(prev) === textOf(row) && rolesOf(prev) === rolesOf(row)
    if (isRepeat && (isStretch(row) || isDivider(row))) continue
    if (prev && isStretch(row) && isPadding(row, prev, grid[y + 1])) continue
    kept.push(row)
  }

  return kept
}

const VERTICAL = UP | DOWN
const runsThrough = (c: Cell | undefined) => (armsOf(c) & VERTICAL) === VERTICAL

/**
 * Whether a stretch row is only the inside of boxes: it crosses a box side,
 * and every stroke runs on above and below, with a side rather than two
 * corners around it, so no box closes up empty.
 */
function isPadding(row: Cell[], above: Cell[], below: Cell[] | undefined): boolean {
  if (!below || !row.some(c => c.role === ROLE.border)) return false
  return row.every((c, x) => {
    if (c.ch === ' ') return true
    const up = above[x]
    const down = below[x]
    return (armsOf(up) & DOWN) !== 0 && (armsOf(down) & UP) !== 0 && (runsThrough(up) || runsThrough(down))
  })
}

/** The grid tidied: roles retagged, text told apart, junctions mended, stretch rows dropped. */
export function polish(grid: Grid): Grid {
  // Titles first, while they are still apart from the shape corners retagged next.
  spaceTitles(grid)
  retag(grid)
  classifyText(grid)
  mendJunctions(grid)
  return squeeze(grid)
}
