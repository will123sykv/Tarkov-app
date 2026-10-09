import { useState } from 'react'
import { hasOwnPriceData } from '../../../shared/gameModes'
import type { GameMode, PriceState } from '../../../shared/types'
import { friendlyError } from '../lib/errors'
import { formatAgo } from '../lib/format'
import { useNow } from '../lib/useNow'
import { useStore } from '../store'

interface Props {
  gameMode: GameMode
  priceState: PriceState | null
}

export default function ModeBanner({ gameMode, priceState }: Props): React.JSX.Element {
  const now = useNow(30_000)
  const refreshPrices = useStore((s) => s.refreshPrices)
  // Banners closed this session, by their kind and error (a new error shows again).
  const [closed, setClosed] = useState<string[]>([])
  const banners: { tone: 'warn' | 'error' | 'info'; text: string; id: string; retry?: boolean }[] = []

  if (!hasOwnPriceData(gameMode)) {
    banners.push({
      tone: 'warn',
      id: 'season',
      text: "PvP Season prices aren't available from tarkov.dev, so these are PvP prices. The Season economy is separate, so real values may differ."
    })
  }

  const dataset = priceState?.dataset
  if (priceState?.error && dataset && priceState.fromCache) {
    banners.push({
      tone: 'error',
      id: `stale:${priceState.error}`,
      text: `Couldn't refresh prices: ${friendlyError(priceState.error)}. Showing prices from ${formatAgo(dataset.fetchedAt, now)}.`,
      retry: true
    })
  } else if (priceState?.error && dataset?.source === 'tarkov-market') {
    banners.push({
      tone: 'info',
      id: `market:${priceState.error}`,
      text: `tarkov.dev is unavailable (${friendlyError(priceState.error)}), so prices come from tarkov-market.`
    })
  }

  // Always rendered (empty when there's nothing to say) so the app's grid rows stay in order.
  return (
    <div className="banners">
      {banners
        .filter((b) => !closed.includes(b.id))
        .map((b) => (
          <div key={b.id} className={`banner ${b.tone}`} role="status">
            <span className="banner-text">{b.text}</span>
            {b.retry && (
              <button
                className="link banner-action"
                disabled={priceState?.refreshing}
                onClick={() => void refreshPrices()}
              >
                {priceState?.refreshing ? 'Retrying…' : 'Retry'}
              </button>
            )}
            <button
              className="banner-close"
              title="Hide this until something changes"
              aria-label="Hide this message"
              onClick={() => setClosed((c) => [...c, b.id])}
            >
              ×
            </button>
          </div>
        ))}
    </div>
  )
}
