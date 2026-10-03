import { appendFile, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { HistoryPoint } from '../../shared/fleaTrends'
import type { DataMode, LootItem, PriceDataset } from '../../shared/types'

const DAY_MS = 24 * 3_600_000

export interface RecorderOptions {
  /** Root folder; each data mode gets a subfolder of per-day files. */
  dir: string
  now?: () => number
  /** Minimum time between two recordings of the same mode. */
  intervalMs?: number
  /** How many of the most-listed items to record. */
  maxItems?: number
  /**
   * Skip items cheaper than this: a 30% swing on them can't clear the default ₽5,000 profit after
   * the listing fee, so the slots go to pricier liquid items.
   */
  minPrice?: number
  retentionDays?: number
}

/** UTC calendar day, used only to name files. */
function fileDay(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * The most-listed items worth recording or fetching the history of: tradable on the flea, not
 * weapon presets (which duplicate their guns), worth `minPrice` or more, most offers first.
 */
export function liquidItems(items: readonly LootItem[], minPrice: number, max: number): LootItem[] {
  return items
    .filter(
      (i) =>
        !i.bannedOnFlea &&
        !i.types.includes('preset') &&
        (i.fleaPrice ?? 0) >= minPrice &&
        (i.offerCount ?? 0) > 0
    )
    .sort((a, b) => (b.offerCount ?? 0) - (a.offerCount ?? 0))
    .slice(0, max)
}

/**
 * Records the lowest flea price and offer count of the most-listed items, so time-of-day patterns
 * can be measured later (tarkov.dev only publishes one historical price per day). Each recording
 * appends one line, `[t, [ids], [lowestPrices], [offers]]`, to `<dir>/<mode>/<YYYY-MM-DD>.ndjson`.
 */
export function createPriceRecorder(opts: RecorderOptions) {
  const now = opts.now ?? Date.now
  const intervalMs = opts.intervalMs ?? 15 * 60_000
  const maxItems = opts.maxItems ?? 300
  const minPrice = Math.max(1, opts.minPrice ?? 10_000)
  const retentionDays = opts.retentionDays ?? 30
  const lastRecorded = new Map<DataMode, number>()
  /** What the last snapshot held, to skip recording the same prices again. */
  const lastContent = new Map<DataMode, string>()
  const lastPruned = new Map<DataMode, string>()
  const modeDir = (dataMode: DataMode): string => join(opts.dir, dataMode)

  async function prune(dataMode: DataMode): Promise<void> {
    const today = fileDay(now())
    if (lastPruned.get(dataMode) === today) return
    lastPruned.set(dataMode, today)
    const oldest = fileDay(now() - retentionDays * DAY_MS)
    for (const file of await readdir(modeDir(dataMode)).catch(() => [] as string[])) {
      if (file.endsWith('.ndjson') && file.slice(0, 10) < oldest)
        await rm(join(modeDir(dataMode), file), { force: true })
    }
  }

  return {
    /** Save a snapshot of a freshly fetched dataset, at most once per interval per mode. */
    async record(dataset: PriceDataset): Promise<number> {
      const t = now()
      const previous = lastRecorded.get(dataset.dataMode)
      if (previous !== undefined && t - previous < intervalMs) return 0
      const liquid = liquidItems(dataset.items, minPrice, maxItems)
      if (liquid.length === 0) return 0
      const content = JSON.stringify([
        liquid.map((i) => i.id),
        liquid.map((i) => i.fleaPrice),
        liquid.map((i) => i.offerCount)
      ])
      // Nothing changed since the last snapshot (tarkov.dev hasn't checked prices again): recording
      // it again would only make the same prices look like a steady price.
      if (lastContent.get(dataset.dataMode) === content) return 0
      lastContent.set(dataset.dataMode, content)
      lastRecorded.set(dataset.dataMode, t)
      await mkdir(modeDir(dataset.dataMode), { recursive: true })
      const line = `[${t},${content.slice(1)}`
      await appendFile(join(modeDir(dataset.dataMode), `${fileDay(t)}.ndjson`), line + '\n', 'utf8')
      await prune(dataset.dataMode)
      return liquid.length
    },

    /** When this mode was last recorded in this session. */
    lastRecordedAt(dataMode: DataMode): number | null {
      return lastRecorded.get(dataMode) ?? null
    },

    /** Recorded points per item over the last `days` days. Unreadable lines are skipped. */
    async load(dataMode: DataMode, days: number): Promise<Map<string, HistoryPoint[]>> {
      const from = now() - days * DAY_MS
      const firstFile = fileDay(from)
      const files = (await readdir(modeDir(dataMode)).catch(() => [] as string[]))
        .filter((f) => f.endsWith('.ndjson') && f.slice(0, 10) >= firstFile)
        .sort()
      const byItem = new Map<string, HistoryPoint[]>()
      // Snapshots the same as the one before (recorded before 1.14.0 from an old cached copy) count once.
      let previous = ''
      for (const file of files) {
        const text = await readFile(join(modeDir(dataMode), file), 'utf8').catch(() => '')
        for (const line of text.split('\n')) {
          if (!line) continue
          let snapshot: unknown
          try {
            snapshot = JSON.parse(line)
          } catch {
            continue // A line cut short by a crash.
          }
          if (!Array.isArray(snapshot)) continue
          const [t, ids, prices, offers] = snapshot as [unknown, unknown, unknown, unknown]
          if (typeof t !== 'number' || t < from || !Array.isArray(ids) || !Array.isArray(prices)) continue
          const content = line.slice(line.indexOf(','))
          if (content === previous) continue
          previous = content
          const counts = Array.isArray(offers) ? offers : []
          ids.forEach((id, i) => {
            const priceMin = prices[i]
            if (typeof id !== 'string' || typeof priceMin !== 'number') return
            let points = byItem.get(id)
            if (!points) byItem.set(id, (points = []))
            points.push({
              t,
              price: null,
              priceMin,
              offers: typeof counts[i] === 'number' ? counts[i] : null
            })
          })
        }
      }
      return byItem
    }
  }
}

export type PriceRecorder = ReturnType<typeof createPriceRecorder>
