import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RaidEnded } from '../../../shared/logTypes'
import { objectiveValue } from '../../../shared/questProgress'
import type { Quest, QuestObjective } from '../../../shared/questTypes'
import { ofKind } from '../../../shared/questKind'
import { afterRaidSteps, todoPlan } from '../../../shared/todo'
import type { PublicSettings } from '../../../shared/types'
import { mapGroups } from '../lib/mapGroups'
import { raidMapLookup } from '../lib/storyMaps'
import { useFriendKeys } from '../lib/useFriendKeys'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import { ObjectiveTick } from './QuestDetail'

/**
 * After a PMC raid the logs saw end, what the player could have done on that map (and on any map), to
 * tick off there and then (since 1.66.0). Only for the game mode shown.
 */
export default function AfterRaid({ settings }: { settings: PublicSettings }): React.JSX.Element | null {
  const ended = useStore((s) => s.raidEnded)
  const close = useStore((s) => s.closeRaidEnded)
  if (!ended || ended.gameMode !== settings.gameMode) return null
  return <AfterRaidDialog key={`${ended.raid.foundAt}`} ended={ended} settings={settings} onClose={close} />
}

interface Step {
  quest: Quest
  objective: QuestObjective
}

const minutes = (ms: number): number => Math.max(1, Math.round(ms / 60_000))

function AfterRaidDialog({
  ended,
  settings,
  onClose
}: {
  ended: RaidEnded
  settings: PublicSettings
  onClose: () => void
}): React.JSX.Element | null {
  const { rows: everyRow, questState, objectives, detected } = useQuestRows(settings)
  // The map's filters (since 1.68.0): All · Story · Side, quests taken off the map, and Only quests I
  // can do (your keys, and friends' with Count friends' keys on).
  const rows = useMemo(() => ofKind(everyRow, settings.quests.kind), [everyRow, settings.quests.kind])
  const { owned } = useFriendKeys(settings)
  const doable = settings.todo.show === 'doable'
  const hidden = useMemo(() => new Set(settings.maps.hiddenQuests), [settings.maps.hiddenQuests])
  const maps = questState?.dataset?.maps
  const groups = useMemo(() => mapGroups(maps ?? []), [maps])
  const groupOf = useCallback((id: string) => groups.get(id), [groups])
  const group = useMemo(() => {
    const ids = raidMapLookup(maps ?? [])(ended.raid.map)
    return ids.length ? groups.get(ids[0]) : undefined
  }, [maps, groups, ended.raid.map])

  // What was left to do when the raid ended, kept while the popup is open so ticked steps stay listed.
  const [steps, setSteps] = useState<{ here: Step[]; anyMap: Step[] } | null>(null)
  useEffect(() => {
    if (steps || !maps || !everyRow.length) return
    const plan = todoPlan(rows, objectives, groupOf, { owned, hideBlocked: doable })
    const { here, anyMap } = afterRaidSteps(plan, group?.key, hidden)
    const strip = ({ quest, objective }: Step): Step => ({ quest, objective })
    setSteps({ here: here.map(strip), anyMap: anyMap.map(strip) })
  }, [steps, maps, everyRow, rows, objectives, groupOf, group, owned, doable, hidden])

  const nothing = steps !== null && steps.here.length + steps.anyMap.length === 0
  useEffect(() => {
    if (nothing) onClose()
  }, [nothing, onClose])

  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    button.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!steps || nothing) return null
  const { raid } = ended
  const completed = new Set(everyRow.filter((r) => r.status === 'completed').map((r) => r.quest.id))
  const list = (title: string, items: Step[]): React.JSX.Element | null => {
    if (!items.length) return null
    const byQuest = new Map<Quest, QuestObjective[]>()
    for (const { quest, objective } of items) byQuest.set(quest, [...(byQuest.get(quest) ?? []), objective])
    return (
      <section>
        <h3>{title}</h3>
        {[...byQuest].map(([quest, objs]) => (
          <div key={quest.id} className="after-raid-quest">
            <strong>{quest.name}</strong>
            <ul>
              {objs.map((objective) => (
                <li key={objective.id} className="objective">
                  <ObjectiveTick
                    quest={quest}
                    objective={objective}
                    value={objectiveValue(objective, quest.id, objectives)}
                    detected={detected[quest.id]?.[objective.id]}
                    completed={completed.has(quest.id)}
                  />
                  <span className="objective-text">{objective.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    )
  }
  return (
    <div className="map-reminder-backdrop after-raid-backdrop">
      <div
        className="map-reminder after-raid"
        role="dialog"
        aria-modal="true"
        aria-labelledby="after-raid-title"
      >
        <h2 id="after-raid-title">After your raid on {group?.name ?? raid.map}</h2>
        <p className="hint">
          {raid.endedAt && `Ended ${minutes(Date.now() - raid.endedAt)} min ago`}
          {raid.startedAt && raid.endedAt && ` · ${minutes(raid.endedAt - raid.startedAt)} min in raid`}. Tick
          off what you got done; it&rsquo;s saved as you go.
        </p>
        {list(group ? `On ${group.name}` : 'On this map', steps.here)}
        {list('On any map', steps.anyMap)}
        <div className="map-reminder-actions">
          <button ref={button} className="button primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
