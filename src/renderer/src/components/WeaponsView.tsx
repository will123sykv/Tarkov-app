import { useCallback, useEffect, useMemo, useState } from 'react'
import { EMPTY_HIDEOUT } from '../../../shared/hideout'
import { todoPlan, type MapPlan } from '../../../shared/todo'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { gunOptions, mapGun, mapKills, type MapKill } from '../../../shared/weapons'
import { mapGroups } from '../lib/mapGroups'
import { useFriendKeys } from '../lib/useFriendKeys'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import { GunPicture } from './GunCards'
import LoadError from './LoadError'

// The Weapons tab (since 1.54.0): for each map with kill quests that have to be made with particular
// weapons, the gun to bring, one per map, chosen from every gun that counts for one of them. To do's
// map and the Maps tab's reminder show it.

type Items = ReturnType<typeof useItemLookup>

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** "Eliminate 5 Scavs with an AKM on Customs · 2 left · any map" */
const killText = (k: MapKill): string =>
  `${k.objective.description || 'Kills'}${(k.objective.count ?? 1) > 1 ? ` · ${k.left} left` : ''}${k.anyMap ? ' · any map' : ''}`

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
  // Kill objectives only, whatever To do's filter shows, keeping its Only quests I can do.
  const plan = useMemo(
    () =>
      todoPlan(rows, objectives, groupOf, {
        have: progress.have,
        owned,
        hideBlocked: settings.todo.show === 'doable',
        kinds: 'kill'
      }),
    [rows, objectives, groupOf, progress.have, owned, settings.todo.show]
  )
  // Maps with kills of their own that need particular weapons first, then the ones where only kills on
  // any map do, each in To do's order.
  const maps = useMemo(() => {
    const withKills = plan.maps
      .map((p) => ({ plan: p, kills: mapKills(p.steps, plan.anyMap) }))
      .filter((m) => m.kills.length > 0)
    const own = (m: (typeof withKills)[number]): boolean => m.kills.some((k) => !k.anyMap)
    return [...withKills.filter(own), ...withKills.filter((m) => !own(m))]
  }, [plan])
  const byMap = settings.weapons.byMap
  const choose = (mapKey: string, itemId: string | null): void => {
    const next = { ...byMap }
    if (itemId) next[mapKey] = itemId
    else delete next[mapKey]
    void updateSettings({ weapons: { ...settings.weapons, byMap: next } })
  }

  // Back to the map on the To do tab, opened from its overview.
  const openTodo = (mapKey: string): void => {
    useStore.getState().openTodoMap(mapKey)
    void updateSettings({ view: 'todo', todo: { ...settings.todo, layout: 'maps' } })
  }

  // Opened at a map (from To do or the reminder): scroll to it.
  const focus = useStore((s) => s.weaponsFocus)
  useEffect(() => {
    if (!focus || !maps.length) return
    document.getElementById(`weapons-${focus}`)?.scrollIntoView({ block: 'start' })
    useStore.getState().focusWeapons(null)
  }, [focus, maps.length])

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
        </div>
        <p className="hint">
          Choose the gun to bring to each map: one per map, from every gun that counts for one of its kill
          quests (kills on any map count everywhere). Until you do, the one that covers the most is suggested.
          To do and the map&rsquo;s Before you raid show it.
        </p>
      </div>
      <div className="weapons-maps">
        {maps.map(({ plan: p, kills }) => (
          <MapWeapons
            key={p.group.key}
            plan={p}
            kills={kills}
            chosen={byMap[p.group.key]}
            items={items}
            onChoose={(itemId) => choose(p.group.key, itemId)}
            onOpenTodo={() => openTodo(p.group.key)}
          />
        ))}
      </div>
    </div>
  )
}

function MapWeapons({
  plan,
  kills,
  chosen,
  items,
  onChoose,
  onOpenTodo
}: {
  plan: MapPlan
  kills: MapKill[]
  chosen: string | undefined
  items: Items
  onChoose: (itemId: string | null) => void
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
  return (
    <article id={`weapons-${plan.group.key}`} className={`weapons-map ${gun.chosen ? 'chosen' : ''}`}>
      <header>
        <strong>{plan.group.name}</strong>
        <span className="muted">{plural(kills.length, 'kill quest')} that need particular weapons</span>
        <button className="button small" title="Open this map on the To do tab" onClick={onOpenTodo}>
          Open in To do
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
              onClick={() => onChoose(null)}
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
                <span className="muted">{killText(k)}</span>
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
                        onClick={() => onChoose(id)}
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
            </li>
          )
        })}
      </ul>
    </article>
  )
}
