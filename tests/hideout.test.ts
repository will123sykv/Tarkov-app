import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_HIDEOUT,
  hideoutNeeds,
  keepList,
  rareReason,
  startingLevel,
  stationLevel
} from '../src/shared/hideout'
import { createPlayerStore } from '../src/main/quests/playerStore'
import type { HideoutLevel, HideoutStation } from '../src/shared/questTypes'
import type { LootItem } from '../src/shared/types'
import { tempDir } from './helpers'
import { writeFile } from 'node:fs/promises'

const ROUBLES = '5449016a4bdc2d6f028b456f'
const level = (n: number, items: [string, number, boolean?][], extra: Partial<HideoutLevel> = {}) => ({
  level: n,
  constructionTime: 3600,
  items: items.map(([itemId, count, foundInRaid = false]) => ({ itemId, count, foundInRaid })),
  stations: [],
  traders: [],
  skills: [],
  ...extra
})
const station = (id: string, name: string, levels: HideoutLevel[]): HideoutStation => ({
  id,
  name,
  normalizedName: name.toLowerCase(),
  imageLink: null,
  levels
})

const STASH = station('stash', 'Stash', [level(1, []), level(2, [[ROUBLES, 2_000_000]]), level(3, [])])
const LAVATORY = station('lav', 'Lavatory', [
  level(1, [
    ['bolts', 1],
    ['toilet', 1]
  ]),
  level(2, [
    ['bolts', 6],
    ['screws', 6]
  ]),
  level(3, [
    ['bolts', 10],
    ['ledx', 1, true]
  ])
])
const WORKBENCH = station('wb', 'Workbench', [
  level(1, [['bolts', 2]]),
  level(2, [['ledx', 1]], { stations: [{ stationId: 'lav', level: 1 }] })
])

describe('hideout levels', () => {
  it('starts each station at the levels that need nothing', () => {
    expect(startingLevel(STASH)).toBe(1)
    expect(startingLevel(LAVATORY)).toBe(0)
    // Level 3 is free too, but level 2 isn't, so it doesn't count.
    expect(stationLevel(STASH, EMPTY_HIDEOUT)).toBe(1)
    expect(stationLevel(STASH, { levels: { stash: 9 }, have: {} })).toBe(3)
    expect(stationLevel(LAVATORY, { levels: { lav: 2 }, have: {} })).toBe(2)
  })
})

describe('hideoutNeeds', () => {
  const stations = [STASH, LAVATORY, WORKBENCH]

  it('adds up what every level still to build needs, less what the player has', () => {
    const needs = hideoutNeeds(stations, { levels: { lav: 1 }, have: { bolts: 5, ledx: 3 } }, 'all')
    expect(needs.map((n) => [n.itemId, n.needed, n.have, n.missing, n.foundInRaid])).toEqual([
      [ROUBLES, 2_000_000, 0, 2_000_000, false],
      ['bolts', 18, 5, 13, false],
      ['screws', 6, 0, 6, false],
      ['ledx', 2, 3, 0, true]
    ])
    expect(needs.find((n) => n.itemId === 'bolts')!.uses).toEqual([
      { stationId: 'lav', stationName: 'Lavatory', level: 2, count: 6 },
      { stationId: 'lav', stationName: 'Lavatory', level: 3, count: 10 },
      { stationId: 'wb', stationName: 'Workbench', level: 1, count: 2 }
    ])
  })

  it('counts only each station’s next level when asked', () => {
    const needs = hideoutNeeds(stations, { levels: { lav: 1, wb: 2 }, have: {} }, 'next')
    expect(Object.fromEntries(needs.map((n) => [n.itemId, n.needed]))).toEqual({
      [ROUBLES]: 2_000_000,
      bolts: 6,
      screws: 6
    })
    expect(hideoutNeeds(stations, { levels: { stash: 3, lav: 3, wb: 2 }, have: {} }, 'all')).toEqual([])
  })
})

describe('rare items', () => {
  const item = (extra: Partial<LootItem>) => ({
    id: 'x',
    bannedOnFlea: false,
    types: [],
    offerCount: 50,
    fleaPrice: 30_000,
    ...extra
  })

  it('marks items that are hard to buy back', () => {
    expect(rareReason(item({ bannedOnFlea: true }))).toMatch(/can’t be bought on the flea/i)
    expect(rareReason(item({ types: ['noFlea'] }))).toMatch(/can’t be bought/i)
    expect(rareReason(item({ offerCount: 0 }))).toBe('No offers on the flea market right now')
    expect(rareReason(item({ offerCount: 1 }))).toBe('Only 1 offer on the flea market')
    expect(rareReason(item({ fleaPrice: 610_000 }))).toBe('₽610,000 to buy back on the flea market')
  })

  it('leaves out cheap, common items and money', () => {
    expect(rareReason(item({}))).toBeNull()
    // Few offers, but cheap: a trader sells it, or the next raid turns one up.
    expect(rareReason(item({ offerCount: 2, fleaPrice: 5_000 }))).toBeNull()
    expect(rareReason(item({ id: ROUBLES, bannedOnFlea: true }))).toBeNull()
  })

  it('lists what the hideout and active quests still need, with the rare ones marked', () => {
    const needs = hideoutNeeds([LAVATORY], { levels: { lav: 2 }, have: { bolts: 10 } }, 'all')
    const items = new Map<string, LootItem>([
      ['ledx', { ...item({ fleaPrice: 610_000 }), id: 'ledx' } as LootItem],
      ['salewa', { ...item({}), id: 'salewa' } as LootItem]
    ])
    const keep = keepList(
      needs,
      [
        { itemId: 'ledx', count: 1, foundInRaid: true, quests: [] },
        { itemId: 'salewa', count: 3, foundInRaid: true, quests: [] },
        { itemId: ROUBLES, count: 100, foundInRaid: false, quests: [] }
      ],
      items
    )
    expect(Object.fromEntries(keep)).toEqual({
      ledx: { hideout: 1, quests: 1, rare: '₽610,000 to buy back on the flea market' },
      salewa: { hideout: 0, quests: 3, rare: null }
    })
  })
})

describe('hideout progress', () => {
  it('keeps station levels and items put aside per game mode, and building uses them up', async () => {
    const file = join(await tempDir(), 'player.json')
    const store = createPlayerStore({ file })
    expect(await store.hideout('pvp')).toEqual(EMPTY_HIDEOUT)
    await store.setStationLevel('pvp', 'lav', 1)
    await store.setHave('pvp', 'bolts', 8)
    await store.setHave('pvp', 'screws', 6)
    await store.setHave('pvp', 'toilet', 0)
    await store.setHave('pve', 'bolts', 2)
    expect(await store.build('pvp', 'lav', 2, LAVATORY.levels[1].items)).toEqual({
      levels: { lav: 2 },
      have: { bolts: 2 }
    })
    // Saved, and each mode is its own.
    const reopened = createPlayerStore({ file })
    expect(await reopened.hideout('pvp')).toEqual({ levels: { lav: 2 }, have: { bolts: 2 } })
    expect(await reopened.hideout('pve')).toEqual({ levels: {}, have: { bolts: 2 } })
    expect(await reopened.hideout('season')).toEqual(EMPTY_HIDEOUT)
  })

  it('reads a player file from before the hideout tracker', async () => {
    const file = join(await tempDir(), 'player.json')
    await writeFile(
      file,
      JSON.stringify({ version: 1, progress: { pvp: {}, pve: {}, season: {} }, history: {} })
    )
    expect(await createPlayerStore({ file }).hideout('pve')).toEqual(EMPTY_HIDEOUT)
  })
})
