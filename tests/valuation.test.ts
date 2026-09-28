import { describe, expect, it } from 'vitest'
import { normalizeTarkovDev, type TarkovDevPricesResponse } from '../src/main/pricing/tarkovDev'
import type { SortState } from '../src/shared/types'
import { evaluateItem, fleaAccess, rankItems, type RankFilters } from '../src/shared/valuation'
import { fixture } from './helpers'

const { items } = normalizeTarkovDev(
  fixture<{ data: TarkovDevPricesResponse }>('tarkovdev-prices.json').data,
  'pvp',
  0
)
const byName = (short: string) => items.find((i) => i.shortName === short)!

const ctx = (playerLevel: number, subtractFleaFee = true) => ({
  playerLevel,
  fleaMinLevel: 15,
  subtractFleaFee
})
const filters = (overrides: Partial<RankFilters> = {}): RankFilters => ({
  category: 'all',
  mapItemIds: null,
  search: '',
  hideLocked: false,
  minValuePerSlot: 0,
  ...overrides
})
const bySlotValue: SortState = { key: 'valuePerSlot', dir: 'desc' }
const names = (rows: { item: { shortName: string } }[]) => rows.map((r) => r.item.shortName)

describe('fleaAccess', () => {
  it('locks everything below the global flea unlock level', () => {
    expect(fleaAccess(byName('LEDX'), 14, 15)).toEqual({ status: 'locked', unlockLevel: 15 })
    expect(fleaAccess(byName('LEDX'), 15, 15)).toEqual({ status: 'sellable', unlockLevel: 15 })
  })

  it('applies per-item level gates above the global unlock', () => {
    expect(fleaAccess(byName('0.2BTC'), 25, 15)).toEqual({ status: 'locked', unlockLevel: 30 })
    expect(fleaAccess(byName('0.2BTC'), 30, 15)).toEqual({ status: 'sellable', unlockLevel: 30 })
  })

  it('never unlocks flea-banned items', () => {
    expect(fleaAccess(byName('Red'), 62, 15)).toEqual({ status: 'banned', unlockLevel: null })
  })
})

describe('evaluateItem', () => {
  it('uses the flea price net of fees when sellable and better than traders', () => {
    const r = evaluateItem(byName('LEDX'), ctx(15))
    expect(r).toMatchObject({ worth: 1_059_000, via: 'flea', valuePerSlot: 1_059_000 })
  })

  it('can ignore flea fees', () => {
    expect(evaluateItem(byName('LEDX'), ctx(15, false)).worth).toBe(1_100_000)
  })

  it('falls back to the best trader when the flea is locked', () => {
    const r = evaluateItem(byName('LEDX'), ctx(14))
    expect(r).toMatchObject({ worth: 265_000, via: 'trader', fleaNet: 1_059_000 })
  })

  it('divides by the slots the item occupies', () => {
    const r = evaluateItem(byName('GPU'), ctx(15))
    expect(r.worth).toBe(522_000)
    expect(r.valuePerSlot).toBe(261_000)
  })

  it('uses the 24h average when there is no current lowest offer', () => {
    expect(evaluateItem(byName('Factory'), ctx(15)).worth).toBe(29_100)
  })

  it('values items with no price at zero', () => {
    expect(evaluateItem(byName('Folder'), ctx(15))).toMatchObject({ worth: 0, via: null })
  })
})

describe('rankItems', () => {
  it('ranks by value per slot and skips presets and unsellable items', () => {
    expect(names(rankItems(items, ctx(15), filters(), bySlotValue))).toEqual([
      'LEDX',
      'Red',
      '0.2BTC',
      'GPU',
      'Factory'
    ])
  })

  it('re-ranks when the player level unlocks more items', () => {
    expect(names(rankItems(items, ctx(30), filters(), bySlotValue))).toEqual([
      'LEDX',
      '0.2BTC',
      'Red',
      'GPU',
      'Factory'
    ])
  })

  it('hides locked and flea-banned items when asked', () => {
    expect(names(rankItems(items, ctx(15), filters({ hideLocked: true }), bySlotValue))).toEqual([
      'LEDX',
      'GPU',
      'Factory'
    ])
  })

  it('filters by category, map, search and minimum value', () => {
    expect(names(rankItems(items, ctx(15), filters({ category: 'keys' }), bySlotValue))).toEqual([
      'Red',
      'Factory'
    ])
    const customs = new Set(['57347ca924597744596b4e71', '5448ba0b4bdc2d02308b456c'])
    expect(names(rankItems(items, ctx(15), filters({ mapItemIds: customs }), bySlotValue))).toEqual([
      'GPU',
      'Factory'
    ])
    expect(names(rankItems(items, ctx(15), filters({ search: ' gpu ' }), bySlotValue))).toEqual(['GPU'])
    expect(names(rankItems(items, ctx(15), filters({ minValuePerSlot: 300_000 }), bySlotValue))).toEqual([
      'LEDX',
      'Red',
      '0.2BTC'
    ])
  })

  it('sorts by other columns in either direction', () => {
    expect(names(rankItems(items, ctx(15), filters(), { key: 'name', dir: 'asc' }))).toEqual([
      'Factory',
      'GPU',
      'LEDX',
      '0.2BTC',
      'Red'
    ])
    expect(names(rankItems(items, ctx(15), filters(), { key: 'slots', dir: 'desc' }))[0]).toBe('GPU')
    expect(names(rankItems(items, ctx(15), filters(), { key: 'trader', dir: 'asc' }))[0]).toBe('Factory')
  })
})
