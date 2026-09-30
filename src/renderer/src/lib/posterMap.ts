import type { Vec3 } from '../../../shared/questTypes'
import posterData from '../data/posterMaps.json'

/** Game (x, z) → image pixels: u = a·x + b·z + e, v = c·x + d·z + f. */
export type Affine = [number, number, number, number, number, number]

/**
 * One floor, deck or inset of a 2D map: for positions whose height is in [minY, maxY) and, for an
 * inset of one building, inside its area (game [xMin, zMin, xMax, zMax]).
 */
export interface PosterPanel {
  name: string
  minY: number | null
  maxY: number | null
  area?: [number, number, number, number] | null
  transform: Affine
}

/** A community 2D map, calibrated to game coordinates (see posterMaps.json). */
export interface PosterMap {
  /** tarkov.dev's map key (the map's normalized name). */
  key: string
  /** Re3MR's images come whole from tarkov.dev's repository, db4tarkov's as tiles from its CDN. */
  provider: 're3mr' | 'db4tarkov'
  author: string
  authorLink: string
  version: string
  /** Re3MR: the image. */
  file?: string
  /** db4tarkov: its name for the map and the zoom at which a tile pixel is an image pixel. */
  tiles?: { slug: string; maxZoom: number }
  width: number
  height: number
  panels: PosterPanel[]
}

/** Where a position is (and on which floor): `y` null for "no particular floor". */
export type Anchor = { x: number; y: number | null; z: number }

export const POSTER_MAPS: readonly PosterMap[] = (posterData as unknown as { maps: PosterMap[] }).maps

export function posterFor(mapKey: string): PosterMap | null {
  return POSTER_MAPS.find((m) => m.key === mapKey) ?? null
}

const gap = (panel: PosterPanel, y: number): number =>
  (panel.minY !== null && y < panel.minY ? panel.minY - y : 0) +
  (panel.maxY !== null && y >= panel.maxY ? y - panel.maxY : 0)

const inArea = ([x0, z0, x1, z1]: [number, number, number, number], at: Anchor): boolean =>
  at.x >= x0 && at.x <= x1 && at.z >= z0 && at.z <= z1

/**
 * The panel a position is drawn on: an inset whose area and heights hold it, else the whole-map
 * panel for its height (the nearest one for heights outside every range).
 */
export function panelFor(map: PosterMap, at: Anchor): PosterPanel {
  const y = at.y
  if (y !== null) {
    const inset = map.panels.find((p) => p.area && inArea(p.area, at) && gap(p, y) === 0)
    if (inset) return inset
  }
  let best: PosterPanel | null = null
  let bestGap = Infinity
  for (const panel of map.panels) {
    if (panel.area) continue
    const g = gap(panel, y ?? 0)
    if (g === 0) return panel
    if (g < bestGap) {
      best = panel
      bestGap = g
    }
  }
  return best ?? map.panels[0]
}

/**
 * Where a game position is drawn on the image, in image pixels. `anchor` picks the panel (default:
 * the position itself), so an outline stays on its zone's floor.
 */
export function toImagePoint(map: PosterMap, p: Vec3, anchor: Anchor = p): [number, number] {
  const [a, b, c, d, e, f] = panelFor(map, anchor).transform
  return [a * p.x + b * p.z + e, c * p.x + d * p.z + f]
}
