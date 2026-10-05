import { useCallback, useMemo } from 'react'
import { buyOptions, type BuyInfo } from '../../../shared/hideout'
import { keyRewards } from '../../../shared/keys'
import type { QuestStatus } from '../../../shared/questProgress'
import type { Quest, Vec3 } from '../../../shared/questTypes'
import type { LootItem, PriceState, PublicSettings } from '../../../shared/types'
import { mapGroups, type Group } from './mapGroups'
import { useItemLookup } from './useItemLookup'
import { useBuyContext } from './useKeepList'
import { useQuestRows } from './useQuestRows'

/** What the app knows about getting a key, and what it opens. */
export interface KeyInfo {
  id: string
  item: LootItem | undefined
  name: string
  /** Where to buy it now, or what's in the way; null when the price data doesn't have it. */
  buy: BuyInfo | null
  /** Quests that hand it out, with their status. */
  rewards: { quest: Quest; status: QuestStatus | undefined; onStart: boolean }[]
  /** Maps with a lock it opens, and how many. */
  locks: { group: Group; count: number }[]
  /** Maps where it can spawn loose, with how many spots, and whether one only ever has keys. */
  spawns: { group: Group; spots: number; keySpot: boolean }[]
  /** Maps it gets you onto. */
  access: Group[]
}

/** Spots per key and map group, each place once (alternate versions of a map repeat their main map's). */
class SpotCount {
  private readonly byKey = new Map<
    string,
    Map<string, { group: Group; spots: Set<string>; keySpot: boolean }>
  >()

  add(keyId: string, group: Group, at: Vec3, keySpot = false): void {
    const groups = this.byKey.get(keyId) ?? new Map()
    const entry = groups.get(group.key) ?? { group, spots: new Set<string>(), keySpot: false }
    entry.spots.add(`${Math.round(at.x)},${Math.round(at.y)},${Math.round(at.z)}`)
    entry.keySpot ||= keySpot
    groups.set(group.key, entry)
    this.byKey.set(keyId, groups)
  }

  get(keyId: string): { group: Group; count: number; keySpot: boolean }[] {
    return [...(this.byKey.get(keyId)?.values() ?? [])].map((e) => ({
      group: e.group,
      count: e.spots.size,
      keySpot: e.keySpot
    }))
  }
}

/** Look up how to get a key and what it opens, from the price, quest and map data. */
export function useKeyInfo(
  settings: PublicSettings,
  priceState: PriceState | null
): { info: (keyId: string) => KeyInfo; groups: ReadonlyMap<string, Group>; keyIds: ReadonlySet<string> } {
  const { questState, rows } = useQuestRows(settings)
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(settings, priceState)
  const dataset = questState?.dataset ?? null
  const groups = useMemo(() => mapGroups(dataset?.maps ?? []), [dataset])
  // Every key in the game: tarkov.dev types them, and the map data names the ones locks need.
  const keyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items.values()) if (item.types.includes('keys')) ids.add(item.id)
    for (const map of dataset?.maps ?? []) {
      for (const l of map.locks ?? []) ids.add(l.keyId)
      for (const id of map.access?.keyIds ?? []) ids.add(id)
    }
    return ids
  }, [items, dataset])
  const status = useMemo(() => new Map(rows.map((r) => [r.quest.id, r.status])), [rows])
  const rewards = useMemo(
    () =>
      keyRewards(
        rows.map((r) => r.quest),
        (id) => keyIds.has(id)
      ),
    [rows, keyIds]
  )
  const where = useMemo(() => {
    const locks = new SpotCount()
    const spawns = new SpotCount()
    const access = new Map<string, Group[]>()
    for (const map of dataset?.maps ?? []) {
      const group = groups.get(map.id)
      if (!group) continue
      for (const l of map.locks ?? []) locks.add(l.keyId, group, l.position)
      for (const s of map.keySpawns ?? [])
        for (const id of s.keyIds) spawns.add(id, group, s.position, s.items === s.keyIds.length)
      for (const id of map.access?.keyIds ?? [])
        if (!access.get(id)?.includes(group)) access.set(id, [...(access.get(id) ?? []), group])
    }
    return { locks, spawns, access }
  }, [dataset, groups])

  const info = useCallback(
    (keyId: string): KeyInfo => {
      const item = items.get(keyId)
      return {
        id: keyId,
        item,
        name: item?.name ?? 'Unknown key',
        buy: item ? buyOptions(item, ctx) : null,
        rewards: (rewards.get(keyId) ?? []).map((r) => ({ ...r, status: status.get(r.quest.id) })),
        locks: where.locks.get(keyId).map(({ group, count }) => ({ group, count })),
        spawns: where.spawns
          .get(keyId)
          .map(({ group, count, keySpot }) => ({ group, spots: count, keySpot })),
        access: where.access.get(keyId) ?? []
      }
    },
    [items, ctx, rewards, status, where]
  )
  return { info, groups, keyIds }
}
