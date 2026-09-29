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
}

export interface FleaRecord {
  kind: 'sold' | 'expired'
  t: number
  itemId: string | null
  count: number | null
  buyer: string | null
  payment: FleaPayment | null
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
