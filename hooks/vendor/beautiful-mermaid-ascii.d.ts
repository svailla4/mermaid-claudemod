// The part of beautiful-mermaid's API this mod uses (src/ascii/index.ts,
// src/er/parser.ts, src/er/types.ts, src/ascii/types.ts, src/parser.ts).

/** Hex colors (`#rrggbb`) for each role a cell can have. */
export interface AsciiTheme {
  fg: string
  border: string
  line: string
  arrow: string
  accent?: string
  bg?: string
  corner?: string
  junction?: string
}

export interface AsciiRenderOptions {
  useAscii?: boolean
  paddingX?: number
  paddingY?: number
  boxBorderPadding?: number
  colorMode?: 'none' | 'auto' | 'ansi16' | 'ansi256' | 'truecolor' | 'html'
  theme?: Partial<AsciiTheme>
}

export function renderMermaidASCII(text: string, options?: AsciiRenderOptions): string

export type Cardinality = 'one' | 'zero-one' | 'many' | 'zero-many'

export interface ErAttribute {
  type: string
  name: string
  keys: Array<'PK' | 'FK' | 'UK'>
  comment?: string
}

export interface ErEntity {
  id: string
  label: string
  attributes: ErAttribute[]
}

export interface ErRelationship {
  entity1: string
  entity2: string
  cardinality1: Cardinality
  cardinality2: Cardinality
  label: string
  identifying: boolean
}

export interface ErDiagram {
  entities: ErEntity[]
  relationships: ErRelationship[]
}

/** Takes the diagram's trimmed, non-empty, non-comment lines, header included. */
export function parseErDiagram(lines: string[]): ErDiagram

export interface MermaidEdge {
  source: string
  target: string
  label?: string
}

export interface MermaidGraph {
  edges: MermaidEdge[]
}

/** Parses a flowchart or state diagram (its whole text, header included); throws on any other kind. */
export function parseMermaid(text: string): MermaidGraph
