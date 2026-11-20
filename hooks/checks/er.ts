// ER diagrams: the relationship labels, attributes and blocks Mermaid
// rejects, and the relationships the terminal drawing would leave out.

import { parseErDiagram } from '../vendor/beautiful-mermaid-ascii.js'
import { error, unclosed, warning } from './common'
import type { Issue, KindCheck, Line } from './common'

/** A cardinality written in words (`one or more`, `0+`), as Mermaid reads them. */
const WORDS = String.raw`(?:zero or more|zero or many|one or more|one or many|zero or one|one or zero|only one|many\(0\)|many\(1\)|0\+|1\+|1)`
const RELATIONSHIP = new RegExp(
  String.raw`^(\S+)\s+([|o}{]+(?:--|\.\.)[|o}{]+|${WORDS}\s*(?:--|\.\.|optionally to|to)\s*${WORDS})\s+(\S+)\s*(?::\s*(.*))?$`,
)
/** An entity's block, with any alias it shows: `A {`, `A["Customer account"] {`, `A[Bill] { int n }`. */
const BLOCK = /^([^\s[{]+)(?:\[([^\]]*)\])?\s*\{(.*)$/
/** An alias in a relationship (`A[Account] ||--o{ B`), which only a block may give. */
const ALIAS_IN_RELATIONSHIP = /^[^\s[]+\[[^\]]*\]\s*(?:[|o}{]|zero|one|only|many|[01]\b)|(?:--|\.\.|\bto)\s*\S*\s+[^\s[]+\[[^\]]*\]\s*:/
/** A label Mermaid takes unquoted: one word, not starting with a digit. */
const BARE_LABEL = /^[\p{L}_][\p{L}\p{N}_.-]*$/u
/** Words Mermaid reads as part of a relationship (a cardinality, `to`), never as a bare label. */
const RESERVED_LABEL = /^(?:one|many|to)$/i
const KEYS = /^(?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*$/i
const SPACED_KEYS = /^(?:PK|FK|UK)(?:\s+(?:PK|FK|UK))+$/i

function checkRelationship(line: Line, m: RegExpExecArray): Issue | undefined {
  const [, a, cardinality, b, label] = m
  if (label === undefined) {
    return error(line, `a relationship needs a label after a colon: ${a} ${cardinality} ${b} : has`)
  }
  const text = label.trim()
  if (!text.startsWith('"') && !BARE_LABEL.test(text)) {
    return error(line, `a label that isn't one word must be quoted: ${a} ${cardinality} ${b} : "${text}"`)
  }
  if (RESERVED_LABEL.test(text)) {
    return error(line, `\`${text}\` is a Mermaid keyword, so as a label it must be quoted: ${a} ${cardinality} ${b} : "${text}"`)
  }
  if (parseErDiagram(['erDiagram', line.text]).relationships.length === 0) {
    return warning(line, 'the terminal drawing would leave out this relationship: write it as A ||--o{ B : label')
  }
  return undefined
}

/** An attribute line: `type name`, then keys (`PK, FK`), then a quoted comment, last. */
function checkAttribute(line: Line): Issue | undefined {
  const t = line.text
  const quote = t.indexOf('"')
  const before = (quote < 0 ? t : t.slice(0, quote)).trim()
  if (quote >= 0) {
    const end = t.indexOf('"', quote + 1)
    if (end < 0) return error(line, 'this comment is never closed with a "')
    if (t.slice(end + 1).trim() !== '') return error(line, 'the comment comes last: type name PK "comment"')
  }

  const m = /^(\S+)\s+(\S+)(.*)$/.exec(before)
  if (!m) return error(line, 'an attribute needs a type and a name: string name')
  const [, type, name, rest] = m
  // A type with a space inside parentheses (`numeric(10, 2)`) is left alone.
  if (type!.includes('(') && !type!.includes(')')) return undefined

  if (name!.includes('?')) return error(line, `a ? breaks an attribute name: write ${name!.replace(/\?/g, '')}`)

  const keys = rest!.trim()
  if (keys === '' || KEYS.test(keys)) return undefined
  if (SPACED_KEYS.test(keys)) return error(line, `separate keys with commas: ${type} ${name} ${keys.split(/\s+/).join(', ')}`)
  return error(line, `an attribute is a type, a name, then keys and a comment; a type of several words needs one, as in double_precision`)
}

export const erCheck: KindCheck = {
  kind: 'erDiagram',
  matches: header => /^erDiagram\b/.test(header),
  check(_header, lines) {
    const issues: Issue[] = []
    const open: Array<{ line: Line; name: string }> = []

    for (const line of lines) {
      const t = line.text
      if (open.length > 0) {
        if (t === '}') open.pop()
        else {
          const found = checkAttribute(line)
          if (found) issues.push(found)
        }
        continue
      }

      const block = BLOCK.exec(t)
      if (block) {
        const [, name, alias, rest] = block
        if (alias !== undefined && !alias.trim().startsWith('"') && /\s/.test(alias.trim())) {
          issues.push(error(line, `an alias with spaces must be quoted: ${name}["${alias.trim()}"] {`))
        }
        // A block on one line, `NAME { type name PK }`, is read whole.
        if (rest!.trim() === '') open.push({ line, name: `${name} {` })
        continue
      }

      if (ALIAS_IN_RELATIONSHIP.test(t)) {
        issues.push(error(line, 'an alias goes on the entity\'s own block (A["Account"] { … }), not in a relationship: name the entity by its id here'))
        continue
      }

      const relationship = RELATIONSHIP.exec(t)
      if (relationship) {
        const found = checkRelationship(line, relationship)
        if (found) issues.push(found)
      }
    }

    return [...issues, ...unclosed(open, '}')]
  },
}
