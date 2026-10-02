import { useCallback, useMemo } from 'react'
import { objectiveTarget, objectiveValue } from '../../../shared/questProgress'
import type { GameMap, MapLabel, Quest, QuestObjective, Vec3 } from '../../../shared/questTypes'
import { STORY_TRADER } from '../../../shared/storyQuests'
import type { MapSettings, PriceState, PublicSettings } from '../../../shared/types'
import { interactiveProjection, posterProjection } from '../lib/mapProjection'
import { BOSS_ICON, pinIcons, SNIPER_ICON, type PinKind } from '../lib/mapMarkers'
import { posterFor } from '../lib/posterMap'
import { KEY_ICON, MINE_ICON, OBJECTIVE_ICONS, ROUGH_ICON, type ObjectiveMarker } from '../lib/questPins'
import { configFor, MAP_CONFIGS, STATUS_LABEL } from '../lib/questUi'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import MapCanvas, { MARKER_COLORS, type MapLayers } from './MapCanvas'
import QuestDetail from './QuestDetail'

const SCOPES: { id: MapSettings['questScope']; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'available', label: 'Active + available' },
  { id: 'none', label: 'None' }
]

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

function BadgeLegend({ kind, children }: { kind: 'boss' | 'sniper'; children: React.ReactNode }) {
  return (
    <li>
      <span className={`legend-badge map-badge ${kind}`} aria-hidden>
        <Icon path={kind === 'boss' ? BOSS_ICON : SNIPER_ICON} />
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

  const objectives = useMemo<ObjectiveMarker[]>(() => {
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
        const zone = objective.zones.find((z) => mapIds.has(z.map))
        result.push({ quest, objective, pin: zone?.source ?? null })
      }
    }
    return result
  }, [rows, m.questScope, mapIds, placing, selectedQuest, done])
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
        <StorySteps steps={storySteps} mapKey={m.mapKey} placing={placing} />
        <section>
          <h2>On this map</h2>
          {questsHere.length === 0 ? (
            <p className="hint">
              {m.questScope === 'none'
                ? 'Quest objectives are hidden.'
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
            layers={layers}
            faction={m.faction}
            itemName={itemName}
            focus={focus}
            selectedQuest={selectedQuest}
            onSelectQuest={onSelectQuest}
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
