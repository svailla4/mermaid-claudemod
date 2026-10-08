// beautiful-mermaid's ASCII renderer, tried at a few spacings until one fits,
// with each cell's role read back from its colored output.

import { renderMermaidASCII } from '../vendor/beautiful-mermaid-ascii.js'
import type { AsciiRenderOptions, AsciiTheme } from '../vendor/beautiful-mermaid-ascii.js'
import { ROLE, tidyLines, widestLine } from '../styled.ts'
import type { Role, StyledLine } from '../styled.ts'
import { refuseLongPaths } from './guard.ts'
import { polish } from './polish.ts'
import type { Cell, Grid } from './polish.ts'

/** One way to draw a diagram; called only when the ways before it didn't fit. */
type Attempt = () => StyledLine[]

// The library tags every cell with a role but shows it only as a color, so
// each role gets a color of its own (its index in the blue channel) and the
// escapes of its truecolor output are read back as roles.
const SENTINEL: AsciiTheme = {
  fg: '#000001',
  border: '#000002',
  line: '#000003',
  arrow: '#000004',
  corner: '#000005',
  junction: '#000006',
  accent: '#000007',
}
// The roles the sentinels stand for, by blue value. Text is told apart into
// labels and edge labels by `polish`; a junction is where an edge meets a frame.
const ROLE_OF: Record<number, Role> = {
  1: ROLE.label,
  2: ROLE.border,
  3: ROLE.edge,
  4: ROLE.arrow,
  5: ROLE.edge,
  6: ROLE.border,
  // A chart's first series.
  7: ROLE.edge,
}

// paddingY below 4 puts edge labels on box borders, and border padding keeps
// labels off the box sides; `polish` squeezes out the blank rows both add.
const ROOMY: AsciiRenderOptions = {
  paddingX: 4,
  paddingY: 4,
  boxBorderPadding: 1,
  colorMode: 'truecolor',
  theme: SENTINEL,
}
const TIGHT: AsciiRenderOptions = { ...ROOMY, paddingX: 2 }

const ESCAPE = /\x1b\[([\d;]*)m/y

/** The library's colored output as a grid of cells with roles. */
export function decode(colored: string): Grid {
  return colored.split('\n').map(text => {
    const row: Cell[] = []
    let role: Role = ROLE.plain
    let i = 0
    while (i < text.length) {
      ESCAPE.lastIndex = i
      const escape = ESCAPE.exec(text)
      if (escape) {
        const p = escape[1]!.split(';')
        // A color the theme didn't set (a chart's series) draws as a label.
        role = p[0] === '38' ? (ROLE_OF[Number(p[4])] ?? ROLE.label) : ROLE.plain
        i = ESCAPE.lastIndex
        continue
      }
      const ch = String.fromCodePoint(text.codePointAt(i)!)
      row.push({ ch, role: ch === ' ' ? ROLE.plain : role })
      i += ch.length
    }
    return row
  })
}

const toLines = (grid: Grid): StyledLine[] =>
  tidyLines(grid.map(row => ({ text: row.map(c => c.ch).join(''), roles: row.map(c => c.role).join('') })))

/** What is done to a drawing's grid before it becomes lines. */
export type Finish = (grid: Grid) => Grid

const attempt =
  (text: string, options: AsciiRenderOptions, finish: Finish = polish): Attempt =>
  () =>
    toLines(finish(decode(renderMermaidASCII(text, options))))

/** The text drawn tight, for a renderer's own extra attempts. */
export const tight = (text: string): Attempt => attempt(text, TIGHT)

/**
 * The body drawn roomy, then tight, then each of `more`: the first that fits
 * `width`, else the narrowest (the earliest on a tie). The first attempt's
 * error is the drawing's; a later attempt that throws is passed over, as the
 * library can mangle a tighter layout of a drawing it laid out well. Each
 * drawing is polished unless `finish` says otherwise.
 */
export function drawAscii(
  body: string,
  width: number,
  more: readonly Attempt[] = [],
  finish: Finish = polish,
): StyledLine[] {
  refuseLongPaths(body)

  let best: StyledLine[] = []
  let bestWidth = Infinity

  for (const [i, next] of [attempt(body, ROOMY, finish), attempt(body, TIGHT, finish), ...more].entries()) {
    let lines: StyledLine[]
    try {
      lines = next()
    } catch (error) {
      if (i === 0) throw error
      continue
    }
    const w = widestLine(lines)
    if (w < bestWidth) {
      best = lines
      bestWidth = w
    }
    if (w <= width) break
  }

  return best
}
