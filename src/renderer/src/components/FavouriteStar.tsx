import type { FavouriteKind } from '../../../shared/favourites'
import { useStore } from '../store'

const WHAT: Record<FavouriteKind, string> = {
  items: 'this item',
  upgrades: 'this upgrade',
  quests: 'this quest'
}

/** A star that puts an item, an upgrade or a quest on the Maps tab's favourites list (or takes it off). */
export default function FavouriteStar({ kind, id }: { kind: FavouriteKind; id: string }): React.JSX.Element {
  const on =
    useStore((s) => (s.settings ? s.favourites[s.settings.gameMode]?.[kind].includes(id) : false)) ?? false
  const setFavourite = useStore((s) => s.setFavourite)
  const title = on
    ? 'Favourite: what it still needs is listed over the map. Click to take it off'
    : `Favourite ${WHAT[kind]}: list what it still needs from raids over the map`
  return (
    <button
      className={`favourite-star${on ? ' on' : ''}`}
      title={title}
      aria-label={on ? `Unfavourite ${WHAT[kind]}` : `Favourite ${WHAT[kind]}`}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation()
        void setFavourite(kind, id, !on)
      }}
    >
      {on ? '★' : '☆'}
    </button>
  )
}
