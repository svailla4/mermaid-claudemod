// A drawing's lines with what each cell is, so the terminal can color them.
//
// A styled line is its text plus a string of one role code per cell, which
// stays plain JSON and small enough to hand a scroll box as props, and slices
// by column like the text it describes.

/** What a cell of a drawing is; each role has one look (`paint.tsx`). */
export const ROLE = {
  /** Spaces and anything drawn as plain text. */
  plain: ' ',
  /** The frame of a node, entity, participant or group. */
  border: 'b',
  /** Text inside a node. */
  label: 'l',
  /** The lines of edges, messages and relationships. */
  edge: 'e',
  /** Arrowheads. */
  arrow: 'a',
  /** Text on or beside an edge. */
  edgeLabel: 'n',
  /** A lifeline or other guide that shows where, not what. */
  guide: 'g',
  /** A title: an entity's or class's name, a section heading. */
  heading: 'h',
  /** Key badges of an entity's attributes. */
  primaryKey: 'p',
  foreignKey: 'f',
  uniqueKey: 'u',
  /** Secondary detail: attribute types, cardinalities. */
  detail: 't',
  /** A comment or aside. */
  comment: 'c',
} as const

export type Role = (typeof ROLE)[keyof typeof ROLE]

/** One line of a drawing: `roles` has one code per cell of `text`. */
export type StyledLine = { text: string; roles: string }

/** A run of cells that share a role. */
export type Span = { text: string; role: Role }

/** The cells of a string: box-drawing glyphs and most letters are one cell each. */
export const cellsOf = (s: string): string[] => Array.from(s)

/** A line made of spans, in order. */
export function styled(...spans: Array<Span | string>): StyledLine {
  let text = ''
  let roles = ''
  for (const s of spans) {
    const span = typeof s === 'string' ? { text: s, role: ROLE.plain } : s
    text += span.text
    roles += span.role.repeat(cellsOf(span.text).length)
  }
  return { text, roles }
}

/** A span of `text` in `role`. */
export const span = (text: string, role: Role): Span => ({ text, role })

/** A line of plain text. */
export const plain = (text: string): StyledLine => styled(text)

/** A string's width in terminal cells. */
export const widthOf = (s: string): number => cellsOf(s).length

/** The line's width in cells. */
export const widthOfLine = (l: StyledLine): number => widthOf(l.text)

/** The width of the widest line. */
export const widestLine = (lines: readonly StyledLine[]): number =>
  lines.reduce((w, l) => Math.max(w, widthOfLine(l)), 0)

/** The line padded with plain spaces to `width` cells. */
export function padLine(l: StyledLine, width: number): StyledLine {
  const n = Math.max(0, width - widthOfLine(l))
  return { text: l.text + ' '.repeat(n), roles: l.roles + ROLE.plain.repeat(n) }
}

/** Lines joined side by side. */
export function joinLines(...parts: StyledLine[]): StyledLine {
  return { text: parts.map(p => p.text).join(''), roles: parts.map(p => p.roles).join('') }
}

/** Cells `from` (inclusive) to `to` (exclusive) of the line. */
export function sliceLine(l: StyledLine, from: number, to?: number): StyledLine {
  return {
    text: cellsOf(l.text).slice(from, to).join(''),
    roles: l.roles.slice(from, to),
  }
}

/** The line without trailing spaces. */
export function trimEnd(l: StyledLine): StyledLine {
  const text = l.text.trimEnd()
  return { text, roles: l.roles.slice(0, cellsOf(text).length) }
}

/**
 * The line's runs of one role each. A space shows no color, so it joins the
 * run before it: `paid by` stays one run, and a tree stays small.
 */
export function spansOf(l: StyledLine): Span[] {
  const cells = cellsOf(l.text)
  const spans: Span[] = []
  for (let i = 0; i < cells.length; i++) {
    const last = spans[spans.length - 1]
    const role = (l.roles[i] ?? ROLE.plain) as Role
    if (last && (cells[i] === ' ' || last.role === role)) last.text += cells[i]
    else spans.push({ text: cells[i]!, role: cells[i] === ' ' ? ROLE.plain : role })
  }
  return spans
}

/** Lines without trailing spaces and without blank lines around them. */
export function tidyLines(lines: readonly StyledLine[]): StyledLine[] {
  const out = lines.map(trimEnd)
  while (out.length > 0 && out[0]!.text === '') out.shift()
  while (out.length > 0 && out[out.length - 1]!.text === '') out.pop()
  return out
}
