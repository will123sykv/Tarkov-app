import {
  lockReasons,
  requirementLabels,
  type ProgressEntry,
  type QuestContext,
  type QuestProgress
} from '../../../shared/questProgress'
import type { GameMap, Quest, QuestObjective } from '../../../shared/questTypes'
import type { PriceState } from '../../../shared/types'
import { formatAgo } from '../lib/format'
import { objectiveMap, STATUS_BADGE, STATUS_LABEL } from '../lib/questUi'
import { useItemLookup } from '../lib/useItemLookup'
import { useNow } from '../lib/useNow'
import { useStore } from '../store'
import type { QuestRow } from '../lib/useQuestRows'

interface Props {
  row: QuestRow
  progress: QuestProgress
  ctx: QuestContext
  questsById: ReadonlyMap<string, Quest>
  mapsById: ReadonlyMap<string, GameMap>
  traders: { id: string; name: string }[]
  priceState: PriceState | null
}

const SET_STATUSES: { status: ProgressEntry['status'] | null; label: string }[] = [
  { status: null, label: 'Not started' },
  { status: 'active', label: 'Active' },
  { status: 'completed', label: 'Completed' },
  { status: 'failed', label: 'Failed' }
]

function Objective({
  quest,
  objective,
  mapsById,
  items
}: {
  quest: Quest
  objective: QuestObjective
  mapsById: ReadonlyMap<string, GameMap>
  items: ReturnType<typeof useItemLookup>
}): React.JSX.Element {
  const showOnMap = useStore((s) => s.showOnMap)
  const onMap = objectiveMap(objective, mapsById)
  const mapNames = objective.maps.map((id) => mapsById.get(id)?.name).filter(Boolean)
  const single = objective.items.length === 1 ? items.get(objective.items[0]) : undefined
  return (
    <li className="objective">
      <div>
        {objective.description || objective.type}
        {objective.optional && <span className="tag">optional</span>}
        {objective.foundInRaid && objective.items.length > 0 && (
          <span className="tag fir">found in raid</span>
        )}
      </div>
      {single && (
        <div className="objective-item">
          {single.iconLink && <img src={single.iconLink} alt="" loading="lazy" />}
          <span>
            {objective.count && objective.count > 1 ? `${objective.count} × ` : ''}
            {single.name}
          </span>
        </div>
      )}
      {objective.items.length > 1 && (
        <details>
          <summary>
            Any of {objective.items.length} items
            {objective.count && objective.count > 1 ? ` (${objective.count} needed)` : ''}
          </summary>
          <ul className="any-of">
            {objective.items.map((id) => (
              <li key={id}>{items.get(id)?.name ?? id}</li>
            ))}
          </ul>
        </details>
      )}
      {objective.questItem && <div className="objective-item">Quest item: {objective.questItem.name}</div>}
      <div className="objective-meta">
        {mapNames.length > 0 && <span className="muted">{mapNames.join(', ')}</span>}
        {onMap && (
          <button
            className="link"
            onClick={() => void showOnMap(quest.id, objective.id, onMap.normalizedName)}
          >
            Show on map
          </button>
        )}
      </div>
    </li>
  )
}

/** A quest's details: status (settable by hand), what unlocks it, and its objectives. */
export default function QuestDetail({
  row,
  progress,
  ctx,
  questsById,
  mapsById,
  traders,
  priceState
}: Props): React.JSX.Element {
  const { quest, status } = row
  const setQuestStatus = useStore((s) => s.setQuestStatus)
  const markQuestsUpTo = useStore((s) => s.markQuestsUpTo)
  const selectQuest = useStore((s) => s.selectQuest)
  const items = useItemLookup(priceState)
  const now = useNow(60_000)
  const entry = progress[quest.id]
  const reasons = status === 'locked' ? lockReasons(quest, progress, ctx, questsById) : []
  const unlocks = [...questsById.values()].filter((q) => q.requires.some((r) => r.questId === quest.id))
  const trader = traders.find((t) => t.id === quest.traderId)?.name ?? 'Unknown trader'
  const requirements = requirementLabels(quest, questsById, ctx.traders)
  const questLink = (q: Quest | undefined, fallback: string): React.JSX.Element =>
    q ? (
      <button className="link" onClick={() => selectQuest(q.id)}>
        {q.name}
      </button>
    ) : (
      <span className="muted">{fallback}</span>
    )

  return (
    <aside className="quest-detail" aria-label={`${quest.name} details`}>
      <header>
        <div>
          <strong>{quest.name}</strong>
          <span className="muted">
            {[trader, ...requirements].join(' · ')}
            {quest.faction !== 'Any' && ` · ${quest.faction} only`}
            {quest.kappaRequired && ' · Kappa'}
            {quest.lightkeeperRequired && ' · Lightkeeper'}
          </span>
        </div>
        <button className="button icon" onClick={() => selectQuest(null)} aria-label="Close details">
          ✕
        </button>
      </header>

      <div className="quest-status">
        <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
        <span className="muted">
          {entry
            ? `${entry.source === 'log' ? 'From the game’s logs' : 'Set by hand'}, ${formatAgo(entry.at, now)}`
            : 'Not started yet'}
        </span>
      </div>
      <div className="mini-toggle wide" role="radiogroup" aria-label="Set status">
        {SET_STATUSES.map(({ status: s, label }) => {
          const current = (entry?.status ?? null) === s
          return (
            <button
              key={label}
              role="radio"
              aria-checked={current}
              className={current ? 'active' : ''}
              onClick={() => void setQuestStatus(quest.id, s)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <button className="button small" onClick={() => void markQuestsUpTo(quest.id)}>
        Mark this and everything before it done
      </button>

      {reasons.length > 0 && (
        <ul className="lock-reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {quest.requires.length > 0 && (
        <p className="quest-links">
          <span className="muted">After: </span>
          {quest.requires.map((r, i) => (
            <span key={r.questId}>
              {i > 0 && ', '}
              {questLink(questsById.get(r.questId), 'an unknown quest')}
              {!r.status.includes('complete') && <span className="muted"> ({r.status.join(' or ')})</span>}
            </span>
          ))}
        </p>
      )}
      {unlocks.length > 0 && (
        <p className="quest-links">
          <span className="muted">Unlocks: </span>
          {unlocks.map((q, i) => (
            <span key={q.id}>
              {i > 0 && ', '}
              {questLink(q, q.name)}
            </span>
          ))}
        </p>
      )}

      <h4>Objectives</h4>
      <ol className="objectives">
        {quest.objectives.map((o) => (
          <Objective key={o.id} quest={quest} objective={o} mapsById={mapsById} items={items} />
        ))}
      </ol>
      {quest.wikiLink && (
        <a className="wiki-link" href={quest.wikiLink} target="_blank" rel="noreferrer">
          Open on the wiki ↗
        </a>
      )}
    </aside>
  )
}
