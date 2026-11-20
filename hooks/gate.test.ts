import type { On, RenderSurface } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { Check } from './check'
import { isKnownHeader } from './diagram'
import { reportFor } from './gate'
import { RENDERERS } from './registry'

const BROKEN = [
  'Here is the flow:',
  '',
  '```mermaid',
  'flowchart TD',
  '  subgraph Old, new',
  '    A[run (fast)] --> B',
  '  end',
  '```',
  '',
  '```mermaid',
  'sequenceDiagram',
  '  A->>B: save draft; send it',
  '```',
].join('\n')

const CLEAN = '```mermaid\nflowchart TD\n  A["run (fast)"] --> B\n```'


/**
 * The engine beneath the plugin: the session draws on `surfaces`, and its own
 * Stop (the settings hooks) answers `beneath`.
 */
function drawsOn(on: On, surfaces: RenderSurface[], beneath: { block?: string } = {}) {
  on('session.surfaces', () => ({ value: surfaces }))
  on('classic.Stop', () => beneath)
}

const stop = ($: Engine, text: string, isActive = false) =>
  $.classic.Stop({ stop_hook_active: isActive, last_assistant_message: text })

test('a reply whose diagrams have errors sends Claude back with each one', async ($, on) => {
  drawsOn(on, ['terminal'])
  const { block } = await stop($, BROKEN)
  expect(block).toContain('found 3 problems')
  expect(block).toContain('Diagram 1 of 2 (flowchart):')
  expect(block).toContain('- line 2 `subgraph Old, new`')
  expect(block).toContain('error: a subgraph title with a comma or parentheses must be quoted: subgraph "Old, new"')
  expect(block).toContain('- line 3 `A[run (fast)] --> B`')
  expect(block).toContain('Diagram 2 of 2 (sequenceDiagram):')
  expect(block).toContain('a ; ends a statement')
  expect(block).toContain('Send each of these diagrams again, corrected and complete')
})

test('a reply whose diagrams are clean ends as it would', async ($, on) => {
  drawsOn(on, ['terminal'])
  expect((await stop($, CLEAN)).block).toBeUndefined()
  expect((await stop($, 'No diagram here.')).block).toBeUndefined()
})

test('the reply that answers the check is let through, so a mistake cannot loop', async ($, on) => {
  drawsOn(on, ['terminal'])
  expect((await stop($, BROKEN, true)).block).toBeUndefined()
})

test('a session that draws no terminal is still told of errors', async ($, on) => {
  drawsOn(on, ['desktop'])
  expect((await stop($, BROKEN)).block).toContain('found 3 problems')
})

// No diagram Mermaid accepts is known to draw wrong in the terminal today, so
// a warning (the check's safety net for one) comes from a stand-in check.
const isDiagramHeader = (header: string) => isKnownHeader(RENDERERS, header)
const warnsOnLine2: Check = () => [{ line: 2, text: 'A ??? B', severity: 'warning', message: 'the terminal drawing would leave out a link' }]

test('a warning is reported where the terminal draws, and only there', () => {
  const report = reportFor(CLEAN, isDiagramHeader, warnsOnLine2, { warnings: true })
  expect(report).toContain('found a problem')
  expect(report).toContain('- line 2 `A ??? B`\n  warning: the terminal drawing would leave out a link')
  expect(reportFor(CLEAN, isDiagramHeader, warnsOnLine2, { warnings: false })).toBeUndefined()
})

test('a long report lists the first problems and counts the rest', () => {
  const many: Check = () => Array.from({ length: 15 }, (_, i) => ({ line: i + 2, text: `x${i}`, severity: 'error' as const, message: 'm' }))
  const report = reportFor(CLEAN, isDiagramHeader, many, { warnings: true })!
  expect(report.match(/^- line /gm)).toHaveLength(12)
  expect(report).toContain('…and 3 more of the same kinds.')
})

test('a block from another hook is kept, with the report after it', async ($, on) => {
  drawsOn(on, ['terminal'], { block: 'Run the tests first.' })
  const { block } = await stop($, BROKEN)
  expect(block!.startsWith('Run the tests first.\n\nmermaid-render checked')).toBe(true)
})

test('with the check setting off, Claude is not sent back', { options: { check: false } }, async ($, on) => {
  drawsOn(on, ['terminal'])
  expect((await stop($, BROKEN)).block).toBeUndefined()
})

// A reply drawn in the terminal: what the engine was asked to draw around the diagrams.
async function drawn($: Engine, on: On, text: string) {
  const seen: string[] = []
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    seen.push(e.props.text)
    const { Markdown } = $.ui.resolve(e)
    return Markdown({ text: e.props.text })
  })
  const ui = await $.ui.mount({
    plugin: 'mermaid-render',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
    viewport: { columns: 120, rows: 40 },
  })
  await ui.drawn()
  await ui.unmount()
  return seen.join('\n')
}

test('a drawn diagram with problems gets a note under it naming the first', async ($, on) => {
  const seen = await drawn($, on, BROKEN)
  expect(seen).toContain('*mermaid error, line 2: a subgraph title with a comma or parentheses must be quoted: subgraph "Old, new" (and 1 more)*')
  expect(seen).toContain('*mermaid error, line 2: a ; ends a statement')
})

test('a clean diagram gets no note', async ($, on) => {
  expect(await drawn($, on, CLEAN)).not.toContain('*mermaid')
})

test('with the check setting off, no note is drawn', { options: { check: false } }, async ($, on) => {
  expect(await drawn($, on, BROKEN)).not.toContain('*mermaid')
})
