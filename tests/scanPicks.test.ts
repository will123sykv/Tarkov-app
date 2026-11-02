import { describe, expect, it } from 'vitest'
import { MAX_PICKS, pickKey, rowsLike, withPick } from '../src/renderer/src/lib/scanPicks'

describe('items picked for labels, remembered (since 1.73.0)', () => {
  it('keys a pick by the label as read and the tile’s size, either way up', () => {
    expect(pickKey('Bolts', 1, 1)).toBe(pickKey(' bolts.', 1, 1))
    // The game's font: 1 and l look alike.
    expect(pickKey('Bo1ts', 1, 1)).toBe(pickKey('Bolts', 1, 1))
    expect(pickKey('Bolts', 1, 2)).not.toBe(pickKey('Bolts', 1, 1))
    expect(pickKey('GPU', 2, 1)).toBe(pickKey('GPU', 1, 2))
    expect(pickKey('', 1, 1)).toBeNull()
    expect(pickKey('..', 1, 1)).toBeNull()
  })

  it('replaces a pick for the same label, keeping the latest ones', () => {
    const one = withPick({}, 'bolts|1x1', 'a', 1)
    expect(withPick(one, 'bolts|1x1', 'b', 2)).toEqual({ 'bolts|1x1': { itemId: 'b', at: 2 } })
    let many = {}
    for (let i = 0; i <= MAX_PICKS; i++) many = withPick(many, `k${i}`, 'x', i)
    expect(Object.keys(many)).toHaveLength(MAX_PICKS)
    expect(many).not.toHaveProperty('k0')
    expect(many).toHaveProperty(`k${MAX_PICKS}`)
  })

  it('sets an item picked for a row on every row read the same way', () => {
    const row = (key: number, read: string, w = 1, h = 1, itemId: string | null = null) => ({
      key,
      read,
      itemId,
      tile: { w, h }
    })
    const rows = [
      row(1, 'Bolts'),
      row(2, 'bolts'),
      row(3, 'Bolts', 1, 2),
      row(4, 'Screws'),
      { key: 5, read: 'Bolts', itemId: null, tile: null }
    ]
    expect(rowsLike(rows, rows[0]).map((r) => r.key)).toEqual([1, 2])
    // Nothing read: only that row.
    const blank = row(6, '')
    expect(rowsLike([...rows, blank, row(7, '')], blank).map((r) => r.key)).toEqual([6])
  })
})
