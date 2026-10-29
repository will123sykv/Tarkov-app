import type { GameMode } from './types'

export interface FleaPayment {
  currency: 'RUB' | 'USD' | 'EUR'
  amount: number
}

export interface RaidRecord {
  /** The game's location id, e.g. `bigmap` (Customs). */
  map: string
  raidId: string | null
  /** From the raid's profile: the PMC's own, or another (a scav). Null when unknown. */
  side: 'pmc' | 'scav' | null
  online: boolean
  /** Seconds spent in the matching queue. */
  queueSeconds: number | null
  /** Seconds loading the map. */
  loadSeconds: number | null
  /** When the match was found. */
  foundAt: number
  startedAt: number | null
  endedAt: number | null
  /**
   * How the end was known (since 1.70.0): the game said so (`matchOver`), or it was worked out because
   * the player was back in the menu, the game's log ended (closed or crashed), or a transit took them
   * to another map. Absent in raids read before 1.70.0.
   */
  endedBy?: RaidEnd
  /** The first leg's `foundAt` for every leg of one run across maps by transits (since 1.70.0). */
  runId?: number
}

export type RaidEnd = 'matchOver' | 'menu' | 'logsEnd' | 'transit'

export interface FleaRecord {
  kind: 'sold' | 'expired'
  t: number
  itemId: string | null
  count: number | null
  buyer: string | null
  payment: FleaPayment | null
}

/** A PMC raid the logs just saw end, for the after-raid popup (since 1.66.0). */
export interface RaidEnded {
  gameMode: GameMode
  raid: RaidRecord
  /** Every map of the run, in order (more than one after transits; since 1.70.0). */
  maps: string[]
  /** When the run's first leg started (the raid's own start without transits). */
  runStartedAt: number | null
}

/** Raids and flea activity read from the logs, for one game mode, newest first. */
export interface LogHistory {
  raids: RaidRecord[]
  flea: FleaRecord[]
}

export interface LogWatcherStatus {
  state: 'idle' | 'not-found' | 'scanning' | 'watching' | 'error'
  logsDir: string | null
  folders: number
  foldersRead: number
  /** When the newest event was logged. */
  lastEventAt: number | null
  lastReadAt: number | null
  events: { quests: number; flea: number; raids: number }
  error: string | null
}
