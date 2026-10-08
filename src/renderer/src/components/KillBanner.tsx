import { shortObjective, type KillToDo } from '../../../shared/todo'

/**
 * The kill objectives left on the map shown, and the ones that count on any map, in a strip over the top
 * of the map: most have no place to pin, so they'd be out of sight otherwise. Nothing when there are none.
 */
export default function KillBanner({
  kills,
  mapNames,
  open,
  onToggle,
  onSelectQuest
}: {
  kills: readonly KillToDo[]
  /** The names of the map shown, taken off the objectives' text ("…on Woods"). */
  mapNames: readonly string[]
  open: boolean
  onToggle: () => void
  onSelectQuest: (questId: string) => void
}): React.JSX.Element | null {
  if (!kills.length) return null
  const anyMap = kills.filter((k) => k.anyMap).length
  const here = kills.length - anyMap
  const counts = [
    here ? `${here} kill objective${here === 1 ? '' : 's'} here` : null,
    anyMap ? `${anyMap} on any map` : null
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <aside className={`kill-banner${open ? '' : ' closed'}`} aria-label="Kill objectives">
      <button
        className="kill-banner-head"
        aria-expanded={open}
        title={open ? 'Fold the kill objectives away' : 'Show the kill objectives left'}
        onClick={onToggle}
      >
        <span className="kill-banner-icon" aria-hidden>
          ☠
        </span>
        <span>{counts}</span>
        <span className="kill-banner-fold" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ul className="kill-banner-list">
          {kills.map(({ quest, objective, done, total, anyMap }) => (
            <li key={`${quest.id}/${objective.id}`}>
              <button
                className="link kill-banner-quest"
                title="Open this quest"
                onClick={() => onSelectQuest(quest.id)}
              >
                {quest.name}
              </button>
              <span className="kill-banner-text">
                {anyMap ? objective.description : shortObjective(objective.description, mapNames)}
                {anyMap && <span className="tag">any map</span>}
              </span>
              <span className="kill-banner-count" title={`${done} of ${total} done`}>
                {done} / {total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
