// The part of beautiful-mermaid's ASCII API this mod uses (src/ascii/index.ts).

export interface AsciiRenderOptions {
  useAscii?: boolean
  paddingX?: number
  paddingY?: number
  boxBorderPadding?: number
  colorMode?: 'none' | 'auto' | 'ansi16' | 'ansi256' | 'truecolor' | 'html'
}

export function renderMermaidASCII(text: string, options?: AsciiRenderOptions): string
