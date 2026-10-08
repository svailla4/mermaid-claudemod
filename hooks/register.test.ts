import type { On, RenderSurface } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { paintFor } from './paint.ts'
import { ROLE } from './styled.ts'
import type { StyledLine } from './styled.ts'

const FLOW = '```mermaid\nflowchart TD\n  A[Customer] --> B[Input app]\n  B --> C[(Postgres)]\n```'
const ERD = '```\nerDiagram\n  ORGANIZATION ||--o{ VALUATION : values\n```'

const MODEL = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  tools: [],
  outputStyle: null,
  traits: [],
}

type Node = { type: string; props?: Record<string, unknown>; children?: unknown[] }

const isNode = (c: unknown): c is Node => typeof c === 'object' && c !== null && 'type' in c
const textOf = (n: unknown): string => (typeof n === 'string' ? n : isNode(n) ? (n.children ?? []).map(textOf).join('') : '')

/** Every Text drawing one row of a drawing, outermost, in order. */
function rowsOf(tree: unknown): Node[] {
  if (!isNode(tree)) return []
  if (tree.type === 'Text' && tree.props?.wrap === 'truncate-end') return [tree]
  return (tree.children ?? []).flatMap(rowsOf)
}

/** The styled runs of the rows: each Text nested in a row, with its look. */
const runsOf = (tree: unknown) =>
  rowsOf(tree).flatMap(row =>
    (row.children ?? []).filter(isNode).map(run => ({ text: textOf(run), look: run.props ?? {} })),
  )

/** The look of the first run whose text is `text`, else the first holding it. */
function lookOf(tree: unknown, text: string) {
  const runs = runsOf(tree)
  return (runs.find(r => r.text.trim() === text) ?? runs.find(r => r.text.includes(text)))?.look
}

/** The text of every row a drawing's tree holds, as lines. */
const artOf = (tree: unknown) => rowsOf(tree).map(textOf).join('\n')

type Viewport = { columns: number; rows: number; isFullscreen?: boolean }

// Mounts a reply through the mod, with a stand-in for the engine beneath it
// that records each run of text it was asked to draw.
async function mount<S extends RenderSurface = 'terminal'>(
  $: Engine,
  on: On,
  text: string,
  viewport: Viewport,
  surface: S = 'terminal' as S,
) {
  const seen: string[] = []
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    seen.push(e.props.text)
    const { Markdown } = $.ui.resolve(e)
    return Markdown({ text: e.props.text })
  })
  const ui = await $.ui.mount({
    plugin: 'mermaid-render',
    surface,
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
    viewport,
  })
  return { ui, seen, tree: await ui.drawn() }
}

/** A reply drawn at 120 columns: what the engine was asked to draw, and the drawing. */
async function draw($: Engine, on: On, text: string, surface: RenderSurface = 'terminal') {
  const { ui, seen, tree } = await mount($, on, text, { columns: 120, rows: 40 }, surface)
  await ui.unmount()
  return { seen: seen.join('\n'), art: artOf(tree), tree }
}

const BOX = /[┌└│─►▼]/

test('a mermaid fence is drawn as box art between the text the engine draws', async ($, on) => {
  const { seen, art } = await draw($, on, `Here is the flow:\n\n${FLOW}\n\nDone.`)
  expect(art).toMatch(BOX)
  expect(art).toContain('Customer')
  expect(seen).not.toContain('```mermaid')
  expect(seen).toContain('Here is the flow:')
  expect(seen).toContain('Done.')
})

test('an unlabeled fence starting with erDiagram is drawn', async ($, on) => {
  const { art, seen } = await draw($, on, ERD)
  expect(art).toMatch(/[╭│─]/)
  expect(art).toContain('ORGANIZATION')
  expect(seen).not.toContain('erDiagram')
})

test('an unclosed fence is left for the engine while the reply streams', async ($, on) => {
  const text = 'Drawing:\n```mermaid\nflowchart TD\n  A --> B'
  const { seen } = await draw($, on, text)
  expect(seen).toBe(text)
})

test('a reply without a diagram is passed through unchanged', async ($, on) => {
  const text = 'No diagrams here.\n\n```python\nprint(1)\n```'
  const { seen } = await draw($, on, text)
  expect(seen).toBe(text)
})

test('ordinary code in an unlabeled fence is not mistaken for a diagram', async ($, on) => {
  const text = '```\ngraph = build()\nflowchart.run(graph)\n```'
  const { seen } = await draw($, on, text)
  expect(seen).toBe(text)
})

test('an unsupported mermaid kind keeps its source and says why', async ($, on) => {
  const fence = '```mermaid\ntimeline\n  2026 : started\n```'
  const { seen } = await draw($, on, fence)
  expect(seen).toContain(fence)
  expect(seen).toContain('*mermaid: not drawn (')
})

test('a left-right flowchart too wide for the terminal is turned top-down to fit', async ($, on) => {
  const long = 'x'.repeat(60)
  const fence = `\`\`\`mermaid\nflowchart LR\n  A[${long}] --> B[${long}] --> C[${long}]\n\`\`\``
  const { art } = await draw($, on, fence)
  expect(art).toContain(long)
  for (const line of art.split('\n')) expect(Array.from(line).length).toBeLessThanOrEqual(116)
})

test('the desktop surface draws the source as written', async ($, on) => {
  const { seen } = await draw($, on, FLOW, 'desktop')
  expect(seen).toBe(FLOW)
})

test('the system prompt gains one diagram section, after the others', async ($, on) => {
  on('prompt.compose', () => ({
    sections: [
      { id: 'intro', text: 'You are Claude Code.', scope: 'shared' },
      { id: 'env', text: 'cwd: /tmp', scope: 'session' },
    ],
  }))
  const { sections } = await $.prompt.compose({ ...MODEL, surfaces: ['terminal'] })
  expect(sections.map(s => s.id)).toEqual(['intro', 'env', 'mermaid-render:diagrams'])
  expect(sections[2]!.text).toContain('```mermaid')
  expect(sections[2]!.scope).toBe('session')
})

test('a session without a terminal gets no diagram section', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose({ ...MODEL, surfaces: [] })
  expect(sections.map(s => s.id)).toEqual(['intro'])
})

test('with the steer setting off the system prompt is left alone', { options: { steer: false } }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose({ ...MODEL, surfaces: ['terminal'] })
  expect(sections.map(s => s.id)).toEqual(['intro'])
})

test('with the steer setting off diagrams are still drawn', { options: { steer: false } }, async ($, on) => {
  const { art } = await draw($, on, FLOW)
  expect(art).toMatch(BOX)
})

const ER_FENCE = [
  '```mermaid',
  'erDiagram',
  '  CUSTOMER ||--o{ ORDER : places',
  '  ORDER ||..o| PAYMENT : "paid by"',
  '  CUSTOMER {',
  '    int id PK',
  '    string email UK',
  '  }',
  '  ORDER {',
  '    int customer_id FK',
  '  }',
  '```',
].join('\n')

test('an ER diagram draws its relationships as lines between the boxes', async ($, on) => {
  const { art } = await draw($, on, ER_FENCE)
  // Key badge, name, then type, in aligned columns.
  expect(art).toMatch(/│ PK id +int +│/)
  expect(art).toMatch(/│ UK email string +│/)
  expect(art).not.toContain('Relationships')
  // Each line carries the cardinality of the box above, the verb, then the
  // cardinality of the box below, between the two boxes.
  const lines = art.split('\n')
  const row = (text: string) => lines.findIndex(l => l.includes(text))
  expect(art).toMatch(/│ 1\n *│ places\n *│ 0\.\.n\n/)
  expect(row('CUSTOMER')).toBeLessThan(row('places'))
  expect(row('places')).toBeLessThan(row('ORDER'))
  // Non-identifying (`..`) relationships are dashed.
  expect(art).toMatch(/┆ 1\n *┆ paid by\n *┆ 0\.\.1\n/)
  expect(row('paid by')).toBeLessThan(row('PAYMENT'))
})

test('an ER diagram colors entity names, key badges, types, lines, cardinalities and verbs', async ($, on) => {
  const { tree } = await draw($, on, ER_FENCE)
  expect(lookOf(tree, 'CUSTOMER')).toEqual({ color: 'claude', bold: true })
  expect(lookOf(tree, 'PK')).toEqual({ color: 'warning', bold: true })
  expect(lookOf(tree, 'FK')).toEqual({ color: 'suggestion', bold: true })
  expect(lookOf(tree, 'UK')).toEqual({ color: 'merged', bold: true })
  expect(lookOf(tree, 'string')).toEqual({ color: 'inactive' })
  expect(runsOf(tree).some(r => r.text.trim() === '│' && r.look.color === 'suggestion')).toBe(true)
  expect(runsOf(tree).some(r => r.text.trim() === '┆' && r.look.color === 'suggestion')).toBe(true)
  expect(lookOf(tree, '0..n')).toEqual({ color: 'inactive' })
  expect(lookOf(tree, 'places')).toEqual({ dimColor: true, italic: true })
  expect(lookOf(tree, '╭')).toEqual({ color: 'inactive' })
})

test('an entity related to itself gets its relationship in a small box below it', async ($, on) => {
  const { art } = await draw($, on, '```mermaid\nerDiagram\n  EMPLOYEE ||--o{ EMPLOYEE : manages\n```')
  expect(art).toMatch(/│ 1 manages 0\.\.n │/)
  expect(art.indexOf('EMPLOYEE')).toBeLessThan(art.indexOf('manages'))
})

test('an ER chain too long for the layout lists its relationships as a table', async ($, on) => {
  const chain = Array.from({ length: 12 }, (_, i) => `  E${i} ||--o{ E${i + 1} : has`)
  const { art } = await draw($, on, ER_FENCE.replace(/```$/, [...chain, '```'].join('\n')))
  expect(art).toContain('Relationships')
  expect(art).toMatch(/E0 +1 ──── 0\.\.n E1 +has/)
  // Non-identifying (`..`) relationships are dashed there too.
  expect(art).toMatch(/ORDER +1 ┄┄┄┄ 0\.\.1 PAYMENT +paid by/)
})

test('a flowchart draws frames, labels, edges, arrowheads and edge labels each their own way', async ($, on) => {
  const fence = '```mermaid\nflowchart TD\n  A[Customer] -->|asks| B[Input app]\n```'
  const { tree, art } = await draw($, on, fence)
  expect(lookOf(tree, '┌')).toEqual({ color: 'inactive' })
  expect(lookOf(tree, '▼')).toEqual({ color: 'suggestion', bold: true })
  expect(lookOf(tree, 'asks')).toEqual({ dimColor: true, italic: true })
  // Labels take the text's own color: bare strings in their row, no run of their own.
  expect(art).toContain('Customer')
  expect(runsOf(tree).some(r => r.text.includes('Customer'))).toBe(false)
  // The edge between the boxes is drawn in the accent, apart from its arrowhead.
  expect(runsOf(tree).some(r => r.text.trim() === '│' && r.look.color === 'suggestion' && !r.look.bold)).toBe(true)
})

test('a state diagram draws Start and End, and self-transitions as loops on their box', async ($, on) => {
  const fence = [
    '```mermaid',
    'stateDiagram-v2',
    '  [*] --> Draft: start',
    '  Draft --> Draft: save',
    '  Draft --> Done: finish',
    '  Done --> [*]',
    '```',
  ].join('\n')
  const { art, tree } = await draw($, on, fence)
  expect(art).toMatch(/│ +Start +│/)
  expect(art).toMatch(/│ +End +│/)
  expect(art).toMatch(/│ +Draft +├─╮ save\n *│ +│◄╯\n/)
  expect(art).not.toContain('↻')
  expect(art).not.toContain('[*]')
  expect(lookOf(tree, 'save')).toEqual({ dimColor: true, italic: true })
  expect(lookOf(tree, '◄')).toEqual({ color: 'suggestion', bold: true })
})

test('edges between boxes are one stroke long and boxes hold no blank rows', async ($, on) => {
  const { art } = await draw($, on, FLOW)
  const lines = art.split('\n')
  const bottom = lines.findIndex(l => l.includes('┬'))
  expect(lines[bottom + 1]!.trim()).toBe('│')
  expect(lines[bottom + 2]!.trim()).toBe('▼')
  for (const line of lines) expect(line).not.toMatch(/^│ +│$/)
})

test('class diagrams get headings, single dividers and mended junctions', async ($, on) => {
  const fence = [
    '```mermaid',
    'classDiagram',
    '  class Shape {',
    '    <<interface>>',
    '    +area() double',
    '  }',
    '  Shape <|-- Circle',
    '  Shape <|-- Square',
    '  Shape --> Point : at',
    '```',
  ].join('\n')
  const { art, tree } = await draw($, on, fence)
  // An empty section leaves no second divider.
  expect(art).not.toMatch(/├─+┤\n *├─+┤/)
  // The header, stereotype and name, is a heading; members are not.
  expect(lookOf(tree, '<<interface>>')).toEqual({ color: 'claude', bold: true })
  expect(lookOf(tree, 'Shape')).toEqual({ color: 'claude', bold: true })
  expect(runsOf(tree).some(r => r.text.includes('area'))).toBe(false)
  // Where edges part ways, a junction, never a corner mid-line.
  expect(art).not.toMatch(/─[└┘┌┐]─/)
})

test('a frame title gets air on its edge, and an else divider is part of the frame', async ($, on) => {
  const fence = [
    '```mermaid',
    'sequenceDiagram',
    '  A->>B: hi',
    '  alt ok',
    '    B-->>A: yes',
    '  else no',
    '    B-->>A: no',
    '  end',
    '```',
  ].join('\n')
  const { art, tree } = await draw($, on, fence)
  expect(art).toMatch(/┌─ alt \[ok\] ─+┐/)
  expect(art).toMatch(/├╌ \[no\] ╌+┤/)
  expect(runsOf(tree).some(r => r.text.includes('[no]'))).toBe(false)
  expect(lookOf(tree, '├╌')).toEqual({ color: 'inactive' })
})

test('the corners of rounded and decision shapes are drawn as frame', async ($, on) => {
  const fence = '```mermaid\nflowchart LR\n  A((circle)) --> B{decide}\n```'
  const { tree } = await draw($, on, fence)
  expect(lookOf(tree, '◯')).toEqual({ color: 'inactive' })
  expect(lookOf(tree, '◇')).toEqual({ color: 'inactive' })
})

test('a sequence diagram with long messages wraps them to fit', async ($, on) => {
  const message = 'ask the assistant to read the uploaded document and prepare every input'
  const fence = [
    '```mermaid',
    'sequenceDiagram',
    '  participant A as Customer',
    '  participant B as Host',
    '  participant C as Server',
    `  A->>B: ${message}`,
    `  B->>C: ${message}`,
    `  C-->>A: ${message}`,
    '```',
  ].join('\n')
  const { art, tree } = await draw($, on, fence)
  for (const line of art.split('\n')) expect(line.endsWith('…')).toBe(false)
  expect(art).toContain('uploaded document and prepare')
  expect(art).toContain('every input')
  // Lifelines step back behind the messages, which leave them at a junction.
  const strokes = runsOf(tree).filter(r => r.text.trim() === '│')
  expect(strokes.some(r => r.look.color === 'subtle')).toBe(true)
  expect(art).toContain('├')
})

/** The first Text in the tree that shows exactly `text`. */
function findText(n: unknown, text: string): Node | undefined {
  if (!isNode(n)) return undefined
  if (n.type === 'Text' && textOf(n) === text) return n
  for (const c of n.children ?? []) {
    const hit = findText(c, text)
    if (hit) return hit
  }
  return undefined
}

// The transcript's bullet: `⏺` on macOS, `●` elsewhere (and before the
// platform is known).
const bulletOf = (tree: unknown) => findText(tree, '⏺') ?? findText(tree, '●')

test('a reply that opens with a diagram still shows its bullet', async ($, on) => {
  const { tree } = await draw($, on, FLOW)
  expect(bulletOf(tree)?.props).toEqual({ color: 'text' })
})

test('a diagram after text gets no bullet of its own', async ($, on) => {
  const { tree } = await draw($, on, `Here:\n\n${FLOW}`)
  expect(bulletOf(tree)).toBeUndefined()
})

// The bounds a surface keeps a tree within: nodes, depth and serialized size.
function measure(tree: unknown) {
  let nodes = 0
  const depth = (n: unknown): number => {
    if (!isNode(n)) return 0
    nodes++
    return 1 + Math.max(0, ...(n.children ?? []).map(depth))
  }
  return { depth: depth(tree), nodes, chars: JSON.stringify(tree).length }
}

test('a big diagram stays within the bounds of a tree', async ($, on) => {
  // Forty entities of ten keyed attributes: thousands of colored runs.
  const entities = Array.from({ length: 40 }, (_, i) => [
    `  E${i} ||--o{ E${i + 1} : has`,
    `  E${i} {`,
    ...Array.from({ length: 10 }, (_, j) => `    uuid field_${j} ${j % 2 ? 'FK' : 'PK'}`),
    '  }',
  ])
  const fence = ['```mermaid', 'erDiagram', ...entities.flat(), '```'].join('\n')
  const { tree, art } = await draw($, on, fence)
  expect(art).toContain('E39')
  const size = measure(tree)
  expect(size.nodes).toBeLessThan(20_000)
  expect(size.depth).toBeLessThan(32)
  expect(size.chars).toBeLessThan(100_000)
})

test('lines too many to color are drawn plain, and too many for a tree are left to the engine', () => {
  const line = (n: number): StyledLine => ({
    text: '│ x │ '.repeat(n),
    roles: `${ROLE.border} ${ROLE.edge} ${ROLE.border} `.repeat(n),
  })
  expect(paintFor(Array.from({ length: 50 }, () => line(4)))).toBe('color')
  expect(paintFor(Array.from({ length: 400 }, () => line(10)))).toBe('plain')
  expect(paintFor(Array.from({ length: 5_000 }, () => line(10)))).toBe('none')
})

const WIDE = [
  '```mermaid',
  'flowchart TD',
  `  R[root] --> A[${'a'.repeat(50)}]`,
  `  R --> B[${'b'.repeat(50)}]`,
  `  R --> C[${'c'.repeat(50)}]`,
  '```',
].join('\n')

// Mounts a reply at 80 columns and returns the scroll box drawn for it, if
// any, with what the engine was asked to draw around it.
async function boxed($: Engine, on: On, text: string, isFullscreen: boolean) {
  const { ui, seen, tree } = await mount($, on, text, { columns: 80, rows: 40, isFullscreen })
  return { ui, seen, tree, box: await ui.find({ type: 'Client' }) }
}

test('on the main screen a wide diagram is still boxed in the reply, and says where it scrolls', async ($, on) => {
  const { ui, box } = await boxed($, on, WIDE, false)
  expect(box).toBeDefined()
  await ui.resize({ columns: 60, rows: 12, in: box!.key! })
  const status = await ui.find({ type: 'Text', text: /◀ 1–58\/\d+ ▶/, in: box!.key! })
  expect(status?.text).toContain('fullscreen to scroll')
  await ui.unmount()
})

test('a diagram that fits is drawn in the reply without a box', async ($, on) => {
  const { ui, tree, box } = await boxed($, on, FLOW, true)
  expect(box).toBeUndefined()
  expect(artOf(tree)).toMatch(BOX)
  await ui.unmount()
})

test('a scroll box frames the drawing with its kind on top and its position below', async ($, on) => {
  const { ui, box } = await boxed($, on, WIDE, true)
  const at = { in: box!.key! }
  await ui.resize({ columns: 40, rows: 12, ...at })
  const view = await ui.drawn(at)
  const rows = rowsOf(view).map(textOf)
  expect(rows[0]).toMatch(/^╭─ flowchart ─+╮$/)
  expect(rows[rows.length - 1]).toMatch(/^╰─ ◀ 1–38\/\d+ ▶ · drag or ←→ ─*╯$/)
  // Every row is as wide as the box, framed on both sides.
  for (const row of rows) expect(Array.from(row).length).toBe(40)
  for (const row of rows.slice(1, -1)) expect(row).toMatch(/^│.*│$/)
  // The frame steps back; the drawing inside keeps its colors.
  expect(lookOf(view, '╭─')).toEqual({ color: 'subtle' })
  expect(runsOf(view).some(r => r.look.color === 'inactive' && r.text.includes('┌'))).toBe(true)
  await ui.unmount()
})

test('in fullscreen a wide diagram scrolls inside its own box in the reply', async ($, on) => {
  const { ui, seen, box } = await boxed($, on, `Before.\n\n${WIDE}\n\nAfter.`, true)

  // The text around the box is still the engine's to draw; no hint is needed.
  expect(seen.join('\n')).toContain('Before.')
  expect(seen.join('\n')).toContain('After.')

  expect(box).toBeDefined()
  const at = { in: box!.key! }
  await ui.resize({ columns: 40, rows: 12, ...at })
  const status = async () => (await ui.find({ type: 'Text', text: /^╰─ ◀/, ...at }))?.text

  expect(await status()).toMatch(/◀ 1–38\/\d+ ▶/)
  await ui.key({ key: 'right', ...at })
  await ui.key({ key: 'right', ...at })
  expect(await status()).toMatch(/◀ 17–54\//)

  // Dragging the drawing 10 cells to the right shows 10 columns further left.
  await ui.pointer({ type: 'down', x: 20, y: 3, button: 'left', ...at })
  await ui.pointer({ type: 'move', x: 30, y: 3, button: 'left', ...at })
  await ui.pointer({ type: 'up', x: 30, y: 3, button: 'left', ...at })
  expect(await status()).toMatch(/◀ 7–44\//)

  await ui.key({ key: 'end', ...at })
  expect(await status()).toMatch(/◀ (\d+)–(\d+)\/\2 ▶/)
  await ui.key({ key: 'home', ...at })
  expect(await status()).toMatch(/◀ 1–38\//)
  // Panning never runs past the left edge.
  await ui.key({ key: 'left', ...at })
  expect(await status()).toMatch(/◀ 1–38\//)
  await ui.unmount()
})
