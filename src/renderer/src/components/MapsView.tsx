import { useCallback, useMemo } from 'react'
import type { GameMap } from '../../../shared/questTypes'
import type { MapSettings, PublicSettings } from '../../../shared/types'
import { interactiveProjection, re3mrProjection } from '../lib/mapProjection'
import { configFor, MAP_CONFIGS } from '../lib/questUi'
import { re3mrFor } from '../lib/re3mrMap'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import MapCanvas, { MARKER_COLORS, type ObjectiveMarker } from './MapCanvas'

const SCOPES: { id: MapSettings['questScope']; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'available', label: 'Active + available' },
  { id: 'none', label: 'None' }
]

function Legend({ color, children }: { color: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <li>
      <span className="legend-dot" style={{ background: color }} aria-hidden />
      {children}
    </li>
  )
}

export default function MapsView({ settings }: { settings: PublicSettings }): React.JSX.Element {
  const { questState, rows } = useQuestRows(settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const selectQuest = useStore((s) => s.selectQuest)
  const selectedQuest = useStore((s) => s.selectedQuest)
  const focus = useStore((s) => s.mapFocus)
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
  const re3mr = config ? re3mrFor(config.key) : null
  const showRe3mr = re3mr !== null && m.style === 're3mr'
  const projection = useMemo(
    () => (showRe3mr ? re3mrProjection(re3mr) : config ? interactiveProjection(config) : null),
    [config, re3mr, showRe3mr]
  )
  const maps = useMemo<GameMap[]>(
    () => (dataset?.maps ?? []).filter((gm) => config && configFor(gm) === config),
    [dataset, config]
  )
  const mapIds = useMemo(() => new Set(maps.map((gm) => gm.id)), [maps])

  const objectives = useMemo<ObjectiveMarker[]>(() => {
    if (m.questScope === 'none') return []
    const wanted = new Set(m.questScope === 'available' ? ['active', 'available'] : ['active'])
    const result: ObjectiveMarker[] = []
    for (const { quest, status } of rows) {
      const focused = focus?.questId === quest.id || selectedQuest === quest.id
      if (!wanted.has(status) && !focused) continue
      for (const objective of quest.objectives) {
        const zones = objective.zones.filter((z) => mapIds.has(z.map))
        const spots = objective.locations.filter((l) => mapIds.has(l.map)).flatMap((l) => l.positions)
        if (zones.length || spots.length) result.push({ quest, objective, zones, spots })
      }
    }
    return result
  }, [rows, m.questScope, mapIds, focus, selectedQuest])

  const onSelectQuest = useCallback((id: string) => selectQuest(id), [selectQuest])
  const selected = rows.find((r) => r.quest.id === selectedQuest)?.quest ?? null

  return (
    <div className="maps">
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
          {re3mr && (
            <div className="mini-toggle wide map-style" role="radiogroup" aria-label="Map style">
              {(
                [
                  ['re3mr', 'Re3MR'],
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
          <label className="check">
            <input
              type="checkbox"
              checked={m.showExtracts}
              onChange={(e) => set({ showExtracts: e.target.checked })}
            />
            Extracts
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={m.showTransits}
              onChange={(e) => set({ showTransits: e.target.checked })}
            />
            Transits
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={m.showSpawns}
              onChange={(e) => set({ showSpawns: e.target.checked })}
            />
            PMC spawns
          </label>
          <ul className="legend">
            <Legend color={MARKER_COLORS.quest}>Quest objective</Legend>
            <Legend color={MARKER_COLORS.pmc}>PMC extract</Legend>
            <Legend color={MARKER_COLORS.scav}>Scav extract</Legend>
            <Legend color={MARKER_COLORS.shared}>Shared extract</Legend>
            <Legend color={MARKER_COLORS.transit}>Transit</Legend>
            <Legend color={MARKER_COLORS.spawn}>Spawn</Legend>
          </ul>
        </section>
        <section>
          <h2>On this map</h2>
          {objectives.length === 0 ? (
            <p className="hint">
              {m.questScope === 'none'
                ? 'Quest objectives are hidden.'
                : 'None of your active quests have marked spots here.'}
            </p>
          ) : (
            <ul className="map-objectives">
              {objectives.map(({ quest, objective }) => (
                <li key={`${quest.id}:${objective.id}`}>
                  <button
                    className={`link ${selectedQuest === quest.id ? 'active' : ''}`}
                    onClick={() => void useStore.getState().showOnMap(quest.id, objective.id, m.mapKey)}
                  >
                    <strong>{quest.name}</strong>
                    <span>{objective.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {showRe3mr ? (
          <p className="hint credit">
            Map by{' '}
            <a href="https://reemr.se" target="_blank" rel="noreferrer">
              Re3MR
            </a>{' '}
            (v{re3mr.version}), CC BY-NC-SA 4.0. Markers are placed on the floor they&rsquo;re on.
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
        {selected && (
          <div className="map-selected">
            <strong>{selected.name}</strong>
            <button className="link" onClick={() => void updateSettings({ view: 'quests' })}>
              Open in quests
            </button>
            <button
              className="button icon small"
              onClick={() => selectQuest(null)}
              aria-label="Clear selection"
            >
              ✕
            </button>
          </div>
        )}
        {projection && maps.length ? (
          <MapCanvas
            projection={projection}
            maps={maps}
            objectives={objectives}
            showExtracts={m.showExtracts}
            showSpawns={m.showSpawns}
            showTransits={m.showTransits}
            focus={focus}
            onSelectQuest={onSelectQuest}
          />
        ) : (
          <div className="empty">
            <p>{questState?.error ? `Couldn't load map data: ${questState.error}` : 'Loading map data…'}</p>
          </div>
        )}
      </main>
    </div>
  )
}
