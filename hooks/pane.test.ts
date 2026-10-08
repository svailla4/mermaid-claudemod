import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { diagramsIn, EMPTY, MAX_DIAGRAMS, step, withPlan, withReply } from './gallery.ts'
import { isKnownHeader } from './diagram.ts'
import { RENDERERS } from './registry.ts'

const isHeader = (header: string) => isKnownHeader(RENDERERS, header)

const PLAN_PATH = '/plans/plan.md'
const PLAN = [
  '# Plan',
  '## Architecture',
  '```mermaid',
  'flowchart TD',
  '  A[Customer] --> B[Input app]',
  '```',
  '## Save flow',
  '```mermaid',
  'sequenceDiagram',
  '  App->>Server: save',
  '```',
].join('\n')
const REPLY = 'Here it is:\n\n```mermaid\nerDiagram\n  ORG ||--o{ USER : employs\n```'
const WIDE = [
  '```mermaid',
  'flowchart TD',
  ...Array.from({ length: 6 }, (_, i) => `  Root[Start] --> N${i}[A rather long node label ${i}]`),
  '```',
].join('\n')

// --- the gallery ---

test('a diagram is titled by the heading above it, else by its kind, and shared titles are numbered', () => {
  const found = diagramsIn(`${PLAN}\n\n\`\`\`mermaid\nflowchart TD\n  X --> Y\n\`\`\``, isHeader, 'plan')
  expect(found.map(d => d.title)).toEqual(['Architecture', 'Save flow', 'Save flow (2)'])
  expect(diagramsIn(REPLY, isHeader, 'reply')[0]).toMatchObject({ title: 'ER diagram', origin: 'reply' })
})

test('a new plan replaces the last plan, replies add once each, and stepping wraps', () => {
  const first = withPlan(EMPTY, diagramsIn(PLAN, isHeader, 'plan'))
  const replied = withReply(first, diagramsIn(REPLY, isHeader, 'reply'))
  expect(replied.diagrams.map(d => d.title)).toEqual(['Architecture', 'Save flow', 'ER diagram'])
  expect(replied.index).toBe(2)
  // The same reply again adds nothing.
  expect(withReply(replied, diagramsIn(REPLY, isHeader, 'reply'))).toBe(replied)

  const replanned = withPlan(replied, diagramsIn('## Only\n```mermaid\nflowchart TD\n  A --> B\n```', isHeader, 'plan'))
  expect(replanned.diagrams.map(d => d.title)).toEqual(['ER diagram', 'Only'])
  expect(replanned.index).toBe(1)
  // A plan without diagrams leaves the pane as it was.
  expect(withPlan(replanned, [])).toBe(replanned)

  expect(step(replanned, 1).index).toBe(0)
  expect(step(replanned, -1).index).toBe(0)
  expect(step(EMPTY, 1)).toBe(EMPTY)
})

test('the pane keeps the newest diagrams', () => {
  const many = Array.from({ length: MAX_DIAGRAMS + 5 }, (_, i) => ({ title: `D${i}`, source: `flowchart TD\n  A${i} --> B`, origin: 'reply' as const }))
  const kept = withReply(EMPTY, many)
  expect(kept.diagrams).toHaveLength(MAX_DIAGRAMS)
  expect(kept.diagrams[0]!.title).toBe('D5')
  expect(kept.index).toBe(0)
})

// --- the pane, through the engine ---

/** The engine beneath the plugin: plan mode's reminder, the plan file, and the tool's answer. */
function planMode($: Engine, on: On, plan = PLAN) {
  on('prompt.attachment', (_$, e) => ({ text: e.text }))
  on('fs.read', (_$, e) => {
    if (e.path !== PLAN_PATH) throw new Error(`no file ${e.path}`)
    return { value: plan }
  })
  on('tool.call', { tool: 'ExitPlanMode' }, () => ({ result: { plan, isAgent: false, filePath: PLAN_PATH } }))
  return $.prompt.attachment({
    type: 'plan_mode',
    text: 'Plan mode is active.',
    origin: { kind: 'engine' },
    detail: { reminder: 'full', planFilePath: PLAN_PATH, hasPlan: true },
  })
}

const mountPane = ($: Engine, bodyColumns = 70) =>
  $.ui.mount({
    plugin: 'mermaid-render',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'diagrams',
    props: { title: 'Diagrams', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    viewport: { columns: 160, rows: 40, isFullscreen: true },
  })

test('a plan put up for approval brings its diagrams to the pane, stepped through with ◀ and ▶', async ($, on) => {
  await planMode($, on)
  await $.tool.call({ tool: 'ExitPlanMode', input: {} })

  const pane = await mountPane($)
  expect((await pane.find({ text: /1\/2 · Architecture/ }))?.text).toContain('(plan)')
  expect(await pane.find({ text: /Customer/ })).toBeDefined()

  await pane.press({ key: 'next' })
  expect(await pane.find({ text: /2\/2 · Save flow/ })).toBeDefined()
  await pane.press({ key: 'next' })
  expect(await pane.find({ text: /1\/2 · Architecture/ })).toBeDefined()
  await pane.press({ key: 'prev' })
  expect(await pane.find({ text: /2\/2 · Save flow/ })).toBeDefined()
})

test("a reply's diagrams join the pane after the plan's, and the newest is shown", async ($, on) => {
  await planMode($, on)
  await $.tool.call({ tool: 'ExitPlanMode', input: {} })
  await $.session.append({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: REPLY }] },
    door: 'response',
    origin: { kind: 'model', model: 'claude-opus-5-5' },
    uuid: 'reply-1',
  })

  const pane = await mountPane($)
  expect(await pane.find({ text: /3\/3 · ER diagram/ })).toBeDefined()
  expect(await pane.find({ text: /employs/ })).toBeDefined()
})

test('a drawing wider than the pane scrolls in its own box there', async ($, on) => {
  await planMode($, on, `## Wide\n${WIDE}`)
  await $.tool.call({ tool: 'ExitPlanMode', input: {} })

  const pane = await mountPane($, 40)
  expect(await pane.find({ text: /1\/1 · Wide/ })).toBeDefined()
  expect(await pane.find({ type: 'Client' })).toBeDefined()
})

test('with no diagrams the pane says where they come from', async $ => {
  const pane = await mountPane($)
  expect(await pane.find({ text: /No diagrams yet/ })).toBeDefined()
})

test('a plan the mod cannot read still goes up for approval', async ($, on) => {
  on('tool.call', { tool: 'ExitPlanMode' }, () => ({ result: { plan: null, isAgent: false } }))
  const ran = await $.tool.call({ tool: 'ExitPlanMode', input: {} })
  expect(ran).toMatchObject({ result: { isAgent: false } })
})
