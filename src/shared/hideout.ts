import { CURRENCIES } from './constants'
import type { NeededItem } from './questProgress'
import type { HideoutStation } from './questTypes'
import type { LootItem } from './types'

// The hideout tracker: what the stations' next levels still need, and which items not to sell.

/** The player's hideout in one game mode: set by hand, as the game's logs don't record it. */
export interface HideoutProgress {
  /** Built level per station id; a station not in here is at its starting level. */
  levels: Record<string, number>
  /** How many of each item the player has put aside for the hideout. */
  have: Record<string, number>
}

export const EMPTY_HIDEOUT: HideoutProgress = { levels: {}, have: {} }

export const maxLevel = (station: HideoutStation): number =>
  station.levels.reduce((max, l) => Math.max(max, l.level), 0)

/** The levels every hideout starts with: those from 1 up that need nothing (e.g. the Stash). */
export function startingLevel(station: HideoutStation): number {
  let level = 0
  for (const l of [...station.levels].sort((a, b) => a.level - b.level)) {
    const free = !l.items.length && !l.stations.length && !l.traders.length && !l.skills.length
    if (l.level !== level + 1 || !free) break
    level = l.level
  }
  return level
}

export function stationLevel(station: HideoutStation, progress: HideoutProgress): number {
  const set = progress.levels[station.id]
  return Math.min(maxLevel(station), Math.max(0, set ?? startingLevel(station)))
}

/** An item the hideout still needs, for the levels in scope. */
export interface HideoutNeed {
  itemId: string
  /** Any of the levels wants it found in raid. */
  foundInRaid: boolean
  needed: number
  have: number
  missing: number
  uses: { stationId: string; stationName: string; level: number; count: number }[]
}

/**
 * Items the stations' unbuilt levels need: only each station's next level, or every level still to
 * build. Items put aside count against them.
 */
export function hideoutNeeds(
  stations: readonly HideoutStation[],
  progress: HideoutProgress,
  scope: 'next' | 'all'
): HideoutNeed[] {
  const byItem = new Map<string, HideoutNeed>()
  for (const station of stations) {
    const current = stationLevel(station, progress)
    for (const level of station.levels) {
      if (level.level <= current || (scope === 'next' && level.level !== current + 1)) continue
      for (const { itemId, count, foundInRaid } of level.items) {
        const need = byItem.get(itemId) ?? {
          itemId,
          foundInRaid: false,
          needed: 0,
          have: 0,
          missing: 0,
          uses: []
        }
        need.needed += count
        need.foundInRaid ||= foundInRaid
        need.uses.push({ stationId: station.id, stationName: station.name, level: level.level, count })
        byItem.set(itemId, need)
      }
    }
  }
  const result = [...byItem.values()]
  for (const need of result) {
    need.have = Math.max(0, progress.have[need.itemId] ?? 0)
    need.missing = Math.max(0, need.needed - need.have)
  }
  return result.sort((a, b) => b.missing - a.missing || a.itemId.localeCompare(b.itemId))
}

/** Fewer flea offers than this and an item is scarce (offer counts swing, so this is low)... */
export const RARE_MAX_OFFERS = 5
/** ...unless it's cheap enough (roubles) to pick up from a trader or in the next raid. */
export const RARE_SCARCE_MIN_PRICE = 20_000
/** Roubles: this much or more and an item is costly to buy back. */
export const RARE_MIN_PRICE = 75_000

const roubles = (n: number): string => `₽${Math.round(n).toLocaleString('en-US')}`

/** Why an item would be hard to replace if sold, or null when it's easy to buy back. */
export function rareReason(
  item: Pick<LootItem, 'id' | 'bannedOnFlea' | 'types' | 'offerCount' | 'fleaPrice'>
): string | null {
  if (CURRENCIES[item.id]) return null
  if (item.bannedOnFlea || item.types.includes('noFlea')) return 'Can’t be bought on the flea market'
  if (
    item.offerCount != null &&
    item.offerCount < RARE_MAX_OFFERS &&
    (item.fleaPrice ?? 0) >= RARE_SCARCE_MIN_PRICE
  )
    return item.offerCount === 0
      ? 'No offers on the flea market right now'
      : `Only ${item.offerCount} offer${item.offerCount === 1 ? '' : 's'} on the flea market`
  if (item.fleaPrice != null && item.fleaPrice >= RARE_MIN_PRICE)
    return `${roubles(item.fleaPrice)} to buy back on the flea market`
  return null
}

/** Why to keep an item rather than sell it. */
export interface KeepInfo {
  /** How many more the hideout needs. */
  hideout: number
  /** How many active quests want handed over or planted. */
  quests: number
  /** Why it'd be hard to replace, if it would. */
  rare: string | null
}

/** Items the hideout or active quests still need, with the hard-to-replace ones marked. */
export function keepList(
  hideout: readonly HideoutNeed[],
  quests: readonly NeededItem[],
  items: ReadonlyMap<string, LootItem>
): Map<string, KeepInfo> {
  const result = new Map<string, KeepInfo>()
  const entry = (itemId: string): KeepInfo => {
    let info = result.get(itemId)
    if (!info) {
      const item = items.get(itemId)
      info = { hideout: 0, quests: 0, rare: item ? rareReason(item) : null }
      result.set(itemId, info)
    }
    return info
  }
  // Money isn't loot to keep.
  for (const need of hideout)
    if (need.missing > 0 && !CURRENCIES[need.itemId]) entry(need.itemId).hideout += need.missing
  for (const need of quests) if (!CURRENCIES[need.itemId]) entry(need.itemId).quests += need.count
  return result
}
