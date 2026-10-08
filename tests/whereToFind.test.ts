import { describe, expect, it } from 'vitest'
import type { ContainerCatalog, ContainerLoot } from '../src/shared/types'
import { containerMapId, findScore, formatChance, whereToFind } from '../src/shared/whereToFind'

const BOLTS = 'bolts'
const LEDX = 'ledx'
const map = {
  looseLoot: {
    spots: [
      [1, 0, 1],
      [2, 0, 2],
      [3, 0, 3]
    ] as [number, number, number][],
    items: { [BOLTS]: [0, 2], [LEDX]: [1] }
  },
  // Two toolbox templates, one drawer; nothing placed for the medcase.
  containers: {
    tplToolboxA: [[10, 1, 10]] as [number, number, number][],
    tplToolboxB: [
      [11, 1, 11],
      [12, 1, 12]
    ] as [number, number, number][],
    tplDrawer: [[20, 1, 20]] as [number, number, number][]
  }
}
const catalog: ContainerCatalog['containers'] = [
  { id: 'toolbox', name: 'Toolbox', mapIds: ['bigmap'], templates: ['tplToolboxA', 'tplToolboxB'] },
  { id: 'drawer', name: 'Drawer', mapIds: ['bigmap'], templates: ['tplDrawer'] },
  { id: 'medcase', name: 'Medcase', mapIds: ['bigmap'], templates: ['tplMedcase'] }
]
const loot: ContainerLoot[] = [
  { id: 'drawer', name: 'Drawer', expectedCount: 1, items: [{ id: BOLTS, chance: 0.01 }] },
  // Two rolls at 5% each: 1 − 0.95² = 9.75% to find at least one.
  { id: 'toolbox', name: 'Toolbox', expectedCount: 2, items: [{ id: BOLTS, chance: 0.05 }] },
  { id: 'medcase', name: 'Medcase', expectedCount: 1, items: [{ id: LEDX, chance: 0.0005 }] }
]

describe('whereToFind', () => {
  it('lists the loose spots and the containers that can hold an item, likeliest first', () => {
    const where = whereToFind(BOLTS, map, loot, catalog)
    expect(where.loose).toEqual([
      [1, 0, 1],
      [3, 0, 3]
    ])
    expect(where.containers.map((c) => c.id)).toEqual(['toolbox', 'drawer'])
    expect(where.containers[0].chance).toBeCloseTo(0.0975, 4)
    // Every template of the kind, wherever tarkov.dev places it.
    expect(where.containers[0].spots).toHaveLength(3)
    expect(findScore(where)).toBeCloseTo(2 + 0.0975 * 3 + 0.01 * 1, 4)
  })

  it('leaves out chances too small to name, and items found nowhere', () => {
    expect(whereToFind(LEDX, map, loot, catalog)).toEqual({ loose: [[2, 0, 2]], containers: [] })
    expect(whereToFind('nothing', map, loot, catalog)).toEqual({ loose: [], containers: [] })
  })

  it('copes with maps from before loot data was kept', () => {
    const old = { looseLoot: undefined, containers: undefined } as unknown as typeof map
    expect(whereToFind(BOLTS, old, loot, catalog).loose).toEqual([])
    expect(whereToFind(BOLTS, old, loot, catalog).containers[0].spots).toEqual([])
  })

  it('names maps as the tables do and shows chances briefly', () => {
    expect(containerMapId({ nameId: 'RezervBase' })).toBe('rezervbase')
    expect(formatChance(0.0975)).toBe('10%')
    expect(formatChance(0.034)).toBe('3%')
    expect(formatChance(0.0042)).toBe('0.4%')
  })
})
