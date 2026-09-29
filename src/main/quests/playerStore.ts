import type { FleaRecord, LogHistory, RaidRecord } from '../../shared/logTypes'
import {
  applyQuestEvent,
  markUpTo,
  setQuestStatus,
  withoutLogEntries,
  type ProgressEntry,
  type QuestProgress
} from '../../shared/questProgress'
import type { Quest } from '../../shared/questTypes'
import type { GameMode } from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import type { LogEvent } from '../logs/interpret'

const MODES: GameMode[] = ['pvp', 'pve', 'season']
const MAX_RAIDS = 1000
const MAX_FLEA = 2000

interface Saved {
  version: 1
  progress: Record<GameMode, QuestProgress>
  history: Record<GameMode, LogHistory>
}

const empty = (): Saved => ({
  version: 1,
  progress: { pvp: {}, pve: {}, season: {} },
  history: {
    pvp: { raids: [], flea: [] },
    pve: { raids: [], flea: [] },
    season: { raids: [], flea: [] }
  }
})

const STATUS: Record<'started' | 'failed' | 'completed', ProgressEntry['status']> = {
  started: 'active',
  failed: 'failed',
  completed: 'completed'
}

/**
 * The player's quest progress and raid/flea history per game mode, kept in one JSON file. Log
 * events and manual changes both go through here.
 */
export function createPlayerStore(opts: { file: string; now?: () => number }) {
  const now = opts.now ?? Date.now
  let data: Saved | null = null

  async function load(): Promise<Saved> {
    if (data) return data
    const raw = (await readJsonFile(opts.file)) as Partial<Saved> | undefined
    const base = empty()
    data =
      raw?.version === 1
        ? {
            version: 1,
            progress: { ...base.progress, ...raw.progress },
            history: { ...base.history, ...raw.history }
          }
        : base
    return data
  }

  const save = (): Promise<void> => writeJsonFileAtomic(opts.file, data)

  return {
    async progress(mode: GameMode): Promise<QuestProgress> {
      return (await load()).progress[mode]
    },

    async history(mode: GameMode): Promise<LogHistory> {
      return (await load()).history[mode]
    },

    /** Apply log events; `reset` first drops everything that came from the logs. Returns the modes that changed. */
    async applyEvents(events: readonly LogEvent[], reset: boolean): Promise<Set<GameMode>> {
      const d = await load()
      const changed = new Set<GameMode>()
      if (reset) {
        for (const mode of MODES) {
          d.progress[mode] = withoutLogEntries(d.progress[mode])
          d.history[mode] = { raids: [], flea: [] }
          changed.add(mode)
        }
      }
      for (const e of events) {
        if (e.kind === 'quest') {
          const next = applyQuestEvent(d.progress[e.mode], e.questId, STATUS[e.status], e.t)
          if (next !== d.progress[e.mode]) {
            d.progress[e.mode] = next
            changed.add(e.mode)
          }
        } else if (e.kind === 'raid') {
          const raids: RaidRecord[] = [e.raid, ...d.history[e.mode].raids]
          d.history[e.mode] = { ...d.history[e.mode], raids: raids.slice(0, MAX_RAIDS) }
          changed.add(e.mode)
        } else {
          const record: FleaRecord =
            e.kind === 'fleaSold'
              ? { kind: 'sold', t: e.t, itemId: e.itemId, count: e.count, buyer: e.buyer, payment: e.payment }
              : { kind: 'expired', t: e.t, itemId: e.itemId, count: e.count, buyer: null, payment: null }
          d.history[e.mode] = {
            ...d.history[e.mode],
            flea: [record, ...d.history[e.mode].flea].slice(0, MAX_FLEA)
          }
          changed.add(e.mode)
        }
      }
      if (changed.size) await save()
      return changed
    },

    async setStatus(
      mode: GameMode,
      questId: string,
      status: ProgressEntry['status'] | null
    ): Promise<QuestProgress> {
      const d = await load()
      d.progress[mode] = setQuestStatus(d.progress[mode], questId, status, now())
      await save()
      return d.progress[mode]
    },

    async markUpTo(mode: GameMode, questId: string, quests: readonly Quest[]): Promise<QuestProgress> {
      const d = await load()
      d.progress[mode] = markUpTo(d.progress[mode], questId, new Map(quests.map((q) => [q.id, q])), now())
      await save()
      return d.progress[mode]
    }
  }
}

export type PlayerStore = ReturnType<typeof createPlayerStore>
