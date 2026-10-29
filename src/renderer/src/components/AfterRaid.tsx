import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GAME_MODES } from '../../../shared/gameModes'
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
 * After a PMC raid the logs saw end, what the player could have done on the maps it went to (and on any
 * map), to tick off there and then (since 1.66.0). A raid in another game mode than the one shown asks to
 * switch to it first (since 1.70.0), so the ticks go to the right quests.
 */
export default function AfterRaid({ settings }: { settings: PublicSettings }): React.JSX.Element | null {
  const ended = useStore((s) => s.raidEnded)
  const close = useStore((s) => s.closeRaidEnded)
  if (!ended) return null
  if (ended.gameMode !== settings.gameMode)
    return <OtherMode key={`${ended.raid.foundAt}`} ended={ended} settings={settings} onClose={close} />
  return <AfterRaidDialog key={`${ended.raid.foundAt}`} ended={ended} settings={settings} onClose={close} />
}

const modeName = (mode: string): string => GAME_MODES.find((m) => m.id === mode)?.label ?? mode

/** Esc closes, and the main button takes the focus. */
function useDialogKeys(onClose: () => void): React.RefObject<HTMLButtonElement | null> {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    button.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return button
}

/** The maps' names, from the game's location ids ("bigmap" → Customs). */
function useMapNames(settings: PublicSettings, locations: readonly string[]): string[] {
  const { questState } = useQuestRows(settings)
  const maps = questState?.dataset?.maps
  return useMemo(() => {
    const groups = mapGroups(maps ?? [])
    const lookup = raidMapLookup(maps ?? [])
    return [...new Set(locations.map((l) => groups.get(lookup(l)[0] ?? '')?.name ?? l))]
  }, [maps, locations])
}

/** A raid in another game mode than the one shown: switch to it to tick off what got done. */
function OtherMode({
  ended,
  settings,
  onClose
}: {
  ended: RaidEnded
  settings: PublicSettings
  onClose: () => void
}): React.JSX.Element {
  const setGameMode = useStore((s) => s.setGameMode)
  const names = useMapNames(settings, ended.maps)
  const button = useDialogKeys(onClose)
  return (
    <div className="map-reminder-backdrop after-raid-backdrop">
      <div
        className="map-reminder after-raid"
        role="dialog"
        aria-modal="true"
        aria-labelledby="after-raid-title"
      >
        <h2 id="after-raid-title">
          After your raid on {names.join(' → ')} ({modeName(ended.gameMode)})
        </h2>
        <p className="hint">
          The app is showing {modeName(settings.gameMode)}. Switch to {modeName(ended.gameMode)} to tick off
          what you got done.
        </p>
        <div className="map-reminder-actions">
          <button className="button" onClick={onClose}>
            Skip
          </button>
          {/* The popup opens again in that mode, with the raid's objectives. */}
          <button ref={button} className="button primary" onClick={() => void setGameMode(ended.gameMode)}>
            Switch to {modeName(ended.gameMode)}
          </button>
        </div>
      </div>
    </div>
  )
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
  // Every map the run went to (more than one after transits, since 1.70.0), in order.
  const runGroups = useMemo(() => {
    const lookup = raidMapLookup(maps ?? [])
    const found = ended.maps.map((l) => groups.get(lookup(l)[0] ?? '')).filter((g) => g !== undefined)
    return [...new Map(found.map((g) => [g.key, g])).values()]
  }, [maps, groups, ended.maps])
  const names = useMapNames(settings, ended.maps)

  // What was left to do when the raid ended, kept while the popup is open so ticked steps stay listed.
  const [steps, setSteps] = useState<{ maps: { name: string; steps: Step[] }[]; anyMap: Step[] } | null>(null)
  // After switching game mode, wait for that mode's progress before taking what's left.
  const loaded = useStore((s) => s.questProgress[settings.gameMode] !== undefined)
  useEffect(() => {
    if (steps || !maps || !everyRow.length || !loaded) return
    const plan = todoPlan(rows, objectives, groupOf, { owned, hideBlocked: doable })
    const found = afterRaidSteps(
      plan,
      runGroups.map((g) => g.key),
      hidden
    )
    const strip = ({ quest, objective }: Step): Step => ({ quest, objective })
    setSteps({
      maps: found.maps.map((m) => ({
        name: runGroups.find((g) => g.key === m.key)?.name ?? m.key,
        steps: m.steps.map(strip)
      })),
      anyMap: found.anyMap.map(strip)
    })
  }, [steps, maps, everyRow, rows, objectives, groupOf, runGroups, owned, doable, hidden, loaded])

  // Nothing to tick off: said in a notice that goes by itself, rather than nothing at all (since 1.70.0).
  const nothing = steps !== null && steps.maps.length + steps.anyMap.length === 0
  useEffect(() => {
    if (!nothing) return
    const id = setTimeout(onClose, 8000)
    return () => clearTimeout(id)
  }, [nothing, onClose])

  const button = useDialogKeys(onClose)

  if (!steps) return null
  if (nothing)
    return (
      <div className="after-raid-notice" role="status">
        <span>
          Raid on {names.join(' → ')} recorded · nothing left to tick off there
          {doable ? ' (Only quests I can do is on)' : ''}.
        </span>
        <button className="link-like muted" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
    )
  const { raid } = ended
  // The whole run's time, transits and all.
  const start = ended.runStartedAt ?? raid.startedAt
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
        <h2 id="after-raid-title">After your raid on {names.join(' → ')}</h2>
        <p className="hint">
          {raid.endedAt && `Ended ${minutes(Date.now() - raid.endedAt)} min ago`}
          {start && raid.endedAt && ` · ${minutes(raid.endedAt - start)} min in raid`}. Tick off what you got
          done; it&rsquo;s saved as you go.
        </p>
        {steps.maps.map((m) => (
          <div key={m.name}>{list(`On ${m.name}`, m.steps)}</div>
        ))}
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
