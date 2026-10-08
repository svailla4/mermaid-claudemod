# mermaid-render

A [Claude Code](https://claude.com/claude-code) plugin that draws Mermaid diagrams right in the terminal. When Claude answers with a ` ```mermaid ` block, you see the diagram as colored box art in the reply instead of the raw source. Diagrams too wide for the window sit in a framed box you can scroll.

```
  ╭───────────────╮
  │ AUTHOR        │
  ├───────────────┤
  │ PK id    uuid │
  │ UK email text │
  ╰───────┬───────╯
          │
          │ 1
          │ writes
          │ 0..n
          │
╭─────────┴─────────╮
│ POST              │
├───────────────────┤
│ PK id        uuid │
│ FK author_id uuid │
│    title     text │
╰───────────────────╯
```

In the terminal the drawing is colored with your Claude Code theme.

## Install

Requires Claude Code **2.1.292 or later**, the first builds with plugin hook modules.

In Claude Code:

```
/plugin install mermaid-render --marketplace svailla4/mermaid-claudemod
```

Answer `y` to add the marketplace and pick the user scope, so it works in every project. Or, from a shell:

```bash
claude plugin marketplace add svailla4/mermaid-claudemod
claude plugin install mermaid-render@mermaid-render --scope user
```

## What it does

- **Draws diagrams in replies.** Closed ` ```mermaid ` (or ` ```mmd `) blocks become Unicode box art. So do unlabeled blocks whose first line is a diagram header such as `flowchart TD` or `erDiagram`. Only the screen changes: the conversation keeps the source, and ctrl+o shows it.
- **Fits your window.** It tries roomy spacing, then tight, then turns a left-to-right flowchart top-down. It also wraps long sequence messages.
- **Scrolls wide diagrams in place.** A diagram that still doesn't fit is drawn in a framed box in the reply:
  - Drag inside the box to pan.
  - Or click it and use ← → ↑ ↓; Shift+← → moves a full width.
  - PageUp/PageDown and Home/End jump.
  - Esc gives the keyboard back to the prompt.
  - The frame shows the diagram kind and your position.
- **Follows your theme.** Colors are Claude Code theme roles, never fixed RGB:
  - frames are muted;
  - edges and arrows use the accent color;
  - edge labels are dim italic;
  - ER keys get badges (PK, FK, UK).

  Every color also has a text or shape cue, so nothing depends on color alone.
- **Draws diagrams in approved plans.** Once you approve a plan in plan mode, its diagrams show as box art where the plan appears in the transcript. They are uncolored, and one too wide for the window keeps its source. The approval dialog itself can't be changed by a plugin, so it still shows the source.
- **Asks Claude to use Mermaid.** A short system-prompt section asks Claude to draw diagrams as Mermaid instead of hand-made ASCII art. You can turn it off (see Settings).

### Supported diagrams

| Kind | Notes |
|---|---|
| `flowchart` / `graph` | All directions. LR/RL turn top-down when that fits better. |
| `stateDiagram` / `stateDiagram-v2` | `[*]` is drawn as Start/End. A self-transition is a small loop on its state's box (`├─╮ save` over `│◄╯`), or a note under the drawing when there's no room beside the box. |
| `sequenceDiagram` | Long messages wrap to fit. `alt`/`loop` blocks are titled on their frame. |
| `classDiagram` | |
| `erDiagram` | Entity boxes joined by relationship lines, each with its verb and a cardinality at each end (`1`, `0..1`, `1..n`, `0..n`); dashed when not identifying. |
| `xychart-beta` | Drawn by the library as is. |

Other kinds (`gantt`, `pie`, `timeline`, `mindmap` and so on) stay as source, with a one-line note saying why.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `steer` | `true` | Adds the system-prompt section that asks Claude to write diagrams as Mermaid. |

The installer may say this option is "not yet set"; until you set it, the default applies.

Change it with `/plugin configure mermaid-render` in Claude Code, or from a shell:

```bash
echo '{"steer": "false"}' | claude plugin configure mermaid-render@mermaid-render --values-stdin
```

## Known limitations

- **Scrolling needs the fullscreen layout.** That's the default; `"tui": "fullscreen"` in settings. On the main screen (inside tmux by default, or with `CLAUDE_CODE_NO_FLICKER=0`), the box still appears and shows the start of the diagram, but mouse and keys can't reach it.
- **Terminal only.** The desktop app and the VS Code extension show Mermaid source as usual.
- **Long chains are refused.** The layout engine never finishes on a flowchart or state diagram whose longest path passes about 25 nodes. Such a chart would freeze the terminal, so charts with a path longer than 22 nodes keep their source, with a note to split them.
- **Very long ER chains are drawn more simply.** ER lines go through the same layout engine, with a stop on each relationship for its verb and cardinalities. When those stops would make a chain too long (more than about ten entities in a row), the entities are joined directly, each line labeled `1 verb 0..n` in source order. A chain of more than 22 entities keeps its source, like a long flowchart. A relationship whose line can't run straight past its verb (an entity related to itself, say) shows `1 verb 0..n` in a small box on the line.
- **Layout quirks from the library**, left as they are:
  - edges from the same node can merge onto one path;
  - an inheritance arrow (`△`) can be lost where edges merge;
  - state names can sit one column off center;
  - subgraph titles and composite states are drawn plainly;
  - a dotted edge can start one cell away from its box.

## How it works

The plugin is a Claude Code hooks module (`hooks/register.tsx`). A `ui.render` hook on assistant messages finds diagram blocks, draws them, and composes the reply:

- the engine still draws the surrounding markdown;
- each diagram sits between those runs, colored;
- a diagram too wide to fit goes in a `Client` scroll box (`hooks/viewer.tsx`).

Drawing goes through one renderer per diagram kind (`hooks/renderers/`), behind a small interface (`hooks/diagram.ts`) and one registry (`hooks/registry.ts`). Adding a kind means a new module plus one line in the registry.

ER diagrams borrow the flowchart layout (`hooks/renderers/er.ts`). Each entity becomes a placeholder node the size of its box. Each relationship becomes a small node between its two entities, which is how each cardinality knows its end. The mod then draws its own boxes, lines and labels over the placeholders.

The ASCII layout comes from [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) (MIT, Craft Docs). Hooks run without Node, so the library is bundled into `hooks/vendor/beautiful-mermaid-ascii.js`. Rebuild it from the npm package, verified against npm's integrity hash, with:

```bash
ESBUILD=/path/to/esbuild ./scripts/build-vendor.sh   # or let it use npx esbuild@0.28.2
```

## What it runs and sends

- **No network.** The plugin makes no requests and sends nothing anywhere; diagrams are drawn locally from the reply text.
- **One command.** At session start it runs `uname -s` once, to match the transcript's reply bullet (`⏺` on macOS, `●` elsewhere). Nothing else is run.
- **The system prompt.** With `steer` on, it adds a short section to the system prompt. Nothing else in the conversation is changed: only the screen is.
- **No files written.** Settings live in Claude Code's own plugin configuration.

## Development

```bash
claude plugin validate .   # manifest and hooks module, as the engine reads them
claude plugin test .       # the test suite (hooks/*.test.ts)
claude --plugin-dir .      # try it in a session, reloading on save
```

## License

MIT; see [LICENSE](LICENSE). The bundled beautiful-mermaid is MIT, Copyright (c) 2026 Craft Docs; see `hooks/vendor/LICENSE-beautiful-mermaid`.

This is an independent project. It is not affiliated with or endorsed by the [Mermaid](https://mermaid.js.org) project, Craft Docs, or Anthropic.
