import { useMemo } from 'react'
import { howToGet } from '../../../shared/hideout'
import { neededItems, type ObjectiveProgress } from '../../../shared/questProgress'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { useItemLookup } from '../lib/useItemLookup'
import { useHaveShare } from '../lib/useHaveShare'
import { useBuyContext, useCraftContext } from '../lib/useKeepList'
import { useTableSort, type SortColumn } from '../lib/useTableSort'
import { useStore } from '../store'
import type { QuestRow } from '../lib/useQuestRows'
import { GetCell, getPrice } from './GetCell'
import { SortHead } from './SortHeader'

/**
 * Items still to hand over or plant for active quests, with what's put aside
 * for them in Items to collect.
 */
export default function NeededItems({
  rows,
  objectives,
  settings,
  priceState,
  note,
  activeShown = true
}: {
  /** The quests the Quests tab's sidebar filters leave in (since 1.68.0). */
  rows: QuestRow[]
  /** How far along each objective is (hand-overs already made aren't needed). */
  objectives: ObjectiveProgress
  settings: PublicSettings
  priceState: PriceState | null
  /** Says what the sidebar filters by. */
  note?: React.ReactNode
  /** Whether Show includes Active quests (none are listed without). */
  activeShown?: boolean
}) {
  const selectQuest = useStore((s) => s.selectQuest)
  // What's put aside for each quest, shared with the hideout and other quests (since 1.66.0).
  const share = useHaveShare(settings)
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(settings, priceState)
  const cc = useCraftContext(settings, priceState)
  const { items: needed, anyOf } = useMemo(
    () =>
      neededItems(
        rows.filter((r) => r.status === 'active').map((r) => r.quest),
        objectives
      ),
    [rows, objectives]
  )
  // Each row with how to get it, worked out once for the cell and for sorting (since 1.59.0).
  const listed = useMemo(
    () =>
      needed.map((n) => {
        const got = n.quests.reduce((sum, q) => sum + share.quest(q.questId, n.itemId, n.foundInRaid), 0)
        const missing = Math.max(0, n.count - got)
        const get = howToGet(
          {
            itemId: n.itemId,
            needed: n.count,
            missing,
            firNeeded: n.foundInRaid ? n.count : 0,
            missingFir: n.foundInRaid ? missing : 0
          },
          cc,
          ctx
        )
        return { n, got, get, name: items.get(n.itemId)?.name ?? null }
      }),
    [needed, share, cc, ctx, items]
  )
  const columns = useMemo<SortColumn<(typeof listed)[number]>[]>(
    () => [
      { key: 'item', label: 'Item', value: (r) => r.name },
      {
        key: 'have',
        label: 'Have',
        num: true,
        desc: true,
        title: "What you've put aside in Items to collect",
        value: (r) => r.got
      },
      { key: 'needed', label: 'Needed', num: true, desc: true, value: (r) => r.n.count },
      {
        key: 'get',
        label: 'Buy or craft',
        num: true,
        desc: true,
        title:
          'The cheapest way to get one now: buy it or, when it must be found in raid (bought items ' +
          'never are), craft it in the hideout (crafted ones are) or find it',
        value: (r) => getPrice(r.get)
      },
      { key: 'for', label: 'For', value: (r) => r.n.quests[0]?.name ?? null }
    ],
    []
  )
  const { sort, onSort, sorted } = useTableSort('hand-over', columns)

  return (
    <div className="needed-items">
      <div className="needed-items-bar">
        <span className="hint">
          For your active quests. Have is what you&rsquo;ve put aside in Items to collect.
        </span>
        {note}
      </div>
      {needed.length === 0 && anyOf.length === 0 ? (
        <div className="empty">
          <p>
            {!activeShown
              ? 'Tick Active under Show on the left to list what your active quests need.'
              : note
                ? 'Nothing to hand over for the active quests the filters leave in.'
                : 'Nothing to hand over for your active quests.'}
          </p>
        </div>
      ) : (
        <table className="values-table needed-table">
          <SortHead columns={columns} sort={sort} onSort={onSort} />
          <tbody>
            {sorted(listed).map(({ n, got, get }) => {
              const item = items.get(n.itemId)
              return (
                <tr key={`${n.itemId}:${n.foundInRaid}`}>
                  <td className="item-cell">
                    <div className="item-cell-body">
                      {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}
                      <span>
                        {item?.name ?? n.itemId}
                        {n.foundInRaid && <span className="tag fir">found in raid</span>}
                      </span>
                    </div>
                  </td>
                  <td className={`num ${got >= n.count ? 'enough' : ''}`}>
                    {got}
                    {got >= n.count && ' ✓'}
                  </td>
                  <td className="num">{n.count}</td>
                  <td className="num">
                    <GetCell get={get} items={items} />
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
