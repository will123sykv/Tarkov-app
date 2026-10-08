import { describe, expect, it } from 'vitest'
import { aggregateStaticLoot, idMonth, slugify, type StaticLootFile } from '../scripts/containerLoot'

const meta = {
  source: 'test',
  sourceUrl: 'https://example.invalid',
  license: 'NCSA',
  generatedAt: '2026-09-28'
}
const locale = {
  'jacketA Name': 'Jacket',
  'jacketB Name': 'Jacket',
  'festive Name': 'Festive airdrop supply crate',
  'safe Name': 'Safe'
}
// Two item ids with real timestamps: 2016-07 and 2025-07.
const OLD = '5783c43d2459774bbe137486'
const NEW = '6889e4cd3ff7e9cfbc0c507c'

const customs: StaticLootFile = {
  jacketA: {
    itemcountDistribution: [
      { count: 1, relativeProbability: 3 },
      { count: 2, relativeProbability: 1 }
    ],
    itemDistribution: [
      { tpl: OLD, relativeProbability: 10 },
      { tpl: NEW, relativeProbability: 0 }
    ]
  },
  jacketB: {
    itemcountDistribution: [{ count: 1, relativeProbability: 4 }],
    itemDistribution: [
      { tpl: OLD, relativeProbability: 5 },
      { tpl: NEW, relativeProbability: 5 }
    ]
  },
  festive: {
    itemcountDistribution: [{ count: 1, relativeProbability: 1 }],
    itemDistribution: [{ tpl: OLD, relativeProbability: 1 }]
  },
  unnamed: { itemcountDistribution: [], itemDistribution: [] }
}
const woods: StaticLootFile = {
  safe: {
    itemcountDistribution: [{ count: 3, relativeProbability: 2 }],
    itemDistribution: [{ tpl: NEW, relativeProbability: 7 }]
  }
}

describe('aggregateStaticLoot', () => {
  const data = aggregateStaticLoot(
    [
      { map: { id: 'bigmap', name: 'Customs' }, loot: customs },
      { map: { id: 'woods', name: 'Woods' }, loot: woods }
    ],
    locale,
    meta
  )

  it('merges variants sharing a name by summing their weights', () => {
    const jacket = data.containers.find((c) => c.id === 'jacket')!
    const loot = jacket.maps.bigmap.loot
    const weights = Object.fromEntries(
      Array.from({ length: loot.length / 2 }, (_, i) => [data.items[loot[i * 2]], loot[i * 2 + 1]])
    )
    expect(weights).toEqual({ [OLD]: 15, [NEW]: 5 })
    expect(jacket.maps.bigmap.observations).toBe(8)
    expect(jacket.maps.bigmap.expectedCount).toBe(1.125)
    // Both variants' template ids, which tarkov.dev's maps name containers by.
    expect(jacket.templates).toEqual(['jacketA', 'jacketB'])
  })

  it('drops seasonal and empty containers and keeps per-map tables', () => {
    expect(data.containers.map((c) => c.id)).toEqual(['jacket', 'safe'])
    expect(Object.keys(data.containers[1].maps)).toEqual(['woods'])
    expect(data.containers[1].maps.woods.expectedCount).toBe(3)
  })

  it('records the source, maps and how current the data is', () => {
    expect(data).toMatchObject({ ...meta, dataAsOf: '2025-07', maps: [{ id: 'bigmap' }, { id: 'woods' }] })
    expect(data.items).toEqual([OLD, NEW])
  })
})

describe('helpers', () => {
  it('slugifies names and reads item id months', () => {
    expect(slugify('Medbag SMU06')).toBe('medbag-smu06')
    expect(slugify('Cash register TAR2-2')).toBe('cash-register-tar2-2')
    expect(idMonth(NEW)).toBe('2025-07')
    expect(idMonth('not-an-id')).toBeNull()
  })
})
