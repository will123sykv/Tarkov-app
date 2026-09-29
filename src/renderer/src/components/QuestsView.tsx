import { memo, useCallback, useMemo, useState } from 'react'
import { questMaps, type QuestStatus } from '../../../shared/questProgress'
import type { GameMap, Quest } from '../../../shared/questTypes'
import type { PriceState, PublicSettings, QuestSettings, QuestStatusFilter } from '../../../shared/types'
import { STATUS_BADGE, STATUS_LABEL } from '../lib/questUi'
import { useQuestRows, type QuestRow } from '../lib/useQuestRows'
import { useStore } from '../store'
import LogStatusPanel from './LogStatusPanel'
import NeededItems from './NeededItems'
import QuestDetail from './QuestDetail'

interface Props {
  settings: PublicSettings
  priceState: PriceState | null
}

const STATUSES: QuestStatusFilter[] = ['available', 'active', 'locked', 'completed', 'failed']

const QuestListRow = memo(function QuestListRow({
  row,
  selected,
  mapNames,
  onSelect
}: {
  row: QuestRow
  selected: boolean
  mapNames: string
  onSelect: (id: string) => void
}) {
  const { quest, status } = row
  return (
    <li>
      <button className={`quest-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(quest.id)}>
        <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
        <span className="quest-name">
          <span>{quest.name}</span>
          <small>
            Level {quest.minPlayerLevel}
            {mapNames && ` · ${mapNames}`}
          </small>
        </span>
        <span className="quest-flags">
          {quest.kappaRequired && <abbr title="Needed for Kappa">K</abbr>}
          {quest.lightkeeperRequired && <abbr title="Needed for Lightkeeper">LK</abbr>}
        </span>
      </button>
    </li>
  )
})

function Sidebar({
  settings,
  counts,
  traders,
  maps
}: {
  settings: PublicSettings
  counts: Record<QuestStatus, number>
  traders: { id: string; name: string }[]
  maps: GameMap[]
}): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const q = settings.quests
  const set = (patch: Partial<QuestSettings>): void => void updateSettings({ quests: { ...q, ...patch } })
  const toggle = (status: QuestStatusFilter): void =>
    set({
      statuses: q.statuses.includes(status) ? q.statuses.filter((s) => s !== status) : [...q.statuses, status]
    })

  return (
    <aside className="sidebar">
      <LogStatusPanel />
      <section>
        <h2>Show</h2>
        {STATUSES.map((status) => (
          <label key={status} className="check">
            <input type="checkbox" checked={q.statuses.includes(status)} onChange={() => toggle(status)} />
            <span className="grow">{STATUS_LABEL[status]}</span>
            <span className="muted">{counts[status]}</span>
          </label>
        ))}
      </section>
      <section>
        <h2>Filters</h2>
        <label className="field">
          <span>Trader</span>
          <select value={q.traderId ?? ''} onChange={(e) => set({ traderId: e.target.value || null })}>
            <option value="">All traders</option>
            {traders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Map</span>
          <select value={q.mapId ?? ''} onChange={(e) => set({ mapId: e.target.value || null })}>
            <option value="">Any map</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Faction</span>
          <select
            value={q.faction ?? ''}
            onChange={(e) =>
              set({ faction: e.target.value === 'USEC' || e.target.value === 'BEAR' ? e.target.value : null })
            }
          >
            <option value="">Both</option>
            <option value="USEC">USEC</option>
            <option value="BEAR">BEAR</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={q.kappaOnly}
            onChange={(e) => set({ kappaOnly: e.target.checked })}
          />
          Needed for Kappa
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={q.lightkeeperOnly}
            onChange={(e) => set({ lightkeeperOnly: e.target.checked })}
          />
          Needed for Lightkeeper
        </label>
      </section>
    </aside>
  )
}

export default function QuestsView({ settings, priceState }: Props): React.JSX.Element {
  const { questState, rows: all, ctx, questsById, mapsById } = useQuestRows(settings)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const selected = useStore((s) => s.selectedQuest)
  const selectQuest = useStore((s) => s.selectQuest)
  const [tab, setTab] = useState<'quests' | 'items'>('quests')
  const [search, setSearch] = useState('')

  const dataset = questState?.dataset ?? null
  const q = settings.quests
  const level = settings.playerLevels[settings.gameMode]
  const traders = useMemo(
    () => dataset?.traders.filter((t) => dataset.quests.some((quest) => quest.traderId === t.id)) ?? [],
    [dataset]
  )
  const questMapList = useMemo(() => {
    const used = new Set((dataset?.quests ?? []).flatMap((quest) => [...questMaps(quest)]))
    return (dataset?.maps ?? []).filter((m) => used.has(m.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [dataset])

  const counts = useMemo(() => {
    const c: Record<QuestStatus, number> = { available: 0, active: 0, locked: 0, completed: 0, failed: 0 }
    for (const row of all) c[row.status]++
    return c
  }, [all])

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    return all.filter(
      ({ quest, status }) =>
        q.statuses.includes(status) &&
        (!q.traderId || quest.traderId === q.traderId) &&
        (!q.mapId || questMaps(quest).has(q.mapId)) &&
        (!q.kappaOnly || quest.kappaRequired) &&
        (!q.lightkeeperOnly || quest.lightkeeperRequired) &&
        (!term || quest.name.toLowerCase().includes(term))
    )
  }, [all, q, search])

  const groups = useMemo(() => {
    const order = new Map((dataset?.traders ?? []).map((t, i) => [t.id, i]))
    const byTrader = new Map<string, QuestRow[]>()
    for (const row of shown) {
      const list = byTrader.get(row.quest.traderId) ?? []
      list.push(row)
      byTrader.set(row.quest.traderId, list)
    }
    return [...byTrader.entries()]
      .sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
      .map(([traderId, rows]) => ({
        traderId,
        name: dataset?.traders.find((t) => t.id === traderId)?.name ?? 'Other',
        rows: rows.sort(
          (a, b) =>
            a.quest.minPlayerLevel - b.quest.minPlayerLevel || a.quest.name.localeCompare(b.quest.name)
        )
      }))
  }, [shown, dataset])

  const mapNamesFor = useCallback(
    (quest: Quest): string =>
      [...questMaps(quest)]
        .map((id) => mapsById.get(id)?.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(', '),
    [mapsById]
  )
  const onSelect = useCallback(
    (id: string) => selectQuest(useStore.getState().selectedQuest === id ? null : id),
    [selectQuest]
  )
  const selectedRow = all.find((r) => r.quest.id === selected) ?? null
  const kappa = all.filter((r) => r.quest.kappaRequired)

  return (
    <div className="quests">
      <Sidebar settings={settings} counts={counts} traders={traders} maps={questMapList} />
      <main className="content">
        <div className="summary">
          <div className="summary-title">
            <strong>Quests</strong>
            <span className="muted">
              {dataset
                ? `Level ${level} · ${counts.active} active · ${counts.available} available · ${counts.completed} of ${all.length} completed` +
                  (kappa.length
                    ? ` · Kappa ${kappa.filter((r) => r.status === 'completed').length} of ${kappa.length}`
                    : '')
                : questState?.error
                  ? `Couldn't load quests: ${questState.error}`
                  : 'Loading quests…'}
            </span>
          </div>
          <div className="summary-stats">
            <div className="segmented small" role="tablist">
              <button
                role="tab"
                aria-selected={tab === 'quests'}
                className={tab === 'quests' ? 'active' : ''}
                onClick={() => setTab('quests')}
              >
                Quest list
              </button>
              <button
                role="tab"
                aria-selected={tab === 'items'}
                className={tab === 'items' ? 'active' : ''}
                onClick={() => setTab('items')}
              >
                Items needed
              </button>
            </div>
            {tab === 'quests' && (
              <input
                className="search"
                type="search"
                placeholder="Search quests"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            {questState?.fromCache && questState.error && (
              <span className="muted">Offline: showing saved quest data.</span>
            )}
          </div>
        </div>
        {tab === 'items' ? (
          <NeededItems rows={all} priceState={priceState} />
        ) : (
          <div className="quests-main">
            <div className="quest-list">
              {groups.map((group) => (
                <section key={group.traderId}>
                  <h3>
                    {group.name} <span className="muted">{group.rows.length}</span>
                  </h3>
                  <ul>
                    {group.rows.map((row) => (
                      <QuestListRow
                        key={row.quest.id}
                        row={row}
                        selected={row.quest.id === selected}
                        mapNames={mapNamesFor(row.quest)}
                        onSelect={onSelect}
                      />
                    ))}
                  </ul>
                </section>
              ))}
              {dataset && shown.length === 0 && (
                <div className="empty">
                  <p>No quests match. Tick more statuses on the left, or clear the filters.</p>
                </div>
              )}
            </div>
            {selectedRow && dataset ? (
              <QuestDetail
                row={selectedRow}
                progress={progress ?? {}}
                ctx={ctx}
                questsById={questsById}
                mapsById={mapsById}
                traders={dataset.traders}
                priceState={priceState}
              />
            ) : (
              <div className="quest-detail placeholder">
                <p className="muted">
                  Pick a quest to see its objectives. Quests you start, finish or fail in game are ticked off
                  from the game&rsquo;s logs; to catch up on older ones, open a quest you&rsquo;ve reached and
                  use <em>Mark this and everything before it done</em>.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
