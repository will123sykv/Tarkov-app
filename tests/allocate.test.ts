import { describe, expect, it } from 'vitest'
import {
  allocateHave,
  coveredOf,
  haveDemands,
  levelKey,
  questKey,
  whereCopiesWent,
  type Demand
} from '../src/shared/allocate'
import type { HideoutStation } from '../src/shared/questTypes'

const need = (key: string, itemId: string, count: number, fir = false): Demand => ({
  key,
  itemId,
  count,
  fir
})

describe('one shared Have count (since 1.66.0)', () => {
  it('covers needs in order: two needs of 5 with 5 put aside get 5 and 0', () => {
    const share = allocateHave({ have: { bolts: 5 } }, [need('a', 'bolts', 5), need('b', 'bolts', 5)])
    expect([coveredOf(share, 'a'), coveredOf(share, 'b')]).toEqual([5, 0])
  })

  it('gives found-in-raid needs only found-in-raid copies, and others bought ones first', () => {
    const progress = { have: { ledx: 2 }, haveFir: { ledx: 1 } }
    const share = allocateHave(progress, [
      need('any', 'ledx', 1),
      need('fir', 'ledx', 2, true),
      need('rest', 'ledx', 5)
    ])
    // The first takes a bought one; the found-in-raid need gets the one found in raid, not the bought
    // one left; the last gets the bought one left.
    expect(share.get('any')).toEqual({ fir: 0, any: 1 })
    expect(share.get('fir')).toEqual({ fir: 1, any: 0 })
    expect(share.get('rest')).toEqual({ fir: 0, any: 1 })
  })

  it('lets a need that takes any kind use found-in-raid copies the ones that must be found in raid leave', () => {
    // In one group, the need that must be found in raid gets its copies first (since 1.72.0)…
    const share = allocateHave({ have: {}, haveFir: { gp: 3 } }, [
      need('a', 'gp', 2),
      need('b', 'gp', 2, true)
    ])
    expect([coveredOf(share, 'a'), coveredOf(share, 'b')]).toEqual([1, 2])
    // …but not from a group before it.
    const tiers = allocateHave({ have: {}, haveFir: { gp: 3 } }, [
      { ...need('a', 'gp', 2), tier: 0 },
      { ...need('b', 'gp', 2, true), tier: 1 }
    ])
    expect([coveredOf(tiers, 'a'), coveredOf(tiers, 'b')]).toEqual([2, 1])
  })

  it('puts the hideout’s levels in scope first, then active quests, then later levels, then other quests', () => {
    const station: HideoutStation = {
      id: 'lav',
      name: 'Lavatory',
      imageLink: null,
      levels: [
        {
          level: 1,
          items: [{ itemId: 'bolts', count: 2, foundInRaid: false }],
          stations: [],
          traders: [],
          skills: []
        },
        {
          level: 2,
          items: [{ itemId: 'bolts', count: 3, foundInRaid: false }],
          stations: [],
          traders: [],
          skills: []
        }
      ]
    } as unknown as HideoutStation
    const progress = { levels: { lav: 0 }, have: { bolts: 6 }, traders: {} }
    const active = [
      { itemId: 'bolts', count: 2, foundInRaid: false, quests: [{ questId: 'q', name: 'Q', count: 2 }] }
    ]
    const other = [
      { itemId: 'bolts', count: 4, foundInRaid: false, quests: [{ questId: 'o', name: 'O', count: 4 }] }
    ]
    const demands = haveDemands([station], progress, 'next', active, other)
    expect(demands.map((d) => d.key)).toEqual([
      levelKey('lav', 1, 'bolts', false),
      questKey('q', 'bolts', false),
      levelKey('lav', 2, 'bolts', false),
      questKey('o', 'bolts', false)
    ])
    const share = allocateHave(progress, demands)
    expect(demands.map((d) => coveredOf(share, d.key))).toEqual([2, 2, 2, 0])
    // Every level counted: both levels come before the quests.
    expect(haveDemands([station], progress, 'all', active, other).map((d) => d.key)[1]).toBe(
      levelKey('lav', 2, 'bolts', false)
    )
  })

  it('gives the next levels you can build copies before ones waiting on another station (since 1.72.0)', () => {
    const level = (
      n: number,
      items: { itemId: string; count: number; foundInRaid: boolean }[],
      stations = []
    ) => ({
      level: n,
      items,
      stations,
      traders: [],
      skills: []
    })
    const psu = (count: number) => [{ itemId: 'psu', count, foundInRaid: true }]
    const stations = [
      // Listed first, and needs a lot, but waits on the generator's level 3.
      {
        id: 'btc',
        name: 'Bitcoin farm',
        levels: [level(1, psu(10), [{ stationId: 'gen', level: 3 }] as never)]
      },
      { id: 'gen', name: 'Generator', levels: [level(1, []), level(2, psu(5)), level(3, [])] }
    ] as unknown as HideoutStation[]
    const progress = { levels: { btc: 0, gen: 1 }, have: {}, haveFir: { psu: 5 }, traders: {} }
    const demands = haveDemands(stations, progress, 'next', [])
    expect(demands.map((d) => d.key)).toEqual([
      levelKey('gen', 2, 'psu', true),
      levelKey('btc', 1, 'psu', true)
    ])
    const share = allocateHave(progress, demands)
    expect(coveredOf(share, levelKey('gen', 2, 'psu', true))).toBe(5)
    expect(coveredOf(share, levelKey('btc', 1, 'psu', true))).toBe(0)
    // Once the generator's built to 3, the farm can be built: it comes first again, as listed.
    const later = haveDemands(stations, { ...progress, levels: { btc: 0, gen: 2 } }, 'next', [])
    expect(later.map((d) => d.key)).toEqual([levelKey('btc', 1, 'psu', true)])
    expect(whereCopiesWent(share, 'psu')).toEqual([{ key: levelKey('gen', 2, 'psu', true), count: 5 }])
  })

  it('waits on trader loyalty too', () => {
    const station = {
      id: 'lav',
      name: 'Lavatory',
      levels: [
        {
          level: 1,
          items: [{ itemId: 'bolts', count: 2, foundInRaid: false }],
          stations: [],
          traders: [{ traderId: 'mech', level: 2 }],
          skills: []
        }
      ]
    }
    const other = {
      id: 'work',
      name: 'Workbench',
      levels: [
        {
          level: 1,
          items: [{ itemId: 'bolts', count: 2, foundInRaid: false }],
          stations: [],
          traders: [],
          skills: []
        }
      ]
    }
    const stations = [station, other] as unknown as HideoutStation[]
    const progress = { levels: {}, have: { bolts: 2 }, traders: {} }
    expect(haveDemands(stations, progress, 'next', []).map((d) => d.key)[0]).toBe(
      levelKey('work', 1, 'bolts', false)
    )
    expect(
      haveDemands(stations, { ...progress, traders: { mech: 2 } }, 'next', []).map((d) => d.key)[0]
    ).toBe(levelKey('lav', 1, 'bolts', false))
  })
})
