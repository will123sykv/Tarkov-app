import { haveCount, stationLevel, type HideoutProgress } from './hideout'
import type { NeededItem } from './questProgress'
import type { HideoutStation } from './questTypes'

// One shared Have count (since 1.66.0): what's put aside is split across what needs it, in priority
// order, so two needs can't both be ticked off with the same copies. Hideout levels come first (the ones
// in the Items to collect scope, those you can build now first since 1.72.0), then active quests, then
// the hideout's later levels, then the other quests left. A need that must be found in raid takes only
// found-in-raid copies; any other takes bought copies first, then found-in-raid ones left once the needs
// in its group that must be found in raid have theirs (since 1.72.0).

/** Something that needs some of an item, as many as `count`, found in raid or not. */
export interface Demand {
  key: string
  itemId: string
  count: number
  fir: boolean
  /**
   * Its priority group (since 1.72.0): needs in a lower group are covered first. In a group, needs that
   * must be found in raid get found-in-raid copies before the others take what's left of them.
   */
  tier?: number
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
  const give = (key: string, fir: number, any: number): void => {
    const got = result.get(key) ?? { fir: 0, any: 0 }
    result.set(key, { fir: got.fir + fir, any: got.any + any })
  }
  // A group at a time: in order of the demands, each group being the needs next to each other in one tier.
  for (let start = 0; start < demands.length;) {
    let end = start + 1
    while (end < demands.length && demands[end].tier === demands[start].tier) end++
    const group = demands.slice(start, end).filter((d) => d.count > 0)
    start = end
    // First found-in-raid copies to the needs that must be found in raid, and bought ones to the others…
    const short = new Map<Demand, number>()
    for (const d of group) {
      const s = left(d.itemId)
      const got = Math.min(d.count, d.fir ? s.fir : s.any)
      if (d.fir) s.fir -= got
      else s.any -= got
      give(d.key, d.fir ? got : 0, d.fir ? 0 : got)
      if (!d.fir && got < d.count) short.set(d, d.count - got)
    }
    // …then the others take what's left of the found-in-raid ones.
    for (const [d, missing] of short) {
      const s = left(d.itemId)
      const got = Math.min(missing, s.fir)
      s.fir -= got
      give(d.key, got, 0)
    }
  }
  return result
}

/** Every need that got copies of an item, with how many (since 1.72.0). */
export function whereCopiesWent(
  share: ReadonlyMap<string, Covered>,
  itemId: string
): { key: string; count: number }[] {
  const out: { key: string; count: number }[] = []
  for (const [key, c] of share) {
    const parsed = parseKey(key)
    if (parsed?.itemId === itemId && c.fir + c.any > 0) out.push({ key, count: c.fir + c.any })
  }
  return out
}

/** What a need's key is for: a hideout level's part, or a quest's hand-over. */
export function parseKey(
  key: string
):
  | { kind: 'level'; stationId: string; level: number; itemId: string; fir: boolean }
  | { kind: 'quest'; questId: string; itemId: string; fir: boolean }
  | null {
  const parts = key.split(':')
  if (parts[0] === 'level' && parts.length === 5)
    return {
      kind: 'level',
      stationId: parts[1],
      level: Number(parts[2]),
      itemId: parts[3],
      fir: parts[4] === 'fir'
    }
  if (parts[0] === 'quest' && parts.length === 4)
    return { kind: 'quest', questId: parts[1], itemId: parts[2], fir: parts[3] === 'fir' }
  return null
}

/**
 * The needs to share what's put aside across, in priority order: the hideout's levels in `scope` (the
 * next level of each station first, those you can build now before the rest since 1.72.0), the active
 * quests' hand-overs, the later levels (with scope 'next'), then every other quest's.
 */
export function haveDemands(
  stations: readonly HideoutStation[],
  progress: HideoutProgress,
  scope: 'next' | 'all',
  active: readonly NeededItem[],
  others: readonly NeededItem[] = []
): Demand[] {
  const byId = new Map(stations.map((s) => [s.id, s]))
  // Its other stations and trader loyalty met: it can be built once its items are in.
  const buildable = (level: HideoutStation['levels'][number]): boolean =>
    level.stations.every((r) => {
      const other = byId.get(r.stationId)
      return !other || stationLevel(other, progress) >= r.level
    }) && level.traders.every((r) => (progress.traders?.[r.traderId] ?? 1) >= r.level)
  const levels: (Demand & { distance: number; order: number })[] = []
  for (const station of stations) {
    const current = stationLevel(station, progress)
    for (const level of station.levels) {
      if (level.level <= current) continue
      const distance = level.level - current
      // The next levels you can build come before the ones still waiting on something else.
      const order = distance === 1 ? (buildable(level) ? 0 : 1) : distance + 1
      for (const { itemId, count, foundInRaid } of level.items)
        levels.push({
          key: levelKey(station.id, level.level, itemId, foundInRaid),
          itemId,
          count,
          fir: foundInRaid,
          distance,
          order
        })
    }
  }
  // A stable sort keeps the stations' order within each group.
  levels.sort((a, b) => a.order - b.order)
  const quests = (needs: readonly NeededItem[], tier: number): Demand[] =>
    needs.flatMap((n) =>
      n.quests.map((q) => ({
        key: questKey(q.questId, n.itemId, n.foundInRaid),
        itemId: n.itemId,
        count: q.count,
        fir: n.foundInRaid,
        tier
      }))
    )
  const strip = ({ distance: _, order, ...d }: Demand & { distance: number; order: number }): Demand => ({
    ...d,
    tier: order
  })
  const inScope = levels.filter((l) => scope === 'all' || l.distance === 1).map(strip)
  // Tiers after every level's.
  const top = Math.max(0, ...levels.map((l) => l.order)) + 1
  const later = scope === 'all' ? [] : levels.filter((l) => l.distance > 1).map(strip)
  return [
    ...inScope,
    ...quests(active, top),
    ...later.map((d) => ({ ...d, tier: top + 1 + (d.tier ?? 0) })),
    ...quests(others, top * 2 + 2)
  ]
}

/** How much of a need the shared Have covers, by its key (both kinds together). */
export function coveredOf(share: ReadonlyMap<string, Covered>, key: string): number {
  const c = share.get(key)
  return c ? c.fir + c.any : 0
}
