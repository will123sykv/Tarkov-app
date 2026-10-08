import type { KeyUse } from '../../../shared/keys'

/** A map group, as far as filtering keys goes. */
interface MapRef {
  key: string
}

/**
 * Whether a key is used on a map (a map group's key; null: any map): it opens a lock there, a quest
 * needs it there, or it gets you onto it. Where it only spawns doesn't count. Alternate versions of a map
 * (Night Factory) count as their main map.
 */
export function keyUsedOn(
  info: { locks: readonly { group: MapRef }[]; access: readonly MapRef[] },
  uses: readonly Pick<KeyUse, 'mapIds'>[],
  groupOf: ReadonlyMap<string, MapRef>,
  mapKey: string | null
): boolean {
  if (mapKey === null) return true
  return (
    info.locks.some((l) => l.group.key === mapKey) ||
    info.access.some((g) => g.key === mapKey) ||
    uses.some((u) => u.mapIds.some((id) => groupOf.get(id)?.key === mapKey))
  )
}
