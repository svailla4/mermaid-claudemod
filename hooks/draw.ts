// Draw one Mermaid diagram as Unicode box art, with the renderer its header
// picks.

import { diagramBody, headerOf, rendererFor } from './diagram.ts'
import type { Renderers } from './diagram.ts'
import { widest } from './lines.ts'

/** A drawing's lines, uncut, and the width of the widest; or why it failed. */
export type Drawn = { ok: true; lines: string[]; width: number } | { ok: false; error: string }

/** Draws a fence's source, aiming to fit `width` columns. */
export type Draw = (source: string, width: number) => Drawn

const CACHE_LIMIT = 200

/**
 * A drawer over `renderers`. A reply is drawn again on every redraw, so each
 * drawer keeps the last drawings it made; make one per module, not per call.
 */
export function createDrawer(renderers: Renderers): Draw {
  const cache = new Map<string, Drawn>()

  return (source, width) => {
    const id = `${width}\u0000${source}`
    const hit = cache.get(id)
    if (hit) return hit

    let drawn: Drawn
    try {
      const body = diagramBody(source)
      const lines = rendererFor(renderers, headerOf(body)).draw(body, width)
      drawn = { ok: true, lines, width: widest(lines) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      drawn = { ok: false, error: message.split('\n')[0]!.slice(0, 160) }
    }

    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
    cache.set(id, drawn)

    return drawn
  }
}
