/** The diagram the scroll pane shows: its number, source, and the first column drawn. */
export type DiagramView = { n: number; source: string; offset: number }

declare module 'claude-code' {
  interface PluginState {
    'mermaid-render': { view: DiagramView | null }
  }
}
