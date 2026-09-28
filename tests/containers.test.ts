import { describe, expect, it } from 'vitest'
import { createContainerService } from '../src/main/containers'
import type { ContainerLootData } from '../src/shared/containerData'

const data: ContainerLootData = {
  source: 'test',
  sourceUrl: 'https://example.invalid',
  license: 'NCSA',
  generatedAt: '2026-09-28',
  dataAsOf: '2025-07',
  maps: [
    { id: 'bigmap', name: 'Customs' },
    { id: 'woods', name: 'Woods' }
  ],
  items: ['a', 'b', 'c'],
  containers: [
    {
      id: 'jacket',
      name: 'Jacket',
      maps: {
        bigmap: { observations: 100, expectedCount: 1, loot: [0, 3, 1, 1] },
        woods: { observations: 300, expectedCount: 2, loot: [1, 2, 2, 2] }
      }
    },
    {
      id: 'pc-block',
      name: 'PC block',
      maps: { bigmap: { observations: 10, expectedCount: 1.5, loot: [2, 5] } }
    }
  ]
}

describe('container service', () => {
  const service = createContainerService(data)

  it('lists maps and which maps each container appears on', () => {
    expect(service.catalog()).toMatchObject({
      dataAsOf: '2025-07',
      maps: data.maps,
      containers: [
        { id: 'jacket', name: 'Jacket', mapIds: ['bigmap', 'woods'] },
        { id: 'pc-block', name: 'PC block', mapIds: ['bigmap'] }
      ]
    })
  })

  it('normalises one map’s weights into chances', () => {
    const [jacket, pcBlock] = service.loot('bigmap')
    expect(jacket).toEqual({
      id: 'jacket',
      name: 'Jacket',
      expectedCount: 1,
      items: [
        { id: 'a', chance: 0.75 },
        { id: 'b', chance: 0.25 }
      ]
    })
    expect(pcBlock.items).toEqual([{ id: 'c', chance: 1 }])
  })

  it('leaves out containers that are not on the map', () => {
    expect(service.loot('woods').map((c) => c.id)).toEqual(['jacket'])
    expect(service.loot('nowhere')).toEqual([])
  })

  it('sums weights across maps and weights the item count by observations', () => {
    const jacket = service.loot(null).find((c) => c.id === 'jacket')!
    // Weights: a 3, b 1 + 2, c 2 → total 8 (ties keep their original order).
    expect(jacket.items).toEqual([
      { id: 'a', chance: 3 / 8 },
      { id: 'b', chance: 3 / 8 },
      { id: 'c', chance: 2 / 8 }
    ])
    expect(jacket.expectedCount).toBeCloseTo((1 * 100 + 2 * 300) / 400)
  })

  it('memoises per map', () => {
    expect(service.loot('bigmap')).toBe(service.loot('bigmap'))
  })
})
