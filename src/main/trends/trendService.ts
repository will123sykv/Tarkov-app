import { analyzeHistory, type HistoryPoint } from '../../shared/fleaTrends'
import type { DataMode, PriceDataset, TrendAnalysis, TrendSeries } from '../../shared/types'
import { errorMessage, type FetchFn } from '../pricing/http'
import { fetchJsonData } from '../pricing/tarkovDevJson'
import type { PriceRecorder } from './recorder'

export interface TrendServiceDeps {
  recorder: PriceRecorder
  getDataset: (dataMode: DataMode) => PriceDataset | null
  fetchFn: FetchFn
  now?: () => number
  /** Local hour and calendar day of a timestamp (the player's time zone). */
  hourOf?: (t: number) => number
  dayOf?: (t: number) => string
}

const BUCKET_HOURS = 1
/** Re-analyse at least this often even without new recordings, as the look-back window moves on. */
const CACHE_MS = 15 * 60_000
const DAILY_HISTORY_DAYS = 60

function localDay(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** tarkov.dev's per-item history: one point per day, plus the latest scan. */
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

/** Every recorded item shares its snapshot times, so each time only needs converting once. */
function memoize<T>(fn: (t: number) => T): (t: number) => T {
  const cache = new Map<number, T>()
  return (t) => {
    let value = cache.get(t)
    if (value === undefined) cache.set(t, (value = fn(t)))
    return value
  }
}

export function createTrendService(deps: TrendServiceDeps) {
  const now = deps.now ?? Date.now
  const localHour = deps.hourOf ?? ((t: number) => new Date(t).getHours())
  const localDayOf = deps.dayOf ?? localDay

  async function analyzeNow(dataMode: DataMode, days: number): Promise<TrendAnalysis> {
    const recordings = await deps.recorder.load(dataMode, days)
    const hourOf = memoize(localHour)
    const dayOf = memoize(localDayOf)
    const dataset = deps.getDataset(dataMode)
    const itemsById = new Map(dataset?.items.map((i) => [i.id, i]) ?? [])
    const t = now()

    const hours = Array.from({ length: 24 }, () => 0)
    const snapshotTimes = new Set<number>()
    const dayKeys = new Set<string>()
    const stats: TrendAnalysis['stats'] = {}
    let analysed = 0
    for (const [id, points] of recordings) {
      // Let the main process handle other events between batches (30 days takes ~0.5 s in all).
      if (++analysed % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve))
      for (const p of points) {
        if (!snapshotTimes.has(p.t)) {
          snapshotTimes.add(p.t)
          hours[hourOf(p.t)]++
          dayKeys.add(dayOf(p.t))
        }
      }
      stats[id] = analyzeHistory(points, {
        now: t,
        days,
        bucketHours: BUCKET_HOURS,
        hourOf,
        dayOf,
        basePrice: itemsById.get(id)?.basePrice ?? null,
        feeRates: dataset?.fleaFeeRates
      })
    }
    const times = [...snapshotTimes].sort((a, b) => a - b)
    return {
      dataMode,
      days,
      bucketHours: BUCKET_HOURS,
      coverage: {
        snapshots: times.length,
        days: dayKeys.size,
        firstAt: times[0] ?? null,
        lastAt: times.at(-1) ?? null,
        snapshotsByHour: hours,
        items: recordings.size
      },
      stats
    }
  }

  let cached: { key: string; analysis: TrendAnalysis } | null = null

  return {
    /**
     * Time-of-day statistics for every recorded item, plus how much has been recorded so far.
     * Reuses the last result until something is recorded (a 30-day analysis takes about a second).
     */
    async analyze(dataMode: DataMode, days: number): Promise<TrendAnalysis> {
      const key = [
        dataMode,
        days,
        deps.recorder.lastRecordedAt(dataMode),
        deps.getDataset(dataMode) !== null,
        Math.floor(now() / CACHE_MS)
      ].join('|')
      if (cached?.key === key) return cached.analysis
      const analysis = await analyzeNow(dataMode, days)
      cached = { key, analysis }
      return analysis
    },

    /** tarkov.dev's daily history for one item, for the longer view. */
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
