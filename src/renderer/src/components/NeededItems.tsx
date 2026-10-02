import { useMemo, useState } from 'react'
import { neededItems, type ObjectiveProgress } from '../../../shared/questProgress'
import type { PriceState } from '../../../shared/types'
import { formatRub } from '../lib/format'
import { useItemLookup } from '../lib/useItemLookup'
import { useStore } from '../store'
import type { QuestRow } from '../lib/useQuestRows'

/** Items still to hand over or plant for active (and optionally available) quests. */
export default function NeededItems({
  rows,
  objectives,
  priceState
}: {
  rows: QuestRow[]
  /** How far along each objective is (hand-overs already made aren't needed). */
  objectives: ObjectiveProgress
  priceState: PriceState | null
}) {
  const [includeAvailable, setIncludeAvailable] = useState(false)
  const selectQuest = useStore((s) => s.selectQuest)
  const items = useItemLookup(priceState)
  const { items: needed, anyOf } = useMemo(
    () =>
      neededItems(
        rows
          .filter((r) => r.status === 'active' || (includeAvailable && r.status === 'available'))
          .map((r) => r.quest),
        objectives
      ),
    [rows, includeAvailable, objectives]
  )

  return (
    <div className="needed-items">
      <label className="check">
        <input
          type="checkbox"
          checked={includeAvailable}
          onChange={(e) => setIncludeAvailable(e.target.checked)}
        />
        Include quests I haven&rsquo;t started yet
      </label>
      {needed.length === 0 && anyOf.length === 0 ? (
        <div className="empty">
          <p>Nothing to hand over for {includeAvailable ? 'these' : 'your active'} quests.</p>
        </div>
      ) : (
        <table className="values-table needed-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Needed</th>
              <th className="num">Flea now</th>
              <th>For</th>
            </tr>
          </thead>
          <tbody>
            {needed.map((n) => {
              const item = items.get(n.itemId)
              return (
                <tr key={`${n.itemId}:${n.foundInRaid}`}>
                  <td className="item-cell">
                    {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}
                    <span>
                      {item?.name ?? n.itemId}
                      {n.foundInRaid && <span className="tag fir">found in raid</span>}
                    </span>
                  </td>
                  <td className="num">{n.count}</td>
                  <td className="num">{item?.fleaPrice ? formatRub(item.fleaPrice) : '—'}</td>
                  <td>
                    {n.quests.map((q, i) => (
                      <span key={q.questId}>
                        {i > 0 && ', '}
                        <button className="link" onClick={() => selectQuest(q.questId)}>
                          {q.name}
                        </button>
                        {n.quests.length > 1 && <span className="muted"> ×{q.count}</span>}
                      </span>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {anyOf.length > 0 && (
        <>
          <h4>Hand over any of several items</h4>
          <ul className="any-of-list">
            {anyOf.map(({ quest, objective, count }) => (
              <li key={objective.id}>
                <strong>{quest.name}:</strong> {objective.description}{' '}
                <span className="muted">
                  ({count < (objective.count ?? 1) ? `${count} still to hand over, ` : ''}
                  {objective.items.length} accepted items)
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
