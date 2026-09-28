import { describe, expect, it } from 'vitest'
import { normalizeTarkovDev, type TarkovDevPricesResponse } from '../src/main/pricing/tarkovDev'
import { averageSearchValue, rankContainers, valuesById } from '../src/shared/containerValue'
import type { ContainerLoot } from '../src/shared/types'
import { fixture } from './helpers'

const { items } = normalizeTarkovDev(
  fixture<{ data: TarkovDevPricesResponse }>('tarkovdev-prices.json').data,
  'pvp',
  0
)
const id = (short: string) => items.find((i) => i.shortName === short)!.id
const ctx = (playerLevel: number) => ({ playerLevel, fleaMinLevel: 15, subtractFleaFee: true })

const pcBlock: ContainerLoot = {
  id: 'pc-block',
  name: 'PC block',
  expectedCount: 1.5,
  items: [
    { id: id('GPU'), chance: 0.25 },
    { id: 'unknown-item', chance: 0.75 }
  ]
}
const medcase: ContainerLoot = {
  id: 'medcase',
  name: 'Medcase',
  expectedCount: 2,
  items: [
    { id: id('LEDX'), chance: 0.1 },
    { id: id('Folder'), chance: 0.9 }
  ]
}

describe('averageSearchValue', () => {
  it('multiplies worth by chance and by items rolled per search', () => {
    const value = averageSearchValue(pcBlock, valuesById(items, ctx(15)))
    // GPU is worth ₽522,000 on the flea (after fees).
    expect(value.average).toBeCloseTo(522_000 * 0.25 * 1.5)
    expect(value.pricedShare).toBe(0.25)
    expect(value.best?.item.shortName).toBe('GPU')
    expect(value.best?.contribution).toBeCloseTo(value.average)
  })

  it('uses trader prices when the flea is locked at the player level', () => {
    const locked = averageSearchValue(medcase, valuesById(items, ctx(10)))
    const unlocked = averageSearchValue(medcase, valuesById(items, ctx(15)))
    expect(locked.average).toBeCloseTo(265_000 * 0.1 * 2)
    expect(unlocked.average).toBeCloseTo(1_059_000 * 0.1 * 2)
  })

  it('treats items with no price as worth nothing', () => {
    const value = averageSearchValue(
      { ...medcase, items: [{ id: id('Folder'), chance: 1 }] },
      valuesById(items, ctx(15))
    )
    expect(value).toMatchObject({ average: 0, pricedShare: 0, best: null })
  })
})

describe('rankContainers', () => {
  it('orders containers by average value per search', () => {
    const values = valuesById(items, ctx(15))
    expect(rankContainers([pcBlock, medcase], values).map((r) => r.loot.id)).toEqual(['medcase', 'pc-block'])
  })
})
