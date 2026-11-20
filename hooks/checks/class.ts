// Class diagrams: blocks left open or closed twice.

import { error, unclosed } from './common'
import type { Issue, KindCheck, Line } from './common'

export const classCheck: KindCheck = {
  kind: 'classDiagram',
  matches: header => /^classDiagram\b/.test(header),
  check(_header, lines) {
    const issues: Issue[] = []
    const open: Array<{ line: Line; name: string }> = []

    for (const line of lines) {
      const t = line.text
      // A class or namespace body; a body on one line (`class A { +x }`) closes itself.
      if (/\{\s*$/.test(t)) open.push({ line, name: t.replace(/\s*\{\s*$/, '') })
      else if (t === '}' && open.pop() === undefined) issues.push(error(line, '`}` with no `class … {` open'))
    }

    return [...issues, ...unclosed(open, '}')]
  },
}
