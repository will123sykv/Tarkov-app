import { useCallback, useMemo } from 'react'
import { EMPTY_KEYS, keysNeeded, opens } from '../../../shared/keys'
import { objectiveTarget, objectiveValue } from '../../../shared/questProgress'
import type { GameMap, MapLabel, Quest, QuestObjective, Vec3 } from '../../../shared/questTypes'
import { STORY_TRADER } from '../../../shared/storyQuests'
import type { MapSettings, PriceState, PublicSettings, TodoSettings } from '../../../shared/types'
import { interactiveProjection, posterProjection } from '../lib/mapProjection'
import { BOSS_ICON, LOCK_ICON, pinIcons, SNIPER_ICON, type PinKind } from '../lib/mapMarkers'
import { posterFor } from '../lib/posterMap'
import {
  doableMarkers,
  KEY_ICON,
  MINE_ICON,
  OBJECTIVE_ICONS,
  ROUGH_ICON,
  type ObjectiveMarker
} from '../lib/questPins'
import { configFor, MAP_CONFIGS, STATUS_LABEL } from '../lib/questUi'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import MapCanvas, { MARKER_COLORS, type KeyMarks, type MapLayers } from './MapCanvas'
import QuestDetail from './QuestDetail'

const SCOPES: { id: MapSettings['questScope']; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'available', label: 'Active + available' },
  { id: 'none', label: 'None' }
]

// The To do tab's filter, shared with it.
const WHICH: { id: TodoSettings['show']; label: string; title: string }[] = [
  { id: 'all', label: 'Show all', title: 'Every objective, with keys you don’t have marked' },
  {
    id: 'doable',
    label: 'Only quests I can do',
    title: 'Leave out objectives behind keys you don’t have, and maps you can’t get onto'
  }
]

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const Icon = ({ path }: { path: string }): React.JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d={path} />
  </svg>
)

function Legend({ color, children }: { color: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <li>
      <span className="legend-dot" style={{ background: color }} aria-hidden />
      {children}
    </li>
  )
}

/** A legend row with a pin's icon tiles in its colours. */
function PinLegend({ kind, children }: { kind: PinKind; children: React.ReactNode }): React.JSX.Element {
  return (
    <li>
      <span className={`legend-pin map-pin ${kind}`} aria-hidden>
        <span className="map-pin-icons">
          {pinIcons(kind).map((path) => (
            <span key={path} className="map-pin-icon">
              <Icon path={path} />
            </span>
          ))}
        </span>
      </span>
      {children}
    </li>
  )
}

const BADGE_ICON = { boss: BOSS_ICON, sniper: SNIPER_ICON, lock: LOCK_ICON, key: KEY_ICON }

function BadgeLegend({ kind, children }: { kind: keyof typeof BADGE_ICON; children: React.ReactNode }) {
  return (
    <li>
      <span className={`legend-badge map-badge ${kind}`} aria-hidden>
        <Icon path={BADGE_ICON[kind]} />
      </span>
      {children}
    </li>
  )
}

/** A legend row with a quest pin: a coloured name box over an icon tile. */
function QuestPinLegend({
  other,
  icon,
  children
}: {
  other?: boolean
  icon: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <li>
      <span className={`legend-pin map-pin quest ${other ? 'other' : ''}`} aria-hidden>
        <span className="map-pin-icons">
          <span className="map-pin-icon">
            <Icon path={icon} />
          </span>
        </span>
      </span>
      {children}
    </li>
  )
}

/** A legend row with an objective's icon. */
function KindLegend({ icon, children }: { icon: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="legend-kind">
      <Icon path={icon} />
      {children}
    </li>
  )
}

/** A story step on this map, and where it is (if anywhere yet). */
interface StepHere {
  quest: Quest
  objective: QuestObjective
  pin: 'mine' | 'rough' | null
}

/** Story chapters' unfinished steps on this map, with a way to pin each. */
function StorySteps({
  steps,
  mapKey,
  placing
}: {
  steps: StepHere[]
  mapKey: string
  placing: { questId: string; objectiveId: string } | null
}): React.JSX.Element | null {
  const pinOnMap = useStore((s) => s.pinOnMap)
  const setStoryPin = useStore((s) => s.setStoryPin)
  const showOnMap = useStore((s) => s.showOnMap)
  const selectQuest = useStore((s) => s.selectQuest)
  if (!steps.length) return null
  const chapters = [...new Set(steps.map((s) => s.quest))]
  return (
    <section>
      <h2>Story steps here</h2>
      {chapters.map((quest) => (
        <div key={quest.id} className="story-steps">
          <button className="link story-chapter" onClick={() => selectQuest(quest.id)}>
            {quest.name}
          </button>
          <ul>
            {steps
              .filter((s) => s.quest === quest)
              .map(({ objective, pin }) => {
                const active = placing?.questId === quest.id && placing.objectiveId === objective.id
                return (
                  <li key={objective.id} className={active ? 'placing' : ''}>
                    <span>{objective.description}</span>
                    <span className="story-step-actions">
                      {pin && (
                        <button
                          className="link small"
                          onClick={() => void showOnMap(quest.id, objective.id, mapKey)}
                        >
                          {pin === 'rough' ? 'Roughly here' : 'Your pin'}
                        </button>
                      )}
                      <button
                        className="link small"
                        onClick={() => void pinOnMap(quest.id, objective.id, mapKey)}
                      >
                        {pin === 'mine' ? 'Move' : pin === 'rough' ? 'Pin it exactly' : 'Pin it'}
                      </button>
                      {pin === 'mine' && (
                        <button
                          className="link small"
                          onClick={() => void setStoryPin(quest.id, objective.id, null)}
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </li>
                )
              })}
          </ul>
        </div>
      ))}
      <p className="hint">
        The wiki doesn&rsquo;t say exactly where story steps are: &asymp; pins sit on the place a step names.
        Pin a step yourself to mark the spot.
      </p>
    </section>
  )
}

const NO_LABELS: MapLabel[] = []

const LAYERS: { key: keyof MapSettings & `show${string}`; label: string }[] = [
  { key: 'showLabels', label: 'Place names' },
  { key: 'showExtracts', label: 'Extracts' },
  { key: 'showTransits', label: 'Transits' },
  { key: 'showBosses', label: 'Boss spawns' },
  { key: 'showSnipers', label: 'Sniper scavs' },
  { key: 'showSpawns', label: 'PMC spawns' }
]

export default function MapsView({
  settings,
  priceState
}: {
  settings: PublicSettings
  priceState: PriceState | null
}): React.JSX.Element {
  const { questState, rows, ctx, questsById, mapsById, objectives: done, detected } = useQuestRows(settings)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const updateSettings = useStore((s) => s.updateSettings)
  const selectQuest = useStore((s) => s.selectQuest)
  const selectedQuest = useStore((s) => s.selectedQuest)
  const focus = useStore((s) => s.mapFocus)
  const placing = useStore((s) => s.placing)
  const setPlacing = useStore((s) => s.setPlacing)
  const setStoryPin = useStore((s) => s.setStoryPin)
  const keyFocus = useStore((s) => s.keyFocus)
  const showKeyOnMap = useStore((s) => s.showKeyOnMap)
  const inventory = useStore((s) => s.keys[settings.gameMode]) ?? EMPTY_KEYS
  const m = settings.maps
  const set = (patch: Partial<MapSettings>): void => void updateSettings({ maps: { ...m, ...patch } })
  const dataset = questState?.dataset ?? null

  // Maps with an interactive projection, one entry per image (Night Factory joins Factory).
  const choices = useMemo(() => {
    const list: { key: string; name: string }[] = []
    for (const config of MAP_CONFIGS) {
      const map = dataset?.maps.find((gm) => gm.normalizedName === config.key)
      if (map) list.push({ key: config.key, name: map.name })
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [dataset])
  const config = MAP_CONFIGS.find((c) => c.key === m.mapKey) ?? null
  const poster = config ? posterFor(config.key) : null
  const showPoster = poster !== null && m.style === '2d'
  const projection = useMemo(
    () =>
      showPoster
        ? posterProjection(poster, config?.bounds ?? null)
        : config
          ? interactiveProjection(config)
          : null,
    [config, poster, showPoster]
  )
  const layers = useMemo<MapLayers>(
    () => ({
      extracts: m.showExtracts,
      transits: m.showTransits,
      spawns: m.showSpawns,
      labels: m.showLabels,
      bosses: m.showBosses,
      snipers: m.showSnipers
    }),
    [m.showExtracts, m.showTransits, m.showSpawns, m.showLabels, m.showBosses, m.showSnipers]
  )
  const items = useItemLookup(priceState)
  const itemName = useCallback((id: string) => items.get(id)?.name, [items])
  const maps = useMemo<GameMap[]>(
    () => (dataset?.maps ?? []).filter((gm) => config && configFor(gm) === config),
    [dataset, config]
  )
  const mapIds = useMemo(() => new Set(maps.map((gm) => gm.id)), [maps])
  const owned = useMemo(() => new Set(inventory.owned), [inventory.owned])
  // What it takes to get onto the map, as the To do tab has it (the main version's): the Lab's keycard.
  const accessKeys = useMemo(
    () => (maps.find((gm) => gm.normalizedName === config?.key) ?? maps[0])?.access?.keyIds ?? [],
    [maps, config]
  )
  const shut = accessKeys.length > 0 && !opens(accessKeys, owned)
  const doable = settings.todo.show === 'doable'
  const setShow = (show: TodoSettings['show']): void =>
    void updateSettings({ todo: { ...settings.todo, show } })

  const inScope = useMemo<ObjectiveMarker[]>(() => {
    if (m.questScope === 'none') return []
    const wanted = new Set(m.questScope === 'available' ? ['active', 'available'] : ['active'])
    const traders = new Map((dataset?.traders ?? []).map((t) => [t.id, t]))
    const result: ObjectiveMarker[] = []
    for (const { quest, status } of rows) {
      const focused = focus?.questId === quest.id || selectedQuest === quest.id
      if (!wanted.has(status) && !focused) continue
      const trader = quest.story ? STORY_TRADER : traders.get(quest.traderId)
      for (const objective of quest.objectives) {
        // Done ones (ticked off in the quest's details) leave the map, unless it's the one asked for.
        const shownAnyway = focus?.questId === quest.id && focus.objectiveId === objective.id
        if (!shownAnyway && objectiveValue(objective, quest.id, done) >= objectiveTarget(objective)) continue
        const zones = objective.zones.filter((z) => mapIds.has(z.map))
        const spots = objective.locations.filter((l) => mapIds.has(l.map)).flatMap((l) => l.positions)
        if (zones.length || spots.length) result.push({ quest, status, trader, objective, zones, spots })
      }
    }
    return result
  }, [rows, m.questScope, mapIds, focus, selectedQuest, dataset, done])
  // "Only quests I can do" leaves out what's behind keys the player doesn't have (not the quest shown
  // from "Show on map").
  const shown = useMemo(
    () =>
      doable
        ? doableMarkers(inScope, owned, shut, (marker) => focus?.questId === marker.quest.id)
        : { markers: inScope, hidden: 0, quests: 0 },
    [doable, inScope, owned, shut, focus]
  )
  const objectives = shown.markers

  // Story chapters' steps here (in scope, or the one being pinned), pinned or not.
  const storySteps = useMemo<StepHere[]>(() => {
    const wanted = new Set(m.questScope === 'available' ? ['active', 'available'] : ['active'])
    const result: StepHere[] = []
    for (const { quest, status } of rows) {
      if (!quest.story) continue
      const chosen = placing?.questId === quest.id || selectedQuest === quest.id
      if (!chosen && (m.questScope === 'none' || !wanted.has(status))) continue
      for (const objective of quest.objectives) {
        const pinning = placing?.questId === quest.id && placing.objectiveId === objective.id
        if (!pinning && !objective.maps.some((id) => mapIds.has(id))) continue
        if (!pinning && objectiveValue(objective, quest.id, done) >= objectiveTarget(objective)) continue
        if (!pinning && doable && shut) continue
        const zone = objective.zones.find((z) => mapIds.has(z.map))
        result.push({ quest, objective, pin: zone?.source ?? null })
      }
    }
    return result
  }, [rows, m.questScope, mapIds, placing, selectedQuest, done, doable, shut])
  const placingStep = placing
    ? (rows
        .find((r) => r.quest.id === placing.questId)
        ?.quest.objectives.find((o) => o.id === placing.objectiveId) ?? null)
    : null
  const cancelPlace = useCallback(() => setPlacing(null), [setPlacing])
  const onPlace = useCallback(
    (position: Vec3) => {
      if (!placing) return
      const step = rows
        .find((r) => r.quest.id === placing.questId)
        ?.quest.objectives.find((o) => o.id === placing.objectiveId)
      // On the map the step names, when it's one of this image's versions (Factory, not Night Factory).
      const map = step?.maps.find((id) => mapIds.has(id)) ?? maps[0]?.id
      setPlacing(null)
      if (map) void setStoryPin(placing.questId, placing.objectiveId, { map, position })
    },
    [placing, rows, mapIds, maps, setPlacing, setStoryPin]
  )

  // Locks and key spawns: the key looked at from the Keys tab, and (when asked) the keys quests need.
  const neededKeys = useMemo(
    () =>
      m.showKeys
        ? new Set(keysNeeded(rows, done, new Set(['active', 'available'])).flatMap((n) => n.keyIds))
        : new Set<string>(),
    [m.showKeys, rows, done]
  )
  const keyMarks = useMemo<KeyMarks | null>(() => {
    if (!keyFocus && !m.showKeys) return null
    const locks: KeyMarks['locks'] = []
    const spawns: KeyMarks['spawns'] = []
    // Alternate versions of a map repeat its locks and spots.
    const seen = new Set<string>()
    const once = (kind: string, p: Vec3): boolean => {
      const id = `${kind}@${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }
    for (const map of maps) {
      for (const l of map.locks ?? []) {
        const focused = l.keyId === keyFocus
        if ((focused || neededKeys.has(l.keyId)) && once(l.keyId, l.position))
          locks.push({
            position: l.position,
            kind: l.kind,
            name: itemName(l.keyId) ?? 'key',
            focused,
            have: owned.has(l.keyId)
          })
      }
      for (const spot of map.keySpawns ?? []) {
        const focused = keyFocus !== null && spot.keyIds.includes(keyFocus)
        const wanted = spot.keyIds.filter((id) => neededKeys.has(id) && !owned.has(id))
        if ((focused || wanted.length) && once('spawn', spot.position))
          spawns.push({
            position: spot.position,
            names: (focused ? [keyFocus] : wanted).map((id) => itemName(id) ?? 'A key'),
            items: spot.items,
            focused
          })
      }
    }
    return { locks, spawns, focusKey: keyFocus }
  }, [keyFocus, m.showKeys, maps, neededKeys, owned, itemName])
  // Where else the key looked at has locks or spawns, to switch to.
  const focusElsewhere = useMemo(() => {
    if (!keyFocus) return []
    const result: { key: string; name: string }[] = []
    for (const map of dataset?.maps ?? []) {
      const config = configFor(map)
      if (!config || config.key === m.mapKey || result.some((r) => r.key === config.key)) continue
      const here =
        (map.locks ?? []).some((l) => l.keyId === keyFocus) ||
        (map.keySpawns ?? []).some((sp) => sp.keyIds.includes(keyFocus))
      if (here)
        result.push({ key: config.key, name: choices.find((c) => c.key === config.key)?.name ?? map.name })
    }
    return result
  }, [keyFocus, dataset, m.mapKey, choices])
  const focusHere = keyMarks
    ? {
        locks: keyMarks.locks.filter((l) => l.focused).length,
        spawns: keyMarks.spawns.filter((sp) => sp.focused).length
      }
    : null

  const accessName = accessKeys.map((id) => itemName(id) ?? 'its access item').join(' or ')
  const hiddenCount =
    shown.hidden > 1
      ? `${plural(shown.hidden, 'objective')} of ${plural(shown.quests, 'quest')}`
      : '1 objective'
  const hiddenNote = !doable
    ? null
    : shut
      ? `You have no ${accessName}, so this map’s objectives are hidden.`
      : shown.hidden
        ? `${hiddenCount} hidden: behind keys you don’t have.`
        : 'Nothing here is behind a key you don’t have.'

  const onSelectQuest = useCallback((id: string) => selectQuest(id), [selectQuest])
  const selected = rows.find((r) => r.quest.id === selectedQuest) ?? null
  // The sidebar lists each quest once, with how many of its objectives are here.
  const questsHere = useMemo(() => {
    const list: { marker: ObjectiveMarker; count: number }[] = []
    for (const marker of objectives) {
      const entry = list.find((e) => e.marker.quest.id === marker.quest.id)
      if (entry) entry.count++
      else list.push({ marker, count: 1 })
    }
    return list
  }, [objectives])

  return (
    <div className={`maps ${selected && dataset ? 'with-detail' : ''}`}>
      <aside className="sidebar">
        <section>
          <h2>Map</h2>
          <select value={m.mapKey} onChange={(e) => set({ mapKey: e.target.value })} aria-label="Map">
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
            {!choices.length && <option value={m.mapKey}>Loading maps…</option>}
          </select>
          {poster && (
            <div className="mini-toggle wide map-style" role="radiogroup" aria-label="Map style">
              {(
                [
                  ['2d', '2D map'],
                  ['tarkov-dev', 'tarkov.dev']
                ] as const
              ).map(([id, text]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={m.style === id}
                  className={m.style === id ? 'active' : ''}
                  onClick={() => set({ style: id })}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </section>
        <section>
          <h2>Quest objectives</h2>
          <div className="mini-toggle wide" role="radiogroup" aria-label="Quest objectives">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={m.questScope === s.id}
                className={m.questScope === s.id ? 'active' : ''}
                onClick={() => set({ questScope: s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>
          {m.questScope !== 'none' && (
            <>
              <div className="mini-toggle wide" role="radiogroup" aria-label="Which quests">
                {WHICH.map((w) => (
                  <button
                    key={w.id}
                    role="radio"
                    aria-checked={settings.todo.show === w.id}
                    className={settings.todo.show === w.id ? 'active' : ''}
                    title={w.title}
                    onClick={() => setShow(w.id)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <p className="hint">
                {hiddenNote && <>{hiddenNote} </>}
                The To do tab shares this filter.
              </p>
            </>
          )}
          <ul className="legend">
            <QuestPinLegend icon={OBJECTIVE_ICONS.visit}>Active quest</QuestPinLegend>
            {m.questScope === 'available' && (
              <QuestPinLegend other icon={OBJECTIVE_ICONS.visit}>
                Available (not started)
              </QuestPinLegend>
            )}
          </ul>
          <ul className="legend legend-kinds">
            <KindLegend icon={ROUGH_ICON}>Story step, roughly here</KindLegend>
            <KindLegend icon={MINE_ICON}>Your pin</KindLegend>
          </ul>
          <ul className="legend legend-kinds">
            <KindLegend icon={OBJECTIVE_ICONS.visit}>Go to</KindLegend>
            <KindLegend icon={OBJECTIVE_ICONS.pickup}>Pick up</KindLegend>
            <KindLegend icon={OBJECTIVE_ICONS.stash}>Stash or plant</KindLegend>
            <KindLegend icon={OBJECTIVE_ICONS.mark}>Mark</KindLegend>
            <KindLegend icon={OBJECTIVE_ICONS.kill}>Eliminate</KindLegend>
            <KindLegend icon={OBJECTIVE_ICONS.extract}>Extract</KindLegend>
            <KindLegend icon={KEY_ICON}>Needs a key</KindLegend>
            <li className="legend-kind">
              <span className="legend-key-missing" aria-hidden>
                <Icon path={KEY_ICON} />
              </span>
              Needs a key you don&rsquo;t have
            </li>
            <li className="legend-kind">
              <span className="legend-dot" style={{ background: MARKER_COLORS.quest }} aria-hidden />
              One of several spots
            </li>
          </ul>
        </section>
        <section>
          <h2>On the map</h2>
          <div className="mini-toggle wide" role="radiogroup" aria-label="Extracts for">
            {(
              [
                ['pmc', 'PMC extracts'],
                ['scav', 'Scav extracts']
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                role="radio"
                aria-checked={m.faction === id}
                className={m.faction === id ? 'active' : ''}
                onClick={() => set({ faction: id })}
              >
                {text}
              </button>
            ))}
          </div>
          {LAYERS.map(({ key, label }) => (
            <label key={key} className="check">
              <input type="checkbox" checked={m[key]} onChange={(e) => set({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
          <ul className="legend">
            <PinLegend kind="extract">Extract</PinLegend>
            <PinLegend kind="flare">Needs a flare</PinLegend>
            <PinLegend kind="vehicle">Vehicle (costs roubles)</PinLegend>
            <PinLegend kind="coop">Co-op (PMC and scav)</PinLegend>
            <PinLegend kind="secret">Secret (needs an item)</PinLegend>
            <PinLegend kind="transit">Transit</PinLegend>
            <BadgeLegend kind="boss">Boss spawn</BadgeLegend>
            <BadgeLegend kind="sniper">Sniper scav</BadgeLegend>
            <Legend color={MARKER_COLORS.spawn}>PMC spawn</Legend>
          </ul>
        </section>
        <section>
          <h2>Keys</h2>
          {keyFocus && focusHere && (
            <div className="key-focus">
              <strong>{itemName(keyFocus) ?? 'Key'}</strong>
              <span className="muted">
                {focusHere.locks || focusHere.spawns
                  ? [
                      focusHere.locks
                        ? `${focusHere.locks} lock${focusHere.locks === 1 ? '' : 's'} it opens`
                        : null,
                      focusHere.spawns
                        ? `${focusHere.spawns} spot${focusHere.spawns === 1 ? '' : 's'} it can spawn at`
                        : null
                    ]
                      .filter(Boolean)
                      .join(' and ') + ' on this map'
                  : 'Nothing for it on this map'}
              </span>
              {focusElsewhere.length > 0 && (
                <span className="muted">
                  Also on{' '}
                  {focusElsewhere.map((c, i) => (
                    <span key={c.key}>
                      {i > 0 && ', '}
                      <button className="link" onClick={() => set({ mapKey: c.key })}>
                        {c.name}
                      </button>
                    </span>
                  ))}
                </span>
              )}
              <button className="link small" onClick={() => void showKeyOnMap(null)}>
                Stop showing it
              </button>
            </div>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={m.showKeys}
              onChange={(e) => set({ showKeys: e.target.checked })}
            />
            Locks for keys your quests need
          </label>
          <ul className="legend">
            <BadgeLegend kind="lock">Locked door or container (green: you have the key)</BadgeLegend>
            <BadgeLegend kind="key">Where a key you don&rsquo;t have can spawn</BadgeLegend>
          </ul>
          <p className="hint">
            Spawn spots are loose loot: tarkov.dev doesn&rsquo;t say how likely a key is there, and keys also
            turn up in containers. Tick the keys you have in the Keys tab.
          </p>
        </section>
        <StorySteps steps={storySteps} mapKey={m.mapKey} placing={placing} />
        <section>
          <h2>On this map</h2>
          {questsHere.length === 0 ? (
            <p className="hint">
              {m.questScope === 'none'
                ? 'Quest objectives are hidden.'
                : shown.hidden
                  ? shut
                    ? `Getting onto this map takes a ${accessName}: Show all lists its objectives.`
                    : 'What your quests have here is behind keys you don’t have: Show all lists it.'
                  : 'None of your active quests have marked spots here.'}
            </p>
          ) : (
            <ul className="map-objectives">
              {questsHere.map(({ marker: { quest, trader, status }, count }) => (
                <li key={quest.id}>
                  <button
                    className={`link ${selectedQuest === quest.id ? 'active' : ''}`}
                    onClick={() => void useStore.getState().showOnMap(quest.id, null, m.mapKey)}
                  >
                    {trader?.imageLink && <img src={trader.imageLink} alt="" />}
                    <span>
                      <strong>{quest.name}</strong>
                      <span>
                        {[
                          trader?.name,
                          status === 'active' ? null : STATUS_LABEL[status].toLowerCase(),
                          `${count} objective${count === 1 ? '' : 's'} here`
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {showPoster ? (
          <p className="hint credit">
            Map by{' '}
            <a href={poster.authorLink} target="_blank" rel="noreferrer">
              {poster.author}
            </a>{' '}
            ({poster.version})
            {poster.provider === 'db4tarkov' ? (
              <>
                , as shown on{' '}
                <a href="https://db4tarkov.com/map" target="_blank" rel="noreferrer">
                  db4tarkov.com
                </a>
              </>
            ) : null}
            , CC BY-NC-SA 4.0. Place names, extracts and spawns from tarkov.dev; markers are placed on the
            floor they&rsquo;re on.
          </p>
        ) : (
          config && (
            <p className="hint credit">
              Map by{' '}
              <a href={config.authorLink} target="_blank" rel="noreferrer">
                {config.author}
              </a>{' '}
              via tarkov.dev, CC BY-NC-SA 4.0.
            </p>
          )
        )}
      </aside>
      <main className="content map-content">
        {placing && (
          <div className="placing-banner" role="status">
            <span>Click where &ldquo;{placingStep?.description ?? 'the step'}&rdquo; is on the map.</span>
            <button className="button small" onClick={cancelPlace}>
              Cancel
            </button>
          </div>
        )}
        {projection && maps.length ? (
          <MapCanvas
            projection={projection}
            maps={maps}
            labels={config?.labels ?? NO_LABELS}
            objectives={objectives}
            owned={owned}
            layers={layers}
            faction={m.faction}
            itemName={itemName}
            focus={focus}
            selectedQuest={selectedQuest}
            onSelectQuest={onSelectQuest}
            keyMarks={keyMarks}
            placing={placing !== null}
            onPlace={onPlace}
            onCancelPlace={cancelPlace}
          />
        ) : (
          <div className="empty">
            <p>{questState?.error ? `Couldn't load map data: ${questState.error}` : 'Loading map data…'}</p>
          </div>
        )}
      </main>
      {selected && dataset && (
        <QuestDetail
          row={selected}
          progress={progress ?? {}}
          objectives={done}
          detected={detected}
          ctx={ctx}
          questsById={questsById}
          mapsById={mapsById}
          traders={dataset.traders}
          priceState={priceState}
          onOpenInQuests={() => void updateSettings({ view: 'quests' })}
        />
      )}
    </div>
  )
}
