// State diagrams: the ids and blocks Mermaid rejects, and the transitions the
// terminal drawing would leave out.

import { parseMermaid } from '../vendor/beautiful-mermaid-ascii.js'
import { error, unclosed, warning } from './common'
import type { Issue, KindCheck, Line } from './common'

const TRANSITION = /^(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.*))?$/
const DESCRIPTION = /^([^\s:]+)\s*:\s*(.*)$/
const COMPOSITE = /^state\s+.*\{\s*$/
/** A note over several lines, closed by `end note`. */
const NOTE_START = /^note\s+(?:left|right)\s+of\s+[^:]+$/i

const hyphenated = (line: Line, id: string) =>
  error(line, `a state id can't hold a -: write ${id.replace(/-/g, '_')}, or name it with state "${id}" as ${id.replace(/-/g, '_')}`)

export const stateCheck: KindCheck = {
  kind: 'stateDiagram',
  matches: header => /^stateDiagram(?:-v2)?\b/.test(header),
  check(_header, lines) {
    const issues: Issue[] = []
    const open: Array<{ line: Line; name: string }> = []
    let inNote = false

    for (const line of lines) {
      const t = line.text
      if (inNote) {
        if (/^end\s+note$/i.test(t)) inNote = false
        continue
      }
      if (NOTE_START.test(t)) {
        inNote = true
        continue
      }
      if (/^note\b/i.test(t)) continue

      if (COMPOSITE.test(t)) {
        open.push({ line, name: t.replace(/\s*\{$/, '') })
        continue
      }
      if (t === '}') {
        if (open.pop() === undefined) issues.push(error(line, '`}` with no `state … {` open'))
        continue
      }

      const transition = TRANSITION.exec(t)
      if (transition) {
        // A `:::class` after a state is its style, not part of its id.
        const sides = [transition[1]!, transition[2]!].map(id => id.replace(/:::[\w-]+$/, ''))
        const spaced = sides.find(id => /\s/.test(id))
        if (spaced) {
          const last = spaced.split(/\s+/).pop()
          const id = spaced.replace(/\s+/g, '_')
          issues.push(error(line, `Mermaid reads \`${spaced}\` as separate states and links only \`${last}\`: write ${id}, or name it with state "${spaced}" as ${id}`))
          continue
        }
        const bad = sides.find(id => id !== '[*]' && id.includes('-'))
        if (bad) {
          issues.push(hyphenated(line, bad))
          continue
        }
        if (parseMermaid(`stateDiagram-v2\n${t}`).edges.length === 0) {
          issues.push(
            warning(line, 'the terminal drawing would leave out this transition: write each state as one word of letters, digits and _'),
          )
        }
        continue
      }

      const description = DESCRIPTION.exec(t)
      if (description && description[1]!.includes('-')) issues.push(hyphenated(line, description[1]!))
    }

    return [...issues, ...unclosed(open, '}')]
  },
}
