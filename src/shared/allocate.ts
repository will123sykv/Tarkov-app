import { haveCount, stationLevel, type HideoutProgress } from './hideout'
import type { NeededItem } from './questProgress'
import type { HideoutStation } from './questTypes'

// One shared Have count (since 1.66.0): what's put aside is split across what needs it, in priority
// order, so two needs can't both be ticked off with the same copies. Hideout levels come first (the ones
// in the Items to collect scope), then active quests, then the hideout's later levels, then the other
// quests left. A need that must be found in raid takes only found-in-raid copies; any other takes bought
// copies first, then found-in-raid ones.

/** Something that needs some of an item, as many as `count`, found in raid or not. */
export interface Demand {
  key: string
  itemId: string
  count: number
  fir: boolean
}

/** The copies put aside that cover a need: found-in-raid ones and bought ones. */
export interface Covered {
  fir: number
  any: number
}

export const levelKey = (stationId: string, level: number, itemId: string, fir: boolean): string =>
  `level:${stationId}:${level}:${itemId}:${fir ? 'fir' : 'any'}`
export const questKey = (questId: string, itemId: string, fir: boolean): string =>
  `quest:${questId}:${itemId}:${fir ? 'fir' : 'any'}`

/** What covers each need (by key; a key used twice adds up), going through them in order. */
export function allocateHave(
  progress: Pick<HideoutProgress, 'have' | 'haveFir'>,
  demands: readonly Demand[]
): Map<string, Covered> {
  const stock = new Map<string, Covered>()
  const left = (itemId: string): Covered => {
    let s = stock.get(itemId)
    if (!s) {
      s = { fir: haveCount(progress, itemId, 'fir'), any: haveCount(progress, itemId, 'any') }
      stock.set(itemId, s)
    }
    return s
  }
  const result = new Map<string, Covered>()
  for (const { key, itemId, count, fir } of demands) {
    if (count <= 0) continue
    const s = left(itemId)
    const any = fir ? 0 : Math.min(count, s.any)
    const fromFir = Math.min(count - any, s.fir)
    s.any -= any
    s.fir -= fromFir
    const got = result.get(key) ?? { fir: 0, any: 0 }
    result.set(key, { fir: got.fir + fromFir, any: got.any + any })
  }
  return result
}

/**
 * The needs to share what's put aside across, in priority order: the hideout's levels in `scope` (the
 * next level of each station first), the active quests' hand-overs, the later levels (with scope
 * 'next'), then every other quest's.
 */
export function haveDemands(
  stations: readonly HideoutStation[],
  progress: HideoutProgress,
  scope: 'next' | 'all',
  active: readonly NeededItem[],
  others: readonly NeededItem[] = []
): Demand[] {
  const levels: (Demand & { distance: number })[] = []
  for (const station of stations) {
    const current = stationLevel(station, progress)
    for (const level of station.levels) {
      if (level.level <= current) continue
      for (const { itemId, count, foundInRaid } of level.items)
        levels.push({
          key: levelKey(station.id, level.level, itemId, foundInRaid),
          itemId,
          count,
          fir: foundInRaid,
          distance: level.level - current
        })
    }
  }
  // A stable sort keeps the stations' order within each distance.
  levels.sort((a, b) => a.distance - b.distance)
  const quests = (needs: readonly NeededItem[]): Demand[] =>
    needs.flatMap((n) =>
      n.quests.map((q) => ({
        key: questKey(q.questId, n.itemId, n.foundInRaid),
        itemId: n.itemId,
        count: q.count,
        fir: n.foundInRaid
      }))
    )
  const strip = ({ distance: _, ...d }: Demand & { distance: number }): Demand => d
  const inScope = levels.filter((l) => scope === 'all' || l.distance === 1).map(strip)
  const later = scope === 'all' ? [] : levels.filter((l) => l.distance > 1).map(strip)
  return [...inScope, ...quests(active), ...later, ...quests(others)]
}

/** How much of a need the shared Have covers, by its key (both kinds together). */
export function coveredOf(share: ReadonlyMap<string, Covered>, key: string): number {
  const c = share.get(key)
  return c ? c.fir + c.any : 0
}
