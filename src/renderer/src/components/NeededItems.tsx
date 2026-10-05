import { useMemo, useState } from 'react'
import { howToGet } from '../../../shared/hideout'
import { neededItems, type ObjectiveProgress } from '../../../shared/questProgress'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { useItemLookup } from '../lib/useItemLookup'
import { useBuyContext, useCraftContext } from '../lib/useKeepList'
import { useStore } from '../store'
import type { QuestRow } from '../lib/useQuestRows'
import { GetCell } from './GetCell'

/** Items still to hand over or plant for active (and optionally available) quests. */
export default function NeededItems({
  rows,
  objectives,
  settings,
  priceState
}: {
  rows: QuestRow[]
  /** How far along each objective is (hand-overs already made aren't needed). */
  objectives: ObjectiveProgress
  settings: PublicSettings
  priceState: PriceState | null
}) {
  const [includeAvailable, setIncludeAvailable] = useState(false)
  const selectQuest = useStore((s) => s.selectQuest)
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(settings, priceState)
  const cc = useCraftContext(settings, priceState)
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
              <th
                className="num"
                title={
                  'The cheapest way to get one now: buy it or, when it must be found in raid (bought items ' +
                  'never are), craft it in the hideout (crafted ones are) or find it'
                }
              >
                Buy or craft
              </th>
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
                  <td className="num">
                    <GetCell
                      get={howToGet(
                        {
                          itemId: n.itemId,
                          needed: n.count,
                          missing: n.count,
                          firNeeded: n.foundInRaid ? n.count : 0
                        },
                        cc,
                        ctx
                      )}
                      items={items}
                    />
                  </td>
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
