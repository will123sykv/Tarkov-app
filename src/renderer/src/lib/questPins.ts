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
import type { QuestStatus } from '../../../shared/questProgress'
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

export type ObjectiveKind = 'visit' | 'pickup' | 'stash' | 'mark' | 'kill' | 'extract' | 'other'

export function objectiveKind(objective: Pick<QuestObjective, 'type'>): ObjectiveKind {
  switch (objective.type) {
    case 'visit':
      return 'visit'
    case 'findQuestItem':
    case 'findItem':
      return 'pickup'
    case 'plantItem':
    case 'plantQuestItem':
      return 'stash'
    case 'mark':
      return 'mark'
    case 'shoot':
      return 'kill'
    case 'extract':
      return 'extract'
    default:
      return 'other'
  }
}

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

export function questPins(markers: ObjectiveMarker[]): { pins: QuestPin[]; dots: QuestDot[] } {
  const pins: QuestPin[] = []
  const dots: QuestDot[] = []
  for (const { quest, status, trader, objective, zones, spots } of markers) {
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
