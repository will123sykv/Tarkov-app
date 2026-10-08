import { describe, expect, it } from 'vitest'
import type { MapExtract, MapLabel } from '../src/shared/questTypes'
import {
  bossLines,
  HIGHLIGHT_COLORS,
  highlightColors,
  extractDetail,
  extractKind,
  extractsFor,
  labelAnchor,
  mergeBossSpawns
} from '../src/renderer/src/lib/mapMarkers'

const ROUBLES = '5449016a4bdc2d6f028b456f'
const extract = (name: string, faction: string, extra: Partial<MapExtract> = {}): MapExtract => ({
  name,
  faction,
  position: { x: 1, y: 0, z: 2 },
  outline: [],
  transferItem: null,
  ...extra
})

describe('extract kinds', () => {
  // Names and costs as tarkov.dev lists them.
  it.each([
    ['Crossroads', null, 'extract'],
    ['Railroad Passage (Flare)', null, 'flare'],
    ['Mira Ave (Flare)', null, 'flare'],
    ['Boiler Room Basement (Co-op)', null, 'coop'],
    ['Friendship Bridge (Co-Op)', null, 'coop'],
    ['Dorms V-Ex', { itemId: ROUBLES, count: 20000 }, 'vehicle'],
    ["Smugglers' Bunker (ZB-1012)", { itemId: '675aaab74bca0b001d02f356', count: 1 }, 'secret'],
    ['Railway Bridge to Tarkov', { itemId: '675aaa9a3107dac100063331', count: 1 }, 'secret']
  ] as const)('%s is a %s… extract', (name, transferItem, kind) => {
    expect(extractKind({ name, transferItem })).toBe(kind)
  })

  it('says what each needs', () => {
    expect(
      extractDetail(extract('Dorms V-Ex', 'pmc', { transferItem: { itemId: ROUBLES, count: 20000 } }))
    ).toBe('Vehicle extract: 20,000 ₽')
    const secret = extract('Mountain Bunker', 'pmc', { transferItem: { itemId: 'x', count: 1 } })
    expect(extractDetail(secret, (id) => (id === 'x' ? 'Keyword note' : undefined))).toBe(
      'Secret extract: needs Keyword note'
    )
    expect(extractDetail(secret)).toBe('Secret extract: needs a special item')
    expect(extractDetail(extract('Crossroads', 'shared'))).toBe('PMC and scav extract')
    expect(extractDetail(extract('Gate 3', 'scav'))).toBe('Scav extract')
  })

  it('shows one side’s extracts with shared and co-op ones, each once', () => {
    const list = [
      extract('Gate 3', 'pmc'),
      extract('Gate 3', 'scav', { position: { x: 3, y: 0, z: 5 } }),
      extract('Crossroads', 'shared'),
      extract('Boiler Room Basement (Co-op)', 'scav'),
      // Ground Zero 21+ repeats Ground Zero's extracts without a faction.
      extract('Gate 3', 'shared')
    ]
    expect(extractsFor(list, 'pmc').map((e) => `${e.name} ${e.faction}`)).toEqual([
      'Gate 3 pmc',
      'Crossroads shared',
      'Boiler Room Basement (Co-op) scav'
    ])
    expect(extractsFor(list, 'scav').map((e) => `${e.name} ${e.faction}`)).toEqual([
      'Gate 3 scav',
      'Crossroads shared',
      'Boiler Room Basement (Co-op) scav'
    ])
  })
})

describe('bosses', () => {
  it('lists each boss’s chances', () => {
    expect(
      bossLines({
        bosses: [
          { name: 'Reshala', chance: 0.6, here: 0.33 },
          { name: 'Cultist priest', chance: 0.2, here: 1 }
        ]
      })
    ).toEqual(['Reshala: 60% a raid, here 33% of the time', 'Cultist priest: 20% a raid'])
  })

  it('merges points of maps sharing an image, with the bosses of both', () => {
    const merged = mergeBossSpawns([
      [{ position: { x: 0, y: 0, z: 0 }, zone: 'A', bosses: [] }],
      [
        {
          position: { x: 2, y: 0, z: 1 },
          zone: 'A',
          bosses: [{ name: 'Cultist priest', chance: 0.02, here: 1 }]
        },
        { position: { x: 50, y: 0, z: 0 }, zone: 'B', bosses: [] }
      ]
    ])
    expect(merged).toEqual([
      {
        position: { x: 0, y: 0, z: 0 },
        zone: 'A',
        bosses: [{ name: 'Cultist priest', chance: 0.02, here: 1 }]
      },
      { position: { x: 50, y: 0, z: 0 }, zone: 'B', bosses: [] }
    ])
  })
})

describe('place names', () => {
  const label = (bottom: number | null, top: number | null): MapLabel => ({
    text: 'x',
    position: [5, 6],
    size: 100,
    rotation: 0,
    bottom,
    top
  })
  it('go on the floor tarkov.dev gives them, else on no particular floor', () => {
    expect(labelAnchor(label(6, null))).toEqual({ x: 5, y: 6.5, z: 6 })
    // Interchange's second-floor shops: 34 and up, written as 34..999.
    expect(labelAnchor(label(34, 999))).toEqual({ x: 5, y: 34.5, z: 6 })
    expect(labelAnchor(label(3, 5))).toEqual({ x: 5, y: 3.5, z: 6 })
    expect(labelAnchor(label(null, -2))).toEqual({ x: 5, y: -2.5, z: 6 })
    expect(labelAnchor(label(-100, 100))).toEqual({ x: 5, y: null, z: 6 })
    expect(labelAnchor(label(null, null))).toEqual({ x: 5, y: null, z: 6 })
  })
})

describe('highlightColors', () => {
  it('gives each item its own colour, kept while others come and go', () => {
    const ids = ['5d1b2fa286f77425227d1674', '5e2aedd986f7746d404f3aa4', '5af04b6486f774195a3ebb49']
    const all = highlightColors(ids)
    expect(new Set(all.values()).size).toBe(3)
    for (const c of all.values()) expect(HIGHLIGHT_COLORS).toContain(c)
    // Taking one off leaves the others' colours alone (unless they had been bumped by it).
    const fewer = highlightColors([ids[0], ids[2]])
    expect(fewer.get(ids[0])).toBe(all.get(ids[0]))
    expect(fewer.get(ids[2])).toBe(all.get(ids[2]))
  })

  it('still gives distinct colours to as many items as there are colours', () => {
    const ids = Array.from({ length: HIGHLIGHT_COLORS.length }, (_, i) => `item${i}`)
    expect(new Set(highlightColors(ids).values()).size).toBe(HIGHLIGHT_COLORS.length)
  })
})
