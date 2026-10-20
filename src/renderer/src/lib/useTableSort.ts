import { useCallback, useMemo } from 'react'
import { nextSort, sortRows, type CellValue, type ColumnSort } from '../../../shared/tableSort'
import { useStore } from '../store'

/** A column of a table: its header, and what its cells sort by (none for a column of buttons). */
export interface SortColumn<T> {
  key: string
  label: React.ReactNode
  title?: string
  /** Numbers: right-aligned. */
  num?: boolean
  className?: string
  ariaLabel?: string
  /** Biggest first on the first click (money and counts); otherwise A to Z. */
  desc?: boolean
  value?: (row: T) => CellValue
}

export interface TableSort<T> {
  sort: ColumnSort | null
  onSort: (key: string) => void
  /** The rows in the order chosen (the order given when the table's own order is chosen). */
  sorted: (rows: readonly T[]) => T[]
}

/**
 * How a table is sorted (since 1.59.0), remembered in Settings by its id: click a header to sort by it,
 * again to reverse, a third time for the table's own order.
 */
export function useTableSort<T>(tableId: string, columns: readonly SortColumn<T>[]): TableSort<T> {
  const saved = useStore((s) => s.settings?.tableSorts[tableId])
  const updateSettings = useStore((s) => s.updateSettings)
  // A saved column the table no longer has counts as its own order.
  const column = saved ? columns.find((c) => c.key === saved.key && c.value) : undefined
  const sort = column && saved ? saved : null
  const onSort = useCallback(
    (key: string): void => {
      const col = columns.find((c) => c.key === key)
      if (!col?.value) return
      const all = { ...useStore.getState().settings?.tableSorts }
      const next = nextSort(all[tableId] ?? null, key, col.desc ?? false)
      if (next) all[tableId] = next
      else delete all[tableId]
      void updateSettings({ tableSorts: all })
    },
    [columns, tableId, updateSettings]
  )
  const value = column?.value
  const desc = sort?.desc ?? false
  const sorted = useCallback(
    (rows: readonly T[]): T[] => (value ? sortRows(rows, value, desc) : [...rows]),
    [value, desc]
  )
  return useMemo(() => ({ sort, onSort, sorted }), [sort, onSort, sorted])
}
