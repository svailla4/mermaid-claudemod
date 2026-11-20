// The one place the concrete renderers are wired: a new diagram kind is a new
// module in `renderers/` and one line here. The first match wins.

import type { Renderers } from './diagram'
import { classDiagram } from './renderers/class'
import { er } from './renderers/er'
import { fallback } from './renderers/fallback'
import { flowchart } from './renderers/flowchart'
import { sequence } from './renderers/sequence'
import { state } from './renderers/state'

export const RENDERERS: Renderers = {
  kinds: [flowchart, sequence, state, classDiagram, er],
  fallback,
}
