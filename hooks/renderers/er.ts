// Draw an ER diagram for a terminal: entity boxes packed in rows that fit the
// width, related entities side by side, then a table of relationships.
//
// Crow's-foot lines between boxes tangle on a character grid (they cross
// boxes and each other), so the relationships are listed instead.

import { parseErDiagram } from '../vendor/beautiful-mermaid-ascii.js'
import type { Cardinality, ErAttribute, ErDiagram, ErEntity } from '../vendor/beautiful-mermaid-ascii.js'
import type { DiagramRenderer } from '../diagram.ts'
import { joinLines, padLine, plain, ROLE, span, styled, trimEnd, widthOf, widthOfLine } from '../styled.ts'
import type { Role, Span, StyledLine } from '../styled.ts'

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
 * type and comment, in aligned columns.
 */
function box(entity: ErEntity): StyledLine[] {
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
  const inner = Math.max(widthOfLine(title), ...rows.map(widthOfLine))
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

/**
 * The relationships as an aligned table: entity names in their accent,
 * cardinalities quiet, the line solid when identifying and dashed when not.
 */
function relationshipTable(diagram: ErDiagram): StyledLine[] {
  if (diagram.relationships.length === 0) return []

  const label = new Map(diagram.entities.map(e => [e.id, e.label]))
  const rows = diagram.relationships.map(r => ({
    from: label.get(r.entity1) ?? r.entity1,
    one: CARDINALITY[r.cardinality1],
    line: r.identifying ? '────' : '┄┄┄┄',
    other: CARDINALITY[r.cardinality2],
    to: label.get(r.entity2) ?? r.entity2,
    verb: r.label,
  }))
  // Column widths, measured once rather than per row.
  const w = (pick: (r: (typeof rows)[number]) => string) => Math.max(...rows.map(r => widthOf(pick(r))))
  const from = w(r => r.from)
  const one = w(r => r.one)
  const other = w(r => r.other)
  const to = w(r => r.to)

  return [
    plain(''),
    styled(span('Relationships', ROLE.heading)),
    ...rows.map(r =>
      trimEnd(
        styled(
          '  ',
          span(r.from, ROLE.heading),
          ' '.repeat(from - widthOf(r.from) + 1 + one - widthOf(r.one)),
          span(r.one, ROLE.detail),
          ' ',
          span(r.line, ROLE.edge),
          ' ',
          span(r.other, ROLE.detail),
          ' '.repeat(other - widthOf(r.other) + 1),
          span(r.to, ROLE.heading),
          ' '.repeat(to - widthOf(r.to) + 2),
          span(r.verb, ROLE.edgeLabel),
        ),
      ),
    ),
  ]
}

/** The diagram's lines; throws when the source holds no entity. */
function drawEr(body: string, width: number): StyledLine[] {
  const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('%%'))
  const diagram = parseErDiagram(lines)
  if (diagram.entities.length === 0) throw new Error('no entities found')

  return [...packRows(relatedOrder(diagram).map(box), width), ...relationshipTable(diagram)]
}

export const er: DiagramRenderer = {
  kind: 'erDiagram',
  matches: header => /^erDiagram\s*$/.test(header),
  draw: drawEr,
}
