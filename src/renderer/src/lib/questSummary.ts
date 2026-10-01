import type { Quest, QuestObjective } from '../../../shared/questTypes'

// What a quest needs you to bring, for its details panel.

/** A lock and the maps it's on: any one of `keyIds` opens it. */
export interface KeyNeed {
  keyIds: string[]
  mapIds: string[]
}

/** Every key the quest's objectives need, one entry per lock, with tarkov.dev's extras added. */
export function keysNeeded(quest: Pick<Quest, 'objectives' | 'neededKeys'>): KeyNeed[] {
  const result: KeyNeed[] = []
  const add = (keyIds: string[], mapIds: string[]): void => {
    const same = result.find((k) => k.keyIds.join() === keyIds.join())
    if (same) same.mapIds = [...new Set([...same.mapIds, ...mapIds])]
    else result.push({ keyIds, mapIds: [...new Set(mapIds)] })
  }
  for (const o of quest.objectives) for (const group of o.requiredKeys) add(group, o.maps)
  for (const { map, keyIds } of quest.neededKeys)
    for (const id of keyIds) if (!result.some((k) => k.keyIds.includes(id))) add([id], map ? [map] : [])
  return result
}

/** What you hand over, stash or use, by objective type. */
const ITEM_ACTIONS: Record<string, string> = {
  giveItem: 'Hand over',
  plantItem: 'Stash',
  mark: 'Mark with',
  useItem: 'Use',
  sellItem: 'Sell'
}

export interface ItemNeed {
  action: string
  /** Any one of these. */
  itemIds: string[]
  count: number
  foundInRaid: boolean
}

/** Items the quest takes from you (found ones are handed over, so only the hand-overs count). */
export function itemsNeeded(objectives: QuestObjective[]): ItemNeed[] {
  const result: ItemNeed[] = []
  for (const o of objectives) {
    const action = ITEM_ACTIONS[o.type]
    if (!action || !o.items.length) continue
    const need = { action, itemIds: o.items, count: o.count ?? 1, foundInRaid: o.foundInRaid }
    const same = result.find(
      (n) => n.action === action && n.itemIds.join() === o.items.join() && n.foundInRaid === o.foundInRaid
    )
    if (same) same.count += need.count
    else result.push(need)
  }
  return result
}

export const CURRENCIES: Readonly<Record<string, string>> = {
  '5449016a4bdc2d6f028b456f': '₽',
  '5696686a4bdc2da3298b456a': '$',
  '569668774bdc2da2298b4568': '€'
}

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** An amount of money ("₽80,000"), or null for an item that isn't money. */
export function formatMoney(itemId: string, count: number): string | null {
  const sign = CURRENCIES[itemId]
  return sign ? `${sign}${whole.format(count)}` : null
}

/** Trader reputation as the game shows it: 0.1 → "+0.10". */
export const formatStanding = (standing: number): string =>
  `${standing >= 0 ? '+' : '−'}${Math.abs(standing).toFixed(2)}`
