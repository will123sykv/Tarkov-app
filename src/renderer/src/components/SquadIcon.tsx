import { SQUAD_TITLE } from '../../../shared/squad'
import { SQUAD_ICON } from '../lib/questPins'

/** Marks an objective a squad can help with: their progress counts for everyone in the group. */
export default function SquadIcon({ title = SQUAD_TITLE }: { title?: string }): React.JSX.Element {
  return (
    <span className="squad-icon" title={title} role="img" aria-label="Your squad can help">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={SQUAD_ICON} />
      </svg>
    </span>
  )
}
