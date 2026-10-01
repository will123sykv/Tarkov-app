import type { KeepInfo, Scarcity } from './hideout'
import type { LootItem } from './types'
import { evaluateItem, type ValuationContext } from './valuation'

// What to do with items read off a screenshot (a scav case haul, a container): keep what the hideout and
// active quests still need, sell the rest where it pays most.

/** One stack read off the screenshot. */
export interface ScanEntry {
  itemId: string | null
  count: number
}

export interface ScanAdvice {
  /** How many of the stack to keep, and what for. */
  keep: number
  keepFor: { hideout: number; quests: number }
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
  scarce: null,
  sell: 0,
  via: null,
  trader: null,
  each: 0,
  total: 0
}

/**
 * Advice for each stack, in order. Stacks of the same item share what's needed: the first ones read
 * are kept until the need is met (the hideout's first, then the quests'), the rest are sold.
 */
export function adviseScan(
  entries: readonly ScanEntry[],
  items: ReadonlyMap<string, LootItem>,
  keep: ReadonlyMap<string, KeepInfo>,
  ctx: ValuationContext
): ScanAdvice[] {
  const left = new Map<string, { hideout: number; quests: number }>()
  return entries.map(({ itemId, count }) => {
    const item = itemId ? items.get(itemId) : undefined
    if (!item || count <= 0) return NOTHING
    let need = left.get(item.id)
    if (!need) {
      const info = keep.get(item.id)
      need = { hideout: info?.hideout ?? 0, quests: info?.quests ?? 0 }
      left.set(item.id, need)
    }
    const forHideout = Math.min(count, need.hideout)
    const forQuests = Math.min(count - forHideout, need.quests)
    need.hideout -= forHideout
    need.quests -= forQuests
    const kept = forHideout + forQuests
    const sell = count - kept
    const value = evaluateItem(item, ctx)
    const via = value.worth > 0 ? value.via : null
    const each = via ? value.worth : 0
    return {
      keep: kept,
      keepFor: { hideout: forHideout, quests: forQuests },
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
