import { useMemo, useState } from 'react'
import { pathScores, type PathTarget } from '../../../shared/questProgress'
import type { QuestTrader } from '../../../shared/questTypes'
import type { QuestRow } from '../lib/useQuestRows'
import { STATUS_BADGE, STATUS_LABEL } from '../lib/questUi'

const TARGET_LABEL: Record<PathTarget, string> = { kappa: 'Kappa', lightkeeper: 'Lightkeeper' }

/**
 * The Quests tab's Path (since 1.66.0): which quests to do next for Kappa or Lightkeeper, by how many of
 * the quests it needs that are still left each one is, or leads to.
 */
export default function QuestPath({
  rows,
  traders,
  selected,
  onSelect,
  lockText
}: {
  rows: readonly QuestRow[]
  traders: readonly QuestTrader[]
  selected: string | null
  onSelect: (id: string) => void
  /** Why a quest can't be taken yet (empty when it can). */
  lockText: (row: QuestRow) => string
}): React.JSX.Element {
  const [target, setTarget] = useState<PathTarget>('kappa')
  const scores = useMemo(() => pathScores(rows, target), [rows, target])
  const traderName = useMemo(() => new Map(traders.map((t) => [t.id, t.name])), [traders])
  const label = TARGET_LABEL[target]
  return (
    <div className="quest-list quest-path">
      <div className="quest-path-head">
        <div className="segmented small" role="radiogroup" aria-label="Which quests to count">
          {(['kappa', 'lightkeeper'] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={target === t}
              className={target === t ? 'active' : ''}
              onClick={() => setTarget(t)}
            >
              {TARGET_LABEL[t]}
            </button>
          ))}
        </div>
        <span className="muted">
          {label}: {scores.done} done · {scores.left} left
          {scores.levelOnly > 0 && ` · ${scores.levelOnly} waiting only on your level`}
        </span>
      </div>
      <p className="hint quest-list-note">
        Quests you can do now, or once you level up, by how many of the {label} quests left each one is or
        leads to. Click one to open it.
      </p>
      {scores.rows.length === 0 ? (
        <div className="empty">
          <p>
            {scores.left
              ? `Nothing you can take now leads to a ${label} quest.`
              : `Every ${label} quest is done.`}
          </p>
        </div>
      ) : (
        <ul>
          {scores.rows.map((r) => {
            const lock = r.status === 'locked' ? lockText(r) : ''
            return (
              <li key={r.quest.id} className="quest-item">
                <button
                  className={`quest-row ${r.quest.id === selected ? 'selected' : ''}`}
                  onClick={() => onSelect(r.quest.id)}
                >
                  <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  <span className="quest-name">
                    <span>{r.quest.name}</span>
                    <small>
                      {[
                        traderName.get(r.quest.traderId),
                        r.quest.minPlayerLevel > 1 ? `Level ${r.quest.minPlayerLevel}` : null,
                        lock || null
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                  <span
                    className="quest-path-count"
                    title={`${r.target ? `A ${label} quest itself. ` : ''}It leads to ${r.unlocks - (r.target ? 1 : 0)} more of the ${scores.left} ${label} quests left.`}
                  >
                    <strong>{r.unlocks}</strong>
                    <small>
                      of {scores.left} {label}
                    </small>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
