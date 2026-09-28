import { useEffect, useRef, useState } from 'react'
import { MAX_PLAYER_LEVEL, MIN_PLAYER_LEVEL } from '../../../shared/constants'
import { clampPlayerLevel } from '../../../shared/settings'

interface Props {
  level: number
  fleaMinLevel: number
  onChange: (level: number) => void
}

const TYPING_DEBOUNCE_MS = 400

export default function LevelInput({ level, fleaMinLevel, onChange }: Props): React.JSX.Element {
  const [draft, setDraft] = useState(String(level))
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setDraft(String(level)), [level])
  useEffect(() => () => clearTimeout(pending.current ?? undefined), [])

  function commit(value: number): void {
    clearTimeout(pending.current ?? undefined)
    const next = clampPlayerLevel(value, level)
    setDraft(String(next))
    if (next !== level) onChange(next)
  }

  return (
    <div className="level">
      <label htmlFor="player-level">PMC level</label>
      <div className="stepper">
        <button
          onClick={() => commit(level - 1)}
          disabled={level <= MIN_PLAYER_LEVEL}
          aria-label="Lower level"
        >
          −
        </button>
        <input
          id="player-level"
          type="number"
          min={MIN_PLAYER_LEVEL}
          max={MAX_PLAYER_LEVEL}
          value={draft}
          onChange={(e) => {
            const value = e.target.value
            setDraft(value)
            clearTimeout(pending.current ?? undefined)
            if (value !== '') pending.current = setTimeout(() => commit(Number(value)), TYPING_DEBOUNCE_MS)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(Number(draft))
          }}
          onBlur={() => commit(Number(draft))}
        />
        <button
          onClick={() => commit(level + 1)}
          disabled={level >= MAX_PLAYER_LEVEL}
          aria-label="Raise level"
        >
          +
        </button>
      </div>
      <span className={`level-hint ${level < fleaMinLevel ? 'warn' : ''}`}>
        {level < fleaMinLevel ? `Flea unlocks at ${fleaMinLevel}` : 'Flea unlocked'}
      </span>
    </div>
  )
}
