import { CURRENCIES } from './constants'
import type { Quest, QuestObjective, QuestRewards, StoryObjective, WikiQuest } from './questTypes'

// Event quests read from the wiki, shown and tracked like any quest: under the trader who gives them,
// their steps as objectives (with a type guessed from the step's wording, for the icons, the To do
// tab's kill/locate filter and the items to bring or hand over), and their rewards matched to items.

/** A wiki quest's id: stable, from the page's title, so progress ticked off is kept. */
export function wikiQuestId(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
      .replace(/-$/, '') || 'quest'
  return `wiki-${slug}`
}

export interface WikiQuestContext {
  /** Item ids by name (lowercase). */
  itemIds: ReadonlyMap<string, string>
  /** Trader ids by name (lowercase). */
  traderIds: ReadonlyMap<string, string>
  /** Quests the app knows (tarkov.dev's and the wiki ones), by name (lowercase), for "after". */
  questIds: ReadonlyMap<string, string>
  /**
   * The game's ids of quests tarkov.dev doesn't list, by name (lowercase; see `gameQuestIds`): a wiki
   * quest with one takes it, so the game's logs tick it off.
   */
  gameIds?: ReadonlyMap<string, string>
}

/** The game's quest ids by name (lowercase), leaving out names more than one quest has. */
export function gameQuestIds(names: Readonly<Record<string, string>>): Map<string, string> {
  const ids = new Map<string, string | null>()
  for (const [id, name] of Object.entries(names)) {
    const key = name.trim().toLowerCase()
    ids.set(key, ids.has(key) ? null : id)
  }
  return new Map([...ids].filter((e): e is [string, string] => e[1] !== null))
}

/** What a step has you do, from how it starts: the objective type tarkov.dev would give it. */
const TYPES: [RegExp, string][] = [
  [/^hand over\b/i, 'giveItem'],
  [/^(stash|plant|hide|place|leave)\b/i, 'plantItem'],
  [/^(eliminate|kill|neutrali[sz]e|shoot)\b/i, 'shoot'],
  [/^mark\b/i, 'mark'],
  [/^(survive and extract|extract)\b/i, 'extract'],
  [/^(find|obtain|pick up|retrieve|collect|get)\b/i, 'findItem'],
  [/^(scout|locate|visit|reach|check|explore|inspect|search|observe|go)\b/i, 'visit']
]

/** A wiki step as an objective, with a type guessed from its wording and its items matched by name. */
export function wikiObjective(
  step: StoryObjective,
  ctx: Pick<WikiQuestContext, 'itemIds' | 'traderIds'>
): QuestObjective {
  const items = step.itemNames.flatMap((name) => {
    const id = ctx.itemIds.get(name.toLowerCase())
    return id ? [id] : []
  })
  let type = TYPES.find(([re]) => re.test(step.text))?.[1] ?? 'story'
  // Items to hand over, stash or find need to be known items; finding something else is a quest item.
  if ((type === 'giveItem' || type === 'plantItem') && !items.length) type = 'story'
  if (type === 'findItem' && !items.length) type = 'findQuestItem'
  const traderId = step.loyalty ? ctx.traderIds.get(step.loyalty.trader.toLowerCase()) : undefined
  return {
    id: step.id,
    type,
    description: step.text,
    optional: step.optional,
    count: step.count,
    maps: step.maps ?? [],
    items,
    foundInRaid: step.foundInRaid,
    questItem: null,
    zones: [],
    locations: [],
    traderLevel: traderId && step.loyalty ? { traderId, level: step.loyalty.level } : null,
    playerLevel: null,
    questStatus: null,
    requiredKeys: [],
    depth: step.depth,
    branch: step.branch
  }
}

const MONEY_ID = Object.fromEntries(Object.entries(CURRENCIES).map(([id, symbol]) => [symbol, id]))

function rewards(quest: WikiQuest, ctx: WikiQuestContext): QuestRewards {
  const items: QuestRewards['items'] = quest.rewards.money.flatMap(({ currency, amount }) =>
    MONEY_ID[currency] ? [{ itemId: MONEY_ID[currency], count: amount }] : []
  )
  const other: string[] = []
  for (const { name, count } of quest.rewards.items) {
    const itemId = ctx.itemIds.get(name.toLowerCase())
    if (itemId) items.push({ itemId, count })
    else other.push(`${count} × ${name}`)
  }
  return {
    items,
    traderStanding: quest.rewards.standing.flatMap(({ trader, value }) => {
      const traderId = ctx.traderIds.get(trader.toLowerCase())
      return traderId ? [{ traderId, standing: value }] : []
    }),
    offerUnlocks: [],
    craftUnlocks: [],
    skills: [],
    traderUnlocks: [],
    other: [...other, ...quest.rewards.other]
  }
}

const NO_REWARDS: QuestRewards = {
  items: [],
  traderStanding: [],
  offerUnlocks: [],
  craftUnlocks: [],
  skills: [],
  traderUnlocks: [],
  other: []
}

/** A wiki quest's id: the game's, when its name is the game's name for a quest, or its own. */
export function wikiQuestIdIn(quest: WikiQuest, ctx: Pick<WikiQuestContext, 'gameIds'>): string {
  return ctx.gameIds?.get(quest.name.toLowerCase()) ?? wikiQuestId(quest.title)
}

/**
 * Quests from the wiki (event quests the player added, or ones only the wiki has: `listed`) as
 * quests. A trader the app doesn't know leaves them under "Other".
 */
export function wikiQuests(
  quests: readonly WikiQuest[],
  ctx: WikiQuestContext,
  opts: { listed?: boolean } = {}
): Quest[] {
  return quests.map((w) => {
    const id = wikiQuestIdIn(w, ctx)
    const traderId = (w.trader && ctx.traderIds.get(w.trader.toLowerCase())) ?? 'wiki'
    // "A or B" before it can't be said as requirements (each must be met): it's left open.
    const mode = w.previousMode ?? 'all'
    // "Accept [[A]]": A started is enough (as tarkov.dev says it, 'active' counts it done too).
    const status = mode === 'accept' ? ('active' as const) : ('complete' as const)
    return {
      id,
      name: w.name,
      normalizedName: id,
      traderId,
      wikiLink: w.wikiLink,
      minPlayerLevel: w.level ?? 0,
      requires:
        mode === 'any'
          ? []
          : w.previous.flatMap((name) => {
              const questId = ctx.questIds.get(name.toLowerCase())
              return questId && questId !== id ? [{ questId, status: [status] }] : []
            }),
      traderRequirements:
        traderId !== 'wiki' && w.loyaltyLevel
          ? [{ traderId, type: 'level' as const, compareMethod: '>=', value: w.loyaltyLevel }]
          : [],
      objectives: w.objectives.map((o) => wikiObjective(o, ctx)),
      map: w.maps.length === 1 ? w.maps[0] : null,
      kappaRequired: w.kappa,
      lightkeeperRequired: false,
      faction: 'Any',
      experience: w.rewards.experience,
      neededKeys: [],
      rewards: rewards(w, ctx),
      startRewards: NO_REWARDS,
      imageLink: null,
      wiki: {
        title: w.title,
        event: w.event,
        past: w.past,
        description: w.description,
        ...(opts.listed ? { listed: true } : {}),
        ...(id !== wikiQuestId(w.title) ? { logged: true } : {})
      }
    }
  })
}

/** The quests the ones added lead to that aren't added yet, by page title: to offer next. */
export function nextWikiQuests(quests: readonly WikiQuest[], added: readonly string[]): string[] {
  const have = new Set(added.map((t) => t.toLowerCase()))
  const next: string[] = []
  for (const q of quests)
    for (const title of q.leadsTo)
      if (!have.has(title.toLowerCase()) && !next.includes(title)) next.push(title)
  return next
}
