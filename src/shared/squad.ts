import type { Quest, QuestObjective } from './questTypes'

// Since patch 1.1.0 a squad can help with some objectives: progress any group member makes counts for
// everyone in it, even if they don't have the task. The game marks those objectives with an icon, but
// neither tarkov.dev nor the wiki says which they are, so this goes by the objective's kind: the ones
// the patch's write-ups name (eliminations, picking up quest items, marking). The patch notes keep some
// chains strictly solo, The Tarkov Shooter and The Punisher among them.

const SHARED_KINDS = new Set(['shoot', 'findQuestItem', 'mark'])
const SOLO_CHAINS = [/^the tarkov shooter\b/i, /^the punisher\b/i]

/** What the squad icon says when pointed at. */
export const SQUAD_TITLE =
  'Your squad can help: their progress counts for you too (going by the kind of objective; the game marks the exact ones)'

/** Whether a squad's progress likely counts for this objective. */
export function squadShared(quest: Pick<Quest, 'name'>, objective: Pick<QuestObjective, 'type'>): boolean {
  return SHARED_KINDS.has(objective.type) && !SOLO_CHAINS.some((re) => re.test(quest.name))
}
