import type { RaidEnded } from '../../shared/logTypes'
import type { LogEvent } from './interpret'

/** How long after a raid ends it's still worth asking what got done in it. */
export const AFTER_RAID_WINDOW_MS = 15 * 60 * 1000

/**
 * The raids to ask about after they end (since 1.66.0): PMC raids that started and ended within the
 * last 15 minutes, the newest per game mode. Never when the logs are being read again from scratch, and
 * never twice for one raid (`asked` keeps the ones already asked about).
 */
export function raidsToAsk(
  events: readonly LogEvent[],
  now: number,
  reset: boolean,
  asked: Set<string>
): RaidEnded[] {
  if (reset) return []
  const newest = new Map<string, RaidEnded>()
  for (const e of events) {
    if (e.kind !== 'raid') continue
    const { raid } = e
    if (raid.side === 'scav' || !raid.startedAt || !raid.endedAt) continue
    if (now - raid.endedAt > AFTER_RAID_WINDOW_MS || raid.endedAt > now + 60_000) continue
    const key = `${e.mode}:${raid.raidId ?? ''}:${raid.foundAt}`
    if (asked.has(key)) continue
    asked.add(key)
    const before = newest.get(e.mode)
    if (!before || (before.raid.endedAt ?? 0) < raid.endedAt) newest.set(e.mode, { gameMode: e.mode, raid })
  }
  return [...newest.values()]
}
