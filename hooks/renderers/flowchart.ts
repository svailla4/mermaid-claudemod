// Flowcharts (`flowchart`, `graph`): roomy, then tight, then a left-right
// chart turned top-down.

import type { DiagramRenderer } from '../diagram.ts'
import { fitFirst } from '../fit.ts'
import { spacings, tight } from './ascii.ts'

// The keyword must be the whole first token: `graph = build()` is code.
const HEADER = /^(?:graph|flowchart)(?:\s+(?:TD|TB|BT|LR|RL))?(?:\s*;.*)?\s*$/
const SIDEWAYS = /^(\s*(?:graph|flowchart)\s+)(LR|RL)\b/

export const flowchart: DiagramRenderer = {
  kind: 'flowchart',
  matches: header => HEADER.test(header),
  draw(body, width) {
    const attempts = spacings(body)
    if (SIDEWAYS.test(body)) attempts.push(tight(body.replace(SIDEWAYS, '$1TD')))

    return fitFirst(attempts, width)
  },
}
