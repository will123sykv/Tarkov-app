import type { BringItem } from '../../../shared/todo'
import type { MapGun } from '../../../shared/weapons'
import type { useItemLookup } from '../lib/useItemLookup'

// What to take into a raid, as chips: the To do tab's Bring and the map's reminder.

type Items = ReturnType<typeof useItemLookup>

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** A map's gun chosen in the Weapons tab (since 1.54.0), and the quests it's for. */
export function MapGunChip({ gun, items }: { gun: MapGun; items: Items }): React.JSX.Element {
  const item = items.get(gun.itemId)
  const quests = [...new Set(gun.covers.map((k) => k.quest.name))].join(', ')
  return (
    <span className="item-chip weapon starred" title={`The gun chosen for this map, for ${quests}`}>
      {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}
      <span>
        ★ {item?.name ?? 'Unknown weapon'} <span className="muted">(for {quests})</span>
      </span>
    </span>
  )
}

/** An item to use up in raid: how many, the first that will do, and how many others would. */
export function BringChip({
  item,
  items,
  have
}: {
  item: BringItem
  items: Items
  /** How many of it are put aside in Items to collect (shown when known). */
  have?: number
}): React.JSX.Element {
  const names = item.itemIds.map((id) => items.get(id)?.name ?? 'Unknown item')
  const first = items.get(item.itemIds[0])
  const others = item.itemIds.length - 1
  const title = [
    others ? `Any of ${names.join(', ')}` : names[0],
    item.anyMap ? '(for an objective on any map)' : '',
    have !== undefined ? `· you've put aside ${have}` : ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className="item-chip" title={title}>
      {first?.iconLink && <img src={first.iconLink} alt="" loading="lazy" />}
      <span>
        {item.count > 1 ? `${item.count} × ` : ''}
        {names[0]}
        {others > 0 && <span className="muted"> or {plural(others, 'other')}</span>}
        {item.anyMap && <span className="muted"> (any map)</span>}
        {have !== undefined && (
          <span className={have >= item.count ? 'todo-key-have' : 'muted'}> · have {have}</span>
        )}
      </span>
    </span>
  )
}
