import type { Quest } from './questTypes'
import type { QuestKindFilter } from './types'

// The quest pages' All · Story · Side switch (since 1.61.0): the main story's chapters (Tour, Falling
// Skies…) or the side quests (everything else: traders' quests, event quests, the wiki's own).

export type QuestKind = 'story' | 'side'

export const questKind = (quest: Pick<Quest, 'story'>): QuestKind => (quest.story ? 'story' : 'side')

/** The rows of the kind chosen (all of them for 'all'). */
export function ofKind<T extends { quest: Pick<Quest, 'story'> }>(
  rows: readonly T[],
  kind: QuestKindFilter
): T[] {
  return kind === 'all' ? [...rows] : rows.filter((r) => questKind(r.quest) === kind)
}
