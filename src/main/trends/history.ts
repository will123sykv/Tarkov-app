import { join } from 'node:path'
import type { HistoryPoint } from '../../shared/fleaTrends'
import type { DataMode, PriceDataset } from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { errorMessage, type FetchFn } from '../pricing/http'
import { fetchJsonData } from '../pricing/tarkovDevJson'
import { liquidItems } from './recorder'

// tarkov.dev's price history for each item (json.tarkov.dev `prices/<id>`): one point per day going
// back years, and a point every scan (about every 2 hours) over the last 30 days. Those 30 days cover
// every hour of the day, so time-of-day patterns can be measured without the app recording around
// the clock. Fetched for the most-listed items, kept on disk, and refetched once 2 hours old.

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** How far back tarkov.dev keeps a point per scan. */
export const HISTORY_DAYS = 30
/** tarkov.dev rescans an item about this often, so a fresher copy has nothing new. */
const MAX_AGE_MS = 2 * HOUR
/** After a failed fetch, wait this long before trying again. */
const RETRY_MS = 10 * 60_000

/** tarkov.dev's per-item history, oldest first, dropping points without a time. */
export function normalizeDailyHistory(raw: unknown): HistoryPoint[] {
  if (!Array.isArray(raw)) return []
  const points: HistoryPoint[] = []
  for (const p of raw as Record<string, unknown>[]) {
    const t = Number(p?.timestamp)
    if (!Number.isFinite(t)) continue
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
    points.push({ t, price: num(p.price), priceMin: num(p.priceMin), offers: num(p.offerCount) })
  }
  return points.sort((a, b) => a.t - b.t)
}

/** One item's last 30 days: `[time, lowest price, offers]`. */
interface CachedItem {
  fetchedAt: number
  points: [number, number, number | null][]
}

interface CacheFile {
  version: 1
  items: Record<string, CachedItem>
}

export interface TarkovDevHistory {
  /** Price points per item over the last `HISTORY_DAYS` days. */
  byItem: Map<string, HistoryPoint[]>
  /** Why the latest fetch failed, if it did (older copies are still used). */
  error: string | null
  /** When the newest copy was fetched. */
  fetchedAt: number | null
}

export interface HistoryOptions {
  /** Root folder of the trends data; each data mode gets a subfolder. */
  dir: string
  fetchFn: FetchFn
  now?: () => number
  /** How many of the most-listed items to fetch. */
  maxItems?: number
  /** Items cheaper than this are left out, as the recorder does. */
  minPrice?: number
  /** Requests at a time. */
  concurrency?: number
}

export function createTarkovDevHistory(opts: HistoryOptions) {
  const now = opts.now ?? Date.now
  const maxItems = opts.maxItems ?? 300
  const minPrice = opts.minPrice ?? 10_000
  const concurrency = opts.concurrency ?? 6
  const files = new Map<DataMode, CacheFile>()
  const failures = new Map<DataMode, { at: number; message: string }>()
  const refreshing = new Map<DataMode, Promise<void>>()
  const path = (dataMode: DataMode): string => join(opts.dir, dataMode, 'tarkovdev-history.json')

  async function cached(dataMode: DataMode): Promise<CacheFile> {
    let file = files.get(dataMode)
    if (!file) {
      const raw = (await readJsonFile(path(dataMode))) as Partial<CacheFile> | undefined
      file = { version: 1, items: raw?.version === 1 && raw.items ? raw.items : {} }
      files.set(dataMode, file)
    }
    return file
  }

  async function refresh(dataset: PriceDataset): Promise<void> {
    const dataMode = dataset.dataMode
    const file = await cached(dataMode)
    const t = now()
    const failure = failures.get(dataMode)
    if (failure && t - failure.at < RETRY_MS) return
    const wanted = liquidItems(dataset.items, minPrice, maxItems)
    const stale = wanted.filter((item) => !(t - (file.items[item.id]?.fetchedAt ?? 0) < MAX_AGE_MS))
    if (!stale.length) return
    let fetched = 0
    let error: string | null = null
    for (let i = 0; i < stale.length; i += concurrency) {
      await Promise.all(
        stale.slice(i, i + concurrency).map(async (item) => {
          try {
            const raw = await fetchJsonData<unknown>(opts.fetchFn, dataMode, `prices/${item.id}`)
            const from = t - HISTORY_DAYS * DAY
            file.items[item.id] = {
              fetchedAt: t,
              points: normalizeDailyHistory(raw)
                .filter((p) => p.t >= from && p.priceMin !== null)
                .map((p) => [p.t, p.priceMin!, p.offers])
            }
            fetched++
          } catch (err) {
            error ??= errorMessage(err)
          }
        })
      )
      // Offline (or tarkov.dev is down): stop rather than time out on every item.
      if (error && !fetched) break
    }
    // Items that dropped out of the list a day ago aren't kept.
    const keep = new Set(wanted.map((item) => item.id))
    for (const [id, entry] of Object.entries(file.items))
      if (!keep.has(id) && t - entry.fetchedAt > DAY) delete file.items[id]
    if (fetched) await writeJsonFileAtomic(path(dataMode), file)
    if (error) failures.set(dataMode, { at: t, message: error })
    else failures.delete(dataMode)
  }

  return {
    /**
     * The last 30 days of tarkov.dev's prices for the most-listed items of `dataset`, refetching
     * copies 2 hours old first (one refresh at a time per mode). Without a dataset, what's on disk.
     */
    async load(dataMode: DataMode, dataset: PriceDataset | null): Promise<TarkovDevHistory> {
      if (dataset) {
        let pending = refreshing.get(dataMode)
        if (!pending) {
          pending = refresh(dataset).finally(() => refreshing.delete(dataMode))
          refreshing.set(dataMode, pending)
        }
        await pending
      }
      const file = await cached(dataMode)
      const from = now() - HISTORY_DAYS * DAY
      const byItem = new Map<string, HistoryPoint[]>()
      let fetchedAt: number | null = null
      for (const [id, entry] of Object.entries(file.items)) {
        fetchedAt = Math.max(fetchedAt ?? 0, entry.fetchedAt)
        const points = entry.points
          .filter(([t]) => t >= from)
          .map(([t, priceMin, offers]) => ({ t, price: null, priceMin, offers }))
        if (points.length) byItem.set(id, points)
      }
      return { byItem, error: failures.get(dataMode)?.message ?? null, fetchedAt }
    }
  }
}

export type TarkovDevHistoryService = ReturnType<typeof createTarkovDevHistory>
