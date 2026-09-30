import { hasOwnPriceData } from '../../../shared/gameModes'
import type { GameMode, PriceState } from '../../../shared/types'
import { formatAgo } from '../lib/format'
import { useNow } from '../lib/useNow'

interface Props {
  gameMode: GameMode
  priceState: PriceState | null
}

export default function ModeBanner({ gameMode, priceState }: Props): React.JSX.Element {
  const now = useNow(30_000)
  const banners: { tone: 'warn' | 'error' | 'info'; text: string }[] = []

  if (!hasOwnPriceData(gameMode)) {
    banners.push({
      tone: 'warn',
      text: "PvP Season prices aren't available from tarkov.dev, so these are PvP prices. The Season economy is separate, so real values may differ."
    })
  }

  const dataset = priceState?.dataset
  if (priceState?.error && dataset && priceState.fromCache) {
    banners.push({
      tone: 'error',
      text: `Couldn't refresh prices (${priceState.error}). Showing cached prices from ${formatAgo(dataset.fetchedAt, now)}.`
    })
  } else if (priceState?.error && dataset?.source === 'tarkov-market') {
    banners.push({
      tone: 'info',
      text: `tarkov.dev is unavailable, so prices come from tarkov-market (${priceState.error}).`
    })
  }

  // Always rendered (empty when there's nothing to say) so the app's grid rows stay in order.
  return (
    <div className="banners">
      {banners.map((b) => (
        <div key={b.text} className={`banner ${b.tone}`} role="status">
          {b.text}
        </div>
      ))}
    </div>
  )
}
