// Any header no other renderer claims, handed to the library as written: it
// draws a few more kinds (`xychart`) and rejects the rest with a message that
// says what it expected, which the reply shows.

import type { DiagramRenderer } from '../diagram.ts'
import { fitFirst } from '../fit.ts'
import { spacings } from './ascii.ts'

export const fallback: DiagramRenderer = {
  kind: 'mermaid',
  matches: () => true,
  draw: (body, width) => fitFirst(spacings(body), width),
}
