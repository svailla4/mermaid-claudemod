// Fitting a drawing to a width by trying ways of drawing it in turn.

import { widest } from './lines.ts'

/** One way to draw a diagram; called only when the ways before it didn't fit. */
export type Attempt = () => string[]

/**
 * The first attempt that fits `width`, else the narrowest of them (the
 * earliest on a tie). An attempt that throws ends the fitting with its error.
 */
export function fitFirst(attempts: readonly Attempt[], width: number): string[] {
  let best: string[] | undefined

  for (const attempt of attempts) {
    const lines = attempt()
    if (!best || widest(lines) < widest(best)) best = lines
    if (widest(lines) <= width) break
  }

  return best ?? []
}
