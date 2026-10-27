import { useEffect, useState } from 'react'
import { EMPTY_CRAFT_TIMERS } from '../../../shared/craftTimers'
import type { GameMode } from '../../../shared/types'
import { formatDuration } from '../lib/format'
import { useStore } from '../store'

/**
 * The crafts put on with Started, counting down (since 1.66.0): Ready when done, and Collected to clear
 * one. A Windows notification says when each is done (Settings › Hideout crafting).
 */
export default function CraftTimers({ gameMode }: { gameMode: GameMode }): React.JSX.Element | null {
  const timers = useStore((s) => s.craftTimers[gameMode]) ?? EMPTY_CRAFT_TIMERS
  const clear = useStore((s) => s.clearCraftTimer)
  // Ticks to count down; the time itself is read at each render, so a change shows straight away.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!timers.length) return
    const id = setInterval(() => setTick((n) => n + 1), 15_000)
    return () => clearInterval(id)
  }, [timers.length])
  if (!timers.length) return null
  const now = Date.now()
  return (
    <section className="craft-timers" aria-label="Crafting now">
      <h3>Crafting now</h3>
      <ul>
        {timers.map((t) => {
          const left = Math.max(0, Math.ceil((t.endsAt - now) / 1000))
          const ready = left === 0
          return (
            <li key={t.stationId} className={ready ? 'ready' : ''}>
              <span className="craft-timer-label">{t.label}</span>
              {ready ? (
                <span className="badge ok">Ready</span>
              ) : (
                <span className="muted" title={`Done at ${new Date(t.endsAt).toLocaleTimeString()}`}>
                  {left < 60 ? 'under 1 min' : formatDuration(left)} left
                </span>
              )}
              <button
                className="link small"
                title={ready ? 'Taken out of the station' : 'Stop timing it'}
                onClick={() => void clear(t.stationId)}
              >
                {ready ? 'Collected' : 'Cancel'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
