import { DEFAULT_FLEA_MIN_LEVEL, PRICE_REQUEST_TIMEOUT_MS } from '../../shared/constants'
import { DEFAULT_FLEA_FEE_RATES } from '../../shared/fleaFee'
import { TARKOV_DEV_GAME_MODE } from '../../shared/gameModes'
import type { DataMode, LootItem, PriceDataset, TraderSale } from '../../shared/types'
import { bestSale } from '../../shared/valuation'
import { tarkovDevQuery, type FetchFn } from './http'

export const PRICES_QUERY = `query LootPrices($gameMode: GameMode) {
  fleaMarket(gameMode: $gameMode) { minPlayerLevel enabled foundInRaidRequired sellOfferFeeRate sellRequirementFeeRate }
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
    lastOfferCount
    low24hPrice
    high24hPrice
    minLevelForFlea
    fleaMarketFee
    iconLink
    wikiLink
    category { name }
    sellFor { priceRUB vendor { name normalizedName ... on TraderOffer { trader { id } } } }
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
  lastOfferCount?: number | null
  low24hPrice?: number | null
  high24hPrice?: number | null
  minLevelForFlea: number | null
  fleaMarketFee: number | null
  iconLink: string | null
  wikiLink: string | null
  category: { name: string } | null
  sellFor:
    | {
        priceRUB: number | null
        vendor: { name: string; normalizedName: string; trader?: { id: string } | null } | null
      }[]
    | null
}

export interface TarkovDevPricesResponse {
  fleaMarket: {
    minPlayerLevel: number | null
    enabled: boolean | null
    foundInRaidRequired?: boolean | null
    sellOfferFeeRate?: number | null
    sellRequirementFeeRate?: number | null
  } | null
  items: (TarkovDevItem | null)[] | null
}

const FLEA_VENDOR = 'flea-market'

function positive(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function traderSales(item: TarkovDevItem): TraderSale[] {
  const sales: TraderSale[] = []
  for (const offer of item.sellFor ?? []) {
    const price = positive(offer?.priceRUB)
    if (!price || !offer.vendor || offer.vendor.normalizedName === FLEA_VENDOR) continue
    sales.push({
      traderId: offer.vendor.trader?.id ?? offer.vendor.normalizedName,
      trader: offer.vendor.name,
      price
    })
  }
  return sales
}

export function normalizeTarkovDevItem(raw: TarkovDevItem): LootItem | null {
  if (!raw?.id || !raw.name) return null
  const width = Math.max(1, raw.width ?? 1)
  const height = Math.max(1, raw.height ?? 1)
  const types = raw.types ?? []
  const sales = traderSales(raw)
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
    bestTrader: bestSale(sales),
    sellTo: sales,
    basePrice: positive(raw.basePrice),
    offerCount: typeof raw.lastOfferCount === 'number' ? raw.lastOfferCount : null,
    low24hPrice: positive(raw.low24hPrice),
    high24hPrice: positive(raw.high24hPrice),
    avg24hPrice: positive(raw.avg24hPrice)
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
    items,
    fleaFeeRates: {
      sellOfferFeeRate: data.fleaMarket?.sellOfferFeeRate ?? DEFAULT_FLEA_FEE_RATES.sellOfferFeeRate,
      sellRequirementFeeRate:
        data.fleaMarket?.sellRequirementFeeRate ?? DEFAULT_FLEA_FEE_RATES.sellRequirementFeeRate
    },
    foundInRaidRequired:
      typeof data.fleaMarket?.foundInRaidRequired === 'boolean' ? data.fleaMarket.foundInRaidRequired : null
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
