import { expect, test } from 'claude-code/testing'

import { isKnownHeader, rendererFor } from './diagram.ts'
import type { DiagramRenderer, Renderers } from './diagram.ts'
import { createDrawer } from './draw.ts'
import { splitFences } from './fences.ts'
import { RENDERERS } from './registry.ts'

// A header of each kind, and the renderer kind it must reach.
const ROUTES: Array<[string, string]> = [
  ['flowchart TD', 'flowchart'],
  ['flowchart LR', 'flowchart'],
  ['graph RL', 'flowchart'],
  ['graph TD; A-->B', 'flowchart'],
  ['sequenceDiagram', 'sequenceDiagram'],
  ['stateDiagram', 'stateDiagram'],
  ['stateDiagram-v2', 'stateDiagram'],
  ['classDiagram', 'classDiagram'],
  ['erDiagram', 'erDiagram'],
]

test('each diagram kind routes to its own renderer', () => {
  for (const [header, kind] of ROUTES) {
    expect(rendererFor(RENDERERS, header).kind).toBe(kind)
    expect(isKnownHeader(RENDERERS, header)).toBe(true)
  }
})

test('each header is claimed by exactly one renderer, so their order does not matter', () => {
  for (const [header] of ROUTES) {
    expect(RENDERERS.kinds.filter(r => r.matches(header)).length).toBe(1)
  }
  const kinds = RENDERERS.kinds.map(r => r.kind)
  expect(new Set(kinds).size).toBe(kinds.length)
})

test('any other header goes to the fallback and is not taken for a known kind', () => {
  for (const header of ['timeline', 'xychart-beta', 'graph = build()', 'flowchart.run(graph)', '']) {
    expect(rendererFor(RENDERERS, header)).toBe(RENDERERS.fallback)
    expect(isKnownHeader(RENDERERS, header)).toBe(false)
  }
})

// A kind the registry doesn't know, wired in as one more entry.
const gantt: DiagramRenderer = {
  kind: 'gantt',
  matches: header => header === 'gantt',
  draw: (body, width) => [`gantt of ${body.split('\n').length} lines at ${width}`],
}
const WITH_GANTT: Renderers = { ...RENDERERS, kinds: [...RENDERERS.kinds, gantt] }

test('a new kind is drawn and found in unlabeled fences once it is registered', () => {
  const draw = createDrawer(WITH_GANTT)
  const drawn = draw('%% plan\ngantt\n  title Plan', 80)
  expect(drawn.ok && drawn.art).toBe('gantt of 2 lines at 80')

  const fence = '```\ngantt\n  title Plan\n```'
  expect(splitFences(fence, h => isKnownHeader(WITH_GANTT, h))[0]!.kind).toBe('mermaid')
  expect(splitFences(fence, h => isKnownHeader(RENDERERS, h))[0]!.kind).toBe('md')
})

test('a renderer that throws yields its first line as the error, and the drawing is cached', () => {
  let calls = 0
  const broken: DiagramRenderer = {
    kind: 'broken',
    matches: () => true,
    draw: () => {
      calls++
      throw new Error('cannot draw this\nsecond line')
    },
  }
  const draw = createDrawer({ kinds: [broken], fallback: broken })
  expect(draw('broken', 80)).toEqual({ ok: false, error: 'cannot draw this' })
  draw('broken', 80)
  expect(calls).toBe(1)
})
