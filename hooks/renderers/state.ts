// State diagrams, reshaped first into what the library draws well.

import type { DiagramRenderer } from '../diagram.ts'
import { cellsOf, plain, ROLE, span, styled, tidyLines } from '../styled.ts'
import type { Role, StyledLine } from '../styled.ts'
import { drawAscii } from './ascii.ts'
import type { Cell, Grid } from './polish.ts'

const SELF_LOOP = /^\s*([\w.-]+)\s*-->\s*([\w.-]+)\s*(?::\s*(.*))?$/

/** A transition from a state back to itself. */
type Loop = { state: string; label: string }

/**
 * A state diagram as the renderer draws it well: top-level `[*]` become
 * `Start` and `End` states (the renderer draws them as empty boxes), and
 * self-transitions are taken out (it routes them as long detours) to be drawn
 * on their state's box afterwards.
 */
function prepareState(body: string): { body: string; loops: Loop[] } {
  const loops: Loop[] = []
  const usesStart = /\bStart\b/.test(body)
  const usesEnd = /\bEnd\b/.test(body)
  let depth = 0

  const lines = body.split('\n').flatMap(line => {
    const atTop = depth === 0
    depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0)
    if (!atTop) return [line]

    const loop = SELF_LOOP.exec(line)
    if (loop && loop[1] === loop[2]) {
      loops.push({ state: loop[1]!, label: loop[3]?.trim() ?? '' })
      return []
    }

    let out = line
    if (!usesStart) out = out.replace(/^(\s*)\[\*\](\s*-->)/, '$1Start$2')
    if (!usesEnd) out = out.replace(/(-->\s*)\[\*\](\s*(?::.*)?)$/, '$1End$2')
    return [out]
  })

  return { body: lines.join('\n'), loops }
}

const gridOf = (lines: readonly StyledLine[]): Grid =>
  lines.map(l => cellsOf(l.text).map((ch, x) => ({ ch, role: (l.roles[x] ?? ROLE.plain) as Role })))

const linesOf = (grid: Grid): StyledLine[] =>
  tidyLines(grid.map(row => ({ text: row.map(c => c.ch).join(''), roles: row.map(c => c.role).join('') })))

const REACHES_DOWN = '│┆┊╎┬┼├┤╭╮┌┐'
const REACHES_UP = '│┆┊╎┴┼├┤╰╯└┘▼'

/** Adds a row under row `y` that runs on every stroke crossing between it and the next. */
function stretchBelow(grid: Grid, y: number): void {
  const below = grid[y + 1] ?? []
  const row = grid[y]!.map((c, x): Cell => {
    const runsOn = REACHES_DOWN.includes(c.ch) && REACHES_UP.includes(below[x]?.ch ?? ' ')
    return runsOn ? { ch: '┆┊╎'.includes(c.ch) ? c.ch : '│', role: c.role } : { ch: ' ', role: ROLE.plain }
  })
  grid.splice(y + 1, 0, row)
}

/** The row of the box labeled `state`, its right side, and the bottom of that side. */
function boxOf(grid: Grid, state: string): { y: number; x: number; bottom: number } | undefined {
  const name = cellsOf(state)
  const sideAt = (x: number, y: number) => '│├┤'.includes(grid[y]?.[x]?.ch ?? ' ')
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!
    for (let x = 0; x + name.length <= row.length; x++) {
      const isName = name.every((ch, i) => row[x + i]!.ch === ch && row[x + i]!.role === ROLE.label)
      if (!isName || row[x - 1]?.ch !== ' ' || row[x + name.length]?.ch !== ' ') continue
      let side = x + name.length
      while (side < row.length && row[side]!.ch === ' ') side++
      if (row[side]?.ch !== '│' || row[side]!.role !== ROLE.border) continue
      let top = y - 1
      while (top >= 0 && sideAt(side, top)) top--
      let bottom = y + 1
      while (bottom < grid.length && sideAt(side, bottom)) bottom++
      if ('╮┐'.includes(grid[top]?.[side]?.ch ?? ' ') && '╯┘'.includes(grid[bottom]?.[side]?.ch ?? ' ')) {
        return { y, x: side, bottom }
      }
    }
  }
  return undefined
}

/**
 * Draws a self-transition as a loop off the right side of its state's box,
 * its label beside it (`├─╮ save` over `│◄╯`), giving the box a second row
 * when it has only one. False, the grid left as it was, when the box isn't
 * found or the cells right of it are taken.
 */
function drawLoop(grid: Grid, loop: Loop): boolean {
  const found = boxOf(grid, loop.state)
  if (!found) return false
  const { y, x } = found
  const label = loop.label ? cellsOf(` ${loop.label}`) : []
  const isFree = (row: number, from: number, to: number) => {
    for (let i = from; i <= to; i++) if ((grid[row]?.[i]?.ch ?? ' ') !== ' ') return false
    return true
  }

  if (!isFree(y, x + 1, x + 2 + label.length)) return false
  const hasRoom = found.bottom > y + 1
  if (!hasRoom) stretchBelow(grid, y)
  if (grid[y + 1]![x]!.ch !== '│' || !isFree(y + 1, x + 1, x + 2)) {
    if (!hasRoom) grid.splice(y + 1, 1)
    return false
  }

  const put = (px: number, py: number, ch: string, role: Role) => {
    const row = grid[py]!
    while (row.length < px) row.push({ ch: ' ', role: ROLE.plain })
    row[px] = { ch, role }
  }
  put(x, y, '├', ROLE.border)
  put(x + 1, y, '─', ROLE.edge)
  put(x + 2, y, '╮', ROLE.edge)
  label.forEach((ch, i) => put(x + 3 + i, y, ch, ch === ' ' ? ROLE.plain : ROLE.edgeLabel))
  put(x + 1, y + 1, '◄', ROLE.arrow)
  put(x + 2, y + 1, '╯', ROLE.edge)
  return true
}

export const state: DiagramRenderer = {
  kind: 'stateDiagram',
  matches: header => /^stateDiagram(?:-v2)?\s*$/.test(header),
  draw(body, width) {
    const prepared = prepareState(body)
    const grid = gridOf(drawAscii(prepared.body, width))
    // A loop with no room on the drawing is noted under it instead.
    const notes = prepared.loops
      .filter(loop => !drawLoop(grid, loop))
      .map(loop =>
        styled(span('↻', ROLE.arrow), ' ', span(loop.state, ROLE.label), loop.label ? span(`: ${loop.label}`, ROLE.edgeLabel) : ''),
      )
    const lines = linesOf(grid)

    return notes.length > 0 ? [...lines, plain(''), ...notes] : lines
  },
}
