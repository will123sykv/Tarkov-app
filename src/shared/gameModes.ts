import type { DataMode, GameMode } from './types'

export const GAME_MODES: { id: GameMode; label: string }[] = [
  { id: 'pvp', label: 'PvP' },
  { id: 'pve', label: 'PvE' },
  { id: 'season', label: 'PvP Season' }
]

export function isGameMode(value: unknown): value is GameMode {
  return value === 'pvp' || value === 'pve' || value === 'season'
}

export function isDataMode(value: unknown): value is DataMode {
  return value === 'pvp' || value === 'pve'
}

/**
 * tarkov.dev has no PvP Season economy, so Season reads PvP prices (with a warning in the UI).
 * This is the one place to change once Season data becomes available.
 */
export function dataModeFor(mode: GameMode): DataMode {
  return mode === 'pve' ? 'pve' : 'pvp'
}

export function hasOwnPriceData(mode: GameMode): boolean {
  return mode !== 'season'
}

export const TARKOV_DEV_GAME_MODE: Record<DataMode, 'regular' | 'pve'> = {
  pvp: 'regular',
  pve: 'pve'
}

export const TARKOV_MARKET_PATH_PREFIX: Record<DataMode, string> = {
  pvp: '',
  pve: '/pve'
}
