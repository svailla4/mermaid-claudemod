import { expect, test } from 'claude-code/testing'

import { checkDiagram, createChecker } from './check'
import type { Severity } from './check'
import { statementsOf } from './checks/flowchart'

// Each case: a diagram, the line flagged (from 1, the header's line), its
// severity, and a phrase of the message. Every error here is a diagram Mermaid
// 11 rejects, or reads otherwise than written (text after a `#`, a state id
// with a space); every diagram in CLEAN, one it accepts and the terminal draws.
type Case = [name: string, source: string, line: number, severity: Severity, says: string]

const F = (...lines: string[]) => ['flowchart TD', ...lines].join('\n')
const Q = (...lines: string[]) => ['sequenceDiagram', ...lines].join('\n')
const S = (...lines: string[]) => ['stateDiagram-v2', ...lines].join('\n')
const E = (...lines: string[]) => ['erDiagram', ...lines].join('\n')
const C = (...lines: string[]) => ['classDiagram', ...lines].join('\n')

const CASES: Case[] = [
  // Flowchart node labels.
  ['parentheses in a label', F('A[run (fast)] --> B'), 2, 'error', 'A["…"]'],
  ['brackets in a label', F('A[list[0]] --> B'), 2, 'error', 'quote it'],
  ['braces in a label', F('A[a {b}] --> B'), 2, 'error', 'quote it'],
  ['a quote in a label', F('A[say "hi"] --> B'), 2, 'error', '#quot;'],
  ['a pipe in a label', F('A[a | b] --> B'), 2, 'error', '`|`'],
  ['an at sign that starts a label', F('A[@team] --> B'), 2, 'error', '`@`'],
  ['an at sign in a label\'s first word', F('A[foo@bar.com] --> B'), 2, 'error', '`@`'],
  ['parentheses in a rounded label', F('A(run (fast)) --> B'), 2, 'error', 'A("…")'],
  ['parentheses in a decision', F('A{ok (y/n)?} --> B'), 2, 'error', 'A{"…"}'],
  ['parentheses in a cylinder', F('A[(db (main))] --> B'), 2, 'error', 'quote it'],
  ['parentheses in a stadium', F('A([run (x)]) --> B'), 2, 'error', 'quote it'],
  ['parentheses in a hexagon', F('A{{a (b)}} --> B'), 2, 'error', 'quote it'],
  ['a label that starts with a slash', F('A[/path] --> B'), 2, 'error', 'trapezoid'],
  ['an empty label', F('A[] --> B'), 2, 'error', 'empty label'],
  ['a label never closed', F('A[oops --> B'), 2, 'error', 'never closed'],
  ['a label on a later line', F('A --> B', 'B[ok] --> C[x (y)]'), 3, 'error', 'C["…"]'],
  // Flowchart links and ids.
  ['parentheses in a link label', F('A -->|run (fast)| B'), 2, 'error', '-->|"run (fast)"|'],
  ['brackets in a link label', F('A -->|a [b]| B'), 2, 'error', 'quote it'],
  ['a unicode arrow', F('A → B'), 2, 'error', 'not a Mermaid link'],
  ['a one-dash arrow', F('A -> B'), 2, 'error', 'not a Mermaid link'],
  ['a link to nothing', F('A --> B -->'), 2, 'error', 'no node after it'],
  ['end as a node', F('start --> end'), 2, 'error', '`end` closes a subgraph'],
  ['a node named in two words', F('Waiting Input --> Done'), 2, 'error', 'Waiting_Input["Waiting Input"]'],
  // Subgraphs.
  ['a comma in a subgraph title', F('subgraph Old, new', '  A', 'end'), 2, 'error', 'subgraph "Old, new"'],
  ['parentheses in a subgraph title', F('subgraph Old (v1)', '  A', 'end'), 2, 'error', 'subgraph "Old (v1)"'],
  ['parentheses in a bracketed title', F('subgraph s1 [Old (v1)]', '  A', 'end'), 2, 'error', 'subgraph id ["Old (v1)"]'],
  ['a subgraph never closed', F('subgraph X', '  A --> B'), 2, 'error', 'never closed'],
  ['an end with no subgraph', F('A --> B', 'end'), 3, 'error', 'no `subgraph` open'],
  ['a statement after the header', 'graph TD; A[run (x)] --> B', 1, 'error', 'quote it'],
  ['a statement after a semicolon', F('A --> B; C[x (y)] --> D'), 2, 'error', 'C["…"]'],
  // Sequence diagrams.
  ['a semicolon in a message', Q('A->>B: save draft; send it'), 2, 'error', 'a ; ends a statement'],
  ['a semicolon in a note', Q('A->>B: x', 'Note over A: queued; sent later'), 3, 'error', 'a ; ends a statement'],
  ['a semicolon in a block label', Q('loop every 5s; poll', 'A->>B: x', 'end'), 2, 'error', 'a ; ends a statement'],
  ['a hash in a message', Q('A->>B: fixes issue #5'), 2, 'error', '#35;'],
  ['a hash in a note', Q('Note over A: see #12'), 2, 'error', '#35;'],
  ['a message with no colon', Q('A->>B'), 2, 'error', 'A->>B: text'],
  ['a note with no colon', Q('Note over A'), 2, 'error', 'Note over A: text'],
  ['an else outside alt', Q('A->>B: x', 'else', 'A->>B: y'), 3, 'error', 'inside a `alt` block'],
  ['an and outside par', Q('alt x', 'A->>B: y', 'and z', 'end'), 4, 'error', 'inside a `par` block'],
  ['a block never closed', Q('alt yes', 'A->>B: x'), 2, 'error', '`alt` is never closed'],
  ['an end with no block', Q('A->>B: x', 'end'), 3, 'error', 'no block open'],
  ['end as a participant', Q('participant end', 'A->>end: x'), 2, 'error', 'can\'t name a participant'],
  ['ending an activation that never began', Q('A->>-B: done'), 2, 'error', 'A isn\'t active here'],
  ['deactivating twice', Q('A->>+B: go', 'B-->>-A: ok', 'B-->>-A: again'), 4, 'error', 'B isn\'t active here'],
  ['a deactivate line for an inactive participant', Q('A->>B: x', 'deactivate B'), 3, 'error', 'B isn\'t active here'],
  // State diagrams.
  ['a hyphen in a state id', S('wait-input --> done'), 2, 'error', 'wait_input'],
  ['a hyphen in a description', S('wait-input: waiting'), 2, 'error', 'state "wait-input" as wait_input'],
  ['a composite state never closed', S('state P {', '  A --> B'), 2, 'error', 'never closed'],
  ['a brace with no state open', S('A --> B', '}'), 3, 'error', 'no `state … {` open'],
  ['a state named in two words', S('Waiting Input --> Done'), 2, 'error', 'links only `Input`'],
  // ER diagrams.
  ['a relationship with no label', E('A ||--o{ B'), 2, 'error', 'A ||--o{ B : has'],
  ['an unquoted label of two words', E('A ||--o{ B : has many'), 2, 'error', 'A ||--o{ B : "has many"'],
  ['a label that starts with a digit', E('A ||--o{ B : 1st'), 2, 'error', '"1st"'],
  ['a label that is a keyword', E('A ||--o{ B : one'), 2, 'error', 'A ||--o{ B : "one"'],
  ['a two-word label in a worded relationship', E('A one or more to zero or many B : has many'), 2, 'error', '"has many"'],
  ['an alias in a relationship', E('A[Account] ||--o{ B : has'), 2, 'error', 'own block'],
  ['an alias on the right of a relationship', E('A ||--o{ B[Bill] : has'), 2, 'error', 'own block'],
  ['an alias with a space, unquoted', E('A[Customer account] {', '  int id', '}'), 2, 'error', 'A["Customer account"] {'],
  ['keys without commas', E('A {', '  int id PK FK', '}'), 3, 'error', 'int id PK, FK'],
  ['a comment before a key', E('A {', '  int id "the id" PK', '}'), 3, 'error', 'comment comes last'],
  ['a type of two words', E('A {', '  double precision amount', '}'), 3, 'error', 'double_precision'],
  ['an attribute with no name', E('A {', '  int', '}'), 3, 'error', 'a type and a name'],
  ['a question mark in a name', E('A {', '  int count?', '}'), 3, 'error', 'write count'],
  ['an entity never closed', E('A {', '  int id'), 2, 'error', '`A {` is never closed'],
  // Class diagrams.
  ['a class never closed', C('class A {', '  +int x'), 2, 'error', 'never closed'],
  ['a brace with no class open', C('class A {', '  +int x', '}', '}'), 5, 'error', 'no `class … {` open'],
]

for (const [name, source, line, severity, says] of CASES) {
  test(`check: ${name}`, () => {
    const issues = checkDiagram(source)
    const issue = issues.find(i => i.line === line)
    expect(issue?.severity).toBe(severity)
    expect(issue?.message).toContain(says)
    expect(issue?.text).toBe(source.split('\n')[line - 1]!.trim())
  })
}

// Diagrams Mermaid 11 accepts and the terminal draws whole: no issue at all.
const CLEAN: Array<[string, string]> = [
  ['quoted labels', F('A["run (fast)"] --> B("a (b)")', 'C{"ok (y/n)?"} -->|"x (y)"| D')],
  ['markdown labels', F('A["`**bold** (x)`"] --> B')],
  ['punctuation that is fine unquoted', F('A[api: x, y & z; #1 <b>] --> B[it\'s a/b]', 'C[1. step] --> D[- item]')],
  ['every link', F('A --> B', 'A --- C', 'A -.-> D', 'A ==> E', 'A <--> F', 'A --o G', 'A --x H', 'A ---> I', 'A ~~~ J', 'A o--o K', 'A x--x L')],
  ['link labels', F('A -->|yes| B', 'A -- yes --> C', 'A -. maybe .-> D', 'A == sure ==> E', 'A -- a (b) --> F', 'A --- |x| G', 'A -- stop --x H', 'A --o|t| I', 'A o-- t --o J')],
  ['edge ids and shapes in Mermaid 11 syntax', F('A e1@--> B', 'e1@{ animate: true }', 'C@{ shape: diam, label: "Ok? (y)" } --> D')],
  ['an at sign after a label\'s first word', F('A[mail @team] --> B[mail me@x]')],
  ['links without spaces', F('A-->B', 'B-.->C', 'my-node-->D', 'A--text-->E')],
  ['ids with dots, hyphens and accents', F('api.v1 --> db-main --> Café')],
  ['ids that start with end', F('A --> End', 'A --> endpoint', 'end1 --> B', 'A --> B[end]')],
  ['subgraph titles', F('subgraph Phase 1: setup', 'A', 'end', 'subgraph "Old, new"', 'B', 'end', 'subgraph s1 [Old, new]', 'C', 'end', 'subgraph One & two / it\'s here?', 'D', 'end')],
  ['nested subgraphs', F('subgraph A', 'subgraph B', 'x --> y', 'end', 'end')],
  ['styles and classes', F('A:::hot --> B', 'classDef hot fill:#f00,stroke:#333;', 'style B fill:#f9f', 'linkStyle 0 stroke:#f00', 'class A hot')],
  ['semicolon statements', 'graph TD;A-->B;B-->C'],
  ['a label given later', F('A --> B', 'B[Bee]')],
  ['front matter and comments', ['---', 'title: x', '---', '%% a comment', 'flowchart LR', '  %% A[bad (x)]', '  A --> B'].join('\n')],
  ['participants with spaces, two-way arrows and activations', Q('participant My Service', 'create participant C', 'A->>My Service: hi', 'A<<->>B: sync', 'A<<-->>C: ack', 'activate B', 'B-->>A: y', 'deactivate B', 'A->>+B: x', 'B-->>-A: z')],
  ['a full sequence diagram', Q('autonumber', 'participant A as Alice (admin)', 'actor B', 'A->>+B: GET /x: y {id: 1} [c] (d) 100%', 'B-->>-A: ok, done', 'A-)B: async', 'A-xB: lost', 'A->>B:', 'Note over A,B: a, b (c)', 'loop every 5s', 'A->>B: poll', 'end', 'alt yes', 'A->>B: x', 'else no', 'A->>B: y', 'end', 'par a', 'A->>B: x', 'and b', 'A->>B: y', 'end', 'critical c', 'A->>B: x', 'option d', 'A->>B: y', 'end', 'rect rgb(0,0,0)', 'A->>B: x', 'end')],
  ['sequence text with entity codes and a trailing semicolon', Q('A->>B: a #59; b #35;1', 'A->>B: x;', 'A->>B: the end')],
  ['a full state diagram', S('[*] --> Idle', 'Idle --> Busy: start (fast) [x]', 'Busy --> Idle: a; b', 'state "Long name" as L', 'L --> [*]', 'state P {', '  [*] --> P1', '}', 'note right of Idle', '  a; b (x)', 'end note', 'note left of Busy: hi', 'state c <<choice>>', 'Busy --> c', 'state "a-b" as AB', 'Idle: waiting for input')],
  ['state ids with dots and classes', S('a.b --> c', 'A:::hot --> B', 'classDef hot fill:#f00')],
  ['ER aliases, worded relationships and plain-word labels', E('A["Customer account"] {', '  int id PK', '}', 'B[Bill] { int n }', 'A one or more to zero or many B : has', 'B only one optionally to 0+ C : zero', 'C ||--o{ D : optionally')],
  ['a full ER diagram', E('A ||--o{ B : has', 'A }o..o{ C : "uses (lookup)"', 'B |o--|| D : has_one', 'B ||--|{ E : has-many', 'A {', '  uuid id PK', '  int org_id PK, FK "the org"', '  text email UK', '  numeric(10,2) price', '  varchar(255) name', '  string *note', '}', 'D { text status PK }')],
  ['a full class diagram', C('class A {', '  <<interface>>', '  +int x', '  +run(int a, int b) void', '}', 'class B~T~', 'A <|-- B', 'A "1" --> "*" B : has', 'namespace N {', '  class C', '}')],
  ['a kind the check does not know', 'gantt\n  title A (b); c\n  x :a1, 2024-01-01, 3d'],
]

for (const [name, source] of CLEAN) {
  test(`check passes ${name}`, () => {
    expect(checkDiagram(source)).toEqual([])
  })
}

test('line numbers count from the first line inside the fence, past blank lines and front matter', () => {
  const source = ['', '---', 'title: x', '---', 'flowchart TD', '', '  A[run (x)] --> B'].join('\n')
  expect(checkDiagram(source).map(i => i.line)).toEqual([7])
})

test('a line with several errors gets each of them, so one fix does not hide another', () => {
  const issues = checkDiagram(Q('App->>-API: save draft; send it #5'))
  expect(issues.map(i => i.line)).toEqual([2, 2, 2])
  expect(issues.map(i => i.message.split(':')[0])).toEqual([
    'a ; ends a statement in Mermaid, so the rest of this line breaks the diagram',
    'Mermaid cuts this text off at the #',
    "App isn't active here, and Mermaid refuses to end an activation that never began",
  ])
})

test('statements split on semicolons outside labels', () => {
  expect(statementsOf('A --> B; C["a; b"] -->|c; d| D[e; f]; E')).toEqual(['A --> B', 'C["a; b"] -->|c; d| D[e; f]', 'E'])
})

test('a checker answers a source it checked from its cache', () => {
  const check = createChecker()
  const source = F('A[run (x)] --> B')
  expect(check(source)).toBe(check(source))
  expect(check(source)).toHaveLength(1)
})
