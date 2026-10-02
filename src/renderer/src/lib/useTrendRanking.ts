import { useMemo } from 'react'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../../shared/constants'
import {
  anyPattern,
  rankTrends,
  trendFunnel,
  type TrendClock,
  type TrendRow,
  type TrendSortKey
} from '../../../shared/fleaTrends'
import { dataModeFor } from '../../../shared/gameModes'
import type { PriceDataset, PublicSettings, TrendAnalysis } from '../../../shared/types'
import { fleaAccess } from '../../../shared/valuation'
import { useStore } from '../store'
import { useNow } from './useNow'

/** Sorts that need buy and sell times; until any item has them, the list falls back to today's swing. */
const PATTERN_SORTS: TrendSortKey[] = ['profit', 'spread', 'volatility', 'consistency']

export interface TrendRanking {
  analysis: TrendAnalysis | undefined
  rows: TrendRow[]
  /** Items left after each filter, in order (see `trendFunnel`). */
  funnel: ReturnType<typeof trendFunnel>
  /** Some item has a buy and sell time. */
  patternsReady: boolean
  /** The sort in effect, which may differ from the saved one before any item has buy and sell times. */
  sort: TrendSortKey
  /** The hour of the day now (local) and the analysis' interval length, for "buy now" and "sell now". */
  clock: TrendClock
}

/** The flea trends list for the current game mode, level and filters (empty when `active` is false). */
export function useTrendRanking(
  settings: PublicSettings | null,
  dataset: PriceDataset | null,
  active: boolean
): TrendRanking {
  const dataMode = settings ? dataModeFor(settings.gameMode) : 'pvp'
  const analysis = useStore((s) => s.trendAnalysis[dataMode])
  const filters = settings?.trends ?? null
  const saved = filters?.sort ?? 'profit'
  const level = settings ? settings.playerLevels[settings.gameMode] : 1
  const fleaMinLevel = dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL
  // "Buy now" moves on with the clock.
  const hour = new Date(useNow(60_000)).getHours()
  const bucketHours = analysis?.bucketHours ?? filters?.intervalHours ?? 3
  const clock = useMemo<TrendClock>(() => ({ hour, bucketHours }), [hour, bucketHours])

  const all = useMemo<TrendRow[]>(
    () =>
      active && dataset
        ? dataset.items.map((item) => ({
            item,
            stats: analysis?.stats[item.id] ?? null,
            access: fleaAccess(item, level, fleaMinLevel)
          }))
        : [],
    [active, dataset, analysis, level, fleaMinLevel]
  )
  const patternsReady = useMemo(() => anyPattern(all), [all])
  const sort: TrendSortKey = !patternsReady && PATTERN_SORTS.includes(saved) ? 'swing' : saved

  const { rows, funnel } = useMemo(() => {
    if (!filters || !all.length) return { rows: [], funnel: [] }
    return {
      rows: rankTrends(all, filters, sort, patternsReady, clock),
      funnel: trendFunnel(all, filters, patternsReady, clock)
    }
  }, [all, filters, sort, patternsReady, clock])

  return { analysis, rows, funnel, patternsReady, sort, clock }
}
