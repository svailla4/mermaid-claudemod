// beautiful-mermaid's ASCII renderer, tried at a few spacings until one fits.

import { renderMermaidASCII } from '../vendor/beautiful-mermaid-ascii.js'
import type { AsciiRenderOptions } from '../vendor/beautiful-mermaid-ascii.js'
import { tidy, widest } from '../lines.ts'

/** One way to draw a diagram; called only when the ways before it didn't fit. */
type Attempt = () => string[]

// paddingY below 4 puts edge labels on box borders; border padding adds blank
// rows inside every box.
const ROOMY: AsciiRenderOptions = { paddingX: 4, paddingY: 4, boxBorderPadding: 0, colorMode: 'none' }
const TIGHT: AsciiRenderOptions = { ...ROOMY, paddingX: 2 }

const attempt = (text: string, options: AsciiRenderOptions): Attempt => () => tidy(renderMermaidASCII(text, options))

/** The text drawn tight, for a renderer's own extra attempts. */
export const tight = (text: string): Attempt => attempt(text, TIGHT)

/**
 * The body drawn roomy, then tight, then each of `more`: the first that fits
 * `width`, else the narrowest (the earliest on a tie). An attempt that throws
 * ends the fitting with its error.
 */
export function drawAscii(body: string, width: number, more: readonly Attempt[] = []): string[] {
  let best: string[] = []
  let bestWidth = Infinity

  for (const next of [attempt(body, ROOMY), tight(body), ...more]) {
    const lines = next()
    const w = widest(lines)
    if (w < bestWidth) {
      best = lines
      bestWidth = w
    }
    if (w <= width) break
  }

  return best
}
