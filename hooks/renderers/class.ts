// Class diagrams, drawn by the library as they are.

import type { DiagramRenderer } from '../diagram.ts'
import { fitFirst } from '../fit.ts'
import { spacings } from './ascii.ts'

export const classDiagram: DiagramRenderer = {
  kind: 'classDiagram',
  matches: header => /^classDiagram\s*$/.test(header),
  draw: (body, width) => fitFirst(spacings(body), width),
}
