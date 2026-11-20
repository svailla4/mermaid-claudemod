// The system-prompt section that asks Claude to write diagrams as Mermaid.

import type { PromptComposeSection } from 'claude-code'

const STEERING = {
  id: 'mermaid-render:diagrams',
  text: [
    'When a diagram would help (architecture, data flow, a state machine, a sequence of calls, entity relationships),',
    'write it as a fenced ```mermaid block using flowchart, sequenceDiagram, stateDiagram-v2, classDiagram or erDiagram',
    'instead of drawing ASCII art by hand: the terminal renders these blocks as diagrams.',
    'Keep node labels short and prefer `flowchart TD` so the drawing stays under about 100 columns.',
    'Write Mermaid that Mermaid accepts:',
    'quote any label holding ( ) [ ] { } | @ or a quote (A["run (fast)"], -->|"x (y)"|) and any subgraph title with a comma or parentheses (subgraph "a, b");',
    'never name a node or participant `end`;',
    'in sequence diagrams put no ; or # in a message, note or block label (write #59; and #35;);',
    'quote ER relationship labels that are not one word (A ||--o{ B : "has many"), and separate keys with commas (PK, FK).',
  ].join(' '),
  scope: 'session',
} as const

/** The sections with the diagram section last, once. */
export function withSteering(sections: readonly PromptComposeSection[]): PromptComposeSection[] {
  return [...sections.filter(s => s.id !== STEERING.id), STEERING]
}
