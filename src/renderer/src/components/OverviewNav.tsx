/**
 * Above something opened from an overview of tiles (a map in To do or Weapons, a station in the Hideout
 * tab): back to the overview, where it is in the order, and on to the one before or after.
 */
export default function OverviewNav({
  items,
  current,
  name,
  label,
  allLabel,
  onOpen
}: {
  items: readonly { key: string; name: string }[]
  current: string
  name: string
  /** What the items are, for screen readers ("Maps"). */
  label: string
  /** The back button ("All maps"). */
  allLabel: string
  onOpen: (key: string | null) => void
}): React.JSX.Element {
  const i = items.findIndex((p) => p.key === current)
  const prev = i > 0 ? items[i - 1] : null
  const next = i >= 0 && i < items.length - 1 ? items[i + 1] : null
  return (
    <nav className="overview-nav" aria-label={label}>
      <button className="button small" onClick={() => onOpen(null)}>
        ◀ {allLabel}
      </button>
      <span className="overview-nav-where">
        <strong>{name}</strong>
        {i >= 0 && (
          <span className="muted">
            {' '}
            · {i + 1} of {items.length}
          </span>
        )}
      </span>
      <button
        className="button small"
        disabled={!prev}
        title={prev ? `Open ${prev.name}` : undefined}
        onClick={() => prev && onOpen(prev.key)}
      >
        ◀ {prev?.name ?? 'Previous'}
      </button>
      <button
        className="button small"
        disabled={!next}
        title={next ? `Open ${next.name}` : undefined}
        onClick={() => next && onOpen(next.key)}
      >
        {next?.name ?? 'Next'} ▶
      </button>
    </nav>
  )
}
