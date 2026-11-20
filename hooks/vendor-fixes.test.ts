// The fixes scripts/patches/beautiful-mermaid.patch makes to the library,
// drawn through the mod: each a form of valid Mermaid that used to lose a
// label, a link or a relationship, or a drawing that used to come out broken.

import { expect, test } from 'claude-code/testing'

import { createDrawer } from './draw'
import { RENDERERS } from './registry'

const draw = createDrawer(RENDERERS)

function art(source: string): string {
  const drawn = draw(source, 200)
  if (!drawn.ok) throw new Error(drawn.error)
  return drawn.lines.map(l => l.text).join('\n')
}

/** Whether `a` is drawn above `b`, the two joined by a line between them. */
function above(text: string, a: string, b: string): boolean {
  const lines = text.split('\n')
  return lines.findIndex(l => l.includes(a)) < lines.findIndex(l => l.includes(b))
}

test('a link written without spaces joins its two nodes', () => {
  const text = art('flowchart TD\n  Alpha-->Beta')
  expect(text).toContain('Alpha')
  expect(text).toContain('Beta')
  expect(text).not.toContain('Alpha--')
  expect(text).toContain('▼')
})

test('a node labeled after it was first named shows its label', () => {
  const text = art('flowchart TD\n  A --> S3\n  S3["Step 3: review it"]')
  expect(text).toContain('Step 3: review it')
  expect(text).not.toMatch(/│ +S3 +│/)
})

test('a dotted link with its text inside, and one without spaces, are drawn', () => {
  const text = art('flowchart TD\n  Chan -. tap .- Bus\n  Kid -.closes.-> Kernel')
  for (const word of ['Bus', 'tap', 'Kernel', 'closes']) expect(text).toContain(word)
})

test('circle, cross and longer links are drawn', () => {
  const text = art('flowchart TD\n  A --o B\n  B --x C\n  C ---> D')
  for (const node of ['B', 'C', 'D']) expect(text).toMatch(new RegExp(`│ +${node} +│`))
})

test('a space before a link label keeps the link', () => {
  const text = art('flowchart TD\n  A --- |yes| B')
  expect(text).toContain('yes')
  expect(text).toMatch(/│ +B +│/)
})

test('statements split by semicolons, and a header with one, are all drawn', () => {
  const text = art('graph TD;A-->B;B-->C')
  expect(text).toMatch(/│ +C +│/)
  expect(above(text, 'A', 'C')).toBe(true)
})

test('a header without a direction is drawn top-down', () => {
  const text = art('flowchart\n  Top --> Bottom')
  expect(above(text, 'Top', 'Bottom')).toBe(true)
})

test('ids with dots and accents are kept whole', () => {
  const text = art('flowchart TD\n  api.v1 --> Café')
  expect(text).toContain('api.v1')
  expect(text).toContain('Café')
})

test('an ER relationship with }o on the left is drawn', () => {
  const text = art('erDiagram\n  AUTHOR }o..o{ BOOK : "writes"')
  expect(text).toContain('AUTHOR')
  expect(text).toContain('BOOK')
  expect(text).toContain('writes')
  expect(text).toContain('0..n')
})

test('an ER entity block on one line keeps its attributes', () => {
  const text = art('erDiagram\n  ORDER_STATE ||--o{ ORDERS : state\n  ORDER_STATE { text status PK  text label }')
  expect(text).toMatch(/PK status +text/)
  expect(text).toMatch(/label +text/)
})

test('ER keys written with a comma get both badges', () => {
  const text = art('erDiagram\n  A ||--o{ B : has\n  B {\n    int a_id PK, FK\n  }')
  expect(text).toMatch(/PK,FK a_id/)
})

test('entity codes are drawn as the characters they stand for', () => {
  const text = art('sequenceDiagram\n  App->>API: save draft #59; send\n  Note over API: see issue #35;12, #quot;q#quot; #9829;')
  expect(text).toContain('save draft ; send')
  expect(text).toContain('see issue #12, "q" ♥')
  expect(art('flowchart TD\n  A["say #quot;hi#quot; #unknown;"] --> B')).toContain('say "hi" #unknown;')
})

test('a sequence message with empty text is drawn', () => {
  const text = art('sequenceDiagram\n  Alice->>Bob:')
  expect(text).toContain('Alice')
  expect(text).toContain('Bob')
})

test('a node named before a subgraph and listed in it is drawn inside its frame', () => {
  const text = art('flowchart TD\n  Start --> Inner\n  subgraph Group [The group]\n    Inner\n  end')
  const rows = text.split('\n')
  const title = rows.findIndex(r => r.includes('The group'))
  const inner = rows.findIndex(r => r.includes('Inner'))
  expect(title).toBeGreaterThanOrEqual(0)
  expect(inner).toBeGreaterThan(title)
  // The frame's sides run past the node on its row.
  expect(rows[inner]).toMatch(/│\s*│\s*Inner\s*│\s*│/)
})

test('a quoted label keeps a closing bracket inside its quotes', () => {
  expect(art('flowchart TD\n  B("r (y)") --> C{"ok (y/n)?"}')).toMatch(/r \(y\)[\s\S]*ok \(y\/n\)\?/)
})

test('parallelograms keep their labels and the node after them', () => {
  const text = art('flowchart TD\n  N[/Input/] --> O[\\Output\\]')
  expect(text).toContain('Input')
  expect(text).toContain('Output')
  expect(text).not.toContain('/]')
})

test("Mermaid 11's shapes, labels and edge ids are read", () => {
  const text = art('flowchart TD\n  A@{ shape: diam, label: "Ok?" } e1@--> B\n  e1@{ animate: true }')
  expect(text).toContain('Ok?')
  expect(text).toMatch(/│ +B +│/)
  expect(text).not.toContain('e1')
})

test('links with circle and cross ends, and text inside, are drawn', () => {
  const text = art('flowchart TD\n  A o--o B\n  B -- stop --x C\n  C --o|t| D')
  for (const word of ['B', 'C', 'D', 'stop']) expect(text).toContain(word)
})

test('an invisible link places its nodes and draws no line', () => {
  const text = art('flowchart LR\n  A ~~~ B')
  expect(text).toMatch(/│ +A +│ +│ +B +│/)
})

test('a click line names no node', () => {
  expect(art('flowchart TD\n  A --> B\n  click A "https://example.com"')).not.toContain('click')
})

test('two labels on links between the same nodes are both drawn whole', () => {
  const text = art('flowchart LR\n  B[Browser] -->|upload a file, show progress| API\n  B -->|check status| API')
  expect(text).toContain('upload a file, show progress')
  expect(text).toContain('check status')
})

test('the gaps between a label\'s words hide the line under them', () => {
  const text = art('flowchart LR\n  A -->|save original| B')
  expect(text).toContain('save original')
  expect(text).not.toContain('save─original')
})

test('an edge leaving a box beside a widened column starts on the box', () => {
  const text = art([
    'flowchart TD',
    '  A[Incoming order] --> B{Paid in full?}',
    '  B -->|refund or void| X[Closed]',
    '  B -->|yes| C{Address, phone, email or zip?}',
    '  C -->|yes| X',
    '  C -->|no| D{In stock, not on hold?}',
    '  D -->|no: backorder or recall| X',
    '  D -->|yes| E{carrier serves the region?}',
    '  E -->|no| X',
    '  E -->|yes| F{express, or overnight requested?}',
    '  F -->|yes| U[Ship today]',
    '  F -->|no| K[Ship this week]',
  ].join('\n'))
  // A junction one or more cells off its box's side would read `│ ├`.
  expect(text).not.toMatch(/[│┤] +├/)
})

test('an edge from another row arrives on its own, not along a fan-out', () => {
  const text = art('flowchart TD\n  U --> R\n  U --> F\n  U --> W\n  W --> R')
  // W's edge reaches R's side rather than joining U's line above R.
  expect(text).toMatch(/│ +R +│◄/)
})

test('a sequence participant named in words, and two-way arrows, are drawn', () => {
  const text = art('sequenceDiagram\n  participant My Service\n  App<<->>My Service: sync')
  expect(text).toContain('My Service')
  expect(text).toMatch(/◀─+▶|◀─+┤/)
  expect(text).toContain('sync')
})

test('option is critical\'s divider, not an opt block', () => {
  const text = art('sequenceDiagram\n  critical connect\n    A->>B: try\n  option timeout\n    A->>B: retry\n  end')
  expect(text).toContain('timeout')
  expect(text).not.toMatch(/\bion timeout/)
})

test('a wrapped self-message keeps its rows whole and clear of the next lifeline', () => {
  const text = art('sequenceDiagram\n  A->>B: hello\n  B->>B: a rather long note to itself<br/>that needs two rows\n  B->>C: next')
  const rows = text.split('\n')
  // Every row starts with the drawing's margin or a line, never with label text.
  for (const row of rows) expect(row).toMatch(/^[ │├◀┌└┐┘─]/)
  const label = rows.find(r => r.includes('a rather long note'))!
  expect(label.trimEnd().endsWith('│')).toBe(true)
})

test('class lines with no marker, and every relationship label', () => {
  const text = art('classDiagram\n  Order --> Item : contains\n  Order --> Customer : placed by\n  Order -- Payment : paid with\n  Order .. Note : about')
  for (const label of ['contains', 'placed by', 'paid with', 'about']) expect(text).toContain(label)
})

test('state ids with dots and classes are drawn', () => {
  const text = art('stateDiagram-v2\n  a.b --> c\n  c:::hot --> d\n  classDef hot fill:#f00')
  for (const id of ['a.b', 'c', 'd']) expect(text).toMatch(new RegExp(`│ +${id.replace('.', '\\.')} +│`))
})

test('an ER alias titles its box, and worded relationships are drawn', () => {
  const text = art('erDiagram\n  A["Customer account"] {\n    int id PK\n  }\n  A one or more to zero or many B : has')
  expect(text).toContain('Customer account')
  expect(text).toContain('1..n')
  expect(text).toContain('0..n')
})
