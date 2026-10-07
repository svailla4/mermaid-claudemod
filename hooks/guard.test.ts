import { expect, test } from 'claude-code/testing'

import { createDrawer } from './draw.ts'
import { RENDERERS } from './registry.ts'
import { longestPath, MAX_PATH } from './renderers/guard.ts'

const chain = (nodes: number, header = 'flowchart TD') =>
  [header, ...Array.from({ length: nodes - 1 }, (_, i) => `  N${i} --> N${i + 1}`)].join('\n')

const edges = (...pairs: Array<[string, string]>) => pairs.map(([source, target]) => ({ source, target }))

test('the longest path counts nodes, follows branches and leaves cycles out', () => {
  expect(longestPath([])).toBe(0)
  expect(longestPath(edges(['a', 'b'], ['b', 'c']))).toBe(3)
  expect(longestPath(edges(['a', 'b'], ['a', 'c'], ['c', 'd'], ['d', 'e']))).toBe(4)
  expect(longestPath(edges(['a', 'b'], ['b', 'c'], ['c', 'a']))).toBe(3)
})

test('a chain at the limit is still drawn', () => {
  const drawn = createDrawer(RENDERERS)(chain(MAX_PATH), 100)
  expect(drawn.ok).toBe(true)
})

// Without the guard the library's layout never returns on these, and the
// terminal's drawing thread would freeze.
for (const header of ['flowchart TD', 'flowchart LR', 'graph TD', 'stateDiagram-v2']) {
  test(`a ${header} chain too long for the layout is refused with the reason`, () => {
    const drawn = createDrawer(RENDERERS)(chain(40, header), 100)
    expect(drawn).toEqual({
      ok: false,
      error: `a path of 40 steps is too long to draw in the terminal (at most ${MAX_PATH}); split the chart`,
    })
  })
}

test('kinds the flowchart parser rejects are not checked by it', () => {
  const sequence = ['sequenceDiagram', ...Array.from({ length: 40 }, (_, i) => `  A->>B: step ${i}`)].join('\n')
  expect(createDrawer(RENDERERS)(sequence, 200).ok).toBe(true)
})
