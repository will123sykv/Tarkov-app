import { DEFAULT_FLEA_MIN_LEVEL, PRICE_REQUEST_TIMEOUT_MS, TARKOV_MARKET_BASE } from '../../shared/constants'
import { typesFromMarketTags } from '../../shared/categories'
import { TARKOV_MARKET_PATH_PREFIX } from '../../shared/gameModes'
import type { DataMode, LootItem, PriceDataset } from '../../shared/types'
import { fetchJson, type FetchFn } from './http'

export interface TarkovMarketItem {
  uid?: string | null
  bsgId?: string | null
  name?: string | null
  shortName?: string | null
  price?: number | null
  avg24hPrice?: number | null
  traderName?: string | null
  traderPriceRub?: number | null
  bannedOnFlea?: boolean | null
  haveMarketData?: boolean | null
  slots?: number | null
  tags?: string[] | null
  icon?: string | null
  img?: string | null
  wikiLink?: string | null
}

function positive(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

export function marketItemsUrl(dataMode: DataMode): string {
  return `${TARKOV_MARKET_BASE}${TARKOV_MARKET_PATH_PREFIX[dataMode]}/items/all`
}

export function normalizeTarkovMarketItem(raw: TarkovMarketItem): LootItem | null {
  // bsgId is the game's item id, the same id tarkov.dev uses, so map pools still match.
  const id = raw.bsgId || raw.uid
  if (!id || !raw.name) return null
  const bannedOnFlea = raw.bannedOnFlea === true
  const types = typesFromMarketTags(raw.tags ?? [])
  if (bannedOnFlea) types.push('noFlea')
  const traderPrice = positive(raw.traderPriceRub)
  return {
    id,
    name: raw.name,
    shortName: raw.shortName || raw.name,
    iconLink: raw.icon || raw.img || null,
    wikiLink: raw.wikiLink || null,
    width: null,
    height: null,
    slots: Math.max(1, raw.slots ?? 1),
    types,
    category: raw.tags?.[0] ?? null,
    bannedOnFlea,
    minLevelForFlea: null,
    fleaPrice: raw.haveMarketData === false ? null : (positive(raw.price) ?? positive(raw.avg24hPrice)),
    fleaFee: null,
    bestTrader: traderPrice ? { name: raw.traderName || 'Trader', price: traderPrice } : null
  }
}

export function normalizeTarkovMarket(body: unknown, dataMode: DataMode, fetchedAt: number): PriceDataset {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown })?.items)
      ? (body as { items: unknown[] }).items
      : null
  if (!list) throw new Error('unexpected response shape')
  const items: LootItem[] = []
  for (const raw of list) {
    const item = raw && typeof raw === 'object' && normalizeTarkovMarketItem(raw as TarkovMarketItem)
    if (item) items.push(item)
  }
  return { dataMode, source: 'tarkov-market', fetchedAt, fleaMinLevel: DEFAULT_FLEA_MIN_LEVEL, items }
}

export async function fetchTarkovMarket(
  fetchFn: FetchFn,
  dataMode: DataMode,
  apiKey: string,
  now: number = Date.now()
): Promise<PriceDataset> {
  const body = await fetchJson(
    fetchFn,
    marketItemsUrl(dataMode),
    { headers: { 'x-api-key': apiKey, Accept: 'application/json' } },
    PRICE_REQUEST_TIMEOUT_MS
  )
  const dataset = normalizeTarkovMarket(body, dataMode, now)
  if (dataset.items.length === 0) throw new Error('returned no items')
  return dataset
}

/**
 * tarkov-market only reports a slot count and no per-item flea level gates. When an earlier
 * tarkov.dev dataset is cached, carry its static item data over so sizes and level gates stay right.
 */
export function enrichWithStaticData(dataset: PriceDataset, reference: PriceDataset | null): PriceDataset {
  if (!reference) return dataset
  const byId = new Map(reference.items.map((i) => [i.id, i]))
  const items = dataset.items.map((item) => {
    const ref = byId.get(item.id)
    if (!ref) return item
    const bannedOnFlea = item.bannedOnFlea || ref.bannedOnFlea
    return {
      ...item,
      width: ref.width ?? item.width,
      height: ref.height ?? item.height,
      slots: ref.slots,
      types: bannedOnFlea && !ref.types.includes('noFlea') ? [...ref.types, 'noFlea'] : ref.types,
      bannedOnFlea,
      category: ref.category ?? item.category,
      minLevelForFlea: ref.minLevelForFlea,
      iconLink: ref.iconLink ?? item.iconLink,
      wikiLink: ref.wikiLink ?? item.wikiLink
    }
  })
  return { ...dataset, fleaMinLevel: reference.fleaMinLevel, items }
}
