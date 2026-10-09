import { useMemo, useState } from 'react'
import { EMPTY_HIDEOUT } from '../../../shared/hideout'
import { EMPTY_KEYS, keysNeeded, opens, type KeyNeed } from '../../../shared/keys'
import { lockReasons, type QuestStatus } from '../../../shared/questProgress'
import type { KeysSettings, PriceState, PublicSettings } from '../../../shared/types'
import { formatRub } from '../lib/format'
import { STATUS_BADGE, STATUS_LABEL } from '../lib/questUi'
import { useItemLookup } from '../lib/useItemLookup'
import { keyMapsUsed, keyUsedOn } from '../lib/keyMaps'
import type { Group } from '../lib/mapGroups'
import { useKeyInfo, type KeyInfo } from '../lib/useKeyInfo'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import KeyShare from './KeyShare'
import ScavScan from './ScavScan'
import Sidebar, { SidebarSection } from './Sidebar'

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
  onOpenQuest,
  groups,
  friendsWith,
  pickedMapKey = null
}: {
  keyIds: string[]
  uses: KeyNeed['uses']
  info: (keyId: string) => KeyInfo
  /** Map groups by map id, for the maps it's used on. */
  groups: ReadonlyMap<string, Group>
  /** Friends (in this game mode) who have one of these keys. */
  friendsWith: (keyIds: string[]) => string[]
  owned: ReadonlySet<string>
  toDo: ReadonlySet<string>
  lockReason: (questId: string) => string | null
  onOpenQuest: (id: string) => void
  /** The map the list is filtered to (its Maps tab key), which Show on map opens. */
  pickedMapKey?: string | null
}): React.JSX.Element {
  const setKey = useStore((s) => s.setKey)
  const showKeyOnMap = useStore((s) => s.showKeyOnMap)
  const keys = keyIds.map(info)
  const have = opens(keyIds, owned)
  // On the map: the one the list is filtered to, else where its lock is, else where it spawns.
  const first = keys[0]
  const mapKey =
    pickedMapKey ??
    first.locks.find((l) => l.group.mapKey)?.group.mapKey ??
    first.spawns.find((s) => s.group.mapKey)?.group.mapKey ??
    null
  const wanted = keyIds.some((id) => toDo.has(id))
  const usedOn = keyMapsUsed(first, uses, groups)
  const friends = friendsWith(keyIds)
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
          {friends.length > 0 && (
            <span className="key-friends" title="From the key codes your friends shared">
              {friends.map((name) => (
                <span key={name} className="tag friend">
                  {name}
                </span>
              ))}{' '}
              {friends.length === 1 ? 'has it' : 'have it'}
            </span>
          )}
        </span>
      </td>
      <td className="key-maps">
        {usedOn.map((m) => (
          <span key={m.key}>
            {m.name}{' '}
            <span className="muted">
              ·{' '}
              {[m.locks ? plural(m.locks, 'lock') : null, m.access ? 'entry' : null, m.quest ? 'quest' : null]
                .filter(Boolean)
                .join(', ')}
            </span>
          </span>
        ))}
        {!usedOn.length && (
          <span className="muted" title="No lock, quest or way in uses it">
            —
          </span>
        )}
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
            Show on map
          </button>
        )}
        {!have && (
          <button
            className={`button small ${wanted ? 'active' : ''}`}
            title={
              wanted
                ? 'Listed under Keys to buy in the To do tab: click to take it off'
                : 'List it under Keys to buy in the To do tab'
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

/** A group of key lists ("Keys to buy", "Keys owned"), or a line saying why it's empty. */
function KeyGroup({
  title,
  empty,
  children
}: {
  title: string
  /** Shown when none of its lists has a key. */
  empty: string | null
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="key-group">
      <h3>{title}</h3>
      {empty ? <p className="hint key-group-empty">{empty}</p> : children}
    </section>
  )
}

function KeyTable({
  title,
  rows,
  open = true,
  onToggle,
  ...rest
}: {
  title: string
  rows: { keyIds: string[]; uses: KeyNeed['uses'] }[]
  /** Folded lists show just their heading and count; `onToggle` opens or folds them. */
  open?: boolean
  onToggle?: () => void
} & Omit<Parameters<typeof KeyRow>[0], 'keyIds' | 'uses'>): React.JSX.Element | null {
  if (!rows.length) return null
  const heading = (
    <>
      {title} <span className="muted">{rows.length}</span>
    </>
  )
  return (
    <section className="key-section">
      <h4>
        {onToggle ? (
          <button className="key-fold" aria-expanded={open} onClick={onToggle}>
            <span aria-hidden>{open ? '▾' : '▸'}</span> {heading}
          </button>
        ) : (
          heading
        )}
      </h4>
      {open && (
        <table className="values-table key-table">
          <colgroup>
            <col className="key-col-have" />
            <col className="key-col-name" />
            <col className="key-col-map" />
            <col className="key-col-for" />
            <col className="key-col-get" />
            <col className="key-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th title="Tick the keys you have">Have</th>
              <th>Key</th>
              <th title="Where it opens a lock, a quest needs it, or it gets you onto the map">Map</th>
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
      )}
    </section>
  )
}

/** Which quests the counts are for, as words before "quests". */
const SCOPE_WORDS: Record<KeysSettings['scope'], string> = {
  active: 'active ',
  available: 'active and available ',
  all: ''
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
  const { info, keyIds, groups } = useKeyInfo(settings, priceState)
  const items = useItemLookup(priceState)
  const hideout = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
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
  // The maps to filter by, one per map image (Night Factory with Factory).
  const mapChoices = useMemo(
    () =>
      [...new Map([...groups.values()].map((g) => [g.key, g])).values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [groups]
  )
  const picked = mapChoices.find((g) => g.key === k.map) ?? null
  const searched = (ids: string[]): boolean =>
    !term || ids.some((id) => info(id).name.toLowerCase().includes(term))
  const needed = new Set(needs.flatMap((n) => n.keyIds))
  const usesOf = new Map(needs.flatMap((n) => n.keyIds.map((id) => [id, n.uses])))
  // Keys used on the map picked: a lock there, a quest needing it there, or getting you onto it.
  const onMap = (ids: string[]): boolean =>
    ids.some((id) => keyUsedOn(info(id), usesOf.get(id) ?? [], groups, picked?.key ?? null))
  const matches = (ids: string[]): boolean => searched(ids) && onMap(ids)
  const inView = needs.filter((n) => onMap(n.keyIds))
  const missingAll = inView.filter((n) => !opens(n.keyIds, owned))
  const missing = missingAll.filter((n) => searched(n.keyIds))
  const neededHave = inView.filter((n) => opens(n.keyIds, owned) && searched(n.keyIds))
  // Keys the player has that no quest in scope needs, and every other key they don't have.
  const otherOwned = inventory.owned.filter((id) => !needed.has(id) && matches([id]))
  const otherToBuy = [...keyIds]
    .filter((id) => !needed.has(id) && !owned.has(id) && matches([id]))
    .sort((a, b) => info(a).name.localeCompare(info(b).name))
  const filtered = term
    ? 'No key matches the search.'
    : picked
      ? `No key here is used on ${picked.name}.`
      : null
  // Friends' keys (from their codes) in this game mode, to tag the keys they have.
  const friendKeys = useMemo(
    () =>
      k.friends
        .filter((f) => f.gameMode === settings.gameMode)
        .map((f) => ({ name: f.name, keys: new Set(f.keyIds) })),
    [k.friends, settings.gameMode]
  )
  const friendsWith = (ids: string[]): string[] =>
    friendKeys.filter((f) => ids.some((id) => f.keys.has(id))).map((f) => f.name)
  const friendsHave = friendKeys.length ? missingAll.filter((n) => friendsWith(n.keyIds).length).length : 0
  const buyable = missingAll.filter((n) => n.keyIds.some((id) => info(id).buy?.options.length)).length

  const lockReason = (questId: string): string | null => {
    const quest = questsById.get(questId)
    return quest ? (lockReasons(quest, progress ?? {}, ctx, questsById)[0] ?? null) : null
  }
  const openQuest = (questId: string): void => {
    selectQuest(questId)
    void updateSettings({ view: 'quests' })
  }
  const rowProps = {
    info,
    owned,
    toDo,
    lockReason,
    onOpenQuest: openQuest,
    groups,
    friendsWith,
    pickedMapKey: picked?.mapKey ?? null
  }
  const dataset = questState?.dataset ?? null

  return (
    <div className="keys">
      <Sidebar view="keys">
        <SidebarSection title="Keys for">
          <div className="mini-toggle wide" role="radiogroup" aria-label="Keys for">
            {(
              [
                ['active', 'Active'],
                ['available', 'Active + available'],
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
          <p className="hint">
            Tick the keys you own (per game mode), or read them from screenshots with{' '}
            <strong>Read from screenshots</strong>. Keys no quest needs are under <strong>Other</strong>.
          </p>
        </SidebarSection>
        <SidebarSection title="Map">
          <select
            value={picked?.key ?? ''}
            onChange={(e) => set({ map: e.target.value || null })}
            aria-label="Only keys used on this map"
          >
            <option value="">Every map</option>
            {mapChoices.map((g) => (
              <option key={g.key} value={g.key}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="hint">
            Only the keys used on a map: a lock there, a quest that needs it there, or getting you onto it
            (the Lab&rsquo;s keycard). Where a key spawns doesn&rsquo;t count.
          </p>
        </SidebarSection>
        <SidebarSection title="Share keys">
          <KeyShare keys={k} gameMode={settings.gameMode} owned={inventory.owned} onChange={set} />
        </SidebarSection>
        <SidebarSection title="In the To do tab">
          <p className="hint">
            Objectives behind a lock you have no key for (or on a map you can&rsquo;t get onto) don&rsquo;t
            count towards which map to raid. The keys for them are under <strong>Keys to buy</strong>, with
            any you add here.
          </p>
          <p className="hint">
            <strong>Show on map</strong> shows the key&rsquo;s locks and the loose loot spots it can spawn at.
            Keys also spawn in containers, which aren&rsquo;t listed.
          </p>
        </SidebarSection>
      </Sidebar>
      <main className="content">
        <div className="summary">
          <div className="summary-title">
            <strong>Keys</strong>
            <span className="muted">
              {dataset
                ? `${plural(inView.length, 'key')} your ${SCOPE_WORDS[k.scope]}quests need` +
                  (picked ? ` on ${picked.name}` : '') +
                  (inView.length
                    ? ` · ${inView.length - missingAll.length} owned · ${missingAll.length} to buy`
                    : '') +
                  (buyable ? ` (${buyable} you can buy now)` : '') +
                  (friendsHave ? ` · ${friendsHave} of those a friend has` : '') +
                  // Keys no quest here needs are ticked too.
                  (!picked && inventory.owned.length > needs.length - missingAll.length
                    ? ` · ${plural(inventory.owned.length, 'key')} ticked in all`
                    : '')
                : questState?.error
                  ? `Couldn't load quests: ${questState.error}`
                  : 'Loading quests…'}
            </span>
          </div>
          <div className="summary-stats">
            <div className="segmented small" role="tablist">
              <button
                role="tab"
                aria-selected={k.tab === 'list'}
                className={k.tab === 'list' ? 'active' : ''}
                onClick={() => set({ tab: 'list' })}
              >
                Keys
              </button>
              <button
                role="tab"
                aria-selected={k.tab === 'scan'}
                className={k.tab === 'scan' ? 'active' : ''}
                title="Tick the keys you have from screenshots of your key tool, cases and stash"
                onClick={() => set({ tab: 'scan' })}
              >
                Read from screenshots
              </button>
            </div>
            {k.tab === 'list' && (
              <input
                className="search"
                type="search"
                placeholder="Search keys"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </div>
        </div>
        {k.tab === 'scan' ? (
          <ScavScan
            settings={settings}
            priceState={priceState}
            items={items}
            progress={hideout}
            allNeeds={[]}
            variant="keys"
          />
        ) : (
          <div className="key-lists">
            {dataset && (
              <>
                <KeyGroup
                  title="Keys to buy"
                  empty={!missing.length && !otherToBuy.length ? (filtered ?? 'You own every key.') : null}
                >
                  <KeyTable title="For quests" rows={missing} {...rowProps} />
                  <KeyTable
                    title="Other"
                    rows={otherToBuy.map((id) => ({ keyIds: [id], uses: [] }))}
                    open={k.otherOpen}
                    onToggle={() => set({ otherOpen: !k.otherOpen })}
                    {...rowProps}
                  />
                </KeyGroup>
                <KeyGroup
                  title="Keys owned"
                  empty={
                    !neededHave.length && !otherOwned.length
                      ? (filtered ??
                        'You own no keys yet: tick them under Keys to buy, or read them from screenshots.')
                      : null
                  }
                >
                  <KeyTable title="For quests" rows={neededHave} {...rowProps} />
                  <KeyTable
                    title="Other"
                    rows={otherOwned.map((id) => ({ keyIds: [id], uses: usesOf.get(id) ?? [] }))}
                    {...rowProps}
                  />
                </KeyGroup>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
