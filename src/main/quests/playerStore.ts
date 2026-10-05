import { EMPTY_HIDEOUT, type HideoutProgress } from '../../shared/hideout'
import { EMPTY_KEYS, MAX_KEYS, type KeyInventory } from '../../shared/keys'
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
  /** Keys the player has, and ones they want to get. Since 1.17.0. */
  keys: Record<GameMode, KeyInventory>
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
  pins: {},
  keys: { pvp: EMPTY_KEYS, pve: EMPTY_KEYS, season: EMPTY_KEYS }
})

/** A saved key list: ids only, each once (files from before 1.17.0 have none). */
const keyList = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? [...new Set(raw.filter((id): id is string => typeof id === 'string'))].slice(0, MAX_KEYS)
    : []

/** `progress` with one item's count put aside set (0 or less clears it), noting when. */
function withHave(progress: HideoutProgress, itemId: string, count: number, at: number): HideoutProgress {
  const have = { ...progress.have }
  const haveAt = { ...progress.haveAt }
  const n = Math.min(MAX_HAVE, Math.max(0, Math.round(count)))
  if (n > 0) {
    have[itemId] = n
    haveAt[itemId] = Math.max(at, haveAt[itemId] ?? 0)
  } else {
    delete have[itemId]
    delete haveAt[itemId]
  }
  return { ...progress, have, haveAt }
}

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
            hideout: Object.fromEntries(
              MODES.map((mode) => {
                // 1.8.0 saved no trader levels.
                const hideout: HideoutProgress = { ...EMPTY_HIDEOUT, ...raw.hideout?.[mode] }
                // Before 1.14.0 counts had no times: treat them as set now, so quests the logs
                // completed before this version never come off them.
                if (!hideout.haveAt && Object.keys(hideout.have).length)
                  hideout.haveAt = Object.fromEntries(Object.keys(hideout.have).map((id) => [id, now()]))
                return [mode, hideout]
              })
            ) as Saved['hideout'],
            objectives: { ...base.objectives, ...raw.objectives },
            pins: raw.pins ?? {},
            keys: Object.fromEntries(
              MODES.map((mode) => [
                mode,
                { owned: keyList(raw.keys?.[mode]?.owned), toDo: keyList(raw.keys?.[mode]?.toDo) }
              ])
            ) as Saved['keys']
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

    /**
     * How far along one of a quest's objectives is, set by hand (0 clears it). For a hand-over, the
     * items handed over come off the count put aside (and go back on when the count goes down).
     */
    async setObjective(
      mode: GameMode,
      questId: string,
      objectiveId: string,
      value: number,
      handOverItem: string | null = null
    ): Promise<ObjectiveProgress> {
      const d = await load()
      const before = d.objectives[mode][questId]?.[objectiveId] ?? 0
      d.objectives[mode] = setObjective(
        d.objectives[mode],
        questId,
        objectiveId,
        Math.min(MAX_OBJECTIVE, value)
      )
      const handed = (d.objectives[mode][questId]?.[objectiveId] ?? 0) - before
      if (handOverItem && handed !== 0) {
        const current = d.hideout[mode]
        d.hideout[mode] = withHave(current, handOverItem, (current.have[handOverItem] ?? 0) - handed, now())
      }
      await save()
      return d.objectives[mode]
    },

    async keys(mode: GameMode): Promise<KeyInventory> {
      return (await load()).keys[mode]
    },

    /** Mark a key as owned (or wanted, for the To do tab), or not. */
    async setKey(
      mode: GameMode,
      keyId: string,
      list: keyof KeyInventory,
      on: boolean
    ): Promise<KeyInventory> {
      const d = await load()
      const current = d.keys[mode]
      const without = current[list].filter((id) => id !== keyId)
      if (on && without.length >= MAX_KEYS) throw new Error('Too many keys')
      const next = { ...current, [list]: on ? [...without, keyId] : without }
      // A key the player has is no longer one to get.
      if (list === 'owned' && on) next.toDo = next.toDo.filter((id) => id !== keyId)
      d.keys[mode] = next
      await save()
      return next
    },

    /** Replace the keys the player has (read from screenshots); ones to get that they now have go. */
    async setOwnedKeys(mode: GameMode, keyIds: readonly string[]): Promise<KeyInventory> {
      const d = await load()
      const owned = [...new Set(keyIds)]
      if (owned.length > MAX_KEYS) throw new Error('Too many keys')
      const have = new Set(owned)
      d.keys[mode] = { owned, toDo: d.keys[mode].toDo.filter((id) => !have.has(id)) }
      await save()
      return d.keys[mode]
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

    /** How many of an item the player has put aside for the hideout and quests. */
    async setHave(mode: GameMode, itemId: string, count: number): Promise<HideoutProgress> {
      const d = await load()
      d.hideout[mode] = withHave(d.hideout[mode], itemId, count, now())
      await save()
      return d.hideout[mode]
    },

    /** Several of those counts at once (0 clears one), e.g. from screenshots. */
    async setHaveMany(mode: GameMode, counts: Record<string, number>): Promise<HideoutProgress> {
      const d = await load()
      const t = now()
      for (const [itemId, count] of Object.entries(counts))
        d.hideout[mode] = withHave(d.hideout[mode], itemId, count, t)
      await save()
      return d.hideout[mode]
    },

    /**
     * Items handed over for a quest the logs say was completed at `at`: they come off the counts put
     * aside, except counts set since then (which already leave them out). Returns whether any changed.
     */
    async handOver(
      mode: GameMode,
      items: readonly { itemId: string; count: number }[],
      at: number
    ): Promise<boolean> {
      const d = await load()
      let changed = false
      for (const { itemId, count } of items) {
        const current = d.hideout[mode]
        const have = current.have[itemId] ?? 0
        if (count <= 0 || have <= 0 || (current.haveAt?.[itemId] ?? 0) >= at) continue
        d.hideout[mode] = withHave(current, itemId, have - count, at)
        changed = true
      }
      if (changed) await save()
      return changed
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
      const t = now()
      let current = d.hideout[mode]
      for (const { itemId, count } of items)
        current = withHave(current, itemId, (current.have[itemId] ?? 0) - count, t)
      d.hideout[mode] = { ...current, levels: { ...current.levels, [stationId]: level } }
      await save()
      return d.hideout[mode]
    },

    /**
     * Apply log events; `reset` first drops everything that came from the logs. Returns the modes that
     * changed, and the quests that are completed now but weren't before (re-reading old events
     * completes nothing new).
     */
    async applyEvents(
      events: readonly LogEvent[],
      reset: boolean
    ): Promise<{ changed: Set<GameMode>; completed: { mode: GameMode; questId: string; at: number }[] }> {
      const d = await load()
      const changed = new Set<GameMode>()
      const doneBefore = new Map(
        MODES.map((mode) => [
          mode,
          new Set(
            Object.entries(d.progress[mode])
              .filter(([, entry]) => entry.status === 'completed')
              .map(([id]) => id)
          )
        ])
      )
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
      const completed: { mode: GameMode; questId: string; at: number }[] = []
      for (const mode of changed)
        for (const [questId, entry] of Object.entries(d.progress[mode]))
          if (entry.status === 'completed' && !doneBefore.get(mode)!.has(questId))
            completed.push({ mode, questId, at: entry.at })
      return { changed, completed }
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
