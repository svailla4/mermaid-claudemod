// Check a Mermaid diagram's source, the way a compiler checks code: lines
// Mermaid itself rejects are errors, and lines the terminal drawing would
// leave out or get wrong are warnings. Each issue says how to write it instead.
//
// The rules are the mistakes Claude makes, each confirmed against Mermaid 11's
// own parser; a line the check can't read is left alone, never guessed at.

import { classCheck } from './checks/class'
import type { Issue, KindCheck, Line } from './checks/common'
import { erCheck } from './checks/er'
import { flowchartCheck } from './checks/flowchart'
import { sequenceCheck } from './checks/sequence'
import { stateCheck } from './checks/state'

export type { Issue, Severity } from './checks/common'

const CHECKS: readonly KindCheck[] = [flowchartCheck, sequenceCheck, stateCheck, classCheck, erCheck]

/**
 * The lines a check reads, trimmed and numbered from 1 as in the fence: no
 * front matter, blank lines or `%%` comments. The first is the header.
 */
function linesOf(source: string): Line[] {
  const raw = source.split('\n')
  let i = 0
  while (i < raw.length && raw[i]!.trim() === '') i++
  if (raw[i]?.trim() === '---') {
    const end = raw.findIndex((l, j) => j > i && l.trim() === '---')
    if (end !== -1) i = end + 1
  }

  const lines: Line[] = []
  for (; i < raw.length; i++) {
    const text = raw[i]!.trim()
    if (text !== '' && !text.startsWith('%%')) lines.push({ n: i + 1, text })
  }
  return lines
}

/**
 * The issues in a fence's source, in line order: every error a line has (a
 * fix that mends one must not leave another unsaid), or else its one
 * warning. A kind the check doesn't know has none.
 */
export function checkDiagram(source: string): Issue[] {
  const [header, ...rest] = linesOf(source)
  const kind = header && CHECKS.find(c => c.matches(header.text))
  if (!header || !kind) return []

  let found: Issue[]
  try {
    found = kind.check(header, rest)
  } catch {
    // A check never stands between a diagram and its drawing.
    return []
  }

  const byLine = new Map<number, Issue[]>()
  for (const issue of found) {
    const had = byLine.get(issue.line) ?? []
    if (had.some(h => h.message === issue.message)) continue
    byLine.set(issue.line, [...had, issue])
  }
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, issues]) => {
      const errors = issues.filter(i => i.severity === 'error')
      return errors.length > 0 ? errors : issues.slice(0, 1)
    })
}

/** Checks a fence's source; see `checkDiagram`. */
export type Check = (source: string) => Issue[]

const CACHE_LIMIT = 200

/** A check that keeps its last answers, as a reply is checked on every redraw. */
export function createChecker(): Check {
  const cache = new Map<string, Issue[]>()
  return source => {
    const hit = cache.get(source)
    if (hit) return hit
    const issues = checkDiagram(source)
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
    cache.set(source, issues)
    return issues
  }
}
