import type { CraftTimer } from '../shared/craftTimers'
import type { GameMode } from '../shared/types'

/**
 * Says when a timed craft is done (since 1.66.0): one timeout for the next to finish, and on start the
 * ones that finished while the app was closed. Each is said once, then marked as said.
 */
export function createCraftNotifier(opts: {
  timers: () => Promise<{ mode: GameMode; timers: CraftTimer[] }[]>
  markNotified: (mode: GameMode, stationIds: string[]) => Promise<void>
  notify: (done: CraftTimer[]) => void
  isEnabled: () => boolean
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}) {
  const now = opts.now ?? Date.now
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  let handle: unknown = null
  let running: Promise<void> = Promise.resolve()

  async function check(): Promise<void> {
    if (handle !== null) clearTimer(handle)
    handle = null
    const all = await opts.timers()
    const t = now()
    const done: CraftTimer[] = []
    let next = Infinity
    for (const { mode, timers } of all) {
      const due = timers.filter((x) => !x.notified && x.endsAt <= t)
      if (due.length) {
        done.push(...due)
        await opts.markNotified(
          mode,
          due.map((x) => x.stationId)
        )
      }
      for (const x of timers) if (!x.notified && x.endsAt > t) next = Math.min(next, x.endsAt)
    }
    if (done.length && opts.isEnabled()) opts.notify(done)
    // Timeouts can't wait longer than about 24 days; check again by then.
    if (next < Infinity) handle = setTimer(() => void reschedule(), Math.min(next - t + 500, 2 ** 31 - 1))
  }

  /** Look at the timers again (after one changes): one check at a time. */
  function reschedule(): Promise<void> {
    running = running.then(check, check)
    return running
  }

  return { reschedule }
}
