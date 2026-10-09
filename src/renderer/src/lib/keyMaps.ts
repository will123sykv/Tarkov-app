import type { KeyUse } from '../../../shared/keys'

/** A map group, as far as keys go. */
interface MapRef {
  key: string
  name?: string
}

/** A map a key is used on, and how. */
export interface KeyMapUse {
  key: string
  name: string
  /** Locks it opens there. */
  locks: number
  /** It gets you onto the map (the Lab's keycard). */
  access: boolean
  /** A quest needs it there. */
  quest: boolean
}

/**
 * The maps a key is used on, by name: where it opens a lock, a quest needs it, or it gets you onto the
 * map. Where it only spawns doesn't count. Alternate versions of a map (Night Factory) count as their
 * main map.
 */
export function keyMapsUsed(
  info: { locks: readonly { group: MapRef; count?: number }[]; access: readonly MapRef[] },
  uses: readonly Pick<KeyUse, 'mapIds'>[],
  groupOf: ReadonlyMap<string, MapRef>
): KeyMapUse[] {
  const result = new Map<string, KeyMapUse>()
  const entry = (group: MapRef): KeyMapUse => {
    let e = result.get(group.key)
    if (!e) {
      e = { key: group.key, name: group.name ?? group.key, locks: 0, access: false, quest: false }
      result.set(group.key, e)
    }
    return e
  }
  for (const lock of info.locks) entry(lock.group).locks += lock.count ?? 1
  for (const group of info.access) entry(group).access = true
  for (const use of uses)
    for (const id of use.mapIds) {
      const group = groupOf.get(id)
      if (group) entry(group).quest = true
    }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Whether a key is used on a map (a map group's key; null: any map), as `keyMapsUsed` has it. */
export function keyUsedOn(
  info: { locks: readonly { group: MapRef; count?: number }[]; access: readonly MapRef[] },
  uses: readonly Pick<KeyUse, 'mapIds'>[],
  groupOf: ReadonlyMap<string, MapRef>,
  mapKey: string | null
): boolean {
  return mapKey === null || keyMapsUsed(info, uses, groupOf).some((m) => m.key === mapKey)
}
