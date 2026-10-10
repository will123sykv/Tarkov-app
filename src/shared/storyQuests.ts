import { objectiveTarget, objectiveValue, type ObjectiveProgress } from './questProgress'
import type { Quest, QuestObjective, QuestRewards, QuestZone, StoryChapter } from './questTypes'
import { namedPlace, type MapPlace, type StoryPins } from './storyPlaces'

// Story chapters shown and tracked like quests: under a "Story" heading, with their steps as objectives
// and the items their hand-overs take (matched by name) counted with every other quest's.

/** The heading story chapters are listed under, in place of a trader. */
export const STORY_TRADER = { id: 'story', name: 'Story chapters', levels: [], imageLink: null }

const NO_REWARDS: QuestRewards = {
  items: [],
  traderStanding: [],
  offerUnlocks: [],
  craftUnlocks: [],
  skills: [],
  traderUnlocks: [],
  other: []
}

/**
 * Branches every player goes through count; the others are alternatives (which ending, what was done
 * with the case), so their hand-overs aren't counted as needed: they're only listed.
 */
const SHARED_BRANCH = /^(once you|identical for all)/i

export interface StoryContext {
  /** Item ids by name (lowercase). */
  itemIds: ReadonlyMap<string, string>
  /** Trader ids by name (lowercase), for "reach loyalty level N with a trader". */
  traderIds?: ReadonlyMap<string, string>
  /** Named spots on each map (by map id), for the places steps name. */
  places?: ReadonlyMap<string, readonly MapPlace[]>
  /** The player's own pins. */
  pins?: StoryPins
}

/**
 * Where a step is on the maps: the player's pin, else a "roughly here" pin at the place it names on
 * each of its maps.
 */
function stepZones(
  chapterId: string,
  step: StoryChapter['objectives'][number],
  ctx: StoryContext
): QuestZone[] {
  const pin = ctx.pins?.[chapterId]?.[step.id]
  if (pin) return [{ map: pin.map, position: pin.position, outline: [], source: 'mine' }]
  const zones: QuestZone[] = []
  for (const map of step.maps ?? []) {
    const place = namedPlace(step.text, step.guide ?? null, ctx.places?.get(map) ?? [])
    if (place) zones.push({ map, position: place.position, outline: [], source: 'rough', place: place.name })
  }
  return zones
}

/** Story chapters as quests. */
export function storyQuests(chapters: readonly StoryChapter[], ctx: StoryContext): Quest[] {
  return chapters.map((chapter) => ({
    id: chapter.id,
    name: chapter.name,
    normalizedName: chapter.id,
    traderId: STORY_TRADER.id,
    wikiLink: chapter.wikiLink,
    minPlayerLevel: 0,
    requires: [],
    traderRequirements: [],
    objectives: chapter.objectives.map((o): QuestObjective => {
      const counted = !o.branch || SHARED_BRANCH.test(o.branch)
      const items =
        o.handOver && counted
          ? o.itemNames.flatMap((name) => {
              const id = ctx.itemIds.get(name.toLowerCase())
              return id ? [id] : []
            })
          : []
      const traderId = o.loyalty ? ctx.traderIds?.get(o.loyalty.trader.toLowerCase()) : undefined
      const zones = stepZones(chapter.id, o, ctx)
      return {
        id: o.id,
        type: items.length ? 'giveItem' : 'story',
        description: o.text,
        optional: o.optional,
        count: o.count,
        // A pin can be on a map the wiki doesn't name.
        maps: [...new Set([...(o.maps ?? []), ...zones.map((z) => z.map)])],
        items,
        foundInRaid: o.foundInRaid,
        questItem: null,
        zones,
        locations: [],
        traderLevel: traderId && o.loyalty ? { traderId, level: o.loyalty.level } : null,
        playerLevel: null,
        questStatus: null,
        visits: o.visits ?? false,
        // The keys the step links to, each a lock of its own (the ones the app knows).
        requiredKeys: (o.keyNames ?? []).flatMap((name) => {
          const id = ctx.itemIds.get(name.toLowerCase())
          return id ? [[id]] : []
        }),
        depth: o.depth,
        branch: o.branch
      }
    }),
    map: null,
    kappaRequired: false,
    lightkeeperRequired: false,
    faction: 'Any',
    experience: 0,
    neededKeys: [],
    rewards: NO_REWARDS,
    startRewards: NO_REWARDS,
    imageLink: chapter.imageLink,
    story: { description: chapter.description, howItStarts: chapter.howItStarts }
  }))
}

const shared = (branch: string | null | undefined): boolean => !branch || SHARED_BRANCH.test(branch)

/**
 * A story chapter's steps that can be worked on now (by id): a step waits for every required step
 * before it on its path (steps every player takes, and the earlier ones of its own branch) to be done;
 * optional steps never hold others up; sub-steps go with the step they're part of. Any other quest's
 * objectives can all be worked on.
 */
export function reachableSteps(
  quest: Pick<Quest, 'id' | 'objectives' | 'story'>,
  objectives: ObjectiveProgress | undefined
): Set<string> {
  if (!quest.story) return new Set(quest.objectives.map((o) => o.id))
  const result = new Set<string>()
  // Required steps not yet done, and the path each is on.
  const waiting: (string | null)[] = []
  let parentOpen = true
  for (const o of quest.objectives) {
    if ((o.depth ?? 0) > 0) {
      if (parentOpen) result.add(o.id)
      continue
    }
    const branch = o.branch ?? null
    parentOpen = !waiting.some((w) => shared(w) || (!shared(branch) && w === branch))
    if (parentOpen) result.add(o.id)
    if (!o.optional && objectiveValue(o, quest.id, objectives) < objectiveTarget(o)) waiting.push(branch)
  }
  return result
}
