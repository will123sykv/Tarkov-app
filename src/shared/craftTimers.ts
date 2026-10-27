// Crafts put on in the game, timed so the app can say when each is done (since 1.66.0). A station runs
// one craft at a time, so a timer is kept per station.

export interface CraftTimer {
  stationId: string
  craftId: string
  /** What it says when done: "Moonshine at the Booze Generator". */
  label: string
  /** Epoch ms. */
  startedAt: number
  endsAt: number
  /** The "craft done" notification has been shown. */
  notified: boolean
}

/** A craft just put on: what's timed from now. */
export interface CraftStart {
  stationId: string
  craftId: string
  label: string
  /** How long it takes. */
  seconds: number
}

/** Longer than any craft takes (the Bitcoin farm's 40 bitcoins aside, which aren't timed). */
export const MAX_CRAFT_SECONDS = 7 * 24 * 3600

const MAX_TIMERS = 40
const MAX_LABEL = 200
const ID = /^[\w:-]{1,80}$/

export function sanitizeCraftTimer(raw: unknown): CraftTimer | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!r) return null
  const { stationId, craftId, label, startedAt, endsAt } = r
  if (typeof stationId !== 'string' || !ID.test(stationId)) return null
  if (typeof craftId !== 'string' || !ID.test(craftId)) return null
  if (typeof startedAt !== 'number' || typeof endsAt !== 'number') return null
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt < startedAt) return null
  return {
    stationId,
    craftId,
    label: typeof label === 'string' && label.trim() ? label.trim().slice(0, MAX_LABEL) : 'A craft',
    startedAt,
    endsAt,
    notified: r.notified === true
  }
}

/** Timers as saved: valid ones, one per station (the last), soonest first. */
export function sanitizeCraftTimers(raw: unknown): CraftTimer[] {
  const byStation = new Map<string, CraftTimer>()
  for (const t of Array.isArray(raw) ? raw : []) {
    const timer = sanitizeCraftTimer(t)
    if (timer) byStation.set(timer.stationId, timer)
  }
  return [...byStation.values()].sort((a, b) => a.endsAt - b.endsAt).slice(0, MAX_TIMERS)
}

/** A timer started now, in place of the station's last one. */
export function withTimer(timers: readonly CraftTimer[], timer: CraftTimer): CraftTimer[] {
  return sanitizeCraftTimers([...timers.filter((t) => t.stationId !== timer.stationId), timer])
}

export const EMPTY_CRAFT_TIMERS: readonly CraftTimer[] = []
