// The library's flowchart layout never finishes once a path through the graph
// passes about 25 nodes (a straight chain of 25 draws in a few milliseconds,
// 26 does not return; branching and cycles don't matter). It runs on the
// terminal's drawing thread, so such a chart would freeze Claude Code: it is
// refused before drawing, with the reason shown under its source.

import { parseMermaid } from '../vendor/beautiful-mermaid-ascii.js'

/** The most nodes a path may hold, a margin under where the layout hangs. */
export const MAX_PATH = 22

type Edge = { source: string; target: string }

/** Nodes on the longest path, edges that close a cycle left out. */
export function longestPath(edges: readonly Edge[]): number {
  const next = new Map<string, string[]>()
  for (const { source, target } of edges) {
    next.set(source, [...(next.get(source) ?? []), target])
    if (!next.has(target)) next.set(target, [])
  }

  const depth = new Map<string, number>()
  const onPath = new Set<string>()
  const visit = (node: string): number => {
    const known = depth.get(node)
    if (known !== undefined) return known
    onPath.add(node)
    let deepest = 0
    for (const to of next.get(node) ?? []) if (!onPath.has(to)) deepest = Math.max(deepest, visit(to))
    onPath.delete(node)
    depth.set(node, deepest + 1)
    return deepest + 1
  }

  let longest = 0
  for (const node of next.keys()) longest = Math.max(longest, visit(node))
  return longest
}

/**
 * Throws when `body` is a flowchart or state diagram with a path too long for
 * the layout. Other kinds (which the flowchart parser rejects) pass: the
 * library draws or rejects them itself.
 */
export function refuseLongPaths(body: string): void {
  let path: number
  try {
    path = longestPath(parseMermaid(body).edges)
  } catch {
    return
  }
  if (path > MAX_PATH) {
    throw new Error(`a path of ${path} steps is too long to draw in the terminal (at most ${MAX_PATH}); split the chart`)
  }
}
