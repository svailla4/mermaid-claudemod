// The entry module: wires the renderers into the drawer and fence finder, and
// hooks the system prompt, the terminal's assistant messages, approved plans
// and the end of each reply, where its diagrams are checked.

import type { Register } from 'claude-code'

import { createChecker } from './check'
import { composeReply } from './compose'
import { isKnownHeader } from './diagram'
import { createDrawer } from './draw'
import { splitFences } from './fences'
import { reportFor } from './gate'
import { inlineDiagrams } from './inline'
import { planReply } from './plan'
import { RENDERERS } from './registry'
import { withSteering } from './steering'

// Cells the transcript takes before a reply's text (the bullet and its gap)
// plus a margin, so drawn lines never touch the edge.
const INDENT = 4
// The same for a tool result's text, which sits under its `⎿`.
const RESULT_INDENT = 8
const DEFAULT_COLUMNS = 100

// One drawer and one checker for the module, so their caches outlive each redraw.
const draw = createDrawer(RENDERERS)
const check = createChecker()
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

  const isChecking = options.check !== false

  // When Claude ends a reply whose diagrams have problems, it is sent back once
  // to fix them: `stop_hook_active` marks the reply that answers a Stop hook,
  // which is let through, so a diagram it still gets wrong can't loop.
  if (isChecking) {
    on('classic.Stop', async ($, e, next) => {
      const result = await next(e)
      if (e.stop_hook_active) return result

      // Warnings are about the terminal's drawing; where the surfaces can't be
      // read, they count rather than the check being lost.
      let warnings = true
      try {
        warnings = (await $.session.surfaces()).includes('terminal')
      } catch {
        // Keep counting them.
      }
      const report = reportFor(e.last_assistant_message ?? '', isDiagramHeader, check, { warnings })
      if (report === undefined) return result

      return { ...result, block: result.block ? `${result.block}\n\n${report}` : report }
    })
  }

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // The desktop and editor draw their own way; a summary row keeps its mark.
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)

    const width = Math.max(40, (e.viewport?.columns ?? DEFAULT_COLUMNS) - INDENT)
    const parts = planReply(splitFences(e.props.text, isDiagramHeader), width, draw, isChecking ? check : undefined)
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
