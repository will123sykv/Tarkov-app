import type { RankedContainer } from '../../../shared/containerValue'
import { formatPercent, formatRub } from '../lib/format'

interface Props {
  selected: RankedContainer | null
  mapName: string | null
  /** Name of the remembered container when it doesn't appear on the selected map. */
  unavailableContainer: string | null
  pricesLoaded: boolean
}

export default function ContainerSummary({
  selected,
  mapName,
  unavailableContainer,
  pricesLoaded
}: Props): React.JSX.Element | null {
  if (unavailableContainer) {
    return (
      <div className="summary muted">
        {unavailableContainer} doesn't appear on {mapName ?? 'this map'}, so every item is shown. Pick another
        container or map.
      </div>
    )
  }
  if (!selected) return null

  const { loot, value } = selected
  const unpriced = 1 - value.pricedShare
  return (
    <div className="summary">
      <div className="summary-title">
        <strong>{loot.name}</strong>
        <span className="muted">{mapName ?? 'All maps'}</span>
      </div>
      <div className="summary-stats">
        <span>
          <b>{pricesLoaded ? formatRub(value.average) : '—'}</b> average per search
        </span>
        <span>~{loot.expectedCount.toFixed(1)} items per search</span>
        {value.best && (
          <span>
            Biggest contributor: <b>{value.best.item.name}</b> ({formatRub(value.best.contribution)} per
            search)
          </span>
        )}
        {pricesLoaded && unpriced > 0.05 && (
          <span className="muted">{formatPercent(unpriced)} of its loot has no known price</span>
        )}
      </div>
    </div>
  )
}
