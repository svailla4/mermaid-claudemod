// The entry module: wires the renderers into the drawer and fence finder, and
// hooks the system prompt, the terminal's assistant messages and approved plans.

import type { Register } from 'claude-code'

import { composeReply } from './compose.tsx'
import { isKnownHeader } from './diagram.ts'
import { createDrawer } from './draw.ts'
import { splitFences } from './fences.ts'
import { inlineDiagrams } from './inline.ts'
import { planReply } from './plan.ts'
import { RENDERERS } from './registry.ts'
import { withSteering } from './steering.ts'

// Cells the transcript takes before a reply's text (the bullet and its gap)
// plus a margin, so drawn lines never touch the edge.
const INDENT = 4
// The same for a tool result's text, which sits under its `⎿`.
const RESULT_INDENT = 8
const DEFAULT_COLUMNS = 100

// One drawer for the module, so its cache outlives each redraw.
const draw = createDrawer(RENDERERS)
const isDiagramHeader = (header: string) => isKnownHeader(RENDERERS, header)

// The transcript's reply bullet is `⏺` on macOS and `●` elsewhere; the hooks
// environment has no platform, so `uname` answers it once per load.
let bullet = '●'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    try {
      const { stdout } = await $.process.run(['uname', '-s'], { timeoutMs: 2000 })
      if (stdout.trim() === 'Darwin') bullet = '⏺'
    } catch {
      // No uname (Windows): keep the default.
    }
    return next(e)
  })

  // On unless the person turned it off in the plugin's settings.
  if (options.steer !== false) {
    on('prompt.compose', async ($, e, next) => {
      const result = await next(e)
      if (!e.surfaces.includes('terminal')) return result

      return { sections: withSteering(result.sections) }
    })
  }

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
        bullet,
      },
    )
  })

  // An approved plan is drawn as ExitPlanMode's result, which takes no tree of
  // the mod's, so its diagrams go into the plan's text as plain box art.
  on('ui.render', { component: 'ToolResult', props: { tool: 'ExitPlanMode' } }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isErrored) return next(e)

    const output = e.props.output as { plan?: unknown } | null | undefined
    if (typeof output?.plan !== 'string') return next(e)

    const width = Math.max(40, (e.viewport?.columns ?? DEFAULT_COLUMNS) - RESULT_INDENT)
    const plan = inlineDiagrams(splitFences(output.plan, isDiagramHeader), width, draw)
    if (plan === undefined) return next(e)

    return next({ ...e, props: { ...e.props, output: { ...output, plan } } })
  })
}
