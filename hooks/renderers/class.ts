// Class diagrams, drawn by the library as they are.

import type { DiagramRenderer } from '../diagram.ts'
import { drawAscii } from './ascii.ts'

export const classDiagram: DiagramRenderer = {
  kind: 'classDiagram',
  matches: header => /^classDiagram\s*$/.test(header),
  draw: (body, width) => drawAscii(body, width),
}
