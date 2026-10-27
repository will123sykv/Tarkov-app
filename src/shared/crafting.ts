import { CURRENCIES } from './constants'
import {
  canCraft,
  craftOptions,
  craftProfits,
  haveCount,
  stationLevel,
  unitPrice,
  usedUp,
  type HaveCounts,
  type BuyContext,
  type CraftContext,
  type CraftOption,
  type CraftProfit,
  type HideoutNeed,
  type HideoutProgress
} from './hideout'
import type { HideoutCraft, HideoutStation } from './questTypes'
import type { LootItem } from './types'

// What to craft at each station now (the Hideout tab, since 1.49.0): first what the hideout's
// upgrades and quests still need (as Items to collect counts it), then the crafts that make the most
// money per hour, over a minimum time.

/** A craft that makes something an upgrade or a quest still needs. */
export interface NeededCraft {
  itemId: string
  craft: CraftOption
  /** The upgrades and quests it's for, as names ("Medstation 1", "Shootout Picnic"). */
  forWhat: string[]
  missing: number
  /** Of the missing ones, how many must be found in raid (buying won't do). */
  fir: number
  runs: number
  /** Seconds: every run, one after another. */
  time: number
  /** Roubles to buy what the runs use up; null when something they use can't be bought now. */
  cost: number | null
  /** Roubles to buy the copies that needn't be found in raid instead; null when there's none to buy, or no way. */
  buyPrice: number | null
  /** What crafting saves over buying those (negative: buying is cheaper); null when unknown. */
  saving: number | null
}

export interface StationPlan {
  stationId: string
  stationName: string
  level: number
  needed: NeededCraft[]
  /** The best crafts for profit here (at least the minimum time, making money), best per hour first. */
  profit: CraftProfit[]
  /** What to put on the station now. */
  next: { kind: 'needed'; craft: NeededCraft } | { kind: 'profit'; craft: CraftProfit } | null
}

/** How many profit crafts to show per station. */
export const PROFIT_PER_STATION = 3

/** Needed crafts in the order to make them: found-in-raid ones first, then the biggest saving, then the quickest. */
export function byPriority(a: NeededCraft, b: NeededCraft): number {
  return (
    Number(b.fir > 0) - Number(a.fir > 0) ||
    (b.saving ?? -Infinity) - (a.saving ?? -Infinity) ||
    a.time - b.time
  )
}

/**
 * The stations whose next level you could build now, bar its items: the other stations it needs are
 * built that far and your trader loyalty is high enough. With `hideoutNeeds(…, 'next')` this counts only
 * the upgrades you can work on now.
 */
export function upgradableNow(
  stations: readonly HideoutStation[],
  progress: HideoutProgress,
  traderLevels: Readonly<Record<string, number>>
): HideoutStation[] {
  const byId = new Map(stations.map((s) => [s.id, s]))
  return stations.filter((station) => {
    const next = station.levels.find((l) => l.level === stationLevel(station, progress) + 1)
    return (
      next !== undefined &&
      next.stations.every((r) => {
        const other = byId.get(r.stationId)
        return other === undefined || stationLevel(other, progress) >= r.level
      }) &&
      next.traders.every((r) => (traderLevels[r.traderId] ?? 1) >= r.level)
    )
  })
}

/**
 * What to craft at each station built: the crafts that make what's still needed (from `needs`, as
 * Items to collect counts it), then the most profitable ones of at least `minProfitSeconds`.
 */
export function craftingPlan(
  needs: readonly HideoutNeed[],
  cc: CraftContext,
  ctx: BuyContext,
  worth: (item: LootItem) => number,
  minProfitSeconds: number
): StationPlan[] {
  const needed: NeededCraft[] = []
  for (const need of needs) {
    if (need.missing <= 0 || CURRENCIES[need.itemId]) continue
    const craft = craftOptions(need.itemId, cc, ctx).find(canCraft)
    if (!craft || craft.makes <= 0) continue
    const fir = need.missingFir ?? Math.min(need.missing, need.firNeeded)
    const runs = Math.ceil(need.missing / craft.makes)
    const cost = craft.costEach !== null ? craft.costEach * craft.makes * runs : null
    const each = need.missing > fir ? unitPrice(need.itemId, cc.items, ctx) : null
    const buyPrice = each !== null ? each * (need.missing - fir) : null
    // Only the copies that could be bought are compared: the found-in-raid ones have to be crafted.
    const craftShare = cost !== null ? (cost * (need.missing - fir)) / need.missing : null
    needed.push({
      itemId: need.itemId,
      craft,
      forWhat: [...need.uses.map((u) => `${u.stationName} ${u.level}`), ...need.quests.map((q) => q.name)],
      missing: need.missing,
      fir,
      runs,
      time: runs * craft.craft.duration,
      cost,
      buyPrice,
      saving: buyPrice !== null && craftShare !== null ? buyPrice - craftShare : null
    })
  }

  const profits = craftProfits(cc, ctx, worth).filter(
    (p) =>
      p.stationReady &&
      p.questDone &&
      p.profit !== null &&
      p.profit > 0 &&
      p.perHour !== null &&
      p.craft.duration >= minProfitSeconds
  )

  const plans: StationPlan[] = []
  for (const station of cc.stations.values()) {
    const level = stationLevel(station, cc.progress)
    // Not built, or nothing's crafted there (the Stash).
    if (level <= 0 || !cc.crafts.some((c) => c.stationId === station.id)) continue
    const here = needed.filter((n) => n.craft.craft.stationId === station.id).sort(byPriority)
    const profit = profits
      .filter((p) => p.craft.stationId === station.id)
      .sort((a, b) => (b.perHour ?? 0) - (a.perHour ?? 0))
      .slice(0, PROFIT_PER_STATION)
    plans.push({
      stationId: station.id,
      stationName: station.name,
      level,
      needed: here,
      profit,
      next: here[0]
        ? { kind: 'needed', craft: here[0] }
        : profit[0]
          ? { kind: 'profit', craft: profit[0] }
          : null
    })
  }
  return plans.sort(
    (a, b) =>
      b.needed.length - a.needed.length ||
      (b.profit[0]?.perHour ?? -Infinity) - (a.profit[0]?.perHour ?? -Infinity) ||
      a.stationName.localeCompare(b.stationName)
  )
}

/**
 * The Have counts after starting one run of `craft` (since 1.52.0), only for counts that change: what
 * it makes goes up when something still needs it (`tracked`), as found in raid (crafted items count as
 * found in raid), and what it uses up comes off when it's counted, bought copies first (never below 0).
 * Tools aren't used up, and money isn't counted.
 */
export function craftRunCounts(
  craft: HideoutCraft,
  progress: Pick<HideoutProgress, 'have' | 'haveFir'>,
  tracked: ReadonlySet<string>
): HaveCounts {
  const next: Pick<HideoutProgress, 'have' | 'haveFir'> = {
    have: { ...progress.have },
    haveFir: { ...progress.haveFir }
  }
  const touched = new Set<string>()
  for (const { itemId, count } of craft.inputs) {
    if (CURRENCIES[itemId] || haveCount(next, itemId) <= 0) continue
    const left = usedUp(next, itemId, count, false)
    next.have[itemId] = left.any
    next.haveFir![itemId] = left.fir
    touched.add(itemId)
  }
  for (const { itemId, count } of craft.outputs) {
    if (CURRENCIES[itemId] || !tracked.has(itemId)) continue
    next.haveFir![itemId] = haveCount(next, itemId, 'fir') + count
    touched.add(itemId)
  }
  const counts: HaveCounts = {}
  for (const itemId of touched)
    for (const kind of ['fir', 'any'] as const) {
      const before = haveCount(progress, itemId, kind)
      const after = haveCount(next, itemId, kind)
      if (after !== before) counts[kind] = { ...counts[kind], [itemId]: after }
    }
  return counts
}
