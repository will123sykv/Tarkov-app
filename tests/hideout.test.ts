import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buyOptions,
  EMPTY_HIDEOUT,
  hideoutNeeds,
  keepList,
  scarcity,
  startingLevel,
  stationLevel,
  type BuyContext,
  upgradeStatus
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
    expect(stationLevel(STASH, { levels: { stash: 9 }, have: {}, traders: {} })).toBe(3)
    expect(stationLevel(LAVATORY, { levels: { lav: 2 }, have: {}, traders: {} })).toBe(2)
  })
})

describe('hideoutNeeds', () => {
  const stations = [STASH, LAVATORY, WORKBENCH]

  it('adds up what every level still to build needs, less what the player has', () => {
    const needs = hideoutNeeds(
      stations,
      { levels: { lav: 1 }, have: { bolts: 5, ledx: 3 }, traders: {} },
      'all'
    )
    expect(needs.map((n) => [n.itemId, n.needed, n.firNeeded, n.have, n.missing, n.foundInRaid])).toEqual([
      [ROUBLES, 2_000_000, 0, 0, 2_000_000, false],
      ['bolts', 18, 0, 5, 13, false],
      ['screws', 6, 0, 0, 6, false],
      // The Lavatory wants its LEDX found in raid, the Workbench takes any.
      ['ledx', 2, 1, 3, 0, true]
    ])
    expect(needs.find((n) => n.itemId === 'bolts')!.uses).toEqual([
      { stationId: 'lav', stationName: 'Lavatory', level: 2, count: 6, foundInRaid: false },
      { stationId: 'lav', stationName: 'Lavatory', level: 3, count: 10, foundInRaid: false },
      { stationId: 'wb', stationName: 'Workbench', level: 1, count: 2, foundInRaid: false }
    ])
    expect(needs.find((n) => n.itemId === 'ledx')!.uses.map((u) => [u.stationName, u.foundInRaid])).toEqual([
      ['Lavatory', true],
      ['Workbench', false]
    ])
  })

  it('counts only each station’s next level when asked', () => {
    const needs = hideoutNeeds(stations, { levels: { lav: 1, wb: 2 }, have: {}, traders: {} }, 'next')
    expect(Object.fromEntries(needs.map((n) => [n.itemId, n.needed]))).toEqual({
      [ROUBLES]: 2_000_000,
      bolts: 6,
      screws: 6
    })
    expect(
      hideoutNeeds(stations, { levels: { stash: 3, lav: 3, wb: 2 }, have: {}, traders: {} }, 'all')
    ).toEqual([])
  })
})

describe('what the player can buy, and rare items', () => {
  const item = (extra: Partial<LootItem>): LootItem => ({
    id: 'x',
    name: 'X',
    shortName: 'X',
    iconLink: null,
    wikiLink: null,
    width: 1,
    height: 1,
    slots: 1,
    types: [],
    category: null,
    bannedOnFlea: false,
    minLevelForFlea: null,
    fleaPrice: 30_000,
    fleaFee: null,
    bestTrader: null,
    offerCount: 50,
    buyFrom: [],
    ...extra
  })
  const MECHANIC = 'mech'
  const ctx = (extra: Partial<BuyContext> = {}): BuyContext => ({
    playerLevel: 30,
    fleaMinLevel: 15,
    traderLevels: {},
    completedQuests: new Set(),
    questNames: new Map([['gunsmith', 'Gunsmith - Part 2']]),
    ...extra
  })
  const sold = (level: number, price: number, questId: string | null = null) =>
    item({ buyFrom: [{ traderId: MECHANIC, trader: 'Mechanic', level, price, questId }] })

  it('offers the flea once the player and the item have unlocked it', () => {
    expect(buyOptions(item({}), ctx())).toEqual({
      options: [{ source: 'flea', label: 'Flea', price: 30_000 }],
      locked: []
    })
    expect(buyOptions(item({}), ctx({ playerLevel: 10 }))).toEqual({
      options: [],
      locked: ['flea at level 15']
    })
    expect(buyOptions(item({ minLevelForFlea: 40 }), ctx()).locked).toEqual(['flea at level 40'])
    expect(buyOptions(item({ bannedOnFlea: true }), ctx())).toEqual({ options: [], locked: [] })
  })

  it('offers traders at the player’s loyalty level, after the quest that unlocks them, cheapest first', () => {
    expect(buyOptions(sold(2, 25_000), ctx()).locked).toEqual(['Mechanic LL2'])
    expect(buyOptions(sold(2, 25_000), ctx({ traderLevels: { [MECHANIC]: 2 } })).options).toEqual([
      { source: 'trader', label: 'Mechanic LL2', price: 25_000 },
      { source: 'flea', label: 'Flea', price: 30_000 }
    ])
    const questLocked = sold(1, 25_000, 'gunsmith')
    expect(buyOptions(questLocked, ctx()).locked).toEqual(['Mechanic LL1 after Gunsmith - Part 2'])
    expect(buyOptions(questLocked, ctx({ completedQuests: new Set(['gunsmith']) })).options[0].label).toBe(
      'Mechanic LL1'
    )
  })

  it('marks items that are hard to get even with everything unlocked as rare', () => {
    const rare = (reason: string) => ({ kind: 'rare', reason })
    expect(scarcity(item({ bannedOnFlea: true }), ctx())).toEqual(rare('Can’t be bought on the flea market'))
    expect(scarcity(item({ offerCount: 0 }), ctx())).toEqual(rare('No offers on the flea market right now'))
    expect(scarcity(item({ offerCount: 1 }), ctx())).toEqual(rare('Only 1 offer on the flea market'))
    expect(scarcity(item({ fleaPrice: 610_000 }), ctx())).toEqual(
      rare('₽610,000 to buy back on the flea market')
    )
    // Still rare below the flea's level: it'd be hard to get anyway.
    expect(scarcity(item({ fleaPrice: 610_000 }), ctx({ playerLevel: 5 }))?.kind).toBe('rare')
  })

  it('marks what the player can’t buy yet, and says what would unlock it', () => {
    expect(scarcity(item({}), ctx({ playerLevel: 10 }))).toEqual({
      kind: 'locked',
      reason: 'You can’t buy it yet (flea at level 15)'
    })
    // Flea-banned, but Mechanic sells it at a loyalty level the player hasn't reached.
    expect(scarcity(item({ ...sold(3, 9_000), bannedOnFlea: true }), ctx())).toEqual({
      kind: 'locked',
      reason: 'You can’t buy it yet (Mechanic LL3)'
    })
  })

  it('says when a trader will sell what’s scarce on the flea, once the player gets there', () => {
    const camera = { ...sold(1, 62_000, 'gunsmith'), offerCount: 3, fleaPrice: 68_888 }
    expect(scarcity(camera, ctx())).toEqual({
      kind: 'locked',
      reason:
        'Only 3 offers on the flea market; a trader sells it once you reach Mechanic LL1 after Gunsmith - Part 2'
    })
    expect(scarcity(camera, ctx({ completedQuests: new Set(['gunsmith']) }))).toBeNull()
  })

  it('leaves out items a trader sells the player, cheap and common ones, and money', () => {
    expect(scarcity(item({}), ctx())).toBeNull()
    // Few offers, but cheap: a trader sells it, or the next raid turns one up.
    expect(scarcity(item({ offerCount: 2, fleaPrice: 5_000 }), ctx())).toBeNull()
    expect(scarcity(item({ id: ROUBLES, bannedOnFlea: true }), ctx())).toBeNull()
    // Below the flea's level, but Mechanic sells it at the player's loyalty; and an expensive one.
    expect(scarcity(sold(1, 9_000), ctx({ playerLevel: 5 }))).toBeNull()
    expect(scarcity({ ...sold(1, 120_000), fleaPrice: 610_000 }, ctx())).toBeNull()
  })

  it('lists what the hideout and active quests still need, with the scarce ones marked', () => {
    const needs = hideoutNeeds([LAVATORY], { levels: { lav: 2 }, have: { bolts: 10 }, traders: {} }, 'all')
    const items = new Map<string, LootItem>([
      ['ledx', { ...item({ fleaPrice: 610_000 }), id: 'ledx' }],
      ['salewa', { ...item({}), id: 'salewa' }]
    ])
    const quests = [
      { itemId: 'ledx', count: 1, foundInRaid: true, quests: [] },
      { itemId: 'salewa', count: 3, foundInRaid: true, quests: [] },
      { itemId: ROUBLES, count: 100, foundInRaid: false, quests: [] }
    ]
    expect(Object.fromEntries(keepList(needs, quests, items, ctx()))).toEqual({
      ledx: {
        hideout: 1,
        quests: 1,
        scarce: { kind: 'rare', reason: '₽610,000 to buy back on the flea market' }
      },
      salewa: { hideout: 0, quests: 3, scarce: null }
    })
    // Before the flea opens, the common one can't be bought yet either.
    expect(keepList(needs, quests, items, ctx({ playerLevel: 5 })).get('salewa')?.scarce).toEqual({
      kind: 'locked',
      reason: 'You can’t buy it yet (flea at level 15)'
    })
  })
})

describe('upgradeStatus', () => {
  const DOLLARS = '5696686a4bdc2da3298b456a'
  const MECH = 'mech'
  const base = (id: string, extra: Partial<LootItem> = {}): LootItem => ({
    id,
    name: id,
    shortName: id,
    iconLink: null,
    wikiLink: null,
    width: 1,
    height: 1,
    slots: 1,
    types: [],
    category: null,
    bannedOnFlea: false,
    minLevelForFlea: null,
    fleaPrice: 10_000,
    fleaFee: null,
    bestTrader: null,
    offerCount: 50,
    buyFrom: [],
    ...extra
  })
  const items = new Map<string, LootItem>([
    ['bolts', base('bolts', { fleaPrice: 24_000 })],
    ['screws', base('screws', { fleaPrice: 9_000 })],
    ['ledx', base('ledx', { bannedOnFlea: true })],
    [
      'drill',
      base('drill', {
        fleaPrice: 60_000,
        buyFrom: [{ traderId: MECH, trader: 'Mechanic', level: 1, price: 40_000, questId: null }]
      })
    ],
    [
      DOLLARS,
      base(DOLLARS, {
        bannedOnFlea: true,
        buyFrom: [{ traderId: 'pk', trader: 'Peacekeeper', level: 1, price: 169, questId: null }]
      })
    ]
  ])
  const ctx = (extra: Partial<BuyContext> = {}): BuyContext => ({
    playerLevel: 20,
    fleaMinLevel: 15,
    traderLevels: {},
    completedQuests: new Set(),
    ...extra
  })
  const GEN = station('gen', 'Generator', [level(1, []), level(2, [])])
  const stations = new Map([['gen', GEN]])
  const progress = (have: Record<string, number>, levels: Record<string, number> = { gen: 2 }) => ({
    levels,
    have,
    traders: {}
  })
  const target = level(
    2,
    [
      ['bolts', 6],
      ['screws', 4],
      ['drill', 1],
      [ROUBLES, 50_000],
      [DOLLARS, 100]
    ],
    { stations: [{ stationId: 'gen', level: 2 }], traders: [{ traderId: MECH, level: 2 }] }
  )

  it('is ready with everything in hand and every requirement met', () => {
    const status = upgradeStatus(
      target,
      progress({ bolts: 6, screws: 9, drill: 1 }),
      ctx({ traderLevels: { [MECH]: 2 } }),
      items,
      stations
    )
    expect(status).toMatchObject({
      state: 'ready',
      partsCost: 0,
      unbuyable: 0,
      moneyCost: 50_000 + 100 * 169
    })
  })

  it('prices the missing parts at the cheapest place the player can buy them', () => {
    const status = upgradeStatus(
      target,
      progress({ bolts: 2 }),
      ctx({ traderLevels: { [MECH]: 2 } }),
      items,
      stations
    )
    expect(status.state).toBe('buyable')
    // 4 bolts and 4 screws on the flea, the drill from Mechanic (cheaper than the flea).
    expect(status.partsCost).toBe(4 * 24_000 + 4 * 9_000 + 40_000)
    expect(status.parts.map((p) => [p.itemId, p.missing, p.best?.label])).toEqual([
      ['bolts', 4, 'Flea'],
      ['screws', 4, 'Flea'],
      ['drill', 1, 'Mechanic LL1']
    ])
    expect(status.money).toEqual([
      { itemId: ROUBLES, count: 50_000 },
      { itemId: DOLLARS, count: 100 }
    ])
    expect(status.moneyCost).toBe(66_900)
  })

  it('says which station and trader levels are still missing', () => {
    const status = upgradeStatus(target, progress({}, { gen: 1 }), ctx(), items, stations)
    expect(status).toMatchObject({
      state: 'blocked',
      unmetStations: [{ stationId: 'gen', level: 2 }],
      unmetTraders: [{ traderId: MECH, level: 2 }]
    })
  })

  it('is short when something missing can’t be bought, and prices the rest', () => {
    const withLedx = level(3, [
      ['ledx', 1],
      ['screws', 2]
    ])
    const status = upgradeStatus(withLedx, progress({}), ctx(), items, stations)
    expect(status).toMatchObject({ state: 'short', unbuyable: 1, partsCost: 18_000 })
    // Below the flea's level, only trader offers count.
    expect(
      upgradeStatus(
        target,
        progress({}),
        ctx({ playerLevel: 5, traderLevels: { [MECH]: 2 } }),
        items,
        stations
      )
    ).toMatchObject({
      state: 'short',
      unbuyable: 2,
      partsCost: 40_000
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
    await store.setTraderLevel('pvp', 'mechanic', 3)
    await store.setTraderLevel('pvp', 'skier', 9)
    expect(await store.build('pvp', 'lav', 2, LAVATORY.levels[1].items)).toEqual({
      levels: { lav: 2 },
      have: { bolts: 2 },
      traders: { mechanic: 3, skier: 4 }
    })
    // Saved, and each mode is its own.
    const reopened = createPlayerStore({ file })
    expect(await reopened.hideout('pvp')).toEqual({
      levels: { lav: 2 },
      have: { bolts: 2 },
      traders: { mechanic: 3, skier: 4 }
    })
    expect(await reopened.hideout('pve')).toEqual({ levels: {}, have: { bolts: 2 }, traders: {} })
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

  it('reads a 1.8.0 hideout without trader levels', async () => {
    const file = join(await tempDir(), 'player.json')
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        progress: {},
        history: {},
        hideout: { pvp: { levels: { lav: 1 }, have: {} } }
      })
    )
    expect(await createPlayerStore({ file }).hideout('pvp')).toEqual({
      levels: { lav: 1 },
      have: {},
      traders: {}
    })
  })
})
