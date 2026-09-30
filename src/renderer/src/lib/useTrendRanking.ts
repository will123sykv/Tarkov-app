import { useMemo } from 'react'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../../shared/constants'
import { rankTrends, trendFunnel, type TrendRow, type TrendSortKey } from '../../../shared/fleaTrends'
import { dataModeFor } from '../../../shared/gameModes'
import type { PriceDataset, PublicSettings, TrendAnalysis } from '../../../shared/types'
import { fleaAccess } from '../../../shared/valuation'
import { useStore } from '../store'

/** Days of recordings needed before time-of-day patterns are shown. */
export const MIN_PATTERN_DAYS = 3
/** Sorts that need a time-of-day pattern; while collecting, the list falls back to today's swing. */
const PATTERN_SORTS: TrendSortKey[] = ['profit', 'spread', 'volatility', 'consistency']

export interface TrendRanking {
  analysis: TrendAnalysis | undefined
  rows: TrendRow[]
  /** Items left after each filter, in order (see `trendFunnel`). */
  funnel: ReturnType<typeof trendFunnel>
  patternsReady: boolean
  /** The sort in effect, which may differ from the saved one while collecting. */
  sort: TrendSortKey
}

/** The flea trends list for the current game mode, level and filters (empty when `active` is false). */
export function useTrendRanking(
  settings: PublicSettings | null,
  dataset: PriceDataset | null,
  active: boolean
): TrendRanking {
  const dataMode = settings ? dataModeFor(settings.gameMode) : 'pvp'
  const analysis = useStore((s) => s.trendAnalysis[dataMode])
  const patternsReady = (analysis?.coverage.days ?? 0) >= MIN_PATTERN_DAYS
  const filters = settings?.trends ?? null
  const saved = filters?.sort ?? 'profit'
  const sort: TrendSortKey = !patternsReady && PATTERN_SORTS.includes(saved) ? 'swing' : saved
  const level = settings ? settings.playerLevels[settings.gameMode] : 1
  const fleaMinLevel = dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL

  const { rows, funnel } = useMemo(() => {
    if (!active || !dataset || !filters) return { rows: [], funnel: [] }
    const all: TrendRow[] = dataset.items.map((item) => ({
      item,
      stats: analysis?.stats[item.id] ?? null,
      access: fleaAccess(item, level, fleaMinLevel)
    }))
    return {
      rows: rankTrends(all, filters, sort, patternsReady),
      funnel: trendFunnel(all, filters, patternsReady)
    }
  }, [active, dataset, analysis, level, fleaMinLevel, filters, sort, patternsReady])

  return { analysis, rows, funnel, patternsReady, sort }
}
