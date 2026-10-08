import { formatRaidTime, lightLevel, phaseOf, raidTimes, type RaidTime } from '../../../shared/raidTime'
import { useNow } from '../lib/useNow'

// Night and day colours of the clock's disc; dawn and dusk blend between them.
const NIGHT: [number, number, number] = [31, 74, 84]
const DAY: [number, number, number] = [245, 192, 74]

const mix = (level: number): string =>
  `rgb(${NIGHT.map((n, i) => Math.round(n + (DAY[i] - n) * level)).join(', ')})`

/** A moon when it's dark in raid, a sun when it's light, and in between at dawn and dusk. */
function SkyIcon({ time }: { time: RaidTime }): React.JSX.Element {
  const level = lightLevel(time)
  return (
    <svg className="raid-sky" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      {level > 0 && <circle cx="8" cy="8" r="7.5" fill={mix(level)} opacity={0.25 * level} />}
      <circle cx="8" cy="8" r="6" fill={mix(level)} />
      {/* The moon's crescent: lit on one side, fading as it gets light. */}
      {level < 1 && (
        <path d="M8 2a6 6 0 0 1 0 12a4.5 6 0 0 0 0-12z" fill="#7fb3bd" opacity={0.55 * (1 - level)} />
      )}
    </svg>
  )
}

/** The two times a raid can start at right now, and how dark it is at each. */
export default function RaidClock(): React.JSX.Element {
  const times = raidTimes(useNow(1000))
  const text = times.map((t) => `${formatRaidTime(t)} (${phaseOf(t)})`).join(' and ')
  return (
    <div
      className="raid-clock"
      title={`In raid now: ${text}. Every raid starts at one of these two times; Factory has its own day and night versions.`}
      aria-label={`In-raid time: ${text}`}
    >
      {times.map((t, i) => (
        <span key={i} className="raid-clock-row">
          <SkyIcon time={t} />
          <span>{formatRaidTime(t)}</span>
        </span>
      ))}
    </div>
  )
}
