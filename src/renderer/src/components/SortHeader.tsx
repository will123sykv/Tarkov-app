import type { ColumnSort } from '../../../shared/tableSort'
import type { SortColumn } from '../lib/useTableSort'

// Sortable column headers, the same on every table (since 1.59.0): the sorted column is highlighted,
// with ▲ or ▼, and says so to screen readers.

/** "ascending" or "descending" for the sorted column, "none" for the rest. */
export const ariaSort = (active: boolean, desc: boolean): 'ascending' | 'descending' | 'none' =>
  active ? (desc ? 'descending' : 'ascending') : 'none'

/** A header's button: its label, and ▲ or ▼ when the table is sorted by it. */
export function SortButton({
  label,
  active,
  desc,
  title,
  onClick
}: {
  label: React.ReactNode
  active: boolean
  desc: boolean
  title?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className={`sort ${active ? 'active' : ''}`}
      title={
        title ? `${title}. Click to sort; again to reverse, a third time for the usual order` : undefined
      }
      onClick={onClick}
    >
      {label}
      {active && <span aria-hidden>{desc ? ' ▼' : ' ▲'}</span>}
    </button>
  )
}

/** A table's header row: a sort button in each column that sorts. */
export function SortHead<T>({
  columns,
  sort,
  onSort
}: {
  columns: readonly SortColumn<T>[]
  sort: ColumnSort | null
  onSort: (key: string) => void
}): React.JSX.Element {
  return (
    <thead>
      <tr>
        {columns.map((col) => {
          const active = sort?.key === col.key
          const className = [col.num ? 'num' : '', col.className ?? ''].filter(Boolean).join(' ')
          return (
            <th
              key={col.key}
              className={className || undefined}
              aria-label={col.ariaLabel}
              aria-sort={col.value ? ariaSort(active, sort?.desc ?? false) : undefined}
              title={col.value ? undefined : col.title}
            >
              {col.value ? (
                <SortButton
                  label={col.label}
                  active={active}
                  desc={sort?.desc ?? false}
                  title={col.title}
                  onClick={() => onSort(col.key)}
                />
              ) : (
                col.label
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
