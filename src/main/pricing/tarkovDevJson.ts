import {
  DEFAULT_FLEA_MIN_LEVEL,
  LARGE_REQUEST_TIMEOUT_MS,
  TARKOV_DEV_JSON_BASE
} from '../../shared/constants'
import { DEFAULT_FLEA_FEE_RATES, fleaMarketFee } from '../../shared/fleaFee'
import { TARKOV_DEV_GAME_MODE } from '../../shared/gameModes'
import type { DataMode, LootItem, PriceDataset, TraderPrice } from '../../shared/types'
import { fetchJson, type FetchFn } from './http'

// json.tarkov.dev serves the raw data behind tarkov.dev's GraphQL API as static files:
// `{regular|pve}/items` etc. hold the data with translation keys in place of display text,
// and `{file}_en` maps those keys to English.

type Dict<T> = Record<string, T>
export type Collection<T> = Dict<T> | T[]

export interface JsonItem {
  id: string
  name?: string | null
  shortName?: string | null
  width?: number | null
  height?: number | null
  types?: string[] | null
  basePrice?: number | null
  avg24hPrice?: number | null
  lastLowPrice?: number | null
  minLevelForFlea?: number | null
  lastOfferCount?: number | null
  low24hPrice?: number | null
  high24hPrice?: number | null
  iconLink?: string | null
  wikiLink?: string | null
  bsgCategoryId?: string | null
  /** Category ids, most specific first (what tarkov.dev's site reads). */
  categories?: string[] | null
  sellToTrader?: { trader: string; priceRUB?: number | null }[] | null
}

export interface JsonItemsData {
  items?: Collection<JsonItem> | null
  fleaMarket?: {
    minPlayerLevel?: number | null
    foundInRaidRequired?: boolean | null
    sellOfferFeeRate?: number | null
    sellRequirementFeeRate?: number | null
  } | null
  itemCategories?: Dict<{ name?: string | null; normalizedName?: string | null }> | null
}

export type JsonTraders = Dict<{ name?: string | null; normalizedName?: string | null }>

export interface TarkovDevJsonInput {
  items: JsonItemsData
  itemsLang: Dict<string>
  traders: JsonTraders
  tradersLang: Dict<string>
}

export function jsonUrl(dataMode: DataMode, file: string): string {
  return `${TARKOV_DEV_JSON_BASE}/${TARKOV_DEV_GAME_MODE[dataMode]}/${file}`
}

export function values<T>(collection: Collection<T> | null | undefined): T[] {
  if (!collection) return []
  return Array.isArray(collection) ? collection : Object.values(collection)
}

/** Resolve a translation key, falling back to the key itself. */
export function translator(lang: Dict<string>): (key: string | null | undefined) => string | null {
  return (key) => (key ? (lang[key] ?? key) : null)
}

function prettifySlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Fetch one json.tarkov.dev file and unwrap its `data`. */
export async function fetchJsonData<T>(fetchFn: FetchFn, dataMode: DataMode, file: string): Promise<T> {
  const url = jsonUrl(dataMode, file)
  const body = (await fetchJson(
    fetchFn,
    url,
    { headers: { Accept: 'application/json' } },
    LARGE_REQUEST_TIMEOUT_MS
  )) as { data?: T } | null
  if (!body || typeof body !== 'object' || body.data == null) throw new Error(`${file}: no data in response`)
  return body.data
}

function positive(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

export function normalizeTarkovDevJson(
  input: TarkovDevJsonInput,
  dataMode: DataMode,
  fetchedAt: number
): PriceDataset {
  const itemText = translator(input.itemsLang)
  const traderText = translator(input.tradersLang)
  const flea = input.items.fleaMarket
  const feeRates = {
    sellOfferFeeRate: flea?.sellOfferFeeRate ?? DEFAULT_FLEA_FEE_RATES.sellOfferFeeRate,
    sellRequirementFeeRate: flea?.sellRequirementFeeRate ?? DEFAULT_FLEA_FEE_RATES.sellRequirementFeeRate
  }

  function bestTrader(raw: JsonItem): TraderPrice | null {
    let best: TraderPrice | null = null
    for (const offer of raw.sellToTrader ?? []) {
      const price = positive(offer?.priceRUB)
      if (!price || (best && price <= best.price)) continue
      const trader = input.traders[offer.trader]
      best = { name: traderText(trader?.name) ?? trader?.normalizedName ?? 'Trader', price }
    }
    return best
  }

  const items: LootItem[] = []
  for (const raw of values(input.items.items)) {
    const name = raw?.id ? itemText(raw.name) : null
    if (!raw?.id || !name) continue
    const width = Math.max(1, raw.width ?? 1)
    const height = Math.max(1, raw.height ?? 1)
    const types = raw.types ?? []
    const fleaPrice = positive(raw.lastLowPrice) ?? positive(raw.avg24hPrice)
    const basePrice = positive(raw.basePrice)
    const categoryId = raw.bsgCategoryId ?? raw.categories?.[0]
    const categoryInfo = categoryId ? input.items.itemCategories?.[categoryId] : undefined
    // Prefer the translated name; an untranslated key is worse than the category's slug.
    const category =
      (categoryInfo?.name && input.itemsLang[categoryInfo.name]) ||
      (categoryInfo?.normalizedName ? prettifySlug(categoryInfo.normalizedName) : null)
    items.push({
      id: raw.id,
      name,
      shortName: itemText(raw.shortName) ?? name,
      iconLink: raw.iconLink ?? `https://assets.tarkov.dev/${raw.id}-icon.webp`,
      wikiLink: raw.wikiLink ?? null,
      width,
      height,
      slots: width * height,
      types,
      category,
      bannedOnFlea: types.includes('noFlea'),
      minLevelForFlea: positive(raw.minLevelForFlea),
      fleaPrice,
      fleaFee: fleaPrice && basePrice ? fleaMarketFee(basePrice, fleaPrice, feeRates) : null,
      bestTrader: bestTrader(raw),
      basePrice,
      offerCount: typeof raw.lastOfferCount === 'number' ? raw.lastOfferCount : null,
      low24hPrice: positive(raw.low24hPrice),
      high24hPrice: positive(raw.high24hPrice)
    })
  }

  return {
    dataMode,
    source: 'tarkov.dev',
    fetchedAt,
    fleaMinLevel: positive(flea?.minPlayerLevel) ?? DEFAULT_FLEA_MIN_LEVEL,
    items,
    fleaFeeRates: feeRates,
    foundInRaidRequired: typeof flea?.foundInRaidRequired === 'boolean' ? flea.foundInRaidRequired : null
  }
}

export async function fetchTarkovDevJson(
  fetchFn: FetchFn,
  dataMode: DataMode,
  now: number = Date.now()
): Promise<PriceDataset> {
  const [items, itemsLang, traders, tradersLang] = await Promise.all([
    fetchJsonData<JsonItemsData>(fetchFn, dataMode, 'items'),
    fetchJsonData<Dict<string>>(fetchFn, dataMode, 'items_en'),
    fetchJsonData<JsonTraders>(fetchFn, dataMode, 'traders'),
    fetchJsonData<Dict<string>>(fetchFn, dataMode, 'traders_en')
  ])
  // tarkov.dev's site indexes this file directly by trader id; accept a { traders } wrapper too.
  const traderMap = (traders as { traders?: JsonTraders }).traders ?? traders
  const dataset = normalizeTarkovDevJson({ items, itemsLang, traders: traderMap, tradersLang }, dataMode, now)
  if (dataset.items.length === 0) throw new Error('returned no items')
  return dataset
}
