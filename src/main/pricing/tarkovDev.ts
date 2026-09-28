import { DEFAULT_FLEA_MIN_LEVEL, PRICE_REQUEST_TIMEOUT_MS } from '../../shared/constants'
import { TARKOV_DEV_GAME_MODE } from '../../shared/gameModes'
import type { DataMode, LootItem, PriceDataset, TraderPrice } from '../../shared/types'
import { tarkovDevQuery, type FetchFn } from './http'

export const PRICES_QUERY = `query LootPrices($gameMode: GameMode) {
  fleaMarket(gameMode: $gameMode) { minPlayerLevel enabled }
  items(gameMode: $gameMode) {
    id
    name
    shortName
    width
    height
    types
    basePrice
    avg24hPrice
    lastLowPrice
    minLevelForFlea
    fleaMarketFee
    iconLink
    wikiLink
    category { name }
    sellFor { priceRUB vendor { name normalizedName } }
  }
}`

export interface TarkovDevItem {
  id: string
  name: string | null
  shortName: string | null
  width: number | null
  height: number | null
  types: string[] | null
  basePrice: number | null
  avg24hPrice: number | null
  lastLowPrice: number | null
  minLevelForFlea: number | null
  fleaMarketFee: number | null
  iconLink: string | null
  wikiLink: string | null
  category: { name: string } | null
  sellFor: { priceRUB: number | null; vendor: { name: string; normalizedName: string } | null }[] | null
}

export interface TarkovDevPricesResponse {
  fleaMarket: { minPlayerLevel: number | null; enabled: boolean | null } | null
  items: (TarkovDevItem | null)[] | null
}

const FLEA_VENDOR = 'flea-market'

function positive(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function bestTraderOffer(item: TarkovDevItem): TraderPrice | null {
  let best: TraderPrice | null = null
  for (const offer of item.sellFor ?? []) {
    const price = positive(offer?.priceRUB)
    if (!price || !offer.vendor || offer.vendor.normalizedName === FLEA_VENDOR) continue
    if (!best || price > best.price) best = { name: offer.vendor.name, price }
  }
  return best
}

export function normalizeTarkovDevItem(raw: TarkovDevItem): LootItem | null {
  if (!raw?.id || !raw.name) return null
  const width = Math.max(1, raw.width ?? 1)
  const height = Math.max(1, raw.height ?? 1)
  const types = raw.types ?? []
  return {
    id: raw.id,
    name: raw.name,
    shortName: raw.shortName ?? raw.name,
    iconLink: raw.iconLink ?? null,
    wikiLink: raw.wikiLink ?? null,
    width,
    height,
    slots: width * height,
    types,
    category: raw.category?.name ?? null,
    bannedOnFlea: types.includes('noFlea'),
    minLevelForFlea: positive(raw.minLevelForFlea),
    fleaPrice: positive(raw.lastLowPrice) ?? positive(raw.avg24hPrice),
    fleaFee: positive(raw.fleaMarketFee),
    bestTrader: bestTraderOffer(raw)
  }
}

export function normalizeTarkovDev(
  data: TarkovDevPricesResponse,
  dataMode: DataMode,
  fetchedAt: number
): PriceDataset {
  const items: LootItem[] = []
  for (const raw of data.items ?? []) {
    const item = raw && normalizeTarkovDevItem(raw)
    if (item) items.push(item)
  }
  return {
    dataMode,
    source: 'tarkov.dev',
    fetchedAt,
    fleaMinLevel: positive(data.fleaMarket?.minPlayerLevel) ?? DEFAULT_FLEA_MIN_LEVEL,
    items
  }
}

export async function fetchTarkovDev(
  fetchFn: FetchFn,
  dataMode: DataMode,
  now: number = Date.now()
): Promise<PriceDataset> {
  const data = await tarkovDevQuery<TarkovDevPricesResponse>(
    fetchFn,
    PRICES_QUERY,
    { gameMode: TARKOV_DEV_GAME_MODE[dataMode] },
    PRICE_REQUEST_TIMEOUT_MS
  )
  const dataset = normalizeTarkovDev(data, dataMode, now)
  if (dataset.items.length === 0) throw new Error('returned no items')
  return dataset
}
