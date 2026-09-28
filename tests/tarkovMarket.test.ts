import { describe, expect, it } from 'vitest'
import { normalizeTarkovDev, type TarkovDevPricesResponse } from '../src/main/pricing/tarkovDev'
import {
  enrichWithStaticData,
  fetchTarkovMarket,
  marketItemsUrl,
  normalizeTarkovMarket
} from '../src/main/pricing/tarkovMarket'
import { typesFromMarketTags } from '../src/shared/categories'
import { fixture, jsonResponse, mockFetch } from './helpers'

const marketItems = fixture<unknown[]>('tarkovmarket-items.json')

describe('tarkov-market', () => {
  it('builds per-mode URLs', () => {
    expect(marketItemsUrl('pvp')).toBe('https://api.tarkov-market.app/api/v1/items/all')
    expect(marketItemsUrl('pve')).toBe('https://api.tarkov-market.app/api/v1/pve/items/all')
  })

  it('normalizes items using the game item id', () => {
    const dataset = normalizeTarkovMarket(marketItems, 'pvp', 99)
    expect(dataset).toMatchObject({ source: 'tarkov-market', fetchedAt: 99, fleaMinLevel: 15 })
    expect(dataset.items).toHaveLength(4)
    const [ledx, gpu, red, sdn] = dataset.items
    expect(ledx).toMatchObject({
      id: '5c0530ee86f774697952d952',
      fleaPrice: 1_120_000,
      bestTrader: { name: 'Therapist', price: 265_000 },
      types: ['barter'],
      width: null,
      slots: 1
    })
    expect(gpu.slots).toBe(2)
    expect(red).toMatchObject({ bannedOnFlea: true, fleaPrice: null, types: ['keys', 'noFlea'] })
    expect(sdn.types).toEqual(['mods', 'suppressor'])
  })

  it('accepts a wrapped response and rejects unknown shapes', () => {
    expect(normalizeTarkovMarket({ items: marketItems }, 'pve', 0).items).toHaveLength(4)
    expect(() => normalizeTarkovMarket({ error: 'nope' }, 'pve', 0)).toThrow('unexpected response shape')
  })

  it('sends the API key header', async () => {
    const fetchFn = mockFetch({ tarkovMarket: () => jsonResponse(marketItems) })
    await fetchTarkovMarket(fetchFn, 'pve', 'secret-key')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.tarkov-market.app/api/v1/pve/items/all')
    expect((init?.headers as Record<string, string>)['x-api-key']).toBe('secret-key')
  })

  it('maps free-form tags onto item types', () => {
    expect(typesFromMarketTags(['Barter', 'Medical supplies'])).toEqual(['barter'])
    expect(typesFromMarketTags(['Meds', 'Injectors'])).toEqual(['meds', 'injectors'])
    expect(typesFromMarketTags(['Weapon', 'Assault rifles'])).toEqual(['gun'])
    expect(typesFromMarketTags(['Gear', 'Tactical rigs'])).toEqual(['wearable', 'rig'])
    expect(typesFromMarketTags(['Ammo'])).toEqual(['ammo'])
  })

  it('borrows sizes and level gates from cached tarkov.dev data', () => {
    const reference = normalizeTarkovDev(
      fixture<{ data: TarkovDevPricesResponse }>('tarkovdev-prices.json').data,
      'pvp',
      0
    )
    const market = normalizeTarkovMarket(marketItems, 'pvp', 5)
    const enriched = enrichWithStaticData(market, { ...reference, fleaMinLevel: 20 })
    const gpu = enriched.items.find((i) => i.shortName === 'GPU')!
    expect(gpu).toMatchObject({ width: 2, height: 1, slots: 2, fleaPrice: 550_000, category: 'Electronics' })
    expect(enriched.items.find((i) => i.shortName === 'Red')!.bannedOnFlea).toBe(true)
    expect(enriched.items.find((i) => i.shortName === 'SDN-6')!.width).toBeNull()
    expect(enriched.fleaMinLevel).toBe(20)
    expect(enrichWithStaticData(market, null)).toBe(market)
  })
})
