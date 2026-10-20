// Sorting any table by any of its columns (since 1.59.0): one way of comparing cells for every table,
// and the three clicks on a header (sort, reverse, back to the table's own order).

/** A column a table is sorted by, and which way. */
export interface ColumnSort {
  key: string
  desc: boolean
}

/** What a cell sorts by. A list breaks ties in order (a Do column: what to do, then the worth). */
export type Cell = number | string | boolean | null | undefined
export type CellValue = Cell | readonly Cell[]

const missing = (v: Cell): boolean =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))

/** Two cells in the direction asked; empty ones (no price, —) go last whichever way. */
export function compareCells(a: CellValue, b: CellValue, desc: boolean): number {
  const as = Array.isArray(a) ? a : [a as Cell]
  const bs = Array.isArray(b) ? b : [b as Cell]
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i]
    const y = bs[i]
    if (missing(x) || missing(y)) {
      if (missing(x) && missing(y)) continue
      return missing(x) ? 1 : -1
    }
    const c =
      typeof x === 'string' && typeof y === 'string'
        ? x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })
        : Number(x) - Number(y)
    if (c !== 0) return desc ? -c : c
  }
  return 0
}

/** Rows by a column; ties keep the order given (the table's own). */
export function sortRows<T>(rows: readonly T[], value: (row: T) => CellValue, desc: boolean): T[] {
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => compareCells(a.v, b.v, desc) || a.i - b.i)
    .map((e) => e.row)
}

/**
 * Clicking a header: the first click sorts the column its natural way (A to Z, or biggest first), the
 * second reverses it, the third goes back to the table's own order (null).
 */
export function nextSort(current: ColumnSort | null, key: string, naturalDesc: boolean): ColumnSort | null {
  if (current?.key !== key) return { key, desc: naturalDesc }
  if (current.desc === naturalDesc) return { key, desc: !naturalDesc }
  return null
}
