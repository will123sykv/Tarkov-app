import { CURRENCIES } from './constants'
import type { HideoutNeed, KeepInfo, Scarcity } from './hideout'
import type { LootItem } from './types'
import { evaluateItem, type ValuationContext } from './valuation'

// What to do with items read off screenshots: for new loot (a scav case haul, a container), keep what
// the hideout and active quests still need and sell the rest where it pays most, and put what the
// hideout needs into its counts; for everything the player has, set the hideout's counts to it.

/** One stack read off a screenshot. */
export interface ScanEntry {
  itemId: string | null
  count: number
  /** Units of this stack already added to the hideout's counts. */
  stored?: number
}

export interface ScanAdvice {
  /** How many of the stack to keep, and what for. */
  keep: number
  keepFor: { hideout: number; quests: number }
  /** Of those kept, how many are already in the tracker's counts (counted as the hideout's). */
  stored: number
  /** Why the kept ones would be hard to replace, if they would. */
  scarce: Scarcity | null
  /** How many to sell, where (null: nobody buys it) and for how much each. */
  sell: number
  via: 'flea' | 'trader' | null
  trader: string | null
  each: number
  total: number
}

const NOTHING: ScanAdvice = {
  keep: 0,
  keepFor: { hideout: 0, quests: 0 },
  stored: 0,
  scarce: null,
  sell: 0,
  via: null,
  trader: null,
  each: 0,
  total: 0
}

/**
 * Advice for each stack, in order. Stacks of the same item share what's needed: the first ones read
 * are kept until the need is met (the hideout's first, then the quests'), the rest are sold. Units
 * already added to the hideout's counts stay kept for it (the need they met no longer shows).
 */
export function adviseScan(
  entries: readonly ScanEntry[],
  items: ReadonlyMap<string, LootItem>,
  keep: ReadonlyMap<string, KeepInfo>,
  ctx: ValuationContext
): ScanAdvice[] {
  const left = new Map<string, { hideout: number; quests: number }>()
  return entries.map(({ itemId, count, stored = 0 }) => {
    const item = itemId ? items.get(itemId) : undefined
    if (!item || count <= 0) return NOTHING
    let need = left.get(item.id)
    if (!need) {
      const info = keep.get(item.id)
      need = { hideout: info?.hideout ?? 0, quests: info?.quests ?? 0 }
      left.set(item.id, need)
    }
    const added = Math.min(count, stored)
    const forHideout = added + Math.min(count - added, need.hideout)
    const forQuests = Math.min(count - forHideout, need.quests)
    need.hideout -= forHideout - added
    need.quests -= forQuests
    const kept = forHideout + forQuests
    const sell = count - kept
    const value = evaluateItem(item, ctx)
    const via = value.worth > 0 ? value.via : null
    const each = via ? value.worth : 0
    return {
      keep: kept,
      keepFor: { hideout: forHideout, quests: forQuests },
      stored: added,
      scarce: kept ? (keep.get(item.id)?.scarce ?? null) : null,
      sell,
      via,
      trader: via === 'trader' ? (item.bestTrader?.name ?? null) : null,
      each,
      total: each * sell
    }
  })
}

export interface ScanTotals {
  /** Roubles from selling everything not kept, and how that splits between the flea and traders. */
  sell: number
  flea: number
  traders: number
  /** Items to keep (counting a stack's units). */
  keep: number
}

export function scanTotals(advice: readonly ScanAdvice[]): ScanTotals {
  const totals: ScanTotals = { sell: 0, flea: 0, traders: 0, keep: 0 }
  for (const a of advice) {
    totals.sell += a.total
    if (a.via === 'flea') totals.flea += a.total
    if (a.via === 'trader') totals.traders += a.total
    totals.keep += a.keep
  }
  return totals
}

/** A change to one of the hideout's counts. */
export interface CountChange {
  itemId: string
  from: number
  to: number
}

/**
 * New loot into the tracker's counts: the units kept for the hideout and quests that aren't in its
 * counts yet, added to what the player has. `stored` is each stack's units in the counts afterwards.
 */
export function lootAdditions(
  entries: readonly ScanEntry[],
  advice: readonly ScanAdvice[],
  have: Readonly<Record<string, number>>
): { changes: CountChange[]; stored: number[] } {
  const add = new Map<string, number>()
  entries.forEach((e, i) => {
    const extra = advice[i].keep - advice[i].stored
    if (e.itemId && extra > 0) add.set(e.itemId, (add.get(e.itemId) ?? 0) + extra)
  })
  return {
    changes: [...add].map(([itemId, n]) => ({
      itemId,
      from: have[itemId] ?? 0,
      to: (have[itemId] ?? 0) + n
    })),
    stored: advice.map((a, i) => (entries[i].itemId ? a.keep : 0))
  }
}

export interface StashCounts {
  /** Counts that change: listed items to what the screenshots show, and listed ones not seen to 0. */
  changes: CountChange[]
  /** Listed items whose count already matches. */
  unchanged: number
  /** Items seen that nothing on the list needs. */
  ignored: number
}

/**
 * Everything the player has into the hideout's counts: each item any unbuilt level still needs
 * (`needs`, for every level left) is set to how many the screenshots show, and to 0 when they show
 * none. Items nothing on the list needs are left out, and so is money.
 */
export function stashCounts(
  entries: readonly ScanEntry[],
  needs: readonly HideoutNeed[],
  have: Readonly<Record<string, number>>
): StashCounts {
  const listed = new Set(needs.filter((n) => !CURRENCIES[n.itemId]).map((n) => n.itemId))
  const seen = new Map<string, number>()
  for (const { itemId, count } of entries)
    if (itemId && count > 0) seen.set(itemId, (seen.get(itemId) ?? 0) + count)
  const changes: CountChange[] = []
  let unchanged = 0
  for (const itemId of listed) {
    const from = have[itemId] ?? 0
    const to = seen.get(itemId) ?? 0
    if (from === to) unchanged++
    else changes.push({ itemId, from, to })
  }
  const ignored = [...seen.keys()].filter((id) => !listed.has(id) && !CURRENCIES[id]).length
  return { changes, unchanged, ignored }
}
