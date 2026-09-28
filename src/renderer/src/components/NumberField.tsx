import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  value: number
  onCommit: (value: number) => void
  min?: number
  step?: number
}

const TYPING_DEBOUNCE_MS = 400

/**
 * A number input that only saves once typing pauses, or on Enter or leaving the field, so each
 * keystroke doesn't re-save settings and re-rank every item.
 */
export default function NumberField({ label, value, onCommit, min, step }: Props): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setDraft(String(value)), [value])
  useEffect(() => () => clearTimeout(pending.current ?? undefined), [])

  function commit(text: string): void {
    clearTimeout(pending.current ?? undefined)
    const next = Number(text)
    if (text.trim() === '' || !Number.isFinite(next)) {
      setDraft(String(value))
      return
    }
    if (next !== value) onCommit(next)
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={draft}
        onChange={(e) => {
          const text = e.target.value
          setDraft(text)
          clearTimeout(pending.current ?? undefined)
          if (text !== '') pending.current = setTimeout(() => commit(text), TYPING_DEBOUNCE_MS)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft)
        }}
        onBlur={() => commit(draft)}
      />
    </label>
  )
}
