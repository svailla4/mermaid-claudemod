// Measuring and trimming lines of box art in terminal cells.

/** Display width in terminal cells (box-drawing glyphs are one cell each). */
export function widthOf(line: string): number {
  return Array.from(line).length
}

/** The width of the widest line. */
export function widest(lines: string[]): number {
  return lines.reduce((w, l) => Math.max(w, widthOf(l)), 0)
}

/** The line cut to `width` cells, its last cell an ellipsis when cut. */
export function cut(line: string, width: number): string {
  const chars = Array.from(line)

  return chars.length <= width ? line : chars.slice(0, width - 1).join('') + '…'
}

/** Text padded with spaces to `width` cells, on the right or the left. */
export const pad = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - widthOf(s)))
export const padStart = (s: string, width: number) => ' '.repeat(Math.max(0, width - widthOf(s))) + s

/** A drawing's lines without trailing spaces or blank lines around it. */
export function tidy(art: string): string[] {
  const lines = art.split('\n').map(l => l.replace(/\s+$/, ''))

  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  return lines
}
