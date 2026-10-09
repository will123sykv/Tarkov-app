import type { GameMode } from './types'
import type { Quest, QuestObjective, StoryObjective, WikiQuestFacts } from './questTypes'
import { objectiveMapIds } from './todo'
import { wikiObjective, type WikiQuestContext } from './wikiQuests'

// tarkov.dev's quests corrected from their pages on the wiki, where the two disagree: the level the
// quest needs, whether Kappa needs it, the quests before it, its objectives' counts and wording, steps
// tarkov.dev leaves out, and conditions and maps to know about. tarkov.dev's quest and objective ids
// stay, so progress, the game's logs and the map's pins keep working. Each quest says what changed.

export interface CorrectionContext extends Pick<WikiQuestContext, 'itemIds' | 'traderIds'> {
  gameMode: GameMode
  /** Quest ids by name (lower case), for the quests before one. */
  questIds: ReadonlyMap<string, string>
  /** Map names by id, for notes. */
  mapNames: ReadonlyMap<string, string>
}

/** How alike two steps' wordings must be (shared words over all words) to be the same step. */
const SAME_STEP = 0.34
const FILLER = new Set(
  'the a an on in of to at any and or from with while using by for is are be all your you its it this that'.split(
    ' '
  )
)

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !FILLER.has(w))
      // "teapots" and "teapot" alike.
      .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))
  )

/** What a step has you do, by its first word: steps of different kinds are rarely the same step. */
function kind(text: string): string {
  const first = text.trim().toLowerCase().split(/\s+/)[0] ?? ''
  if (/^(eliminate|kill|neutrali[sz]e|shoot)$/.test(first)) return 'kill'
  if (/^(hand|give|transfer)$/.test(first)) return 'hand'
  if (/^(stash|plant|hide|place|leave)$/.test(first)) return 'stash'
  if (/^(find|obtain|pick|retrieve|collect|get)$/.test(first)) return 'find'
  if (/^mark$/.test(first)) return 'mark'
  return first
}

function likeness(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (!wa.size || !wb.size) return 0
  const shared = [...wa].filter((w) => wb.has(w)).length
  const score = shared / (wa.size + wb.size - shared)
  return kind(a) === kind(b) ? score : score / 2
}

/** A step that's a condition to keep to rather than something to do. */
const CONDITION =
  /^(do not|don't|you must not|must not|without|survive and extract|you must survive|you can't|you cannot)\b/i

const count = (o: { count: number | null }): number => o.count ?? 1

/** A step's wording, short, for the list of what changed. */
const short = (text: string): string => (text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text)

/** Pair tarkov.dev's objectives with the wiki's steps: the most alike first, each used once. */
function pair(
  objectives: readonly QuestObjective[],
  steps: readonly StoryObjective[]
): Map<StoryObjective, QuestObjective> {
  const candidates: { o: QuestObjective; s: StoryObjective; score: number }[] = []
  for (const o of objectives)
    for (const s of steps) {
      const score = likeness(o.description, s.text)
      if (score >= SAME_STEP) candidates.push({ o, s, score })
    }
  candidates.sort((a, b) => b.score - a.score)
  const used = new Set<QuestObjective>()
  const pairs = new Map<StoryObjective, QuestObjective>()
  for (const { o, s } of candidates) {
    if (used.has(o) || pairs.has(s)) continue
    used.add(o)
    pairs.set(s, o)
  }
  return pairs
}

function correct(quest: Quest, facts: WikiQuestFacts, ctx: CorrectionContext): Quest {
  const changes: string[] = []
  const notes: string[] = []
  let next: Quest = quest

  if (facts.level !== null && facts.level > quest.minPlayerLevel) {
    changes.push(`Level ${quest.minPlayerLevel} → ${facts.level}`)
    next = { ...next, minPlayerLevel: facts.level }
  }
  if (facts.kappa !== null && facts.kappa !== quest.kappaRequired) {
    changes.push(facts.kappa ? 'Needed for Kappa' : 'Not needed for Kappa')
    next = { ...next, kappaRequired: facts.kappa }
  }

  // The quests before it, when the wiki's are all known and must all be completed.
  if (facts.previous.length && !facts.previousLoose) {
    const ids = facts.previous.map((title) => ctx.questIds.get(title.toLowerCase()))
    const known = ids.filter((id): id is string => Boolean(id) && id !== quest.id)
    const before = new Set(quest.requires.map((r) => r.questId))
    if (
      known.length === ids.length &&
      (known.length !== before.size || known.some((id) => !before.has(id)))
    ) {
      changes.push(`Unlocks after ${facts.previous.join(', ')}`)
      next = {
        ...next,
        requires: known.map((questId) => ({
          questId,
          status: quest.requires.find((r) => r.questId === questId)?.status ?? ['complete']
        }))
      }
    }
  }

  // Objectives: the wiki's counts and wording where they differ (in PvE, a page noting PvE differences
  // describes PvP, which tarkov.dev's PvE data already gets right), and its steps tarkov.dev leaves out.
  const steps = facts.objectives.filter((s) => s.depth === 0 && !s.optional)
  const own = quest.objectives.filter((o) => !o.optional)
  const pairs = pair(own, steps)
  const keepCounts = ctx.gameMode === 'pve' && facts.pveNote
  const corrected = new Map<QuestObjective, QuestObjective>()
  for (const [step, o] of pairs) {
    if (keepCounts || step.count === null || count(step) === count(o)) continue
    changes.push(`${short(step.text)}: ${count(o)} → ${count(step)}`)
    corrected.set(o, {
      ...o,
      description: step.text,
      count: step.count,
      wiki: { was: `${o.description}${count(o) > 1 ? ` (${count(o)})` : ''}` }
    })
  }
  // A quest tarkov.dev splits by faction has one page on the wiki for both: steps aren't added.
  const oneSide = quest.faction !== 'Any' || facts.byFaction
  const handsOver = quest.objectives.some((o) => o.type === 'giveItem')
  const added: QuestObjective[] = []
  for (const step of steps) {
    if (pairs.has(step)) continue
    if (CONDITION.test(step.text)) notes.push(step.text)
    // "Find 3 … in raid" next to tarkov.dev's hand-over of them is the same step, in two.
    else if (/^find\b/i.test(step.text) && handsOver) continue
    else if (!oneSide) {
      added.push({ ...wikiObjective(step, ctx), id: `wiki:${step.id}`, wiki: { added: true } })
      changes.push(`Added: ${short(step.text)}`)
    }
  }
  if (corrected.size || added.length)
    next = { ...next, objectives: [...quest.objectives.map((o) => corrected.get(o) ?? o), ...added] }

  // Maps the wiki names that no objective does (unless they're done anywhere).
  const named = new Set(next.objectives.flatMap((o) => objectiveMapIds(o)))
  if (named.size && !facts.byFaction) {
    const others = facts.maps.filter((id) => !named.has(id)).map((id) => ctx.mapNames.get(id) ?? id)
    if (others.length) notes.push(`The wiki also lists ${others.join(', ')}`)
  }

  return changes.length || notes.length ? { ...next, corrections: { changes, notes } } : quest
}

/**
 * tarkov.dev's quests corrected from their wiki pages (`facts`, by quest id). Quests without a page,
 * and story chapters and event quests (already the wiki's), are as they were.
 */
export function applyWikiCorrections(
  quests: readonly Quest[],
  facts: Readonly<Record<string, WikiQuestFacts>>,
  ctx: CorrectionContext
): Quest[] {
  return quests.map((q) => {
    const f = facts[q.id]
    return f && !q.story && !q.wiki ? correct(q, f, ctx) : q
  })
}
