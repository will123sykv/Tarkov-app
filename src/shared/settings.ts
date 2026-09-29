import {
  DEFAULT_REFRESH_INTERVAL_MIN,
  MAX_PLAYER_LEVEL,
  MAX_REFRESH_INTERVAL_MIN,
  MIN_PLAYER_LEVEL,
  MIN_REFRESH_INTERVAL_MIN
} from './constants'
import { isGameMode } from './gameModes'
import type { TrendSortKey } from './fleaTrends'
import type {
  AppView,
  GameMode,
  MapSettings,
  QuestSettings,
  QuestStatusFilter,
  Settings,
  SortKey,
  TrendSettings
} from './types'

const SORT_KEYS: SortKey[] = ['valuePerSlot', 'worth', 'flea', 'trader', 'slots', 'name', 'chance']

export const DEFAULT_SETTINGS: Settings = {
  gameMode: 'pvp',
  playerLevels: { pvp: 15, pve: 15, season: 1 },
  hideLocked: false,
  refreshIntervalMin: DEFAULT_REFRESH_INTERVAL_MIN,
  subtractFleaFee: true,
  minValuePerSlot: 0,
  sort: { key: 'valuePerSlot', dir: 'desc' },
  pool: { containerId: null, mapId: null },
  containerSort: 'value',
  view: 'loot',
  trends: {
    days: 7,
    minOffers: 50,
    minPrice: 20_000,
    minProfit: 5_000,
    minConsistency: 0.7,
    minSwing: 0.3,
    sort: 'profit',
    tradableOnly: true
  },
  backgroundRecording: false,
  startWithWindows: false,
  gameLogsDir: null,
  quests: {
    statuses: ['available', 'active'],
    traderId: null,
    mapId: null,
    kappaOnly: false,
    lightkeeperOnly: false,
    faction: null
  },
  maps: {
    mapKey: 'customs',
    questScope: 'active',
    showExtracts: true,
    showSpawns: false,
    showTransits: true
  }
}

const VIEWS: AppView[] = ['loot', 'trends', 'quests', 'maps', 'raids']
const QUEST_STATUSES: QuestStatusFilter[] = ['available', 'active', 'locked', 'completed', 'failed']

function sanitizeQuests(raw: unknown): QuestSettings {
  const d = DEFAULT_SETTINGS.quests
  const r = isRecord(raw) ? raw : {}
  const statuses = Array.isArray(r.statuses)
    ? QUEST_STATUSES.filter((s) => (r.statuses as unknown[]).includes(s))
    : d.statuses
  return {
    statuses,
    traderId: optionalId(r.traderId),
    mapId: optionalId(r.mapId),
    kappaOnly: r.kappaOnly === true,
    lightkeeperOnly: r.lightkeeperOnly === true,
    faction: r.faction === 'USEC' || r.faction === 'BEAR' ? r.faction : null
  }
}

function sanitizeMaps(raw: unknown): MapSettings {
  const d = DEFAULT_SETTINGS.maps
  const r = isRecord(raw) ? raw : {}
  return {
    mapKey: typeof r.mapKey === 'string' && /^[a-z0-9-]{1,40}$/.test(r.mapKey) ? r.mapKey : d.mapKey,
    questScope: r.questScope === 'available' || r.questScope === 'none' ? r.questScope : 'active',
    showExtracts: typeof r.showExtracts === 'boolean' ? r.showExtracts : d.showExtracts,
    showSpawns: typeof r.showSpawns === 'boolean' ? r.showSpawns : d.showSpawns,
    showTransits: typeof r.showTransits === 'boolean' ? r.showTransits : d.showTransits
  }
}

const TREND_SORTS: TrendSortKey[] = ['profit', 'spread', 'volatility', 'consistency', 'offers', 'swing']
const TREND_DAYS = [7, 14, 30] as const

/** 1.3.0's filter defaults. It saved them in full, so a block without `minSwing` came from it. */
const TRENDS_1_3_0_DEFAULTS: Record<string, number> = {
  minOffers: 25,
  minPrice: 5_000,
  minProfit: 1_000,
  minConsistency: 0.6
}

function sanitizeTrends(raw: unknown): TrendSettings {
  const d = DEFAULT_SETTINGS.trends
  const r = isRecord(raw) ? { ...raw } : {}
  if (!('minSwing' in r)) {
    // Filters still at 1.3.0's defaults move to the tighter ones; ones the player changed stay.
    for (const [key, old] of Object.entries(TRENDS_1_3_0_DEFAULTS)) if (r[key] === old) delete r[key]
  }
  const share = Number(r.minConsistency)
  const swing = Number(r.minSwing)
  return {
    days: TREND_DAYS.find((n) => n === r.days) ?? d.days,
    minOffers: clampInt(r.minOffers, 0, 100_000, d.minOffers),
    minPrice: clampInt(r.minPrice, 0, 100_000_000, d.minPrice),
    minProfit: clampInt(r.minProfit, -100_000_000, 100_000_000, d.minProfit),
    minConsistency: Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : d.minConsistency,
    minSwing: Number.isFinite(swing) ? Math.min(2, Math.max(0, swing)) : d.minSwing,
    sort: TREND_SORTS.includes(r.sort as TrendSortKey) ? (r.sort as TrendSortKey) : d.sort,
    tradableOnly: typeof r.tradableOnly === 'boolean' ? r.tradableOnly : d.tradableOnly
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function clampPlayerLevel(value: unknown, fallback: number = MIN_PLAYER_LEVEL): number {
  return clampInt(value, MIN_PLAYER_LEVEL, MAX_PLAYER_LEVEL, fallback)
}

function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Coerce anything (e.g. a hand-edited or outdated settings file) into valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS
  const r = isRecord(raw) ? raw : {}
  const levels = isRecord(r.playerLevels) ? r.playerLevels : {}
  const sort = isRecord(r.sort) ? r.sort : {}
  const pool = isRecord(r.pool) ? r.pool : {}

  const playerLevels = {} as Record<GameMode, number>
  for (const mode of Object.keys(d.playerLevels) as GameMode[]) {
    playerLevels[mode] = clampPlayerLevel(levels[mode], d.playerLevels[mode])
  }

  return {
    gameMode: isGameMode(r.gameMode) ? r.gameMode : d.gameMode,
    playerLevels,
    hideLocked: typeof r.hideLocked === 'boolean' ? r.hideLocked : d.hideLocked,
    refreshIntervalMin: clampInt(
      r.refreshIntervalMin,
      MIN_REFRESH_INTERVAL_MIN,
      MAX_REFRESH_INTERVAL_MIN,
      d.refreshIntervalMin
    ),
    subtractFleaFee: typeof r.subtractFleaFee === 'boolean' ? r.subtractFleaFee : d.subtractFleaFee,
    minValuePerSlot: clampInt(r.minValuePerSlot, 0, 100_000_000, d.minValuePerSlot),
    sort: {
      key: SORT_KEYS.includes(sort.key as SortKey) ? (sort.key as SortKey) : d.sort.key,
      dir: sort.dir === 'asc' || sort.dir === 'desc' ? sort.dir : d.sort.dir
    },
    pool: {
      containerId: optionalId(pool.containerId),
      mapId: optionalId(pool.mapId)
    },
    containerSort: r.containerSort === 'name' ? 'name' : 'value',
    view: VIEWS.includes(r.view as AppView) ? (r.view as AppView) : 'loot',
    trends: sanitizeTrends(r.trends),
    backgroundRecording: r.backgroundRecording === true,
    startWithWindows: r.startWithWindows === true,
    gameLogsDir:
      typeof r.gameLogsDir === 'string' && r.gameLogsDir.length <= 1024 ? r.gameLogsDir || null : null,
    quests: sanitizeQuests(r.quests),
    maps: sanitizeMaps(r.maps)
  }
}

export function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  return sanitizeSettings({
    ...current,
    ...patch,
    playerLevels: { ...current.playerLevels, ...patch.playerLevels },
    sort: { ...current.sort, ...patch.sort },
    pool: { ...current.pool, ...patch.pool },
    trends: { ...current.trends, ...patch.trends },
    quests: { ...current.quests, ...patch.quests },
    maps: { ...current.maps, ...patch.maps }
  })
}
