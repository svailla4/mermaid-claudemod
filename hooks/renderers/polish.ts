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
  // A decision's corners join the sides it shares with the box drawn on it.
  ['◇', UP | RIGHT | DOWN | LEFT],
  ['▼', UP],
  ['▲', DOWN],
  ['►', LEFT],
  ['▶', LEFT],
  ['◄', RIGHT],
  ['◀', RIGHT],
])

const armsOf = (c: Cell | undefined) => (c ? (ARMS.get(c.ch) ?? 0) : 0)
const isGlyph = (ch: string) => ch >= '─' && ch <= '╿'

/**
 * A decision's diamond corners come tagged as text and a class member's
 * visibility mark as border: each takes the role it shows.
 */
function retag(grid: Grid): void {
  for (const row of grid) {
    for (const c of row) {
      if (c.ch === '◇') c.role = ROLE.border
      else if (c.role === ROLE.border && !isGlyph(c.ch)) c.role = ROLE.label
    }
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

/**
 * A title the library writes into a frame's top edge right after its corner
 * (`┌loop [x]─────┐`) moves in a little and gets air (`┌─ loop [x] ──┐`),
 * when the edge has the dashes to spare.
 */
function spaceTitles(grid: Grid): void {
  for (const row of grid) {
    for (let x = 0; x + 1 < row.length; x++) {
      if (!'┌╭'.includes(row[x]!.ch) || row[x + 1]!.role !== ROLE.label) continue
      let end = x + 1
      while (end < row.length && row[end]!.role !== ROLE.border) end++
      let dashes = 0
      while (row[end + dashes]?.ch === '─') dashes++
      if (dashes < 3) continue

      const dash = row[end]!
      const title = row.slice(x + 1, end)
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
const isStretch = (row: Cell[]) => row.every(c => c.ch === ' ' || c.ch === '│')

/**
 * The grid without the rows that only stretch it: a run of identical stretch
 * rows keeps one (edges drawn three rows long become one), and a blank row
 * inside boxes, framed by more of them above or below, goes.
 */
function squeeze(grid: Grid): Grid {
  const kept: Grid = []

  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!
    const prev = kept[kept.length - 1]
    if (prev && isStretch(row)) {
      if (textOf(prev) === textOf(row) && rolesOf(prev) === rolesOf(row)) continue
      if (isPadding(row, prev, grid[y + 1])) continue
    }
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
  retag(grid)
  classifyText(grid)
  spaceTitles(grid)
  mendJunctions(grid)
  return squeeze(grid)
}
