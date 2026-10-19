import { useMemo } from 'react'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../../shared/constants'
import { byPriority, craftingPlan, type NeededCraft, type StationPlan } from '../../../shared/crafting'
import { EMPTY_HIDEOUT, hideoutNeeds, stationLevel } from '../../../shared/hideout'
import { neededItems } from '../../../shared/questProgress'
import type { CraftSortKey, LootItem, PriceState, PublicSettings } from '../../../shared/types'
import { evaluateItem } from '../../../shared/valuation'
import { formatDuration, formatRub } from '../lib/format'
import { useItemLookup } from '../lib/useItemLookup'
import { useBuyContext, useCraftContext } from '../lib/useKeepList'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import LoadError from './LoadError'
import { ItemChip } from './QuestDetail'
import SettingsLink from './SettingsLink'

// The Hideout tab (since 1.49.0): what to put on each station now. First what the hideout's upgrades
// and quests still need (as Items to collect counts it), then the crafts that make the most money per
// hour, at least as long as Settings says.

type Items = ReturnType<typeof useItemLookup>

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
  // active quests or every quest left).
  const needs = useMemo(() => {
    const left = rows.filter((r) => r.status !== 'completed' && r.status !== 'failed')
    const quests = neededItems(
      (h.questScope === 'active' ? left.filter((r) => r.status === 'active') : left).map((r) => r.quest),
      objectives
    ).items
    return hideoutNeeds(stations, progress, h.scope, quests)
  }, [rows, objectives, stations, progress, h.scope, h.questScope])

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

  return (
    <div className="crafting-page">
      <div className="summary">
        <div className="summary-title">
          <strong>Hideout</strong>
          <span className="muted">
            {dataset ? (
              `${plans.length} station${plans.length === 1 ? '' : 's'} built · ` +
              `${neededCount} craft${neededCount === 1 ? '' : 's'} for upgrades and quests · ` +
              `counting ${h.scope === 'next' ? 'next levels' : 'every level'} and ${h.questScope === 'active' ? 'active quests' : 'every quest left'}, as Items to collect does`
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
      </div>
      <div className="crafting-stations">
        {plans.map((plan) => (
          <StationCard
            key={plan.stationId}
            plan={plan}
            items={items}
            order={order}
            sort={c.sort}
            onSort={sortBy}
            onOpen={openInCrafts}
            minutes={c.minProfitMinutes}
          />
        ))}
        {dataset && unbuilt.length > 0 && (
          <p className="hint crafting-unbuilt">
            Not built yet (so nothing to craft there): {unbuilt.map((s) => s.name).join(', ')}. Set how far
            each is built in Items to collect.
          </p>
        )}
      </div>
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
  minutes
}: {
  plan: StationPlan
  items: Items
  order: (a: NeededCraft, b: NeededCraft) => number
  sort: { key: CraftSortKey; desc: boolean }
  onSort: (key: CraftSortKey) => void
  onOpen: (itemId: string) => void
  minutes: number
}): React.JSX.Element {
  const next = plan.next
  const rank = new Map([...plan.needed].sort(byPriority).map((n, i) => [n.itemId, i + 1]))
  const rows = [...plan.needed].sort(order)
  return (
    <article className={`crafting-station ${next?.kind ?? 'idle'}`}>
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
            </span>
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
            </span>
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
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.itemId}>
                  <td className="num muted">{rank.get(n.itemId)}</td>
                  <td>
                    <button
                      className="link-like"
                      onClick={() => onOpen(n.itemId)}
                      title="Open in Items to collect › Crafts"
                    >
                      <ItemChip id={n.itemId} items={items} />
                    </button>
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
                </tr>
              ))}
            </tbody>
          </table>
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
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  )
}
