import { maxLevel, stationLevel, type HideoutProgress } from '../../../shared/hideout'
import type { HideoutStation } from '../../../shared/questTypes'
import { useStore } from '../store'

// How far each hideout station is built, set by hand (the game's logs don't say): in the sidebars of
// Items to collect and, since 1.58.0, the Hideout tab.

const STATION_ICON_FALLBACK = (name: string): string => name.slice(0, 2)

export function StationIcon({ station }: { station: HideoutStation }): React.JSX.Element {
  return station.imageLink ? (
    <img className="station-icon" src={station.imageLink} alt="" loading="lazy" />
  ) : (
    <span className="station-icon" aria-hidden>
      {STATION_ICON_FALLBACK(station.name)}
    </span>
  )
}

/** A level picker per station: Not built, then Level 1 up to its last. */
export default function StationLevels({
  stations,
  progress
}: {
  stations: readonly HideoutStation[]
  progress: HideoutProgress
}): React.JSX.Element {
  const setStationLevel = useStore((s) => s.setStationLevel)
  return (
    <ul className="station-levels">
      {stations.map((s) => {
        const level = stationLevel(s, progress)
        return (
          <li key={s.id}>
            <StationIcon station={s} />
            <span className="station-name" title={s.name}>
              {s.name}
            </span>
            <select
              value={level}
              aria-label={`${s.name} level`}
              onChange={(e) => void setStationLevel(s.id, Number(e.target.value))}
            >
              {Array.from({ length: maxLevel(s) + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Not built' : `Level ${n}`}
                </option>
              ))}
            </select>
          </li>
        )
      })}
    </ul>
  )
}
