import type { Quest, QuestObjective, QuestRewards, StoryChapter } from './questTypes'

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

/** Story chapters as quests. `itemIds` finds an item's id by its name (case doesn't matter). */
export function storyQuests(
  chapters: readonly StoryChapter[],
  itemIds: ReadonlyMap<string, string>
): Quest[] {
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
              const id = itemIds.get(name.toLowerCase())
              return id ? [id] : []
            })
          : []
      return {
        id: o.id,
        type: items.length ? 'giveItem' : 'story',
        description: o.text,
        optional: o.optional,
        count: o.count,
        maps: [],
        items,
        foundInRaid: o.foundInRaid,
        questItem: null,
        zones: [],
        locations: [],
        traderLevel: null,
        requiredKeys: [],
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
