import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createQuestDataService, normalizeQuestData } from '../src/main/quests/questData'
import { jsonResponse, mockFetch, tempDir } from './helpers'
import { CUSTOMS, PRAPOR, Q, RAW_QUEST_DATA, THERAPIST, WOODS } from './questFixtures'

describe('normalizeQuestData', () => {
  const data = normalizeQuestData(RAW_QUEST_DATA, 'pvp', 42)
  const quest = (id: string) => data.quests.find((q) => q.id === id)!

  it('translates quests and keeps their requirements, map and flags', () => {
    expect(data.quests).toHaveLength(6)
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

  it('keeps objectives with their items, quest items, zones and spawn locations', () => {
    expect(quest(Q.debut).objectives[1]).toMatchObject({
      type: 'giveItem',
      description: 'Hand over 2 MP-133 shotguns',
      count: 2,
      items: ['5448be9a4bdc2dfd2f8b456a'],
      foundInRaid: true
    })
    const [find, visit] = quest(Q.checking).objectives
    expect(find).toMatchObject({
      questItem: { id: '590c62a386f77412b0130255', name: 'Bronze pocket watch' },
      locations: [{ map: CUSTOMS, positions: [{ x: 10, y: 1, z: -20 }] }]
    })
    expect(visit).toMatchObject({ optional: true, maps: [CUSTOMS] })
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

  it('keeps only what the maps view draws: extracts, player spawns and transits', () => {
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
          outline: [{ x: -13.9, y: 0.2, z: -66.6 }]
        }
      ],
      spawns: [{ position: { x: 1, y: 0, z: 2 }, sides: ['pmc'] }],
      transits: [{ name: 'Transit to Woods', position: { x: 5, y: 0, z: 6 } }]
    })
    expect(data.traders).toEqual([
      { id: PRAPOR, name: 'Prapor' },
      { id: THERAPIST, name: 'Therapist' }
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
    traders_en: RAW_QUEST_DATA.tradersLang
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
    expect(first.dataset!.quests).toHaveLength(6)

    // A new session offline, a day later: the cached data, with the error.
    clock += 24 * 3_600_000
    const offline = createQuestDataService({ fetchFn: serve(true), cacheDir, now: () => clock })
    const second = await offline.get('pve')
    expect(second).toMatchObject({ fromCache: true, dataset: { fetchedAt: 1_000 } })
    expect(second.error).toMatch(/503/)
    expect(offline.peek('pve')).toBe(second)
  })

  it('reuses fresh data and shares one request between callers', async () => {
    const fetchFn = serve()
    const service = createQuestDataService({ fetchFn, cacheDir: join(await tempDir(), 'c'), now: () => 5 })
    await Promise.all([service.get('pvp'), service.get('pvp')])
    await service.get('pvp')
    expect(fetchFn).toHaveBeenCalledTimes(6)
    await service.get('pvp', true)
    expect(fetchFn).toHaveBeenCalledTimes(12)
  })
})
