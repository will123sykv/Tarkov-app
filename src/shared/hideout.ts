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
  /** Loyalty level per trader id, for what traders sell; a trader not in here is at level 1. */
  traders: Record<string, number>
}

export const EMPTY_HIDEOUT: HideoutProgress = { levels: {}, have: {}, traders: {} }

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
  /** How many of `needed` must be found in raid (other levels take any). */
  firNeeded: number
  have: number
  missing: number
  uses: { stationId: string; stationName: string; level: number; count: number; foundInRaid: boolean }[]
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
          firNeeded: 0,
          have: 0,
          missing: 0,
          uses: []
        }
        need.needed += count
        if (foundInRaid) {
          need.firNeeded += count
          need.foundInRaid = true
        }
        need.uses.push({
          stationId: station.id,
          stationName: station.name,
          level: level.level,
          count,
          foundInRaid
        })
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

/** What decides what the player can buy: their level, trader loyalty and finished quests. */
export interface BuyContext {
  playerLevel: number
  /** The level the flea market opens at. */
  fleaMinLevel: number
  /** Loyalty level per trader id; a trader not in here is at level 1. */
  traderLevels: Readonly<Record<string, number>>
  completedQuests: ReadonlySet<string>
  /** Quest names by id, to say which quest unlocks an offer. */
  questNames?: ReadonlyMap<string, string>
  /** As if every level, loyalty and quest were unlocked. */
  unlockAll?: boolean
}

export interface BuyOption {
  source: 'flea' | 'trader'
  /** "Flea" or e.g. "Mechanic LL2". */
  label: string
  /** Roubles for one. */
  price: number
}

export interface BuyInfo {
  /** Ways to buy one now, cheapest first. */
  options: BuyOption[]
  /** What would open up more ways (e.g. "flea at level 15", "Mechanic LL3"). */
  locked: string[]
}

/** Where the player can buy an item now, at their level and trader loyalty, and what's still locked. */
export function buyOptions(
  item: Pick<LootItem, 'bannedOnFlea' | 'minLevelForFlea' | 'fleaPrice' | 'buyFrom'>,
  ctx: BuyContext
): BuyInfo {
  const options: BuyOption[] = []
  const locked: string[] = []
  if (!item.bannedOnFlea && item.fleaPrice != null && item.fleaPrice > 0) {
    const unlockLevel = Math.max(ctx.fleaMinLevel, item.minLevelForFlea ?? 0)
    if (ctx.unlockAll || ctx.playerLevel >= unlockLevel)
      options.push({ source: 'flea', label: 'Flea', price: item.fleaPrice })
    else locked.push(`flea at level ${unlockLevel}`)
  }
  for (const offer of item.buyFrom ?? []) {
    const label = `${offer.trader} LL${offer.level}`
    const levelOk = ctx.unlockAll || (ctx.traderLevels[offer.traderId] ?? 1) >= offer.level
    const questOk = ctx.unlockAll || !offer.questId || ctx.completedQuests.has(offer.questId)
    if (levelOk && questOk) options.push({ source: 'trader', label, price: offer.price })
    else {
      const quest = offer.questId && !questOk ? (ctx.questNames?.get(offer.questId) ?? 'a quest') : null
      locked.push(quest ? `${label} after ${quest}` : label)
    }
  }
  return { options: options.sort((a, b) => a.price - b.price), locked }
}

/**
 * Why an item would be hard to replace if sold: `rare` when it's hard to get even with everything
 * unlocked (no trader sells it, and on the flea it's banned, scarce or costly), `locked` when the
 * player can't easily buy it yet but will once their level, trader loyalty or a quest allows; null
 * when it's easy to buy back.
 */
export interface Scarcity {
  kind: 'rare' | 'locked'
  reason: string
}

/** What makes an item hard to buy on the flea, whoever is buying. */
function fleaProblem(item: LootItem): string | null {
  if (item.bannedOnFlea || item.types.includes('noFlea') || !item.fleaPrice)
    return 'Can’t be bought on the flea market'
  if (item.offerCount != null && item.offerCount < RARE_MAX_OFFERS && item.fleaPrice >= RARE_SCARCE_MIN_PRICE)
    return item.offerCount === 0
      ? 'No offers on the flea market right now'
      : `Only ${item.offerCount} offer${item.offerCount === 1 ? '' : 's'} on the flea market`
  if (item.fleaPrice >= RARE_MIN_PRICE) return `${roubles(item.fleaPrice)} to buy back on the flea market`
  return null
}

export function scarcity(item: LootItem, ctx: BuyContext): Scarcity | null {
  if (CURRENCIES[item.id]) return null
  const { options, locked } = buyOptions(item, ctx)
  // A trader that sells it to the player restocks: easy to replace.
  if (options.some((o) => o.source === 'trader')) return null
  const problem = fleaProblem(item)
  if (options.length && !problem) return null
  // A trader will sell it once the player gets there.
  if (item.buyFrom?.length) {
    const unlocks = locked.filter((l) => !l.startsWith('flea'))
    return {
      kind: 'locked',
      reason: options.length
        ? `${problem}; a trader sells it once you reach ${unlocks.join(' or ')}`
        : `You can’t buy it yet (${locked.join(', ')})`
    }
  }
  if (problem) return { kind: 'rare', reason: problem }
  return { kind: 'locked', reason: `You can’t buy it yet (${locked.join(', ')})` }
}

/** Why to keep an item rather than sell it. */
export interface KeepInfo {
  /** How many more the hideout needs. */
  hideout: number
  /** How many active quests want handed over or planted. */
  quests: number
  /** Why it'd be hard to replace, if it would. */
  scarce: Scarcity | null
}

/** Items the hideout or active quests still need, with the hard-to-replace ones marked. */
export function keepList(
  hideout: readonly HideoutNeed[],
  quests: readonly NeededItem[],
  items: ReadonlyMap<string, LootItem>,
  ctx: BuyContext
): Map<string, KeepInfo> {
  const result = new Map<string, KeepInfo>()
  const entry = (itemId: string): KeepInfo => {
    let info = result.get(itemId)
    if (!info) {
      const item = items.get(itemId)
      info = { hideout: 0, quests: 0, scarce: item ? scarcity(item, ctx) : null }
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
