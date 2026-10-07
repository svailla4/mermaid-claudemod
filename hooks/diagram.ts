// What a diagram is to this mod, and how a renderer is chosen for one. The
// hooks reach renderers only through the `Renderers` set `registry.ts` wires.

import type { StyledLine } from './styled.ts'

/** Draws one kind of diagram as lines of Unicode box art, each cell with its role. */
export interface DiagramRenderer {
  /** The kind's name, as its header spells it (`flowchart`, `erDiagram`). */
  readonly kind: string
  /** Whether this renderer draws a diagram whose trimmed first line is `header`. */
  matches(header: string): boolean
  /**
   * The drawing, uncut: as narrow as the kind can make it when it can't fit
   * `width`. Throws when the body can't be drawn; the message is shown.
   */
  draw(body: string, width: number): StyledLine[]
}

/**
 * The renderers of the kinds the mod knows, and the one that tries any other
 * header (it isn't consulted to decide whether a fence holds a diagram).
 */
export type Renderers = { kinds: readonly DiagramRenderer[]; fallback: DiagramRenderer }

/** The first renderer whose kind matches `header`, else the fallback. */
export function rendererFor(renderers: Renderers, header: string): DiagramRenderer {
  return renderers.kinds.find(r => r.matches(header)) ?? renderers.fallback
}

/** Whether `header` opens a diagram of a kind the mod knows. */
export function isKnownHeader(renderers: Renderers, header: string): boolean {
  return renderers.kinds.some(r => r.matches(header))
}

/** The source with any front matter and leading `%%` comment lines removed. */
export function diagramBody(source: string): string {
  const lines = source.split('\n')
  let i = 0

  while (i < lines.length && lines[i]!.trim() === '') i++

  if (lines[i]?.trim() === '---') {
    const end = lines.findIndex((l, j) => j > i && l.trim() === '---')
    if (end !== -1) i = end + 1
  }

  while (i < lines.length && (lines[i]!.trim() === '' || lines[i]!.trim().startsWith('%%'))) i++

  return lines.slice(i).join('\n')
}

/** A body's header: its first line, trimmed. */
export function headerOf(body: string): string {
  return body.split('\n')[0]?.trim() ?? ''
}
