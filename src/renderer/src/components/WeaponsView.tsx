import { useCallback, useEffect, useMemo, useState } from 'react'
import { EMPTY_HIDEOUT } from '../../../shared/hideout'
import { gunsFor } from '../../../shared/settings'
import type { MapPlan } from '../../../shared/todo'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { gunOptions, killText, mapGun, mapKills, questGunMaps, type MapKill } from '../../../shared/weapons'
import { mapGroups } from '../lib/mapGroups'
import { useFriendKeys } from '../lib/useFriendKeys'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
import { useKillPlan } from '../lib/useTodoPlan'
import { useStore } from '../store'
import { GunPicture } from './GunCards'
import LoadError from './LoadError'
import OverviewNav from './OverviewNav'
import SettingsLink from './SettingsLink'

// The Weapons tab (since 1.54.0): for each map with kill quests that have to be made with particular
// weapons, the gun to bring, one per map, chosen from every gun that counts for one of them. To do's
// map and the Maps tab's reminder show it. Since 1.56.0 it opens on a tile per map, like To do's.

type Items = ReturnType<typeof useItemLookup>

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** A map listed, with its kill quests that need particular weapons. */
interface WeaponMap {
  plan: MapPlan
  kills: MapKill[]
}

export default function WeaponsView({
  settings,
  priceState
}: {
  settings: PublicSettings
  priceState: PriceState | null
}): React.JSX.Element {
  const { questState, rows, objectives } = useQuestRows(settings)
  const items = useItemLookup(priceState)
  const updateSettings = useStore((s) => s.updateSettings)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const { owned } = useFriendKeys(settings)
  const dataset = questState?.dataset ?? null
  const groups = useMemo(() => mapGroups(dataset?.maps ?? []), [dataset])
  const groupOf = useCallback((id: string) => groups.get(id), [groups])
  const plan = useKillPlan(settings, rows, objectives, groupOf, owned, progress.have)
  // Every quest's kills, for which maps still have any (a map hidden by Only quests I can do keeps its gun).
  const allPlan = useKillPlan(settings, rows, objectives, groupOf, owned, progress.have, true)
  // Maps with kills of their own that need particular weapons first, then the ones where only kills on
  // any map do, each in To do's order.
  const maps = useMemo(() => {
    const withKills = plan.maps
      .map((p) => ({ plan: p, kills: mapKills(p.steps, plan.anyMap) }))
      .filter((m) => m.kills.length > 0)
    const own = (m: (typeof withKills)[number]): boolean => m.kills.some((k) => !k.anyMap)
    return [...withKills.filter(own), ...withKills.filter((m) => !own(m))]
  }, [plan])
  // The guns chosen for the game mode played (since 1.58.0 each mode keeps its own).
  const byMap = gunsFor(settings)
  // The gun for some maps (several when brought to every map with a quest), or none. Choices for maps
  // left with no kill quests that need particular weapons go at the same time.
  const choose = (mapKeys: readonly string[], itemId: string | null): void => {
    const live = new Set(
      allPlan.maps.filter((p) => mapKills(p.steps, allPlan.anyMap).length).map((p) => p.group.key)
    )
    const next = Object.fromEntries(Object.entries(byMap).filter(([key]) => live.has(key)))
    for (const key of mapKeys) {
      if (itemId) next[key] = itemId
      else delete next[key]
    }
    const { byMode } = settings.weapons
    void updateSettings({
      weapons: { ...settings.weapons, byMode: { ...byMode, [settings.gameMode]: next } }
    })
  }

  // Back to the map on the To do tab, opened from its overview.
  const openTodo = (mapKey: string): void => {
    useStore.getState().openTodoMap(mapKey)
    void updateSettings({ view: 'todo', todo: { ...settings.todo, layout: 'maps' } })
  }

  // The map opened from the overview (or from To do and the reminder); one no longer listed goes back.
  const openedKey = useStore((s) => s.weaponsMap)
  const openMap = useStore((s) => s.openWeaponsMap)
  const opened = openedKey ? maps.find((m) => m.plan.group.key === openedKey) : undefined
  useEffect(() => {
    if (openedKey && dataset && !opened) openMap(null)
  }, [openedKey, dataset, opened, openMap])
  // In the List, a map opened from To do or the reminder is scrolled to.
  const listed = settings.weapons.layout === 'list'
  useEffect(() => {
    if (listed && opened) document.getElementById(`weapons-${opened.plan.group.key}`)?.scrollIntoView()
  }, [listed, opened])

  const chosenCount = maps.filter((m) => mapGun(m.kills, byMap[m.plan.group.key])?.chosen).length
  return (
    <div className="weapons-page">
      <div className="summary">
        <div className="summary-title">
          <strong>Weapons</strong>
          <span className="muted">
            {dataset ? (
              maps.length ? (
                `${plural(maps.length, 'map')} with kill quests that need particular weapons · ${chosenCount} with a gun chosen`
              ) : (
                'None of your active quests has kills that need particular weapons.'
              )
            ) : questState?.error ? (
              <LoadError what="quests" error={questState.error} />
            ) : (
              'Loading quests…'
            )}
          </span>
          <span className="muted small settings-note">
            {settings.todo.show === 'doable' ? 'Only quests I can do' : 'Showing all quests'}
            {' · '}
            <SettingsLink section="quests" />
          </span>
        </div>
        <p className="hint">
          Choose the gun to bring to each map: one per map, from every gun that counts for one of its kill
          quests (kills on any map count everywhere). Until you do, the one that covers the most is suggested.
          To do and the map&rsquo;s Before you raid show it. Each game mode keeps its own.
        </p>
        <div className="segmented small" role="radiogroup" aria-label="How to show maps">
          {(
            [
              ['tiles', 'Overview', 'A tile per map with its gun: click one to change it'],
              ['list', 'List', 'Every map with its kill quests, one under another']
            ] as const
          ).map(([id, text, title]) => (
            <button
              key={id}
              role="radio"
              aria-checked={settings.weapons.layout === id}
              className={settings.weapons.layout === id ? 'active' : ''}
              title={title}
              onClick={() => {
                // Overview also goes back from an opened map.
                openMap(null)
                void updateSettings({ weapons: { ...settings.weapons, layout: id } })
              }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      {dataset && !maps.length ? (
        <div className="empty">
          <p>No kill quests need particular weapons right now.</p>
        </div>
      ) : listed ? (
        <div key="list" className="weapons-maps">
          {maps.map((m) => (
            <MapWeapons
              key={m.plan.group.key}
              plan={m.plan}
              kills={m.kills}
              maps={maps}
              byMap={byMap}
              items={items}
              onChoose={choose}
              onOpenTodo={() => openTodo(m.plan.group.key)}
            />
          ))}
        </div>
      ) : opened ? (
        <div key={`map:${opened.plan.group.key}`} className="weapons-maps">
          <OverviewNav
            items={maps.map((m) => m.plan.group)}
            current={opened.plan.group.key}
            name={opened.plan.group.name}
            label="Maps"
            allLabel="All maps"
            onOpen={openMap}
          />
          <MapWeapons
            plan={opened.plan}
            kills={opened.kills}
            maps={maps}
            byMap={byMap}
            items={items}
            onChoose={choose}
            onOpenTodo={() => openTodo(opened.plan.group.key)}
          />
        </div>
      ) : (
        <div key="tiles" className="weapons-maps weapons-tiles">
          {maps.map((m, i) => (
            <MapTile
              key={m.plan.group.key}
              map={m}
              rank={i + 1}
              chosen={byMap[m.plan.group.key]}
              items={items}
              onOpen={openMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** A map in the overview: its gun, chosen or not, and its kill quests; click it to change the gun. */
function MapTile({
  map,
  rank,
  chosen,
  items,
  onOpen
}: {
  map: WeaponMap
  rank: number
  chosen: string | undefined
  items: Items
  onOpen: (mapKey: string) => void
}): React.JSX.Element | null {
  const gun = mapGun(map.kills, chosen)
  if (!gun) return null
  const name = items.get(gun.itemId)?.name ?? 'Unknown weapon'
  const quests = [...new Set(map.kills.map((k) => k.quest.name))]
  return (
    <button
      className={`todo-tile weapons-tile ${gun.chosen ? 'chosen' : 'unchosen'}`}
      aria-label={`${map.plan.group.name}: ${gun.chosen ? `bringing ${name}` : 'no gun chosen'}. Open it`}
      onClick={() => onOpen(map.plan.group.key)}
    >
      <span className="todo-tile-head">
        <span className="todo-rank">{rank}</span>
        <span className="todo-tile-name">
          <strong>{map.plan.group.name}</strong>
        </span>
        <span className="todo-tile-open" aria-hidden>
          ▶
        </span>
      </span>
      <GunPicture id={gun.itemId} items={items} />
      <span className="weapons-tile-gun">
        <span className="map-gun-label">{gun.chosen ? '★ Gun to bring' : 'No gun chosen'}</span>
        <strong>{gun.chosen ? name : `Suggested: ${name}`}</strong>
        <span className="muted">
          Covers {gun.covers.length} of {plural(map.kills.length, 'kill quest')}
        </span>
      </span>
      <span className="todo-tile-quests">
        {quests.slice(0, 3).map((q) => (
          <span key={q}>{q}</span>
        ))}
        {quests.length > 3 && <span className="muted">+{quests.length - 3} more</span>}
      </span>
    </button>
  )
}

function MapWeapons({
  plan,
  kills,
  maps,
  byMap,
  items,
  onChoose,
  onOpenTodo
}: {
  plan: MapPlan
  kills: MapKill[]
  /** Every map listed, for bringing a gun to all of a quest's maps. */
  maps: readonly WeaponMap[]
  byMap: Readonly<Record<string, string>>
  items: Items
  onChoose: (mapKeys: readonly string[], itemId: string | null) => void
  onOpenTodo: () => void
}): React.JSX.Element | null {
  const chosen = byMap[plan.group.key]
  // Quests unfolded to pick a gun from (since 1.55.0), by quest and objective: folded to start with.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const killKey = (k: MapKill): string => `${k.quest.id}:${k.objective.id}`
  const gun = mapGun(kills, chosen)
  if (!gun) return null
  const options = gunOptions(kills)
  const name = (id: string): string => items.get(id)?.name ?? 'Unknown weapon'
  const toggle = (k: MapKill): void =>
    setOpen((was) => {
      const next = new Set(was)
      if (!next.delete(killKey(k))) next.add(killKey(k))
      return next
    })
  return (
    <article id={`weapons-${plan.group.key}`} className={`weapons-map ${gun.chosen ? 'chosen' : ''}`}>
      <header>
        <strong>{plan.group.name}</strong>
        <span className="muted">{plural(kills.length, 'kill quest')} that need particular weapons</span>
        <button className="button small" title="Open this map on the To do tab" onClick={onOpenTodo}>
          Open in To do ▶
        </button>
      </header>
      <div className="weapons-current">
        <GunPicture id={gun.itemId} items={items} className="large" />
        <div className="weapons-current-text">
          <span className="map-gun-label">
            {gun.chosen ? '★ Gun to bring' : 'Suggested: the one that covers the most'}
          </span>
          <strong className="weapons-gun-name">{name(gun.itemId)}</strong>
          <span className="muted">
            Covers {gun.covers.length} of {plural(kills.length, 'kill quest')} here
            {gun.chosen ? '' : ': open a quest below to choose a gun'}
          </span>
          {gun.chosen && (
            <button
              className="link small"
              title="Go back to the suggested gun"
              onClick={() => onChoose([plan.group.key], null)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <ul className="weapons-quests">
        {kills.map((k) => {
          const covered = gun.covers.includes(k)
          const unfolded = open.has(killKey(k))
          return (
            <li
              key={`${k.quest.id}:${k.objective.id}`}
              className={`weapons-quest ${covered ? 'covers' : 'misses'}`}
            >
              <button className="weapons-quest-head" aria-expanded={unfolded} onClick={() => toggle(k)}>
                <span aria-hidden>{unfolded ? '▾' : '▸'}</span>
                <span className="weapons-quest-mark" aria-label={covered ? 'Covered' : 'Not covered'}>
                  {covered ? '✓' : '✗'}
                </span>
                <strong>{k.quest.name}</strong>
                <span className="muted">{killText(k, 'objective')}</span>
                <span className="muted weapons-quest-count">{plural(k.itemIds.length, 'gun')} count</span>
              </button>
              {unfolded && (
                <div className="weapons-options" role="radiogroup" aria-label={`Guns for ${k.quest.name}`}>
                  {k.itemIds.map((id) => {
                    const selected = gun.chosen && id === gun.itemId
                    const covers = options.find((o) => o.itemId === id)?.covers.length ?? 1
                    return (
                      <button
                        key={id}
                        role="radio"
                        aria-checked={selected}
                        className={`weapons-option ${selected ? 'selected' : ''}`}
                        title={`Bring it to ${plan.group.name}`}
                        onClick={() => onChoose([plan.group.key], id)}
                      >
                        <GunPicture id={id} items={items} />
                        <span className="weapons-option-name">{name(id)}</span>
                        <span className="muted">
                          covers {covers} of {kills.length} here
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {unfolded && gun.chosen && k.itemIds.includes(gun.itemId) && (
                <AllMaps
                  kill={k}
                  itemId={gun.itemId}
                  mapKey={plan.group.key}
                  maps={maps}
                  byMap={byMap}
                  name={name}
                  onChoose={onChoose}
                />
              )}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

/**
 * Bring the map's gun to every other map with the same quest where it counts for it (since 1.56.0),
 * replacing the gun chosen there, or say it already is.
 */
function AllMaps({
  kill,
  itemId,
  mapKey,
  maps,
  byMap,
  name,
  onChoose
}: {
  kill: MapKill
  itemId: string
  mapKey: string
  maps: readonly WeaponMap[]
  byMap: Readonly<Record<string, string>>
  name: (id: string) => string
  onChoose: (mapKeys: readonly string[], itemId: string | null) => void
}): React.JSX.Element | null {
  const keys = questGunMaps(
    maps.map((m) => ({ key: m.plan.group.key, kills: m.kills })),
    kill.quest.id,
    itemId
  )
  if (keys.length < 2) return null
  const mapName = (key: string): string => maps.find((m) => m.plan.group.key === key)?.plan.group.name ?? key
  const others = keys.filter((key) => key !== mapKey)
  const changing = others.filter((key) => byMap[key] !== itemId)
  if (!changing.length)
    return (
      <p className="weapons-all-maps muted">
        ✓ {name(itemId)} is the gun for every map with {kill.quest.name} ({others.map(mapName).join(', ')})
      </p>
    )
  const replacing = changing.filter((key) => byMap[key])
  return (
    <p className="weapons-all-maps">
      <button className="button small" onClick={() => onChoose(keys, itemId)}>
        Bring {name(itemId)} to every map with {kill.quest.name}
      </button>{' '}
      <span className="muted">
        {changing.map(mapName).join(', ')}
        {replacing.length > 0 &&
          ` · replaces ${replacing.map((key) => `${name(byMap[key])} on ${mapName(key)}`).join(', ')}`}
      </span>
    </p>
  )
}
