import { squadShared } from '../../../shared/squad'
import { shortObjective, type KillToDo } from '../../../shared/todo'
import { gunFor, killForGun } from '../../../shared/weapons'
import type { useItemLookup } from '../lib/useItemLookup'
import SquadIcon from './SquadIcon'

/**
 * The kill objectives left on the map shown, and the ones that count on any map, in a strip over the top
 * of the map: most have no place to pin, so they'd be out of sight otherwise. Nothing when there are none.
 */
export default function KillBanner({
  kills,
  mapNames,
  open,
  onToggle,
  onSelectQuest,
  guns,
  items
}: {
  kills: readonly KillToDo[]
  /** The names of the map shown, taken off the objectives' text ("…on Woods"). */
  mapNames: readonly string[]
  open: boolean
  onToggle: () => void
  onSelectQuest: (questId: string) => void
  /**
   * The guns chosen for this map in the Weapons tab (up to two since 1.62.0): the kills they complete are
   * highlighted (since 1.57.0).
   */
  guns?: readonly string[] | null
  items?: ReturnType<typeof useItemLookup>
}): React.JSX.Element | null {
  if (!kills.length) return null
  const gunName = (id: string): string => items?.get(id)?.name ?? 'Unknown weapon'
  // The kills the guns complete first, among this map's and among any map's, in their order otherwise.
  const rank = (k: KillToDo): number => (killForGun(k.objective, guns) === 'gun' ? 0 : 1)
  const shown = [
    ...kills.filter((k) => !k.anyMap).sort((a, b) => rank(a) - rank(b)),
    ...kills.filter((k) => k.anyMap).sort((a, b) => rank(a) - rank(b))
  ]
  const withGun = kills.filter((k) => killForGun(k.objective, guns) === 'gun').length
  const anyMap = kills.filter((k) => k.anyMap).length
  const here = kills.length - anyMap
  const counts = [
    here ? `${here} kill objective${here === 1 ? '' : 's'} here` : null,
    anyMap ? `${anyMap} on any map` : null,
    withGun && guns?.length ? `${withGun} with your ${guns.length > 1 ? 'guns' : gunName(guns[0])}` : null
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <aside className={`kill-banner${open ? '' : ' closed'}`} aria-label="Kill objectives">
      <button
        className="kill-banner-head"
        aria-expanded={open}
        title={open ? 'Fold the kill objectives away' : 'Show the kill objectives left'}
        onClick={onToggle}
      >
        <span className="kill-banner-icon" aria-hidden>
          ☠
        </span>
        <span>{counts}</span>
        <span className="kill-banner-fold" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ul className="kill-banner-list">
          {shown.map(({ quest, objective, done, total, anyMap }) => {
            const fit = killForGun(objective, guns)
            const gun = gunFor(objective, guns)
            const icon = gun ? items?.get(gun)?.iconLink : null
            return (
              <li key={`${quest.id}/${objective.id}`} className={fit === 'gun' ? 'gun' : undefined}>
                <button
                  className="link kill-banner-quest"
                  title="Open this quest"
                  onClick={() => onSelectQuest(quest.id)}
                >
                  {quest.name}
                </button>
                <span className="kill-banner-text">
                  {anyMap ? objective.description : shortObjective(objective.description, mapNames)}
                  {squadShared(quest, objective) && <SquadIcon />}
                  {anyMap && <span className="tag">any map</span>}
                  {fit === 'gun' && gun && (
                    <span
                      className="tag gun"
                      title="A gun chosen for this map in the Weapons tab completes it"
                    >
                      {icon && <img src={icon} alt="" loading="lazy" />}★ Bringing {gunName(gun)}
                    </span>
                  )}
                  {fit === 'other' && (
                    <span
                      className="tag other-gun"
                      title={`It needs ${(objective.weapons ?? []).map((id) => items?.get(id)?.name ?? 'Unknown weapon').join(' or ')}`}
                    >
                      needs another gun
                    </span>
                  )}
                </span>
                <span className="kill-banner-count" title={`${done} of ${total} done`}>
                  {done}/{total}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
