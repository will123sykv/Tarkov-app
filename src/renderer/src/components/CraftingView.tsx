import { useMemo, useState } from 'react'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../../shared/constants'
import {
  byPriority,
  craftingPlan,
  craftRunCounts,
  upgradableNow,
  type NeededCraft,
  type StationPlan
} from '../../../shared/crafting'
import { EMPTY_HIDEOUT, hideoutNeeds, stationLevel } from '../../../shared/hideout'
import { neededItems } from '../../../shared/questProgress'
import type { HideoutCraft } from '../../../shared/questTypes'
import type { CraftSortKey, LootItem, PriceState, PublicSettings } from '../../../shared/types'
import { evaluateItem } from '../../../shared/valuation'
import { formatDuration, formatRub } from '../lib/format'
import { useItemLookup } from '../lib/useItemLookup'
import { useBuyContext, useCraftContext } from '../lib/useKeepList'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import LoadError from './LoadError'
import OverviewNav from './OverviewNav'
import { ItemChip } from './QuestDetail'
import SettingsLink from './SettingsLink'

// The Hideout tab (since 1.49.0): what to put on each station now. First what the hideout's upgrades
// and quests still need (as Items to collect counts it), then the crafts that make the most money per
// hour, at least as long as Settings says.

type Items = ReturnType<typeof useItemLookup>

/** A craft just started, and the Have counts it changed (to undo). */
interface Started {
  /** Which start it is, so a late reply goes to its own notice. */
  id: number
  what: string
  station: string
  before: Record<string, number>
  after: Record<string, number>
  error: string | null
  /** Being undone: the notice stays until that's saved. */
  undoing: boolean
  /** The undo failed (it can be tried again). */
  undoFailed: boolean
}

let startedId = 0

const START_TITLE =
  "I've put this craft on: add what it makes to Have in Items to collect (when something needs it) and take off what it uses (when you're keeping it). One run."

/** Says a craft has been put on in the game, updating Items to collect's Have counts (since 1.52.0). */
function StartButton({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <button
      className="button small crafting-start"
      title={START_TITLE}
      onClick={(e) => {
        // Not the tile's click, which opens the station.
        e.stopPropagation()
        onStart()
      }}
    >
      Started
    </button>
  )
}

/** Roubles, a loss with a minus sign in front (−₽5,000); a dash when unknown. */
const money = (value: number | null): string =>
  value === null ? '–' : value < 0 ? `−${formatRub(-value)}` : formatRub(value)

/** "30 min", "2 h", or nothing for no minimum. */
const minutesText = (minutes: number): string =>
  minutes === 0 ? '' : minutes < 60 ? `${minutes} min or longer` : `${minutes / 60} h or longer`

const COLUMNS: { key: CraftSortKey; label: string; num?: boolean; title?: string }[] = [
  {
    key: 'priority',
    label: '#',
    num: true,
    title: 'The app’s order: found in raid first, then the biggest saving, then the quickest'
  },
  { key: 'item', label: 'Item' },
  { key: 'for', label: 'For' },
  { key: 'missing', label: 'Missing', num: true },
  { key: 'runs', label: 'Runs', num: true },
  { key: 'time', label: 'Time', num: true },
  { key: 'cost', label: 'Craft cost', num: true },
  {
    key: 'buy',
    label: 'Buy price',
    num: true,
    title: 'Buying the copies that needn’t be found in raid instead'
  },
  {
    key: 'saving',
    label: 'Saving',
    num: true,
    title: 'What crafting saves over buying those (negative: buying is cheaper)'
  }
]

/** Nulls go last whichever way a column is sorted. */
const nullsLast = (a: number | null, b: number | null, desc: boolean): number =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : desc ? b - a : a - b

function sorter(key: CraftSortKey, desc: boolean, name: (id: string) => string) {
  const dir = desc ? -1 : 1
  return (a: NeededCraft, b: NeededCraft): number => {
    switch (key) {
      case 'priority':
        return dir * byPriority(a, b)
      case 'item':
        return dir * name(a.itemId).localeCompare(name(b.itemId))
      case 'for':
        return dir * a.forWhat.join(', ').localeCompare(b.forWhat.join(', '))
      case 'missing':
        return dir * (a.missing - b.missing)
      case 'runs':
        return dir * (a.runs - b.runs)
      case 'time':
        return dir * (a.time - b.time)
      case 'cost':
        return nullsLast(a.cost, b.cost, desc)
      case 'buy':
        return nullsLast(a.buyPrice, b.buyPrice, desc)
      case 'saving':
        return nullsLast(a.saving, b.saving, desc)
    }
  }
}

export default function CraftingView({
  settings,
  priceState
}: {
  settings: PublicSettings
  priceState: PriceState | null
}): React.JSX.Element {
  const { questState, rows, objectives } = useQuestRows(settings)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const updateSettings = useStore((s) => s.updateSettings)
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(settings, priceState)
  const cc = useCraftContext(settings, priceState)
  const h = settings.hideout
  const c = settings.crafting
  const dataset = questState?.dataset ?? null
  const stations = useMemo(() => dataset?.stations ?? [], [dataset])

  // What's still needed, counted as Items to collect counts it (its next levels or every level, and
  // active quests or every quest left); with Current only, just active quests and the upgrades you can
  // build now. Found in raid only keeps the items that must be found in raid.
  const needs = useMemo(() => {
    const left = rows.filter((r) => r.status !== 'completed' && r.status !== 'failed')
    const activeOnly = c.currentOnly || h.questScope === 'active'
    const quests = neededItems(
      (activeOnly ? left.filter((r) => r.status === 'active') : left).map((r) => r.quest),
      objectives
    ).items
    const all = c.currentOnly
      ? hideoutNeeds(upgradableNow(stations, progress, ctx.traderLevels), progress, 'next', quests)
      : hideoutNeeds(stations, progress, h.scope, quests)
    return c.firOnly ? all.filter((n) => n.firNeeded > 0) : all
  }, [
    rows,
    objectives,
    stations,
    progress,
    ctx.traderLevels,
    h.scope,
    h.questScope,
    c.currentOnly,
    c.firOnly
  ])

  const plans = useMemo(() => {
    const valuation = {
      playerLevel: settings.playerLevels[settings.gameMode],
      fleaMinLevel: priceState?.dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL,
      subtractFleaFee: settings.subtractFleaFee
    }
    return craftingPlan(
      needs,
      cc,
      ctx,
      (item: LootItem) => evaluateItem(item, valuation).worth,
      c.minProfitMinutes * 60
    )
  }, [
    needs,
    cc,
    ctx,
    c.minProfitMinutes,
    settings.playerLevels,
    settings.gameMode,
    settings.subtractFleaFee,
    priceState
  ])

  // Every item the hideout or a quest left still needs, whatever the filters: what a craft started
  // adds to Have when it makes one.
  const tracked = useMemo(() => {
    const left = rows.filter((r) => r.status !== 'completed' && r.status !== 'failed')
    const quests = neededItems(
      left.map((r) => r.quest),
      objectives
    ).items
    return new Set(
      hideoutNeeds(stations, progress, 'all', quests)
        .filter((n) => n.needed > 0)
        .map((n) => n.itemId)
    )
  }, [rows, objectives, stations, progress])
  const setHaveMany = useStore((s) => s.setHideoutHaveMany)
  const [started, setStarted] = useState<Started | null>(null)
  const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
  const startCraft = (craft: HideoutCraft, station: string): void => {
    // From the store's counts, which a start just before this one has already changed.
    const have = useStore.getState().hideoutProgress[settings.gameMode]?.have ?? progress.have
    const after = craftRunCounts(craft, have, tracked)
    const before = Object.fromEntries(Object.keys(after).map((id) => [id, have[id] ?? 0]))
    const what = craft.outputs
      .map((o) => `${o.count > 1 ? `${o.count} × ` : ''}${items.get(o.itemId)?.name ?? 'Unknown item'}`)
      .join(', ')
    const id = ++startedId
    setStarted({ id, what, station, before, after, error: null, undoing: false, undoFailed: false })
    if (!Object.keys(after).length) return
    setHaveMany(after).catch((err: unknown) =>
      setStarted((s) =>
        s?.id === id ? { ...s, error: `Couldn’t update Items to collect: ${message(err)}` } : s
      )
    )
  }
  const undoStart = (): void => {
    if (!started || started.undoing) return
    const { id, before } = started
    setStarted({ ...started, undoing: true, undoFailed: false, error: null })
    setHaveMany(before).then(
      () => setStarted((s) => (s?.id === id ? null : s)),
      (err: unknown) =>
        setStarted((s) =>
          s?.id === id
            ? { ...s, undoing: false, undoFailed: true, error: `Couldn’t undo: ${message(err)}` }
            : s
        )
    )
  }

  const unbuilt = stations.filter((s) => stationLevel(s, progress) === 0)
  const neededCount = plans.reduce((n, p) => n + p.needed.length, 0)
  const name = (id: string): string => items.get(id)?.name ?? 'Unknown item'
  const order = sorter(c.sort.key, c.sort.desc, name)
  const sortBy = (key: CraftSortKey): void =>
    void updateSettings({
      crafting: { ...c, sort: { key, desc: c.sort.key === key ? !c.sort.desc : false } }
    })
  const openInCrafts = (itemId: string): void => {
    useStore.getState().setCraftsSearch(name(itemId))
    void updateSettings({ view: 'hideout', hideout: { ...h, tab: 'crafts', craftsReadyOnly: false } })
  }
  // The station opened from the overview; a station no longer listed goes back to the overview.
  const openedId = useStore((s) => s.craftingStation)
  const openStation = useStore((s) => s.openCraftingStation)
  const opened = c.layout === 'tiles' && openedId ? plans.find((p) => p.stationId === openedId) : undefined
  // The first station with something needed is the one to get going on.
  const firstNeeded = plans.find((p) => p.needed.length > 0)?.stationId
  const card = (plan: StationPlan, wide = false): React.JSX.Element => (
    <StationCard
      key={plan.stationId}
      plan={plan}
      items={items}
      order={order}
      sort={c.sort}
      onSort={sortBy}
      onOpen={openInCrafts}
      minutes={c.minProfitMinutes}
      wide={wide}
      onStart={(craft) => startCraft(craft, plan.stationName)}
    />
  )
  const unbuiltHint = dataset && unbuilt.length > 0 && (
    <p className="hint crafting-unbuilt">
      Not built yet (so nothing to craft there): {unbuilt.map((s) => s.name).join(', ')}. Set how far each is
      built in Items to collect.
    </p>
  )

  return (
    <div className="crafting-page">
      <div className="summary">
        <div className="summary-title">
          <strong>Hideout</strong>
          <span className="muted">
            {dataset ? (
              `${plans.length} station${plans.length === 1 ? '' : 's'} built · ` +
              `${neededCount} craft${neededCount === 1 ? '' : 's'} for upgrades and quests · ` +
              (c.currentOnly
                ? 'counting the upgrades you can build now and active quests'
                : `counting ${h.scope === 'next' ? 'next levels' : 'every level'} and ${h.questScope === 'active' ? 'active quests' : 'every quest left'}, as Items to collect does`) +
              (c.firOnly ? ' · found in raid only' : '')
            ) : questState?.error ? (
              <LoadError what="the hideout" error={questState.error} />
            ) : (
              'Loading the hideout…'
            )}
          </span>
        </div>
        <p className="hint">
          First what your upgrades and quests still need, then the most profit per hour
          {c.minProfitMinutes ? ` from crafts of ${minutesText(c.minProfitMinutes)}` : ''}.{' '}
          <SettingsLink section="crafting">Change the minimum</SettingsLink>
        </p>
        <div className="crafting-filters">
          <div className="segmented small" role="radiogroup" aria-label="How to show stations">
            {(
              [
                ['tiles', 'Overview', 'A tile per station saying what to craft next: click one for its list'],
                ['list', 'List', 'Every station with its list, one under another']
              ] as const
            ).map(([id, text, title]) => (
              <button
                key={id}
                role="radio"
                aria-checked={c.layout === id}
                className={c.layout === id ? 'active' : ''}
                title={title}
                onClick={() => {
                  // Overview also goes back from an opened station.
                  openStation(null)
                  void updateSettings({ crafting: { ...c, layout: id } })
                }}
              >
                {text}
              </button>
            ))}
          </div>
          <label
            className="check fir-filter"
            title="Only crafts for items that must be found in raid, where buying won't do"
          >
            <input
              type="checkbox"
              checked={c.firOnly}
              onChange={(e) => void updateSettings({ crafting: { ...c, firOnly: e.target.checked } })}
            />
            Found in raid only
          </label>
          <label
            className="check fir-filter"
            title="Only what your active quests and the upgrades you can build now need (each station's next level, with the other stations and trader loyalty it needs met). Off: what Items to collect counts."
          >
            <input
              type="checkbox"
              checked={c.currentOnly}
              onChange={(e) => void updateSettings({ crafting: { ...c, currentOnly: e.target.checked } })}
            />
            Current quests and upgrades only
          </label>
        </div>
      </div>
      {opened ? (
        <div key={`station:${opened.stationId}`} className="crafting-stations opened">
          <OverviewNav
            items={plans.map((p) => ({ key: p.stationId, name: p.stationName }))}
            current={opened.stationId}
            name={opened.stationName}
            label="Stations"
            allLabel="All stations"
            onOpen={openStation}
          />
          {card(opened, true)}
        </div>
      ) : c.layout === 'tiles' ? (
        <div key="tiles" className="crafting-stations crafting-tiles">
          {plans.map((plan, i) => (
            <StationTile
              key={plan.stationId}
              plan={plan}
              rank={i + 1}
              first={plan.stationId === firstNeeded}
              items={items}
              onOpen={openStation}
              onStart={(craft) => startCraft(craft, plan.stationName)}
            />
          ))}
          {unbuiltHint}
        </div>
      ) : (
        <div key="list" className="crafting-stations">
          {plans.map((plan) => card(plan))}
          {unbuiltHint}
        </div>
      )}
      {started && (
        <div className="crafting-toast" role="status">
          <span>
            Started {started.what} at {started.station}
            <span className="muted">
              {' · '}
              {started.error ??
                (Object.keys(started.after).length
                  ? 'Have: ' +
                    Object.keys(started.after)
                      .map((id) => `${name(id)} ${started.before[id]} → ${started.after[id]}`)
                      .join(', ')
                  : 'nothing it makes or uses is counted in Items to collect')}
            </span>
          </span>
          {Object.keys(started.after).length > 0 && (!started.error || started.undoFailed) && (
            <button className="link" disabled={started.undoing} onClick={undoStart}>
              {started.undoing ? 'Undoing…' : started.undoFailed ? 'Try again' : 'Undo'}
            </button>
          )}
          <button className="link-like muted" aria-label="Close" onClick={() => setStarted(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function StationCard({
  plan,
  items,
  order,
  sort,
  onSort,
  onOpen,
  minutes,
  wide = false,
  onStart
}: {
  plan: StationPlan
  items: Items
  order: (a: NeededCraft, b: NeededCraft) => number
  sort: { key: CraftSortKey; desc: boolean }
  onSort: (key: CraftSortKey) => void
  onOpen: (itemId: string) => void
  minutes: number
  /** The whole row, whether or not it has a list (an opened station). */
  wide?: boolean
  onStart: (craft: HideoutCraft) => void
}): React.JSX.Element {
  const next = plan.next
  const rank = new Map([...plan.needed].sort(byPriority).map((n, i) => [n.itemId, i + 1]))
  const rows = [...plan.needed].sort(order)
  return (
    <article
      className={`crafting-station ${next?.kind ?? 'idle'} ${wide || plan.needed.length ? 'wide' : ''}`}
    >
      <header>
        <strong>{plan.stationName}</strong>
        <span className="muted">level {plan.level}</span>
      </header>
      <div className="crafting-next">
        <span className="crafting-next-label">Craft next</span>
        {next?.kind === 'needed' ? (
          <span>
            <button
              className="link-like"
              onClick={() => onOpen(next.craft.itemId)}
              title="Open in Items to collect › Crafts"
            >
              <ItemChip id={next.craft.itemId} count={next.craft.missing} items={items} />
            </button>{' '}
            <span className="muted">
              {next.craft.runs} run{next.craft.runs === 1 ? '' : 's'} · {formatDuration(next.craft.time)}
              {next.craft.cost !== null && ` · ≈ ${formatRub(next.craft.cost)}`} · for{' '}
              {next.craft.forWhat.join(', ')}
              {next.craft.fir > 0 && ' · must be found in raid'}
            </span>{' '}
            <StartButton onStart={() => onStart(next.craft.craft.craft)} />
          </span>
        ) : next?.kind === 'profit' ? (
          <span>
            <button className="link-like" onClick={() => onOpen(next.craft.craft.outputs[0]?.itemId ?? '')}>
              {next.craft.craft.outputs.map((o) => (
                <ItemChip key={o.itemId} id={o.itemId} count={o.count} items={items} />
              ))}
            </button>{' '}
            <span className="muted">
              for profit: <b className="gain">{money(next.craft.perHour)}/h</b> ·{' '}
              {formatDuration(next.craft.craft.duration)} · {money(next.craft.profit)} a craft
            </span>{' '}
            <StartButton onStart={() => onStart(next.craft.craft)} />
          </span>
        ) : (
          <span className="muted">
            Nothing your upgrades or quests need is made here, and no craft here makes a profit
            {minutes ? ` over ${minutesText(minutes).replace(' or longer', '')}` : ''}.
          </span>
        )}
      </div>
      {plan.needed.length > 0 && (
        <>
          <h4>For upgrades and quests</h4>
          <div className="crafting-table-wrap">
            <table className="values-table crafting-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`${col.num ? 'num' : ''} sortable ${sort.key === col.key ? 'sorted' : ''}`}
                      title={col.title}
                      aria-sort={sort.key === col.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                    >
                      <button className="link-like" onClick={() => onSort(col.key)}>
                        {col.label}
                        {sort.key === col.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
                      </button>
                    </th>
                  ))}
                  <th aria-label="Started" />
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.itemId}>
                    <td className="num muted">{rank.get(n.itemId)}</td>
                    <td className="item-cell">
                      <div className="item-cell-body">
                        <button
                          className="link-like"
                          onClick={() => onOpen(n.itemId)}
                          title="Open in Items to collect › Crafts"
                        >
                          <ItemChip id={n.itemId} items={items} />
                        </button>
                      </div>
                    </td>
                    <td className="crafting-for">{n.forWhat.join(', ')}</td>
                    <td className="num">
                      {n.missing}
                      {n.fir > 0 && (
                        <span className="tag fir" title={`${n.fir} of ${n.missing} must be found in raid`}>
                          {n.fir === n.missing ? 'all FIR' : `${n.fir} FIR`}
                        </span>
                      )}
                    </td>
                    <td className="num">{n.runs}</td>
                    <td className="num">{formatDuration(n.time)}</td>
                    <td className="num">{money(n.cost)}</td>
                    <td className="num">{money(n.buyPrice)}</td>
                    <td className={`num ${n.saving !== null ? (n.saving > 0 ? 'gain' : 'loss') : ''}`}>
                      {money(n.saving)}
                    </td>
                    <td>
                      <StartButton onStart={() => onStart(n.craft.craft)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {plan.profit.length > 0 && (
        <>
          <h4>For profit{minutes ? ` (${minutesText(minutes)})` : ''}</h4>
          <ul className="crafting-profit">
            {plan.profit.map((p) => (
              <li key={p.craft.id}>
                <span className="craft-chips">
                  {p.craft.outputs.map((o) => (
                    <ItemChip key={o.itemId} id={o.itemId} count={o.count} items={items} />
                  ))}
                </span>
                <span className="muted">{formatDuration(p.craft.duration)}</span>
                <span className="num">{money(p.profit)}</span>
                <b className="num gain">{money(p.perHour)}/h</b>
                <StartButton onStart={() => onStart(p.craft)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  )
}

/** "Medstation 1, Rest Space 2 +3 more": the first two, then how many others. */
function shortFor(forWhat: readonly string[]): string {
  const more = forWhat.length - 2
  return forWhat.slice(0, 2).join(', ') + (more > 0 ? ` +${more} more` : '')
}

/** A station in the overview (since 1.51.0): what to craft next there and how much there is to make; click to open it. */
function StationTile({
  plan,
  rank,
  first,
  items,
  onOpen,
  onStart
}: {
  plan: StationPlan
  rank: number
  first: boolean
  items: Items
  onOpen: (stationId: string) => void
  onStart: (craft: HideoutCraft) => void
}): React.JSX.Element {
  const next = plan.next
  const fir = plan.needed.filter((n) => n.fir > 0).length
  const time = plan.needed.reduce((sum, n) => sum + n.time, 0)
  const best = plan.profit[0]
  // What comes after the next craft (plan.needed is in priority order, the next one first).
  const after = next?.kind === 'needed' ? plan.needed.slice(1) : plan.needed
  const shown = after.slice(0, 3)
  const more = after.length - shown.length
  const nextText =
    next?.kind === 'needed'
      ? `${next.craft.missing > 1 ? `${next.craft.missing} × ` : ''}${items.get(next.craft.itemId)?.name ?? 'Unknown item'}`
      : next?.kind === 'profit'
        ? next.craft.craft.outputs.map((o) => items.get(o.itemId)?.name ?? 'Unknown item').join(', ')
        : 'Nothing to craft'
  // Not a button itself, since it holds the Started button (a button can't hold another): its head is
  // the button that opens it, and a click anywhere else on it does the same.
  return (
    <div
      className={`todo-tile crafting-tile ${first ? 'best' : ''} ${next?.kind ?? 'idle'}`}
      onClick={() => onOpen(plan.stationId)}
    >
      <button
        className="todo-tile-head crafting-tile-open"
        aria-label={`${plan.stationName}: craft ${nextText} next. Open it`}
        onClick={(e) => {
          e.stopPropagation()
          onOpen(plan.stationId)
        }}
      >
        <span className="todo-rank">{rank}</span>
        <span className="todo-tile-name">
          {first && <span className="todo-next">Craft next</span>}
          <strong>{plan.stationName}</strong>
        </span>
        <span className="muted">level {plan.level}</span>
        <span className="todo-tile-open" aria-hidden>
          ▶
        </span>
      </button>
      <span className="crafting-tile-next">
        {next ? (
          <>
            <span className="crafting-tile-what">
              {next.kind === 'needed' ? (
                <ItemChip id={next.craft.itemId} count={next.craft.missing} items={items} />
              ) : (
                next.craft.craft.outputs.map((o) => (
                  <ItemChip key={o.itemId} id={o.itemId} count={o.count} items={items} />
                ))
              )}
            </span>
            <span className="muted">
              {next.kind === 'needed' ? (
                <>
                  {formatDuration(next.craft.time)} · for {shortFor(next.craft.forWhat)}
                </>
              ) : (
                <>
                  for profit: <b className="gain">{money(next.craft.perHour)}/h</b> ·{' '}
                  {formatDuration(next.craft.craft.duration)}
                </>
              )}
            </span>
            <StartButton
              onStart={() => onStart(next.kind === 'needed' ? next.craft.craft.craft : next.craft.craft)}
            />
          </>
        ) : (
          <span className="muted">Nothing needed here, and no craft for profit.</span>
        )}
      </span>
      {(plan.needed.length > 0 || best) && (
        <span className="todo-chips">
          {plan.needed.length > 0 && (
            <span
              className="todo-chip"
              title="Crafts here that make what your upgrades and quests still need"
            >
              {plan.needed.length} for upgrades and quests
            </span>
          )}
          {fir > 0 && (
            <span className="todo-chip missing" title="Of those, items that must be found in raid">
              {fir} found in raid
            </span>
          )}
          {time > 0 && (
            <span className="todo-chip" title="Every needed craft here, one after another">
              {formatDuration(time)} of crafting
            </span>
          )}
          {best && (
            <span className="todo-chip gain" title="The best craft here for profit">
              best {money(best.perHour)}/h
            </span>
          )}
        </span>
      )}
      {shown.length > 0 && (
        <span className="todo-tile-quests">
          <span className="muted">Then</span>
          {shown.map((n) => (
            <span key={n.itemId}>
              <ItemChip id={n.itemId} count={n.missing} items={items} />
            </span>
          ))}
          {more > 0 && <span className="muted">+{more} more</span>}
        </span>
      )}
    </div>
  )
}
