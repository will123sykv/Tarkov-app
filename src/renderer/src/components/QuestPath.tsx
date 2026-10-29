import { useMemo, useState } from 'react'
import { pathScores, type PathTarget } from '../../../shared/questProgress'
import type { Quest, QuestTrader } from '../../../shared/questTypes'
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
  lockText,
  filter,
  note,
  blocked
}: {
  rows: readonly QuestRow[]
  traders: readonly QuestTrader[]
  selected: string | null
  onSelect: (id: string) => void
  /** Why a quest can't be taken yet (empty when it can). */
  lockText: (row: QuestRow) => string
  /** The quest list's sidebar filters (since 1.68.0): only the quests listed, not what's counted. */
  filter: (row: QuestRow) => boolean
  /** Says what the sidebar filters by. */
  note: React.ReactNode
  /** Held up by a key the player doesn't have (with Only quests I can do), to say how many. */
  blocked?: (quest: Quest) => boolean
}): React.JSX.Element {
  const [target, setTarget] = useState<PathTarget>('kappa')
  // Every quest of the kind shown counts, as the Quests header has it (since 1.71.0).
  const scores = useMemo(() => pathScores(rows, target, blocked), [rows, target, blocked])
  // Counted over every quest of the kind shown, so the numbers stay true; listed as the sidebar says.
  const listed = useMemo(() => scores.rows.filter(filter), [scores.rows, filter])
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
          {scores.blocked > 0 && ` · ${scores.blocked} held up by keys you don’t have`}
        </span>
      </div>
      <p className="hint quest-list-note">
        Quests you can do now, or once you level up, by how many of the {label} quests left each one is or
        leads to. Click one to open it.
      </p>
      <p className="quest-list-note">{note}</p>
      {listed.length === 0 ? (
        <div className="empty">
          <p>
            {scores.rows.length
              ? 'No quests match the filters on the left.'
              : scores.left
                ? `Nothing you can take now leads to a ${label} quest.`
                : `Every ${label} quest is done.`}
          </p>
        </div>
      ) : (
        <ul>
          {listed.map((r) => {
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
