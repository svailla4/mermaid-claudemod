// The entry module: wires the renderers into the drawer and fence finder, and
// hooks the system prompt and the terminal's assistant messages.

import type { Register } from 'claude-code'

import { composeReply } from './compose.tsx'
import { isKnownHeader } from './diagram.ts'
import { createDrawer } from './draw.ts'
import { splitFences } from './fences.ts'
import { planReply } from './plan.ts'
import { RENDERERS } from './registry.ts'
import { withSteering } from './steering.ts'

// Cells the transcript takes before a reply's text (the bullet and its gap)
// plus a margin, so drawn lines never touch the edge.
const INDENT = 4
const DEFAULT_COLUMNS = 100

// One drawer for the module, so its cache outlives each redraw.
const draw = createDrawer(RENDERERS)
const isDiagramHeader = (header: string) => isKnownHeader(RENDERERS, header)

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!e.surfaces.includes('terminal')) return result

    return { sections: withSteering(result.sections) }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // The desktop and editor draw their own way; a summary row keeps its mark.
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)

    const width = Math.max(40, (e.viewport?.columns ?? DEFAULT_COLUMNS) - INDENT)
    const parts = planReply(splitFences(e.props.text, isDiagramHeader), width, draw)
    if (parts === undefined) return next(e)

    return composeReply(
      parts,
      () => $.ui.resolve(e),
      (text, isFirstOfReply) => next({ ...e, props: { ...e.props, text, isFirstOfReply } }),
      {
        width,
        maxRows: Math.max(8, (e.viewport?.rows ?? 40) - 12),
        canScroll: e.viewport?.isFullscreen === true,
        isFirstOfReply: e.props.isFirstOfReply,
      },
    )
  })
}
