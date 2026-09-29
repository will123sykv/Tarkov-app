import { useMemo } from 'react'
import type { LootItem, PriceState } from '../../../shared/types'

/** Items by id from the loaded prices, for names and icons in quest objectives. */
export function useItemLookup(priceState: PriceState | null): ReadonlyMap<string, LootItem> {
  const items = priceState?.dataset?.items
  return useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items])
}
