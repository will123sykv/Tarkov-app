import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCraftNotifier } from '../src/main/craftTimers'
import { createPlayerStore } from '../src/main/quests/playerStore'
import { sanitizeCraftTimers, shiftedTimer, withTimer, type CraftTimer } from '../src/shared/craftTimers'
import {
  craftResources,
  FUEL_PER_HOUR,
  FUEL_TANKS,
  unitCost,
  WATER_FILTER_PER_HOUR,
  WATER_FILTERS
} from '../src/shared/hideoutResources'
import { tempDir } from './helpers'

const timer = (stationId: string, endsAt: number, extra: Partial<CraftTimer> = {}): CraftTimer => ({
  stationId,
  craftId: `${stationId}-craft`,
  label: `Something at the ${stationId}`,
  startedAt: 0,
  endsAt,
  notified: false,
  ...extra
})

describe('fuel and water filter a craft burns (since 1.66.0)', () => {
  // Metal tank ₽200,000 for 100 units, Expeditionary ₽90,000 for 60: the metal one is cheaper a unit.
  const prices: Record<string, number> = {
    '5d1b36a186f7742523398433': 200_000,
    '5d1b371186f774253763a656': 90_000,
    '5d1b385e86f774252167b98a': 50_000
  }
  const fuelUnit = unitCost(FUEL_TANKS, (id) => prices[id] ?? null)!
  const filterUnit = unitCost(WATER_FILTERS, (id) => prices[id] ?? null)!

  it('prices a unit at the cheapest tank or filter, by what it holds', () => {
    expect(fuelUnit).toBe(1_500)
    expect(filterUnit).toBe(500)
    expect(unitCost(FUEL_TANKS, () => null)).toBeNull()
  })

  it('charges powered stations fuel for the craft’s hours, halved with Solar Power', () => {
    const craft = { duration: 3600 * 2, inputs: [] }
    const workbench = { normalizedName: 'workbench' }
    expect(craftResources(craft, workbench, false, fuelUnit, filterUnit)).toEqual({
      fuel: 2 * FUEL_PER_HOUR * 1_500,
      filter: 0
    })
    expect(craftResources(craft, workbench, true, fuelUnit, filterUnit).fuel).toBe(FUEL_PER_HOUR * 1_500)
    expect(craftResources(craft, { normalizedName: 'scav-case' }, false, fuelUnit, filterUnit)).toEqual({
      fuel: 0,
      filter: 0
    })
    expect(craftResources(craft, workbench, false, null, filterUnit).fuel).toBeNull()
  })

  it('charges the Water Collector its filter, unless the craft already uses one', () => {
    const water = { normalizedName: 'water-collector' }
    expect(craftResources({ duration: 3600, inputs: [] }, water, false, fuelUnit, filterUnit).filter).toBe(
      WATER_FILTER_PER_HOUR * 500
    )
    const withFilter = { duration: 3600, inputs: [{ itemId: '5d1b385e86f774252167b98a', count: 1 }] }
    expect(craftResources(withFilter, water, false, fuelUnit, filterUnit).filter).toBe(0)
  })
})

describe('craft timers (since 1.66.0)', () => {
  it('keeps one timer per station, soonest first, and drops bad ones', () => {
    expect(
      sanitizeCraftTimers([
        timer('a', 50),
        timer('b', 20),
        timer('a', 30),
        { stationId: 'bad id!' },
        null
      ]).map((t) => [t.stationId, t.endsAt])
    ).toEqual([
      ['b', 20],
      ['a', 30]
    ])
    expect(withTimer([timer('a', 50)], timer('a', 10)).map((t) => t.endsAt)).toEqual([10])
  })

  it('saves timers per game mode, clears one, and marks them notified', async () => {
    const file = join(await tempDir(), 'player.json')
    const store = createPlayerStore({ file })
    await store.startCraft('pvp', timer('booze', 100))
    await store.startCraft('pvp', timer('med', 50))
    expect(await store.crafts('pve')).toEqual([])
    await store.markCraftsNotified('pvp', ['med'])
    const again = createPlayerStore({ file })
    expect((await again.crafts('pvp')).map((t) => [t.stationId, t.notified])).toEqual([
      ['med', true],
      ['booze', false]
    ])
    expect((await again.clearCraft('pvp', 'med')).map((t) => t.stationId)).toEqual(['booze'])
  })

  it('moves a timer on or back, never to before now, to be said again later (since 1.71.0)', async () => {
    const timers = [timer('a', 10_000, { startedAt: 1_000 }), timer('b', 2_000, { notified: true })]
    expect(shiftedTimer(timers, 'a', -300_000, 5_000)[0]).toMatchObject({ endsAt: 5_000, notified: false })
    expect(shiftedTimer(timers, 'a', 300_000, 5_000)[0].endsAt).toBe(310_000)
    // A craft said done, moved later: not done any more.
    expect(shiftedTimer(timers, 'b', 300_000, 5_000)[1]).toMatchObject({ endsAt: 302_000, notified: false })
    expect(shiftedTimer(timers, 'b', -300_000, 5_000)[1]).toMatchObject({ endsAt: 5_000, notified: true })

    const file = join(await tempDir(), 'player.json')
    let now = 1_000
    const store = createPlayerStore({ file, now: () => now })
    await store.startCraft('pvp', timer('booze', 600_000))
    await store.startCraft('pvp', timer('med', 500_000))
    now = 2_000
    // Soonest first, after the move.
    expect((await store.shiftCraft('pvp', 'med', 300_000)).map((t) => [t.stationId, t.endsAt])).toEqual([
      ['booze', 600_000],
      ['med', 800_000]
    ])
  })

  it('says each craft once when it’s done, and waits for the next', async () => {
    let now = 1_000
    let saved: CraftTimer[] = [
      timer('done-while-closed', 500),
      timer('next', 5_000),
      timer('said', 100, { notified: true })
    ]
    const said: string[][] = []
    const waits: number[] = []
    let pending: (() => void) | null = null
    const notifier = createCraftNotifier({
      timers: async () => [{ mode: 'pvp', timers: saved }],
      markNotified: async (_mode, ids) => {
        saved = saved.map((t) => (ids.includes(t.stationId) ? { ...t, notified: true } : t))
      },
      notify: (done) => said.push(done.map((t) => t.stationId)),
      isEnabled: () => true,
      now: () => now,
      setTimer: (fn, ms) => {
        waits.push(ms)
        pending = fn
        return 1
      },
      clearTimer: () => {}
    })
    await notifier.reschedule()
    expect(said).toEqual([['done-while-closed']])
    expect(waits).toEqual([4_500])
    now = 5_100
    pending!()
    await notifier.reschedule()
    expect(said).toEqual([['done-while-closed'], ['next']])
  })

  it('marks crafts done without a notification when they’re turned off', async () => {
    let saved = [timer('a', 10)]
    const said: unknown[] = []
    const notifier = createCraftNotifier({
      timers: async () => [{ mode: 'pvp', timers: saved }],
      markNotified: async () => {
        saved = saved.map((t) => ({ ...t, notified: true }))
      },
      notify: (done) => said.push(done),
      isEnabled: () => false,
      now: () => 100,
      setTimer: () => 1,
      clearTimer: () => {}
    })
    await notifier.reschedule()
    expect(said).toEqual([])
    expect(saved[0].notified).toBe(true)
  })
})
