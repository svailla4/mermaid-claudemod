// Draw an ER diagram for a terminal: entity boxes joined by relationship
// lines, each line with its verb and a cardinality at each end.
//
// The library's own ER drawing runs crow's-foot lines through boxes, so the
// layout and routing come from its flowchart engine instead: each entity is a
// placeholder node the size of its box, and each relationship a small node
// between its two entities (`e0 --- r0 --- e1`), which tells each cardinality
// its end. The placeholders are then replaced by the mod's own boxes and by
// the line, verb and cardinalities. When those stops make a chain too long
// for the engine, entities are joined directly, each line labeled
// `1 verb 0..n` in source order.

import { parseErDiagram } from '../vendor/beautiful-mermaid-ascii.js'
import type { Cardinality, ErAttribute, ErDiagram, ErEntity, ErRelationship } from '../vendor/beautiful-mermaid-ascii.js'
import type { DiagramRenderer } from '../diagram.ts'
import { cellsOf, joinLines, padLine, plain, ROLE, span, styled, trimEnd, widthOf, widthOfLine } from '../styled.ts'
import type { Role, Span, StyledLine } from '../styled.ts'
import { drawAscii } from './ascii.ts'
import { polish } from './polish.ts'
import type { Cell, Grid } from './polish.ts'

const GAP = 2

const CARDINALITY: Record<Cardinality, string> = {
  one: '1',
  'zero-one': '0..1',
  many: '1..n',
  'zero-many': '0..n',
}

// Each key badge in a color of its own, so keys read at a glance.
const KEY_ROLE: Record<ErAttribute['keys'][number], Role> = {
  PK: ROLE.primaryKey,
  FK: ROLE.foreignKey,
  UK: ROLE.uniqueKey,
}

/** Entities in source order, each followed as soon as possible by those it relates to. */
function relatedOrder(diagram: ErDiagram): ErEntity[] {
  const byId = new Map(diagram.entities.map(e => [e.id, e]))
  const seen = new Set<string>()
  const order: ErEntity[] = []

  for (const start of diagram.entities) {
    const queue = [start.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (seen.has(id) || !byId.has(id)) continue
      seen.add(id)
      order.push(byId.get(id)!)
      for (const r of diagram.relationships) {
        if (r.entity1 === id) queue.push(r.entity2)
        if (r.entity2 === id) queue.push(r.entity1)
      }
    }
  }

  return order
}

/** An attribute's key badges, `PK,FK`, each in its own color. */
function badges(keys: ErAttribute['keys']): Span[] {
  return keys.flatMap((k, i) => (i > 0 ? [span(',', ROLE.detail), span(k, KEY_ROLE[k])] : [span(k, KEY_ROLE[k])]))
}

/**
 * One entity: its name over its attributes, each a row of key badges, name,
 * type and comment, in aligned columns. `width`, when wider than the box
 * needs, stretches it.
 */
function box(entity: ErEntity, width = 0): StyledLine[] {
  const keyWidth = Math.max(0, ...entity.attributes.map(a => widthOf(a.keys.join(','))))
  const nameWidth = Math.max(0, ...entity.attributes.map(a => widthOf(a.name)))
  const typeWidth = Math.max(0, ...entity.attributes.map(a => widthOf(a.type)))
  const rows = entity.attributes.map(a =>
    trimEnd(
      styled(
        ...badges(a.keys),
        keyWidth > 0 ? ' '.repeat(keyWidth - widthOf(a.keys.join(',')) + 1) : '',
        span(a.name, ROLE.label),
        ' '.repeat(nameWidth - widthOf(a.name) + 1),
        span(a.type, ROLE.detail),
        a.comment ? ' '.repeat(typeWidth - widthOf(a.type) + 2) : '',
        a.comment ? span(a.comment, ROLE.comment) : '',
      ),
    ),
  )
  const title = styled(span(entity.label, ROLE.heading))
  const inner = Math.max(widthOfLine(title), ...rows.map(widthOfLine), width - 4)
  const side = styled(span('│', ROLE.border))
  const row = (l: StyledLine) => joinLines(side, plain(' '), padLine(l, inner), plain(' '), side)
  const rule = (l: string, r: string) => styled(span(l + '─'.repeat(inner + 2) + r, ROLE.border))

  return [
    rule('╭', '╮'),
    row(title),
    ...(rows.length > 0 ? [rule('├', '┤'), ...rows.map(row)] : []),
    rule('╰', '╯'),
  ]
}

/** Boxes laid out in rows as wide as fit `width`, a blank line between rows. */
function packRows(boxes: StyledLine[][], width: number): StyledLine[] {
  const out: StyledLine[] = []
  let row: StyledLine[][] = []
  let used = 0

  const flush = () => {
    if (row.length === 0) return
    const height = Math.max(...row.map(b => b.length))
    if (out.length > 0) out.push(plain(''))
    for (let i = 0; i < height; i++) {
      const cells = row.map((b, j) => padLine(b[i] ?? plain(''), widthOfLine(b[0]!) + (j < row.length - 1 ? GAP : 0)))
      out.push(trimEnd(joinLines(...cells)))
    }
    row = []
    used = 0
  }

  for (const b of boxes) {
    const w = widthOfLine(b[0]!)
    if (row.length > 0 && used + GAP + w > width) flush()
    used += (row.length > 0 ? GAP : 0) + w
    row.push(b)
  }
  flush()

  return out
}

// Placeholder text: private-use characters no diagram holds. A node's label
// starts with its tag (`MARK`, its id, `MARK_END`) and is filled out with `FILL`.
const MARK = '\uE000'
const MARK_END = '\uE001'
const FILL = '\uE002'

const tagOf = (id: string) => MARK + id + MARK_END

/** A node's placeholder label: `lines` rows of `width` cells, the first starting with its tag. */
function placeholder(id: string, width: number, lines: number): string {
  const tag = tagOf(id)
  const w = Math.max(width, widthOf(tag))
  const row = (i: number) => (i === 0 ? tag + FILL.repeat(w - widthOf(tag)) : FILL.repeat(w))
  return Array.from({ length: lines }, (_, i) => row(i)).join('<br/>')
}

/** A relationship's text: the verb and the cardinality at each end. */
const textOf = (r: ErRelationship) => ({ one: CARDINALITY[r.cardinality1], verb: r.label, other: CARDINALITY[r.cardinality2] })

/** The widest of a relationship's texts, which sit right of its line. */
const textWidth = (r: ErRelationship) => Math.max(...Object.values(textOf(r)).map(widthOf))

/**
 * The flowchart the layout is borrowed from. Nodes are declared where first
 * used, in source order, which keeps each relationship between its entities.
 * Each relationship is a node of its own, or with `direct` a labeled line.
 */
function standIn(diagram: ErDiagram, direct: boolean): string {
  const index = new Map(diagram.entities.map((e, i) => [e.id, i]))
  const declared = new Set<string>()
  const entity = (id: string) => {
    const node = `e${index.get(id)}`
    if (declared.has(node)) return node
    declared.add(node)
    const lines = box(diagram.entities[index.get(id)!]!)
    // The frame adds a cell of padding all round, and its inside is always
    // an odd number of rows.
    return `${node}["${placeholder(node, widthOfLine(lines[0]!) - 4, Math.max(1, lines.length - 4))}"]`
  }

  const lines = ['flowchart TD']
  diagram.relationships.forEach((r, k) => {
    const link = r.identifying ? '---' : '-.-'
    const { one, verb, other } = textOf(r)
    if (direct) {
      lines.push(`  ${entity(r.entity1)} ${link}|${one} ${verb} ${other}| ${entity(r.entity2)}`)
      return
    }
    // Room for the texts right of a centered line, or for all three on one row.
    const width = Math.max(2 * textWidth(r) + 1, widthOf(`${one} ${verb} ${other}`) + 2)
    lines.push(`  ${entity(r.entity1)} ${link} r${k}["${placeholder(`r${k}`, width, 1)}"]`)
    lines.push(`  r${k} ${link} ${entity(r.entity2)}`)
  })
  for (const e of diagram.entities) if (!declared.has(`e${index.get(e.id)}`)) lines.push(`  ${entity(e.id)}`)

  return lines.join('\n')
}

/** Where a node was drawn: its frame's corners. */
type Frame = { x0: number; y0: number; x1: number; y1: number }

const BLANK: Cell = { ch: ' ', role: ROLE.plain }

// The cells a frame's sides and edges are drawn with, junctions included.
const SIDE = '│├┤┼'
const EDGE = '─┬┴┼'

const CORNER = '┌┐└┘├┤┬┴┼'

/**
 * The frame around the placeholder tagged `id`: the first drawn cell left of
 * the tag (inside a frame there are only blanks), then along the sides and
 * edges, which lines may join anywhere, to the corners. Throws when it isn't
 * drawn whole.
 */
function frameOf(grid: Grid, id: string): Frame {
  const tag = cellsOf(tagOf(id))
  const at = (x: number, y: number) => grid[y]?.[x]
  const isFrame = (x: number, y: number, chars: string) => chars.includes(at(x, y)?.ch ?? ' ')
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!
    for (let x = 0; x + tag.length <= row.length; x++) {
      if (!tag.every((ch, i) => row[x + i]!.ch === ch)) continue
      let x0 = x - 1
      while (x0 >= 0 && (row[x0]!.ch === ' ' || row[x0]!.ch === FILL)) x0--
      if (!SIDE.includes(row[x0]?.ch ?? ' ')) break
      let y0 = y - 1
      while (isFrame(x0, y0, SIDE)) y0--
      let x1 = x0 + 1
      while (isFrame(x1, y0, EDGE)) x1++
      let y1 = y + 1
      while (isFrame(x0, y1, SIDE)) y1++
      const isCorner = (cx: number, cy: number) => isFrame(cx, cy, CORNER)
      if (x0 < 0 || y0 < 0 || ![[x0, y0], [x1, y0], [x0, y1], [x1, y1]].every(([cx, cy]) => isCorner(cx!, cy!))) break
      return { x0, y0, x1, y1 }
    }
  }
  throw new Error(`placeholder ${id} not drawn`)
}

/** The cell at (x, y), the row grown with blanks to reach it. */
function put(grid: Grid, x: number, y: number, cell: Cell): void {
  const row = grid[y]!
  while (row.length < x) row.push({ ...BLANK })
  row[x] = { ...cell }
}

const isEdge = (c: Cell | undefined) => c !== undefined && (c.role === ROLE.edge || c.role === ROLE.arrow)
const reachesDown = (c: Cell | undefined) => isEdge(c) && '│┆┊╎┬┼├┤┌┐▼'.includes(c!.ch)
const reachesUp = (c: Cell | undefined) => isEdge(c) && '│┆┊╎┴┼├┤└┘▲'.includes(c!.ch)
const reachesRight = (c: Cell | undefined) => isEdge(c) && '─┄┈╌├┼┬┴┌└►▶'.includes(c!.ch)
const reachesLeft = (c: Cell | undefined) => isEdge(c) && '─┄┈╌┤┼┬┴┐┘◄◀'.includes(c!.ch)

/** The columns where edges meet a frame's top and bottom, and the rows where they meet its sides. */
function touches(grid: Grid, f: Frame) {
  const at = (x: number, y: number) => grid[y]?.[x]
  const columns = (y: number, reaches: (c: Cell | undefined) => boolean) =>
    Array.from({ length: f.x1 - f.x0 - 1 }, (_, i) => f.x0 + 1 + i).filter(x => reaches(at(x, y)))
  const rows = (x: number, reaches: (c: Cell | undefined) => boolean) =>
    Array.from({ length: f.y1 - f.y0 - 1 }, (_, i) => f.y0 + 1 + i).filter(y => reaches(at(x, y)))

  return {
    top: columns(f.y0 - 1, reachesDown),
    bottom: columns(f.y1 + 1, reachesUp),
    left: rows(f.x0 - 1, reachesRight),
    right: rows(f.x1 + 1, reachesLeft),
  }
}

/** Blanks a frame and all it holds. */
function clear(grid: Grid, f: Frame): void {
  for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) put(grid, x, y, BLANK)
}

/** Writes `spans` from (x, y) on. */
function write(grid: Grid, x: number, y: number, ...spans: Span[]): void {
  for (const s of spans) for (const ch of cellsOf(s.text)) put(grid, x++, y, { ch, role: ch === ' ' ? ROLE.plain : s.role })
}

const DOTTED = '┆┊╎┄┈╌'

/**
 * A box drawn over a placeholder's frame, as small as it can be: centered on
 * the frame, over every column where an edge meets its top or bottom and
 * every row where one meets its sides. `draw` gives the box at least `width`
 * wide. Edges run on to it through the cells it frees.
 */
function stampBox(grid: Grid, f: Frame, draw: (width: number) => StyledLine[]): void {
  const meets = touches(grid, f)
  const columns = [...meets.top, ...meets.bottom]
  const sides = [...meets.left, ...meets.right]
  const reach = columns.length > 0 ? Math.max(...columns) - Math.min(...columns) + 3 : 0
  const lines = draw(reach)
  const width = widthOfLine(lines[0]!)
  const height = lines.length

  // The first column and row that keep the box inside the frame and over every edge.
  const fit = (start: number, near: number[], first: number, last: number, size: number) => {
    let at = near.length > 0 ? Math.min(Math.max(start, Math.max(...near) - size + 2), Math.min(...near) - 1) : start
    at = Math.min(Math.max(at, first), last - size + 1)
    if (at < first || near.some(n => n <= at || n >= at + size - 1)) throw new Error('box does not fit its frame')
    return at
  }
  const left = fit(f.x0 + Math.floor((f.x1 - f.x0 + 1 - width) / 2), columns, f.x0, f.x1, width)
  const top = fit(f.y0 + Math.floor((f.y1 - f.y0 + 1 - height) / 2), sides, f.y0, f.y1, height)

  const styleOf = (c: Cell, solid: string, dotted: string) => (DOTTED.includes(c.ch) ? dotted : solid)
  const strokes: Array<[number, number, string]> = [
    ...meets.top.flatMap(x => range(f.y0, top - 1).map((y): [number, number, string] => [x, y, styleOf(grid[f.y0 - 1]![x]!, '│', '┆')])),
    ...meets.bottom.flatMap(x => range(top + height, f.y1).map((y): [number, number, string] => [x, y, styleOf(grid[f.y1 + 1]![x]!, '│', '┆')])),
    ...meets.left.flatMap(y => range(f.x0, left - 1).map((x): [number, number, string] => [x, y, styleOf(grid[y]![f.x0 - 1]!, '─', '┄')])),
    ...meets.right.flatMap(y => range(left + width, f.x1).map((x): [number, number, string] => [x, y, styleOf(grid[y]![f.x1 + 1]!, '─', '┄')])),
  ]

  clear(grid, f)
  for (const [x, y, ch] of strokes) put(grid, x, y, { ch, role: ROLE.edge })
  lines.forEach((line, i) => {
    cellsOf(line.text).forEach((ch, j) => put(grid, left + j, top + i, { ch, role: (line.roles[j] ?? ROLE.plain) as Role }))
  })
}

/** The whole numbers from `from` to `to`, both included. */
const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)

/**
 * A relationship's texts on one row in a rounded frame, at least `width`
 * wide: the cardinalities in source order, or swapped to put each on the side
 * its entity's line leaves from.
 */
function relationshipBox(r: ErRelationship, width: number, swapped: boolean): StyledLine[] {
  const { verb, ...ends } = textOf(r)
  const [one, other] = swapped ? [ends.other, ends.one] : [ends.one, ends.other]
  const text = styled(span(one, ROLE.detail), ' ', span(verb, ROLE.edgeLabel), ' ', span(other, ROLE.detail))
  const inner = Math.max(widthOfLine(text), width - 4)
  const before = Math.floor((inner - widthOfLine(text)) / 2)
  const side = styled(span('│', ROLE.border))
  const rule = (l: string, r: string) => styled(span(l + '─'.repeat(inner + 2) + r, ROLE.border))

  return [
    rule('╭', '╮'),
    joinLines(side, plain(' '.repeat(before + 1)), padLine(text, inner - before), plain(' '), side),
    rule('╰', '╯'),
  ]
}

/**
 * The relationship over its placeholder's frame: the line straight through
 * and, beside it, the cardinality of the entity above, the verb, and the
 * cardinality of the entity below. A relationship not met at a single column
 * top and bottom (one relating an entity to itself) is a small box with its
 * texts on one row.
 */
function stampRelationship(grid: Grid, r: ErRelationship, f: Frame, frames: Map<string, Frame>): void {
  const meets = touches(grid, f)
  const { one, verb, other } = textOf(r)
  const isStraight =
    meets.top.length === 1 &&
    meets.bottom.length === 1 &&
    meets.top[0] === meets.bottom[0] &&
    meets.left.length + meets.right.length === 0 &&
    meets.top[0] + 2 + textWidth(r) <= f.x1
  const first = frames.get(r.entity1)!
  const second = frames.get(r.entity2)!
  const above = (e: Frame) => e.y1 < f.y0
  const firstAbove = above(first) && !above(second)
  const secondAbove = above(second) && !above(first)

  if (!isStraight || !(firstAbove || secondAbove)) {
    // An entity a side line leads to is the one further that way.
    const centre = (e: Frame) => e.x0 + e.x1
    const swapped =
      r.entity1 !== r.entity2 &&
      ((meets.right.length > 0 && centre(first) > centre(second)) || (meets.left.length > 0 && centre(second) < centre(first)))
    stampBox(grid, f, width => relationshipBox(r, width, swapped))
    return
  }

  const x = meets.top[0]!
  const [upper, lower] = firstAbove ? [one, other] : [other, one]
  const mid = f.y0 + Math.floor((f.y1 - f.y0) / 2)
  clear(grid, f)
  for (let y = f.y0; y <= f.y1; y++) put(grid, x, y, { ch: r.identifying ? '│' : '┆', role: ROLE.edge })
  write(grid, x + 2, mid - 1, span(upper, ROLE.detail))
  write(grid, x + 2, mid, span(verb, ROLE.edgeLabel))
  write(grid, x + 2, mid + 1, span(lower, ROLE.detail))
}

const VERTICAL = '│┆┊╎'
const HORIZONTAL = '─┄┈╌'

/**
 * A relationship drawn as a labeled line, its label moved off the stroke: the
 * engine writes it over the line, which cuts through it (`1 has│0..n`) or
 * runs on in its spaces (`─1─has─0..n─`), or just above where the line
 * starts. On a vertical line the label goes right of it (`│ 1 has 0..n`), on
 * a horizontal one above it, and the stroke is drawn whole. Left as drawn
 * when it isn't found or the cells it would move to are taken.
 */
function relabel(grid: Grid, r: ErRelationship): void {
  const { one, verb, other } = textOf(r)
  const label = cellsOf(`${one} ${verb} ${other}`)
  const isFree = (y: number, from: number, to: number) =>
    range(from, to).every(x => (grid[y]?.[x]?.ch ?? ' ') === ' ')
  const text = [span(one, ROLE.detail), span(' ', ROLE.plain), span(verb, ROLE.edgeLabel), span(' ', ROLE.plain), span(other, ROLE.detail)]

  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!
    for (let x = 0; x + label.length <= row.length; x++) {
      const cells = row.slice(x, x + label.length)
      const isStroke = (c: Cell) => VERTICAL.includes(c.ch) || HORIZONTAL.includes(c.ch)
      // A label already moved is styled; relationships can share a label.
      const isDrawn = (c: Cell, i: number) =>
        (c.ch === label[i] && c.role !== ROLE.detail && c.role !== ROLE.edgeLabel) ||
        (label[i] === ' ' && isStroke(c)) ||
        VERTICAL.includes(c.ch)
      if (!cells.every(isDrawn) || !cells.some((c, i) => c.ch === label[i] && c.ch !== ' ')) continue
      const end = x + label.length

      const across = HORIZONTAL.includes(row[x - 1]?.ch ?? ' ') || HORIZONTAL.includes(row[end]?.ch ?? ' ')
      if (across) {
        const stroke = HORIZONTAL.includes(row[x - 1]?.ch ?? ' ') ? row[x - 1]!.ch : row[end]!.ch
        const above = isFree(y - 1, x - 1, end) ? y - 1 : isFree(y + 1, x - 1, end) ? y + 1 : -1
        if (above < 0) return
        for (let i = x; i < end; i++) put(grid, i, y, { ch: stroke, role: ROLE.edge })
        write(grid, x, above, ...text)
        return
      }

      // The column the line runs down: through the label, or on from above or below it.
      const through = cells.findIndex(c => VERTICAL.includes(c.ch))
      const column =
        through >= 0
          ? x + through
          : range(x, end - 1).find(i => VERTICAL.includes(grid[y - 1]?.[i]?.ch ?? ' ') || VERTICAL.includes(grid[y + 1]?.[i]?.ch ?? ' '))
      if (column === undefined) return
      const stroke = [row[column], grid[y - 1]?.[column], grid[y + 1]?.[column]].find(c => c && VERTICAL.includes(c.ch))!.ch
      for (let i = x; i < end; i++) if (i !== column) put(grid, i, y, BLANK)
      if (!isFree(y, column + 1, column + 1 + label.length)) {
        for (let i = x; i < end; i++) put(grid, i, y, { ch: label[i - x]!, role: ROLE.label })
        return
      }
      put(grid, column, y, { ch: stroke, role: ROLE.edge })
      write(grid, column + 2, y, ...text)
      return
    }
  }
}

// Arrowheads the engine leaves where lines merge, and the stroke each stands in.
const HEAD: Record<string, string> = { '▼': '│', '▲': '│', '►': '─', '◄': '─', '▶': '─', '◀': '─' }

/** Replaces each placeholder of `diagram` drawn in `grid` with what it stands for. */
function stamp(diagram: ErDiagram, grid: Grid, direct: boolean): Grid {
  // Relationships have no direction.
  for (const c of grid.flat()) {
    if (c.role === ROLE.arrow && HEAD[c.ch]) Object.assign(c, { ch: HEAD[c.ch], role: ROLE.edge })
  }
  const frames = new Map(diagram.entities.map((e, i) => [e.id, frameOf(grid, `e${i}`)]))
  const relations = direct ? [] : diagram.relationships.map((r, k) => ({ r, f: frameOf(grid, `r${k}`) }))

  for (const { r, f } of relations) stampRelationship(grid, r, f, frames)
  if (direct) for (const r of diagram.relationships) relabel(grid, r)
  diagram.entities.forEach(e => stampBox(grid, frames.get(e.id)!, width => box(e, width)))

  return grid
}

// A relationship's cardinality token (`||--o{`). The library's parser reads
// `}o` and `}|` only as `o{` and `|{`, so a left-hand end written the other
// way round is turned to match.
const RELATIONSHIP = /^(\S+\s+)([|o}{]+)(--|\.\.)([|o}{]+)(\s+\S+\s*:)/
// Keys run together (`PK,FK`), which the library's parser only reads apart.
const JOINED_KEYS = /\b(PK|FK|UK)\s*,\s*(?=(?:PK|FK|UK)\b)/g

/** A source line as the library's parser reads it; a comment's quotes are left alone. */
function normalize(line: string): string {
  const quote = line.indexOf('"')
  const [code, comment] = quote < 0 ? [line, ''] : [line.slice(0, quote), line.slice(quote)]
  const fixed = code
    .replace(RELATIONSHIP, (_, from, left, link, right, to) => from + left.replace(/\}/g, '{') + link + right + to)
    .replace(JOINED_KEYS, '$1 ')
  return fixed + comment
}

/** The diagram's lines; throws when the source holds no entity. */
function drawEr(body: string, width: number): StyledLine[] {
  const lines = body
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('%%'))
    .map(normalize)
  const diagram = parseErDiagram(lines)
  if (diagram.entities.length === 0) throw new Error('no entities found')

  if (diagram.relationships.length === 0) return packRows(relatedOrder(diagram).map(e => box(e)), width)
  const draw = (direct: boolean) => drawAscii(standIn(diagram, direct), width, [], grid => polish(stamp(diagram, grid, direct)))
  try {
    return draw(false)
  } catch {
    // A chain too long with a stop on every relationship, or a stop the
    // engine didn't draw whole. Joined directly, a chain too long still
    // throws, and keeps its source with the reason.
    return draw(true)
  }
}

export const er: DiagramRenderer = {
  kind: 'erDiagram',
  matches: header => /^erDiagram\s*$/.test(header),
  draw: drawEr,
}
