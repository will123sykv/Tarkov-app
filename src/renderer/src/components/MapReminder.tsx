import { useEffect, useRef } from 'react'
import { opens } from '../../../shared/keys'
import type { BringItem, MapPlan, TodoStep } from '../../../shared/todo'
import type { MapGun } from '../../../shared/weapons'
import type { useItemLookup } from '../lib/useItemLookup'
import { ItemChip, KeyChoice } from './QuestDetail'
import { MapGunPanel } from './GunCards'
import { BringChip } from './TakeChips'

type Items = ReturnType<typeof useItemLookup>

/** How many items to look out for before "+N more". */
const MAX_FINDS = 8

/** What a raid on a map takes: keys, things to bring, and found-in-raid items to look out for. */
export interface RaidReminder {
  /** The keys the map's objectives need: any one of each list. */
  keys: string[][]
  /** The items needed to get onto the map, when the player has none of them. */
  noAccess: string[] | null
  /** The gun for the map's kill quests, chosen in the Weapons tab or suggested (since 1.54.0). */
  gun: MapGun | null
  /** The map's key, to open the Weapons tab at it. */
  mapKey: string
  bring: BringItem[]
  questItems: MapPlan['questItems']
  /** Items to find in raid for active quests, not yet put aside. */
  finds: TodoStep[]
}

/** Whether there's anything to remind the player of. */
export const hasReminder = (r: RaidReminder): boolean =>
  r.keys.length +
    (r.noAccess ? 1 : 0) +
    (r.gun ? 1 : 0) +
    r.bring.length +
    r.questItems.length +
    r.finds.length >
  0

/**
 * What to take into a raid on the map just opened, until closed with Got it (or Esc): the keys its
 * quests need (and whether the player has them), what to bring, and what to look out for.
 */
export default function MapReminder({
  mapName,
  reminder,
  items,
  owned,
  friendsWith,
  have,
  onClose
}: {
  mapName: string
  reminder: RaidReminder
  items: Items
  owned: ReadonlySet<string>
  friendsWith: (keyIds: string[]) => string[]
  have: Readonly<Record<string, number>>
  onClose: () => void
}): React.JSX.Element {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    button.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const { keys, noAccess, gun, mapKey, bring, questItems, finds } = reminder
  const missingKeys = keys.filter((k) => !opens(k, owned)).length
  const haveOf = (b: BringItem): number => b.itemIds.reduce((n, id) => n + (have[id] ?? 0), 0)
  return (
    <div className="map-reminder-backdrop">
      <div className="map-reminder" role="dialog" aria-modal="true" aria-labelledby="map-reminder-title">
        <h2 id="map-reminder-title">Before you raid {mapName}</h2>
        {(keys.length > 0 || noAccess) && (
          <section>
            <h3>
              Keys
              {missingKeys > 0 && <span className="muted"> · {missingKeys} you don&rsquo;t have</span>}
            </h3>
            <ul>
              {noAccess && (
                <li>
                  <span className="muted">To get in: </span>
                  <KeyChoice keyIds={noAccess} items={items} owned={owned} />
                </li>
              )}
              {keys.map((keyIds) => {
                const friends = opens(keyIds, owned) ? [] : friendsWith(keyIds)
                return (
                  <li key={keyIds.join()}>
                    <KeyChoice keyIds={keyIds} items={items} owned={owned} />
                    {friends.length > 0 && <span className="muted"> · {friends.join(', ')} has it</span>}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {gun && (
          <section>
            <h3>Gun</h3>
            <MapGunPanel gun={gun} items={items} mapKey={mapKey} onChange={onClose} />
          </section>
        )}
        {(bring.length > 0 || questItems.length > 0) && (
          <section>
            <h3>Bring</h3>
            <div className="map-reminder-chips">
              {bring.map((b) => (
                <BringChip
                  key={`${b.itemIds.join()}${b.anyMap ? ':any' : ''}`}
                  item={b}
                  items={items}
                  have={haveOf(b)}
                />
              ))}
              {questItems.map((q) => (
                <span key={`${q.questId}:${q.name}`} className="item-chip">
                  {q.name} <span className="muted">(quest item)</span>
                </span>
              ))}
            </div>
          </section>
        )}
        {finds.length > 0 && (
          <section>
            <h3>Look out for</h3>
            <p className="hint">Found in raid, for your active quests, and not put aside yet.</p>
            <div className="map-reminder-chips">
              {finds.slice(0, MAX_FINDS).map((s) =>
                s.objective.items.length === 1 ? (
                  <span key={`${s.quest.id}:${s.objective.id}`} title={`For ${s.quest.name}`}>
                    <ItemChip id={s.objective.items[0]} count={s.left} items={items} />
                  </span>
                ) : (
                  <span
                    key={`${s.quest.id}:${s.objective.id}`}
                    className="item-chip"
                    title={`For ${s.quest.name}`}
                  >
                    {s.objective.description}
                  </span>
                )
              )}
              {finds.length > MAX_FINDS && <span className="muted">+{finds.length - MAX_FINDS} more</span>}
            </div>
          </section>
        )}
        <div className="map-reminder-actions">
          <button ref={button} className="button primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
