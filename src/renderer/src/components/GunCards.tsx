import { useEffect, useRef, useState } from 'react'
import { gunKey, type KillGun } from '../../../shared/todo'
import type { Quest, QuestObjective } from '../../../shared/questTypes'
import type { GunPick } from '../../../shared/types'
import type { useItemLookup } from '../lib/useItemLookup'
import { useStore } from '../store'

// Guns for kill objectives that need particular weapons (since 1.53.0): a large picture of one for each
// kill, changed by clicking it (only to guns that count), and a star for the one to bring, which the
// map's reminder and the objectives show.

type Items = ReturnType<typeof useItemLookup>

const NO_GUNS: Record<string, GunPick> = {}

/** The guns picked for kill objectives, and how to pick one or star it. */
export function useGunPicks(): {
  guns: Readonly<Record<string, GunPick>>
  pick: (key: string, itemId: string) => void
  star: (key: string, itemId: string, on: boolean) => void
} {
  const todo = useStore((s) => s.settings?.todo)
  const updateSettings = useStore((s) => s.updateSettings)
  const guns = todo?.guns ?? NO_GUNS
  const save = (key: string, value: GunPick): void => {
    if (todo) void updateSettings({ todo: { ...todo, guns: { ...guns, [key]: value } } })
  }
  return {
    guns,
    // A starred kill keeps its star on the gun picked instead: the star is "the gun I'm bringing".
    pick: (key, itemId) => save(key, { itemId, favourite: guns[key]?.favourite ?? false }),
    star: (key, itemId, on) => save(key, { itemId, favourite: on })
  }
}

/** The gun starred for a kill objective, when it's one that counts. */
export function starredGun(
  guns: Readonly<Record<string, GunPick>>,
  quest: Quest,
  objective: QuestObjective
): string | null {
  const pick = guns[gunKey(quest.id, objective.id)]
  return pick?.favourite && objective.weapons?.includes(pick.itemId) ? pick.itemId : null
}

/**
 * A large picture of a gun (tarkov.dev's 512px one), its icon when that can't be had, or an empty frame
 * (offline, with neither cached), so cards keep their shape.
 */
export function GunPicture({ id, items }: { id: string; items: Items }): React.JSX.Element {
  // How many pictures have failed for this gun: the large one, then the icon.
  const [failed, setFailed] = useState<{ id: string; n: number }>({ id, n: 0 })
  const n = failed.id === id ? failed.n : 0
  const icon = items.get(id)?.iconLink ?? null
  const src = n === 0 ? `https://assets.tarkov.dev/${id}-512.webp` : n === 1 ? icon : null
  if (!src) return <span className="gun-picture empty" aria-hidden />
  return (
    <img
      className="gun-picture"
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed({ id, n: n + 1 })}
    />
  )
}

/** A card per kill objective: the gun shown, a picker of the ones that count, and a star to bring it. */
export function GunCards({ kills, items }: { kills: readonly KillGun[]; items: Items }): React.JSX.Element {
  const { pick, star } = useGunPicks()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="gun-cards">
      {kills.map((k) => (
        <GunCard
          key={k.key}
          kill={k}
          items={items}
          open={open === k.key}
          onToggle={() => setOpen(open === k.key ? null : k.key)}
          onPick={(itemId) => {
            pick(k.key, itemId)
            setOpen(null)
          }}
          onStar={() => star(k.key, k.shown, !k.favourite)}
        />
      ))}
    </div>
  )
}

function GunCard({
  kill,
  items,
  open,
  onToggle,
  onPick,
  onStar
}: {
  kill: KillGun
  items: Items
  open: boolean
  onToggle: () => void
  onPick: (itemId: string) => void
  onStar: () => void
}): React.JSX.Element {
  const name = (id: string): string => items.get(id)?.name ?? 'Unknown weapon'
  const others = kill.itemIds.length - 1
  const card = useRef<HTMLElement>(null)
  // Clicking elsewhere or Esc closes the picker.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!card.current?.contains(e.target as Node)) onToggle()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onToggle()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onToggle])
  return (
    <article ref={card} className={`gun-card ${kill.favourite ? 'starred' : ''}`}>
      <button
        className="gun-card-pick"
        disabled={!others}
        aria-expanded={others ? open : undefined}
        title={others ? `Change the gun: any of ${kill.itemIds.length} count` : 'The only gun that counts'}
        onClick={onToggle}
      >
        <GunPicture id={kill.shown} items={items} />
        <span className="gun-card-name">
          {name(kill.shown)}
          <span className="muted">
            {others ? ` · or ${others} other${others === 1 ? '' : 's'} ▾` : ' · the only gun that counts'}
          </span>
        </span>
      </button>
      <button
        className={`gun-star ${kill.favourite ? 'on' : ''}`}
        aria-pressed={kill.favourite}
        title={
          kill.favourite
            ? 'Starred: the gun you’re bringing for this quest (click to unstar)'
            : 'Star it: the gun you’re bringing for this quest, shown in the map’s reminder'
        }
        onClick={onStar}
      >
        {kill.favourite ? '★ Bringing' : '☆ Bring this one'}
      </button>
      <span className="gun-card-for">
        <strong>{kill.quest.name}</strong>
        <span className="muted">
          {kill.objective.description || 'Kills'}
          {(kill.objective.count ?? 1) > 1 && ` · ${kill.left} left`}
          {kill.anyMap && ' · any map'}
        </span>
      </span>
      {open && (
        <ul className="gun-picker" role="listbox" aria-label={`Guns for ${kill.quest.name}`}>
          {kill.itemIds.map((id) => (
            <li key={id}>
              <button role="option" aria-selected={id === kill.shown} onClick={() => onPick(id)}>
                {items.get(id)?.iconLink && <img src={items.get(id)!.iconLink!} alt="" loading="lazy" />}
                <span>{name(id)}</span>
                {id === kill.shown && <span className="muted">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

/**
 * After a kill objective's text: the gun starred for it ("★ Bringing M4A1"), or that none is yet. Nothing
 * for kills that don't need particular weapons.
 */
export function KillGunTag({
  quest,
  objective,
  items
}: {
  quest: Quest
  objective: QuestObjective
  items: Items
}): React.JSX.Element | null {
  const { guns } = useGunPicks()
  if (!objective.weapons?.length) return null
  const starred = starredGun(guns, quest, objective)
  if (!starred)
    return (
      <span
        className="tag gun-tag"
        title={`Any of ${objective.weapons.length} gun${objective.weapons.length === 1 ? '' : 's'} count: star the one you're bringing on the To do tab`}
      >
        No gun starred
      </span>
    )
  const item = items.get(starred)
  return (
    <span className="tag gun-tag starred" title="The gun you've starred to bring for this kill">
      {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}★ Bringing{' '}
      {item?.name ?? 'Unknown weapon'}
    </span>
  )
}
