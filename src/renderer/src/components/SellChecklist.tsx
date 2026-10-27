import type { FleaFeeRates } from '../../../shared/fleaFee'
import { suggestedListPrice, traderColour, type ChecklistGroup } from '../../../shared/scavAdvice'
import type { LootItem } from '../../../shared/types'
import { formatRub } from '../lib/format'

/**
 * What to sell from a scan, as a list to tick off while selling (since 1.66.0): the flea first, with a
 * price to list each at, then each trader in their colour.
 */
export default function SellChecklist({
  groups,
  items,
  ticked,
  onTick,
  onClear,
  traderPrice,
  rates,
  left
}: {
  groups: ChecklistGroup[]
  items: ReadonlyMap<string, LootItem>
  ticked: ReadonlySet<string>
  onTick: (key: string, on: boolean) => void
  onClear: () => void
  /** What the best unlocked trader pays for one, so a listing never fetches less. */
  traderPrice: (item: LootItem) => number
  rates: FleaFeeRates | undefined
  /** Stacks to check first, which aren't listed. */
  left: number
}): React.JSX.Element {
  const all = groups.flatMap((g) => g.lines)
  const done = all.filter((l) => ticked.has(l.key))
  return (
    <div className="sell-checklist">
      <div className="sell-checklist-head">
        <strong>Sell checklist</strong>
        <span className="muted">
          {done.length} of {all.length} sold · {formatRub(done.reduce((n, l) => n + l.total, 0))} of{' '}
          {formatRub(all.reduce((n, l) => n + l.total, 0))}
          {left > 0 && ` · ${left} to check first aren’t listed`}
        </span>
        {done.length > 0 && (
          <button className="link small" onClick={onClear}>
            Untick all
          </button>
        )}
      </div>
      {groups.length === 0 && <p className="muted">Nothing to sell.</p>}
      {groups.map((g) => {
        const sold = g.lines.filter((l) => ticked.has(l.key))
        return (
          <section
            key={g.id}
            className="sell-group"
            style={g.trader ? ({ '--trader': traderColour(g.trader) } as React.CSSProperties) : undefined}
          >
            <h4>
              {g.trader && <span className="scan-trader-swatch" aria-hidden />}
              {g.trader ?? 'Flea market'}
              <span className="muted">
                {sold.length}/{g.lines.length} · {formatRub(sold.reduce((n, l) => n + l.total, 0))} of{' '}
                {formatRub(g.total)}
              </span>
            </h4>
            <ul>
              {g.lines.map((l) => {
                const item = items.get(l.itemId)
                const list =
                  g.via === 'flea' && item ? suggestedListPrice(item, traderPrice(item), rates) : null
                const on = ticked.has(l.key)
                return (
                  <li key={l.key} className={on ? 'done' : ''}>
                    <label className="check">
                      <input type="checkbox" checked={on} onChange={(e) => onTick(l.key, e.target.checked)} />
                      <span className="sell-name">
                        {item?.name ?? 'Unknown item'}
                        {l.count > 1 && <span className="muted"> ×{l.count}</span>}
                      </span>
                    </label>
                    {list && (
                      <span
                        className="sell-list-price"
                        title={[
                          `List at ${formatRub(list.price)} each: the fee is ${formatRub(list.fee)}, so you get ${formatRub(list.net)}.`,
                          list.traderFloor
                            ? 'Raised so it fetches no less than a trader pays.'
                            : 'Just under the lowest listing.',
                          list.wellUnderAverage
                            ? `The lowest listing is well under the 24-hour average (${formatRub(list.wellUnderAverage)}): it may be a bait listing, so check the flea first.`
                            : ''
                        ]
                          .filter(Boolean)
                          .join('\n')}
                      >
                        List at <strong>{formatRub(list.price)}</strong>
                        <span className="muted">
                          {' '}
                          · fee {formatRub(list.fee)} · you get {formatRub(list.net)}
                        </span>
                        {list.wellUnderAverage && <span className="badge warn rare-badge">Check price</span>}
                      </span>
                    )}
                    <span className="num">{formatRub(l.total)}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
