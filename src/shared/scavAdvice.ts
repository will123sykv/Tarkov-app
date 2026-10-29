import { CURRENCIES } from './constants'
import { fleaMarketFee, type FleaFeeRates } from './fleaFee'
import { haveCount, type HideoutNeed, type HideoutProgress, type KeepInfo, type Scarcity } from './hideout'
import type { GameMode, LootItem } from './types'
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
      trader: via === 'trader' ? (value.trader?.name ?? null) : null,
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

export function traderColour(trader: string | null): string {
  // No name: the same one the trader totals give it.
  const name = trader ?? 'A trader'
  if (TRADER_COLOURS[name]) return TRADER_COLOURS[name]
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return SPARE_COLOURS[hash % SPARE_COLOURS.length]
}

/** One item to sell in the checklist: every stack of it sold the same way, added up (since 1.66.0). */
export interface ChecklistLine {
  /** The group and item, which a tick is kept by. */
  key: string
  itemId: string
  count: number
  /** What each fetches, and all of them. */
  each: number
  total: number
}

/** The items to sell one way: on the flea, or to one trader. */
export interface ChecklistGroup {
  /** "flea", or the trader's name. */
  id: string
  via: 'flea' | 'trader'
  trader: string | null
  lines: ChecklistLine[]
  total: number
}

/**
 * What to sell from a scan, grouped for selling: the flea first, then each trader in the order first
 * read, the most valuable first in each. Stacks of one item sold the same way are added up.
 */
export function sellChecklist(
  stacks: readonly { itemId: string | null; advice: ScanAdvice }[]
): ChecklistGroup[] {
  const groups = new Map<string, ChecklistGroup>()
  for (const { itemId, advice: a } of stacks) {
    if (!itemId || a.sell <= 0 || !a.via) continue
    const id = a.via === 'flea' ? 'flea' : (a.trader ?? 'A trader')
    let group = groups.get(id)
    if (!group) {
      group = { id, via: a.via, trader: a.via === 'trader' ? id : null, lines: [], total: 0 }
      groups.set(id, group)
    }
    const key = `${id}:${itemId}`
    const line = group.lines.find((l) => l.key === key)
    if (line) {
      line.count += a.sell
      line.total += a.total
    } else group.lines.push({ key, itemId, count: a.sell, each: a.each, total: a.total })
    group.total += a.total
  }
  const list = [...groups.values()]
  for (const g of list) g.lines.sort((x, y) => y.total - x.total)
  return [...list.filter((g) => g.via === 'flea'), ...list.filter((g) => g.via === 'trader')]
}

/** What to list an item for on the flea (since 1.66.0). */
export interface ListPrice {
  /** Roubles for one. */
  price: number
  fee: number
  /** What one gets after the fee. */
  net: number
  /** Raised so it fetches no less than a trader would. */
  traderFloor: boolean
  /** The 24-hour average, when the lowest listing is well under it (perhaps a bait listing). */
  wellUnderAverage: number | null
}

/** Rounding to 4 significant figures: ₽36,543 goes in steps of ₽10, ₽1,100,000 in ₽1,000. */
const step = (price: number): number => Math.pow(10, Math.max(0, Math.floor(Math.log10(price)) - 3))

/**
 * A price to list one at: just under the lowest listing, rounded, but never so low that it fetches less
 * after the fee than `traderPrice` (the best unlocked trader).
 */
export function suggestedListPrice(
  item: Pick<LootItem, 'fleaPrice' | 'fleaFee' | 'basePrice' | 'avg24hPrice'>,
  traderPrice: number,
  rates?: FleaFeeRates
): ListPrice | null {
  const low = item.fleaPrice
  if (!low || low <= 0) return null
  // Without the fee rates the prices came with, the fee at the lowest listing is as good a guess.
  const fee = (price: number): number =>
    (rates && item.basePrice ? fleaMarketFee(item.basePrice, price, rates) : null) ?? item.fleaFee ?? 0
  const s = step(low)
  let price = Math.max(s, Math.floor((low - 1) / s) * s)
  let traderFloor = false
  if (traderPrice > 0 && price - fee(price) < traderPrice) {
    // The fee grows with the price, so step up until it's covered.
    let p = traderPrice + fee(traderPrice)
    for (let i = 0; i < 8 && p - fee(p) < traderPrice; i++) p = traderPrice + fee(p)
    price = Math.ceil(p / step(p)) * step(p)
    traderFloor = true
  }
  const avg = item.avg24hPrice ?? null
  return {
    price,
    fee: fee(price),
    net: price - fee(price),
    traderFloor,
    wellUnderAverage: avg && low < avg * 0.7 ? avg : null
  }
}

/** A change to one of the hideout's counts. */
export interface CountChange {
  itemId: string
  from: number
  to: number
  /**
   * The found-in-raid and bought counts before and after, when both change (the stash's totals, since
   * 1.71.0); without them, `from` and `to` are found-in-raid counts.
   */
  kinds?: { from: { fir: number; any: number }; to: { fir: number; any: number } }
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
 * none. Items nothing on the list needs are left out, and so is money. What the screenshots show is
 * the total (since 1.71.0): copies counted as bought stay bought as far as they fit, the rest are found
 * in raid, so bought copies aren't counted on top.
 */
export function stashCounts(
  entries: readonly ScanEntry[],
  needs: readonly HideoutNeed[],
  progress: Pick<HideoutProgress, 'have' | 'haveFir'>
): StashCounts {
  const listed = new Set(needs.filter((n) => !CURRENCIES[n.itemId]).map((n) => n.itemId))
  const seen = new Map<string, number>()
  for (const { itemId, count } of entries)
    if (itemId && count > 0) seen.set(itemId, (seen.get(itemId) ?? 0) + count)
  const changes: CountChange[] = []
  let unchanged = 0
  for (const itemId of listed) {
    const before = { fir: haveCount(progress, itemId, 'fir'), any: haveCount(progress, itemId, 'any') }
    const from = before.fir + before.any
    const to = seen.get(itemId) ?? 0
    const any = Math.min(before.any, to)
    const after = { fir: to - any, any }
    if (after.fir === before.fir && after.any === before.any) unchanged++
    else changes.push({ itemId, from, to, kinds: { from: before, to: after } })
  }
  const ignored = [...seen.keys()].filter((id) => !listed.has(id) && !CURRENCIES[id]).length
  return { changes, unchanged, ignored }
}

/** A checklist line as shown: the item's name, and on the flea, a price to list it at. */
export interface ShownChecklistLine extends ChecklistLine {
  name: string
  list: ListPrice | null
}

export interface ShownChecklistGroup extends Omit<ChecklistGroup, 'lines'> {
  lines: ShownChecklistLine[]
}

/**
 * The last sell checklist, kept after the app closes (since 1.71.0): its lines as they were shown, and
 * the ones ticked off.
 */
export interface SavedChecklist {
  /** When it was made (epoch ms). */
  at: number
  gameMode: GameMode
  groups: ShownChecklistGroup[]
  sold: string[]
}

const MAX_SAVED_LINES = 500

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function savedListPrice(raw: unknown): ListPrice | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  const price = finite(r?.price)
  const fee = finite(r?.fee)
  const net = finite(r?.net)
  if (!r || price === null || fee === null || net === null) return null
  return {
    price,
    fee,
    net,
    traderFloor: r.traderFloor === true,
    wellUnderAverage: finite(r.wellUnderAverage)
  }
}

/** A saved checklist as read back, or null when it isn't one. */
export function sanitizeSavedChecklist(raw: unknown): SavedChecklist | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  const at = finite(r?.at)
  if (!r || at === null || !Array.isArray(r.groups)) return null
  if (r.gameMode !== 'pvp' && r.gameMode !== 'pve' && r.gameMode !== 'season') return null
  let left = MAX_SAVED_LINES
  const groups: ShownChecklistGroup[] = []
  for (const g of r.groups as unknown[]) {
    const group = g && typeof g === 'object' ? (g as Record<string, unknown>) : null
    if (!group || typeof group.id !== 'string' || !Array.isArray(group.lines)) continue
    const via = group.via === 'flea' ? 'flea' : 'trader'
    const lines: ShownChecklistLine[] = []
    for (const l of group.lines as unknown[]) {
      const line = l && typeof l === 'object' ? (l as Record<string, unknown>) : null
      const count = finite(line?.count)
      const each = finite(line?.each)
      const total = finite(line?.total)
      if (!line || typeof line.key !== 'string' || typeof line.itemId !== 'string') continue
      if (count === null || each === null || total === null || left-- <= 0) continue
      lines.push({
        key: line.key,
        itemId: line.itemId,
        name: typeof line.name === 'string' ? line.name : 'Unknown item',
        count,
        each,
        total,
        list: via === 'flea' ? savedListPrice(line.list) : null
      })
    }
    if (!lines.length) continue
    groups.push({
      id: group.id,
      via,
      trader: via === 'trader' ? group.id : null,
      lines,
      total: lines.reduce((n, l) => n + l.total, 0)
    })
  }
  if (!groups.length) return null
  const keys = new Set(groups.flatMap((g) => g.lines.map((l) => l.key)))
  const sold = Array.isArray(r.sold)
    ? r.sold.filter((k): k is string => typeof k === 'string' && keys.has(k))
    : []
  return { at, gameMode: r.gameMode, groups, sold }
}
