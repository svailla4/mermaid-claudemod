// The diagrams the pane toggles between: found in a plan or a reply, titled
// by the heading above them, and kept as one list with the one shown.

import type { Gallery, GalleryDiagram, DiagramOrigin } from '../types'
import { diagramBody, headerOf } from './diagram.ts'
import { splitFences } from './fences.ts'

/** The most diagrams the pane keeps; the oldest go first. */
export const MAX_DIAGRAMS = 30

export const EMPTY: Gallery = { diagrams: [], index: 0 }

// What a diagram is called when no heading names it, by its header's keyword.
const KIND_TITLE: Record<string, string> = {
  flowchart: 'Flowchart',
  graph: 'Flowchart',
  sequenceDiagram: 'Sequence diagram',
  stateDiagram: 'State diagram',
  'stateDiagram-v2': 'State diagram',
  classDiagram: 'Class diagram',
  erDiagram: 'ER diagram',
  'xychart-beta': 'Chart',
}

/** A markdown heading's text, without its marks and emphasis. */
const headingOf = (line: string) =>
  /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line.trim())?.[1]?.replace(/[*_`]/g, '').trim() || undefined

/**
 * The diagrams in `text`, each titled by the nearest heading above it, else
 * by its kind; a title shared within the text is numbered (`Flows (2)`).
 */
export function diagramsIn(text: string, isDiagramHeader: (header: string) => boolean, origin: DiagramOrigin): GalleryDiagram[] {
  const found: GalleryDiagram[] = []
  let heading: string | undefined

  for (const segment of splitFences(text, isDiagramHeader)) {
    if (segment.kind === 'md') {
      for (const line of segment.text.split('\n')) heading = headingOf(line) ?? heading
      continue
    }
    const keyword = headerOf(diagramBody(segment.source)).split(/\s/)[0] ?? ''
    found.push({ title: heading ?? KIND_TITLE[keyword] ?? keyword, source: segment.source, origin })
  }

  const seen = new Map<string, number>()
  return found.map(d => {
    const n = (seen.get(d.title) ?? 0) + 1
    seen.set(d.title, n)
    return n > 1 ? { ...d, title: `${d.title} (${n})` } : d
  })
}

/** The gallery kept to `MAX_DIAGRAMS`, the shown one moved with the list. */
function capped(diagrams: GalleryDiagram[], index: number): Gallery {
  const drop = Math.max(0, diagrams.length - MAX_DIAGRAMS)
  return { diagrams: diagrams.slice(drop), index: Math.max(0, index - drop) }
}

/**
 * The gallery with a new plan's diagrams in place of the last plan's, added
 * last and the first of them shown. A plan without diagrams changes nothing.
 */
export function withPlan(gallery: Gallery, plan: GalleryDiagram[]): Gallery {
  if (plan.length === 0) return gallery
  const kept = gallery.diagrams.filter(d => d.origin !== 'plan')
  return capped([...kept, ...plan], kept.length)
}

/**
 * The gallery with a reply's diagrams added last, the first of them shown;
 * one already in it (the same source) isn't added twice.
 */
export function withReply(gallery: Gallery, reply: GalleryDiagram[]): Gallery {
  const known = new Set(gallery.diagrams.map(d => d.source))
  const added = reply.filter(d => !known.has(d.source) && known.add(d.source))
  if (added.length === 0) return gallery
  return capped([...gallery.diagrams, ...added], gallery.diagrams.length)
}

/** The gallery showing the diagram `by` steps on, wrapping at either end. */
export function step(gallery: Gallery, by: number): Gallery {
  const n = gallery.diagrams.length
  if (n === 0) return gallery
  return { ...gallery, index: (((gallery.index + by) % n) + n) % n }
}
