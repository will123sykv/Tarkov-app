import type { PriceState } from '../../../shared/types'
import { formatAgo, formatCountdown } from '../lib/format'
import { useNow } from '../lib/useNow'
import { useStore } from '../store'
import SettingsLink from './SettingsLink'

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

  // Raids and quests come from the game's logs: say when they can't be read, not only in Settings
  // (since 1.70.0).
  const logStatus = useStore((s) => s.logStatus)
  const logsProblem =
    logStatus?.state === 'not-found'
      ? 'Game logs not found: raids and quests aren’t being tracked'
      : logStatus?.state === 'error'
        ? `Couldn’t read the game’s logs${logStatus.error ? `: ${logStatus.error}` : ''}`
        : null

  // Fixed cells, so the level and the countdown keep their place and size whatever the view, the
  // time or the prices line say; the prices line gives way (with an ellipsis) when space is short.
  return (
    <footer className="statusbar">
      <span className="statusbar-prices" title={logsProblem ? `${prices}\n${logsProblem}` : prices}>
        {prices}
        {logsProblem && (
          <>
            {' · '}
            <span className="statusbar-warn">{logsProblem}</span> <SettingsLink section="logs" />
          </>
        )}
      </span>
      <span className="statusbar-count">
        {shown !== null && `${shown.toLocaleString()} of ${total.toLocaleString()} items`}
      </span>
      <span className="statusbar-level">level {playerLevel}</span>
      <span className="statusbar-refresh">{refresh}</span>
    </footer>
  )
}
