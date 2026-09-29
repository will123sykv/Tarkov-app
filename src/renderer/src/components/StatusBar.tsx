import type { PriceState } from '../../../shared/types'
import { formatAgo, formatCountdown } from '../lib/format'
import { useNow } from '../lib/useNow'

interface Props {
  priceState: PriceState | null
  /** Items listed in the current view; null in views that don't list items. */
  shown: number | null
  total: number
  playerLevel: number
}

export default function StatusBar({ priceState, shown, total, playerLevel }: Props): React.JSX.Element {
  const now = useNow(1000)
  const dataset = priceState?.dataset

  let prices = 'No prices loaded'
  if (dataset) {
    prices = `Prices: ${dataset.source} · updated ${formatAgo(dataset.fetchedAt, now)}`
    if (priceState?.fromCache) prices += ' · offline cache'
  }

  let refresh = ''
  if (priceState?.refreshing) refresh = 'Refreshing…'
  else if (priceState?.nextRefreshAt)
    refresh = `Next refresh in ${formatCountdown(priceState.nextRefreshAt - now)}`

  return (
    <footer className="statusbar">
      <span>{prices}</span>
      <span>
        {shown !== null && `${shown.toLocaleString()} of ${total.toLocaleString()} items · `}level{' '}
        {playerLevel}
      </span>
      <span>{refresh}</span>
    </footer>
  )
}
