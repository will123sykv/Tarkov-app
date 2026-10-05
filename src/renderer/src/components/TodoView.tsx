import {
  mdiAlertOutline,
  mdiCheckCircleOutline,
  mdiHammerWrench,
  mdiHandExtended,
  mdiKeyVariant
} from '@mdi/js'
import { useMemo } from 'react'
import type { DetectedProgress } from '../../../shared/objectiveDetection'
import { EMPTY_HIDEOUT, stationLevel, upgradeStatus } from '../../../shared/hideout'
import { EMPTY_KEYS, opens } from '../../../shared/keys'
import { objectiveValue, type ObjectiveProgress } from '../../../shared/questProgress'
import type { GameMap, HideoutStation, Quest, QuestTrader } from '../../../shared/questTypes'
import { STORY_TRADER } from '../../../shared/storyQuests'
import {
  objectiveMapIds,
  todoPlan,
  type KeyToGet,
  type MapGroup,
  type MapPlan,
  type TodoStep
} from '../../../shared/todo'
import type { HideoutSettings, PriceState, PublicSettings } from '../../../shared/types'
import { OBJECTIVE_ICONS, OBJECTIVE_KIND_LABEL, objectiveKind } from '../lib/questPins'
import type { Group } from '../lib/mapGroups'
import { formatRub } from '../lib/format'
import { useKeyInfo, type KeyInfo } from '../lib/useKeyInfo'
import { useItemLookup } from '../lib/useItemLookup'
import { useBuyContext } from '../lib/useKeepList'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import { ItemChip, KeyChoice, ObjectiveTick } from './QuestDetail'

// The To do tab: which map to raid next to move your active quests on, what to take, and what can be
// done before the raid (quests to hand in, items to hand over, upgrades to build).

type Items = ReturnType<typeof useItemLookup>

const Icon = ({ path, className }: { path: string; className?: string }): React.JSX.Element => (
  <svg className={`todo-icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden>
    <path d={path} />
  </svg>
)

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** An objective to do, ticked off from here. */
function Step({
  step,
  group,
  mapsById,
  objectives,
  detected,
  keyName
}: {
  step: TodoStep
  group: MapGroup | null
  mapsById: ReadonlyMap<string, GameMap>
  objectives: ObjectiveProgress
  detected: DetectedProgress
  keyName: (keyId: string) => string
}): React.JSX.Element {
  const setKey = useStore((s) => s.setKey)
  const { quest, objective, missing } = step
  const kind = objectiveKind(objective)
  // Only on an alternate version of the map (say, Night Factory): name it.
  const here = group ? objectiveMapIds(objective).filter((id) => group.mapIds.includes(id)) : []
  const where =
    group && group.mapIds.length > 1 && !here.includes(group.mapIds[0])
      ? here.map((id) => mapsById.get(id)?.name ?? 'another version').join(' or ')
      : null
  return (
    <li className={`objective ${missing.length ? 'todo-locked' : ''}`}>
      <div className="objective-head">
        <ObjectiveTick
          quest={quest}
          objective={objective}
          value={objectiveValue(objective, quest.id, objectives)}
          detected={detected[quest.id]?.[objective.id]}
          completed={false}
        />
        <span className="objective-text">
          <span title={OBJECTIVE_KIND_LABEL[kind]}>
            <Icon path={OBJECTIVE_ICONS[kind]} className="kind" />
          </span>
          {objective.description || objective.type}
          {where && <span className="tag">{where}</span>}
          {objective.foundInRaid && objective.items.length > 0 && (
            <span className="tag fir">found in raid</span>
          )}
          {objective.requiredKeys.length > 0 && !missing.length && (
            <span title="Needs a key you have">
              <Icon path={mdiKeyVariant} className="key" />
            </span>
          )}
        </span>
      </div>
      {missing.map((keyIds) => (
        <div key={keyIds.join()} className="todo-missing">
          <Icon path={mdiAlertOutline} />
          <span>
            Needs {keyIds.map(keyName).join(' or ')} <span className="muted">(you don&rsquo;t have it)</span>{' '}
            <button
              className="link small"
              title="Tick it as one of your keys (the Keys tab lists them all)"
              onClick={() => void setKey(keyIds[0], 'owned', true)}
            >
              I have it
            </button>
          </span>
        </div>
      ))}
    </li>
  )
}

/** A quest's name, opening it in the Quests tab, with its trader. */
function QuestLink({
  quest,
  trader,
  onOpen
}: {
  quest: Quest
  trader: QuestTrader | undefined
  onOpen: (questId: string) => void
}): React.JSX.Element {
  return (
    <span className="todo-quest-name">
      {trader?.imageLink && <img className="todo-portrait" src={trader.imageLink} alt="" />}
      <button className="link" title="Open in the Quests tab" onClick={() => onOpen(quest.id)}>
        {quest.name}
      </button>
      {trader && <span className="muted">{trader.name}</span>}
    </span>
  )
}

/** A quest named in a sentence: a link to it, and its trader. */
function QuestRef({
  quest,
  trader,
  onOpen
}: {
  quest: Quest
  trader: QuestTrader | undefined
  onOpen: (questId: string) => void
}): React.JSX.Element {
  return (
    <>
      <button className="link" title="Open in the Quests tab" onClick={() => onOpen(quest.id)}>
        {quest.name}
      </button>
      {trader && <span className="muted"> ({trader.name})</span>}
    </>
  )
}

/** What a raid on one map would get done, and what to take. */
function MapCard({
  plan,
  rank,
  best,
  items,
  traderOf,
  mapsById,
  objectives,
  detected,
  owned,
  keyName,
  onOpenQuest,
  onOpenMap
}: {
  plan: MapPlan
  rank: number
  best: boolean
  items: Items
  traderOf: (quest: Quest) => QuestTrader | undefined
  mapsById: ReadonlyMap<string, GameMap>
  objectives: ObjectiveProgress
  detected: DetectedProgress
  /** The player's keys, when the plan checks them. */
  owned: ReadonlySet<string> | null
  keyName: (keyId: string) => string
  onOpenQuest: (questId: string) => void
  onOpenMap: (mapKey: string) => void
}): React.JSX.Element {
  const group = plan.group as Group
  const doable = plan.steps.filter((s) => !s.missing.length).length
  const reason = [
    `Moves ${plural(plan.quests.length, 'active quest')} on`,
    plural(doable, 'objective'),
    plan.finishes.length ? `finishes ${plan.finishes.length}` : null,
    plan.blocked.length ? `${plan.blocked.length} more behind locks you have no key for` : null
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <article className={`todo-map ${best ? 'best' : ''}`}>
      <header>
        <span className="todo-rank" aria-label={`Number ${rank}`}>
          {rank}
        </span>
        <div>
          <strong>{best ? `Next raid: ${group.name}` : group.name}</strong>
          <span className="muted">{reason}</span>
        </div>
        {group.mapKey && (
          <button
            className="button small"
            title="Open this map in the Maps tab with your active quests' objectives on it"
            onClick={() => onOpenMap(group.mapKey!)}
          >
            Show on map
          </button>
        )}
      </header>
      {plan.quests.length + plan.blocked.length > 0 && (
        <ul className="todo-quests">
          {[...plan.quests, ...plan.blocked].map((quest) => (
            <li key={quest.id} className={plan.blocked.includes(quest) ? 'todo-blocked' : ''}>
              <div className="todo-quest-head">
                <QuestLink quest={quest} trader={traderOf(quest)} onOpen={onOpenQuest} />
                {plan.finishes.includes(quest) && (
                  <span
                    className="badge ok"
                    title="Nothing else is left to do in raid for this quest: do these and hand it in"
                  >
                    Finish here
                  </span>
                )}
                {plan.blocked.includes(quest) && (
                  <span className="badge warn" title="Doesn't count towards this map until you have the key">
                    Needs a key
                  </span>
                )}
              </div>
              <ol className="objectives todo-steps">
                {plan.steps
                  .filter((s) => s.quest === quest)
                  .map((s) => (
                    <Step
                      key={s.objective.id}
                      step={s}
                      group={group}
                      mapsById={mapsById}
                      objectives={objectives}
                      detected={detected}
                      keyName={keyName}
                    />
                  ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
      {(plan.keys.length > 0 || plan.bring.length > 0 || plan.questItems.length > 0) && (
        <div className="todo-take">
          {plan.keys.length > 0 && (
            <div>
              <span className="todo-take-label">Keys</span>
              <span className="todo-take-list">
                {plan.keys.map((keyIds) => {
                  const have = owned ? opens(keyIds, owned) : null
                  return (
                    <span
                      key={keyIds.join()}
                      className={have === false ? 'todo-key-missing' : ''}
                      title={have === false ? "You don't have it" : have ? 'You have it' : undefined}
                    >
                      <KeyChoice keyIds={keyIds} items={items} />
                      {have && <span className="todo-key-have"> ✓</span>}
                    </span>
                  )
                })}
              </span>
            </div>
          )}
          {(plan.bring.length > 0 || plan.questItems.length > 0) && (
            <div>
              <span className="todo-take-label">Bring</span>
              <span className="todo-take-list">
                {plan.bring.map((b) => (
                  <ItemChip key={b.itemId} id={b.itemId} count={b.count} items={items} />
                ))}
                {plan.questItems.map((q) => (
                  <span key={`${q.questId}:${q.name}`} className="item-chip">
                    {q.name} <span className="muted">(quest item)</span>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
      {plan.available.length > 0 && (
        <p className="todo-pickup">
          <span className="muted">Also here, if you pick them up: </span>
          <QuestList quests={plan.available} onOpen={onOpenQuest} />
        </p>
      )}
    </article>
  )
}

/** Quests by name, each opening in the Quests tab. */
function QuestList({
  quests,
  onOpen
}: {
  quests: Quest[]
  onOpen: (questId: string) => void
}): React.JSX.Element {
  return (
    <>
      {quests.map((q, i) => (
        <span key={q.id}>
          {i > 0 && ', '}
          <button className="link" title="Open in the Quests tab" onClick={() => onOpen(q.id)}>
            {q.name}
          </button>
        </span>
      ))}
    </>
  )
}

/**
 * Maps with nothing that can be done there now: active quests behind locks (or a way in) the player has
 * no key for, and quests not picked up yet.
 */
function OtherMaps({
  plans,
  keyName,
  onOpenQuest,
  onOpenMap
}: {
  plans: MapPlan[]
  keyName: (keyId: string) => string
  onOpenQuest: (questId: string) => void
  onOpenMap: (mapKey: string) => void
}): React.JSX.Element {
  return (
    <article className="todo-map others">
      <header>
        <div>
          <strong>Other maps</strong>
          <span className="muted">
            Nothing you can do there yet: active quests behind keys you don&rsquo;t have, or quests you could
            pick up
          </span>
        </div>
      </header>
      <ul className="todo-others">
        {plans.map((p) => {
          const group = p.group as Group
          return (
            <li key={group.key}>
              <strong>{group.name}</strong>
              <span>
                {p.noAccess && (
                  <span className="todo-key-missing">
                    Needs {p.noAccess.map(keyName).join(' or ')} to get in.{' '}
                  </span>
                )}
                {p.blocked.length > 0 && (
                  <span>
                    <span className="muted">
                      {p.noAccess ? 'Then: ' : 'Behind locks you have no key for: '}
                    </span>
                    <QuestList quests={p.blocked} onOpen={onOpenQuest} />
                    {p.available.length > 0 && '. '}
                  </span>
                )}
                {p.available.length > 0 && (
                  <span>
                    {p.blocked.length > 0 && <span className="muted">To pick up: </span>}
                    <QuestList quests={p.available} onOpen={onOpenQuest} />
                  </span>
                )}
              </span>
              {group.mapKey && (
                <button className="link small" onClick={() => onOpenMap(group.mapKey!)}>
                  Show on map
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

/** A key that would open up active quests (or one added from the Keys tab), and how to get it. */
function KeyToGetRow({
  keyIds,
  quests,
  access,
  added,
  info,
  onOpenQuest
}: Partial<Pick<KeyToGet, 'quests' | 'access'>> & {
  keyIds: string[]
  /** Added from the Keys tab. */
  added: boolean
  info: (keyId: string) => KeyInfo
  onOpenQuest: (questId: string) => void
}): React.JSX.Element {
  const setKey = useStore((s) => s.setKey)
  const showKeyOnMap = useStore((s) => s.showKeyOnMap)
  const keys = keyIds.map(info)
  const first = keys[0]
  const best = keys.flatMap((k) => k.buy?.options.slice(0, 1) ?? []).sort((a, b) => a.price - b.price)[0]
  const locked = keys.flatMap((k) => k.buy?.locked ?? [])[0]
  const reward = keys.flatMap((k) => k.rewards)[0]
  const spawns = keys.flatMap((k) => k.spawns)
  const mapKey =
    first.locks.find((l) => l.group.mapKey)?.group.mapKey ?? spawns.find((s) => s.group.mapKey)?.group.mapKey
  return (
    <li>
      <Icon path={mdiKeyVariant} className="key" />
      <div>
        <strong>{keys.map((k) => k.name).join(' or ')}</strong>
        <div className="muted">
          {quests?.length ? (
            <>
              {access ? 'Gets you in for ' : 'For '}
              <QuestList quests={quests} onOpen={onOpenQuest} />
            </>
          ) : added ? (
            'Added from the Keys tab'
          ) : null}
        </div>
        <div className="todo-key-get">
          {best ? (
            <span>
              Buy {formatRub(best.price)} <span className="muted">{best.label}</span>
            </span>
          ) : locked ? (
            <span className="key-locked">Can&rsquo;t buy yet: {locked}</span>
          ) : null}
          {reward && (
            <span>
              {reward.onStart ? 'Given with ' : 'Reward from '}
              <button className="link" onClick={() => onOpenQuest(reward.quest.id)}>
                {reward.quest.name}
              </button>
            </span>
          )}
          {spawns.length > 0 && (
            <span className="muted">
              Spawns on {[...new Set(spawns.map((s) => s.group.name))].join(', ')}
            </span>
          )}
        </div>
        <div className="todo-key-actions">
          <button className="link small" onClick={() => void setKey(first.id, 'owned', true)}>
            I have it
          </button>
          {mapKey && (
            <button className="link small" onClick={() => void showKeyOnMap(first.id, mapKey)}>
              View map
            </button>
          )}
          {added && (
            <button className="link small" onClick={() => void setKey(first.id, 'toDo', false)}>
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

export default function TodoView({
  settings,
  priceState
}: {
  settings: PublicSettings
  priceState: PriceState | null
}): React.JSX.Element {
  const { questState, rows, objectives, detected, mapsById } = useQuestRows(settings)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const updateSettings = useStore((s) => s.updateSettings)
  const selectQuest = useStore((s) => s.selectQuest)
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(settings, priceState)
  const inventory = useStore((s) => s.keys[settings.gameMode]) ?? EMPTY_KEYS
  const { info, groups } = useKeyInfo(settings, priceState)
  const dataset = questState?.dataset ?? null
  const checkKeys = settings.todo.keys
  const owned = useMemo(() => (checkKeys ? new Set(inventory.owned) : null), [checkKeys, inventory.owned])
  const keyName = (keyId: string): string => info(keyId).name

  const plan = useMemo(
    () => todoPlan(rows, objectives, (id) => groups.get(id), progress.have, owned),
    [rows, objectives, groups, progress.have, owned]
  )
  // Keys to get: the ones holding up active quests, then the ones added from the Keys tab.
  const ownedAll = new Set(inventory.owned)
  const listed = new Set(plan.keysToGet.flatMap((k) => k.keyIds))
  const addedKeys = inventory.toDo.filter((id) => !listed.has(id) && !ownedAll.has(id))
  const traders = useMemo(() => new Map((dataset?.traders ?? []).map((t) => [t.id, t])), [dataset])
  const traderOf = (quest: Quest): QuestTrader | undefined =>
    quest.story ? STORY_TRADER : traders.get(quest.traderId)
  // Hideout upgrades with everything in hand.
  const buildable = useMemo(() => {
    const stations = dataset?.stations ?? []
    const byId = new Map(stations.map((s) => [s.id, s]))
    return stations
      .map((station) => ({
        station,
        next: station.levels.find((l) => l.level === stationLevel(station, progress) + 1)
      }))
      .filter((u): u is { station: HideoutStation; next: NonNullable<typeof u.next> } => u.next !== undefined)
      .filter((u) => upgradeStatus(u.next, progress, ctx, items, byId).state === 'ready')
  }, [dataset, progress, ctx, items])

  const openQuest = (questId: string): void => {
    selectQuest(questId)
    void updateSettings({ view: 'quests' })
  }
  const openMap = (mapKey: string): void => {
    const m = settings.maps
    void updateSettings({
      view: 'maps',
      maps: { ...m, mapKey, questScope: m.questScope === 'none' ? 'active' : m.questScope }
    })
  }
  const openItems = (patch: Partial<HideoutSettings>): void =>
    void updateSettings({ view: 'hideout', hideout: { ...settings.hideout, ...patch } })

  const ranked = plan.maps.filter((p) => p.quests.length > 0)
  const keysCount = plan.keysToGet.length + addedKeys.length
  const others = plan.maps.filter((p) => p.quests.length === 0)
  const raidSteps = new Set(
    ranked.flatMap((p) =>
      p.steps.filter((s) => !s.missing.length).map((s) => `${s.quest.id}:${s.objective.id}`)
    )
  ).size
  const beforeCount = plan.turnIn.length + plan.handOvers.length + buildable.length

  return (
    <div className="todo">
      <aside className="sidebar">
        <section>
          <h2>Before you raid</h2>
          {beforeCount === 0 ? (
            <p className="hint">Nothing to hand in, hand over or build right now.</p>
          ) : (
            <ul className="todo-before">
              {plan.turnIn.map((quest) => (
                <li key={quest.id}>
                  <Icon path={mdiCheckCircleOutline} className="ok" />
                  <div>
                    Hand in <QuestRef quest={quest} trader={traderOf(quest)} onOpen={openQuest} />
                    <div className="muted">Every objective is ticked off</div>
                  </div>
                </li>
              ))}
              {plan.handOvers.map((h) => (
                <li key={`${h.quest.id}:${h.objective.id}`}>
                  <Icon path={mdiHandExtended} />
                  <div>
                    <div>
                      Hand over{' '}
                      {h.itemId ? (
                        <ItemChip id={h.itemId} count={h.count} items={items} />
                      ) : (
                        <strong>{h.objective.questItem?.name ?? 'the quest item'}</strong>
                      )}
                      {h.objective.foundInRaid && h.itemId && (
                        <span className="tag fir" title="Bought ones don't count">
                          found in raid
                        </span>
                      )}
                    </div>
                    <div className="muted">
                      for <QuestRef quest={h.quest} trader={traderOf(h.quest)} onOpen={openQuest} />
                      {h.have !== null && ` · you have ${h.have}`}
                    </div>
                  </div>
                </li>
              ))}
              {buildable.map(({ station, next }) => (
                <li key={station.id}>
                  <Icon path={mdiHammerWrench} />
                  <div>
                    Build{' '}
                    <button className="link" onClick={() => openItems({ tab: 'upgrades' })}>
                      {station.name} level {next.level}
                    </button>
                    <div className="muted">Every item is in hand</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            Hand-overs and upgrades count what you&rsquo;ve put aside in Items to collect.
          </p>
        </section>
        <section>
          <h2>Keys to get</h2>
          {keysCount === 0 ? (
            <p className="hint">
              {checkKeys
                ? 'None: you have a key for every lock your active quests need opened.'
                : 'Keys aren’t checked: tick the box below to leave out what you have no key for.'}
            </p>
          ) : (
            <ul className="todo-before">
              {plan.keysToGet.map((k) => (
                <KeyToGetRow
                  key={k.keyIds.join()}
                  keyIds={k.keyIds}
                  quests={k.quests}
                  access={k.access}
                  added={false}
                  info={info}
                  onOpenQuest={openQuest}
                />
              ))}
              {addedKeys.map((id) => (
                <KeyToGetRow key={id} keyIds={[id]} added info={info} onOpenQuest={openQuest} />
              ))}
            </ul>
          )}
          <label className="check todo-check">
            <input
              type="checkbox"
              checked={checkKeys}
              onChange={(e) => void updateSettings({ todo: { ...settings.todo, keys: e.target.checked } })}
            />
            Leave out what I have no key for
          </label>
          <p className="hint">
            Objectives behind a lock none of your keys open (tick yours in the Keys tab), or on a map you
            can&rsquo;t get onto, don&rsquo;t count towards which map to raid.
          </p>
        </section>
        <section>
          <h2>On any map</h2>
          {plan.anyMap.length === 0 ? (
            <p className="hint">None of your active quests has anything to do that isn&rsquo;t on a map.</p>
          ) : (
            <ul className="todo-anywhere">
              {plan.anyMap.map((s) => (
                <li key={`${s.quest.id}:${s.objective.id}`}>
                  <QuestLink quest={s.quest} trader={traderOf(s.quest)} onOpen={openQuest} />
                  <ol className="objectives todo-steps">
                    <Step
                      step={s}
                      group={null}
                      mapsById={mapsById}
                      objectives={objectives}
                      detected={detected}
                      keyName={keyName}
                    />
                  </ol>
                </li>
              ))}
            </ul>
          )}
          {plan.finds.length > 0 && (
            <p className="hint">
              And {plural(plan.finds.length, 'item')} to find in raid that you haven&rsquo;t put aside yet:{' '}
              <button className="link" onClick={() => openItems({ tab: 'items', source: 'quests' })}>
                see what quests need
              </button>
              .
            </p>
          )}
        </section>
        <section>
          <h2>How maps are ranked</h2>
          <p className="hint">
            By how many of your active quests a raid there moves on. A quest with nothing left to do in raid
            anywhere else counts twice: finishing it opens up the next ones. Quests you haven&rsquo;t picked
            up yet are listed, but don&rsquo;t count.
          </p>
          <p className="hint">
            Tick objectives off here or in the Quests tab as you do them: the game&rsquo;s logs only say when
            a quest starts and finishes.
          </p>
        </section>
      </aside>
      <main className="content">
        <div className="summary">
          <div className="summary-title">
            <strong>To do</strong>
            <span className="muted">
              {!dataset
                ? questState?.error
                  ? `Couldn't load quests: ${questState.error}`
                  : 'Loading quests…'
                : plan.active === 0
                  ? 'No active quests: start them in the Quests tab, or let the game’s logs say.'
                  : `${plural(plan.active, 'active quest')} · ${plural(raidSteps, 'objective')} left in raid on ${plural(ranked.length, 'map')}` +
                    (plan.anyMap.length ? ` · ${plan.anyMap.length} on any map` : '') +
                    (keysCount ? ` · ${plural(keysCount, 'key')} to get` : '') +
                    (beforeCount ? ` · ${beforeCount} to do before you raid` : '')}
            </span>
          </div>
        </div>
        {dataset && ranked.length === 0 ? (
          <div className="empty">
            <p>
              {plan.active === 0
                ? 'Start some quests and this says which map to raid next.'
                : others.some((p) => p.blocked.length)
                  ? 'Everything your active quests have left on a map is behind a key you don’t have.'
                  : 'None of your active quests has anything left to do on a particular map.'}
            </p>
            {others.some((p) => p.blocked.length) ? (
              <p className="hint">The keys are listed under Keys to get.</p>
            ) : (
              plan.maps.length > 0 && (
                <p className="hint">
                  Quests you could pick up have objectives on {plan.maps.map((p) => p.group.name).join(', ')}.
                </p>
              )
            )}
          </div>
        ) : (
          <div className="todo-maps">
            {ranked.map((p, i) => (
              <MapCard
                key={p.group.key}
                plan={p}
                rank={i + 1}
                best={i === 0}
                items={items}
                traderOf={traderOf}
                mapsById={mapsById}
                objectives={objectives}
                detected={detected}
                owned={owned}
                keyName={keyName}
                onOpenQuest={openQuest}
                onOpenMap={openMap}
              />
            ))}
            {others.length > 0 && (
              <OtherMaps plans={others} keyName={keyName} onOpenQuest={openQuest} onOpenMap={openMap} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
