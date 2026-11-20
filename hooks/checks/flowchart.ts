// Flowcharts: the labels, links, ids and subgraphs Mermaid rejects, and the
// links the terminal drawing would leave out.

import { parseMermaid } from '../vendor/beautiful-mermaid-ascii.js'
import { error, unclosed, warning } from './common'
import type { Issue, KindCheck, Line } from './common'

const HEADER = /^(?:graph|flowchart)\b/

/** A node id, as Mermaid and the (patched) library read one. */
const ID = /[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*/uy

/** Node shapes, longest opener first; a trapezoid closes with either slash. */
const SHAPES: ReadonlyArray<{ open: string; close: readonly string[] }> = [
  { open: '(((', close: [')))'] },
  { open: '([', close: ['])'] },
  { open: '((', close: ['))'] },
  { open: '[[', close: [']]'] },
  { open: '[(', close: [')]'] },
  { open: '[/', close: ['/]', '\\]'] },
  { open: '[\\', close: ['\\]', '/]'] },
  { open: '{{', close: ['}}'] },
  { open: '[', close: [']'] },
  { open: '(', close: [')'] },
  { open: '{', close: ['}'] },
  { open: '>', close: [']'] },
]

/**
 * A link with no text in it: any length, dotted, thick, circle or cross ends
 * (at either end), invisible. The same forms the (patched) library reads.
 */
const LINK =
  /(?:<|[ox](?=[-=]))?(?:-{2,}>|-\.+->|={2,}>|-{2,}[ox](?=[\s\p{L}\p{N}_|]|$)|-\.+-[ox](?=[\s\p{L}\p{N}_|]|$)|={2,}[ox](?=[\s\p{L}\p{N}_|]|$)|-{3,}|-\.+-|={3,}|~{3,})/uy
/** A link with its text inside: `-- text -->`, `-. text .->`, `== text ==>`, `-- text --x`. */
const TEXT_LINK =
  /(?:<|[ox](?=[-=]))?(?:--|==|-\.)\s*[^-.=\s](?:.*?[^-.=\s])?\s*(?:-{2,}>|-{2,}[ox](?=[\s\p{L}\p{N}_|]|$)|-{3,}|\.-+>|\.-+[ox](?=[\s\p{L}\p{N}_|]|$)|\.-+|={2,}>|={2,}[ox](?=[\s\p{L}\p{N}_|]|$)|={3,})/uy
/** Mermaid 11's id for the link that follows: the `e1@` of `A e1@--> B`. */
const EDGE_ID = /[\p{L}\p{N}_-]+@(?=[-=.~<ox])/uy
/** A `|label|` after a link. */
const PIPE_LABEL = /\s*\|([^|]*)\|/y
/** Arrows that aren't Mermaid's. */
const NOT_A_LINK = /(?:→|⟶|⇒|=>|->|<-(?!-))/y

/**
 * What breaks an unquoted node label (Mermaid 11): brackets, a quote, a pipe,
 * or an at sign in its first word (`A[@team]`, `A[a@b.c]`; `A[mail @team]` is
 * fine). The match is the character to name.
 */
function breaksLabel(label: string): string | undefined {
  const bad = /[()[\]{}"|]/.exec(label)
  if (bad) return bad[0]
  return /^\s*\S*@/.test(label) ? '@' : undefined
}
/** What breaks an unquoted `|label|`. */
const BREAKS_PIPE_LABEL = /[()[\]{}]/
/** What breaks an unquoted subgraph title. */
const BREAKS_TITLE = /[,()]/

const SKIP = /^(?:classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/

const at = (re: RegExp, s: string, i: number) => {
  re.lastIndex = i
  return re.exec(s)
}

/**
 * One line's statements: Mermaid ends one at `;` as well as at a line break.
 * A `;` inside a label (brackets, quotes or `|...|`) is the label's.
 */
export function statementsOf(text: string): string[] {
  if (!text.includes(';')) return [text]
  const out: string[] = []
  const close: Record<string, string> = { '[': ']', '(': ')', '{': '}' }
  const stack: string[] = []
  let quote = false
  let pipe = false
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      if (ch === '"') quote = false
    } else if (ch === '"') {
      quote = true
    } else if (pipe) {
      if (ch === '|') pipe = false
    } else if (ch === '|' && stack.length === 0) {
      pipe = true
    } else if (close[ch]) {
      stack.push(close[ch]!)
    } else if (ch === stack[stack.length - 1]) {
      stack.pop()
    } else if (ch === ';' && stack.length === 0) {
      out.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(text.slice(start).trim())
  return out.filter(s => s.length > 0)
}

/** The end of the label of the shape opened at `i` by node `id`, or an issue. */
function readLabel(s: string, i: number, id: string, shape: (typeof SHAPES)[number], line: Line): number | Issue {
  const start = i + shape.open.length
  const example = `${id}${shape.open}"…"${shape.close[0]}`
  const closerFrom = (from: number) => {
    const found = shape.close.map(c => s.indexOf(c, from)).filter(k => k >= 0)
    return found.length > 0 ? Math.min(...found) : -1
  }

  const quoted = /^\s*"/.exec(s.slice(start))
  if (quoted) {
    const endQuote = s.indexOf('"', start + quoted[0].length)
    const close = endQuote < 0 ? -1 : closerFrom(endQuote + 1)
    if (close < 0) return error(line, `the label of \`${id}\` is never closed: write ${example}`)
    return close + shape.close[0]!.length
  }

  const close = closerFrom(start)
  if (close < 0) {
    if (shape.open.length === 2 && '/\\'.includes(shape.open[1]!) && s.includes(']', start)) {
      return error(line, `\`${shape.open}\` opens a trapezoid, which closes with \`/]\` or \`\\]\`; for a label that starts with ${shape.open[1]}, quote it: ${id}["${shape.open[1]}…"]`)
    }
    return error(line, `\`${shape.open}\` after \`${id}\` is never closed with \`${shape.close[0]}\``)
  }

  const label = s.slice(start, close)
  if (label === '') return error(line, `\`${id}\` has an empty label: drop the brackets, or write ${id}[" "]`)

  const bad = breaksLabel(label)
  if (bad) {
    const instead = bad === '"' ? ' (write #quot; for a quote inside it)' : ''
    return error(line, `a \`${bad}\` breaks an unquoted label: quote it, as in ${example}${instead}`)
  }

  return close + shape.close[0]!.length
}

/**
 * Reads one statement of nodes and links as Mermaid does, stopping (without
 * a claim) at anything it doesn't know. The links it read, or an issue.
 */
function readStatement(s: string, line: Line): { links: number } | Issue {
  let i = 0
  let links = 0
  let endsInLink = false
  // The node just read, while nothing (a link, an `&`) has come after it.
  let lastNode: string | undefined

  while (i < s.length) {
    const ch = s[i]!
    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }
    if (ch === '&') {
      lastNode = undefined
      i++
      continue
    }

    const edgeId = at(EDGE_ID, s, i)
    if (edgeId) {
      i += edgeId[0].length
      continue
    }

    const link = at(LINK, s, i) ?? at(TEXT_LINK, s, i)
    if (link) {
      i += link[0].length
      const pipe = at(PIPE_LABEL, s, i)
      if (pipe) {
        const text = pipe[1]!.trim()
        const bad = text.startsWith('"') ? null : BREAKS_PIPE_LABEL.exec(text)
        if (bad) return error(line, `a \`${bad[0]}\` breaks an unquoted link label: quote it, as in -->|"${text}"|`)
        i += pipe[0].length
      }
      links++
      endsInLink = true
      lastNode = undefined
      continue
    }

    if (at(NOT_A_LINK, s, i)) {
      return error(line, `\`${at(NOT_A_LINK, s, i)![0]}\` is not a Mermaid link: write -->, or -.-> for dotted, ==> for thick`)
    }

    const id = at(ID, s, i)
    if (!id) return { links }

    if (lastNode !== undefined) {
      const words = `${lastNode} ${id[0]}`
      return error(line, `\`${words}\` is two nodes to Mermaid, as an id is one word: write ${words.replace(/\s+/g, '_')}["${words}"]`)
    }
    lastNode = id[0]

    i += id[0].length
    endsInLink = false
    if (id[0] === 'end') {
      return error(line, '`end` closes a subgraph, so it can\'t name a node: call it `done`, `End` or `finish`')
    }

    if (s.startsWith('@{', i)) {
      const close = s.indexOf('}', i)
      if (close < 0) return { links }
      i = close + 1
      continue
    }

    const shape = SHAPES.find(sh => s.startsWith(sh.open, i))
    if (shape) {
      const end = readLabel(s, i, id[0], shape, line)
      if (typeof end !== 'number') return end
      i = end
    }

    const cls = /:::[\w-]+/y
    cls.lastIndex = i
    const m = cls.exec(s)
    if (m) i += m[0].length
  }

  if (endsInLink) return error(line, 'this link has no node after it')
  return { links }
}

/** Whether the terminal drawing reads fewer links from `statement` than Mermaid does. */
function dropsLinks(statement: string, links: number): boolean {
  if (links === 0 || statement.includes('~~~')) return false
  try {
    return parseMermaid(`flowchart TD\n${statement}`).edges.length < links
  } catch {
    return true
  }
}

function checkStatement(s: string, line: Line, open: Array<{ line: Line; name: string }>): Issue | undefined {
  if (s === 'end') {
    if (open.pop() === undefined) return error(line, '`end` with no `subgraph` open')
    return undefined
  }

  if (/^subgraph\b/.test(s)) {
    open.push({ line, name: 'subgraph' })
    const title = s.slice('subgraph'.length).trim()
    const bracketed = /^[\p{L}\p{N}_.-]+\s*\[(.*)\]$/u.exec(title)
    if (bracketed) {
      const label = bracketed[1]!.trim()
      const bad = label.startsWith('"') ? undefined : breaksLabel(label)
      if (bad) return error(line, `a \`${bad}\` breaks an unquoted subgraph title: quote it, as in subgraph id ["${label}"]`)
      return undefined
    }
    if (!title.startsWith('"') && BREAKS_TITLE.test(title)) {
      return error(line, `a subgraph title with a comma or parentheses must be quoted: subgraph "${title}"`)
    }
    return undefined
  }

  if (SKIP.test(s)) return undefined

  const read = readStatement(s, line)
  if ('severity' in read) return read
  if (dropsLinks(s, read.links)) {
    return warning(
      line,
      'the terminal drawing would leave out a link on this line: write each link as A --> B, A -.-> B or A ==> B, with any label as -->|text|',
    )
  }
  return undefined
}

export const flowchartCheck: KindCheck = {
  kind: 'flowchart',
  matches: header => HEADER.test(header),
  check(header, lines) {
    const issues: Issue[] = []
    const open: Array<{ line: Line; name: string }> = []

    // Statements may follow the header on its line: `graph TD; A --> B`.
    const rest = statementsOf(header.text).slice(1)
    const all: Array<[Line, string[]]> = [[header, rest], ...lines.map(l => [l, statementsOf(l.text)] as [Line, string[]])]

    for (const [line, statements] of all) {
      for (const s of statements) {
        const found = checkStatement(s, line, open)
        if (found) {
          issues.push(found)
          break
        }
      }
    }

    return [...issues, ...unclosed(open, 'end')]
  },
}
