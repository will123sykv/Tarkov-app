import { describe, expect, it } from 'vitest'
import { AFTER_RAID_WINDOW_MS, raidsToAsk } from '../src/main/logs/afterRaid'
import type { LogEvent } from '../src/main/logs/interpret'
import type { RaidRecord } from '../src/shared/logTypes'

const NOW = 1_800_000_000_000
const raid = (extra: Partial<RaidRecord> = {}): LogEvent => ({
  kind: 'raid',
  mode: 'pvp',
  raid: {
    map: 'bigmap',
    raidId: 'ABC123',
    side: 'pmc',
    online: true,
    queueSeconds: 30,
    loadSeconds: 20,
    foundAt: NOW - 40 * 60_000,
    startedAt: NOW - 38 * 60_000,
    endedAt: NOW - 2 * 60_000,
    ...extra
  }
})

describe('asking what got done after a raid (since 1.66.0)', () => {
  it('asks about a PMC raid that just ended, once', () => {
    const asked = new Set<string>()
    expect(raidsToAsk([raid()], NOW, false, asked).map((r) => [r.gameMode, r.raid.map])).toEqual([
      ['pvp', 'bigmap']
    ])
    expect(raidsToAsk([raid()], NOW, false, asked)).toEqual([])
  })

  it('leaves out scav raids, raids that never started or ended, and old ones', () => {
    const events = [
      raid({ side: 'scav' }),
      raid({ startedAt: null, foundAt: 1 }),
      raid({ endedAt: null, foundAt: 2 }),
      raid({ endedAt: NOW - AFTER_RAID_WINDOW_MS - 1, foundAt: 3 })
    ]
    expect(raidsToAsk(events, NOW, false, new Set())).toEqual([])
  })

  it('never asks while the logs are read again from scratch', () => {
    expect(raidsToAsk([raid()], NOW, true, new Set())).toEqual([])
  })

  it('asks about the newest raid of each game mode', () => {
    const events = [
      raid({ map: 'woods', endedAt: NOW - 10 * 60_000, foundAt: 1 }),
      raid({ map: 'factory4_day', foundAt: 2 }),
      { ...raid({ map: 'shoreline', foundAt: 3 }), mode: 'pve' } as LogEvent
    ]
    expect(raidsToAsk(events, NOW, false, new Set()).map((r) => [r.gameMode, r.raid.map])).toEqual([
      ['pvp', 'factory4_day'],
      ['pve', 'shoreline']
    ])
  })
})
