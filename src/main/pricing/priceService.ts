import { join } from 'node:path'
import { isDataMode } from '../../shared/gameModes'
import type { DataMode, PriceDataset, PriceFetchResult } from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { errorMessage, type FetchFn } from './http'
import { fetchTarkovDev } from './tarkovDev'
import { fetchTarkovDevJson } from './tarkovDevJson'
import { enrichWithStaticData, fetchTarkovMarket } from './tarkovMarket'

export interface PriceServiceDeps {
  fetchFn: FetchFn
  cacheDir: string
  getTarkovMarketKey: () => string | null
  now?: () => number
  log?: (message: string) => void
}

export interface PriceService {
  loadCached(dataMode: DataMode): Promise<PriceDataset | null>
  /** json.tarkov.dev → tarkov.dev GraphQL → tarkov-market (when a key is set) → local cache. */
  fetchFresh(dataMode: DataMode): Promise<PriceFetchResult>
}

function isDataset(value: unknown, dataMode: DataMode): value is PriceDataset {
  const d = value as PriceDataset
  return (
    typeof d === 'object' &&
    d !== null &&
    isDataMode(d.dataMode) &&
    d.dataMode === dataMode &&
    typeof d.fetchedAt === 'number' &&
    typeof d.fleaMinLevel === 'number' &&
    Array.isArray(d.items)
  )
}

export function createPriceService(deps: PriceServiceDeps): PriceService {
  const now = deps.now ?? Date.now
  const log = deps.log ?? (() => {})
  const cachePath = (dataMode: DataMode): string => join(deps.cacheDir, `prices-${dataMode}.json`)

  async function loadCached(dataMode: DataMode): Promise<PriceDataset | null> {
    const raw = await readJsonFile(cachePath(dataMode))
    return isDataset(raw, dataMode) ? raw : null
  }

  async function save(dataset: PriceDataset): Promise<void> {
    try {
      await writeJsonFileAtomic(cachePath(dataset.dataMode), dataset)
    } catch (err) {
      log(`Failed to write price cache: ${errorMessage(err)}`)
    }
  }

  async function fetchFresh(dataMode: DataMode): Promise<PriceFetchResult> {
    const errors: string[] = []

    const tarkovDevSources: [string, () => Promise<PriceDataset>][] = [
      ['json.tarkov.dev', () => fetchTarkovDevJson(deps.fetchFn, dataMode, now())],
      ['api.tarkov.dev', () => fetchTarkovDev(deps.fetchFn, dataMode, now())]
    ]
    for (const [label, load] of tarkovDevSources) {
      try {
        const dataset = await load()
        await save(dataset)
        return { dataset, fromCache: false, error: errors.length ? errors.join(' · ') : null }
      } catch (err) {
        errors.push(`${label}: ${errorMessage(err)}`)
      }
    }

    const apiKey = deps.getTarkovMarketKey()
    if (apiKey) {
      try {
        const cached = await loadCached(dataMode)
        const dataset = enrichWithStaticData(
          await fetchTarkovMarket(deps.fetchFn, dataMode, apiKey, now()),
          cached
        )
        await save(dataset)
        return { dataset, fromCache: false, error: errors.join(' · ') }
      } catch (err) {
        errors.push(`tarkov-market: ${errorMessage(err)}`)
      }
    }

    const error = errors.join(' · ')
    log(`Price refresh failed (${dataMode}): ${error}`)
    const cached = await loadCached(dataMode)
    return { dataset: cached, fromCache: cached !== null, error }
  }

  return { loadCached, fetchFresh }
}
