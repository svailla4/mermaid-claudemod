// The values this mod keeps in `$.state`, the session's: the diagrams the
// pane toggles between, and where the plan being written is kept.

/** Where a diagram in the pane came from: the plan put up for approval, or a reply. */
export type DiagramOrigin = 'plan' | 'reply'

/** One diagram the pane can show: its title, its fence's source, its origin. */
export type GalleryDiagram = { title: string; source: string; origin: DiagramOrigin }

/** The pane's diagrams, oldest first, and which one it shows. */
export type Gallery = { diagrams: GalleryDiagram[]; index: number }

declare module 'claude-code' {
  interface PluginState {
    'mermaid-render': { gallery: Gallery; planPath: string | null }
  }
}
