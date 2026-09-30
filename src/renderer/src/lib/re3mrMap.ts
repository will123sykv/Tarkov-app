import type { Vec3 } from '../../../shared/questTypes'
import re3mrData from '../data/re3mrMaps.json'

/** Game (x, z) → image pixels: u = a·x + b·z + e, v = c·x + d·z + f. */
export type Affine = [number, number, number, number, number, number]

/** One floor or deck of a Re3MR poster, for positions whose height is in [minY, maxY). */
export interface Re3mrPanel {
  name: string
  minY: number | null
  maxY: number | null
  transform: Affine
}

/** A Re3MR 2D map, calibrated to game coordinates (see re3mrMaps.json). */
export interface Re3mrMap {
  /** tarkov.dev's map key (the map's normalized name). */
  key: string
  file: string
  width: number
  height: number
  version: string
  panels: Re3mrPanel[]
}

export const RE3MR_MAPS: readonly Re3mrMap[] = (re3mrData as unknown as { maps: Re3mrMap[] }).maps

export function re3mrFor(mapKey: string): Re3mrMap | null {
  return RE3MR_MAPS.find((m) => m.key === mapKey) ?? null
}

/** The floor or deck a height belongs to; the nearest one for heights outside every range. */
export function panelFor(map: Re3mrMap, y: number): Re3mrPanel {
  let best = map.panels[0]
  let bestGap = Infinity
  for (const panel of map.panels) {
    const below = panel.minY !== null && y < panel.minY ? panel.minY - y : 0
    const above = panel.maxY !== null && y >= panel.maxY ? y - panel.maxY : 0
    const gap = below + above
    if (gap === 0) return panel
    if (gap < bestGap) {
      best = panel
      bestGap = gap
    }
  }
  return best
}

/** Where a game position is drawn on the poster, in image pixels. `floorY` picks the panel (default: p.y). */
export function toImagePoint(map: Re3mrMap, p: Vec3, floorY: number = p.y): [number, number] {
  const [a, b, c, d, e, f] = panelFor(map, floorY).transform
  return [a * p.x + b * p.z + e, c * p.x + d * p.z + f]
}
