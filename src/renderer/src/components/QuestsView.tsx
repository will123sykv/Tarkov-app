import { memo, useCallback, useMemo, useState } from 'react'
import {
  lockReasons,
  objectiveSummary,
  questMaps,
  requirementLabels,
  type ObjectiveProgress,
  type QuestStatus
} from '../../../shared/questProgress'
import { ofKind } from '../../../shared/questKind'
import { questPlaces } from '../../../shared/todo'
import { mapGroups } from '../lib/mapGroups'
import { STORY_TRADER } from '../../../shared/storyQuests'
import { blockedByKeys } from '../../../shared/keys'
import { nextWikiQuests } from '../../../shared/wikiQuests'
import type { GameMap, Quest } from '../../../shared/questTypes'
import type { PriceState, PublicSettings, QuestSettings, QuestStatusFilter } from '../../../shared/types'
import { STATUS_BADGE, STATUS_LABEL } from '../lib/questUi'
import { useFriendKeys } from '../lib/useFriendKeys'
import { useQuestRows, type QuestRow } from '../lib/useQuestRows'
import { useStore } from '../store'
import LoadError from './LoadError'
import EventQuestPicker from './EventQuestPicker'
import FavouriteStar from './FavouriteStar'
import NeededItems from './NeededItems'
import QuestDetail from './QuestDetail'
import QuestKindSwitch from './QuestKindSwitch'
import QuestPath from './QuestPath'
import SettingsLink from './SettingsLink'
import TabSidebar, { SidebarSection } from './Sidebar'

interface Props {
  settings: PublicSettings
  priceState: PriceState | null
}

const STATUSES: QuestStatusFilter[] = ['available', 'active', 'locked', 'completed', 'failed']

const QuestListRow = memo(function QuestListRow({
  row,
  selected,
  details,
  objectives,
  onSelect
}: {
  row: QuestRow
  selected: boolean
  /** Requirements and maps. */
  details: string
  objectives: ObjectiveProgress | undefined
  onSelect: (id: string) => void
}) {
  const { quest, status } = row
  // How far along it is, once something's been ticked off.
  const summary = status === 'completed' ? null : objectiveSummary(quest, objectives)
  return (
    <li className="quest-item">
      <button className={`quest-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(quest.id)}>
        <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
        <span className="quest-name">
          <span>{quest.name}</span>
          {details && <small>{details}</small>}
        </span>
        <span className="quest-flags">
          {summary && summary.done > 0 && (
            <span className="objective-tally" title="Objectives done">
              {summary.done}/{summary.total}
            </span>
          )}
          {quest.wiki && (
            <abbr
              className="quest-wiki"
              title={
                quest.wiki.event
                  ? `An event quest${quest.wiki.past ? ' from a past event' : ''}, from the wiki`
                  : 'From the wiki'
              }
            >
              {quest.wiki.event ? 'Event' : 'Wiki'}
            </abbr>
          )}
          {quest.corrections && (
            <abbr
              title={`Corrected from the wiki: ${[...quest.corrections.changes, ...quest.corrections.notes].join('; ')}`}
            >
              W
            </abbr>
          )}
          {quest.kappaRequired && <abbr title="Needed for Kappa">K</abbr>}
          {quest.lightkeeperRequired && <abbr title="Needed for Lightkeeper">LK</abbr>}
        </span>
      </button>
      <FavouriteStar kind="quests" id={quest.id} />
    </li>
  )
})

function Sidebar({
  settings,
  counts,
  traders,
  maps,
  onAddEventQuests
}: {
  settings: PublicSettings
  counts: Record<QuestStatus, number>
  traders: { id: string; name: string }[]
  maps: GameMap[]
  onAddEventQuests: () => void
}): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const wiki = useStore((s) => s.wikiQuests)
  const addWikiQuests = useStore((s) => s.addWikiQuests)
  const q = settings.quests
  const set = (patch: Partial<QuestSettings>): void => void updateSettings({ quests: { ...q, ...patch } })
  const toggle = (status: QuestStatusFilter): void =>
    set({
      statuses: q.statuses.includes(status) ? q.statuses.filter((s) => s !== status) : [...q.statuses, status]
    })

  return (
    <TabSidebar view="quests">
      <SidebarSection title="Show">
        {STATUSES.map((status) => (
          <label key={status} className="check">
            <input type="checkbox" checked={q.statuses.includes(status)} onChange={() => toggle(status)} />
            <span className="grow">{STATUS_LABEL[status]}</span>
            <span className="muted">{counts[status]}</span>
          </label>
        ))}
      </SidebarSection>
      <SidebarSection title="Filters">
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
            <option value="">All maps</option>
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
      </SidebarSection>
      <SidebarSection title="Event quests">
        <p className="hint">
          {q.wikiQuests.length
            ? `${q.wikiQuests.length} added from the wiki${wiki?.loading ? ' (reading…)' : ''}.`
            : 'Event quests, like Fog of War, aren’t on tarkov.dev: add the ones you have from the wiki.'}
        </p>
        {Object.entries(wiki?.errors ?? {}).map(([title, error]) => (
          <p key={title} className="hint error">
            {title ? `${title}: ` : ''}
            {error}
          </p>
        ))}
        {wiki &&
          nextWikiQuests(wiki.quests, q.wikiQuests).map((title) => (
            <button
              key={title}
              className="link small event-up-next"
              onClick={() => void addWikiQuests([title])}
            >
              + Add {title}, next in the chain
            </button>
          ))}
        <button className="button small" onClick={onAddEventQuests}>
          Add event quests…
        </button>
      </SidebarSection>
    </TabSidebar>
  )
}

export default function QuestsView({ settings, priceState }: Props): React.JSX.Element {
  const {
    questState,
    rows: everyRow,
    ctx,
    questsById,
    mapsById,
    objectives,
    detected
  } = useQuestRows(settings)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const selected = useStore((s) => s.selectedQuest)
  const selectQuest = useStore((s) => s.selectQuest)
  const updateSettings = useStore((s) => s.updateSettings)
  const [tab, setTab] = useState<'quests' | 'items' | 'path'>('quests')
  const [search, setSearch] = useState('')
  const [picking, setPicking] = useState(false)
  const wiki = useStore((s) => s.wikiQuests)

  const dataset = questState?.dataset ?? null
  const q = settings.quests
  // All, the story or the side quests (since 1.61.0); a search looks through every kind.
  const all = useMemo(() => ofKind(everyRow, q.kind), [everyRow, q.kind])
  const level = settings.playerLevels[settings.gameMode]
  // From every quest listed (the wiki's too: the BTR Driver gives only those).
  const traders = useMemo(() => {
    const giving = new Set(all.map((row) => row.quest.traderId))
    return [
      ...(dataset?.storyChapters.length && giving.has(STORY_TRADER.id) ? [STORY_TRADER] : []),
      ...(dataset?.traders.filter((t) => giving.has(t.id)) ?? [])
    ]
  }, [dataset, all])
  // Where each quest is done: the maps it names, and whether it has something to do on any map (since
  // 1.63.0 a quest with a kill on any location is listed under every map).
  const places = useMemo(() => {
    const groupOf = mapGroups(dataset?.maps ?? [])
    return new Map(everyRow.map((row) => [row.quest, questPlaces(row.quest, (id) => groupOf.get(id)?.key)]))
  }, [dataset, everyRow])
  const onMap = useCallback(
    (quest: Quest, mapId: string): boolean => {
      const p = places.get(quest)
      return p ? p.anyMap || p.mapIds.includes(mapId) : questMaps(quest).has(mapId)
    },
    [places]
  )
  const questMapList = useMemo(() => {
    const anywhere = all.some((row) => places.get(row.quest)?.anyMap)
    const used = new Set(all.flatMap((row) => [...questMaps(row.quest)]))
    return (dataset?.maps ?? [])
      .filter((m) => anywhere || used.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dataset, all, places])

  const counts = useMemo(() => {
    const c: Record<QuestStatus, number> = { available: 0, active: 0, locked: 0, completed: 0, failed: 0 }
    for (const row of all) c[row.status]++
    return c
  }, [all])

  const term = search.trim().toLowerCase()
  // "Only quests I can do" (Settings) leaves out quests still to do that a key the player doesn't have
  // holds up (friends' keys count when that's on). A search, and the quest opened, still find them.
  const { owned } = useFriendKeys(settings)
  const onlyDoable = settings.todo.show === 'doable'
  // The sidebar's filters, for the quest list and (since 1.68.0) Path and Items to hand over.
  const sidebarMatch = useCallback(
    ({ quest }: QuestRow): boolean =>
      (!q.traderId || quest.traderId === q.traderId) &&
      (!q.mapId || onMap(quest, q.mapId)) &&
      (!q.kappaOnly || quest.kappaRequired) &&
      (!q.lightkeeperOnly || quest.lightkeeperRequired),
    [q.traderId, q.mapId, q.kappaOnly, q.lightkeeperOnly, onMap]
  )
  const canDo = useCallback(
    ({ quest, status }: QuestRow): boolean =>
      !onlyDoable ||
      status === 'completed' ||
      status === 'failed' ||
      quest.id === selected ||
      blockedByKeys(quest, owned, objectives).length === 0,
    [onlyDoable, selected, owned, objectives]
  )
  const matches = useCallback(
    (row: QuestRow): boolean => q.statuses.includes(row.status) && sidebarMatch(row) && canDo(row),
    [q.statuses, sidebarMatch, canDo]
  )
  const { shown, keyHidden } = useMemo(() => {
    // A search looks through every status, so a quest is found wherever it is.
    const listed = (term ? everyRow : all).filter(
      (row) =>
        (term !== '' || q.statuses.includes(row.status)) &&
        sidebarMatch(row) &&
        (!term || row.quest.name.toLowerCase().includes(term))
    )
    // A search finds quests a key holds up too.
    const shown = term ? listed : listed.filter(canDo)
    return { shown, keyHidden: listed.length - shown.length }
  }, [all, everyRow, q.statuses, term, sidebarMatch, canDo])
  // What the sidebar narrows Path and Items to hand over to, said over them, with a way back.
  const narrowing = [
    q.traderId ? (dataset?.traders.find((t) => t.id === q.traderId)?.name ?? 'one trader') : null,
    q.mapId ? (mapsById.get(q.mapId)?.name ?? 'one map') : null,
    q.kappaOnly ? 'needed for Kappa' : null,
    q.lightkeeperOnly ? 'needed for Lightkeeper' : null
  ].filter((x): x is string => x !== null)
  const filterNote = (
    <span className="hint">
      {narrowing.length > 0 && (
        <>
          Only {narrowing.join(' · ')}.{' '}
          <button
            className="link small"
            onClick={() =>
              void updateSettings({
                quests: { ...q, traderId: null, mapId: null, kappaOnly: false, lightkeeperOnly: false }
              })
            }
          >
            Clear filters
          </button>{' '}
        </>
      )}
      Filtered by the sidebar
      {onlyDoable ? ' and Only quests I can do' : ''} (Show, trader, map, Kappa, Lightkeeper).
    </span>
  )

  // Traders whose every quest the Show filters leave out (the BTR Driver's are all Locked until his
  // chain starts), with how many of each status: said under the list, so they don't seem missing.
  const hiddenTraders = useMemo(() => {
    if (term) return []
    const shownTraders = new Set(shown.map((r) => r.quest.traderId))
    const byTrader = new Map<string, Map<QuestStatus, number>>()
    for (const { quest, status } of all) {
      if (q.statuses.includes(status) || shownTraders.has(quest.traderId)) continue
      if (q.traderId && quest.traderId !== q.traderId) continue
      if ((q.mapId && !onMap(quest, q.mapId)) || (q.kappaOnly && !quest.kappaRequired)) continue
      if (q.lightkeeperOnly && !quest.lightkeeperRequired) continue
      const counts = byTrader.get(quest.traderId) ?? new Map<QuestStatus, number>()
      counts.set(status, (counts.get(status) ?? 0) + 1)
      byTrader.set(quest.traderId, counts)
    }
    return [...byTrader].map(([traderId, counts]) => ({
      name:
        traderId === STORY_TRADER.id
          ? STORY_TRADER.name
          : (dataset?.traders.find((t) => t.id === traderId)?.name ?? 'Other'),
      counts: [...counts]
    }))
  }, [all, shown, q, term, dataset, onMap])
  const hiddenStatuses = [...new Set(hiddenTraders.flatMap((t) => t.counts.map(([status]) => status)))]

  // Quests the logs mention that tarkov.dev doesn't list (story chapters, new or event quests).
  const fromLogs = useMemo(() => {
    const named: { id: string; name: string; status: QuestStatus }[] = []
    let unnamed = 0
    for (const [id, entry] of Object.entries(progress ?? {})) {
      if (questsById.has(id)) continue
      const name = dataset?.otherQuestNames[id]
      if (!name) unnamed++
      else if (!term || name.toLowerCase().includes(term)) named.push({ id, name, status: entry.status })
    }
    return { named: named.sort((a, b) => a.name.localeCompare(b.name)), unnamed }
  }, [progress, questsById, dataset, term])

  const groups = useMemo(() => {
    // The story comes first.
    const order = new Map([
      [STORY_TRADER.id, -1],
      ...(dataset?.traders ?? []).map((t, i) => [t.id, i] as const)
    ])
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
        name:
          traderId === STORY_TRADER.id
            ? STORY_TRADER.name
            : (dataset?.traders.find((t) => t.id === traderId)?.name ?? 'Other'),
        // Story chapters keep the story's order.
        rows:
          traderId === STORY_TRADER.id
            ? rows
            : rows.sort(
                (a, b) =>
                  a.quest.minPlayerLevel - b.quest.minPlayerLevel || a.quest.name.localeCompare(b.quest.name)
              )
      }))
  }, [shown, dataset])

  const detailsFor = useCallback(
    (quest: Quest): string =>
      [
        ...requirementLabels(quest, questsById, ctx.traders),
        [
          ...(places.get(quest)?.mapIds ?? [...questMaps(quest)])
            .map((id) => mapsById.get(id)?.name)
            .filter(Boolean)
            .slice(0, 2),
          places.get(quest)?.anyMap ? 'Any map' : null
        ]
          .filter(Boolean)
          .join(', ')
      ]
        .filter(Boolean)
        .join(' · '),
    [questsById, mapsById, ctx.traders, places]
  )
  const onSelect = useCallback(
    (id: string) => selectQuest(useStore.getState().selectedQuest === id ? null : id),
    [selectQuest]
  )
  const selectedRow = everyRow.find((r) => r.quest.id === selected) ?? null
  const kappa = all.filter((r) => r.quest.kappaRequired)
  // Path (since 1.66.0) counts every quest of the kind shown, as the header does; with Only quests I
  // can do, it says how many a missing key holds up, and leaves them out of its list (since 1.71.0).
  const keyBlocked = useCallback(
    (quest: Quest) => blockedByKeys(quest, owned, objectives).length > 0,
    [owned, objectives]
  )

  return (
    <div className="quests">
      <Sidebar
        settings={settings}
        counts={counts}
        traders={traders}
        maps={questMapList}
        onAddEventQuests={() => setPicking(true)}
      />
      {picking && (
        <EventQuestPicker
          added={q.wikiQuests}
          next={nextWikiQuests(wiki?.quests ?? [], q.wikiQuests)}
          onClose={() => setPicking(false)}
        />
      )}
      <main className="content">
        <div className="summary">
          <div className="summary-title">
            <strong>Quests</strong>
            <span className="muted">
              {dataset ? (
                `Level ${level} · ${counts.active} active · ${counts.available} available · ${counts.completed} of ${all.length} completed` +
                (kappa.length
                  ? ` · Kappa ${kappa.filter((r) => r.status === 'completed').length} of ${kappa.length}`
                  : '')
              ) : questState?.error ? (
                <LoadError what="quests" error={questState.error} />
              ) : (
                'Loading quests…'
              )}
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
                Items to hand over
              </button>
              <button
                role="tab"
                aria-selected={tab === 'path'}
                className={tab === 'path' ? 'active' : ''}
                title="Which quests to do next for Kappa or Lightkeeper"
                onClick={() => setTab('path')}
              >
                Path
              </button>
            </div>
            {tab === 'quests' && (
              <input
                className="search"
                type="search"
                placeholder="Search quests"
                title="Searches every status"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            <QuestKindSwitch settings={settings} />
            {tab === 'quests' && term && (
              <span className="muted">Searching every status{q.kind !== 'all' ? ' and kind' : ''}</span>
            )}
            {questState?.fromCache && questState.error && (
              <span className="muted">Offline: showing saved quest data.</span>
            )}
          </div>
        </div>
        {tab === 'items' ? (
          <NeededItems
            rows={all.filter(matches)}
            objectives={objectives}
            settings={settings}
            priceState={priceState}
            note={filterNote}
            activeShown={q.statuses.includes('active')}
          />
        ) : (
          <div className="quests-main">
            {tab === 'path' ? (
              <QuestPath
                rows={all}
                blocked={onlyDoable ? keyBlocked : undefined}
                filter={matches}
                note={filterNote}
                traders={dataset?.traders ?? []}
                selected={selected}
                onSelect={onSelect}
                lockText={(row) => lockReasons(row.quest, progress ?? {}, ctx, questsById).join(' · ')}
              />
            ) : (
              <div className="quest-list">
                {keyHidden > 0 && (
                  <p className="hint quest-list-note">
                    {keyHidden === 1 ? '1 quest hidden: it needs' : `${keyHidden} quests hidden: they need`} a
                    key you don&rsquo;t have (Only quests I can do). <SettingsLink section="quests" />
                  </p>
                )}
                {hiddenTraders.length > 0 && (
                  <section className="quests-hidden-traders">
                    <p className="hint">
                      Hidden by <strong>Show</strong>:{' '}
                      {hiddenTraders
                        .map(
                          (t) =>
                            `${t.name} (${t.counts.map(([status, n]) => `${n} ${STATUS_LABEL[status].toLowerCase()}`).join(', ')})`
                        )
                        .join(' · ')}
                    </p>
                    <div className="button-row">
                      {hiddenStatuses.map((status) => (
                        <button
                          key={status}
                          className="button small"
                          onClick={() =>
                            void updateSettings({ quests: { ...q, statuses: [...q.statuses, status] } })
                          }
                        >
                          Show {STATUS_LABEL[status].toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
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
                          details={detailsFor(row.quest)}
                          objectives={objectives}
                          onSelect={onSelect}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
                {fromLogs.named.length + fromLogs.unnamed > 0 && (
                  <section className="quests-from-logs">
                    <h3>
                      From your game logs <span className="muted">{fromLogs.named.length}</span>
                    </h3>
                    <p className="hint">
                      tarkov.dev doesn&rsquo;t list these (new or event quests), so there are no objectives or
                      requirements to show.
                      {fromLogs.unnamed > 0 &&
                        ` Plus ${fromLogs.unnamed} operational or daily task${fromLogs.unnamed === 1 ? '' : 's'}.`}
                    </p>
                    <ul>
                      {fromLogs.named.map((entry) => (
                        <li key={entry.id} className="quest-row static">
                          <span className={`badge ${STATUS_BADGE[entry.status]}`}>
                            {STATUS_LABEL[entry.status]}
                          </span>
                          <span className="quest-name">
                            <span>{entry.name}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {dataset && shown.length === 0 && fromLogs.named.length === 0 && (
                  <div className="empty">
                    <p>
                      {keyHidden
                        ? 'Every quest that matches needs a key you don’t have.'
                        : 'No quests match. Tick more statuses on the left, or clear the filters.'}
                    </p>
                  </div>
                )}
              </div>
            )}
            {selectedRow && dataset ? (
              <QuestDetail
                row={selectedRow}
                progress={progress ?? {}}
                objectives={objectives}
                detected={detected}
                ctx={ctx}
                questsById={questsById}
                mapsById={mapsById}
                traders={dataset.traders}
                priceState={priceState}
                mapIds={q.mapId ? [q.mapId] : undefined}
              />
            ) : (
              <div className="quest-detail placeholder">
                <p className="muted">
                  Pick a quest to see its objectives, and tick them off as you go (how many you&rsquo;ve
                  handed over, for one that takes several). Quests you start, finish or fail in game are
                  ticked off from the game&rsquo;s logs; to catch up on older ones, open a quest you&rsquo;ve
                  reached and use <em>Mark this and everything before it done</em>.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
