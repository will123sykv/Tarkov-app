import { useLayoutEffect, useRef, useState } from 'react'
import type { RankedContainer } from '../../../shared/containerValue'
import { containerImage } from '../lib/containerImages'
import { formatRub } from '../lib/format'

interface Props {
  container: RankedContainer
  mapCount: number
  pricesLoaded: boolean
  /** Viewport position of the hovered row: its top edge and the sidebar's right edge. */
  anchor: { top: number; left: number }
}

const MARGIN = 8

/** Hover card beside the container list: a picture of the container and its search value. */
export default function ContainerPreview({
  container,
  mapCount,
  pricesLoaded,
  anchor
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(anchor.top)
  const { loot, value } = container
  const image = containerImage(loot.id)

  // Keep the card inside the window once its height is known (and again when the image loads).
  const place = (): void => {
    const height = ref.current?.offsetHeight ?? 0
    setTop(Math.max(MARGIN, Math.min(anchor.top - MARGIN, window.innerHeight - height - MARGIN)))
  }
  useLayoutEffect(place, [anchor.top, loot.id])

  return (
    <div
      ref={ref}
      className="container-preview"
      style={{ top, left: anchor.left + MARGIN }}
      role="tooltip"
      aria-hidden
    >
      {image ? (
        <img src={image.url} alt="" onLoad={place} />
      ) : (
        <div className="container-preview-empty">No picture available</div>
      )}
      <div className="container-preview-body">
        <strong>{loot.name}</strong>
        <span>{pricesLoaded ? `${formatRub(value.average)} average per search` : 'Prices loading…'}</span>
        <span className="muted">
          ~{loot.expectedCount.toFixed(1)} items per search · on {mapCount} map{mapCount === 1 ? '' : 's'}
        </span>
        {image && <span className="credit">Image: Tarkov wiki, {image.license}</span>}
      </div>
    </div>
  )
}
