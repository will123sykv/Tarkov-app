import { CURRENCIES } from './constants'
import { stationLevel, type HideoutNeed, type HideoutProgress } from './hideout'
import { neededItems, objectiveTarget, objectiveValue, type ObjectiveProgress } from './questProgress'
import type { HideoutStation, Quest } from './questTypes'

// Favourites: items, hideout upgrades and quests the player stars, and what they still need that's
// worth looking for in raid: what can't be bought, traded for or crafted now, and what must be found
// in raid. Listed over the map on the Maps tab. Kept per game mode.

export interface Favourites {
  /** Items starred in Items to collect. */
  items: string[]
  /** Station levels starred in Upgrades, as "stationId:level". */
  upgrades: string[]
  /** Quests starred in the Quests tab or a quest's panel. */
  quests: string[]
}

export type FavouriteKind = keyof Favourites

export const EMPTY_FAVOURITES: Favourites = { items: [], upgrades: [], quests: [] }

/** Far more than anyone would star. */
export const MAX_FAVOURITES = 500

export const upgradeKey = (stationId: string, level: number): string => `${stationId}:${level}`

/** A saved favourites list: ids only, each once, at most MAX_FAVOURITES (files before 1.27.0 have none). */
export function sanitizeFavourites(raw: unknown): Favourites {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? [
          ...new Set(v.filter((id): id is string => typeof id === 'string' && /^[\w:-]{1,80}$/.test(id)))
        ].slice(0, MAX_FAVOURITES)
      : []
  return { items: list(r.items), upgrades: list(r.upgrades), quests: list(r.quests) }
}

/** Why an item is listed: it can't be got now, it must be found in raid, or it's a quest item to pick up. */
export type FavouriteReason = 'cantGet' | 'fir' | 'questItem'

export interface FavouriteNeed {
  itemId: string
  /** For a quest item (which isn't sold), its name. */
  name?: string
  count: number
  reason: FavouriteReason
  /** What wants it: "Starred", "Workbench 2", a quest's name. */
  for: string[]
}

export interface FavouriteInput {
  favourites: Favourites
  /** Each item's need over every level and quest left (Items to collect's list), by item. */
  everything: ReadonlyMap<string, Pick<HideoutNeed, 'missing' | 'firNeeded'>>
  stations: readonly HideoutStation[]
  quests: ReadonlyMap<string, Quest>
  /** Quests done with (completed or failed): nothing left to get for them. */
  finished: (questId: string) => boolean
  objectives: ObjectiveProgress | undefined
  progress: HideoutProgress
  /** Whether the item can be bought, traded for or crafted now. */
  canGet: (itemId: string) => boolean
}

const ORDER: Record<FavouriteReason, number> = { cantGet: 0, fir: 1, questItem: 2 }

/**
 * What the player's favourites still need that's worth looking for in raid: of each item missing, all
 * of it when it can't be got now, otherwise the copies that must be found in raid; and the quest items
 * a starred quest has left to pick up. The same item from several favourites is one entry.
 */
export function favouriteNeeds(input: FavouriteInput): FavouriteNeed[] {
  const { favourites, progress, canGet } = input
  const byItem = new Map<string, FavouriteNeed>()
  const add = (
    itemId: string,
    count: number,
    reason: FavouriteReason,
    label: string,
    name?: string
  ): void => {
    if (count <= 0) return
    const entry = byItem.get(itemId)
    if (!entry) {
      byItem.set(itemId, { itemId, ...(name ? { name } : {}), count, reason, for: [label] })
      return
    }
    entry.count += count
    if (ORDER[reason] < ORDER[entry.reason]) entry.reason = reason
    if (!entry.for.includes(label)) entry.for.push(label)
  }
  /** Of `missing`, what to look for: all when it can't be got, else the copies that must be found in raid. */
  const look = (itemId: string, missing: number, fir: number, label: string): void => {
    if (CURRENCIES[itemId] || missing <= 0) return
    if (!canGet(itemId)) add(itemId, missing, 'cantGet', label)
    else add(itemId, Math.min(missing, fir), 'fir', label)
  }
  const have = (itemId: string): number => Math.max(0, progress.have[itemId] ?? 0)

  for (const itemId of favourites.items) {
    const need = input.everything.get(itemId)
    if (need) look(itemId, need.missing, need.firNeeded, 'Starred')
  }
  for (const key of favourites.upgrades) {
    const [stationId, levelText] = key.split(':')
    const station = input.stations.find((s) => s.id === stationId)
    const level = station?.levels.find((l) => l.level === Number(levelText))
    if (!station || !level || level.level <= stationLevel(station, progress)) continue
    const label = `${station.name} ${level.level}`
    for (const part of level.items) {
      const missing = Math.max(0, part.count - have(part.itemId))
      look(part.itemId, missing, part.foundInRaid ? missing : 0, label)
    }
  }
  for (const questId of favourites.quests) {
    const quest = input.quests.get(questId)
    if (!quest || input.finished(questId)) continue
    for (const n of neededItems([quest], input.objectives).items) {
      const missing = Math.max(0, n.count - have(n.itemId))
      look(n.itemId, missing, n.foundInRaid ? missing : 0, quest.name)
    }
    for (const o of quest.objectives) {
      if (!o.questItem || o.type !== 'findQuestItem') continue
      const left = objectiveTarget(o) - objectiveValue(o, quest.id, input.objectives)
      add(o.questItem.id, left, 'questItem', quest.name, o.questItem.name)
    }
  }
  return [...byItem.values()].sort((a, b) => ORDER[a.reason] - ORDER[b.reason])
}
