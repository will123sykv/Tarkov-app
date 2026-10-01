import { describe, expect, it } from 'vitest'
import {
  countLabel,
  findItems,
  findLattice,
  findOverlap,
  inOverlap,
  matchName,
  nameLabel,
  nameScore,
  ocrImage,
  parseCount,
  pickItem,
  pictureDistance,
  pictureFeature,
  rotate,
  scanGrid,
  shortlist,
  tileDistance,
  type PlacedItem,
  type RgbaImage,
  type ScanTile
} from '../src/renderer/src/lib/scavScan'
import type { HideoutNeed, KeepInfo } from '../src/shared/hideout'
import { adviseScan, lootAdditions, scanTotals, stashCounts } from '../src/shared/scavAdvice'
import type { LootItem } from '../src/shared/types'

const BORDER = [73, 81, 84]

/** A deterministic pseudo-random sequence, for item "icons". */
function noise(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

interface FakeItem {
  col: number
  row: number
  w: number
  h: number
  tint: [number, number, number]
}

/** A game-like item grid: dark empty cells with faint lines, items with a texture and a grey border. */
function drawGrid(opts: {
  width: number
  height: number
  cell: number
  x0: number
  y0: number
  cols: number
  rows: number
  items: FakeItem[]
}): RgbaImage {
  const { width, height, cell, x0, y0, cols, rows } = opts
  const data = new Uint8ClampedArray(width * height * 4)
  const set = (x: number, y: number, [r, g, b]: number[]): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const p = (y * width + x) * 4
    data[p] = r
    data[p + 1] = g
    data[p + 2] = b
    data[p + 3] = 255
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  const right = x0 + cols * cell
  const bottom = y0 + rows * cell
  for (let y = y0; y <= bottom; y++) for (let x = x0; x <= right; x++) set(x, y, [18, 18, 18])
  for (let k = 0; k <= cols; k++)
    for (let y = y0; y <= bottom; y++) {
      set(x0 + k * cell, y, [24, 24, 24])
      set(x0 + k * cell + 1, y, [29, 29, 29])
    }
  for (let j = 0; j <= rows; j++)
    for (let x = x0; x <= right; x++) {
      set(x, y0 + j * cell, [33, 33, 33])
      set(x, y0 + j * cell - 1, [14, 14, 14])
    }
  const rand = noise(7)
  for (const item of opts.items) {
    const left = x0 + item.col * cell
    const top = y0 + item.row * cell
    const r = left + item.w * cell
    const b = top + item.h * cell
    for (let y = top; y <= b; y++)
      for (let x = left; x <= r; x++) {
        const n = rand() * 120
        set(x, y, [item.tint[0] + n, item.tint[1] + n, item.tint[2] + n])
      }
    for (let x = left; x <= r; x++) {
      set(x, top, BORDER)
      set(x, b, BORDER)
    }
    for (let y = top; y <= b; y++) {
      set(left, y, BORDER)
      set(r, y, BORDER)
    }
  }
  return { width, height, data }
}

const ITEMS: FakeItem[] = [
  { col: 0, row: 0, w: 1, h: 1, tint: [20, 30, 40] },
  { col: 1, row: 0, w: 2, h: 1, tint: [40, 30, 20] },
  { col: 3, row: 0, w: 1, h: 2, tint: [30, 20, 40] },
  { col: 0, row: 1, w: 2, h: 2, tint: [20, 40, 30] },
  { col: 2, row: 1, w: 1, h: 1, tint: [20, 30, 40] },
  { col: 2, row: 2, w: 1, h: 1, tint: [20, 30, 40] }
]

const sizes = (tiles: ScanTile[]): string[] => tiles.map((t) => `${t.col},${t.row} ${t.w}x${t.h}`)

describe('finding the grid and its items', () => {
  it('finds a 63 px grid, its origin and each item with its size', () => {
    const img = drawGrid({ width: 560, height: 420, cell: 63, x0: 8, y0: 28, cols: 8, rows: 6, items: ITEMS })
    const lattice = findLattice(img)
    expect(lattice).not.toBeNull()
    expect(lattice!.cell).toBeCloseTo(63, 0)
    // Within a pixel of a grid line (the line is 2 px wide).
    const off = (v: number): number => Math.min(((v % 63) + 63) % 63, 63 - (((v % 63) + 63) % 63))
    expect(off(lattice!.x0 - 8)).toBeLessThanOrEqual(1)
    expect(off(lattice!.y0 - 28)).toBeLessThanOrEqual(1)
    const tiles = findItems(img, lattice!)
    const first = tiles[0]
    // Cells are numbered from the first grid line found, so compare relative to the first item.
    const relative = tiles.map((t) => ({ ...t, col: t.col - first.col, row: t.row - first.row }))
    expect(sizes(relative)).toEqual(['0,0 1x1', '1,0 2x1', '3,0 1x2', '0,1 2x2', '2,1 1x1', '2,2 1x1'])
  })

  it('works at another scale and offset', () => {
    const img = drawGrid({
      width: 520,
      height: 400,
      cell: 50,
      x0: 21,
      y0: 33,
      cols: 9,
      rows: 7,
      items: ITEMS
    })
    const scan = scanGrid(img)
    expect(scan?.lattice.cell).toBeCloseTo(50, 0)
    expect(scan?.tiles.map((t) => `${t.w}x${t.h}`)).toEqual(['1x1', '2x1', '1x2', '2x2', '1x1', '1x1'])
  })

  it('only scans inside a chosen region', () => {
    const img = drawGrid({ width: 560, height: 420, cell: 63, x0: 8, y0: 28, cols: 8, rows: 6, items: ITEMS })
    // The first three columns only: the 1×2 item in the fourth is left out.
    const scan = scanGrid(img, { x: 0, y: 0, width: 210, height: 420 })
    expect(scan?.tiles.map((t) => `${t.w}x${t.h}`) ?? []).toEqual(['1x1', '2x1', '2x2', '1x1', '1x1'])
  })

  it('leaves out an item the picture cuts off, rather than reading it as a smaller one', () => {
    const full = drawGrid({
      width: 560,
      height: 420,
      cell: 63,
      x0: 8,
      y0: 28,
      cols: 8,
      rows: 6,
      items: ITEMS
    })
    // Cut through the second row: the 1×2 and the 2×2 items lose their bottom half.
    const height = 28 + 63 + 40
    const cut: RgbaImage = { width: 560, height, data: full.data.slice(0, 560 * height * 4) }
    const lattice = findLattice(full)!
    expect(findItems(cut, lattice).map((t) => `${t.w}x${t.h}`)).toEqual(['1x1', '2x1'])
  })

  it('finds nothing in a picture with no grid', () => {
    const rand = noise(3)
    const data = new Uint8ClampedArray(400 * 300 * 4).map((_, i) => (i % 4 === 3 ? 255 : rand() * 255))
    expect(scanGrid({ width: 400, height: 300, data })).toBeNull()
  })
})

describe('cutting out labels', () => {
  const cell = 63
  const tile: ScanTile = { col: 0, row: 0, w: 1, h: 1, left: 0, top: 0, right: 63, bottom: 63 }
  const blank = (): RgbaImage => {
    const data = new Uint8ClampedArray(64 * 64 * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20
      data[i + 1] = 30
      data[i + 2] = 40
      data[i + 3] = 255
    }
    return { width: 64, height: 64, data }
  }
  const fill = (img: RgbaImage, x0: number, y0: number, w: number, h: number, v = 200): void => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const p = (y * img.width + x) * 4
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v
      }
  }

  it('takes the right-aligned name and leaves the icon out', () => {
    const img = blank()
    // Three "letters" ending 3 px from the right edge, in the cap band (rows 3–10).
    for (const x of [50, 54, 58]) fill(img, x, 3, 2, 8)
    // An icon blob further left, reaching up into the label strip.
    fill(img, 5, 4, 25, 30, 180)
    const label = nameLabel(img, tile, cell)
    expect(label).not.toBeNull()
    expect(label!.width).toBeGreaterThanOrEqual(10)
    expect(label!.width).toBeLessThanOrEqual(14)
  })

  it('finds no name when nothing ends at the right edge', () => {
    const img = blank()
    fill(img, 10, 3, 2, 8)
    expect(nameLabel(img, tile, cell)).toBeNull()
  })

  it('takes a stack count but not the found-in-raid tick', () => {
    const img = blank()
    // A tick-sized ring (11 px tall) above where counts go: not a count.
    fill(img, 48, 50, 11, 11)
    fill(img, 50, 52, 7, 7, 20)
    expect(countLabel(img, tile, cell)).toBeNull()
    // Two digits, 7 px tall, on the bottom line.
    const counted = blank()
    fill(counted, 50, 51, 4, 7)
    fill(counted, 56, 51, 4, 7)
    expect(countLabel(counted, tile, cell)?.width).toBeGreaterThanOrEqual(10)
  })

  it('makes a binary PGM, scaled up with dark text on white', () => {
    const label = { width: 3, height: 2, data: Uint8Array.from([0, 255, 0, 0, 255, 0]) }
    const pgm = ocrImage(label, 4)
    const header = 'P5\n44 40\n255\n'
    expect(new TextDecoder().decode(pgm.slice(0, header.length))).toBe(header)
    expect(pgm.length).toBe(header.length + 44 * 40)
    const at = (x: number, y: number): number => pgm[header.length + y * 44 + x]
    expect(at(0, 0)).toBe(255) // margin
    expect(at(16 + 6, 16 + 4)).toBe(0) // the bright middle column, now dark
    expect(at(16 + 1, 16 + 4)).toBe(255)
  })
})

describe('reading counts', () => {
  it('reads stack sizes and treats resources and noise as one', () => {
    expect(parseCount('60', 90)).toBe(60)
    expect(parseCount('100/100', 92)).toBe(1)
    expect(parseCount('', 0)).toBe(1)
    expect(parseCount('5', 12)).toBe(1)
    expect(parseCount('0', 90)).toBe(1)
  })
})

function item(id: string, shortName: string, width: number, height: number, name = shortName): LootItem {
  return {
    id,
    name,
    shortName,
    iconLink: null,
    wikiLink: null,
    width,
    height,
    slots: width * height,
    types: [],
    category: null,
    bannedOnFlea: false,
    minLevelForFlea: null,
    fleaPrice: null,
    fleaFee: null,
    bestTrader: null
  }
}

const CATALOG = [
  item('a'.repeat(24), 'Powerbank', 1, 1, 'Portable Powerbank'),
  item('b'.repeat(24), 'Pliers', 1, 1),
  item('c'.repeat(24), 'Bolts', 1, 1),
  item('d'.repeat(24), 'MTape', 1, 1, 'Construction measuring tape'),
  item('e'.repeat(24), 'Tape', 1, 1, 'Insulating tape'),
  item('f'.repeat(24), 'Hawk', 1, 2, 'Gunpowder "Hawk"'),
  item('1'.repeat(24), 'Hawk', 1, 2, 'SOG Voodoo Hawk tactical tomahawk'),
  item('2'.repeat(24), 'Hawk', 1, 1, 'Hawk figurine'),
  item('3'.repeat(24), 'Paper', 2, 1, 'Printer paper')
]

describe('matching names', () => {
  it('matches names the game cut off, and OCR slips', () => {
    expect(matchName('Powerban', 1, 1, CATALOG)[0].item.shortName).toBe('Powerbank')
    expect(matchName('Pllers', 1, 1, CATALOG)[0].item.shortName).toBe('Pliers')
    expect(matchName('Boits', 1, 1, CATALOG)[0].item.shortName).toBe('Bolts')
    expect(nameScore('~ Bolts', 'Bolts')).toBe(1)
  })

  it('only considers items of the tile’s size, turned or not', () => {
    expect(matchName('Hawk', 1, 2, CATALOG).map((m) => m.item.name)).toEqual([
      'Gunpowder "Hawk"',
      'SOG Voodoo Hawk tactical tomahawk'
    ])
    expect(matchName('Paper', 1, 2, CATALOG)[0].item.name).toBe('Printer paper')
  })

  it('is sure of a clear name without pictures', () => {
    const pick = pickItem(matchName('Pliers', 1, 1, CATALOG))
    expect(pick).toEqual({ item: expect.objectContaining({ shortName: 'Pliers' }), confidence: 'high' })
  })

  it('lets the picture decide between items with the same name', () => {
    const matches = shortlist(matchName('Hawk', 1, 2, CATALOG))
    expect(matches).toHaveLength(2)
    const pick = pickItem(matches, [40, 8])
    expect(pick.item?.name).toBe('SOG Voodoo Hawk tactical tomahawk')
    expect(pick.confidence).toBe('high')
  })

  it('prefers the exact name when the pictures can’t tell', () => {
    const matches = shortlist(matchName('MTape', 1, 1, CATALOG))
    expect(matches.map((m) => m.item.shortName)).toEqual(['MTape', 'Tape'])
    expect(pickItem(matches, [30, 31]).item?.shortName).toBe('MTape')
  })

  it('flags a poor read for checking', () => {
    expect(pickItem(matchName('xq', 1, 1, CATALOG)).confidence).toBe('low')
    expect(pickItem([])).toEqual({ item: null, confidence: 'low' })
  })
})

describe('comparing pictures', () => {
  it('scores the same picture as identical and a different one as far', () => {
    const solid = (v: number): RgbaImage => ({
      width: 64,
      height: 64,
      data: new Uint8ClampedArray(64 * 64 * 4).fill(v)
    })
    const box = { x: 0, y: 0, width: 64, height: 64 }
    const a = pictureFeature(solid(100), box, 1, 1)
    expect(pictureDistance(a, pictureFeature(solid(100), box, 1, 1))).toBe(0)
    expect(pictureDistance(a, pictureFeature(solid(160), box, 1, 1))).toBe(60)
    expect(pictureDistance(a, pictureFeature(solid(100), box, 2, 1))).toBe(Infinity)
  })

  it('turns pictures a quarter turn either way', () => {
    // 2×1 pixels: red, blue.
    const img = { width: 2, height: 1, data: Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 255, 255]) }
    const cw = rotate(img, true)
    expect([cw.width, cw.height]).toEqual([1, 2])
    expect(Array.from(cw.data.slice(0, 3))).toEqual([255, 0, 0])
    expect(Array.from(rotate(img, false).data.slice(0, 3))).toEqual([0, 0, 255])
  })

  it('compares a turned item with its picture turned', () => {
    // A 2×1 item's picture: left half dark, right half light; the tile shows it standing up (1×2).
    const picture: RgbaImage = { width: 128, height: 64, data: new Uint8ClampedArray(128 * 64 * 4) }
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 128; x++)
        picture.data.fill(x < 64 ? 30 : 200, (y * 128 + x) * 4, (y * 128 + x) * 4 + 4)
    const shot = rotate(picture, true)
    const tile: ScanTile = { col: 0, row: 0, w: 1, h: 2, left: 0, top: 0, right: 63, bottom: 127 }
    const turned = item('4'.repeat(24), 'Turned', 2, 1)
    expect(tileDistance(shot, tile, turned, picture)).toBeLessThan(1)
    expect(tileDistance(shot, tile, item('5'.repeat(24), 'Big', 2, 2), picture)).toBeNull()
  })
})

describe('what to keep and what to sell', () => {
  const priced = (
    id: string,
    flea: number | null,
    trader: number,
    extra: Partial<LootItem> = {}
  ): LootItem => ({
    ...item(id, id, 1, 1),
    fleaPrice: flea,
    fleaFee: flea ? Math.round(flea * 0.1) : null,
    bestTrader: trader ? { name: 'Therapist', price: trader } : null,
    ...extra
  })
  const items = new Map(
    [
      priced('bolts', 20_000, 9_000),
      priced('ledx', 800_000, 300_000, { bannedOnFlea: true }),
      priced('junk', 1_000, 4_000),
      priced('nothing', null, 0)
    ].map((i) => [i.id, i])
  )
  const keep = new Map<string, KeepInfo>([
    ['bolts', { hideout: 3, quests: 1, scarce: null }],
    [
      'ledx',
      { hideout: 1, quests: 0, scarce: { kind: 'rare', reason: 'Can’t be bought on the flea market' } }
    ]
  ])
  const ctx = { playerLevel: 20, fleaMinLevel: 15, subtractFleaFee: true }

  it('keeps what the hideout and quests need across stacks, and sells the rest where it pays most', () => {
    const advice = adviseScan(
      [
        { itemId: 'bolts', count: 2 },
        { itemId: 'bolts', count: 5 },
        { itemId: 'ledx', count: 1 },
        { itemId: 'junk', count: 3 },
        { itemId: 'nothing', count: 1 },
        { itemId: null, count: 1 }
      ],
      items,
      keep,
      ctx
    )
    expect(advice.map((a) => [a.keep, a.sell, a.via])).toEqual([
      [2, 0, 'flea'],
      [2, 3, 'flea'],
      [1, 0, 'trader'],
      [0, 3, 'trader'],
      [0, 1, null],
      [0, 0, null]
    ])
    expect(advice[0].keepFor).toEqual({ hideout: 2, quests: 0 })
    expect(advice[1].keepFor).toEqual({ hideout: 1, quests: 1 })
    expect(advice[1].each).toBe(18_000)
    expect(advice[1].total).toBe(54_000)
    expect(advice[2].scarce?.kind).toBe('rare')
    expect(advice[3]).toMatchObject({ trader: 'Therapist', each: 4_000, total: 12_000 })
    expect(scanTotals(advice)).toEqual({ sell: 66_000, flea: 54_000, traders: 12_000, keep: 5 })
  })

  it('keeps stacks already added to the hideout’s counts, and adds only what’s new', () => {
    const entries = [
      { itemId: 'bolts', count: 2 },
      { itemId: 'bolts', count: 5 },
      { itemId: 'ledx', count: 1 }
    ]
    const before = adviseScan(entries, items, keep, ctx)
    const { changes, stored } = lootAdditions(entries, before, { bolts: 1 })
    // Quests' bolts aren't the hideout's to count.
    expect(changes).toEqual([
      { itemId: 'bolts', from: 1, to: 4 },
      { itemId: 'ledx', from: 0, to: 1 }
    ])
    expect(stored).toEqual([2, 1, 1])
    // Once added, the hideout needs none: the stored ones stay kept, and the quests still get theirs.
    const after = adviseScan(
      entries.map((e, i) => ({ ...e, stored: stored[i] })),
      items,
      new Map<string, KeepInfo>([['bolts', { hideout: 0, quests: 1, scarce: null }]]),
      ctx
    )
    expect(after.map((a) => [a.keep, a.stored, a.keepFor.quests, a.sell])).toEqual([
      [2, 2, 0, 0],
      [2, 1, 1, 3],
      [1, 1, 0, 0]
    ])
    expect(lootAdditions(entries, after, { bolts: 4, ledx: 1 }).changes).toEqual([])
  })

  it('sets the hideout’s counts to everything the screenshots show', () => {
    const need = (itemId: string): HideoutNeed => ({
      itemId,
      foundInRaid: false,
      needed: 5,
      firNeeded: 0,
      have: 0,
      missing: 5,
      uses: []
    })
    const ROUBLES = '5449016a4bdc2d6f028b456f'
    const result = stashCounts(
      [
        { itemId: 'bolts', count: 3 },
        { itemId: 'bolts', count: 4 },
        { itemId: 'junk', count: 2 },
        { itemId: ROUBLES, count: 50_000 },
        { itemId: 'screws', count: 2 },
        { itemId: null, count: 1 }
      ],
      [need('bolts'), need('screws'), need('ledx'), need('wires'), need(ROUBLES)],
      { bolts: 1, screws: 2, ledx: 1, [ROUBLES]: 10 }
    )
    expect(result).toEqual({
      changes: [
        { itemId: 'bolts', from: 1, to: 7 },
        { itemId: 'ledx', from: 1, to: 0 }
      ],
      unchanged: 2,
      ignored: 1
    })
  })

  it('sells to traders before the flea opens', () => {
    const [bolts] = adviseScan([{ itemId: 'bolts', count: 5 }], items, new Map(), { ...ctx, playerLevel: 5 })
    expect(bolts).toMatchObject({ keep: 0, sell: 5, via: 'trader', each: 9_000 })
  })
})

describe('several screenshots', () => {
  const place = (rows: string[][]): PlacedItem[] =>
    rows.flatMap((row, r) => row.map((itemId, c) => ({ col: c, row: r, w: 1, h: 1, itemId })))
  const top = [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
    ['g', 'h', 'i'],
    ['j', 'k', 'l']
  ]

  it('finds rows a scrolled screenshot repeats', () => {
    const next = place([
      ['g', 'h', 'i'],
      ['j', 'k', 'l'],
      ['m', 'n', 'o']
    ])
    expect(findOverlap(place(top), next)).toBe(2)
    expect(next.filter((t) => inOverlap(t, 0, 2)).length).toBe(6)
    // The same screenshot twice.
    expect(findOverlap(place(top), place(top))).toBe(4)
  })

  it('ignores a single matching row, different rows, and items cut off by the edge', () => {
    expect(
      findOverlap(
        place(top),
        place([
          ['j', 'k', 'l'],
          ['m', 'n', 'o']
        ])
      )
    ).toBe(0)
    expect(
      findOverlap(
        place(top),
        place([
          ['x', 'y', 'z'],
          ['m', 'n', 'o']
        ])
      )
    ).toBe(0)
    // A tall item cut off at the top of the next screenshot isn't read there: still a match.
    const prev = [...place(top), { col: 3, row: 1, w: 1, h: 3, itemId: 'tall' }]
    expect(
      findOverlap(
        prev,
        place([
          ['g', 'h', 'i'],
          ['j', 'k', 'l'],
          ['m', 'n', 'o']
        ])
      )
    ).toBe(2)
  })
})
