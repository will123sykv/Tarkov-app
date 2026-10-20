import { useMemo, useState } from 'react'
import { craftProfits, type BuyContext, type CraftContext, type CraftProfit } from '../../../shared/hideout'
import type { HideoutSettings, LootItem } from '../../../shared/types'
import { evaluateItem, type ValuationContext } from '../../../shared/valuation'
import { formatDuration, formatRub } from '../lib/format'
import type { useItemLookup } from '../lib/useItemLookup'
import { useTableSort, type SortColumn } from '../lib/useTableSort'
import { useStore } from '../store'
import FavouriteStar from './FavouriteStar'
import { ItemChip } from './QuestDetail'
import { SortHead } from './SortHeader'

type Items = ReturnType<typeof useItemLookup>

/** The list's own order: the most profit per hour first (crafts with no profit known last). */
const byPerHour = (a: CraftProfit, b: CraftProfit): number =>
  (b.perHour ?? -Infinity) - (a.perHour ?? -Infinity)

/** Roubles, a loss with a minus sign in front (−₽5,000). */
const money = (value: number | null): string =>
  value === null ? '—' : value < 0 ? `−${formatRub(-value)}` : formatRub(value)

/** Why a craft can't be made now, or null when it can. */
function blocker(p: CraftProfit): string | null {
  if (!p.stationReady) return `Needs ${p.stationName} level ${p.craft.level}`
  if (!p.questDone) return `After ${p.questName}`
  return null
}

/**
 * Every hideout craft as a way to make money: what its inputs cost to buy now and what its outputs sell
 * for, best profit per hour first (since 1.47.0).
 */
export default function CraftsView({
  cc,
  ctx,
  valuation,
  items,
  h,
  set
}: {
  cc: CraftContext
  ctx: BuyContext
  valuation: ValuationContext
  items: Items
  h: HideoutSettings
  set: (patch: Partial<HideoutSettings>) => void
}): React.JSX.Element {
  const [stationId, setStationId] = useState<string>('')
  const search = useStore((s) => s.craftsSearch)
  const setSearch = useStore((s) => s.setCraftsSearch)
  const profits = useMemo(
    () => craftProfits(cc, ctx, (item: LootItem) => evaluateItem(item, valuation).worth),
    [cc, ctx, valuation]
  )
  const stations = useMemo(
    () =>
      [...new Map(profits.map((p) => [p.craft.stationId, p.stationName])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1])
      ),
    [profits]
  )
  const term = search.trim().toLowerCase()
  const shown = useMemo(() => {
    const name = (id: string): string => items.get(id)?.name.toLowerCase() ?? ''
    return profits
      .filter((p) => !h.craftsReadyOnly || blocker(p) === null)
      .filter((p) => !stationId || p.craft.stationId === stationId)
      .filter(
        (p) =>
          !term ||
          [...p.craft.outputs, ...p.craft.inputs].some((i) => name(i.itemId).includes(term)) ||
          p.stationName.toLowerCase().includes(term)
      )
      .sort(byPerHour)
  }, [profits, h.craftsReadyOnly, stationId, term, items])
  // Every column sorts (since 1.59.0, in place of the Per hour / Profit / Quickest switch).
  const columns = useMemo<SortColumn<CraftProfit>[]>(() => {
    const name = (id: string | undefined): string | null => (id ? (items.get(id)?.name ?? null) : null)
    return [
      { key: 'makes', label: 'Makes', value: (p) => name(p.craft.outputs[0]?.itemId) },
      { key: 'station', label: 'Station', value: (p) => [p.stationName, p.craft.level] },
      { key: 'uses', label: 'Uses', value: (p) => name(p.craft.inputs[0]?.itemId) },
      { key: 'time', label: 'Time', num: true, desc: true, value: (p) => p.craft.duration },
      { key: 'cost', label: 'Cost', num: true, desc: true, value: (p) => p.cost },
      { key: 'value', label: 'Sells for', num: true, desc: true, value: (p) => p.value },
      { key: 'profit', label: 'Profit', num: true, desc: true, value: (p) => p.profit },
      { key: 'perHour', label: 'Per hour', num: true, desc: true, value: (p) => p.perHour }
    ]
  }, [items])
  const { sort, onSort, sorted } = useTableSort('crafts', columns)
  const rows = useMemo(() => sorted(shown), [sorted, shown])
  const ready = profits.filter((p) => blocker(p) === null).length

  return (
    <div className="crafts">
      <div className="crafts-filters">
        <select value={stationId} onChange={(e) => setStationId(e.target.value)} aria-label="Station">
          <option value="">Every station</option>
          {stations.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <input
          className="search"
          type="search"
          placeholder="Search crafts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={h.craftsReadyOnly}
            onChange={(e) => set({ craftsReadyOnly: e.target.checked })}
          />
          Only crafts I can make ({ready} of {profits.length})
        </label>
      </div>
      <p className="hint">
        What goes in at the cheapest place to buy it now (at your level and loyalty), and what comes out at
        what it sells for (flea after the fee, or a trader). Tools aren&rsquo;t used up; fuel, skills and
        hideout bonuses aren&rsquo;t counted, and the Bitcoin farm&rsquo;s time depends on its graphics cards.
      </p>
      {shown.length === 0 ? (
        <p className="hint">
          {profits.length === 0
            ? 'Loading the crafts…'
            : h.craftsReadyOnly
              ? 'None of the crafts you can make match. Untick “Only crafts I can make” to see the rest.'
              : 'No craft matches.'}
        </p>
      ) : (
        <table className="values-table crafts-table">
          <SortHead columns={columns} sort={sort} onSort={onSort} />
          <tbody>
            {rows.map((p) => {
              const blocked = blocker(p)
              const first = p.craft.outputs[0]
              return (
                <tr key={p.craft.id} className={blocked ? 'locked' : ''}>
                  <td>
                    <div className="item-cell-body">
                      {first && <FavouriteStar kind="items" id={first.itemId} />}
                      <span className="craft-chips">
                        {p.craft.outputs.map((o) => (
                          <ItemChip key={o.itemId} id={o.itemId} count={o.count} items={items} />
                        ))}
                      </span>
                    </div>
                  </td>
                  <td>
                    {p.stationName} {p.craft.level}
                    {blocked && <div className="muted small">{blocked}</div>}
                  </td>
                  <td>
                    <span className="craft-chips">
                      {p.craft.inputs.map((i) => (
                        <ItemChip key={i.itemId} id={i.itemId} count={i.count} items={items} />
                      ))}
                      {p.craft.tools.map((id) => (
                        <span key={id} className="craft-tool" title="A tool: needed, not used up">
                          <ItemChip id={id} items={items} />
                        </span>
                      ))}
                      {p.craft.inputs.length + p.craft.tools.length === 0 && (
                        <span className="muted">Nothing</span>
                      )}
                    </span>
                  </td>
                  <td className="num">{formatDuration(p.craft.duration)}</td>
                  <td className="num">
                    {p.cost !== null ? (
                      formatRub(p.cost)
                    ) : (
                      <span className="muted small">
                        Can&rsquo;t buy{' '}
                        {p.unbuyable.map((id) => items.get(id)?.shortName ?? 'an item').join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="num">{money(p.value)}</td>
                  <td className={`num ${p.profit !== null ? (p.profit > 0 ? 'gain' : 'loss') : ''}`}>
                    {money(p.profit)}
                  </td>
                  <td className={`num strong ${p.perHour !== null ? (p.perHour > 0 ? 'gain' : 'loss') : ''}`}>
                    {money(p.perHour)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
