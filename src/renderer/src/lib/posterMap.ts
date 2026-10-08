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
  /**
   * Re3MR's images come whole from tarkov.dev's repository, db4tarkov's as tiles from its CDN, the
   * wiki's whole from its CDN.
   */
  provider: 're3mr' | 'db4tarkov' | 'wiki'
  author: string
  authorLink: string
  version: string
  /** Re3MR: the image; the wiki: its map (src/shared/wikiMaps.ts). */
  file?: string
  /** When not posterMaps.json's licence. */
  license?: string
  /** db4tarkov: its name for the map and the zoom at which a tile pixel is an image pixel. */
  tiles?: { slug: string; maxZoom: number }
  width: number
  height: number
  panels: PosterPanel[]
}

/** Where a position is (and on which floor): `y` null for "no particular floor". */
export type Anchor = { x: number; y: number | null; z: number }

export const POSTER_MAPS: readonly PosterMap[] = (posterData as unknown as { maps: PosterMap[] }).maps

/**
 * When an image arrives at another size than the one calibrated (its source uploaded a new version),
 * what to tell the player: the markers may no longer line up. Null when it matches.
 */
export function sizeMismatch(map: PosterMap, width: number, height: number): string | null {
  if (width === map.width && height === map.height) return null
  return `The ${map.author} map has changed since the app was set up for it (${width}×${height}, not ${map.width}×${map.height}), so markers may be off. An app update will fix it.`
}

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

/** Image pixels → game (x, z) on one panel. */
function invert([a, b, c, d, e, f]: Affine, u: number, v: number): { x: number; z: number } {
  const det = a * d - b * c
  return { x: (d * (u - e) - b * (v - f)) / det, z: (a * (v - f) - c * (u - e)) / det }
}

/** A height on a panel's floor (its middle, or just inside an open end). */
function panelHeight(panel: PosterPanel): number {
  const { minY, maxY } = panel
  if (minY !== null && maxY !== null) return (minY + maxY) / 2
  if (minY !== null) return minY + 1
  if (maxY !== null) return maxY - 1
  return 0
}

/**
 * Where a point on the image is in the game, on the floor drawn there: an inset whose drawing holds
 * it, else the floor that puts it nearest the middle of the map (floors drawn side by side each map
 * the whole level; `gameBounds`, [[x, z], [x, z]], says where the map's middle is).
 */
export function fromImagePoint(
  map: PosterMap,
  [u, v]: [number, number],
  gameBounds: [[number, number], [number, number]] | null = null
): Vec3 {
  for (const panel of map.panels) {
    if (!panel.area) continue
    const [x0, z0, x1, z1] = panel.area
    const [a, b, c, d, e, f] = panel.transform
    const corners = [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1]
    ].map(([x, z]) => [a * x + b * z + e, c * x + d * z + f])
    const us = corners.map((p) => p[0])
    const vs = corners.map((p) => p[1])
    if (u >= Math.min(...us) && u <= Math.max(...us) && v >= Math.min(...vs) && v <= Math.max(...vs))
      return { ...invert(panel.transform, u, v), y: panelHeight(panel) }
  }
  const middle = gameBounds
    ? { x: (gameBounds[0][0] + gameBounds[1][0]) / 2, z: (gameBounds[0][1] + gameBounds[1][1]) / 2 }
    : { x: 0, z: 0 }
  let best: Vec3 | null = null
  let bestDistance = Infinity
  for (const panel of map.panels) {
    if (panel.area) continue
    const at = invert(panel.transform, u, v)
    const distance = Math.hypot(at.x - middle.x, at.z - middle.z)
    if (distance < bestDistance) {
      best = { ...at, y: panelHeight(panel) }
      bestDistance = distance
    }
  }
  return best ?? { ...invert(map.panels[0].transform, u, v), y: 0 }
}
