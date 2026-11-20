// What the diagram check finds, and the shape of each kind's check.

/**
 * `error`: Mermaid itself rejects the line, or reads it otherwise than
 * written (cuts its text short at a `#`, takes a state id with a space for
 * two states), so GitHub, the desktop app and every other renderer fail on
 * it. `warning`: Mermaid accepts it, but the terminal drawing would leave
 * something out.
 */
export type Severity = 'error' | 'warning'

/** One problem, on one line of a diagram's source. */
export type Issue = {
  /** The line in the fence's source, from 1 (the first line after the opening fence). */
  line: number
  /** That line, trimmed. */
  text: string
  severity: Severity
  /** What is wrong and how to write it instead. */
  message: string
}

/** A line of a diagram as a check reads it: its number in the fence and its text, trimmed. */
export type Line = { n: number; text: string }

/** Checks one kind of diagram: the header it claims, and the lines after the header. */
export interface KindCheck {
  readonly kind: string
  matches(header: string): boolean
  check(header: Line, lines: readonly Line[]): Issue[]
}

export const error = (line: Line, message: string): Issue => ({
  line: line.n,
  text: line.text,
  severity: 'error',
  message,
})

export const warning = (line: Line, message: string): Issue => ({
  line: line.n,
  text: line.text,
  severity: 'warning',
  message,
})

/**
 * The blocks still open at the end, each reported where it opened. A check
 * pushes `{ line, name }` when a block opens and pops it at its close.
 */
export const unclosed = (open: ReadonlyArray<{ line: Line; name: string }>, closer: string): Issue[] =>
  open.map(b => error(b.line, `\`${b.name}\` is never closed: add a line \`${closer}\` after its last line`))
