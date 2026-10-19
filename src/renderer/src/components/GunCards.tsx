import { useMemo, useState } from 'react'
import { dataModeFor } from '../../../shared/gameModes'
import type { QuestObjective } from '../../../shared/questTypes'
import { gunForObjective, type MapGun, type MapKill } from '../../../shared/weapons'
import { mapGroups } from '../lib/mapGroups'
import type { useItemLookup } from '../lib/useItemLookup'
import { useStore } from '../store'

// Guns for kill quests that need particular weapons: pictures of them fully built (since 1.54.0), and
// the gun chosen for a map in the Weapons tab as To do and the Maps tab's reminder show it.

type Items = ReturnType<typeof useItemLookup>

const NO_PRESETS: Record<string, string> = {}
const NO_GUNS: Record<string, string> = {}

/** Each weapon's default preset (the gun fully built), from the prices for the game mode played. */
function usePresets(): Record<string, string> {
  const gameMode = useStore((s) => s.settings?.gameMode)
  return (
    useStore((s) => (gameMode ? s.prices[dataModeFor(gameMode)]?.dataset?.presets : undefined)) ?? NO_PRESETS
  )
}

/**
 * A picture of a gun fully built: tarkov.dev's 512px picture of its default preset (or of the weapon,
 * when there's no preset), then the preset's icon, then the weapon's, or an empty frame (offline, with
 * none cached) so cards keep their shape.
 */
export function GunPicture({
  id,
  items,
  className = ''
}: {
  id: string
  items: Items
  className?: string
}): React.JSX.Element {
  const preset = usePresets()[id]
  const sources = [
    `https://assets.tarkov.dev/${preset ?? id}-512.webp`,
    preset ? items.get(preset)?.iconLink : null,
    items.get(id)?.iconLink
  ].filter((src): src is string => !!src)
  // How many pictures have failed for this gun.
  const [failed, setFailed] = useState<{ id: string; n: number }>({ id, n: 0 })
  const n = failed.id === id ? failed.n : 0
  const src = sources[n]
  if (!src) return <span className={`gun-picture empty ${className}`} aria-hidden />
  return (
    <img
      className={`gun-picture ${className}`}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed({ id, n: n + 1 })}
    />
  )
}

const gunName = (items: Items, id: string): string => items.get(id)?.name ?? 'Unknown weapon'

/** "Supply Plans (5 left)": a kill quest the gun covers or misses. */
const killText = (k: MapKill): string =>
  `${k.quest.name}${(k.objective.count ?? 1) > 1 ? ` (${k.left} left)` : ''}${k.anyMap ? ' · any map' : ''}`

/** Open the Weapons tab on a map (its overview with none). */
export function useOpenWeapons(): (mapKey: string | null) => void {
  const updateSettings = useStore((s) => s.updateSettings)
  return (mapKey) => {
    useStore.getState().openWeaponsMap(mapKey)
    void updateSettings({ view: 'weapons' })
  }
}

/**
 * A map's gun as To do's map and the Maps tab's reminder show it: a large picture of the gun chosen in the
 * Weapons tab, the kill quests it's for and a way to change it; with none chosen, a prompt to choose one
 * (since 1.55.0 the suggestion stays in the Weapons tab).
 */
export function MapGunPanel({
  gun,
  items,
  mapKey,
  onChange
}: {
  gun: MapGun
  items: Items
  mapKey: string
  /** Before opening the Weapons tab (the reminder closes itself). */
  onChange?: () => void
}): React.JSX.Element {
  const openWeapons = useOpenWeapons()
  const open = (): void => {
    onChange?.()
    openWeapons(mapKey)
  }
  if (!gun.chosen) {
    const quests = [...new Set([...gun.covers, ...gun.misses].map((k) => k.quest.name))]
    return (
      <div className="map-gun prompt">
        <div className="map-gun-text">
          <span className="map-gun-label">No gun chosen</span>
          <span>
            {quests.join(', ')} {quests.length === 1 ? 'has a kill' : 'have kills'} to make with particular
            weapons here.
          </span>
          <button className="button small primary" onClick={open}>
            Choose a gun in Weapons ▶
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="map-gun chosen">
      <GunPicture id={gun.itemId} items={items} />
      <div className="map-gun-text">
        <span className="map-gun-label">★ Gun to bring</span>
        <strong>{gunName(items, gun.itemId)}</strong>
        <span className="muted">For {gun.covers.map(killText).join(', ')}</span>
        <button
          className="button small"
          title="Choose another gun for this map in the Weapons tab"
          onClick={open}
        >
          Change in Weapons
        </button>
      </div>
    </div>
  )
}

/**
 * After a kill objective's text: the gun chosen in the Weapons tab it'll be made with ("★ Bringing
 * AKMS"), or that none is. Nothing for kills that don't need particular weapons.
 */
export function KillGunTag({
  objective,
  items
}: {
  objective: QuestObjective
  items: Items
}): React.JSX.Element | null {
  const gameMode = useStore((s) => s.settings?.gameMode)
  const byMap = useStore((s) => s.settings?.weapons.byMap) ?? NO_GUNS
  const maps = useStore((s) => (gameMode ? s.questData[dataModeFor(gameMode)]?.dataset?.maps : undefined))
  const groups = useMemo(() => mapGroups(maps ?? []), [maps])
  if (!objective.weapons?.length) return null
  const gun = gunForObjective(objective, byMap, (id) => groups.get(id))
  if (!gun)
    return (
      <span
        className="tag gun-tag"
        title={`Any of ${objective.weapons.length} gun${objective.weapons.length === 1 ? '' : 's'} count: choose the one to bring to the map in the Weapons tab`}
      >
        No gun chosen
      </span>
    )
  const item = items.get(gun)
  return (
    <span className="tag gun-tag starred" title="The gun chosen for this map in the Weapons tab">
      {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}★ Bringing {gunName(items, gun)}
    </span>
  )
}
