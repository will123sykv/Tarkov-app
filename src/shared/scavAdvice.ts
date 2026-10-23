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

/**
 * Where a stack's Do comes when the list is sorted by it (since 1.59.0): keep (some sold too counts as
 * keep), sell on the flea, sell to a trader, no buyer, then stacks whose item isn't known yet.
 */
export function doRank(advice: ScanAdvice, known: boolean): number {
  if (!known) return 4
  if (advice.keep > 0) return 0
  if (advice.sell > 0) return advice.via === 'flea' ? 1 : advice.via === 'trader' ? 2 : 3
  return 3
}

/** What a stack's Worth column shows: what the sold ones fetch, or what the kept ones would. */
export const adviceWorth = (advice: ScanAdvice): number =>
  advice.total > 0 ? advice.total : advice.each * advice.keep

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

/** Which stacks the Screenshots page highlights (since 1.64.0): all, or just what to sell one way. */
export type ScanHighlight = 'all' | 'flea' | 'traders'

/** Whether a stack is one the highlight picks out: some of it sold on the flea, or to a trader. */
export function sellsVia(advice: ScanAdvice, highlight: ScanHighlight): boolean {
  if (highlight === 'all') return true
  return advice.sell > 0 && advice.via === (highlight === 'flea' ? 'flea' : 'trader')
}

/** What goes to each trader: how many stacks and for how much, in the order they're first read. */
export interface TraderTotal {
  trader: string
  stacks: number
  total: number
}

export function traderTotals(advice: readonly ScanAdvice[]): TraderTotal[] {
  const byTrader = new Map<string, TraderTotal>()
  for (const a of advice) {
    if (!sellsVia(a, 'traders')) continue
    const name = a.trader ?? 'A trader'
    const entry = byTrader.get(name) ?? { trader: name, stacks: 0, total: 0 }
    entry.stacks++
    entry.total += a.total
    byTrader.set(name, entry)
  }
  return [...byTrader.values()]
}

/** A colour for each trader, told apart on a dark screenshot (since 1.64.0). */
const TRADER_COLOURS: Record<string, string> = {
  Prapor: '#ef5350',
  Therapist: '#f06292',
  Fence: '#b0bec5',
  Skier: '#4fc3f7',
  Peacekeeper: '#26a69a',
  Mechanic: '#ffa726',
  Ragman: '#ab47bc',
  Jaeger: '#9ccc65',
  Ref: '#ffee58'
}
/** For traders not listed, picked by name so one keeps its colour. */
const SPARE_COLOURS = ['#8d6e63', '#7986cb', '#4db6ac', '#d4e157', '#ff8a65', '#ba68c8']

export function traderColour(name: string | null): string {
  if (name && TRADER_COLOURS[name]) return TRADER_COLOURS[name]
  let hash = 0
  for (const c of name ?? '') hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return SPARE_COLOURS[hash % SPARE_COLOURS.length]
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
