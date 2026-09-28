import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchTarkovDev,
  normalizeTarkovDev,
  type TarkovDevPricesResponse
} from '../src/main/pricing/tarkovDev'
import { fixture, jsonResponse, mockFetch, requestBody } from './helpers'

const response = fixture<{ data: TarkovDevPricesResponse }>('tarkovdev-prices.json')

describe('normalizeTarkovDev', () => {
  const dataset = normalizeTarkovDev(response.data, 'pvp', 1234)
  const get = (short: string) => dataset.items.find((i) => i.shortName === short)!

  it('keeps valid items and records dataset metadata', () => {
    expect(dataset).toMatchObject({
      dataMode: 'pvp',
      source: 'tarkov.dev',
      fetchedAt: 1234,
      fleaMinLevel: 15
    })
    expect(dataset.items).toHaveLength(7)
  })

  it('maps sizes, prices and the best non-flea trader', () => {
    expect(get('GPU')).toMatchObject({
      width: 2,
      height: 1,
      slots: 2,
      fleaPrice: 540_000,
      fleaFee: 18_000,
      bestTrader: { name: 'Mechanic', price: 105_600 },
      category: 'Electronics'
    })
  })

  it('marks noFlea items as banned and keeps per-item level gates', () => {
    expect(get('Red')).toMatchObject({ bannedOnFlea: true, fleaPrice: null })
    expect(get('0.2BTC').minLevelForFlea).toBe(30)
    expect(get('LEDX').minLevelForFlea).toBeNull()
  })

  it('falls back to the 24h average and to a default flea level', () => {
    expect(get('Factory').fleaPrice).toBe(30_000)
    expect(normalizeTarkovDev({ fleaMarket: null, items: [] }, 'pve', 0).fleaMinLevel).toBe(15)
  })

  it('keeps offer counts, the 24h range and the flea rules for trends', () => {
    expect(get('LEDX')).toMatchObject({
      basePrice: 331_200,
      offerCount: 42,
      low24hPrice: 1_050_000,
      high24hPrice: 1_200_000
    })
    expect(get('GPU')).toMatchObject({ offerCount: null, low24hPrice: null, high24hPrice: null })
    expect(dataset).toMatchObject({
      foundInRaidRequired: false,
      fleaFeeRates: { sellOfferFeeRate: 0.03, sellRequirementFeeRate: 0.03 }
    })
    expect(normalizeTarkovDev({ fleaMarket: null, items: [] }, 'pve', 0).foundInRaidRequired).toBeNull()
  })
})

describe('fetchTarkovDev', () => {
  afterEach(() => vi.useRealTimers())

  it('queries the matching tarkov.dev game mode', async () => {
    const fetchFn = mockFetch({ tarkovDev: () => jsonResponse(response) })
    await fetchTarkovDev(fetchFn, 'pvp')
    await fetchTarkovDev(fetchFn, 'pve')
    const [pvpCall, pveCall] = fetchFn.mock.calls
    expect(pvpCall[0]).toBe('https://api.tarkov.dev/graphql')
    expect(pvpCall[1]?.method).toBe('POST')
    expect(requestBody(pvpCall[1]).variables).toEqual({ gameMode: 'regular' })
    expect(requestBody(pveCall[1]).variables).toEqual({ gameMode: 'pve' })
  })

  it('surfaces HTTP and GraphQL errors', async () => {
    await expect(
      fetchTarkovDev(mockFetch({ tarkovDev: () => jsonResponse({}, 502) }), 'pvp')
    ).rejects.toThrow('HTTP 502')
    const gqlError = mockFetch({
      tarkovDev: () => jsonResponse({ errors: [{ message: 'Cannot query field "foo"' }] })
    })
    await expect(fetchTarkovDev(gqlError, 'pvp')).rejects.toThrow('Cannot query field "foo"')
  })

  it('treats an empty item list as a failure', async () => {
    const empty = mockFetch({ tarkovDev: () => jsonResponse({ data: { fleaMarket: null, items: [] } }) })
    await expect(fetchTarkovDev(empty, 'pvp')).rejects.toThrow('returned no items')
  })

  it('times out hung requests', async () => {
    vi.useFakeTimers()
    const hung = mockFetch({
      tarkovDev: (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        )
    })
    const pending = expect(fetchTarkovDev(hung, 'pvp')).rejects.toThrow('timed out after 30s')
    await vi.advanceTimersByTimeAsync(30_000)
    await pending
  })
})

describe('error bodies', () => {
  it('includes the GraphQL error message from a rejected request', async () => {
    const rejected = mockFetch({
      tarkovDev: () => jsonResponse({ errors: [{ message: 'Unknown argument "gameMode"' }] }, 422)
    })
    await expect(fetchTarkovDev(rejected, 'pvp')).rejects.toThrow('HTTP 422: Unknown argument "gameMode"')
  })

  it('includes short plain-text bodies but not empty JSON', async () => {
    const text = mockFetch({ tarkovDev: () => new Response('rate limited', { status: 429 }) })
    await expect(fetchTarkovDev(text, 'pvp')).rejects.toThrow(/^HTTP 429: rate limited$/)
    const empty = mockFetch({ tarkovDev: () => jsonResponse({}, 500) })
    await expect(fetchTarkovDev(empty, 'pvp')).rejects.toThrow(/^HTTP 500$/)
  })
})
