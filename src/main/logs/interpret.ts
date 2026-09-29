import type { FleaPayment, RaidRecord } from '../../shared/logTypes'
import type { GameMode } from '../../shared/types'
import type { LogEntry } from './parseLog'

export type QuestStatusEvent = 'started' | 'failed' | 'completed'

export type LogEvent =
  | { kind: 'quest'; t: number; mode: GameMode; questId: string; status: QuestStatusEvent }
  | {
      kind: 'fleaSold'
      t: number
      mode: GameMode
      itemId: string | null
      count: number | null
      buyer: string | null
      payment: FleaPayment | null
    }
  | { kind: 'fleaExpired'; t: number; mode: GameMode; itemId: string | null; count: number | null }
  | { kind: 'raid'; mode: GameMode; raid: RaidRecord }

/** What the interpreter remembers between entries (and between reads of a growing log). */
export interface InterpreterState {
  mode: GameMode | null
  pmcProfileId: string | null
  /** Queue time seen before the match is created. */
  pendingQueue: number | null
  raid: RaidRecord | null
}

export const INITIAL_STATE: InterpreterState = {
  mode: null,
  pmcProfileId: null,
  pendingQueue: null,
  raid: null
}

const QUEST_TYPES: Record<number, QuestStatusEvent> = { 10: 'started', 11: 'failed', 12: 'completed' }
const FLEA_SOLD_TEMPLATE = '5bdabfb886f7743e152e867e 0'
const FLEA_EXPIRED_TEMPLATE = '5bdabfe486f7743e1665df6e 0'
const CURRENCIES: Record<string, FleaPayment['currency']> = {
  '5449016a4bdc2d6f028b456f': 'RUB',
  '5696686a4bdc2da3298b456a': 'USD',
  '569668774bdc2da2298b4568': 'EUR'
}

/** The game's session mode names → the app's game modes. */
export function sessionMode(value: string): GameMode | null {
  const v = value.toLowerCase()
  if (v === 'pve') return 'pve'
  if (v === 'regular' || v === 'pvp') return 'pvp'
  if (v === 'pvpseason' || v === 'seasonal' || v === 'szn') return 'season'
  return null
}

function seconds(text: string | undefined): number | null {
  if (!text) return null
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function payment(message: Record<string, unknown>): FleaPayment | null {
  const data = record(message.items)?.data
  if (!Array.isArray(data)) return null
  for (const item of data) {
    const it = record(item)
    const currency = CURRENCIES[String(it?._tpl)]
    const amount = num(record(it?.upd)?.StackObjectsCount)
    if (currency && amount !== null) return { currency, amount }
  }
  return null
}

/**
 * Turn log entries into events, in order. Handles `Session mode` (which game mode the following
 * events belong to), quest and flea notifications, and a raid's lifecycle (queue → match found →
 * map loaded → started → ended). Returns the state to carry into the next batch of entries.
 */
export function interpretEntries(
  entries: readonly LogEntry[],
  initial: InterpreterState = INITIAL_STATE
): { events: LogEvent[]; state: InterpreterState } {
  const state: InterpreterState = { ...initial, raid: initial.raid ? { ...initial.raid } : null }
  const events: LogEvent[] = []
  const mode = (): GameMode => state.mode ?? 'pvp'
  const finishRaid = (endedAt: number | null): void => {
    if (!state.raid) return
    events.push({ kind: 'raid', mode: mode(), raid: { ...state.raid, endedAt } })
    state.raid = null
  }

  for (const entry of entries) {
    const { message: m, t } = entry

    const session = /Session mode: ([^\s|]+)/.exec(m)
    if (session) {
      state.mode = sessionMode(session[1]) ?? state.mode
      continue
    }
    const profile = /(?:SelectProfile|SelectedProfile|PrepareSelectedProfileLocally) ProfileId:\s*(\w+)/.exec(
      m
    )
    if (profile) {
      state.pmcProfileId = profile[1]
      continue
    }

    if (m.includes('Got notification | ChatMessageReceived')) {
      const message = record(record(entry.json)?.message)
      if (!message) continue
      const templateId = str(message.templateId) ?? ''
      const status = QUEST_TYPES[num(message.type) ?? -1]
      if (status) {
        const questId = templateId.split(' ')[0]
        if (/^[0-9a-f]{24}$/i.test(questId)) events.push({ kind: 'quest', t, mode: mode(), questId, status })
      } else if (templateId === FLEA_SOLD_TEMPLATE) {
        const data = record(message.systemData)
        events.push({
          kind: 'fleaSold',
          t,
          mode: mode(),
          itemId: str(data?.soldItem),
          count: num(data?.itemCount),
          buyer: str(data?.buyerNickname),
          payment: payment(message)
        })
      } else if (templateId === FLEA_EXPIRED_TEMPLATE) {
        const data = record(message.systemData)
        events.push({
          kind: 'fleaExpired',
          t,
          mode: mode(),
          itemId: str(data?.itemId) ?? str(data?.soldItem),
          count: num(data?.itemCount)
        })
      }
      continue
    }

    if (m.includes('MatchingCompleted')) {
      state.pendingQueue = seconds(/MatchingCompleted:[\d.,]+ real:([\d.,]+)/.exec(m)?.[1])
      continue
    }
    if (m.includes('TRACE-NetworkGameCreate profileStatus')) {
      // A new match: close any raid that never logged its end.
      finishRaid(null)
      const profileId = /Profileid: (\w+)/i.exec(m)?.[1] ?? null
      state.raid = {
        map: /Location: ([^,\s]+)/.exec(m)?.[1] ?? 'unknown',
        raidId: /shortId: ([A-Z0-9]{6})/.exec(m)?.[1] ?? null,
        side: profileId && state.pmcProfileId ? (profileId === state.pmcProfileId ? 'pmc' : 'scav') : null,
        online: m.includes('RaidMode: Online'),
        queueSeconds: state.pendingQueue,
        loadSeconds: null,
        foundAt: t,
        startedAt: null,
        endedAt: null
      }
      state.pendingQueue = null
      continue
    }
    if (state.raid && m.includes('LocationLoaded')) {
      state.raid.loadSeconds = seconds(/LocationLoaded:[\d.,]+ real:([\d.,]+)/.exec(m)?.[1])
      continue
    }
    if (state.raid && m.includes('application|GameStarted')) {
      state.raid.startedAt = t
      continue
    }
    if (m.includes('Network game matching aborted') || m.includes('Network game matching cancelled')) {
      state.pendingQueue = null
      if (state.raid && state.raid.startedAt === null) state.raid = null
      continue
    }
    if (m.includes('Got notification | UserMatchOver')) {
      finishRaid(t)
    }
  }
  return { events, state }
}
