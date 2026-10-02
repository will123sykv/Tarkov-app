import { analyzeHistory, type HistoryPoint } from '../../shared/fleaTrends'
import type {
  DataMode,
  HistorySourceStatus,
  PriceDataset,
  TrendAnalysis,
  TrendInterval,
  TrendSeries
} from '../../shared/types'
import { errorMessage, type FetchFn } from '../pricing/http'
import { fetchJsonData } from '../pricing/tarkovDevJson'
import { normalizeDailyHistory, type TarkovDevHistoryService } from './history'
import type { PriceRecorder } from './recorder'

export { normalizeDailyHistory }

export interface TrendServiceDeps {
  recorder: PriceRecorder
  /** tarkov.dev's last 30 days of prices; without it, only the app's own recordings are used. */
  history?: TarkovDevHistoryService
  getDataset: (dataMode: DataMode) => PriceDataset | null
  fetchFn: FetchFn
  now?: () => number
  /** Local hour and calendar day of a timestamp (the player's time zone). */
  hourOf?: (t: number) => number
  dayOf?: (t: number) => string
}

/** Re-analyse at least this often even without new recordings, as the look-back window moves on. */
const CACHE_MS = 15 * 60_000
const DAILY_HISTORY_DAYS = 60
const DEFAULT_INTERVAL: TrendInterval = 3

function localDay(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Every recorded item shares its snapshot times, so each time only needs converting once. */
function memoize<T>(fn: (t: number) => T): (t: number) => T {
  const cache = new Map<number, T>()
  return (t) => {
    let value = cache.get(t)
    if (value === undefined) cache.set(t, (value = fn(t)))
    return value
  }
}

/** What one source of prices covers: items, days, points per hour of the day, the newest point. */
function sourceStatus(
  id: HistorySourceStatus['id'],
  byItem: ReadonlyMap<string, readonly HistoryPoint[]>,
  from: number,
  hourOf: (t: number) => number,
  dayOf: (t: number) => string,
  error: string | null
): HistorySourceStatus {
  const byHour = Array.from({ length: 24 }, () => 0)
  const days = new Set<string>()
  let lastAt: number | null = null
  let items = 0
  for (const points of byItem.values()) {
    let any = false
    for (const p of points) {
      if (p.t < from) continue
      any = true
      byHour[hourOf(p.t)]++
      days.add(dayOf(p.t))
      if (lastAt === null || p.t > lastAt) lastAt = p.t
    }
    if (any) items++
  }
  return { id, items, days: days.size, byHour, lastAt, error }
}

export function createTrendService(deps: TrendServiceDeps) {
  const now = deps.now ?? Date.now
  const localHour = deps.hourOf ?? ((t: number) => new Date(t).getHours())
  const localDayOf = deps.dayOf ?? localDay

  async function analyzeNow(
    dataMode: DataMode,
    days: number,
    bucketHours: number,
    recordings: Map<string, HistoryPoint[]>,
    history: Awaited<ReturnType<TarkovDevHistoryService['load']>> | null
  ): Promise<TrendAnalysis> {
    const hourOf = memoize(localHour)
    const dayOf = memoize(localDayOf)
    const dataset = deps.getDataset(dataMode)
    const itemsById = new Map(dataset?.items.map((i) => [i.id, i]) ?? [])
    const t = now()
    const from = t - days * 24 * 3_600_000

    // The app's recordings: when they were taken, for the coverage summary.
    const hours = Array.from({ length: 24 }, () => 0)
    const snapshotTimes = new Set<number>()
    const dayKeys = new Set<string>()
    for (const points of recordings.values()) {
      for (const p of points) {
        if (snapshotTimes.has(p.t)) continue
        snapshotTimes.add(p.t)
        hours[hourOf(p.t)]++
        dayKeys.add(dayOf(p.t))
      }
    }

    const ids = new Set([...recordings.keys(), ...(history?.byItem.keys() ?? [])])
    const stats: TrendAnalysis['stats'] = {}
    let analysed = 0
    for (const id of ids) {
      // Let the main process handle other events between batches.
      if (++analysed % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve))
      const own = recordings.get(id) ?? []
      const theirs = history?.byItem.get(id) ?? []
      const points =
        own.length && theirs.length
          ? [...theirs, ...own].sort((a, b) => a.t - b.t)
          : own.length
            ? own
            : theirs
      stats[id] = analyzeHistory(points, {
        now: t,
        days,
        bucketHours,
        hourOf,
        dayOf,
        basePrice: itemsById.get(id)?.basePrice ?? null,
        feeRates: dataset?.fleaFeeRates
      })
    }
    const times = [...snapshotTimes].sort((a, b) => a - b)
    const sources: HistorySourceStatus[] = []
    if (history) sources.push(sourceStatus('tarkov.dev', history.byItem, from, hourOf, dayOf, history.error))
    sources.push(sourceStatus('local', recordings, from, hourOf, dayOf, null))
    return {
      dataMode,
      days,
      bucketHours,
      coverage: {
        snapshots: times.length,
        days: dayKeys.size,
        firstAt: times[0] ?? null,
        lastAt: times.at(-1) ?? null,
        snapshotsByHour: hours,
        items: ids.size,
        sources
      },
      stats
    }
  }

  let cached: { key: string; analysis: TrendAnalysis } | null = null

  return {
    /**
     * Time-of-day statistics for every item with prices (tarkov.dev's last 30 days and the app's
     * own recordings), plus what each source covers. Reuses the last result until something new
     * is recorded or fetched.
     */
    async analyze(
      dataMode: DataMode,
      days: number,
      bucketHours: TrendInterval = DEFAULT_INTERVAL
    ): Promise<TrendAnalysis> {
      const dataset = deps.getDataset(dataMode)
      const history = deps.history ? await deps.history.load(dataMode, dataset) : null
      const key = [
        dataMode,
        days,
        bucketHours,
        deps.recorder.lastRecordedAt(dataMode),
        history?.fetchedAt ?? null,
        history?.error ?? null,
        dataset !== null,
        Math.floor(now() / CACHE_MS)
      ].join('|')
      if (cached?.key === key) return cached.analysis
      const recordings = await deps.recorder.load(dataMode, days)
      const analysis = await analyzeNow(dataMode, days, bucketHours, recordings, history)
      cached = { key, analysis }
      return analysis
    },

    /** tarkov.dev's history for one item (a point a day, and every scan over the last 30 days). */
    async series(dataMode: DataMode, itemId: string): Promise<TrendSeries> {
      let daily: HistoryPoint[] = []
      let dailyError: string | null = null
      try {
        const from = now() - DAILY_HISTORY_DAYS * 24 * 3_600_000
        daily = normalizeDailyHistory(await fetchJsonData(deps.fetchFn, dataMode, `prices/${itemId}`)).filter(
          (p) => p.t >= from
        )
      } catch (err) {
        dailyError = errorMessage(err)
      }
      return { itemId, daily, dailyError }
    }
  }
}

export type TrendService = ReturnType<typeof createTrendService>
