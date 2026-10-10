import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createQuestDataService, normalizeQuestData, withoutTutorial } from '../src/main/quests/questData'
import { jsonResponse, mockFetch, tempDir } from './helpers'
import { writeFile } from 'node:fs/promises'
import {
  BOLTS,
  CUSTOMS,
  KEY,
  LAVATORY,
  LEDX,
  PRAPOR,
  Q,
  RAW_QUEST_DATA,
  ROUBLES,
  SCREWDRIVER,
  STASH,
  STORY_ID,
  THERAPIST,
  WOODS,
  WORKBENCH
} from './questFixtures'

describe('normalizeQuestData', () => {
  const data = normalizeQuestData(RAW_QUEST_DATA, 'pvp', 42)
  const quest = (id: string) => data.quests.find((q) => q.id === id)!

  it('translates quests and keeps their requirements, map and flags', () => {
    expect(data.quests).toHaveLength(7)
    expect(quest(Q.shootout)).toMatchObject({
      name: 'Shootout Picnic',
      traderId: THERAPIST,
      minPlayerLevel: 10,
      map: WOODS,
      requires: [
        { questId: Q.checking, status: ['active', 'complete'] },
        { questId: Q.debut, status: ['complete'] }
      ]
    })
    expect(quest(Q.firstAid).requires).toEqual([{ questId: Q.debut, status: ['failed'] }])
    expect(quest(Q.kappaOnly)).toMatchObject({ kappaRequired: true, lightkeeperRequired: true })
    expect(quest(Q.usecOnly).faction).toBe('USEC')
  })

  it('keeps loyalty level and reputation requirements, and "reach loyalty level" objectives', () => {
    expect(quest(Q.aidStations).traderRequirements).toEqual([
      { traderId: THERAPIST, type: 'level', compareMethod: '>=', value: 2 },
      { traderId: PRAPOR, type: 'reputation', compareMethod: '<=', value: -1 }
    ])
    expect(quest(Q.debut).traderRequirements).toEqual([])
    expect(quest(Q.checking).objectives.map((o) => o.traderLevel)).toEqual([
      null,
      { traderId: THERAPIST, level: 2 },
      null
    ])
  })

  it('names the quests tarkov.dev leaves out, so ones in the logs can be shown', () => {
    expect(data.otherQuestNames).toEqual({ [STORY_ID]: 'Tour' })
  })

  it('keeps objectives with their items, quest items, zones and spawn locations', () => {
    // The weapons a kill is to be made with: any of them.
    expect(quest(Q.debut).objectives[0].weapons).toEqual([
      '54491c4f4bdc2db1078b4568',
      '56dee2bdd2720bc8328b4567'
    ])
    expect(quest(Q.debut).objectives[1]).toMatchObject({
      type: 'giveItem',
      description: 'Hand over 2 MP-133 shotguns',
      count: 2,
      items: ['5448be9a4bdc2dfd2f8b456a'],
      foundInRaid: true
    })
    const [find, , visit] = quest(Q.checking).objectives
    expect(find).toMatchObject({
      questItem: { id: '590c62a386f77412b0130255', name: 'Bronze pocket watch' },
      locations: [{ map: CUSTOMS, positions: [{ x: 10, y: 1, z: -20 }] }]
    })
    expect(visit).toMatchObject({ optional: true, maps: [CUSTOMS], playerLevel: null, questStatus: null })
    // What the app can check by itself: a level, and another quest's progress.
    expect(quest(Q.firstAid).objectives.map((o) => [o.playerLevel, o.questStatus])).toEqual([
      [15, null],
      [null, { questId: Q.checking, status: ['active', 'complete'] }]
    ])
    // The zone without a position is dropped.
    expect(visit.zones).toEqual([
      {
        map: CUSTOMS,
        position: { x: 100, y: 2, z: 50 },
        outline: [
          { x: 95, y: 2, z: 45 },
          { x: 105, y: 2, z: 45 },
          { x: 105, y: 2, z: 55 }
        ]
      }
    ])
  })

  it("keeps the keys each objective needs, and tarkov.dev's summary of them per map", () => {
    expect(quest(Q.checking).objectives.map((o) => o.requiredKeys)).toEqual([
      [[KEY.unknown], [KEY.dorm303, KEY.dorm303copy]],
      [],
      []
    ])
    expect(quest(Q.checking).neededKeys).toEqual([{ map: CUSTOMS, keyIds: [KEY.unknown, KEY.dorm303] }])
    expect(quest(Q.debut).neededKeys).toEqual([])
  })

  it('keeps the rewards, with skills, stations and unlocks named', () => {
    expect(quest(Q.checking).rewards).toEqual({
      items: [
        { itemId: ROUBLES, count: 80000 },
        { itemId: '5448be9a4bdc2dfd2f8b456a', count: 2 }
      ],
      traderStanding: [{ traderId: PRAPOR, standing: 0.1 }],
      offerUnlocks: [{ traderId: THERAPIST, level: 2, itemId: '5c0e530286f7747fa1419862' }],
      craftUnlocks: [
        { station: 'Workbench', level: 1, itemId: '5f0596629e22f464da6bbdd9', count: 60 },
        { station: 'Hideout', level: 3, itemId: '5e023d34e8a400319a28ed44', count: 30 }
      ],
      skills: [
        { name: 'Stress resistance', level: 2 },
        { name: 'Troubleshooting', level: 1 }
      ],
      traderUnlocks: ['6617beeaa9cfa777ca915b7c'],
      other: ['Jack of All Trades', 'An achievement', 'Golden target mark', 'Customisation: floor']
    })
    expect(quest(Q.checking).startRewards).toMatchObject({
      items: [{ itemId: ROUBLES, count: 20000 }],
      traderStanding: [],
      skills: []
    })
    expect(quest(Q.debut).rewards).toEqual({
      items: [],
      traderStanding: [],
      offerUnlocks: [],
      craftUnlocks: [],
      skills: [],
      traderUnlocks: [],
      other: []
    })
  })

  it("keeps the quest's and the traders' pictures", () => {
    expect(quest(Q.checking).imageLink).toBe(`https://assets.tarkov.dev/${Q.checking}.webp`)
    expect(quest(Q.debut).imageLink).toBeNull()
    expect(data.traders.map((t) => t.imageLink)).toEqual([`https://assets.tarkov.dev/${PRAPOR}.webp`, null])
  })

  it('keeps the hideout stations and what each level takes to build', () => {
    expect(data.stations.map((s) => [s.name, s.levels.map((l) => l.level)])).toEqual([
      ['Nutrition unit', []],
      ['Stash', [1, 2]],
      ['Workbench', [1, 2]]
    ])
    const workbench = data.stations.find((s) => s.id === WORKBENCH)!
    expect(workbench).toMatchObject({
      normalizedName: 'workbench',
      imageLink: 'https://assets.tarkov.dev/station-workbench.png'
    })
    expect(workbench.levels[1]).toEqual({
      level: 2,
      constructionTime: 7200,
      items: [
        { itemId: BOLTS, count: 3, foundInRaid: false },
        { itemId: LEDX, count: 1, foundInRaid: true }
      ],
      // The station's own previous level is implied.
      stations: [{ stationId: LAVATORY, level: 1 }],
      traders: [{ traderId: PRAPOR, level: 2 }],
      skills: [{ name: 'Hideout Management', level: 2 }]
    })
    expect(data.stations.find((s) => s.id === STASH)!.levels[1].items).toEqual([
      { itemId: ROUBLES, count: 2000000, foundInRaid: false }
    ])
  })

  it('keeps traders’ barter trades: what each takes and gives, its loyalty level and quest', () => {
    expect(data.barters).toEqual([
      {
        id: 'barter-ledx',
        traderId: THERAPIST,
        level: 3,
        questId: Q.checking,
        inputs: [
          { itemId: BOLTS, count: 10 },
          { itemId: SCREWDRIVER, count: 2 }
        ],
        outputs: [{ itemId: LEDX, count: 1 }]
      },
      {
        id: 'barter-bolts',
        traderId: PRAPOR,
        level: 1,
        questId: null,
        inputs: [{ itemId: ROUBLES, count: 155.5 }],
        outputs: [{ itemId: BOLTS, count: 2 }]
      }
    ])
  })

  it('keeps what the hideout makes: what each craft uses up, its tools, product and quest', () => {
    expect(data.crafts).toEqual([
      {
        id: 'craft-ledx',
        stationId: WORKBENCH,
        level: 2,
        duration: 7200,
        inputs: [
          { itemId: BOLTS, count: 4 },
          { itemId: ROUBLES, count: 5000 }
        ],
        tools: [SCREWDRIVER],
        outputs: [{ itemId: LEDX, count: 1 }],
        questId: Q.checking
      },
      {
        id: 'craft-bolts',
        stationId: WORKBENCH,
        level: 1,
        duration: 1800,
        // A working item it takes is used up.
        inputs: [{ itemId: SCREWDRIVER, count: 1 }],
        tools: [],
        outputs: [{ itemId: BOLTS, count: 3 }],
        questId: null
      }
    ])
  })

  it('keeps only what the maps view draws: extracts, player spawns, transits, bosses and snipers', () => {
    const customs = data.maps.find((m) => m.id === CUSTOMS)!
    expect(customs).toEqual({
      id: CUSTOMS,
      name: 'Customs',
      normalizedName: 'customs',
      nameId: 'bigmap',
      extracts: [
        {
          name: 'ZB-1011',
          faction: 'pmc',
          position: { x: -17.5, y: 2, z: -61.3 },
          outline: [{ x: -13.9, y: 0.2, z: -66.6 }],
          transferItem: null
        },
        {
          name: 'Dorms V-Ex',
          faction: 'pmc',
          position: { x: 181, y: -0.7, z: 213 },
          outline: [],
          transferItem: { itemId: '5449016a4bdc2d6f028b456f', count: 20000 }
        }
      ],
      spawns: [{ position: { x: 1, y: 0, z: 2 }, sides: ['pmc'] }],
      transits: [{ name: 'Transit to Woods', position: { x: 5, y: 0, z: 6 } }],
      // One point per clump (the middle of the two Dorms points); bosses by zone, named from the
      // translations, else from their slug.
      bossSpawns: [
        {
          position: { x: 175.5, y: 2, z: 145 },
          zone: 'ZoneDormitory',
          bosses: [
            { name: 'Reshala', chance: 0.6, here: 0.33 },
            { name: 'Cultist priest', chance: 0.2, here: 1 }
          ]
        },
        { position: { x: 24, y: 3, z: -90 }, zone: 'ZoneCustoms', bosses: [] }
      ],
      snipers: [{ x: 195, y: 2, z: -171 }],
      // Locks with a key and a position; loose loot spots where a key (from a lock, a quest or a map's
      // entry) can spawn, with how many items can spawn there in all.
      locks: [
        { keyId: KEY.dorm303, kind: 'door', position: { x: 180, y: 6, z: 140 } },
        { keyId: KEY.cabin, kind: 'trunk', position: { x: -20, y: 1, z: 30 } }
      ],
      keySpawns: [
        { position: { x: 170, y: 6, z: 141 }, keyIds: [KEY.dorm303], items: 1 },
        { position: { x: 10, y: 1, z: 10 }, keyIds: [KEY.cabin, KEY.unknown], items: 3 }
      ],
      access: { minPlayerLevel: null, maxPlayerLevel: null, keyIds: [] },
      // Every loose loot spot, with each item's spots; containers by template id.
      looseLoot: {
        spots: [
          [170, 6, 141],
          [10, 1, 10],
          [11, 1, 11]
        ],
        items: {
          [KEY.dorm303]: [0],
          '5449016a4bdc2d6f028b456f': [1, 2],
          [KEY.cabin]: [1],
          [KEY.unknown]: [1]
        }
      },
      containers: {
        '578f87a3245977356274f2cb': [
          [5, 1, -5.1],
          [7, 2, 8]
        ],
        '5909d50c86f774659e6aaebe': [[1, 1, 1]]
      }
    })
    expect(data.maps.find((m) => m.id === WOODS)).toMatchObject({
      locks: [],
      keySpawns: [],
      looseLoot: { spots: [], items: {} },
      containers: {},
      access: { minPlayerLevel: null, maxPlayerLevel: 20, keyIds: [KEY.labs] }
    })
    expect(data.traders).toEqual([
      {
        id: PRAPOR,
        name: 'Prapor',
        levels: [
          { level: 1, playerLevel: 0 },
          { level: 2, playerLevel: 6 }
        ],
        imageLink: `https://assets.tarkov.dev/${PRAPOR}.webp`
      },
      {
        id: THERAPIST,
        name: 'Therapist',
        levels: [
          { level: 1, playerLevel: 0 },
          { level: 2, playerLevel: 5 }
        ],
        imageLink: null
      }
    ])
  })
})

describe('createQuestDataService', () => {
  const files: Record<string, unknown> = {
    tasks: RAW_QUEST_DATA.tasks,
    tasks_en: RAW_QUEST_DATA.tasksLang,
    maps: RAW_QUEST_DATA.maps,
    maps_en: RAW_QUEST_DATA.mapsLang,
    traders: RAW_QUEST_DATA.traders,
    traders_en: RAW_QUEST_DATA.tradersLang,
    hideout: RAW_QUEST_DATA.hideout,
    hideout_en: RAW_QUEST_DATA.hideoutLang,
    crafts: RAW_QUEST_DATA.crafts,
    barters: RAW_QUEST_DATA.barters
  }
  const serve = (fail = false) =>
    mockFetch({
      tarkovDevJson: (url) =>
        fail ? jsonResponse({}, 503) : jsonResponse({ data: files[url.split('/').pop()!] })
    })

  it('fetches, caches, and serves the cache when offline', async () => {
    const cacheDir = await tempDir()
    let clock = 1_000
    const online = createQuestDataService({ fetchFn: serve(), cacheDir, now: () => clock })
    const first = await online.get('pve')
    expect(first).toMatchObject({
      fromCache: false,
      error: null,
      dataset: { dataMode: 'pve', fetchedAt: 1_000 }
    })
    expect(first.dataset!.quests).toHaveLength(7)

    // A new session offline, a day later: the cached data, with the error.
    clock += 24 * 3_600_000
    const offline = createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => clock })
    const second = await offline.get('pve')
    expect(second).toMatchObject({ fromCache: true, dataset: { fetchedAt: 1_000 } })
    expect(second.error).toMatch(/503/)
    expect(offline.peek('pve')).toBe(second)
  })

  it('upgrades a cache from before 1.5.0 and refetches it straight away', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 8, 30)
    const old = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000) as unknown as Record<string, unknown>
    delete old.otherQuestNames
    old.quests = (old.quests as Record<string, unknown>[]).map(({ traderRequirements: _, ...q }) => ({
      ...q,
      objectives: (q.objectives as Record<string, unknown>[]).map(({ traderLevel: __, ...o }) => o)
    }))
    old.traders = [{ id: PRAPOR, name: 'Prapor' }]
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify(old))

    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => 2_000 }).get(
      'pvp'
    )
    expect(offline.fromCache).toBe(true)
    expect(offline.dataset).toMatchObject({ fetchedAt: 0, otherQuestNames: {}, traders: [{ levels: [] }] })
    expect(offline.dataset!.quests.every((q) => Array.isArray(q.traderRequirements))).toBe(true)
    expect(offline.dataset!.quests[0].objectives[0].traderLevel).toBeNull()

    const online = await createQuestDataService({ fetchFn: serve(), cacheDir, now: () => now }).get('pvp')
    expect(online).toMatchObject({ fromCache: false, dataset: { fetchedAt: now } })
    expect(online.dataset!.otherQuestNames).toEqual({ [STORY_ID]: 'Tour' })
  })

  it('upgrades a 1.5 cache without bosses, snipers or extract costs, and refetches it', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 9, 1)
    const old = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000)
    const maps = old.maps.map(({ bossSpawns: _, snipers: __, ...m }) => ({
      ...m,
      extracts: m.extracts.map(({ transferItem: ___, ...e }) => e)
    }))
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify({ ...old, maps }))

    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => now }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0 } })
    const customs = offline.dataset!.maps.find((m) => m.id === CUSTOMS)!
    expect(customs).toMatchObject({ bossSpawns: [], snipers: [] })
    expect(customs.extracts.every((e) => e.transferItem === null)).toBe(true)
  })

  it('upgrades a 1.16 cache without locks, key spawns or map access, and refetches it', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 9, 5)
    const old = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000)
    const maps = old.maps.map(({ locks: _, keySpawns: __, access: ___, ...m }) => m)
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify({ ...old, maps }))
    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => now }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0 } })
    expect(offline.dataset!.maps[0]).toMatchObject({
      locks: [],
      keySpawns: [],
      access: { minPlayerLevel: null, maxPlayerLevel: null, keyIds: [] }
    })
  })

  it('upgrades a 1.27 cache without loose loot or loot containers, and refetches it', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 9, 8)
    const old = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000)
    const maps = old.maps.map(({ looseLoot: _, containers: __, ...m }) => m)
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify({ ...old, maps }))
    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => now }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0 } })
    expect(offline.dataset!.maps[0]).toMatchObject({ looseLoot: { spots: [], items: {} }, containers: {} })
  })

  it('upgrades a 1.36 cache without the quests only the wiki has, and refetches it', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 9, 9)
    const { wikiOnlyQuests: _, ...old } = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000)
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify(old))
    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => now }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0, wikiOnlyQuests: [] } })
  })

  it('reuses fresh data and shares one request between callers', async () => {
    const fetchFn = serve()
    const service = createQuestDataService({ fetchFn, cacheDir: join(await tempDir(), 'c'), now: () => 5 })
    await Promise.all([service.get('pvp'), service.get('pvp')])
    await service.get('pvp')
    // Ten tarkov.dev files, the wiki's list of story chapters, one batch of quest pages and its list
    // of quests (for the ones only it has).
    expect(fetchFn).toHaveBeenCalledTimes(13)
    await service.get('pvp', true)
    expect(fetchFn).toHaveBeenCalledTimes(26)
  })

  it('keeps the story chapters it had when the wiki can’t be reached', async () => {
    const cacheDir = await tempDir()
    const chapter = {
      id: 'story-tour',
      name: 'Tour',
      wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Tour',
      description: '',
      howItStarts: '',
      imageLink: null,
      objectives: [
        {
          id: 'escape-ground-zero',
          text: 'Escape Ground Zero',
          optional: false,
          depth: 0,
          count: null,
          itemNames: [],
          handOver: false,
          foundInRaid: false,
          branch: null,
          maps: [CUSTOMS],
          guide: null,
          visits: false,
          loyalty: null
        }
      ]
    }
    const cached = { ...normalizeQuestData(RAW_QUEST_DATA, 'pvp', 0), storyChapters: [chapter] }
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify(cached))
    const state = await createQuestDataService({ fetchFn: serve(), cacheDir, now: () => 1e12 }).get('pvp')
    expect(state.error).toBeNull()
    expect(state.dataset!.fetchedAt).toBe(1e12)
    expect(state.dataset!.storyChapters).toEqual([chapter])
  })

  it('upgrades a 1.11 cache without objective checks or story maps, and refetches it', async () => {
    const cacheDir = await tempDir()
    const fresh = normalizeQuestData(RAW_QUEST_DATA, 'pvp', 1e12 - 60_000)
    const old = {
      ...fresh,
      quests: fresh.quests.map((q) => ({
        ...q,
        objectives: q.objectives.map(({ playerLevel: _, questStatus: __, ...o }) => o)
      })),
      storyChapters: [
        {
          id: 'story-tour',
          name: 'Tour',
          wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Tour',
          description: '',
          howItStarts: '',
          imageLink: null,
          objectives: [{ id: 'step', text: 'Step', optional: false, depth: 0, count: null }]
        }
      ]
    }
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify(old))
    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => 1e12 }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0 } })
    expect(offline.dataset!.quests[0].objectives[0]).toMatchObject({ playerLevel: null, questStatus: null })
    expect(offline.dataset!.storyChapters[0].objectives[0]).toMatchObject({
      maps: [],
      guide: null,
      visits: false,
      loyalty: null
    })
  })

  it('does without hideout station names when that file fails', async () => {
    const fetchFn = mockFetch({
      tarkovDevJson: (url) => {
        const file = url.split('/').pop()!
        return file.startsWith('hideout') ? jsonResponse({}, 503) : jsonResponse({ data: files[file] })
      }
    })
    const state = await createQuestDataService({ fetchFn, cacheDir: await tempDir(), now: () => 5 }).get(
      'pvp'
    )
    expect(state.error).toBeNull()
    const checking = state.dataset!.quests.find((q) => q.id === Q.checking)!
    expect(checking.rewards.craftUnlocks.map((c) => c.station)).toEqual(['Hideout', 'Hideout'])
  })

  it('upgrades a 1.7 cache without the hideout, and refetches it', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 9, 1)
    const { stations: _, ...old } = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000)
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify(old))
    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => now }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0, stations: [] } })
  })

  it('upgrades a 1.20 cache without crafts, and refetches it', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 9, 1)
    const { crafts: _, ...old } = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000)
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify(old))
    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => now }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0, crafts: [] } })
    expect(offline.dataset!.stations.length).toBeGreaterThan(0)
  })

  it('upgrades a 1.26 cache without barters, and refetches it', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 9, 8)
    const { barters: _, ...old } = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000)
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify(old))
    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => now }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0, barters: [] } })
  })

  it('upgrades a 1.6 cache without keys, rewards or pictures, and refetches it', async () => {
    const cacheDir = await tempDir()
    const now = Date.UTC(2026, 9, 1)
    const old = normalizeQuestData(RAW_QUEST_DATA, 'pvp', now - 60_000)
    const quests = old.quests.map(
      ({ neededKeys: _, rewards: __, startRewards: ___, imageLink: ____, ...q }) => ({
        ...q,
        objectives: q.objectives.map(({ requiredKeys: _____, ...o }) => o)
      })
    )
    const traders = old.traders.map(({ imageLink: _, ...t }) => t)
    await writeFile(join(cacheDir, 'quests-pvp.json'), JSON.stringify({ ...old, quests, traders }))

    const offline = await createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => now }).get(
      'pvp'
    )
    expect(offline).toMatchObject({ fromCache: true, dataset: { fetchedAt: 0 } })
    const checking = offline.dataset!.quests.find((q) => q.id === Q.checking)!
    expect(checking).toMatchObject({ neededKeys: [], imageLink: null, rewards: { items: [], skills: [] } })
    expect(checking.startRewards.items).toEqual([])
    expect(checking.objectives.every((o) => Array.isArray(o.requiredKeys))).toBe(true)
    expect(checking.objectives.every((o) => Array.isArray(o.weapons))).toBe(true)
    expect(offline.dataset!.traders.every((t) => t.imageLink === null)).toBe(true)
  })
})

describe('withoutTutorial', () => {
  it('drops the Ground Zero tutorial map and every mention of it, objectives on it alone too', () => {
    const data = normalizeQuestData(RAW_QUEST_DATA, 'pvp', 42)
    const TUTORIAL = '68236e8153654e8c1200798a'
    const base = data.quests[0]
    const objective = base.objectives[0]
    const zone = { id: 'z', map: TUTORIAL, position: { x: 0, y: 0, z: 0 }, outline: [] }
    const withTutorial = {
      ...data,
      maps: [
        ...data.maps,
        {
          ...data.maps[0],
          id: TUTORIAL,
          name: 'Ground Zero Tutorial',
          normalizedName: 'ground-zero-tutorial',
          nameId: 'Sandbox_start'
        }
      ],
      quests: [
        {
          ...base,
          map: TUTORIAL,
          neededKeys: [
            { map: TUTORIAL, keyIds: ['k'] },
            { map: CUSTOMS, keyIds: ['k2'] }
          ],
          objectives: [
            { ...objective, id: 'alone', maps: [TUTORIAL], zones: [zone], locations: [] },
            {
              ...objective,
              id: 'shared',
              maps: [TUTORIAL, CUSTOMS],
              zones: [zone],
              locations: [{ map: TUTORIAL, positions: [] }]
            },
            { ...objective, id: 'anywhere', maps: [], zones: [], locations: [] }
          ]
        },
        ...data.quests.slice(1)
      ]
    }
    const result = withoutTutorial(withTutorial)
    expect(result.maps.map((m) => m.id)).toEqual(data.maps.map((m) => m.id))
    const quest = result.quests[0]
    expect(quest.map).toBeNull()
    expect(quest.neededKeys).toEqual([{ map: CUSTOMS, keyIds: ['k2'] }])
    expect(quest.objectives.map((o) => [o.id, o.maps, o.zones.length, o.locations.length])).toEqual([
      ['shared', [CUSTOMS], 0, 0],
      ['anywhere', [], 0, 0]
    ])
    expect(result.quests.slice(1)).toEqual(data.quests.slice(1))
    // Data without it is left as it is.
    expect(withoutTutorial(data)).toBe(data)
  })
})
