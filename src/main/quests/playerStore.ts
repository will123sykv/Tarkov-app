import { EMPTY_HIDEOUT, type HideoutProgress } from '../../shared/hideout'
import type { FleaRecord, LogHistory, RaidRecord } from '../../shared/logTypes'
import {
  applyQuestEvent,
  markUpTo,
  setObjective,
  setQuestStatus,
  withoutLogEntries,
  type ObjectiveProgress,
  type ProgressEntry,
  type QuestProgress
} from '../../shared/questProgress'
import type { Quest } from '../../shared/questTypes'
import type { StoryPin, StoryPins } from '../../shared/storyPlaces'
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
  /** Since 1.8.0. */
  hideout: Record<GameMode, HideoutProgress>
  /** Since 1.11.0. */
  objectives: Record<GameMode, ObjectiveProgress>
  /** The player's own pins on story steps, the same in every mode. Since 1.12.0. */
  pins: StoryPins
}

/** Item counts are whole and at least 0; a count of 0 isn't kept. */
const MAX_HAVE = 100_000
/** Objective counts go up to this (the most a story step asks for is 500,000,000 roubles). */
const MAX_OBJECTIVE = 1_000_000_000
/** Far more pins than there are story steps. */
export const MAX_PINS = 2000

const empty = (): Saved => ({
  version: 1,
  progress: { pvp: {}, pve: {}, season: {} },
  history: {
    pvp: { raids: [], flea: [] },
    pve: { raids: [], flea: [] },
    season: { raids: [], flea: [] }
  },
  hideout: { pvp: EMPTY_HIDEOUT, pve: EMPTY_HIDEOUT, season: EMPTY_HIDEOUT },
  objectives: { pvp: {}, pve: {}, season: {} },
  pins: {}
})

const STATUS: Record<'started' | 'failed' | 'completed', ProgressEntry['status']> = {
  started: 'active',
  failed: 'failed',
  completed: 'completed'
}

/**
 * The player's quest progress, raid/flea history and hideout per game mode, kept in one JSON file.
 * Log events and manual changes both go through here.
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
            history: { ...base.history, ...raw.history },
            // 1.8.0 saved no trader levels.
            hideout: Object.fromEntries(
              MODES.map((mode) => [mode, { ...EMPTY_HIDEOUT, ...raw.hideout?.[mode] }])
            ) as Saved['hideout'],
            objectives: { ...base.objectives, ...raw.objectives },
            pins: raw.pins ?? {}
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

    async hideout(mode: GameMode): Promise<HideoutProgress> {
      return (await load()).hideout[mode]
    },

    async objectives(mode: GameMode): Promise<ObjectiveProgress> {
      return (await load()).objectives[mode]
    },

    /** How far along one of a quest's objectives is, set by hand (0 clears it). */
    async setObjective(
      mode: GameMode,
      questId: string,
      objectiveId: string,
      value: number
    ): Promise<ObjectiveProgress> {
      const d = await load()
      d.objectives[mode] = setObjective(
        d.objectives[mode],
        questId,
        objectiveId,
        Math.min(MAX_OBJECTIVE, value)
      )
      await save()
      return d.objectives[mode]
    },

    async pins(): Promise<StoryPins> {
      return (await load()).pins
    },

    /** Put the player's pin on a story step, or take it off (null). */
    async setPin(questId: string, objectiveId: string, pin: StoryPin | null): Promise<StoryPins> {
      const d = await load()
      const quest = { ...d.pins[questId] }
      if (pin) {
        const count = Object.values(d.pins).reduce((n, q) => n + Object.keys(q).length, 0)
        if (!quest[objectiveId] && count >= MAX_PINS) throw new Error('Too many pins')
        quest[objectiveId] = pin
      } else delete quest[objectiveId]
      const pins = { ...d.pins }
      if (Object.keys(quest).length) pins[questId] = quest
      else delete pins[questId]
      d.pins = pins
      await save()
      return d.pins
    },

    /** Set a station's built level by hand (catching up), leaving the items put aside alone. */
    async setStationLevel(mode: GameMode, stationId: string, level: number): Promise<HideoutProgress> {
      const d = await load()
      const current = d.hideout[mode]
      d.hideout[mode] = {
        ...current,
        levels: { ...current.levels, [stationId]: Math.max(0, Math.round(level)) }
      }
      await save()
      return d.hideout[mode]
    },

    /** How many of an item the player has put aside for the hideout. */
    async setHave(mode: GameMode, itemId: string, count: number): Promise<HideoutProgress> {
      const d = await load()
      const current = d.hideout[mode]
      const have = { ...current.have }
      const n = Math.min(MAX_HAVE, Math.max(0, Math.round(count)))
      if (n > 0) have[itemId] = n
      else delete have[itemId]
      d.hideout[mode] = { ...current, have }
      await save()
      return d.hideout[mode]
    },

    /** Several of those counts at once (0 clears one), e.g. from screenshots. */
    async setHaveMany(mode: GameMode, counts: Record<string, number>): Promise<HideoutProgress> {
      const d = await load()
      const current = d.hideout[mode]
      const have = { ...current.have }
      for (const [itemId, count] of Object.entries(counts)) {
        const n = Math.min(MAX_HAVE, Math.max(0, Math.round(count)))
        if (n > 0) have[itemId] = n
        else delete have[itemId]
      }
      d.hideout[mode] = { ...current, have }
      await save()
      return d.hideout[mode]
    },

    /** The player's loyalty level with a trader (1–4), for what the trader will sell them. */
    async setTraderLevel(mode: GameMode, traderId: string, level: number): Promise<HideoutProgress> {
      const d = await load()
      const current = d.hideout[mode]
      d.hideout[mode] = {
        ...current,
        traders: { ...current.traders, [traderId]: Math.min(4, Math.max(1, Math.round(level))) }
      }
      await save()
      return d.hideout[mode]
    },

    /** Build a station level: set the level and use up the items put aside for it. */
    async build(
      mode: GameMode,
      stationId: string,
      level: number,
      items: readonly { itemId: string; count: number }[]
    ): Promise<HideoutProgress> {
      const d = await load()
      const current = d.hideout[mode]
      const have = { ...current.have }
      for (const { itemId, count } of items) {
        const left = (have[itemId] ?? 0) - count
        if (left > 0) have[itemId] = left
        else delete have[itemId]
      }
      d.hideout[mode] = { ...current, levels: { ...current.levels, [stationId]: level }, have }
      await save()
      return d.hideout[mode]
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
