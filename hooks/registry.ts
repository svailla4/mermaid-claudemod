// The one place the concrete renderers are wired: a new diagram kind is a new
// module in `renderers/` and one line here. The first match wins.

import type { Renderers } from './diagram.ts'
import { classDiagram } from './renderers/class.ts'
import { er } from './renderers/er.ts'
import { fallback } from './renderers/fallback.ts'
import { flowchart } from './renderers/flowchart.ts'
import { sequence } from './renderers/sequence.ts'
import { state } from './renderers/state.ts'

export const RENDERERS: Renderers = {
  kinds: [flowchart, sequence, state, classDiagram, er],
  fallback,
}
