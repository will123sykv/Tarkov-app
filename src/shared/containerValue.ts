import type { ContainerLoot, LootItem } from './types'
import { evaluateItem, type RankedItem, type ValuationContext } from './valuation'

export interface SearchValue {
  /** Average roubles one search is worth to this player (worth × chance × items rolled). */
  average: number
  expectedCount: number
  /** Share of the container's rolls that have a known sell price. */
  pricedShare: number
  /** The item contributing the most to the average. */
  best: { item: LootItem; contribution: number } | null
}

export interface RankedContainer {
  loot: ContainerLoot
  value: SearchValue
}

/** What each item is worth to this player, looked up by id (presets included, unlike the table). */
export function valuesById(items: readonly LootItem[], ctx: ValuationContext): Map<string, RankedItem> {
  const values = new Map<string, RankedItem>()
  for (const item of items) values.set(item.id, evaluateItem(item, ctx))
  return values
}

export function averageSearchValue(
  loot: ContainerLoot,
  values: ReadonlyMap<string, RankedItem>
): SearchValue {
  let perItem = 0
  let pricedShare = 0
  let best: SearchValue['best'] = null
  for (const { id, chance } of loot.items) {
    const value = values.get(id)
    if (!value || value.worth <= 0) continue
    const contribution = chance * value.worth
    perItem += contribution
    pricedShare += chance
    if (!best || contribution > best.contribution) best = { item: value.item, contribution }
  }
  return {
    average: perItem * loot.expectedCount,
    expectedCount: loot.expectedCount,
    pricedShare,
    best: best && { item: best.item, contribution: best.contribution * loot.expectedCount }
  }
}

/** Containers ordered by how much one search is worth on average, most valuable first. */
export function rankContainers(
  lootList: readonly ContainerLoot[],
  values: ReadonlyMap<string, RankedItem>
): RankedContainer[] {
  return lootList
    .map((loot) => ({ loot, value: averageSearchValue(loot, values) }))
    .sort((a, b) => b.value.average - a.value.average || a.loot.name.localeCompare(b.loot.name))
}
