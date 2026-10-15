import { useMemo } from 'react'
import type { ObjectiveProgress } from '../../../shared/questProgress'
import { todoPlan, type MapGroup, type TodoPlan } from '../../../shared/todo'
import type { PublicSettings } from '../../../shared/types'
import type { QuestRow } from './useQuestRows'

/**
 * What raids on each map would get done and what to take, as the To do tab shows it: with the
 * player's keys (and friends', when counted), what's put aside, and the To do settings (Only quests I
 * can do, Kill or Locate). The To do tab and the map's reminder share it.
 */
export function useTodoPlan(
  settings: PublicSettings,
  rows: readonly QuestRow[],
  objectives: ObjectiveProgress,
  groupOf: (mapId: string) => MapGroup | undefined,
  owned: ReadonlySet<string>,
  have: Readonly<Record<string, number>>
): TodoPlan {
  const { show, kinds } = settings.todo
  return useMemo(
    () => todoPlan(rows, objectives, groupOf, { have, owned, hideBlocked: show === 'doable', kinds }),
    [rows, objectives, groupOf, have, owned, show, kinds]
  )
}
