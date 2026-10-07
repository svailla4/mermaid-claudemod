// Draw an ER diagram for a terminal: entity boxes packed in rows that fit the
// width, related entities side by side, then a table of relationships.
//
// Crow's-foot lines between boxes tangle on a character grid (they cross
// boxes and each other), so the relationships are listed instead.

import { parseErDiagram } from '../vendor/beautiful-mermaid-ascii.js'
import type { ErDiagram, ErEntity, Cardinality } from '../vendor/beautiful-mermaid-ascii.js'
import type { DiagramRenderer } from '../diagram.ts'
import { pad, padStart, widthOf } from '../lines.ts'

const GAP = 2

const CARDINALITY: Record<Cardinality, string> = {
  one: '1',
  'zero-one': '0..1',
  many: '1..n',
  'zero-many': '0..n',
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

function box(entity: ErEntity): string[] {
  const keyWidth = Math.max(0, ...entity.attributes.map(a => widthOf(a.keys.join(','))))
  const typeWidth = Math.max(0, ...entity.attributes.map(a => widthOf(a.type)))
  const rows = entity.attributes.map(a => {
    const key = keyWidth > 0 ? pad(a.keys.join(','), keyWidth) + ' ' : ''
    const comment = a.comment ? `  ${a.comment}` : ''
    return `${key}${pad(a.type, typeWidth)} ${a.name}${comment}`
  })
  const inner = Math.max(widthOf(entity.label), ...rows.map(widthOf))
  const line = (s: string) => `│ ${pad(s, inner)} │`
  const rule = (l: string, r: string) => l + '─'.repeat(inner + 2) + r

  return [
    rule('┌', '┐'),
    line(entity.label),
    ...(rows.length > 0 ? [rule('├', '┤'), ...rows.map(line)] : []),
    rule('└', '┘'),
  ]
}

function packRows(boxes: string[][], width: number): string[] {
  const out: string[] = []
  let row: string[][] = []
  let used = 0

  const flush = () => {
    if (row.length === 0) return
    const height = Math.max(...row.map(b => b.length))
    if (out.length > 0) out.push('')
    for (let i = 0; i < height; i++) {
      out.push(row.map(b => pad(b[i] ?? '', widthOf(b[0]!))).join(' '.repeat(GAP)).trimEnd())
    }
    row = []
    used = 0
  }

  for (const b of boxes) {
    const w = widthOf(b[0]!)
    if (row.length > 0 && used + GAP + w > width) flush()
    used += (row.length > 0 ? GAP : 0) + w
    row.push(b)
  }
  flush()

  return out
}

function relationshipTable(diagram: ErDiagram): string[] {
  if (diagram.relationships.length === 0) return []

  const label = new Map(diagram.entities.map(e => [e.id, e.label]))
  const rows = diagram.relationships.map(r => [
    label.get(r.entity1) ?? r.entity1,
    CARDINALITY[r.cardinality1],
    r.identifying ? '────' : '┄┄┄┄',
    CARDINALITY[r.cardinality2],
    label.get(r.entity2) ?? r.entity2,
    r.label,
  ])
  // Column widths, measured once rather than per row.
  const w = rows[0]!.map((_, i) => Math.max(...rows.map(r => widthOf(r[i]!))))

  return [
    '',
    'Relationships',
    ...rows.map(r =>
      ['  ' + pad(r[0]!, w[0]!), padStart(r[1]!, w[1]!), r[2], pad(r[3]!, w[3]!), pad(r[4]!, w[4]!), r[5]]
        .join(' ')
        .trimEnd(),
    ),
  ]
}

/** The diagram's lines; throws when the source holds no entity. */
function drawEr(body: string, width: number): string[] {
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
