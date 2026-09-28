import { categoryById, type CategoryId } from './categories'
import type { LootItem, SortState } from './types'

export type FleaStatus = 'sellable' | 'locked' | 'banned'

export interface FleaAccess {
  status: FleaStatus
  /** Level at which this item can be sold on the flea; null when it never can. */
  unlockLevel: number | null
}

export interface ValuationContext {
  playerLevel: number
  /** Global flea market unlock level for the current mode. */
  fleaMinLevel: number
  subtractFleaFee: boolean
}

export interface RankedItem {
  item: LootItem
  access: FleaAccess
  /** Flea price after fees (if enabled); null when the item has no flea price. */
  fleaNet: number | null
  /** What the item is worth to this player: best of flea (if sellable) and traders. */
  worth: number
  via: 'flea' | 'trader' | null
  valuePerSlot: number
}

export interface RankFilters {
  category: CategoryId
  /** Item ids that spawn on the selected map, or null for no map filter. */
  mapItemIds: ReadonlySet<string> | null
  search: string
  hideLocked: boolean
  minValuePerSlot: number
}

export function fleaAccess(item: LootItem, playerLevel: number, fleaMinLevel: number): FleaAccess {
  if (item.bannedOnFlea) return { status: 'banned', unlockLevel: null }
  const unlockLevel = Math.max(fleaMinLevel, item.minLevelForFlea ?? 0)
  return { status: playerLevel >= unlockLevel ? 'sellable' : 'locked', unlockLevel }
}

export function fleaNetPrice(item: LootItem, subtractFleaFee: boolean): number | null {
  if (item.fleaPrice == null || item.fleaPrice <= 0) return null
  const fee = subtractFleaFee ? (item.fleaFee ?? 0) : 0
  return Math.max(0, item.fleaPrice - fee)
}

export function evaluateItem(item: LootItem, ctx: ValuationContext): RankedItem {
  const access = fleaAccess(item, ctx.playerLevel, ctx.fleaMinLevel)
  const fleaNet = fleaNetPrice(item, ctx.subtractFleaFee)
  const trader = item.bestTrader?.price ?? 0

  let worth = 0
  let via: RankedItem['via'] = null
  if (access.status === 'sellable' && fleaNet != null && fleaNet > trader) {
    worth = fleaNet
    via = 'flea'
  } else if (trader > 0) {
    worth = trader
    via = 'trader'
  }

  return { item, access, fleaNet, worth, via, valuePerSlot: worth / Math.max(1, item.slots) }
}

function matchesCategory(item: LootItem, category: CategoryId): boolean {
  const { types } = categoryById(category)
  return types.length === 0 || types.some((t) => item.types.includes(t))
}

function matchesSearch(item: LootItem, query: string): boolean {
  if (!query) return true
  return item.name.toLowerCase().includes(query) || item.shortName.toLowerCase().includes(query)
}

function sortValue(r: RankedItem, key: SortState['key']): number | string {
  switch (key) {
    case 'valuePerSlot':
      return r.valuePerSlot
    case 'worth':
      return r.worth
    case 'flea':
      return r.fleaNet ?? -1
    case 'trader':
      return r.item.bestTrader?.price ?? -1
    case 'slots':
      return r.item.slots
    case 'name':
      return r.item.name.toLowerCase()
  }
}

export function compareRanked(a: RankedItem, b: RankedItem, sort: SortState): number {
  const va = sortValue(a, sort.key)
  const vb = sortValue(b, sort.key)
  const primary =
    typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : (va as number) - (vb as number)
  if (primary !== 0) return sort.dir === 'asc' ? primary : -primary
  return a.item.name.localeCompare(b.item.name)
}

/**
 * Filter a loot pool down to what the player cares about and rank it.
 * Weapon presets are skipped (they duplicate the base guns) as are items with no known sell price.
 */
export function rankItems(
  items: readonly LootItem[],
  ctx: ValuationContext,
  filters: RankFilters,
  sort: SortState
): RankedItem[] {
  const query = filters.search.trim().toLowerCase()
  const ranked: RankedItem[] = []
  for (const item of items) {
    if (item.types.includes('preset')) continue
    if (filters.mapItemIds && !filters.mapItemIds.has(item.id)) continue
    if (!matchesCategory(item, filters.category)) continue
    if (!matchesSearch(item, query)) continue

    const r = evaluateItem(item, ctx)
    if (r.worth <= 0) continue
    if (filters.hideLocked && r.access.status !== 'sellable') continue
    if (r.valuePerSlot < filters.minValuePerSlot) continue
    ranked.push(r)
  }
  return ranked.sort((a, b) => compareRanked(a, b, sort))
}
