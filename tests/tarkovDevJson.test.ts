import { describe, expect, it } from 'vitest'
import { normalizeTarkovDev, type TarkovDevPricesResponse } from '../src/main/pricing/tarkovDev'
import {
  fetchTarkovDevJson,
  normalizeTarkovDevJson,
  type JsonItemsData,
  type JsonTraders
} from '../src/main/pricing/tarkovDevJson'
import { fleaMarketFee } from '../src/shared/fleaFee'
import { fixture, jsonFixtureRoute, jsonResponse, mockFetch } from './helpers'

const input = {
  items: fixture<{ data: JsonItemsData }>('json-items.json').data,
  itemsLang: fixture<{ data: Record<string, string> }>('json-items_en.json').data,
  traders: fixture<{ data: JsonTraders }>('json-traders.json').data,
  tradersLang: fixture<{ data: Record<string, string> }>('json-traders_en.json').data
}

describe('normalizeTarkovDevJson', () => {
  const dataset = normalizeTarkovDevJson(input, 'pvp', 42)
  const get = (short: string) => dataset.items.find((i) => i.shortName === short)!

  it('matches what the GraphQL API reports for the same items', () => {
    const graphql = normalizeTarkovDev(
      fixture<{ data: TarkovDevPricesResponse }>('tarkovdev-prices.json').data,
      'pvp',
      42
    )
    expect(dataset).toMatchObject({ dataMode: 'pvp', source: 'tarkov.dev', fetchedAt: 42, fleaMinLevel: 15 })
    const comparable = (items: typeof dataset.items) =>
      // The GraphQL fallback doesn't ask what traders sell.
      items.map(({ fleaFee: _fee, iconLink: _icon, category: _category, buyFrom: _buy, ...rest }) => rest)
    expect(comparable(dataset.items)).toEqual(comparable(graphql.items))
  })

  it('resolves translation keys for names, categories and traders', () => {
    expect(get('GPU')).toMatchObject({
      name: 'Graphics card',
      category: 'Electronics',
      bestTrader: { name: 'Mechanic', price: 105_600 }
    })
  })

  it('keeps what traders sell, in roubles, at a loyalty level and after a quest', () => {
    expect(get('GPU').buyFrom).toEqual([
      {
        traderId: '5a7c2eca46aef81a7ca2145d',
        trader: 'Mechanic',
        level: 3,
        price: 231_000,
        questId: '5b47926a86f7747ccc057c15'
      }
    ])
    expect(get('LEDX').buyFrom).toEqual([])
  })

  it('reads the category from the categories list, falling back to its slug when untranslated', () => {
    expect(get('LEDX').category).toBe('Medical supplies')
    expect(get('Factory').category).toBe('Mechanical key')
    expect(get('Folder').category).toBeNull()
  })

  it('keeps offer counts, the 24h range and the flea rules for trends', () => {
    expect(get('LEDX')).toMatchObject({ offerCount: 42, low24hPrice: 1_050_000, high24hPrice: 1_200_000 })
    expect(dataset).toMatchObject({
      foundInRaidRequired: false,
      fleaFeeRates: { sellOfferFeeRate: 0.03, sellRequirementFeeRate: 0.03 }
    })
  })

  it('computes flea fees locally from the base price and flea price', () => {
    expect(get('LEDX').fleaFee).toBe(fleaMarketFee(331_200, 1_100_000))
    expect(get('Red').fleaFee).toBeNull()
  })

  it('builds icon links when the dump has none', () => {
    expect(get('Factory').iconLink).toBe('https://assets.tarkov.dev/5448ba0b4bdc2d02308b456c-icon.webp')
  })

  it('falls back to translation keys when a translation is missing', () => {
    const partial = normalizeTarkovDevJson({ ...input, itemsLang: {} }, 'pvp', 0)
    expect(partial.items[0].name).toBe('5c0530ee86f774697952d952 Name')
  })
})

describe('fetchTarkovDevJson', () => {
  it('loads the items, trader and translation files for the game mode', async () => {
    const fetchFn = mockFetch({ tarkovDevJson: jsonFixtureRoute })
    const dataset = await fetchTarkovDevJson(fetchFn, 'pve', 7)
    expect(dataset.items).toHaveLength(7)
    expect(fetchFn.mock.calls.map(([url]) => url).sort()).toEqual([
      'https://json.tarkov.dev/pve/items',
      'https://json.tarkov.dev/pve/items_en',
      'https://json.tarkov.dev/pve/traders',
      'https://json.tarkov.dev/pve/traders_en'
    ])
    await fetchTarkovDevJson(fetchFn, 'pvp')
    expect(fetchFn.mock.calls.at(-1)![0]).toMatch(/^https:\/\/json\.tarkov\.dev\/regular\//)
    // Never an old cached copy: Electron's fetch would otherwise reuse one the server allows.
    expect(fetchFn.mock.calls.every(([, init]) => init?.cache === 'no-store')).toBe(true)
  })

  it('accepts traders wrapped in a { traders } object', async () => {
    const fetchFn = mockFetch({
      tarkovDevJson: (url) =>
        url.endsWith('/traders') ? jsonResponse({ data: { traders: input.traders } }) : jsonFixtureRoute(url)
    })
    const dataset = await fetchTarkovDevJson(fetchFn, 'pvp')
    expect(dataset.items.find((i) => i.shortName === 'LEDX')?.bestTrader?.name).toBe('Therapist')
  })

  it('fails when any file is missing or malformed', async () => {
    const missing = mockFetch({
      tarkovDevJson: (url) => (url.endsWith('/items_en') ? jsonResponse({}, 404) : jsonFixtureRoute(url))
    })
    await expect(fetchTarkovDevJson(missing, 'pvp')).rejects.toThrow('HTTP 404')
    const malformed = mockFetch({
      tarkovDevJson: (url) => (url.endsWith('/items') ? jsonResponse({ nope: true }) : jsonFixtureRoute(url))
    })
    await expect(fetchTarkovDevJson(malformed, 'pvp')).rejects.toThrow('items: no data in response')
  })
})
