// The time of day in raid. Tarkov's clock runs 7 times as fast as real time, set to Moscow time
// (UTC+3), and every raid starts at one of two times 12 hours apart (the formula tarkov.dev uses).

export interface RaidTime {
  hours: number
  minutes: number
}

export type RaidPhase = 'night' | 'dawn' | 'day' | 'dusk'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const RATIO = 7
const MOSCOW = 3 * HOUR

const toTime = (ms: number): RaidTime => {
  const inDay = ((ms % DAY) + DAY) % DAY
  return { hours: Math.floor(inDay / HOUR), minutes: Math.floor((inDay % HOUR) / 60_000) }
}

/** The two times a raid can start at right now: the first, and the one 12 hours on from it. */
export function raidTimes(nowMs: number): [RaidTime, RaidTime] {
  const first = MOSCOW + nowMs * RATIO
  return [toTime(first), toTime(first + 12 * HOUR)]
}

/** "22:28". */
export const formatRaidTime = ({ hours, minutes }: RaidTime): string =>
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

/**
 * How light it is in raid, from 0 (dark) to 1 (full day): dark from 22:00 to 04:00, getting light until
 * 07:00, day until 19:00, then getting dark again.
 */
export function lightLevel({ hours, minutes }: RaidTime): number {
  const t = hours + minutes / 60
  if (t < 4 || t >= 22) return 0
  if (t < 7) return (t - 4) / 3
  if (t < 19) return 1
  return (22 - t) / 3
}

export function phaseOf(time: RaidTime): RaidPhase {
  const level = lightLevel(time)
  if (level === 0) return 'night'
  if (level === 1) return 'day'
  return time.hours < 12 ? 'dawn' : 'dusk'
}
