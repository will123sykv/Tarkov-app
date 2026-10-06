import {
  mdiApproximatelyEqual,
  mdiCrosshairsGps,
  mdiExitRun,
  mdiEye,
  mdiFlag,
  mdiHandBackLeft,
  mdiKeyVariant,
  mdiMapMarkerAccount,
  mdiPackageDown,
  mdiSkull
} from '@mdi/js'
import { missingKeys } from '../../../shared/keys'
import type { QuestStatus } from '../../../shared/questProgress'
import { objectiveKind, type ObjectiveKind } from '../../../shared/todo'
import type { Quest, QuestObjective, QuestTrader, QuestZone, Vec3 } from '../../../shared/questTypes'

// Quest objectives on a map as labelled pins: one per spot a quest sends you to, named with the
// quest and its trader, with an icon for each thing to do there.

export interface ObjectiveMarker {
  quest: Quest
  status: QuestStatus
  trader: QuestTrader | undefined
  objective: QuestObjective
  /** Zones and quest-item spots on this map (a story step's "roughly here" or own pin is a zone). */
  zones: Pick<QuestZone, 'position' | 'outline' | 'source' | 'place'>[]
  spots: Vec3[]
}

export { objectiveKind, type ObjectiveKind }

export const OBJECTIVE_ICONS: Record<ObjectiveKind, string> = {
  visit: mdiFlag,
  pickup: mdiHandBackLeft,
  stash: mdiPackageDown,
  mark: mdiCrosshairsGps,
  kill: mdiSkull,
  extract: mdiExitRun,
  other: mdiEye
}

export const OBJECTIVE_KIND_LABEL: Record<ObjectiveKind, string> = {
  visit: 'Go to',
  pickup: 'Pick up',
  stash: 'Stash or plant',
  mark: 'Mark',
  kill: 'Eliminate',
  extract: 'Extract',
  other: 'Objective'
}

export const KEY_ICON = mdiKeyVariant
/** A story step's pin the player put there, and one only roughly placed (where the step names a place). */
export const MINE_ICON = mdiMapMarkerAccount
export const ROUGH_ICON = mdiApproximatelyEqual

export interface QuestPin {
  quest: Quest
  status: QuestStatus
  trader: QuestTrader | undefined
  position: Vec3
  /** The objectives done here, in the quest's order. */
  objectives: QuestObjective[]
  kinds: ObjectiveKind[]
  /** Any of them needs a key. */
  needsKey: boolean
  /** Any of them needs a key none of the player's keys open (false when their keys aren't known). */
  keyMissing: boolean
  /** Only roughly here: a place its story step names (`places`). */
  rough: boolean
  places: string[]
  /** The player put it there. */
  mine: boolean
  /** How many pins of other quests are already at this spot (each is drawn above the last). */
  stack: number
}

/** A possible spot of a quest item that has too many to pin each. */
export interface QuestDot {
  quest: Quest
  status: QuestStatus
  objective: QuestObjective
  position: Vec3
}

/** One quest's spots within this many metres (and on the same floor) share a pin. */
const MERGE_RADIUS = 8
const SAME_FLOOR = 3
/** Pins of different quests this close stack up rather than hide each other. */
const STACK_RADIUS = 4
/** A quest item that can be in more places than this gets dots rather than pins. */
const MAX_PINNED_SPOTS = 3

const near = (a: Vec3, b: Vec3, radius: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) <= radius && Math.abs(a.y - b.y) <= SAME_FLOOR

/**
 * Only what the player can do (the To do tab's "Only quests I can do"): objectives behind a lock none of
 * their keys open are left out, and every one on a map they can't get onto (`shut`), except those `keep`
 * asks for (the quest shown from "Show on map"). Says how many objectives, of how many quests, were left
 * out.
 */
export function doableMarkers(
  markers: readonly ObjectiveMarker[],
  owned: ReadonlySet<string>,
  shut: boolean,
  keep: (marker: ObjectiveMarker) => boolean = () => false
): { markers: ObjectiveMarker[]; hidden: number; quests: number } {
  const kept = markers.filter((m) => keep(m) || (!shut && !missingKeys(m.objective, owned).length))
  const left = markers.filter((m) => !kept.includes(m))
  return { markers: kept, hidden: left.length, quests: new Set(left.map((m) => m.quest.id)).size }
}

export function questPins(
  markers: ObjectiveMarker[],
  owned: ReadonlySet<string> | null = null
): { pins: QuestPin[]; dots: QuestDot[] } {
  const pins: QuestPin[] = []
  const dots: QuestDot[] = []
  for (const { quest, status, trader, objective, zones, spots } of markers) {
    const keyMissing = owned !== null && missingKeys(objective, owned).length > 0
    const points: Pick<QuestZone, 'position' | 'source' | 'place'>[] = [...zones]
    if (spots.length > MAX_PINNED_SPOTS)
      dots.push(...spots.map((position) => ({ quest, status, objective, position })))
    else points.push(...spots.map((position) => ({ position })))
    for (const { position, source, place } of points) {
      const pin = pins.find((p) => p.quest.id === quest.id && near(p.position, position, MERGE_RADIUS))
      if (!pin) {
        pins.push({
          quest,
          status,
          trader,
          position,
          objectives: [objective],
          kinds: [objectiveKind(objective)],
          needsKey: objective.requiredKeys.length > 0,
          keyMissing,
          rough: source === 'rough',
          places: place ? [place] : [],
          mine: source === 'mine',
          stack: 0
        })
      } else {
        // Exactly here if anything at the spot is.
        pin.rough &&= source === 'rough'
        pin.mine ||= source === 'mine'
        if (place && !pin.places.includes(place)) pin.places.push(place)
        if (pin.objectives.includes(objective)) continue
        pin.objectives.push(objective)
        const kind = objectiveKind(objective)
        if (!pin.kinds.includes(kind)) pin.kinds.push(kind)
        pin.needsKey ||= objective.requiredKeys.length > 0
        pin.keyMissing ||= keyMissing
      }
    }
  }
  for (const [i, pin] of pins.entries()) {
    pin.stack = pins
      .slice(0, i)
      .filter((p) => p.quest.id !== pin.quest.id && near(p.position, pin.position, STACK_RADIUS)).length
  }
  return { pins, dots }
}
