import { useMemo, useState } from 'react'
import { EMPTY_KEYS, keysNeeded, opens, type KeyNeed } from '../../../shared/keys'
import { lockReasons, type QuestStatus } from '../../../shared/questProgress'
import type { KeysSettings, PriceState, PublicSettings } from '../../../shared/types'
import { formatRub } from '../lib/format'
import { STATUS_BADGE, STATUS_LABEL } from '../lib/questUi'
import { useKeyInfo, type KeyInfo } from '../lib/useKeyInfo'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'

// The Keys tab: the keys the player has (ticked by hand), the ones their quests still need, and how to
// get each: buy it, a quest that hands it out, or where it spawns.

const SCOPE_STATUSES: Record<KeysSettings['scope'], QuestStatus[]> = {
  active: ['active'],
  available: ['active', 'available'],
  all: ['active', 'available', 'locked']
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** How to get a key: buy it now (or what's in the way), a quest's reward, and where it spawns. */
function HowToGet({ info, onOpenQuest }: { info: KeyInfo; onOpenQuest: (id: string) => void }) {
  const best = info.buy?.options[0]
  return (
    <div className="key-get">
      {best ? (
        <span title={info.buy!.options.map((o) => `${o.label}: ${formatRub(o.price)}`).join('\n')}>
          Buy <strong>{formatRub(best.price)}</strong> <span className="muted">{best.label}</span>
        </span>
      ) : info.buy?.locked.length ? (
        <span className="key-locked" title={`Opens up with: ${info.buy.locked.join(', ')}`}>
          Can&rsquo;t buy yet: {info.buy.locked[0]}
        </span>
      ) : (
        <span className="muted">Not sold</span>
      )}
      {info.rewards.map((r) => (
        <span key={r.quest.id}>
          {r.onStart ? 'Given with ' : 'Reward from '}
          <button className="link" title="Open in the Quests tab" onClick={() => onOpenQuest(r.quest.id)}>
            {r.quest.name}
          </button>
          {r.status === 'completed' && <span className="muted"> (done)</span>}
        </span>
      ))}
      {info.spawns.length > 0 && (
        <span className="muted">
          Spawns on{' '}
          {info.spawns
            .map(
              (s) => `${s.group.name} (${plural(s.spots, 'spot')}${s.keySpot ? ', one just for keys' : ''})`
            )
            .join(', ')}
        </span>
      )}
      {info.access.length > 0 && (
        <span className="muted">Gets you onto {info.access.map((g) => g.name).join(', ')}</span>
      )}
    </div>
  )
}

/** One lock's key(s): owned or not, the quests behind it, how to get it, and buttons. */
function KeyRow({
  keyIds,
  uses,
  info,
  owned,
  toDo,
  lockReason,
  onOpenQuest
}: {
  keyIds: string[]
  uses: KeyNeed['uses']
  info: (keyId: string) => KeyInfo
  owned: ReadonlySet<string>
  toDo: ReadonlySet<string>
  lockReason: (questId: string) => string | null
  onOpenQuest: (id: string) => void
}): React.JSX.Element {
  const setKey = useStore((s) => s.setKey)
  const showKeyOnMap = useStore((s) => s.showKeyOnMap)
  const keys = keyIds.map(info)
  const have = opens(keyIds, owned)
  // On the map: where its lock is, else where it spawns, else where the quest needs it.
  const first = keys[0]
  const mapKey =
    first.locks.find((l) => l.group.mapKey)?.group.mapKey ??
    first.spawns.find((s) => s.group.mapKey)?.group.mapKey ??
    null
  const wanted = keyIds.some((id) => toDo.has(id))
  return (
    <tr className={have ? 'done' : ''}>
      <td className="key-have">
        {keys.map((k) => (
          <label key={k.id} className="check" title={owned.has(k.id) ? 'You have it' : 'Tick if you have it'}>
            <input
              type="checkbox"
              checked={owned.has(k.id)}
              onChange={(e) => void setKey(k.id, 'owned', e.target.checked)}
            />
          </label>
        ))}
      </td>
      <td className="item-cell">
        {first.item?.iconLink && <img src={first.item.iconLink} alt="" loading="lazy" />}
        <span>
          {keys.map((k, i) => (
            <span key={k.id}>
              {i > 0 && <span className="muted"> or </span>}
              {k.name}
            </span>
          ))}
          {first.locks.length > 0 && (
            <span className="muted key-opens">
              Opens {first.locks.map((l) => `${plural(l.count, 'lock')} on ${l.group.name}`).join(', ')}
            </span>
          )}
        </span>
      </td>
      <td className="uses">
        {uses.map((u) => {
          const why = u.status === 'locked' ? lockReason(u.quest.id) : null
          return (
            <span key={u.quest.id} className="key-use">
              <button className="link" title="Open in the Quests tab" onClick={() => onOpenQuest(u.quest.id)}>
                {u.quest.name}
              </button>{' '}
              <span className={`badge ${STATUS_BADGE[u.status]}`} title={why ?? undefined}>
                {why ?? STATUS_LABEL[u.status]}
              </span>
            </span>
          )
        })}
        {!uses.length && <span className="muted">No quest needs it</span>}
      </td>
      <td>
        {keys.map((k) => (
          <HowToGet key={k.id} info={k} onOpenQuest={onOpenQuest} />
        ))}
      </td>
      <td className="key-actions">
        {mapKey && (
          <button
            className="button small"
            title="Open the map with this key's locks and the spots it can spawn at"
            onClick={() => void showKeyOnMap(first.id, mapKey)}
          >
            View map
          </button>
        )}
        {!have && (
          <button
            className={`button small ${wanted ? 'active' : ''}`}
            title={
              wanted
                ? 'Listed under Keys to get in the To do tab: click to take it off'
                : 'List it under Keys to get in the To do tab'
            }
            onClick={() => void setKey(first.id, 'toDo', !wanted)}
          >
            {wanted ? '✓ In To do' : 'Add to To do'}
          </button>
        )}
      </td>
    </tr>
  )
}

function KeyTable({
  title,
  rows,
  ...rest
}: {
  title: string
  rows: { keyIds: string[]; uses: KeyNeed['uses'] }[]
} & Omit<Parameters<typeof KeyRow>[0], 'keyIds' | 'uses'>): React.JSX.Element | null {
  if (!rows.length) return null
  return (
    <section className="key-section">
      <h3>
        {title} <span className="muted">{rows.length}</span>
      </h3>
      <table className="values-table key-table">
        <colgroup>
          <col className="key-col-have" />
          <col className="key-col-name" />
          <col className="key-col-for" />
          <col className="key-col-get" />
          <col className="key-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th title="Tick the keys you have">Have</th>
            <th>Key</th>
            <th>Needed for</th>
            <th>How to get it</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <KeyRow key={r.keyIds.join()} keyIds={r.keyIds} uses={r.uses} {...rest} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default function KeysView({
  settings,
  priceState
}: {
  settings: PublicSettings
  priceState: PriceState | null
}): React.JSX.Element {
  const { questState, rows, objectives, ctx, questsById } = useQuestRows(settings)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const inventory = useStore((s) => s.keys[settings.gameMode]) ?? EMPTY_KEYS
  const selectQuest = useStore((s) => s.selectQuest)
  const updateSettings = useStore((s) => s.updateSettings)
  const { info, keyIds } = useKeyInfo(settings, priceState)
  const [search, setSearch] = useState('')
  const k = settings.keys
  const set = (patch: Partial<KeysSettings>): void => void updateSettings({ keys: { ...k, ...patch } })

  const owned = useMemo(() => new Set(inventory.owned), [inventory.owned])
  const toDo = useMemo(() => new Set(inventory.toDo), [inventory.toDo])
  const needs = useMemo(
    () => keysNeeded(rows, objectives, new Set(SCOPE_STATUSES[k.scope])),
    [rows, objectives, k.scope]
  )
  const term = search.trim().toLowerCase()
  const matches = (ids: string[]): boolean =>
    !term || ids.some((id) => info(id).name.toLowerCase().includes(term))
  const missingAll = needs.filter((n) => !opens(n.keyIds, owned))
  const missing = missingAll.filter((n) => matches(n.keyIds))
  const neededHave = needs.filter((n) => opens(n.keyIds, owned) && matches(n.keyIds))
  const needed = new Set(needs.flatMap((n) => n.keyIds))
  const usesOf = new Map(needs.flatMap((n) => n.keyIds.map((id) => [id, n.uses])))
  // Keys the player has that no quest in scope needs, and (to tick) every other key.
  const otherOwned = inventory.owned.filter((id) => !needed.has(id) && matches([id]))
  const everyOther =
    k.list === 'all'
      ? [...keyIds]
          .filter((id) => !needed.has(id) && !owned.has(id) && matches([id]))
          .sort((a, b) => info(a).name.localeCompare(info(b).name))
      : []
  const buyable = missingAll.filter((n) => n.keyIds.some((id) => info(id).buy?.options.length)).length

  const lockReason = (questId: string): string | null => {
    const quest = questsById.get(questId)
    return quest ? (lockReasons(quest, progress ?? {}, ctx, questsById)[0] ?? null) : null
  }
  const openQuest = (questId: string): void => {
    selectQuest(questId)
    void updateSettings({ view: 'quests' })
  }
  const rowProps = { info, owned, toDo, lockReason, onOpenQuest: openQuest }
  const dataset = questState?.dataset ?? null

  return (
    <div className="keys">
      <aside className="sidebar">
        <section>
          <h2>Keys for</h2>
          <div className="mini-toggle wide" role="radiogroup" aria-label="Keys for">
            {(
              [
                ['active', 'Active quests'],
                ['available', '+ available'],
                ['all', 'Every quest left']
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                role="radio"
                aria-checked={k.scope === id}
                className={k.scope === id ? 'active' : ''}
                onClick={() => set({ scope: id })}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="hint">
            The keys come from the quests: each objective not yet done that has a lock to open, and
            tarkov.dev&rsquo;s list of each quest&rsquo;s keys. Quests you can&rsquo;t start yet say why (your
            level, a trader&rsquo;s loyalty or another quest).
          </p>
        </section>
        <section>
          <h2>Show</h2>
          <div className="mini-toggle wide" role="radiogroup" aria-label="Keys to show">
            {(
              [
                ['needed', 'Keys quests need'],
                ['all', 'Every key']
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                role="radio"
                aria-checked={k.list === id}
                className={k.list === id ? 'active' : ''}
                onClick={() => set({ list: id })}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="hint">
            Tick the keys you have (per game mode). <strong>Every key</strong> lists the rest too, to tick
            keys no quest needs.
          </p>
        </section>
        <section>
          <h2>In the To do tab</h2>
          <p className="hint">
            Objectives behind a lock you have no key for (or on a map you can&rsquo;t get onto, like the Lab
            without its keycard) don&rsquo;t count towards which map to raid, and the keys that would open
            them are listed under <strong>Keys to get</strong>, with any you add here.
          </p>
          <p className="hint">
            <strong>View map</strong> opens the Maps tab with the key&rsquo;s locks and the loose loot spots
            it can spawn at (tarkov.dev doesn&rsquo;t say how likely). Keys also spawn in containers, which
            aren&rsquo;t listed.
          </p>
        </section>
      </aside>
      <main className="content">
        <div className="summary">
          <div className="summary-title">
            <strong>Keys</strong>
            <span className="muted">
              {dataset
                ? `${plural(needs.length, 'key')} your quests need` +
                  (needs.length ? ` · ${needs.length - missingAll.length} you have` : '') +
                  (buyable ? ` · ${buyable} of the rest you can buy now` : '') +
                  ` · ${plural(inventory.owned.length, 'key')} ticked in all`
                : questState?.error
                  ? `Couldn't load quests: ${questState.error}`
                  : 'Loading quests…'}
            </span>
          </div>
          <div className="summary-stats">
            <input
              className="search"
              type="search"
              placeholder="Search keys"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="key-lists">
          <KeyTable title="Needed keys" rows={missing} {...rowProps} />
          <KeyTable title="Keys you have" rows={neededHave} {...rowProps} />
          <KeyTable
            title="Other keys you have"
            rows={otherOwned.map((id) => ({ keyIds: [id], uses: usesOf.get(id) ?? [] }))}
            {...rowProps}
          />
          {k.list === 'all' && (
            <KeyTable
              title="Every other key"
              rows={everyOther.map((id) => ({ keyIds: [id], uses: [] }))}
              {...rowProps}
            />
          )}
          {dataset && !missing.length && !neededHave.length && !otherOwned.length && k.list === 'needed' && (
            <div className="empty">
              <p>
                {term
                  ? 'No key matches the search.'
                  : 'None of these quests needs a key. Show every key to tick the ones you have.'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
