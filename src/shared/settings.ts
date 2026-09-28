import {
  DEFAULT_REFRESH_INTERVAL_MIN,
  MAX_PLAYER_LEVEL,
  MAX_REFRESH_INTERVAL_MIN,
  MIN_PLAYER_LEVEL,
  MIN_REFRESH_INTERVAL_MIN
} from './constants'
import { isGameMode } from './gameModes'
import type { GameMode, Settings, SortKey } from './types'

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
  containerSort: 'value'
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
    containerSort: r.containerSort === 'name' ? 'name' : 'value'
  }
}

export function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  return sanitizeSettings({
    ...current,
    ...patch,
    playerLevels: { ...current.playerLevels, ...patch.playerLevels },
    sort: { ...current.sort, ...patch.sort },
    pool: { ...current.pool, ...patch.pool }
  })
}
