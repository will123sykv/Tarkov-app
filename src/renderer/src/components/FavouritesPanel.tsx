import type { FavouriteReason } from '../../../shared/favourites'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { useFavouriteNeeds, useFavourites } from '../lib/useFavourites'
import { useItemLookup } from '../lib/useItemLookup'
import { useStore } from '../store'

const REASON: Record<FavouriteReason, { text: string; className: string; title: string }> = {
  cantGet: {
    text: 'can’t get yet',
    className: 'tag cant-get',
    title: 'You can’t buy, trade for or craft it now: find it in raid'
  },
  fir: {
    text: 'found in raid',
    className: 'tag fir',
    title: 'These must be found in raid (bought or traded ones never are)'
  },
  questItem: { text: 'quest item', className: 'tag', title: 'Picked up in raid for the quest' }
}

/** What the starred items, upgrades and quests still need from raids, over the top right of the map. */
export default function FavouritesPanel({
  settings,
  priceState
}: {
  settings: PublicSettings
  priceState: PriceState | null
}): React.JSX.Element {
  const needs = useFavouriteNeeds(settings, priceState)
  const favourites = useFavourites(settings)
  const items = useItemLookup(priceState)
  const updateSettings = useStore((s) => s.updateSettings)
  const setFavourite = useStore((s) => s.setFavourite)
  const open = settings.maps.favouritesOpen
  const starred = favourites.items.length + favourites.upgrades.length + favourites.quests.length
  const toggle = (): void => void updateSettings({ maps: { ...settings.maps, favouritesOpen: !open } })

  return (
    <aside className={`favourites-panel${open ? '' : ' closed'}`} aria-label="Favourites">
      <button
        className="favourites-head"
        aria-expanded={open}
        title={open ? 'Fold the favourites away' : 'Show what your favourites need from raids'}
        onClick={toggle}
      >
        <span className="favourites-star">★</span>
        <span>Favourites{needs.length > 0 ? ` (${needs.length})` : ''}</span>
        <span className="favourites-fold">{open ? '▾' : '▸'}</span>
      </button>
      {open &&
        (needs.length === 0 ? (
          <p className="hint favourites-empty">
            {starred === 0
              ? 'Star items in Items to collect, upgrades or quests to list what to look for in raid.'
              : 'Nothing to look for: what your favourites still need can all be bought, traded for or crafted now.'}
          </p>
        ) : (
          <ul className="favourites-list">
            {needs.map((need) => {
              const item = items.get(need.itemId)
              const reason = REASON[need.reason]
              return (
                <li key={need.itemId}>
                  {item?.iconLink ? (
                    <img src={item.iconLink} alt="" loading="lazy" />
                  ) : (
                    <span className="icon-gap" />
                  )}
                  <div>
                    <div className="favourites-name">
                      <span>{item?.name ?? need.name ?? 'Unknown item'}</span>
                      <strong>×{need.count}</strong>
                    </div>
                    <div className="favourites-for muted" title={`For ${need.for.join(', ')}`}>
                      <span className={reason.className} title={reason.title}>
                        {reason.text}
                      </span>{' '}
                      for {need.for.join(', ')}
                    </div>
                  </div>
                  {favourites.items.includes(need.itemId) && (
                    <button
                      className="favourite-star on"
                      title="Take this item off your favourites"
                      aria-label="Unfavourite this item"
                      onClick={() => void setFavourite('items', need.itemId, false)}
                    >
                      ★
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        ))}
    </aside>
  )
}
