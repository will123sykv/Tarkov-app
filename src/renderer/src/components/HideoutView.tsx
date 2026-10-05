import { useMemo, useState } from 'react'
import { CURRENCIES } from '../../../shared/constants'
import {
  EMPTY_HIDEOUT,
  hideoutNeeds,
  maxLevel,
  RARE_MAX_OFFERS,
  RARE_MIN_PRICE,
  RARE_SCARCE_MIN_PRICE,
  buyOptions,
  scarcity,
  sellAdvice,
  stationLevel,
  unneededHave,
  UPGRADE_ORDER,
  upgradeStatus,
  type UpgradeStatus,
  type BuyContext,
  type Scarcity,
  type SellAdvice,
  type HideoutNeed,
  type HideoutProgress
} from '../../../shared/hideout'
import { neededItems } from '../../../shared/questProgress'
import type { HideoutLevel, HideoutStation, QuestTrader } from '../../../shared/questTypes'
import type { HideoutSettings, LootItem, PriceState, PublicSettings } from '../../../shared/types'
import { formatRub } from '../lib/format'
import { formatMoney } from '../lib/questSummary'
import { useItemLookup } from '../lib/useItemLookup'
import { useBuyContext } from '../lib/useKeepList'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import ScarceBadge from './ScarceBadge'
import ScavScan, { startStashCount } from './ScavScan'

type Items = ReadonlyMap<string, LootItem>

/** The most of one item the app keeps count of. */
const MAX_HAVE = 100_000

const STATION_ICON_FALLBACK = (name: string): string => name.slice(0, 2)

function StationIcon({ station }: { station: HideoutStation }): React.JSX.Element {
  return station.imageLink ? (
    <img className="station-icon" src={station.imageLink} alt="" loading="lazy" />
  ) : (
    <span className="station-icon" aria-hidden>
      {STATION_ICON_FALLBACK(station.name)}
    </span>
  )
}

/** Rare first, then what can't be bought yet. */
const SCARCE_ORDER = (s: Scarcity | null): number => (s?.kind === 'rare' ? 2 : s ? 1 : 0)

/** − count + for how many of an item the player has put aside. */
function HaveCounter({
  value,
  needed,
  onChange
}: {
  value: number
  needed: number
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <span className={`have-counter ${value >= needed ? 'done' : ''}`}>
      <button
        className="button icon small"
        aria-label="One fewer"
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        value={value}
        aria-label="How many you have"
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(MAX_HAVE, Math.max(0, Math.round(n))))
        }}
      />
      <button
        className="button icon small"
        aria-label="One more"
        disabled={value >= MAX_HAVE}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
      {value < needed && (
        <button className="link small" title="Mark all of them as put aside" onClick={() => onChange(needed)}>
          All
        </button>
      )}
    </span>
  )
}

/** The cheapest way to buy one now, or what's in the way. */
function BuyCell({ buy }: { buy: ReturnType<typeof buyOptions> | null }): React.JSX.Element {
  const best = buy?.options[0]
  if (best)
    return (
      <span title={buy.options.map((o) => `${o.label}: ${formatRub(o.price)}`).join('\n')}>
        {formatRub(best.price)}
        <small>{best.label}</small>
      </span>
    )
  if (buy?.locked.length)
    return (
      <span className="muted locked-buy" title={`Opens up with: ${buy.locked.join(', ')}`}>
        Can&rsquo;t buy yet
        <small>{buy.locked[0]}</small>
      </span>
    )
  return <span className="muted">—</span>
}

/** What selling some of an item would get, and buying them back would cost. */
function sellTitle(advice: SellAdvice): string {
  const them = advice.count === 1 ? 'it' : 'them'
  const lines = [
    advice.reason === 'extra'
      ? `${advice.count} more than every level and quest left needs: sell ${them}.`
      : `You can buy ${them} back now, so there's no need to hold on to ${them}.`
  ]
  if (advice.sellEach !== null)
    lines.push(
      `Sells for ~${formatRub(advice.sellEach)} each ${advice.sellVia === 'flea' ? 'on the flea after the fee' : `to ${advice.sellVia}`}.`
    )
  if (advice.reason === 'buyBack' && advice.buyBack) {
    lines.push(
      `Buy back for ${formatRub(advice.buyBack.price)} each (${advice.buyBack.label}) when you need ${them}.`
    )
    if (advice.sellEach !== null) {
      const gap = (advice.buyBack.price - advice.sellEach) * advice.count
      lines.push(
        gap > 0
          ? `Selling now and buying back later costs ~${formatRub(gap)} in all, for the stash space.`
          : `Selling now and buying back later comes out ~${formatRub(-gap)} ahead.`
      )
    }
  }
  if (advice.keepFir > 0)
    lines.push(
      `Keep ${advice.keepFir}: ${advice.keepFir === 1 ? 'it has' : 'they have'} to be found in raid, and bought ones aren't.`
    )
  return lines.join('\n')
}

const SOURCE_WORDS: Record<HideoutSettings['source'], { these: string; either: string; none: string }> = {
  all: {
    these: 'upgrades and quests',
    either: 'upgrades or quests',
    none: 'Nothing left to build or hand over.'
  },
  hideout: { these: 'upgrades', either: 'upgrades', none: 'Nothing left to build.' },
  quests: { these: 'quests', either: 'quests', none: 'No quest in scope needs items handed over or planted.' }
}

/** With only the hideout's or the quests' needs listed: how many the other one needs too. */
function AlsoNeeded({
  need,
  all,
  source
}: {
  need: HideoutNeed
  all: HideoutNeed | undefined
  source: 'hideout' | 'quests'
}): React.JSX.Element | null {
  const other = all ? all.needed - need.needed : 0
  if (!all || other <= 0) return null
  const who = source === 'hideout' ? 'quests' : 'the hideout'
  return (
    <span
      className={`use-chip also-needed ${all.missing > 0 ? 'short' : ''}`}
      title={
        `${all.needed} needed in all with ${who}'s ${other}, and you have ${all.have}` +
        (all.missing > 0 ? `: ${all.missing} short for both.` : ': enough for both.')
      }
    >
      +{other} for {who}
    </span>
  )
}

/** Every item the stations and quests still need, rare ones first, then what's put aside but no longer needed. */
function ItemsNeeded({
  needs,
  everything,
  combined,
  source,
  items,
  hideDone,
  firOnly,
  keepOnly,
  sellOnly,
  ctx,
  onOpenQuest
}: {
  needs: HideoutNeed[]
  /** Each item's need over every level and quest left, for what's extra. */
  everything: ReadonlyMap<string, HideoutNeed>
  /** Each item's need for the hideout and quests together (in scope), for what the other one needs. */
  combined: ReadonlyMap<string, HideoutNeed>
  /** Whose needs are listed. */
  source: HideoutSettings['source']
  items: Items
  hideDone: boolean
  /** Only items that must be found in raid. */
  firOnly: boolean
  /** Only what to save: still missing, and can't be bought now or rare. */
  keepOnly: boolean
  /** Only what could be sold: extras, or what can be bought back now. */
  sellOnly: boolean
  ctx: BuyContext
  onOpenQuest: (questId: string) => void
}): React.JSX.Element {
  const setHave = useStore((s) => s.setHideoutHave)
  const rows = useMemo(
    () =>
      needs
        .filter(
          (n) =>
            !CURRENCIES[n.itemId] && (sellOnly || !hideDone || n.missing > 0) && (!firOnly || n.firNeeded > 0)
        )
        .map((n) => {
          const item = items.get(n.itemId)
          return {
            need: n,
            item,
            scarce: item ? scarcity(item, ctx) : null,
            buy: item ? buyOptions(item, ctx) : null,
            sell: sellAdvice(everything.get(n.itemId) ?? n, item, ctx)
          }
        })
        .filter((r) => !keepOnly || (r.need.missing > 0 && r.scarce !== null))
        .filter((r) => !sellOnly || r.sell !== null)
        .sort(
          (a, b) =>
            Number(a.need.needed === 0) - Number(b.need.needed === 0) ||
            (b.need.missing > 0 ? SCARCE_ORDER(b.scarce) : 0) -
              (a.need.missing > 0 ? SCARCE_ORDER(a.scarce) : 0) ||
            b.need.missing - a.need.missing ||
            (a.item?.name ?? '').localeCompare(b.item?.name ?? '')
        ),
    [needs, everything, items, hideDone, firOnly, keepOnly, sellOnly, ctx]
  )
  if (!rows.length)
    return (
      <div className="empty">
        <p>
          {sellOnly
            ? 'Nothing you’ve put aside can be sold: none of it is extra, and the rest can’t be bought back now.'
            : keepOnly && needs.some((n) => n.missing > 0)
              ? `Nothing ${firOnly ? 'found-in-raid ' : ''}still missing is hard to replace right now: you can buy it all.`
              : firOnly && needs.some((n) => n.missing > 0)
                ? `None of these ${SOURCE_WORDS[source].either} need items found in raid.`
                : needs.length
                  ? `You have everything these ${SOURCE_WORDS[source].these} need.`
                  : SOURCE_WORDS[source].none}
        </p>
      </div>
    )
  return (
    <div className="hideout-items">
      <table className="values-table hideout-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Have</th>
            <th className="num" title={firOnly ? 'Found in raid, of all needed' : undefined}>
              {firOnly ? 'Found in raid' : 'Needed'}
            </th>
            <th className="num">Missing</th>
            <th className="num" title="The cheapest way to buy one now, at your level and trader loyalty">
              Buy
            </th>
            <th>For</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ need, item, scarce, buy, sell }) => (
            <tr key={need.itemId} className={need.missing === 0 ? 'done' : (scarce?.kind ?? '')}>
              <td className="item-cell">
                {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}
                <span>
                  {item?.name ?? 'Unknown item'}
                  {need.foundInRaid && (
                    <span
                      className="tag fir"
                      title={
                        need.firNeeded < need.needed
                          ? `${need.firNeeded} of the ${need.needed} must be found in raid; the rest can be bought`
                          : 'Every one must be found in raid'
                      }
                    >
                      {need.firNeeded < need.needed ? `${need.firNeeded} found in raid` : 'found in raid'}
                    </span>
                  )}
                  {scarce && need.missing > 0 && <ScarceBadge scarce={scarce} />}
                  {sell && (
                    <span className="badge ok rare-badge" title={sellTitle(sell)}>
                      Sell {sell.count}
                    </span>
                  )}
                </span>
              </td>
              <td>
                <HaveCounter
                  value={need.have}
                  needed={need.needed}
                  onChange={(n) => void setHave(need.itemId, n)}
                />
              </td>
              <td className="num">
                {firOnly ? (
                  <>
                    {need.firNeeded}
                    {need.firNeeded < need.needed && <small>of {need.needed}</small>}
                  </>
                ) : (
                  need.needed
                )}
              </td>
              <td className={`num ${need.missing ? '' : 'muted'}`}>{need.missing || '✓'}</td>
              <td className="num">
                <BuyCell buy={buy} />
              </td>
              <td className="uses">
                {need.uses
                  .filter((u) => !firOnly || u.foundInRaid)
                  .map((u, _, shown) => (
                    <span key={`${u.stationId}:${u.level}`} className="use-chip">
                      {u.stationName} {u.level}
                      {shown.length + need.quests.length > 1 && <span className="muted"> ×{u.count}</span>}
                    </span>
                  ))}
                {need.quests
                  .filter((q) => !firOnly || q.foundInRaid)
                  .map((q) => (
                    <span key={`${q.questId}:${q.foundInRaid}`} className="use-chip quest-chip">
                      <button className="link" title="Open this quest" onClick={() => onOpenQuest(q.questId)}>
                        {q.name}
                      </button>
                      {need.uses.length + need.quests.length > 1 && (
                        <span className="muted"> ×{q.count}</span>
                      )}
                    </span>
                  ))}
                {need.needed === 0 && <span className="muted">Nothing left needs these</span>}
                {source !== 'all' && (
                  <AlsoNeeded need={need} all={combined.get(need.itemId)} source={source} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return 'Instant'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

const UPGRADE_BADGE: Record<UpgradeStatus['state'], { className: string; text: string } | null> = {
  ready: { className: 'ok', text: 'Ready' },
  buyable: { className: 'info', text: 'Can buy the rest' },
  blocked: { className: 'warn', text: 'Waiting on a requirement' },
  short: null
}

/** What a station's next level takes, what buying the rest would cost, and a button to mark it built. */
function UpgradeCard({
  station,
  level,
  status,
  stationsById,
  traders,
  progress,
  items,
  ctx
}: {
  station: HideoutStation
  level: HideoutLevel
  status: UpgradeStatus
  stationsById: ReadonlyMap<string, HideoutStation>
  traders: QuestTrader[]
  progress: HideoutProgress
  items: Items
  ctx: BuyContext
}): React.JSX.Element {
  const build = useStore((s) => s.buildStationLevel)
  const badge = UPGRADE_BADGE[status.state]
  const missing = status.parts.filter((p) => p.missing > 0)
  const buyable = missing.filter((p) => p.best)
  const traderName = (id: string): string => traders.find((t) => t.id === id)?.name ?? 'A trader'
  const waiting = [
    ...status.unmetStations.map(
      (r) => `${stationsById.get(r.stationId)?.name ?? 'another station'} level ${r.level}`
    ),
    ...status.unmetTraders.map((r) => `${traderName(r.traderId)} LL${r.level}`)
  ]
  const total = status.moneyCost !== null ? status.partsCost + status.moneyCost : null
  return (
    <article className={`upgrade-card ${status.state}`}>
      <header>
        <StationIcon station={station} />
        <div>
          <strong>{station.name}</strong>
          <span className="muted">
            Level {level.level - 1} → {level.level} · {formatDuration(level.constructionTime)}
          </span>
        </div>
        {badge && <span className={`badge ${badge.className}`}>{badge.text}</span>}
      </header>
      <div className="upgrade-cost">
        {missing.length === 0 ? (
          <span>Every item in hand.</span>
        ) : (
          <span>
            {buyable.length > 0 && (
              <>
                <strong>≈ {formatRub(status.partsCost)}</strong> to buy{' '}
                {buyable.length === missing.length ? 'the rest' : 'what you can'} ({buyable.length} item
                {buyable.length === 1 ? '' : 's'})
              </>
            )}
            {status.unbuyable > 0 && (
              <span className="muted">
                {buyable.length > 0 ? ' · ' : ''}
                {status.unbuyable} item{status.unbuyable === 1 ? '' : 's'} you can&rsquo;t buy yet
              </span>
            )}
          </span>
        )}
        {status.money.length > 0 && (
          <span className="muted">
            Build cost {status.money.map((m) => formatMoney(m.itemId, m.count)).join(' + ')}
            {status.money.some((m) => CURRENCIES[m.itemId] !== '₽') &&
              status.moneyCost !== null &&
              ` (≈ ${formatRub(status.moneyCost)})`}
          </span>
        )}
        {total !== null && status.state !== 'short' && (missing.length > 0 || status.money.length > 0) && (
          <span className="upgrade-total">
            Total ≈ <strong>{formatRub(total)}</strong>
          </span>
        )}
        {waiting.length > 0 && <span className="upgrade-waiting">Waiting on {waiting.join(', ')}</span>}
      </div>
      {status.parts.length > 0 && (
        <ul className="upgrade-items">
          {status.parts.map((p) => {
            const item = items.get(p.itemId)
            const fir = level.items.find((i) => i.itemId === p.itemId)?.foundInRaid
            const scarce = item && p.missing ? scarcity(item, ctx) : null
            return (
              <li key={p.itemId} className={p.missing ? '' : 'done'}>
                {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}
                <span className="upgrade-item-name">
                  {item?.name ?? 'Unknown item'}
                  {fir && <span className="tag fir">FIR</span>}
                  {scarce && <ScarceBadge scarce={scarce} />}
                  {p.missing > 0 && (
                    <small className={p.best ? '' : 'muted'}>
                      {p.best
                        ? `${p.missing} × ${formatRub(p.best.price)} · ${p.best.label}`
                        : p.locked.length
                          ? `Can’t buy yet: ${p.locked.join(', ')}`
                          : 'Nobody sells it'}
                    </small>
                  )}
                </span>
                <span className="num">
                  {Math.min(p.have, p.needed)}/{p.needed}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {(level.stations.length > 0 || level.traders.length > 0 || level.skills.length > 0) && (
        <ul className="upgrade-reqs">
          {level.stations.map((r) => {
            const other = stationsById.get(r.stationId)
            const done = !other || stationLevel(other, progress) >= r.level
            return (
              <li key={r.stationId} className={done ? 'done' : ''}>
                {other?.name ?? 'Another station'} level {r.level}
              </li>
            )
          })}
          {level.traders.map((r) => (
            <li key={r.traderId} className={(ctx.traderLevels[r.traderId] ?? 1) >= r.level ? 'done' : ''}>
              {traderName(r.traderId)} loyalty level {r.level}
            </li>
          ))}
          {level.skills.map((r) => (
            <li key={r.name}>
              {r.name} skill level {r.level}
            </li>
          ))}
        </ul>
      )}
      <button
        className="button small"
        title="Sets the station to this level and takes these items off what you've put aside"
        onClick={() => void build(station.id, level.level)}
      >
        Mark level {level.level} built
      </button>
    </article>
  )
}

/** The hideout tracker: station levels set by hand, what the next upgrades need, and what's rare. */
export default function HideoutView({
  settings,
  priceState
}: {
  settings: PublicSettings
  priceState: PriceState | null
}): React.JSX.Element {
  const { questState, rows: questRows, objectives } = useQuestRows(settings)
  const selectQuest = useStore((s) => s.selectQuest)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const setStationLevel = useStore((s) => s.setStationLevel)
  const updateSettings = useStore((s) => s.updateSettings)
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(settings, priceState)
  const setTraderLevel = useStore((s) => s.setTraderLevel)
  const [search, setSearch] = useState('')
  const h = settings.hideout
  const set = (patch: Partial<HideoutSettings>): void => void updateSettings({ hideout: { ...h, ...patch } })

  const dataset = questState?.dataset ?? null
  const stations = useMemo(() => dataset?.stations ?? [], [dataset])
  const stationsById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations])
  // What quests still want handed over or planted: active ones, and every one not yet done.
  const questNeeds = useMemo(() => {
    const left = questRows.filter((r) => r.status !== 'completed' && r.status !== 'failed')
    return {
      active: neededItems(
        left.filter((r) => r.status === 'active').map((r) => r.quest),
        objectives
      ).items,
      all: neededItems(
        left.map((r) => r.quest),
        objectives
      ).items
    }
  }, [questRows, objectives])
  const needs = useMemo(
    () => hideoutNeeds(stations, progress, h.scope, questNeeds[h.questScope]),
    [stations, progress, h.scope, h.questScope, questNeeds]
  )
  const combined = useMemo(() => new Map(needs.map((n) => [n.itemId, n])), [needs])
  // Only the hideout's or the quests' needs, counted on their own against what's put aside.
  const sourceNeeds = useMemo(
    () =>
      h.source === 'all'
        ? needs
        : hideoutNeeds(
            h.source === 'hideout' ? stations : [],
            progress,
            h.scope,
            h.source === 'quests' ? questNeeds[h.questScope] : []
          ),
    [h.source, needs, stations, progress, h.scope, h.questScope, questNeeds]
  )
  // Every level and quest left: what's extra, and what counts from screenshots cover.
  const allNeeds = useMemo(
    () => hideoutNeeds(stations, progress, 'all', questNeeds.all),
    [stations, progress, questNeeds]
  )
  const everything = useMemo(() => new Map(allNeeds.map((n) => [n.itemId, n])), [allNeeds])
  // Plus what's put aside that nothing needs any more (when both are listed).
  const listed = useMemo(
    () => (h.source === 'all' ? [...needs, ...unneededHave(progress, allNeeds)] : sourceNeeds),
    [h.source, needs, sourceNeeds, progress, allNeeds]
  )
  const sellCount = useMemo(
    () =>
      listed.filter((n) => sellAdvice(everything.get(n.itemId) ?? n, items.get(n.itemId), ctx) !== null)
        .length,
    [listed, everything, items, ctx]
  )
  const term = search.trim().toLowerCase()
  const shownNeeds = useMemo(
    () => (term ? listed.filter((n) => items.get(n.itemId)?.name.toLowerCase().includes(term)) : listed),
    [listed, items, term]
  )
  const openQuest = (questId: string): void => {
    selectQuest(questId)
    void updateSettings({ view: 'quests' })
  }
  const money = sourceNeeds.filter((n) => CURRENCIES[n.itemId] && n.missing > 0)
  const missing = sourceNeeds.filter((n) => !CURRENCIES[n.itemId] && n.missing > 0)
  const scarceKinds = missing.map((n) => {
    const item = items.get(n.itemId)
    return item ? scarcity(item, ctx)?.kind : undefined
  })
  const rareCount = scarceKinds.filter((k) => k === 'rare').length
  const lockedCount = scarceKinds.filter((k) => k === 'locked').length
  // Traders that sell something the hideout still needs: their loyalty decides what's on offer.
  const sellers = useMemo(() => {
    const ids = new Set(
      needs.flatMap((n) =>
        CURRENCIES[n.itemId] ? [] : (items.get(n.itemId)?.buyFrom ?? []).map((o) => o.traderId)
      )
    )
    return (dataset?.traders ?? []).filter((t) => ids.has(t.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [needs, items, dataset])
  const firCount = missing.filter((n) => n.firNeeded > 0).length
  const questCount = missing.filter((n) => n.quests.length > 0).length
  const upgrades = stations
    .map((station) => {
      const current = stationLevel(station, progress)
      return { station, next: station.levels.find((l) => l.level === current + 1) }
    })
    .filter((u): u is { station: HideoutStation; next: HideoutLevel } => u.next !== undefined)
    .map((u) => ({ ...u, status: upgradeStatus(u.next, progress, ctx, items, stationsById) }))
    // Ready first, then what can be bought (cheapest first), then the rest.
    .sort(
      (a, b) =>
        UPGRADE_ORDER[a.status.state] - UPGRADE_ORDER[b.status.state] ||
        a.status.partsCost - b.status.partsCost ||
        a.station.name.localeCompare(b.station.name)
    )
  const readyCount = upgrades.filter((u) => u.status.state === 'ready').length
  const buyableCount = upgrades.filter((u) => u.status.state === 'buyable').length
  const maxed = stations.filter((s) => stationLevel(s, progress) >= maxLevel(s))

  return (
    <div className="hideout">
      <aside className="sidebar">
        <section>
          <h2>Stations</h2>
          <p className="hint">Set how far each station is built. The game&rsquo;s logs don&rsquo;t say.</p>
          <ul className="station-levels">
            {stations.map((s) => {
              const level = stationLevel(s, progress)
              return (
                <li key={s.id}>
                  <StationIcon station={s} />
                  <span className="station-name" title={s.name}>
                    {s.name}
                  </span>
                  <select
                    value={level}
                    aria-label={`${s.name} level`}
                    onChange={(e) => void setStationLevel(s.id, Number(e.target.value))}
                  >
                    {Array.from({ length: maxLevel(s) + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? 'Not built' : `Level ${n}`}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
          {!stations.length && (
            <p className="hint">
              {questState?.error ? `Couldn't load the hideout: ${questState.error}` : 'Loading the hideout…'}
            </p>
          )}
        </section>
        <section>
          <h2>Trader loyalty</h2>
          <p className="hint">
            At level {ctx.playerLevel}
            {ctx.playerLevel < ctx.fleaMinLevel
              ? `, the flea market opens at level ${ctx.fleaMinLevel}.`
              : ', the flea market is open.'}{' '}
            {sellers.length
              ? 'Set your loyalty with the traders who sell what the hideout needs.'
              : 'No trader sells what the hideout still needs.'}
          </p>
          {sellers.length > 0 && (
            <ul className="station-levels">
              {sellers.map((t) => (
                <li key={t.id}>
                  {t.imageLink ? (
                    <img className="station-icon" src={t.imageLink} alt="" loading="lazy" />
                  ) : (
                    <span className="station-icon" aria-hidden>
                      {t.name.slice(0, 2)}
                    </span>
                  )}
                  <span className="station-name">{t.name}</span>
                  <select
                    value={ctx.traderLevels[t.id] ?? 1}
                    aria-label={`${t.name} loyalty level`}
                    onChange={(e) => void setTraderLevel(t.id, Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        LL{n}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2>Count items for</h2>
          <div className="mini-toggle wide" role="radiogroup" aria-label="Count items for">
            {(
              [
                ['next', 'Next levels'],
                ['all', 'Every level left']
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                role="radio"
                aria-checked={h.scope === id}
                className={h.scope === id ? 'active' : ''}
                onClick={() => set({ scope: id })}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="mini-toggle wide" role="radiogroup" aria-label="Quests to count items for">
            {(
              [
                ['active', 'Active quests'],
                ['all', 'Every quest left']
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                role="radio"
                aria-checked={h.questScope === id}
                className={h.questScope === id ? 'active' : ''}
                onClick={() => set({ questScope: id })}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="hint">
            Quest items are the ones to hand over or plant. Quests that take any of several items are in the
            Quests tab&rsquo;s Items needed. Handing items over in the Quests tab, or a quest the game&rsquo;s
            logs say you finished, takes them off Have.
          </p>
          <p className="hint">
            <strong>Hideout only</strong> and <strong>Quests only</strong> above the list count each on its
            own against what you have; <span className="also-needed">+N for quests</span> says how many the
            other needs too.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={h.hideDone}
              onChange={(e) => set({ hideDone: e.target.checked })}
            />
            Hide items I have enough of
          </label>
        </section>
        <section>
          <h2>Don&rsquo;t sell</h2>
          <p className="hint">
            Items still missing here or for your active quests get a <span className="keep-tag">Keep</span>{' '}
            tag in the Loot tab. <span className="badge bad rare-badge">Rare</span> ones are hard to get even
            once everything&rsquo;s unlocked: no trader sells them, and on the flea they&rsquo;re banned, cost{' '}
            {formatRub(RARE_MIN_PRICE)} or more, or have fewer than {RARE_MAX_OFFERS} offers up (and are worth{' '}
            {formatRub(RARE_SCARCE_MIN_PRICE)}+).{' '}
            <span className="badge warn rare-badge">Can&rsquo;t buy yet</span> ones you can&rsquo;t buy at
            your level and trader loyalty. Ones a trader sells you are neither.
          </p>
          <p className="hint">
            <span className="badge ok rare-badge">Sell</span> marks what you could sell from what you&rsquo;ve
            put aside: anything more than every level and quest left needs, and anything you can buy back now
            on the flea or from a trader (except copies that must be found in raid). Hover it for what selling
            gets and buying back costs.
          </p>
        </section>
      </aside>
      <main className="content">
        <div className="summary">
          <div className="summary-title">
            <strong>Items to collect</strong>
            <span className="muted">
              {dataset
                ? `${upgrades.length} station${upgrades.length === 1 ? '' : 's'} to upgrade · ${maxed.length} maxed · ` +
                  (readyCount ? `${readyCount} ready to build · ` : '') +
                  (buyableCount ? `${buyableCount} ready once you buy the rest · ` : '') +
                  `${missing.length} item${missing.length === 1 ? '' : 's'} missing` +
                  (h.source === 'hideout'
                    ? ' for the hideout'
                    : h.source === 'quests'
                      ? ' for quests'
                      : questCount
                        ? ` (${questCount} for quests)`
                        : '') +
                  (rareCount ? ` · ${rareCount} rare` : '') +
                  (lockedCount ? ` · ${lockedCount} you can’t buy yet` : '') +
                  (firCount ? ` · ${firCount} need finding in raid` : '') +
                  (sellCount ? ` · ${sellCount} you could sell` : '') +
                  (money.length
                    ? ` · plus ${money.map((n) => formatMoney(n.itemId, n.missing)).join(' and ')}`
                    : '')
                : questState?.error
                  ? `Couldn't load the hideout: ${questState.error}`
                  : 'Loading the hideout…'}
            </span>
          </div>
          <div className="summary-stats">
            <div className="segmented small" role="tablist">
              <button
                role="tab"
                aria-selected={h.tab === 'items'}
                className={h.tab === 'items' ? 'active' : ''}
                onClick={() => set({ tab: 'items' })}
              >
                Items needed
              </button>
              <button
                role="tab"
                aria-selected={h.tab === 'upgrades'}
                className={h.tab === 'upgrades' ? 'active' : ''}
                onClick={() => set({ tab: 'upgrades' })}
              >
                Upgrades
              </button>
              <button
                role="tab"
                aria-selected={h.tab === 'scav'}
                className={h.tab === 'scav' ? 'active' : ''}
                onClick={() => set({ tab: 'scav' })}
                title="Read screenshots: what to keep and sell from new loot, or count everything you have"
              >
                Screenshots
              </button>
            </div>
            {h.tab === 'items' && (
              <>
                <div className="segmented small" role="radiogroup" aria-label="Show items for">
                  {(
                    [
                      ['all', 'Hideout + quests', 'Everything the hideout and quests need'],
                      ['hideout', 'Hideout only', 'Only what the hideout needs, counted on its own'],
                      [
                        'quests',
                        'Quests only',
                        'Only what quests need handed over or planted, counted on their own'
                      ]
                    ] as const
                  ).map(([id, text, title]) => (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={h.source === id}
                      className={h.source === id ? 'active' : ''}
                      title={title}
                      onClick={() => set({ source: id })}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <input
                  className="search"
                  type="search"
                  placeholder="Search items"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <label className="check fir-filter">
                  <input
                    type="checkbox"
                    checked={h.firOnly}
                    onChange={(e) => set({ firOnly: e.target.checked })}
                  />
                  Found in raid only
                </label>
                <label
                  className="check fir-filter"
                  title="Items still missing that you can't buy at your level and trader loyalty, or that are rare: save these, don't sell them"
                >
                  <input
                    type="checkbox"
                    checked={h.keepOnly}
                    onChange={(e) =>
                      set({ keepOnly: e.target.checked, sellOnly: e.target.checked ? false : h.sellOnly })
                    }
                  />
                  Can&rsquo;t buy or rare only
                </label>
                <label
                  className="check fir-filter"
                  title="What you've put aside that you could sell: extras, and items you can buy back now"
                >
                  <input
                    type="checkbox"
                    checked={h.sellOnly}
                    onChange={(e) =>
                      set({ sellOnly: e.target.checked, keepOnly: e.target.checked ? false : h.keepOnly })
                    }
                  />
                  Can sell only
                </label>
                <button
                  className="button small"
                  title="Set the Have counts from screenshots of your stash and cases"
                  onClick={() => {
                    startStashCount()
                    set({ tab: 'scav' })
                  }}
                >
                  Count from screenshots
                </button>
              </>
            )}
          </div>
        </div>
        {h.tab === 'scav' ? (
          <ScavScan
            settings={settings}
            priceState={priceState}
            items={items}
            progress={progress}
            allNeeds={allNeeds}
            variant="items"
          />
        ) : h.tab === 'items' ? (
          <ItemsNeeded
            needs={shownNeeds}
            everything={everything}
            combined={combined}
            source={h.source}
            items={items}
            hideDone={h.hideDone}
            firOnly={h.firOnly}
            keepOnly={h.keepOnly}
            sellOnly={h.sellOnly}
            ctx={ctx}
            onOpenQuest={openQuest}
          />
        ) : (
          <div className="upgrades">
            {upgrades.map(({ station, next, status }) => (
              <UpgradeCard
                key={station.id}
                station={station}
                level={next}
                status={status}
                stationsById={stationsById}
                traders={dataset?.traders ?? []}
                progress={progress}
                items={items}
                ctx={ctx}
              />
            ))}
            {maxed.length > 0 && (
              <p className="hint maxed">Fully built: {maxed.map((s) => s.name).join(', ')}.</p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
