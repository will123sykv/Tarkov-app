import type { Scarcity } from '../../../shared/hideout'

/** Red "Rare" for items hard to get at all; amber "Can't buy yet" for what the player's level or loyalty blocks. */
export default function ScarceBadge({ scarce }: { scarce: Scarcity }): React.JSX.Element {
  return scarce.kind === 'rare' ? (
    <span className="badge bad rare-badge" title={scarce.reason}>
      Rare
    </span>
  ) : (
    <span className="badge warn rare-badge" title={scarce.reason}>
      Can&rsquo;t buy yet
    </span>
  )
}
