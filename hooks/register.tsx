// The entry module: wires the renderers into the drawer and fence finder,
// hooks the system prompt and the terminal's assistant messages, and keeps
// the side pane of diagrams gathered from plans and replies.

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { composeReply } from './compose.tsx'
import { isKnownHeader } from './diagram.ts'
import { createDrawer } from './draw.ts'
import { splitFences } from './fences.ts'
import { diagramsIn, EMPTY, step, withPlan, withReply } from './gallery.ts'
import { drawPane, PANE, PANE_TITLE } from './pane.tsx'
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

// The pane's diagrams, and the file the plan being written is kept in, as
// plan mode's reminders name it.
const gallery = atom({ plugin: 'mermaid-render', key: 'gallery' } as const, EMPTY)
const planPath = atom({ plugin: 'mermaid-render', key: 'planPath' } as const, null)

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
    await $.command.register({ name: 'diagrams', description: 'Show the pane of diagrams from plans and replies' })
    return next(e)
  })

  on('command.run', { command: 'diagrams' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: PANE_TITLE })
    const { diagrams } = await read($, gallery)
    if (!opened.isPlaced) return { text: `The diagrams pane could not open: ${opened.reason}` }
    return { text: diagrams.length > 0 ? `Diagrams pane opened (${diagrams.length}).` : 'Diagrams pane opened; no diagrams yet.' }
  })

  // Plan mode's reminders say where the plan is being written.
  on('prompt.attachment', async ($, e, next) => {
    const isPlan = e.type === 'plan_mode' || e.type === 'plan_mode_reentry' || e.type === 'plan_mode_exit'
    if (isPlan && !e.agentId && e.detail?.planFilePath) {
      const path = e.detail.planFilePath
      await update($, planPath, () => path)
    }
    return next(e)
  })

  // A plan put up for approval brings its diagrams to the pane, opened beside
  // the plan while it is read; the approved text (edited, maybe) has the last word.
  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const showPlan = async (text: string) => {
      const plan = diagramsIn(text, isDiagramHeader, 'plan')
      if (plan.length === 0) return false
      await update($, gallery, g => withPlan(g, plan))
      return true
    }

    // The pane never stands in the plan's way: what fails here is let go.
    let text = ''
    try {
      const path = await read($, planPath)
      text = path ? await $.fs.read(path) : ''
      if (await showPlan(text)) {
        const opened = await $.ui.open({ id: PANE, title: PANE_TITLE })
        if (!opened.isPlaced) $.ui.toast('The plan has diagrams: run /diagrams to see them beside it.')
      }
    } catch {
      // No plan file yet, or the pane can't open here.
    }

    const ran = await next(e)
    const approved = ran.result && 'plan' in ran.result ? ran.result.plan : null
    if (approved && approved !== text) await showPlan(approved).catch(() => false)
    return ran
  })

  // Each finished reply's diagrams join the pane, drawn in the reply as well.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (!e.agentId && e.message.type === 'assistant') {
      try {
        const text = e.message.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n')
        const reply = diagramsIn(text, isDiagramHeader, 'reply')
        if (reply.length > 0) await update($, gallery, g => withReply(g, reply))
      } catch {
        // The reply is kept whatever happens to the pane.
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Client, Text } = $.ui.resolve(e)
    const shown = await read($, gallery)
    if (e.surface !== 'terminal') {
      const titles = shown.diagrams.map((d, i) => `${i + 1}. ${d.title}`)
      return <Text>{titles.length > 0 ? `Diagrams draw in the terminal:\n${titles.join('\n')}` : 'No diagrams yet.'}</Text>
    }

    return drawPane(
      { Box, Button, Client, Text },
      shown,
      draw,
      { columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows, canScroll: e.props.placement === 'dock' },
      by => void update($, gallery, g => step(g, by)),
    )
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
}
