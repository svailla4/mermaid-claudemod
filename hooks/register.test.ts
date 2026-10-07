import type { RenderSurface } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const FLOW = '```mermaid\nflowchart TD\n  A[Customer] --> B[Input app]\n  B --> C[(Postgres)]\n```'
const ERD = '```\nerDiagram\n  ORGANIZATION ||--o{ VALUATION : values\n```'

const MODEL = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  tools: [],
  outputStyle: null,
  traits: [],
}

type Drawn = { text: string | undefined; seen: string | undefined }

// Mounts a reply through the mod, with a stand-in for the engine beneath it
// that records the text it was asked to draw.
async function draw(
  $: Parameters<Parameters<typeof test>[1]>[0],
  on: Parameters<Parameters<typeof test>[1]>[1],
  text: string,
  surface: RenderSurface = 'terminal',
): Promise<Drawn> {
  let seen: string | undefined
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    seen = e.props.text
    const { Markdown } = $.ui.resolve(e)
    return Markdown({ text: e.props.text })
  })
  const ui = await $.ui.mount({
    plugin: 'mermaid-render',
    surface,
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
    viewport: { columns: 120, rows: 40 },
  })
  const found = await ui.find({ type: 'Markdown' })
  await ui.unmount()
  return { text: found?.text, seen }
}

const BOX = /[┌└│─►▼]/

test('a mermaid fence is drawn as box art', async ($, on) => {
  const { seen } = await draw($, on, `Here is the flow:\n\n${FLOW}\n\nDone.`)
  expect(seen).toMatch(BOX)
  expect(seen).not.toContain('```mermaid')
  expect(seen).toContain('Customer')
  expect(seen).toContain('Here is the flow:')
  expect(seen).toContain('Done.')
})

test('an unlabeled fence starting with erDiagram is drawn', async ($, on) => {
  const { seen } = await draw($, on, ERD)
  expect(seen).toMatch(BOX)
  expect(seen).toContain('ORGANIZATION')
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

test('a wide diagram is cut to the terminal width', async ($, on) => {
  const long = 'x'.repeat(60)
  const fence = `\`\`\`mermaid\nflowchart LR\n  A[${long}] --> B[${long}] --> C[${long}]\n\`\`\``
  const { seen } = await draw($, on, fence)
  const art = seen!.split('\n').filter(l => !l.startsWith('```'))
  for (const line of art) expect(Array.from(line).length).toBeLessThanOrEqual(116)
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
