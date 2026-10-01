import { useMemo, useState } from 'react'
import { CURRENCIES } from '../../../shared/constants'
import {
  EMPTY_HIDEOUT,
  hideoutNeeds,
  maxLevel,
  RARE_MAX_OFFERS,
  RARE_MIN_PRICE,
  RARE_SCARCE_MIN_PRICE,
  rareReason,
  stationLevel,
  type HideoutNeed,
  type HideoutProgress
} from '../../../shared/hideout'
import type { HideoutLevel, HideoutStation, QuestTrader } from '../../../shared/questTypes'
import type { HideoutSettings, LootItem, PriceState, PublicSettings } from '../../../shared/types'
import { formatRub } from '../lib/format'
import { formatMoney } from '../lib/questSummary'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'

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

function RareBadge({ reason }: { reason: string }): React.JSX.Element {
  return (
    <span className="badge bad rare-badge" title={reason}>
      Rare
    </span>
  )
}

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

/** Every item the stations still need, rare ones first. */
function ItemsNeeded({
  needs,
  items,
  hideDone
}: {
  needs: HideoutNeed[]
  items: Items
  hideDone: boolean
}): React.JSX.Element {
  const setHave = useStore((s) => s.setHideoutHave)
  const rows = useMemo(
    () =>
      needs
        .filter((n) => !CURRENCIES[n.itemId] && (!hideDone || n.missing > 0))
        .map((n) => {
          const item = items.get(n.itemId)
          return { need: n, item, rare: item ? rareReason(item) : null }
        })
        .sort(
          (a, b) =>
            Number(b.rare !== null && b.need.missing > 0) - Number(a.rare !== null && a.need.missing > 0) ||
            b.need.missing - a.need.missing ||
            (a.item?.name ?? '').localeCompare(b.item?.name ?? '')
        ),
    [needs, items, hideDone]
  )
  if (!rows.length)
    return (
      <div className="empty">
        <p>{needs.length ? 'You have everything these upgrades need.' : 'Nothing left to build.'}</p>
      </div>
    )
  return (
    <div className="hideout-items">
      <table className="values-table hideout-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Have</th>
            <th className="num">Needed</th>
            <th className="num">Missing</th>
            <th className="num">Flea now</th>
            <th>For</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ need, item, rare }) => (
            <tr key={need.itemId} className={need.missing === 0 ? 'done' : rare ? 'rare' : ''}>
              <td className="item-cell">
                {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}
                <span>
                  {item?.name ?? 'Unknown item'}
                  {need.foundInRaid && <span className="tag fir">found in raid</span>}
                  {rare && need.missing > 0 && <RareBadge reason={rare} />}
                </span>
              </td>
              <td>
                <HaveCounter
                  value={need.have}
                  needed={need.needed}
                  onChange={(n) => void setHave(need.itemId, n)}
                />
              </td>
              <td className="num">{need.needed}</td>
              <td className={`num ${need.missing ? '' : 'muted'}`}>{need.missing || '✓'}</td>
              <td className="num">{item?.fleaPrice ? formatRub(item.fleaPrice) : '—'}</td>
              <td className="uses">
                {need.uses.map((u) => (
                  <span key={`${u.stationId}:${u.level}`} className="use-chip">
                    {u.stationName} {u.level}
                    {need.uses.length > 1 && <span className="muted"> ×{u.count}</span>}
                  </span>
                ))}
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

/** What a station's next level takes, and a button to mark it built. */
function UpgradeCard({
  station,
  level,
  stationsById,
  traders,
  progress,
  items
}: {
  station: HideoutStation
  level: HideoutLevel
  stationsById: ReadonlyMap<string, HideoutStation>
  traders: QuestTrader[]
  progress: HideoutProgress
  items: Items
}): React.JSX.Element {
  const build = useStore((s) => s.buildStationLevel)
  const itemsReady = level.items.every((i) => (progress.have[i.itemId] ?? 0) >= i.count)
  const stationsReady = level.stations.every((r) => {
    const other = stationsById.get(r.stationId)
    return !other || stationLevel(other, progress) >= r.level
  })
  return (
    <article className="upgrade-card">
      <header>
        <StationIcon station={station} />
        <div>
          <strong>{station.name}</strong>
          <span className="muted">
            Level {level.level - 1} → {level.level} · {formatDuration(level.constructionTime)}
          </span>
        </div>
        {itemsReady && stationsReady && <span className="badge ok">Ready</span>}
      </header>
      {level.items.length > 0 && (
        <ul className="upgrade-items">
          {level.items.map((i) => {
            const have = progress.have[i.itemId] ?? 0
            const item = items.get(i.itemId)
            const money = formatMoney(i.itemId, i.count)
            const rare = item && have < i.count ? rareReason(item) : null
            return (
              <li key={i.itemId} className={have >= i.count ? 'done' : ''}>
                {item?.iconLink && !money && <img src={item.iconLink} alt="" loading="lazy" />}
                <span className="upgrade-item-name">
                  {money ?? item?.name ?? 'Unknown item'}
                  {i.foundInRaid && <span className="tag fir">FIR</span>}
                  {rare && <RareBadge reason={rare} />}
                </span>
                {!money && (
                  <span className="num">
                    {Math.min(have, i.count)}/{i.count}
                  </span>
                )}
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
            <li key={r.traderId}>
              {traders.find((t) => t.id === r.traderId)?.name ?? 'A trader'} loyalty level {r.level}
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
  const { questState } = useQuestRows(settings)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const setStationLevel = useStore((s) => s.setStationLevel)
  const updateSettings = useStore((s) => s.updateSettings)
  const items = useItemLookup(priceState)
  const [search, setSearch] = useState('')
  const h = settings.hideout
  const set = (patch: Partial<HideoutSettings>): void => void updateSettings({ hideout: { ...h, ...patch } })

  const dataset = questState?.dataset ?? null
  const stations = useMemo(() => dataset?.stations ?? [], [dataset])
  const stationsById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations])
  const needs = useMemo(() => hideoutNeeds(stations, progress, h.scope), [stations, progress, h.scope])
  const term = search.trim().toLowerCase()
  const shownNeeds = useMemo(
    () => (term ? needs.filter((n) => items.get(n.itemId)?.name.toLowerCase().includes(term)) : needs),
    [needs, items, term]
  )
  const money = needs.filter((n) => CURRENCIES[n.itemId] && n.missing > 0)
  const missing = needs.filter((n) => !CURRENCIES[n.itemId] && n.missing > 0)
  const rareCount = missing.filter((n) => {
    const item = items.get(n.itemId)
    return item && rareReason(item)
  }).length
  const upgrades = stations
    .map((station) => {
      const current = stationLevel(station, progress)
      return { station, next: station.levels.find((l) => l.level === current + 1) }
    })
    .filter((u): u is { station: HideoutStation; next: HideoutLevel } => u.next !== undefined)
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
            tag in the Loot tab. <span className="badge bad rare-badge">Rare</span> ones are hard to replace:
            they can&rsquo;t be bought on the flea, cost {formatRub(RARE_MIN_PRICE)} or more to buy back, or
            have fewer than {RARE_MAX_OFFERS} offers up (and are worth {formatRub(RARE_SCARCE_MIN_PRICE)}+).
          </p>
        </section>
      </aside>
      <main className="content">
        <div className="summary">
          <div className="summary-title">
            <strong>Hideout</strong>
            <span className="muted">
              {dataset
                ? `${upgrades.length} station${upgrades.length === 1 ? '' : 's'} to upgrade · ${maxed.length} maxed · ` +
                  `${missing.length} item${missing.length === 1 ? '' : 's'} missing` +
                  (rareCount ? ` · ${rareCount} rare` : '') +
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
            </div>
            {h.tab === 'items' && (
              <input
                className="search"
                type="search"
                placeholder="Search items"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </div>
        </div>
        {h.tab === 'items' ? (
          <ItemsNeeded needs={shownNeeds} items={items} hideDone={h.hideDone} />
        ) : (
          <div className="upgrades">
            {upgrades.map(({ station, next }) => (
              <UpgradeCard
                key={station.id}
                station={station}
                level={next}
                stationsById={stationsById}
                traders={dataset?.traders ?? []}
                progress={progress}
                items={items}
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
