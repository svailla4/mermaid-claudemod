// Any header no other renderer claims, handed to the library as written: it
// draws a few more kinds (`xychart`) and rejects the rest with a message that
// says what it expected, which the reply shows.

import type { DiagramRenderer } from '../diagram.ts'
import { ROLE } from '../styled.ts'
import { drawAscii } from './ascii.ts'
import type { Finish } from './ascii.ts'

/**
 * Those kinds are charts, not boxes and edges: their rows are their scale, so
 * nothing is squeezed, and the dotted grid lines step back behind the series.
 */
const chart: Finish = grid => {
  for (const row of grid) for (const c of row) if (c.ch === '·') c.role = ROLE.guide
  return grid
}

export const fallback: DiagramRenderer = {
  kind: 'mermaid',
  matches: () => true,
  draw: (body, width) => drawAscii(body, width, [], chart),
}
