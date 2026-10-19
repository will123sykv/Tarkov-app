import { squadShared } from '../../../shared/squad'
import { shortObjective, type KillToDo } from '../../../shared/todo'
import { killForGun } from '../../../shared/weapons'
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
  gun,
  items
}: {
  kills: readonly KillToDo[]
  /** The names of the map shown, taken off the objectives' text ("…on Woods"). */
  mapNames: readonly string[]
  open: boolean
  onToggle: () => void
  onSelectQuest: (questId: string) => void
  /** The gun chosen for this map in the Weapons tab: the kills it completes are highlighted (since 1.57.0). */
  gun?: string | null
  items?: ReturnType<typeof useItemLookup>
}): React.JSX.Element | null {
  if (!kills.length) return null
  const gunName = gun ? (items?.get(gun)?.name ?? 'Unknown weapon') : null
  const gunIcon = gun ? items?.get(gun)?.iconLink : null
  // The kills the gun completes first, among this map's and among any map's, in their order otherwise.
  const rank = (k: KillToDo): number => (killForGun(k.objective, gun) === 'gun' ? 0 : 1)
  const shown = [
    ...kills.filter((k) => !k.anyMap).sort((a, b) => rank(a) - rank(b)),
    ...kills.filter((k) => k.anyMap).sort((a, b) => rank(a) - rank(b))
  ]
  const withGun = kills.filter((k) => killForGun(k.objective, gun) === 'gun').length
  const anyMap = kills.filter((k) => k.anyMap).length
  const here = kills.length - anyMap
  const counts = [
    here ? `${here} kill objective${here === 1 ? '' : 's'} here` : null,
    anyMap ? `${anyMap} on any map` : null,
    withGun ? `${withGun} with your ${gunName}` : null
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
            const fit = killForGun(objective, gun)
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
                  {fit === 'gun' && (
                    <span
                      className="tag gun"
                      title="The gun chosen for this map in the Weapons tab completes it"
                    >
                      {gunIcon && <img src={gunIcon} alt="" loading="lazy" />}★ Bringing {gunName}
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
