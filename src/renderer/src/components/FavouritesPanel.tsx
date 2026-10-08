import { useEffect } from 'react'
import type { FavouriteReason } from '../../../shared/favourites'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { formatChance } from '../../../shared/whereToFind'
import { useFavouriteNeeds, useFavourites, type FindInfo } from '../lib/useFavourites'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
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
  priceState,
  findInfo,
  highlighted,
  colors,
  onHighlight,
  onOpenMap
}: {
  settings: PublicSettings
  priceState: PriceState | null
  /** Where an item can be found on the map shown (null: no map yet). */
  findInfo: (itemId: string) => FindInfo | null
  /** Items shown on the map as circles, and each one's colour. */
  highlighted: readonly string[]
  colors: ReadonlyMap<string, string>
  onHighlight: (itemIds: string[]) => void
  onOpenMap: (mapKey: string) => void
}): React.JSX.Element {
  const needs = useFavouriteNeeds(settings, priceState)
  const favourites = useFavourites(settings)
  const loaded = useStore((s) => s.favourites[settings.gameMode] !== undefined)
  const { questState } = useQuestRows(settings)
  const items = useItemLookup(priceState)
  const updateSettings = useStore((s) => s.updateSettings)
  const setFavourite = useStore((s) => s.setFavourite)
  const open = settings.maps.favouritesOpen
  const starred = favourites.items.length + favourites.upgrades.length + favourites.quests.length
  const toggle = (): void => void updateSettings({ maps: { ...settings.maps, favouritesOpen: !open } })
  const toggleItem = (itemId: string): void =>
    onHighlight(
      highlighted.includes(itemId) ? highlighted.filter((id) => id !== itemId) : [...highlighted, itemId]
    )
  // Items no longer needed (found, or their star taken off) leave the map too, once everything's loaded.
  const ready = loaded && Boolean(questState?.dataset) && Boolean(priceState?.dataset)
  const kept = highlighted.filter((id) => needs.some((n) => n.itemId === id))
  const stale = ready && kept.length < highlighted.length
  useEffect(() => {
    if (stale) onHighlight(kept)
  }, [stale, kept, onHighlight])

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
          <>
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
                      {need.reason !== 'questItem' && (
                        <Where
                          info={findInfo(need.itemId)}
                          color={colors.get(need.itemId) ?? null}
                          onToggle={() => toggleItem(need.itemId)}
                          onOpenMap={onOpenMap}
                        />
                      )}
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
          </>
        ))}
    </aside>
  )
}

/** Where an item can be found on this map, a toggle to show it there, and a better map if there is one. */
function Where({
  info,
  color,
  onToggle,
  onOpenMap
}: {
  info: FindInfo | null
  /** Its circle's colour when it's shown on the map. */
  color: string | null
  onToggle: () => void
  onOpenMap: (mapKey: string) => void
}): React.JSX.Element | null {
  if (!info) return null
  const { here, better } = info
  const top = here.containers.slice(0, 2)
  const anywhere = here.loose.length > 0 || here.containers.some((c) => c.spots.length > 0)
  const parts = [
    here.loose.length ? `${here.loose.length} loose spot${here.loose.length === 1 ? '' : 's'}` : null,
    top.length ? top.map((c) => `${c.name} ${formatChance(c.chance)}`).join(', ') : null
  ].filter(Boolean)
  return (
    <div className="favourites-where muted">
      <span
        title={
          here.containers.length
            ? `Chance one search turns one up: ${here.containers
                .slice(0, 6)
                .map((c) => `${c.name} ${formatChance(c.chance)}`)
                .join(', ')}`
            : undefined
        }
      >
        {parts.length ? `Here: ${parts.join(' · ')}` : 'Not loose or in containers here'}
      </span>
      {(anywhere || color) && (
        <button
          className="link find-toggle"
          aria-pressed={color !== null}
          title={
            color
              ? 'Shown as a circle where it turns up most on this map. Click to take it off'
              : 'Show a circle where it turns up most on this map'
          }
          onClick={onToggle}
        >
          {color && <span className="find-swatch" style={{ background: color }} aria-hidden />}
          {color ? 'Hide' : 'Show'}
        </button>
      )}
      {better && (
        <button
          className="link"
          title={`More chances to find it on ${better.name}`}
          onClick={() => onOpenMap(better.key)}
        >
          Better on {better.name}
        </button>
      )}
    </div>
  )
}
