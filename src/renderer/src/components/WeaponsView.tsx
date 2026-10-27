import { useCallback, useEffect, useMemo, useState } from 'react'
import { EMPTY_HIDEOUT } from '../../../shared/hideout'
import { ofKind } from '../../../shared/questKind'
import { gunsFor } from '../../../shared/settings'
import { emptyMapPlan, type MapPlan } from '../../../shared/todo'
import type { PriceState, PublicSettings } from '../../../shared/types'
import {
  gunOptions,
  killText,
  mapGun,
  mapKills,
  MAX_MAP_GUNS,
  questGunMaps,
  toggleGun,
  weaponMaps,
  type MapGun,
  type MapKill
} from '../../../shared/weapons'
import { mapGroups } from '../lib/mapGroups'
import { useFriendKeys } from '../lib/useFriendKeys'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
import { useKillPlan } from '../lib/useTodoPlan'
import { useStore } from '../store'
import { GunPicture } from './GunCards'
import LoadError from './LoadError'
import OverviewNav from './OverviewNav'
import QuestKindSwitch from './QuestKindSwitch'
import SettingsLink from './SettingsLink'

// The Weapons tab (since 1.54.0): for each map with kill quests that have to be made with particular
// weapons, the guns to bring, up to two per map (since 1.62.0; one before), chosen from every gun that
// counts for one of them. To do's map and the Maps tab's reminder show them. Since 1.56.0 it opens on a
// tile per map, like To do's.

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
  const { questState, rows: everyRow, objectives } = useQuestRows(settings)
  // All, the story or the side quests (since 1.61.0).
  const rows = useMemo(() => ofKind(everyRow, settings.quests.kind), [everyRow, settings.quests.kind])
  const items = useItemLookup(priceState)
  const updateSettings = useStore((s) => s.updateSettings)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const { owned } = useFriendKeys(settings)
  const dataset = questState?.dataset ?? null
  const groups = useMemo(() => mapGroups(dataset?.maps ?? []), [dataset])
  const groupOf = useCallback((id: string) => groups.get(id), [groups])
  const plan = useKillPlan(settings, rows, objectives, groupOf, owned, progress.have)
  // Every quest's kills, for which maps still have any (a map hidden by Only quests I can do keeps its gun).
  const allPlan = useKillPlan(settings, everyRow, objectives, groupOf, owned, progress.have, true)
  // Maps with kills of their own that need particular weapons first, then the ones where only kills on
  // any map do, each in To do's order, then the other maps for kills on any map.
  const groupList = useMemo(() => [...groups.values()], [groups])
  const maps = useMemo(
    () => weaponMaps(plan.maps, plan.anyMap, groupList, (g) => emptyMapPlan(g)),
    [plan, groupList]
  )
  // The guns chosen for the game mode played (since 1.58.0 each mode keeps its own).
  const byMap = gunsFor(settings)
  // Every quest's kills by map, so a gun chosen for a quest hidden by the switch or the filter is kept
  // (a map with none of its own has the kills on any map).
  const allKills = useMemo(() => {
    const byKey = new Map(allPlan.maps.map((p) => [p.group.key, mapKills(p.steps, allPlan.anyMap)]))
    const anywhere = mapKills([], allPlan.anyMap)
    return (mapKey: string): MapKill[] => byKey.get(mapKey) ?? anywhere
  }, [allPlan])
  // The guns chosen for a map that still count for one of its kills, in the order chosen.
  const chosenFor = (mapKey: string): string[] => {
    const gun = mapGun(allKills(mapKey), gunsFor(useStore.getState().settings ?? settings)[mapKey])
    return gun?.chosen ? gun.itemIds : []
  }
  // The guns for some maps (none to go back to the suggestion). Choices for maps left with no kill
  // quests that need particular weapons go at the same time. Built on the settings as saved last, so
  // quick clicks don't undo each other.
  const setGuns = (changes: Readonly<Record<string, readonly string[]>>): void => {
    const current = useStore.getState().settings ?? settings
    const next = Object.fromEntries(Object.entries(gunsFor(current)).filter(([key]) => allKills(key).length))
    for (const [key, ids] of Object.entries(changes)) {
      if (ids.length) next[key] = [...ids]
      else delete next[key]
    }
    const { byMode } = current.weapons
    void updateSettings({
      weapons: { ...current.weapons, byMode: { ...byMode, [current.gameMode]: next } }
    })
  }
  // A gun clicked: added (replacing the one chosen first when there are two already) or taken off.
  const toggle = (mapKey: string, itemId: string): void =>
    setGuns({ [mapKey]: toggleGun(chosenFor(mapKey), itemId) })
  // A gun added to every map with a quest, on the maps that don't have it yet.
  const bringAll = (mapKeys: readonly string[], itemId: string): void =>
    setGuns(
      Object.fromEntries(
        mapKeys
          .filter((key) => !chosenFor(key).includes(itemId))
          .map((key) => [key, toggleGun(chosenFor(key), itemId)])
      )
    )

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
                `None of your active ${settings.quests.kind === 'all' ? '' : `${settings.quests.kind} `}quests has kills that need particular weapons.`
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
          Choose the guns to bring to each map: up to {MAX_MAP_GUNS} per map, from every gun that counts for
          one of its kill quests (kills on any map count everywhere). Click a gun to add it or take it off; a
          third replaces the first you picked. Until you choose, the pair that covers the most is suggested.
          To do and the map&rsquo;s Before you raid show them. Each game mode keeps its own.
        </p>
        <div className="weapons-controls">
          <div className="segmented small" role="radiogroup" aria-label="How to show maps">
            {(
              [
                ['tiles', 'Overview', 'A tile per map with its guns: click one to change them'],
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
          <QuestKindSwitch settings={settings} />
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
              chosen={chosenFor(m.plan.group.key)}
              chosenFor={chosenFor}
              items={items}
              onToggle={(id) => toggle(m.plan.group.key, id)}
              onSet={(ids) => setGuns({ [m.plan.group.key]: ids })}
              onBringAll={bringAll}
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
            chosen={chosenFor(opened.plan.group.key)}
            chosenFor={chosenFor}
            items={items}
            onToggle={(id) => toggle(opened.plan.group.key, id)}
            onSet={(ids) => setGuns({ [opened.plan.group.key]: ids })}
            onBringAll={bringAll}
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

/** The guns' names, joined: "M4A1" or "M4A1 + SV-98". */
const gunNames = (gun: MapGun, items: Items): string =>
  gun.itemIds.map((id) => items.get(id)?.name ?? 'Unknown weapon').join(' + ')

/** A map in the overview: its guns, chosen or not, and its kill quests; click it to change them. */
function MapTile({
  map,
  rank,
  chosen,
  items,
  onOpen
}: {
  map: WeaponMap
  rank: number
  chosen: readonly string[] | undefined
  items: Items
  onOpen: (mapKey: string) => void
}): React.JSX.Element | null {
  const gun = mapGun(map.kills, chosen)
  if (!gun) return null
  const names = gunNames(gun, items)
  const quests = [...new Set(map.kills.map((k) => k.quest.name))]
  return (
    <button
      className={`todo-tile weapons-tile ${gun.chosen ? 'chosen' : 'unchosen'}`}
      aria-label={`${map.plan.group.name}: ${gun.chosen ? `bringing ${names}` : 'no gun chosen'}. Open it`}
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
      <span className={`weapons-tile-pictures n${gun.itemIds.length}`}>
        {gun.itemIds.map((id) => (
          <GunPicture key={id} id={id} items={items} />
        ))}
      </span>
      <span className="weapons-tile-gun">
        <span className="map-gun-label">
          {gun.chosen ? (gun.itemIds.length > 1 ? '★ Guns to bring' : '★ Gun to bring') : 'No gun chosen'}
        </span>
        <strong>{gun.chosen ? names : `Suggested: ${names}`}</strong>
        <span className="muted">
          {gun.itemIds.length > 1 ? 'Between them they cover' : 'Covers'} {gun.covers.length} of{' '}
          {plural(map.kills.length, 'kill quest')}
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
  chosen,
  chosenFor,
  items,
  onToggle,
  onSet,
  onBringAll,
  onOpenTodo
}: {
  plan: MapPlan
  kills: MapKill[]
  /** Every map listed, for bringing a gun to all of a quest's maps. */
  maps: readonly WeaponMap[]
  /** The guns chosen here that still count, in the order chosen. */
  chosen: readonly string[]
  chosenFor: (mapKey: string) => string[]
  items: Items
  onToggle: (itemId: string) => void
  onSet: (itemIds: readonly string[]) => void
  onBringAll: (mapKeys: readonly string[], itemId: string) => void
  onOpenTodo: () => void
}): React.JSX.Element | null {
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
  // Two chosen already (counting one for a quest the switch hides): a third replaces the first.
  const full = chosen.length >= MAX_MAP_GUNS
  const replaced = full
    ? `${name(chosen[0])}${gun.itemIds.includes(chosen[0]) ? '' : ' (for a quest not shown)'}`
    : ''
  return (
    <article id={`weapons-${plan.group.key}`} className={`weapons-map ${gun.chosen ? 'chosen' : ''}`}>
      <header>
        <strong>{plan.group.name}</strong>
        <span className="muted">
          {plural(kills.length, 'kill quest')} that need{kills.length === 1 ? 's' : ''} particular weapons
        </span>
        <button className="button small" title="Open this map on the To do tab" onClick={onOpenTodo}>
          Open in To do ▶
        </button>
      </header>
      <div className="weapons-current-head">
        <span className="map-gun-label">
          {gun.chosen
            ? gun.itemIds.length > 1
              ? '★ Guns to bring'
              : '★ Gun to bring'
            : gun.itemIds.length > 1
              ? 'Suggested: the pair that covers the most'
              : 'Suggested: the one that covers them all'}
        </span>
        <span className="muted">
          {gun.itemIds.length > 1 ? 'Between them they cover' : 'Covers'} {gun.covers.length} of{' '}
          {plural(kills.length, 'kill quest')} here
          {gun.chosen
            ? gun.itemIds.length < MAX_MAP_GUNS && gun.misses.length
              ? ': open a quest below to add a second gun'
              : ''
            : ': open a quest below to choose your own'}
        </span>
        {gun.chosen ? (
          gun.itemIds.length > 1 && (
            <button className="link small" title="Go back to the suggested guns" onClick={() => onSet([])}>
              Clear all
            </button>
          )
        ) : (
          <button
            className="button small"
            title={`Bring ${gun.itemIds.length > 1 ? 'these' : 'it'} to ${plan.group.name}`}
            onClick={() => onSet(gun.itemIds)}
          >
            Bring {gun.itemIds.length > 1 ? 'these' : 'it'}
          </button>
        )}
      </div>
      <div className={`weapons-current n${gun.guns.length}`}>
        {gun.guns.map((g) => (
          <div key={g.itemId} className="weapons-current-gun">
            <GunPicture id={g.itemId} items={items} className="large" />
            <div className="weapons-current-text">
              <strong className="weapons-gun-name">{name(g.itemId)}</strong>
              <span className="muted">
                Covers {g.covers.length} of {plural(kills.length, 'kill quest')} here
              </span>
              {gun.chosen && (
                <button
                  className="link small"
                  title={`Stop bringing ${name(g.itemId)} to ${plan.group.name}`}
                  onClick={() => onToggle(g.itemId)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
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
                <>
                  <p className="weapons-options-hint muted small">
                    Click a gun to bring it, up to {MAX_MAP_GUNS}; click it again to take it off.
                    {full && ` A third replaces ${replaced}, the first you picked.`}
                  </p>
                  <div className="weapons-options" role="group" aria-label={`Guns for ${k.quest.name}`}>
                    {k.itemIds.map((id) => {
                      const selected = gun.chosen && gun.itemIds.includes(id)
                      const covers = options.find((o) => o.itemId === id)?.covers.length ?? 1
                      return (
                        <button
                          key={id}
                          aria-pressed={selected}
                          className={`weapons-option ${selected ? 'selected' : ''}`}
                          title={
                            selected
                              ? `Stop bringing it to ${plan.group.name}`
                              : full
                                ? `Bring it to ${plan.group.name} instead of ${replaced}`
                                : `Bring it to ${plan.group.name}`
                          }
                          onClick={() => onToggle(id)}
                        >
                          <GunPicture id={id} items={items} />
                          <span className="weapons-option-name">
                            {selected && <span aria-hidden>★ </span>}
                            {name(id)}
                          </span>
                          <span className="muted">
                            covers {covers} of {kills.length} here
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {unfolded &&
                gun.chosen &&
                gun.itemIds
                  .filter((id) => k.itemIds.includes(id))
                  .map((id) => (
                    <AllMaps
                      key={id}
                      kill={k}
                      itemId={id}
                      mapKey={plan.group.key}
                      maps={maps}
                      chosenFor={chosenFor}
                      name={name}
                      onBringAll={onBringAll}
                    />
                  ))}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

/**
 * Bring one of the map's guns to every other map with the same quest where it counts for it (since
 * 1.56.0), adding it there (in place of the gun chosen first, when two are), or say it already is.
 */
function AllMaps({
  kill,
  itemId,
  mapKey,
  maps,
  chosenFor,
  name,
  onBringAll
}: {
  kill: MapKill
  itemId: string
  mapKey: string
  maps: readonly WeaponMap[]
  chosenFor: (mapKey: string) => string[]
  name: (id: string) => string
  onBringAll: (mapKeys: readonly string[], itemId: string) => void
}): React.JSX.Element | null {
  const keys = questGunMaps(
    maps.map((m) => ({ key: m.plan.group.key, kills: m.kills })),
    kill.quest.id,
    itemId
  )
  if (keys.length < 2) return null
  const mapName = (key: string): string => maps.find((m) => m.plan.group.key === key)?.plan.group.name ?? key
  const others = keys.filter((key) => key !== mapKey)
  const changing = others.filter((key) => !chosenFor(key).includes(itemId))
  if (!changing.length)
    return (
      <p className="weapons-all-maps muted">
        ✓ {name(itemId)} is brought to every map with {kill.quest.name} ({others.map(mapName).join(', ')})
      </p>
    )
  const replacing = changing.filter((key) => chosenFor(key).length >= MAX_MAP_GUNS)
  return (
    <p className="weapons-all-maps">
      <button className="button small" onClick={() => onBringAll(keys, itemId)}>
        Bring {name(itemId)} to every map with {kill.quest.name}
      </button>{' '}
      <span className="muted">
        {changing.map(mapName).join(', ')}
        {replacing.length > 0 &&
          ` · replaces ${replacing.map((key) => `${name(chosenFor(key)[0])} on ${mapName(key)}`).join(', ')}`}
      </span>
    </p>
  )
}
