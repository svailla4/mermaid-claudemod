// What Claude is told when the diagrams of the reply it just finished have
// problems: each one, where it is, and how to fix it.

import type { Check, Issue } from './check'
import { diagramBody, headerOf } from './diagram'
import { splitFences } from './fences'

/** The most issues listed; the rest are counted. */
const MAX_LISTED = 12

/**
 * The note for the problems in `text`'s diagrams, or undefined when there are
 * none. Warnings (what the terminal would draw wrong) count only when
 * `warnings` is set, as they matter only where the terminal draws.
 */
export function reportFor(
  text: string,
  isDiagramHeader: (header: string) => boolean,
  check: Check,
  { warnings }: { warnings: boolean },
): string | undefined {
  const diagrams = splitFences(text, isDiagramHeader).flatMap(s => (s.kind === 'mermaid' ? [s.source] : []))
  const flagged = diagrams
    .map((source, i) => ({
      index: i + 1,
      kind: headerOf(diagramBody(source)).split(/[\s;]/)[0] || 'mermaid',
      issues: check(source).filter(issue => warnings || issue.severity === 'error'),
    }))
    .filter(d => d.issues.length > 0)
  if (flagged.length === 0) return undefined

  const total = flagged.reduce((n, d) => n + d.issues.length, 0)
  const out: string[] = [
    `mermaid-render checked the diagrams in your last reply and found ${total === 1 ? 'a problem' : `${total} problems`}.`,
    'An error is a line Mermaid itself rejects or reads otherwise than written, so the diagram breaks everywhere but this terminal; a warning is a line the terminal drawing would leave out.',
    'Line numbers count from the first line inside the fence.',
    '',
  ]

  let listed = 0
  for (const d of flagged) {
    if (listed >= MAX_LISTED) break
    const of = diagrams.length > 1 ? ` of ${diagrams.length}` : ''
    out.push(`Diagram ${d.index}${of} (${d.kind}):`)
    for (const issue of d.issues) {
      if (listed >= MAX_LISTED) break
      out.push(lineOf(issue))
      listed++
    }
  }
  if (total > listed) out.push(`…and ${total - listed} more of the same kinds.`)

  out.push(
    '',
    'Send each of these diagrams again, corrected and complete, in a short follow-up; do not repeat the rest of the reply.',
  )
  return out.join('\n')
}

const lineOf = (issue: Issue) => `- line ${issue.line} \`${issue.text}\`\n  ${issue.severity}: ${issue.message}`
