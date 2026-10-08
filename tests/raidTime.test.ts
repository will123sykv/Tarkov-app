import { describe, expect, it } from 'vitest'
import { formatRaidTime, lightLevel, phaseOf, raidTimes } from '../src/shared/raidTime'

describe('raidTimes', () => {
  it('runs 7 times as fast as real time, from Moscow time, with the second time 12 hours on', () => {
    // At the epoch it's 03:00 in Moscow, so 03:00 and 15:00 in raid.
    expect(raidTimes(0).map(formatRaidTime)).toEqual(['03:00', '15:00'])
    // A real minute later, 7 minutes have passed in raid.
    expect(raidTimes(60_000).map(formatRaidTime)).toEqual(['03:07', '15:07'])
    // A real 2 hours later: 14 hours on, round the clock.
    expect(raidTimes(2 * 3_600_000).map(formatRaidTime)).toEqual(['17:00', '05:00'])
  })

  it('always gives two times 12 hours apart', () => {
    for (const ms of [1_728_380_000_000, 1_791_000_123_456, 5_000]) {
      const [a, b] = raidTimes(ms)
      expect((b.hours * 60 + b.minutes - (a.hours * 60 + a.minutes) + 1440) % 1440).toBe(720)
    }
  })
})

describe('how light it is', () => {
  it('is dark at night, light by day, and in between at dawn and dusk', () => {
    expect(lightLevel({ hours: 22, minutes: 28 })).toBe(0)
    expect(lightLevel({ hours: 3, minutes: 59 })).toBe(0)
    expect(lightLevel({ hours: 5, minutes: 30 })).toBe(0.5)
    expect(lightLevel({ hours: 10, minutes: 28 })).toBe(1)
    expect(lightLevel({ hours: 20, minutes: 30 })).toBe(0.5)
    expect(
      ['22:28', '05:30', '10:28', '20:30'].map((t) => {
        const [hours, minutes] = t.split(':').map(Number)
        return phaseOf({ hours, minutes })
      })
    ).toEqual(['night', 'dawn', 'day', 'dusk'])
  })
})
