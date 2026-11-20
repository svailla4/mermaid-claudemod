// Sequence diagrams: the text, blocks and participants Mermaid rejects or
// cuts short, and the messages the terminal drawing would leave out.

import { parseSequenceDiagram } from '../vendor/beautiful-mermaid-ascii.js'
import { error, unclosed, warning } from './common'
import type { Issue, KindCheck, Line } from './common'

const BLOCK = /^(loop|alt|opt|par|critical|break|rect|box)\b\s*(.*)$/
/** Each divider and the block it belongs in. */
const DIVIDERS: Record<string, string> = { else: 'alt', and: 'par', option: 'critical' }
const DIVIDER = /^(else|and|option)\b\s*(.*)$/
const PARTICIPANT = /^(?:create\s+)?(?:participant|actor)\s+(.+)$/
const NOTE = /^note\s+(?:over|left of|right of)\s+([^:]*?)\s*(?::(.*))?$/i
/** A message: sender, arrow, `+`/`-` (activate the receiver, deactivate the sender), receiver, text. */
const MESSAGE = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\)|-\))\s*([+-]?)\s*(.+?)\s*(?::(.*))?$/
const ACTIVATION = /^(activate|deactivate)\s+(.+)$/
const QUIET = /^(?:autonumber|title|accTitle|accDescr|destroy|links?|properties|details)\b/

/** How many activations each participant has open. */
type Active = Map<string, number>

/** Ends one activation of `who`, or says why Mermaid refuses to. */
function deactivate(line: Line, active: Active, who: string): Issue | undefined {
  const n = active.get(who) ?? 0
  if (n === 0) {
    return error(line, `${who} isn't active here, and Mermaid refuses to end an activation that never began: activate it first (A->>+${who}), or drop the -`)
  }
  active.set(who, n - 1)
  return undefined
}

/** An entity code (`#59;`, `#quot;`), which Mermaid shows as its character. */
const ENTITY = /#(?:\w+);/g

/** An issue for `;` or `#` in `text` (a message's, a note's or a label), else undefined. */
function textIssue(line: Line, text: string): Issue | undefined {
  const plain = text.replace(ENTITY, '')
  if (plain.includes('#')) return error(line, 'Mermaid cuts this text off at the #: write #35; for a #')
  return undefined
}

/** A `;` with more after it on the line: Mermaid ends the statement there. */
function semicolonIssue(line: Line): Issue | undefined {
  const plain = line.text.replace(ENTITY, '')
  const i = plain.indexOf(';')
  if (i >= 0 && plain.slice(i + 1).trim() !== '') {
    return error(line, 'a ; ends a statement in Mermaid, so the rest of this line breaks the diagram: use a comma, or write #59;')
  }
  return undefined
}

/** Every issue on one line: a `;` and whatever the statement itself gets wrong. */
function checkLine(line: Line, open: Array<{ line: Line; name: string }>, active: Active): Issue[] {
  const semicolon = semicolonIssue(line)
  const rest = checkStatement(line, open, active)
  return [...(semicolon ? [semicolon] : []), ...(Array.isArray(rest) ? rest : rest ? [rest] : [])]
}

function checkStatement(line: Line, open: Array<{ line: Line; name: string }>, active: Active): Issue[] | Issue | undefined {
  const t = line.text

  if (t === 'end') {
    if (open.pop() === undefined) return error(line, '`end` with no block open (loop, alt, opt, par, critical, break, rect or box)')
    return undefined
  }

  const block = BLOCK.exec(t)
  if (block) {
    open.push({ line, name: block[1]! })
    return textIssue(line, block[2]!)
  }

  const divider = DIVIDER.exec(t)
  if (divider) {
    const belongs = DIVIDERS[divider[1]!]!
    if (open[open.length - 1]?.name !== belongs) {
      return error(line, `\`${divider[1]}\` belongs inside a \`${belongs}\` block, before its \`end\``)
    }
    return textIssue(line, divider[2]!)
  }

  const participant = PARTICIPANT.exec(t)
  if (participant) {
    const id = participant[1]!.split(/\s+as\s+/)[0]!.trim()
    if (id === 'end') return error(line, '`end` closes a block, so it can\'t name a participant: call it `End` or `finish`')
    return undefined
  }

  const note = NOTE.exec(t)
  if (note) {
    if (note[2] === undefined) return error(line, 'a note needs its text after a colon: Note over A: text')
    return textIssue(line, note[2])
  }

  const activation = ACTIVATION.exec(t)
  if (activation) {
    const who = activation[2]!.trim()
    if (activation[1] === 'deactivate') return deactivate(line, active, who)
    active.set(who, (active.get(who) ?? 0) + 1)
    return undefined
  }

  if (QUIET.test(t)) return undefined

  const message = MESSAGE.exec(t)
  if (message) {
    const [, from, arrow, mark, to, body] = message
    if (body === undefined) return error(line, `a message needs a colon and its text: ${from}${arrow}${mark}${to}: text`)
    const found: Issue[] = []
    const text = textIssue(line, body)
    if (text) found.push(text)
    // `+` activates the receiver; `-` ends the sender's activation.
    if (mark === '+') active.set(to!, (active.get(to!) ?? 0) + 1)
    if (mark === '-') {
      const refused = deactivate(line, active, from!)
      if (refused) found.push(refused)
    }
    if (found.length === 0 && parseSequenceDiagram(['sequenceDiagram', t]).messages.length === 0) {
      found.push(warning(line, 'the terminal drawing would leave out this message: write it as A->>B: text'))
    }
    return found
  }

  return undefined
}

export const sequenceCheck: KindCheck = {
  kind: 'sequenceDiagram',
  matches: header => /^sequenceDiagram\b/.test(header),
  check(_header, lines) {
    const issues: Issue[] = []
    const open: Array<{ line: Line; name: string }> = []
    const active: Active = new Map()
    for (const line of lines) issues.push(...checkLine(line, open, active))
    return [...issues, ...unclosed(open, 'end')]
  },
}
