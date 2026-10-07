import {
  mdiAlertOutline,
  mdiCheckCircleOutline,
  mdiHammerWrench,
  mdiHandExtended,
  mdiKeyVariant
} from '@mdi/js'
import { useMemo, useState } from 'react'
import type { DetectedProgress } from '../../../shared/objectiveDetection'
import { EMPTY_HIDEOUT, stationLevel, upgradeStatus } from '../../../shared/hideout'
import { EMPTY_KEYS, opens } from '../../../shared/keys'
import { objectiveValue, type ObjectiveProgress } from '../../../shared/questProgress'
import type { GameMap, HideoutStation, Quest, QuestTrader } from '../../../shared/questTypes'
import { STORY_TRADER } from '../../../shared/storyQuests'
import {
  mapOverview,
  objectiveMapIds,
  questSummary,
  todoPlan,
  type KeyToGet,
  type MapGroup,
  type MapPlan,
  type TodoStep
} from '../../../shared/todo'
import type { HideoutSettings, PriceState, PublicSettings, TodoSettings } from '../../../shared/types'
import { OBJECTIVE_ICONS, OBJECTIVE_KIND_LABEL, objectiveKind } from '../lib/questPins'
import type { Group } from '../lib/mapGroups'
import { formatRub } from '../lib/format'
import { formatMoney, formatStanding } from '../lib/questSummary'
import { useKeyInfo, type KeyInfo } from '../lib/useKeyInfo'
import { useItemLookup } from '../lib/useItemLookup'
import { useBuyContext } from '../lib/useKeepList'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import QuestDetail, { ItemChip, KeyChoice, ObjectiveTick } from './QuestDetail'
import Sidebar, { SidebarSection } from './Sidebar'

// The To do tab: which map to raid next to move your active quests on, what to take, and what can be
// done before the raid (quests to hand in, items to hand over, upgrades to build). Filters leave out
// what's behind keys the player doesn't have, or one kind of objective; each quest shows as a summary
// (or every objective to tick off), with its full details a click away.

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
      <button className="link" title="See its details" onClick={() => onOpen(quest.id)}>
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

/** What a quest gives: money, what its items are worth now, experience and the trader's reputation. */
function rewardLine(quest: Quest, items: Items, trader: QuestTrader | undefined): string | null {
  const parts: string[] = []
  let worth = 0
  for (const { itemId, count } of quest.rewards.items) {
    const money = formatMoney(itemId, count)
    if (money) parts.push(money)
    else {
      const item = items.get(itemId)
      worth += Math.max(item?.fleaPrice ?? 0, item?.bestTrader?.price ?? 0) * count
    }
  }
  if (worth > 0) parts.push(`items ≈ ${formatRub(worth)}`)
  if (quest.experience > 0) parts.push(`${quest.experience.toLocaleString('en-US')} XP`)
  const rep = quest.rewards.traderStanding.find((t) => t.traderId === quest.traderId)
  if (rep && trader) parts.push(`${formatStanding(rep.standing)} ${trader.name}`)
  return parts.length ? parts.join(' · ') : null
}

/** A quest in a few lines: what to do on this map and how far along, what's in the way, the reward. */
function QuestCard({
  quest,
  plan,
  objectives,
  trader,
  items,
  otherMaps,
  keyName,
  onDetails
}: {
  quest: Quest
  plan: MapPlan
  objectives: ObjectiveProgress
  trader: QuestTrader | undefined
  items: Items
  /** Other maps where it has objectives left. */
  otherMaps: string[]
  keyName: (keyId: string) => string
  onDetails: (questId: string) => void
}): React.JSX.Element {
  const setKey = useStore((s) => s.setKey)
  const steps = plan.steps.filter((s) => s.quest === quest)
  const group = plan.group as Group
  const { lines, more } = questSummary(quest, objectives, steps, group, [group.name])
  const missing = [...new Map(steps.flatMap((s) => s.missing).map((k) => [k.join(), k])).values()]
  const reward = rewardLine(quest, items, trader)
  const blocked = plan.blocked.includes(quest)
  return (
    <li className={`todo-card ${blocked ? 'todo-blocked' : ''}`}>
      <div className="todo-quest-head">
        <span className="todo-quest-name">
          {trader?.imageLink && <img className="todo-portrait" src={trader.imageLink} alt="" />}
          <button className="link" title="See its details" onClick={() => onDetails(quest.id)}>
            {quest.name}
          </button>
          {trader && <span className="muted">{trader.name}</span>}
        </span>
        {plan.finishes.includes(quest) && (
          <span
            className="badge ok"
            title="Nothing else is left to do in raid for this quest: do these and hand it in"
          >
            Finish here
          </span>
        )}
        {blocked && (
          <span className="badge warn" title="Everything it has here is behind a key you don't have">
            Needs a key
          </span>
        )}
        <button className="link small todo-details" onClick={() => onDetails(quest.id)}>
          Details ▶
        </button>
      </div>
      <ul className="todo-lines">
        {lines.map((l, i) => (
          <li key={i}>
            <span title={OBJECTIVE_KIND_LABEL[l.kind]}>
              <Icon path={OBJECTIVE_ICONS[l.kind]} className="kind" />
            </span>
            <span className="todo-line-text">{l.text}</span>
            {l.total > 1 && (
              <span className={`todo-progress ${l.done >= l.total ? 'done' : ''}`}>
                {l.done}/{l.total}
              </span>
            )}
          </li>
        ))}
        {more > 0 && <li className="muted todo-more">+{plural(more, 'more objective')}</li>}
      </ul>
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
      {otherMaps.length > 0 && <div className="muted todo-also">Also on {otherMaps.join(', ')}</div>}
      {reward && (
        <div className="todo-reward">
          <span className="muted">Reward</span> {reward}
        </div>
      )}
    </li>
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
  view,
  questMaps,
  onDetails,
  onOpenQuest,
  onOpenMap,
  wide = false
}: {
  plan: MapPlan
  rank: number
  best: boolean
  items: Items
  traderOf: (quest: Quest) => QuestTrader | undefined
  mapsById: ReadonlyMap<string, GameMap>
  objectives: ObjectiveProgress
  detected: DetectedProgress
  /** The player's keys. */
  owned: ReadonlySet<string>
  keyName: (keyId: string) => string
  view: TodoSettings['view']
  /** The maps each quest has objectives on, for "also on". */
  questMaps: ReadonlyMap<Quest, string[]>
  onDetails: (questId: string) => void
  onOpenQuest: (questId: string) => void
  onOpenMap: (mapKey: string) => void
  /** Across the page, its quests side by side (as the map to raid next is). */
  wide?: boolean
}): React.JSX.Element {
  const setKey = useStore((s) => s.setKey)
  const group = plan.group as Group
  const reason = [
    `Moves ${plural(plan.quests.length, 'active quest')} on`,
    plural(plan.steps.length, 'objective'),
    plan.finishes.length ? `finishes ${plan.finishes.length}` : null,
    plan.blocked.length
      ? `${plan.blocked.length} need${plan.blocked.length === 1 ? 's' : ''} a key you don't have`
      : null
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <article className={`todo-map ${best ? 'best' : ''} ${wide ? 'wide' : ''}`}>
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
      {plan.noAccess && (
        <div className="todo-missing todo-access">
          <Icon path={mdiAlertOutline} />
          <span>
            Needs {plan.noAccess.map(keyName).join(' or ')} to get in{' '}
            <span className="muted">(you don&rsquo;t have it)</span>{' '}
            <button className="link small" onClick={() => void setKey(plan.noAccess![0], 'owned', true)}>
              I have it
            </button>
          </span>
        </div>
      )}
      {view === 'summary' && plan.quests.length > 0 && (
        <ul className="todo-quests todo-cards">
          {plan.quests.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              plan={plan}
              objectives={objectives}
              trader={traderOf(quest)}
              items={items}
              otherMaps={(questMaps.get(quest) ?? []).filter((name) => name !== group.name)}
              keyName={keyName}
              onDetails={onDetails}
            />
          ))}
        </ul>
      )}
      {view === 'full' && plan.quests.length > 0 && (
        <ul className="todo-quests">
          {plan.quests.map((quest) => (
            <li key={quest.id} className={plan.blocked.includes(quest) ? 'todo-blocked' : ''}>
              <div className="todo-quest-head">
                <QuestLink quest={quest} trader={traderOf(quest)} onOpen={onDetails} />
                {plan.finishes.includes(quest) && (
                  <span
                    className="badge ok"
                    title="Nothing else is left to do in raid for this quest: do these and hand it in"
                  >
                    Finish here
                  </span>
                )}
                {plan.blocked.includes(quest) && (
                  <span className="badge warn" title="Everything it has here is behind a key you don't have">
                    Needs a key
                  </span>
                )}
                <button className="link small todo-details" onClick={() => onDetails(quest.id)}>
                  Details ▶
                </button>
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
                  const have = opens(keyIds, owned)
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

/** A map at a glance: how much a raid there gets done, and what's in the way. Click it for its quests. */
function MapTile({
  plan,
  rank,
  best,
  owned,
  keyName,
  traderOf,
  onOpen
}: {
  plan: MapPlan
  rank: number
  best: boolean
  owned: ReadonlySet<string>
  keyName: (keyId: string) => string
  traderOf: (quest: Quest) => QuestTrader | undefined
  onOpen: (mapKey: string) => void
}): React.JSX.Element {
  const group = plan.group
  const o = mapOverview(plan, owned)
  const total = o.done + o.left
  const shown = plan.quests.slice(0, 3)
  const more = plan.quests.length - shown.length
  return (
    <button
      className={`todo-tile ${best ? 'best' : ''}`}
      aria-label={`${group.name}: ${plural(o.quests, 'quest')}, ${plural(o.left, 'objective')} left. Show its quests`}
      onClick={() => onOpen(group.key)}
    >
      <span className="todo-tile-head">
        <span className="todo-rank">{rank}</span>
        <span className="todo-tile-name">
          {best && <span className="todo-next">Next raid</span>}
          <strong>{group.name}</strong>
        </span>
        <span className="todo-tile-open" aria-hidden>
          ▶
        </span>
      </span>
      <span className="todo-tile-line">
        {plural(o.quests, 'quest')} · {plural(o.left, 'objective')} left
      </span>
      {(o.kills > 0 || o.locate > 0) && (
        <span className="todo-tile-stats">
          {o.kills > 0 && (
            <span title="Enemies left to kill here">
              <Icon path={OBJECTIVE_ICONS.kill} className="kind" />
              {plural(o.kills, 'kill')}
            </span>
          )}
          {o.locate > 0 && (
            <span title="Places to go to, spots to mark, items to find or stash, and extracts">
              <Icon path={OBJECTIVE_ICONS.visit} className="kind" />
              {o.locate} to locate
            </span>
          )}
        </span>
      )}
      <span className="todo-tile-progress">
        <span
          className="todo-bar"
          role="progressbar"
          aria-label="Objectives done here"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={o.done}
        >
          <span style={{ width: `${total ? (o.done / total) * 100 : 0}%` }} />
        </span>
        <span className="muted">
          {o.done} of {total} done
        </span>
      </span>
      {(o.finishes > 0 || o.blocked > 0 || o.keys > 0 || o.bring > 0 || o.pickUp > 0) && (
        <span className="todo-chips">
          {o.finishes > 0 && (
            <span className="badge ok" title="Quests with nothing left to do in raid anywhere else">
              Finishes {o.finishes}
            </span>
          )}
          {plan.noAccess ? (
            <span className="badge warn" title="You don't have what gets you onto this map">
              Can&rsquo;t get in: {plan.noAccess.map(keyName).join(' or ')}
            </span>
          ) : (
            o.blocked > 0 && (
              <span className="badge warn" title="Everything they have here is behind a key you don't have">
                {o.blocked} need{o.blocked === 1 ? 's' : ''} a key
              </span>
            )
          )}
          {o.keys > 0 && (
            <span
              className={`todo-chip ${o.missingKeys ? 'missing' : ''}`}
              title={
                o.missingKeys
                  ? "Keys the objectives here need, and how many you don't have"
                  : 'You have them all'
              }
            >
              {plural(o.keys, 'key')}
              {o.missingKeys ? ` · ${o.missingKeys} missing` : ' ✓'}
            </span>
          )}
          {o.bring > 0 && (
            <span className="todo-chip" title="Items and quest items to take in">
              {plural(o.bring, 'item')} to bring
            </span>
          )}
          {o.pickUp > 0 && (
            <span className="todo-chip" title="Quests you haven't picked up yet that have objectives here">
              +{o.pickUp} to pick up
            </span>
          )}
        </span>
      )}
      <span className="todo-tile-quests">
        {shown.map((q) => {
          const trader = traderOf(q)
          return (
            <span key={q.id}>
              {trader?.imageLink && <img className="todo-portrait" src={trader.imageLink} alt="" />}
              <span>{q.name}</span>
            </span>
          )
        })}
        {more > 0 && <span className="muted">+{more} more</span>}
      </span>
    </button>
  )
}

/** Back to the overview, and on to the map before or after in the ranking. */
function MapNav({
  plans,
  current,
  name,
  onOpen
}: {
  plans: MapPlan[]
  current: string
  name: string
  onOpen: (mapKey: string | null) => void
}): React.JSX.Element {
  const i = plans.findIndex((p) => p.group.key === current)
  const prev = i > 0 ? plans[i - 1] : null
  const next = i >= 0 && i < plans.length - 1 ? plans[i + 1] : null
  return (
    <nav className="todo-nav" aria-label="Maps">
      <button className="button small" onClick={() => onOpen(null)}>
        ◀ All maps
      </button>
      <span className="todo-nav-where">
        <strong>{name}</strong>
        {i >= 0 && (
          <span className="muted">
            {' '}
            · {i + 1} of {plans.length}
          </span>
        )}
      </span>
      <button
        className="button small"
        disabled={!prev}
        title={prev ? `Open ${prev.group.name}` : undefined}
        onClick={() => prev && onOpen(prev.group.key)}
      >
        ◀ {prev?.group.name ?? 'Previous'}
      </button>
      <button
        className="button small"
        disabled={!next}
        title={next ? `Open ${next.group.name}` : undefined}
        onClick={() => next && onOpen(next.group.key)}
      >
        {next?.group.name ?? 'Next'} ▶
      </button>
    </nav>
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
            Nothing active there (that the filters show), but quests you could pick up have objectives there
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
              Show on map
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
  const {
    questState,
    rows,
    objectives,
    detected,
    mapsById,
    ctx: questCtx,
    questsById
  } = useQuestRows(settings)
  const questProgress = useStore((s) => s.questProgress[settings.gameMode])
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const updateSettings = useStore((s) => s.updateSettings)
  const selectQuest = useStore((s) => s.selectQuest)
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(settings, priceState)
  const inventory = useStore((s) => s.keys[settings.gameMode]) ?? EMPTY_KEYS
  const { info, groups } = useKeyInfo(settings, priceState)
  const dataset = questState?.dataset ?? null
  const t = settings.todo
  const setTodo = (patch: Partial<TodoSettings>): void => void updateSettings({ todo: { ...t, ...patch } })
  const [detail, setDetail] = useState<string | null>(null)
  const todoMap = useStore((s) => s.todoMap)
  const openTodoMap = useStore((s) => s.openTodoMap)
  const owned = useMemo(() => new Set(inventory.owned), [inventory.owned])
  const keyName = (keyId: string): string => info(keyId).name

  const plan = useMemo(
    () =>
      todoPlan(rows, objectives, (id) => groups.get(id), {
        have: progress.have,
        owned,
        hideBlocked: t.show === 'doable',
        kinds: t.kinds
      }),
    [rows, objectives, groups, progress.have, owned, t.show, t.kinds]
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
  const raidSteps = new Set(ranked.flatMap((p) => p.steps.map((s) => `${s.quest.id}:${s.objective.id}`))).size
  // The maps each quest has objectives on (as shown), for "also on".
  const questMaps = new Map<Quest, string[]>()
  for (const p of ranked)
    for (const q of p.quests) questMaps.set(q, [...(questMaps.get(q) ?? []), p.group.name])
  const detailRow = detail ? (rows.find((r) => r.quest.id === detail) ?? null) : null
  const beforeCount = plan.turnIn.length + plan.handOvers.length + buildable.length
  // The map opened from the overview (it stays open when the filters leave nothing there, saying so).
  const openedName =
    t.layout === 'maps' && todoMap
      ? ([...groups.values()].find((g) => g.key === todoMap)?.name ?? null)
      : null
  const openedRank = ranked.findIndex((p) => p.group.key === todoMap)
  const mapCard = (p: MapPlan, rank: number, wide = false): React.JSX.Element => (
    <MapCard
      key={p.group.key}
      plan={p}
      rank={rank}
      best={rank === 1}
      items={items}
      traderOf={traderOf}
      mapsById={mapsById}
      objectives={objectives}
      detected={detected}
      owned={owned}
      keyName={keyName}
      view={t.view}
      questMaps={questMaps}
      onDetails={setDetail}
      onOpenQuest={openQuest}
      onOpenMap={openMap}
      wide={wide}
    />
  )
  const segmented = <T extends string>(
    label: string,
    value: T,
    options: readonly (readonly [T, string, string])[],
    onPick: (id: T) => void
  ): React.JSX.Element => (
    <div className="segmented small" role="radiogroup" aria-label={label}>
      {options.map(([id, text, title]) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          className={value === id ? 'active' : ''}
          title={title}
          onClick={() => onPick(id)}
        >
          {text}
        </button>
      ))}
    </div>
  )

  return (
    <div className={`todo ${detailRow && dataset ? 'with-detail' : ''}`}>
      <Sidebar view="todo">
        <SidebarSection title="Before you raid">
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
        </SidebarSection>
        <SidebarSection title="Keys to get">
          {keysCount === 0 ? (
            <p className="hint">None: you have a key for every lock your active quests need opened.</p>
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
          <p className="hint">
            Objectives behind a lock none of your keys open (tick yours in the Keys tab), or on a map you
            can&rsquo;t get onto, are marked; <strong>Only quests I can do</strong> leaves them out.
          </p>
        </SidebarSection>
        <SidebarSection title="On any map">
          {plan.anyMap.length === 0 ? (
            <p className="hint">None of your active quests has anything to do that isn&rsquo;t on a map.</p>
          ) : (
            <ul className="todo-anywhere">
              {plan.anyMap.map((s) => (
                <li key={`${s.quest.id}:${s.objective.id}`}>
                  <QuestLink quest={s.quest} trader={traderOf(s.quest)} onOpen={setDetail} />
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
        </SidebarSection>
        <SidebarSection title="How maps are ranked">
          <p className="hint">
            By how many of your active quests a raid there moves on (of the ones the filters show). A quest
            with nothing left to do in raid anywhere else counts twice: finishing it opens up the next ones.
            Quests you haven&rsquo;t picked up yet are listed, but don&rsquo;t count.
          </p>
          <p className="hint">
            Tick objectives off here or in the Quests tab as you do them: the game&rsquo;s logs only say when
            a quest starts and finishes.
          </p>
        </SidebarSection>
      </Sidebar>
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
                  : `${plural(plan.active, 'active quest')} · ${plural(raidSteps, t.kinds === 'kill' ? 'kill objective' : t.kinds === 'locate' ? 'locate objective' : 'objective')} left in raid on ${plural(ranked.length, 'map')}` +
                    (plan.anyMap.length ? ` · ${plan.anyMap.length} on any map` : '') +
                    (plan.hidden
                      ? ` · ${plural(plan.hidden, 'quest')} with objectives hidden behind keys you don’t have`
                      : '') +
                    (plan.keysToGet.length
                      ? ` · ${plural(plan.keysToGet.length, 'key')} to get` +
                        (addedKeys.length ? ` (+${addedKeys.length} you added)` : '')
                      : addedKeys.length
                        ? ` · ${plural(addedKeys.length, 'key')} you added to get`
                        : '') +
                    (beforeCount ? ` · ${beforeCount} to do before you raid` : '')}
            </span>
          </div>
          <div className="summary-stats todo-filters">
            {segmented(
              'How to show maps',
              t.layout,
              [
                ['maps', 'Overview', 'A tile for each map: click one for its quests'],
                ['list', 'List', 'Every map with its quests, best first']
              ] as const,
              (layout) => {
                // Overview also goes back from an opened map.
                openTodoMap(null)
                setTodo({ layout })
              }
            )}
            {segmented(
              'Which quests',
              t.show,
              [
                ['all', 'Show all', 'Every objective, with the ones behind keys you don’t have marked'],
                [
                  'doable',
                  'Only quests I can do',
                  'Leave out objectives behind keys you don’t have, and maps you can’t get onto'
                ]
              ] as const,
              (show) => setTodo({ show })
            )}
            {segmented(
              'Which objectives',
              t.kinds,
              [
                ['all', 'Both', 'Kill and locate objectives'],
                ['kill', 'Kill', 'Only objectives to eliminate enemies'],
                ['locate', 'Locate', 'Only objectives to go to, mark, find, stash or extract']
              ] as const,
              (kinds) => setTodo({ kinds })
            )}
            {/* The overview's tiles don't list quests: this is for a map opened from it, or the list. */}
            {(t.layout === 'list' || openedName) &&
              segmented(
                'How to show quests',
                t.view,
                [
                  ['summary', 'Summary', 'Each quest in a few lines'],
                  ['full', 'Full', 'Every objective, to tick off as you go']
                ] as const,
                (view) => setTodo({ view })
              )}
          </div>
        </div>
        {openedName && todoMap ? (
          <div key={`map:${todoMap}`} className="todo-maps">
            <MapNav plans={ranked} current={todoMap} name={openedName} onOpen={openTodoMap} />
            {openedRank >= 0 ? (
              mapCard(ranked[openedRank], openedRank + 1, true)
            ) : (
              <div className="empty todo-nothing">
                <p>Nothing left to do on {openedName} that the filters show.</p>
                <p className="hint">
                  {plan.hidden
                    ? 'Show all lists objectives behind keys you don’t have too.'
                    : 'Other filters, or quests you pick up, may have some.'}
                </p>
              </div>
            )}
          </div>
        ) : dataset && ranked.length === 0 ? (
          <div className="empty">
            <p>
              {plan.active === 0
                ? 'Start some quests and this says which map to raid next.'
                : plan.hidden
                  ? 'Everything your active quests have left on a map (that the filters show) is behind a key you don’t have.'
                  : t.kinds !== 'all'
                    ? `None of your active quests has ${t.kinds} objectives left on a particular map.`
                    : 'None of your active quests has anything left to do on a particular map.'}
            </p>
            {plan.hidden ? (
              <p className="hint">
                The keys are listed under Keys to get; Show all lists those objectives too.
              </p>
            ) : (
              plan.maps.length > 0 && (
                <p className="hint">
                  Quests you could pick up have objectives on {plan.maps.map((p) => p.group.name).join(', ')}.
                </p>
              )
            )}
          </div>
        ) : t.layout === 'maps' ? (
          <div key="tiles" className="todo-maps tiles">
            {ranked.map((p, i) => (
              <MapTile
                key={p.group.key}
                plan={p}
                rank={i + 1}
                best={i === 0}
                owned={owned}
                keyName={keyName}
                traderOf={traderOf}
                onOpen={openTodoMap}
              />
            ))}
            {others.length > 0 && (
              <OtherMaps plans={others} keyName={keyName} onOpenQuest={openQuest} onOpenMap={openMap} />
            )}
          </div>
        ) : (
          <div key="list" className="todo-maps">
            {ranked.map((p, i) => mapCard(p, i + 1))}
            {others.length > 0 && (
              <OtherMaps plans={others} keyName={keyName} onOpenQuest={openQuest} onOpenMap={openMap} />
            )}
          </div>
        )}
      </main>
      {detailRow && dataset && (
        <QuestDetail
          row={detailRow}
          progress={questProgress ?? {}}
          objectives={objectives}
          detected={detected}
          ctx={questCtx}
          questsById={questsById}
          mapsById={mapsById}
          traders={dataset.traders}
          priceState={priceState}
          onOpenInQuests={() => openQuest(detailRow.quest.id)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
