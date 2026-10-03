import { CURRENCIES } from './constants'
import { neededItems, type NeededItem, type ObjectiveProgress } from './questProgress'
import type { HideoutLevel, HideoutStation, Quest } from './questTypes'
import type { LootItem } from './types'
import { evaluateItem } from './valuation'

// The hideout tracker: what the stations' next levels still need, and which items not to sell.

/** The player's hideout in one game mode: set by hand, as the game's logs don't record it. */
export interface HideoutProgress {
  /** Built level per station id; a station not in here is at its starting level. */
  levels: Record<string, number>
  /** How many of each item the player has put aside for the hideout and quests. */
  have: Record<string, number>
  /** Loyalty level per trader id, for what traders sell; a trader not in here is at level 1. */
  traders: Record<string, number>
  /**
   * When each count in `have` was last set or used up (epoch ms). A quest hand-over from before then
   * is already reflected in the count, so isn't taken off again. Since 1.14.0.
   */
  haveAt?: Record<string, number>
}

export const EMPTY_HIDEOUT: HideoutProgress = { levels: {}, have: {}, traders: {} }

/** Items a quest consumes that are still to hand over or plant, one entry per objective. */
export function handOversLeft(
  quest: Quest,
  objectives: ObjectiveProgress | undefined
): { itemId: string; count: number }[] {
  return neededItems([quest], objectives).items.map((n) => ({ itemId: n.itemId, count: n.count }))
}

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

/** An item the hideout (and, when asked, quests) still needs, for the levels and quests in scope. */
export interface HideoutNeed {
  itemId: string
  /** Any of the levels or quests wants it found in raid. */
  foundInRaid: boolean
  needed: number
  /** How many of `needed` must be found in raid (the rest take any). */
  firNeeded: number
  have: number
  missing: number
  uses: { stationId: string; stationName: string; level: number; count: number; foundInRaid: boolean }[]
  /** Quests that want it handed over or planted. */
  quests: { questId: string; name: string; count: number; foundInRaid: boolean }[]
}

/**
 * Items the stations' unbuilt levels need: only each station's next level, or every level still to
 * build. Quest hand-overs (from `neededItems`) are added in when given. Items put aside count
 * against them.
 */
export function hideoutNeeds(
  stations: readonly HideoutStation[],
  progress: HideoutProgress,
  scope: 'next' | 'all',
  questNeeds: readonly NeededItem[] = []
): HideoutNeed[] {
  const byItem = new Map<string, HideoutNeed>()
  const entry = (itemId: string): HideoutNeed => {
    let need = byItem.get(itemId)
    if (!need) {
      need = {
        itemId,
        foundInRaid: false,
        needed: 0,
        firNeeded: 0,
        have: 0,
        missing: 0,
        uses: [],
        quests: []
      }
      byItem.set(itemId, need)
    }
    return need
  }
  const add = (need: HideoutNeed, count: number, foundInRaid: boolean): void => {
    need.needed += count
    if (foundInRaid) {
      need.firNeeded += count
      need.foundInRaid = true
    }
  }
  for (const station of stations) {
    const current = stationLevel(station, progress)
    for (const level of station.levels) {
      if (level.level <= current || (scope === 'next' && level.level !== current + 1)) continue
      for (const { itemId, count, foundInRaid } of level.items) {
        const need = entry(itemId)
        add(need, count, foundInRaid)
        need.uses.push({
          stationId: station.id,
          stationName: station.name,
          level: level.level,
          count,
          foundInRaid
        })
      }
    }
  }
  for (const { itemId, count, foundInRaid, quests } of questNeeds) {
    const need = entry(itemId)
    add(need, count, foundInRaid)
    for (const q of quests) need.quests.push({ ...q, foundInRaid })
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
  /**
   * How many of each of those must be found in raid (bought ones won't do). The copies put aside
   * are taken to be the ones that needn't be, so this errs towards keeping.
   */
  fir: { hideout: number; quests: number }
  /** Why it'd be hard to replace, if it would. */
  scarce: Scarcity | null
}

/**
 * Items the hideout or active quests still need, with the hard-to-replace ones marked. What's put
 * aside (`have`) covers the hideout's needs first, then the quests'.
 */
export function keepList(
  hideout: readonly HideoutNeed[],
  quests: readonly NeededItem[],
  items: ReadonlyMap<string, LootItem>,
  ctx: BuyContext,
  have: Readonly<Record<string, number>> = {}
): Map<string, KeepInfo> {
  const result = new Map<string, KeepInfo>()
  const entry = (itemId: string): KeepInfo => {
    let info = result.get(itemId)
    if (!info) {
      const item = items.get(itemId)
      info = {
        hideout: 0,
        quests: 0,
        fir: { hideout: 0, quests: 0 },
        scarce: item ? scarcity(item, ctx) : null
      }
      result.set(itemId, info)
    }
    return info
  }
  // Money isn't loot to keep.
  for (const need of hideout)
    if (need.missing > 0 && !CURRENCIES[need.itemId]) {
      const info = entry(need.itemId)
      info.hideout += need.missing
      info.fir.hideout += Math.min(need.missing, need.firNeeded)
    }
  const hideoutNeeded = new Map(hideout.map((n) => [n.itemId, n.needed]))
  const questNeeded = new Map<string, { count: number; fir: number }>()
  for (const need of quests)
    if (!CURRENCIES[need.itemId]) {
      const total = questNeeded.get(need.itemId) ?? { count: 0, fir: 0 }
      total.count += need.count
      if (need.foundInRaid) total.fir += need.count
      questNeeded.set(need.itemId, total)
    }
  for (const [itemId, { count, fir }] of questNeeded) {
    const spare = Math.max(0, (have[itemId] ?? 0) - (hideoutNeeded.get(itemId) ?? 0))
    if (count > spare) {
      const info = entry(itemId)
      info.quests += count - spare
      info.fir.quests += Math.min(count - spare, fir)
    }
  }
  return result
}

/**
 * The keep list with items that can be bought back now (not rare, nothing in the way) cut down to
 * the copies that must be found in raid: the rest can be sold and bought again when needed.
 */
export function keepOnlyHardToReplace(keep: ReadonlyMap<string, KeepInfo>): Map<string, KeepInfo> {
  return new Map(
    [...keep].map(([itemId, info]) => [
      itemId,
      info.scarce ? info : { ...info, hideout: info.fir.hideout, quests: info.fir.quests }
    ])
  )
}

/** Items put aside that nothing left needs (no level still to build, no quest left), as rows of 0 needed. */
export function unneededHave(progress: HideoutProgress, everything: readonly HideoutNeed[]): HideoutNeed[] {
  const needed = new Set(everything.map((n) => n.itemId))
  return Object.entries(progress.have)
    .filter(([itemId, have]) => have > 0 && !needed.has(itemId) && !CURRENCIES[itemId])
    .map(([itemId, have]) => ({
      itemId,
      foundInRaid: false,
      needed: 0,
      firNeeded: 0,
      have,
      missing: 0,
      uses: [],
      quests: []
    }))
}

/** Why and how many of an item put aside could be sold. */
export interface SellAdvice {
  /** How many to sell. */
  count: number
  /**
   * `extra`: more than every level and quest left needs; `buyBack`: it can be bought back now, so
   * there's no need to hold on to it.
   */
  reason: 'extra' | 'buyBack'
  /** Copies kept back because they must be found in raid (bought ones aren't). */
  keepFir: number
  /** Roubles one sells for: the flea after the fee (when the player can list it) or a trader. */
  sellEach: number | null
  /** "flea" or the trader's name. */
  sellVia: string | null
  /** The cheapest way to buy one back now. */
  buyBack: BuyOption | null
}

/**
 * Whether to sell some of an item put aside. `everything` is the same item's need over every level
 * and quest left, so a later level's or quest's copies are never called extra. An item that can be
 * bought back now (and isn't rare) needn't be held: sell all but the copies that must be found in
 * raid. Otherwise only the extras.
 */
export function sellAdvice(
  everything: Pick<HideoutNeed, 'have' | 'needed' | 'firNeeded'>,
  item: LootItem | undefined,
  ctx: BuyContext
): SellAdvice | null {
  const have = everything.have
  if (have <= 0 || (item && CURRENCIES[item.id])) return null
  const extra = Math.max(0, have - everything.needed)
  const buy = item ? buyOptions(item, ctx) : null
  const buyBack = buy?.options[0] ?? null
  const easy = item !== undefined && buyBack !== null && scarcity(item, ctx) === null
  const sellable = easy ? Math.max(0, have - everything.firNeeded) : extra
  if (sellable <= 0) return null
  const value = item
    ? evaluateItem(item, {
        playerLevel: ctx.playerLevel,
        fleaMinLevel: ctx.fleaMinLevel,
        subtractFleaFee: true
      })
    : null
  return {
    count: sellable,
    reason: sellable > extra ? 'buyBack' : 'extra',
    keepFir: easy ? Math.min(have, everything.firNeeded) : 0,
    sellEach: value && value.worth > 0 ? value.worth : null,
    sellVia:
      value?.via === 'flea'
        ? 'flea'
        : value?.via === 'trader'
          ? (item?.bestTrader?.name ?? 'a trader')
          : null,
    buyBack
  }
}

/** One item a station level takes, and how the player could get the rest. */
export interface UpgradePart {
  itemId: string
  needed: number
  have: number
  missing: number
  /** The cheapest way to buy one now, if there is one. */
  best: BuyOption | null
  /** What would open up a way to buy it, when there's none now. */
  locked: string[]
}

export interface UpgradeStatus {
  /**
   * `ready`: everything in hand and every station and trader level met; `buyable`: the rest can
   * all be bought now; `blocked`: the items are covered but another station or a trader level isn't;
   * `short`: something missing can't be bought yet.
   */
  state: 'ready' | 'buyable' | 'blocked' | 'short'
  parts: UpgradePart[]
  /** Roubles to buy every missing part that can be bought now. */
  partsCost: number
  /** How many missing parts (by kind) can't be bought now. */
  unbuyable: number
  /** The upgrade's own money cost. */
  money: { itemId: string; count: number }[]
  /** That money in roubles, at what traders charge for dollars and euros; null when unknown. */
  moneyCost: number | null
  unmetStations: { stationId: string; level: number }[]
  unmetTraders: { traderId: string; level: number }[]
}

const ROUBLES_ID = Object.keys(CURRENCIES).find((id) => CURRENCIES[id] === '₽')

/**
 * What it takes to build a station level now: what's missing, what buying it would cost at the
 * player's level and trader loyalty, and which other requirements aren't met.
 */
export function upgradeStatus(
  level: HideoutLevel,
  progress: HideoutProgress,
  ctx: BuyContext,
  items: ReadonlyMap<string, LootItem>,
  stationsById: ReadonlyMap<string, HideoutStation>
): UpgradeStatus {
  const parts: UpgradePart[] = []
  const money: { itemId: string; count: number }[] = []
  let moneyCost: number | null = 0
  for (const { itemId, count } of level.items) {
    if (CURRENCIES[itemId]) {
      money.push({ itemId, count })
      const rate =
        itemId === ROUBLES_ID ? 1 : (buyOptions(items.get(itemId) ?? NO_ITEM, ctx).options[0]?.price ?? null)
      moneyCost = moneyCost !== null && rate !== null ? moneyCost + count * rate : null
      continue
    }
    const have = Math.max(0, progress.have[itemId] ?? 0)
    const missing = Math.max(0, count - have)
    const item = items.get(itemId)
    const buy = missing && item ? buyOptions(item, ctx) : { options: [], locked: [] }
    parts.push({ itemId, needed: count, have, missing, best: buy.options[0] ?? null, locked: buy.locked })
  }
  const short = parts.filter((p) => p.missing > 0)
  const partsCost = short.reduce((sum, p) => sum + (p.best ? p.best.price * p.missing : 0), 0)
  const unbuyable = short.filter((p) => !p.best).length
  const unmetStations = level.stations.filter((r) => {
    const other = stationsById.get(r.stationId)
    return other !== undefined && stationLevel(other, progress) < r.level
  })
  const unmetTraders = level.traders.filter((r) => (ctx.traderLevels[r.traderId] ?? 1) < r.level)
  const met = !unmetStations.length && !unmetTraders.length
  const state = unbuyable ? 'short' : !met ? 'blocked' : short.length ? 'buyable' : 'ready'
  return { state, parts, partsCost, unbuyable, money, moneyCost, unmetStations, unmetTraders }
}

const NO_ITEM: Pick<LootItem, 'bannedOnFlea' | 'minLevelForFlea' | 'fleaPrice' | 'buyFrom'> = {
  bannedOnFlea: true,
  minLevelForFlea: null,
  fleaPrice: null,
  buyFrom: []
}

/** Upgrades in the order to look at them: ready, then buyable (cheapest first), blocked, short. */
export const UPGRADE_ORDER: Record<UpgradeStatus['state'], number> = {
  ready: 0,
  buyable: 1,
  blocked: 2,
  short: 3
}
