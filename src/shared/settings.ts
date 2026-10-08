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
  HideoutSettings,
  KeysSettings,
  TodoSettings,
  MapSettings,
  QuestSettings,
  QuestStatusFilter,
  Settings,
  SidebarSettings,
  SortKey,
  TrendInterval,
  TrendSettings
} from './types'

const SORT_KEYS: SortKey[] = ['valuePerSlot', 'worth', 'flea', 'trader', 'slots', 'name', 'chance']

/** 2: 1.5.0's looser flea trends defaults. 3: 1.25.0's screenshot scanner selling what can be got back. */
const SETTINGS_VERSION = 3

export const DEFAULT_SETTINGS: Settings = {
  settingsVersion: SETTINGS_VERSION,
  gameMode: 'pvp',
  playerLevels: { pvp: 15, pve: 15, season: 1 },
  hideLocked: false,
  keepOnly: false,
  refreshIntervalMin: DEFAULT_REFRESH_INTERVAL_MIN,
  subtractFleaFee: true,
  minValuePerSlot: 0,
  sort: { key: 'valuePerSlot', dir: 'desc' },
  pool: { containerId: null, mapId: null },
  containerSort: 'value',
  view: 'loot',
  trends: {
    days: 7,
    minOffers: 25,
    minPrice: 10_000,
    minProfit: 2_000,
    minConsistency: 0.6,
    minSwing: 0.15,
    sort: 'profit',
    tradableOnly: true,
    intervalHours: 3,
    nowOnly: false
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
    faction: null,
    wikiQuests: []
  },
  maps: {
    mapKey: 'customs',
    questScope: 'active',
    showExtracts: true,
    showSpawns: false,
    showTransits: true,
    showLabels: true,
    showBosses: true,
    showSnipers: true,
    showKeys: false,
    faction: 'pmc',
    favouritesOpen: true,
    highlighted: []
  },
  hideout: {
    scope: 'all',
    questScope: 'active',
    source: 'all',
    hideDone: false,
    firOnly: false,
    keepOnly: false,
    sellOnly: false,
    scanSellBuyable: true,
    tab: 'items'
  },
  todo: { show: 'all', kinds: 'all', view: 'summary', layout: 'maps' },
  keys: { scope: 'all', list: 'needed', tab: 'list' },
  sidebars: {}
}

const VIEWS: AppView[] = ['loot', 'trends', 'todo', 'quests', 'hideout', 'keys', 'maps', 'raids']
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
    faction: r.faction === 'USEC' || r.faction === 'BEAR' ? r.faction : null,
    wikiQuests: Array.isArray(r.wikiQuests)
      ? [
          ...new Set(
            r.wikiQuests
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.trim())
              .filter((t) => t && t.length <= MAX_WIKI_TITLE)
          )
        ].slice(0, MAX_WIKI_QUESTS)
      : []
  }
}

/** Event quests kept from the wiki: titles are short, and nobody adds hundreds. */
const MAX_WIKI_TITLE = 200
export const MAX_WIKI_QUESTS = 200

/** More items than anyone would show on the map at once. */
const MAX_HIGHLIGHTED = 20

function sanitizeMaps(raw: unknown): MapSettings {
  const d = DEFAULT_SETTINGS.maps
  const r = isRecord(raw) ? raw : {}
  return {
    mapKey: typeof r.mapKey === 'string' && /^[a-z0-9-]{1,40}$/.test(r.mapKey) ? r.mapKey : d.mapKey,
    questScope: r.questScope === 'available' || r.questScope === 'none' ? r.questScope : 'active',
    showExtracts: typeof r.showExtracts === 'boolean' ? r.showExtracts : d.showExtracts,
    showSpawns: typeof r.showSpawns === 'boolean' ? r.showSpawns : d.showSpawns,
    showTransits: typeof r.showTransits === 'boolean' ? r.showTransits : d.showTransits,
    showLabels: typeof r.showLabels === 'boolean' ? r.showLabels : d.showLabels,
    showBosses: typeof r.showBosses === 'boolean' ? r.showBosses : d.showBosses,
    showSnipers: typeof r.showSnipers === 'boolean' ? r.showSnipers : d.showSnipers,
    showKeys: r.showKeys === true,
    faction: r.faction === 'scav' ? 'scav' : 'pmc',
    favouritesOpen: r.favouritesOpen !== false,
    highlighted: Array.isArray(r.highlighted)
      ? [
          ...new Set(
            r.highlighted.filter((id): id is string => typeof id === 'string' && /^[\w-]{1,40}$/.test(id))
          )
        ].slice(0, MAX_HIGHLIGHTED)
      : []
  }
}

function sanitizeHideout(raw: unknown, version: number): HideoutSettings {
  const r = isRecord(raw) ? raw : {}
  return {
    scope: r.scope === 'next' ? 'next' : 'all',
    questScope: r.questScope === 'all' ? 'all' : 'active',
    source: r.source === 'hideout' || r.source === 'quests' ? r.source : 'all',
    hideDone: r.hideDone === true,
    firOnly: r.firOnly === true,
    // The two "only" filters contradict each other; keep the older one if both were saved.
    keepOnly: r.keepOnly === true,
    sellOnly: r.sellOnly === true && r.keepOnly !== true,
    // On by default since 1.25.0, so turned on for settings saved before then.
    scanSellBuyable: version < 3 || r.scanSellBuyable !== false,
    tab: r.tab === 'upgrades' || r.tab === 'scav' ? r.tab : 'items'
  }
}

const TREND_SORTS: TrendSortKey[] = ['profit', 'spread', 'volatility', 'consistency', 'offers', 'swing']
const TREND_DAYS = [7, 14, 30] as const
export const TREND_INTERVALS: TrendInterval[] = [2, 3, 4, 6]

/** 1.3.0's filter defaults. It saved them in full, so a block without `minSwing` came from it. */
const TRENDS_1_3_0_DEFAULTS: Record<string, number> = {
  minOffers: 25,
  minPrice: 5_000,
  minProfit: 1_000,
  minConsistency: 0.6
}

/** 1.3.1's tighter defaults, which left the list empty; saved before settings had a version. */
const TRENDS_1_3_1_DEFAULTS: Record<string, number> = {
  minOffers: 50,
  minPrice: 20_000,
  minProfit: 5_000,
  minConsistency: 0.7,
  minSwing: 0.3
}

function sanitizeTrends(raw: unknown, version: number): TrendSettings {
  const d = DEFAULT_SETTINGS.trends
  const r = isRecord(raw) ? { ...raw } : {}
  // Filters still at an older version's defaults move to the current ones; ones the player changed stay.
  const drop = (defaults: Record<string, number>): void => {
    for (const [key, old] of Object.entries(defaults)) if (r[key] === old) delete r[key]
  }
  if (!('minSwing' in r)) drop(TRENDS_1_3_0_DEFAULTS)
  else if (version < 2) drop(TRENDS_1_3_1_DEFAULTS)
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
    tradableOnly: typeof r.tradableOnly === 'boolean' ? r.tradableOnly : d.tradableOnly,
    intervalHours: TREND_INTERVALS.find((n) => n === r.intervalHours) ?? d.intervalHours,
    nowOnly: r.nowOnly === true
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

  const version = typeof r.settingsVersion === 'number' ? r.settingsVersion : 1

  return {
    settingsVersion: SETTINGS_VERSION,
    gameMode: isGameMode(r.gameMode) ? r.gameMode : d.gameMode,
    playerLevels,
    hideLocked: typeof r.hideLocked === 'boolean' ? r.hideLocked : d.hideLocked,
    keepOnly: r.keepOnly === true,
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
    trends: sanitizeTrends(r.trends, version),
    backgroundRecording: r.backgroundRecording === true,
    startWithWindows: r.startWithWindows === true,
    gameLogsDir:
      typeof r.gameLogsDir === 'string' && r.gameLogsDir.length <= 1024 ? r.gameLogsDir || null : null,
    quests: sanitizeQuests(r.quests),
    maps: sanitizeMaps(r.maps),
    hideout: sanitizeHideout(r.hideout, version),
    todo: sanitizeTodo(r.todo),
    keys: sanitizeKeys(r.keys),
    sidebars: sanitizeSidebars(r.sidebars)
  }
}

// 1.17–1.18 kept a `keys` switch here; the filters replace it, starting from their defaults.
function sanitizeTodo(raw: unknown): TodoSettings {
  const r = isRecord(raw) ? raw : {}
  return {
    show: r.show === 'doable' ? 'doable' : 'all',
    kinds: r.kinds === 'kill' || r.kinds === 'locate' ? r.kinds : 'all',
    view: r.view === 'full' ? 'full' : 'summary',
    layout: r.layout === 'list' ? 'list' : 'maps'
  }
}

function sanitizeKeys(raw: unknown): KeysSettings {
  const r = isRecord(raw) ? raw : {}
  return {
    scope: r.scope === 'active' || r.scope === 'available' ? r.scope : 'all',
    list: r.list === 'all' ? 'all' : 'needed',
    tab: r.tab === 'scan' ? 'scan' : 'list'
  }
}

/** Far more sections than any sidebar has, and longer than any heading. */
const MAX_HIDDEN_SECTIONS = 40
const MAX_SECTION_TITLE = 60

function sanitizeSidebars(raw: unknown): Partial<Record<AppView, SidebarSettings>> {
  const r = isRecord(raw) ? raw : {}
  const result: Partial<Record<AppView, SidebarSettings>> = {}
  for (const view of VIEWS) {
    const v = r[view]
    if (!isRecord(v)) continue
    const hidden = Array.isArray(v.hidden)
      ? [
          ...new Set(
            v.hidden.filter(
              (t): t is string => typeof t === 'string' && t.length > 0 && t.length <= MAX_SECTION_TITLE
            )
          )
        ].slice(0, MAX_HIDDEN_SECTIONS)
      : []
    const collapsed = v.collapsed === true
    if (hidden.length || collapsed) result[view] = { hidden, collapsed }
  }
  return result
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
    maps: { ...current.maps, ...patch.maps },
    hideout: { ...current.hideout, ...patch.hideout },
    todo: { ...current.todo, ...patch.todo },
    keys: { ...current.keys, ...patch.keys },
    sidebars: { ...current.sidebars, ...patch.sidebars }
  })
}
