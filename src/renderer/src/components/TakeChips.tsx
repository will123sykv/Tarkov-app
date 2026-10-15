import type { BringItem, WeaponsToBring } from '../../../shared/todo'
import type { useItemLookup } from '../lib/useItemLookup'

// What to take into a raid, as chips: the To do tab's Bring and the map's reminder.

type Items = ReturnType<typeof useItemLookup>

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** A weapon a kill needs: the first of the ones that will do, and how many others would. */
export function WeaponChoice({ weapon, items }: { weapon: WeaponsToBring; items: Items }): React.JSX.Element {
  const names = weapon.itemIds.map((id) => items.get(id)?.name ?? 'Unknown weapon')
  const first = items.get(weapon.itemIds[0])
  const others = weapon.itemIds.length - 1
  const title = [
    `For ${weapon.quests.map((q) => q.name).join(', ')}${weapon.anyMap ? ' (a kill on any map)' : ''}:`,
    others ? `any of ${names.join(', ')}` : names[0]
  ].join(' ')
  return (
    <span className="item-chip weapon" title={title}>
      {first?.iconLink && <img src={first.iconLink} alt="" loading="lazy" />}
      <span>
        {names[0]}
        {others > 0 && <span className="muted"> or {plural(others, 'other')}</span>}
        {weapon.anyMap && <span className="muted"> (any map)</span>}
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
