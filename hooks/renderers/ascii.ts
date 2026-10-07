// beautiful-mermaid's ASCII renderer, as the attempts the library-drawn kinds
// try: roomy spacing first, then tight.

import { renderMermaidASCII } from '../vendor/beautiful-mermaid-ascii.js'
import type { AsciiRenderOptions } from '../vendor/beautiful-mermaid-ascii.js'
import type { Attempt } from '../fit.ts'
import { tidy } from '../lines.ts'

// paddingY below 4 puts edge labels on box borders; border padding adds blank
// rows inside every box.
const ROOMY: AsciiRenderOptions = { paddingX: 4, paddingY: 4, boxBorderPadding: 0, colorMode: 'none' }
const TIGHT: AsciiRenderOptions = { paddingX: 2, paddingY: 4, boxBorderPadding: 0, colorMode: 'none' }

const attempt =
  (options: AsciiRenderOptions) =>
  (text: string): Attempt =>
  () =>
    tidy(renderMermaidASCII(text, options))

export const roomy = attempt(ROOMY)
export const tight = attempt(TIGHT)

/** The text drawn roomy, then tight. */
export const spacings = (text: string): Attempt[] => [roomy(text), tight(text)]
