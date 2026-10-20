import { describe, expect, it } from 'vitest'
import { compareCells, nextSort, sortRows } from '../src/shared/tableSort'

describe('sorting a table by a column', () => {
  it('compares numbers, text (numbers in it by value) and yes/no', () => {
    expect(compareCells(1, 2, false)).toBeLessThan(0)
    expect(compareCells(1, 2, true)).toBeGreaterThan(0)
    expect(compareCells('Item 10', 'item 9', false)).toBeGreaterThan(0)
    expect(compareCells(true, false, true)).toBeLessThan(0)
  })

  it('keeps empty cells last whichever way', () => {
    const rows = [{ v: null }, { v: 3 }, { v: undefined }, { v: 1 }]
    expect(sortRows(rows, (r) => r.v, false).map((r) => r.v)).toEqual([1, 3, null, undefined])
    expect(sortRows(rows, (r) => r.v, true).map((r) => r.v)).toEqual([3, 1, null, undefined])
  })

  it('breaks ties with the next value, then keeps the order given', () => {
    const rows = [
      { id: 'a', rank: 1, worth: 5 },
      { id: 'b', rank: 0, worth: 1 },
      { id: 'c', rank: 1, worth: 9 },
      { id: 'd', rank: 0, worth: 1 }
    ]
    expect(sortRows(rows, (r) => [r.rank, -r.worth], false).map((r) => r.id)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('sorts, reverses, then goes back to the table’s own order', () => {
    const first = nextSort(null, 'worth', true)
    expect(first).toEqual({ key: 'worth', desc: true })
    const second = nextSort(first, 'worth', true)
    expect(second).toEqual({ key: 'worth', desc: false })
    expect(nextSort(second, 'worth', true)).toBeNull()
    expect(nextSort(second, 'name', false)).toEqual({ key: 'name', desc: false })
  })
})
