import { mdiKeyVariant } from '@mdi/js'
import { useEffect, useState } from 'react'
import {
  lockReasons,
  requirementLabels,
  type ProgressEntry,
  type QuestContext,
  type QuestProgress
} from '../../../shared/questProgress'
import type {
  GameMap,
  GuideImage,
  Quest,
  QuestObjective,
  QuestRewards,
  QuestTrader
} from '../../../shared/questTypes'
import type { PriceState } from '../../../shared/types'
import { formatAgo } from '../lib/format'
import { formatMoney, formatStanding, itemsNeeded, keysNeeded } from '../lib/questSummary'
import { configFor, objectiveMap, STATUS_BADGE, STATUS_LABEL } from '../lib/questUi'
import { useItemLookup } from '../lib/useItemLookup'
import { useNow } from '../lib/useNow'
import { useQuestGuide } from '../lib/useQuestGuide'
import { useStore } from '../store'
import type { QuestRow } from '../lib/useQuestRows'

interface Props {
  row: QuestRow
  progress: QuestProgress
  ctx: QuestContext
  questsById: ReadonlyMap<string, Quest>
  mapsById: ReadonlyMap<string, GameMap>
  traders: QuestTrader[]
  priceState: PriceState | null
  /** Shown on the maps view: a link to the quest in the quests view. */
  onOpenInQuests?: () => void
}

type Items = ReturnType<typeof useItemLookup>

const SET_STATUSES: { status: ProgressEntry['status'] | null; label: string }[] = [
  { status: null, label: 'Not started' },
  { status: 'active', label: 'Active' },
  { status: 'completed', label: 'Completed' },
  { status: 'failed', label: 'Failed' }
]

const KeyIcon = (): React.JSX.Element => (
  <svg className="key-icon" viewBox="0 0 24 24" aria-hidden>
    <path d={mdiKeyVariant} />
  </svg>
)

/** An item's icon and name, with a count or an amount of money. */
function ItemChip({ id, count, items }: { id: string; count?: number; items: Items }): React.JSX.Element {
  const item = items.get(id)
  const money = count !== undefined ? formatMoney(id, count) : null
  return (
    <span className="item-chip">
      {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}
      <span>
        {money ??
          `${count !== undefined && count > 1 ? `${count.toLocaleString('en-US')} × ` : ''}${item?.name ?? 'Unknown item'}`}
      </span>
    </span>
  )
}

/** Keys that open one lock: any one of them. */
function KeyChoice({ keyIds, items }: { keyIds: string[]; items: Items }): React.JSX.Element {
  return (
    <span className="key-choice">
      <KeyIcon />
      {keyIds.map((id, i) => (
        <span key={id}>
          {i > 0 && <span className="muted"> or </span>}
          <ItemChip id={id} items={items} />
        </span>
      ))}
    </span>
  )
}

function Objective({
  quest,
  objective,
  mapsById,
  items
}: {
  quest: Quest
  objective: QuestObjective
  mapsById: ReadonlyMap<string, GameMap>
  items: Items
}): React.JSX.Element {
  const showOnMap = useStore((s) => s.showOnMap)
  const onMap = objectiveMap(objective, mapsById)
  const mapNames = objective.maps.map((id) => mapsById.get(id)?.name).filter(Boolean)
  const single = objective.items.length === 1 ? objective.items[0] : undefined
  return (
    <li className="objective">
      <div>
        {objective.description || objective.type}
        {objective.optional && <span className="tag">optional</span>}
        {objective.foundInRaid && objective.items.length > 0 && (
          <span className="tag fir">found in raid</span>
        )}
      </div>
      {single && (
        <div className="objective-item">
          <ItemChip id={single} count={objective.count ?? 1} items={items} />
        </div>
      )}
      {objective.items.length > 1 && (
        <details>
          <summary>
            Any of {objective.items.length} items
            {objective.count && objective.count > 1 ? ` (${objective.count} needed)` : ''}
          </summary>
          <ul className="any-of">
            {objective.items.map((id) => (
              <li key={id}>{items.get(id)?.name ?? id}</li>
            ))}
          </ul>
        </details>
      )}
      {objective.questItem && <div className="objective-item">Quest item: {objective.questItem.name}</div>}
      {objective.requiredKeys.map((group) => (
        <div key={group.join()} className="objective-item">
          <KeyChoice keyIds={group} items={items} />
        </div>
      ))}
      <div className="objective-meta">
        {mapNames.length > 0 && <span className="muted">{mapNames.join(', ')}</span>}
        {onMap && (
          <button
            className="link"
            onClick={() =>
              // Alternate versions (e.g. Night Factory) open on their main map.
              void showOnMap(quest.id, objective.id, configFor(onMap)?.key ?? onMap.normalizedName)
            }
          >
            Show on map
          </button>
        )}
      </div>
    </li>
  )
}

/** Keys and items the quest takes. */
function Needs({
  quest,
  mapsById,
  items
}: {
  quest: Quest
  mapsById: ReadonlyMap<string, GameMap>
  items: Items
}): React.JSX.Element | null {
  const keys = keysNeeded(quest)
  const needs = itemsNeeded(quest.objectives)
  if (!keys.length && !needs.length) return null
  return (
    <section className="quest-section">
      <h4>Keys and items needed</h4>
      <ul className="reward-list">
        {keys.map((k) => (
          <li key={k.keyIds.join()}>
            <KeyChoice keyIds={k.keyIds} items={items} />
            {k.mapIds.length > 0 && (
              <span className="muted">
                {' '}
                ({k.mapIds.map((id) => mapsById.get(id)?.name ?? 'unknown map').join(', ')})
              </span>
            )}
          </li>
        ))}
        {needs.map((n) => (
          <li key={`${n.action}:${n.itemIds.join()}:${n.foundInRaid}`}>
            <span className="muted">{n.action} </span>
            {n.itemIds.length === 1 ? (
              <ItemChip id={n.itemIds[0]} count={n.count} items={items} />
            ) : (
              <span>
                {n.count} of any of {n.itemIds.length} items
              </span>
            )}
            {n.foundInRaid && <span className="tag fir">found in raid</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function rewardCount(r: QuestRewards): number {
  return (
    r.items.length +
    r.traderStanding.length +
    r.offerUnlocks.length +
    r.craftUnlocks.length +
    r.skills.length +
    r.traderUnlocks.length +
    r.other.length
  )
}

/** A quest's rewards (or what it hands over on accepting). */
function Rewards({
  title,
  rewards,
  experience,
  traders,
  items
}: {
  title: string
  rewards: QuestRewards
  experience: number
  traders: QuestTrader[]
  items: Items
}): React.JSX.Element | null {
  if (!rewardCount(rewards) && !experience) return null
  const trader = (id: string): QuestTrader | undefined => traders.find((t) => t.id === id)
  return (
    <section className="quest-section">
      <h4>{title}</h4>
      <ul className="reward-list">
        {experience > 0 && (
          <li>
            <strong>+{experience.toLocaleString('en-US')}</strong> <span className="muted">experience</span>
          </li>
        )}
        {rewards.traderStanding.map((s) => (
          <li key={s.traderId}>
            {trader(s.traderId)?.imageLink && (
              <img className="portrait small" src={trader(s.traderId)!.imageLink!} alt="" />
            )}
            <strong className={s.standing < 0 ? 'bad' : ''}>{formatStanding(s.standing)}</strong>{' '}
            <span className="muted">{trader(s.traderId)?.name ?? 'Unknown trader'} reputation</span>
          </li>
        ))}
        {rewards.items.map((i, n) => (
          <li key={`${i.itemId}:${n}`}>
            <ItemChip id={i.itemId} count={i.count} items={items} />
          </li>
        ))}
        {rewards.offerUnlocks.map((o) => (
          <li key={`${o.traderId}:${o.itemId}`}>
            <span className="muted">
              {trader(o.traderId)?.name ?? 'A trader'} sells, at loyalty level {o.level}:{' '}
            </span>
            <ItemChip id={o.itemId} items={items} />
          </li>
        ))}
        {rewards.craftUnlocks.map((c) => (
          <li key={`${c.station}:${c.itemId}`}>
            <span className="muted">
              Craft at {c.station} level {c.level}:{' '}
            </span>
            <ItemChip id={c.itemId} count={c.count} items={items} />
          </li>
        ))}
        {rewards.skills.map((s) => (
          <li key={s.name}>
            <strong>+{s.level}</strong> <span className="muted">{s.name} skill</span>
          </li>
        ))}
        {rewards.traderUnlocks.map((id) => (
          <li key={id}>
            <span className="muted">Unlocks </span>
            {trader(id)?.name ?? 'a trader'}
          </li>
        ))}
        {rewards.other.map((name, n) => (
          <li key={`${name}:${n}`}>{name}</li>
        ))}
      </ul>
    </section>
  )
}

/** The pictures, full size, one at a time. */
function Lightbox({
  images,
  index,
  onIndex,
  onClose
}: {
  images: GuideImage[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}): React.JSX.Element {
  const image = images[index]
  const step = (by: number): void => onIndex((index + by + images.length) % images.length)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onIndex((index + 1) % images.length)
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onIndex, onClose])
  return (
    <div className="lightbox" role="dialog" aria-label={image.caption || image.file} onClick={onClose}>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={image.full} alt={image.caption} />
        <figcaption>
          <span>{image.caption}</span>
          <span className="muted">
            {index + 1} of {images.length} ·{' '}
            <a href={image.page} target="_blank" rel="noreferrer">
              On the wiki ↗
            </a>
          </span>
        </figcaption>
      </figure>
      {images.length > 1 && (
        <>
          <button
            className="lightbox-nav prev"
            aria-label="Previous picture"
            onClick={(e) => {
              e.stopPropagation()
              step(-1)
            }}
          >
            ‹
          </button>
          <button
            className="lightbox-nav next"
            aria-label="Next picture"
            onClick={(e) => {
              e.stopPropagation()
              step(1)
            }}
          >
            ›
          </button>
        </>
      )}
      <button className="button icon lightbox-close" aria-label="Close picture" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}

/** What the wiki's guide says, and its pictures of where to go. */
function Guide({ wikiLink }: { wikiLink: string | null }): React.JSX.Element | null {
  const state = useQuestGuide(wikiLink)
  const [open, setOpen] = useState<{ link: string; index: number } | null>(null)
  if (!wikiLink) return null
  const guide = state?.guide
  const index = open?.link === wikiLink ? open.index : null
  return (
    <section className="quest-section guide">
      <h4>Guide</h4>
      {!state && <p className="hint">Loading the guide from the wiki…</p>}
      {state && !guide && <p className="hint">{state.error}</p>}
      {guide && (
        <>
          {guide.blocks.length === 0 && guide.images.length === 0 && (
            <p className="hint">The wiki has no guide for this quest yet.</p>
          )}
          <div className="guide-text">
            {guide.blocks.map((b, i) =>
              b.kind === 'h' ? (
                <h5 key={i}>{b.text}</h5>
              ) : b.kind === 'li' ? (
                <p key={i} className="guide-item">
                  {b.text}
                </p>
              ) : (
                <p key={i}>{b.text}</p>
              )
            )}
          </div>
          {guide.images.length > 0 && (
            <ul className="guide-gallery">
              {guide.images.map((image, i) => (
                <li key={image.file}>
                  <button onClick={() => setOpen({ link: wikiLink, index: i })} title="Enlarge">
                    <img src={image.thumb} alt={image.caption} loading="lazy" />
                  </button>
                  {image.caption && <span>{image.caption}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="hint credit">
            From the{' '}
            <a href={guide.url} target="_blank" rel="noreferrer">
              Escape from Tarkov Wiki
            </a>
            , CC BY-SA 3.0.
            {state?.error && ' Offline: showing the last copy.'}
          </p>
          {index !== null && guide.images[index] && (
            <Lightbox
              images={guide.images}
              index={index}
              onIndex={(i) => setOpen({ link: wikiLink, index: i })}
              onClose={() => setOpen(null)}
            />
          )}
        </>
      )}
    </section>
  )
}

/**
 * A quest's details: its trader, status (settable by hand), what unlocks it, its objectives, the keys
 * and items it needs, its rewards, and the wiki's guide with pictures.
 */
export default function QuestDetail({
  row,
  progress,
  ctx,
  questsById,
  mapsById,
  traders,
  priceState,
  onOpenInQuests
}: Props): React.JSX.Element {
  const { quest, status } = row
  const setQuestStatus = useStore((s) => s.setQuestStatus)
  const markQuestsUpTo = useStore((s) => s.markQuestsUpTo)
  const selectQuest = useStore((s) => s.selectQuest)
  const items = useItemLookup(priceState)
  const now = useNow(60_000)
  const entry = progress[quest.id]
  const reasons = status === 'locked' ? lockReasons(quest, progress, ctx, questsById) : []
  const unlocks = [...questsById.values()].filter((q) => q.requires.some((r) => r.questId === quest.id))
  const trader = traders.find((t) => t.id === quest.traderId)
  const requirements = requirementLabels(quest, questsById, ctx.traders)
  const questLink = (q: Quest | undefined, fallback: string): React.JSX.Element =>
    q ? (
      <button className="link" onClick={() => selectQuest(q.id)}>
        {q.name}
      </button>
    ) : (
      <span className="muted">{fallback}</span>
    )

  return (
    <aside className="quest-detail" aria-label={`${quest.name} details`}>
      <header>
        {trader?.imageLink && <img className="portrait" src={trader.imageLink} alt="" />}
        <div>
          <strong>{quest.name}</strong>
          <span className="muted">
            {[trader?.name ?? 'Unknown trader', ...requirements].join(' · ')}
            {quest.faction !== 'Any' && ` · ${quest.faction} only`}
            {quest.kappaRequired && ' · Kappa'}
            {quest.lightkeeperRequired && ' · Lightkeeper'}
          </span>
          {onOpenInQuests && (
            <button className="link small" onClick={onOpenInQuests}>
              Open in Quests
            </button>
          )}
        </div>
        <button className="button icon" onClick={() => selectQuest(null)} aria-label="Close details">
          ✕
        </button>
      </header>

      <div className="quest-status">
        <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
        <span className="muted">
          {entry
            ? `${entry.source === 'log' ? 'From the game’s logs' : 'Set by hand'}, ${formatAgo(entry.at, now)}`
            : 'Not started yet'}
        </span>
      </div>
      <div className="mini-toggle wide" role="radiogroup" aria-label="Set status">
        {SET_STATUSES.map(({ status: s, label }) => {
          const current = (entry?.status ?? null) === s
          return (
            <button
              key={label}
              role="radio"
              aria-checked={current}
              className={current ? 'active' : ''}
              onClick={() => void setQuestStatus(quest.id, s)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <button className="button small" onClick={() => void markQuestsUpTo(quest.id)}>
        Mark this and everything before it done
      </button>

      {reasons.length > 0 && (
        <ul className="lock-reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {quest.requires.length > 0 && (
        <p className="quest-links">
          <span className="muted">After: </span>
          {quest.requires.map((r, i) => (
            <span key={r.questId}>
              {i > 0 && ', '}
              {questLink(questsById.get(r.questId), 'an unknown quest')}
              {!r.status.includes('complete') && <span className="muted"> ({r.status.join(' or ')})</span>}
            </span>
          ))}
        </p>
      )}
      {unlocks.length > 0 && (
        <p className="quest-links">
          <span className="muted">Unlocks: </span>
          {unlocks.map((q, i) => (
            <span key={q.id}>
              {i > 0 && ', '}
              {questLink(q, q.name)}
            </span>
          ))}
        </p>
      )}

      <section className="quest-section">
        <h4>Objectives</h4>
        <ol className="objectives">
          {quest.objectives.map((o) => (
            <Objective key={o.id} quest={quest} objective={o} mapsById={mapsById} items={items} />
          ))}
        </ol>
      </section>
      <Needs quest={quest} mapsById={mapsById} items={items} />
      <Rewards
        title="Given when you accept"
        rewards={quest.startRewards}
        experience={0}
        traders={traders}
        items={items}
      />
      <Rewards
        title="Rewards"
        rewards={quest.rewards}
        experience={quest.experience}
        traders={traders}
        items={items}
      />
      <Guide key={quest.id} wikiLink={quest.wikiLink} />
      {quest.wikiLink && (
        <a className="wiki-link" href={quest.wikiLink} target="_blank" rel="noreferrer">
          Open on the wiki ↗
        </a>
      )}
    </aside>
  )
}
