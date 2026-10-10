import { describe, expect, it } from 'vitest'
import { NO_REWARDS } from '../src/main/quests/questData'
import type { RaidRecord } from '../src/shared/logTypes'
import { detectObjectives, withDetected, type DetectionContext } from '../src/shared/objectiveDetection'
import type { QuestProgress } from '../src/shared/questProgress'
import type { Quest, QuestObjective } from '../src/shared/questTypes'

const objective = (id: string, extra: Partial<QuestObjective> = {}): QuestObjective => ({
  id,
  type: 'story',
  description: id,
  optional: false,
  count: null,
  maps: [],
  items: [],
  foundInRaid: false,
  questItem: null,
  zones: [],
  locations: [],
  traderLevel: null,
  playerLevel: null,
  questStatus: null,
  requiredKeys: [],
  ...extra
})

const quest = (id: string, objectives: QuestObjective[]): Quest => ({
  id,
  name: id === 'tour' ? 'Tour' : `Quest ${id}`,
  normalizedName: id,
  traderId: 'prapor',
  wikiLink: null,
  minPlayerLevel: 1,
  requires: [],
  traderRequirements: [],
  objectives,
  map: null,
  kappaRequired: false,
  lightkeeperRequired: false,
  faction: 'Any',
  experience: 0,
  neededKeys: [],
  rewards: NO_REWARDS,
  startRewards: NO_REWARDS,
  imageLink: null
})

const raid = (map: string, startedAt: number | null, side: RaidRecord['side'] = 'pmc'): RaidRecord => ({
  map,
  raidId: null,
  side,
  online: true,
  queueSeconds: null,
  loadSeconds: null,
  foundAt: startedAt ?? 0,
  startedAt,
  endedAt: null
})

const active = (at: number): QuestProgress[string] => ({ status: 'active', at, source: 'log' })

const context = (extra: Partial<DetectionContext> = {}): DetectionContext => ({
  playerLevel: 20,
  traderLevels: {},
  progress: {},
  raids: [],
  // Factory's day and night versions count for both.
  raidMaps: (location) =>
    ({ bigmap: ['customs'], factory4_day: ['factory', 'night'], factory4_night: ['factory', 'night'] })[
      location.toLowerCase()
    ] ?? [],
  traderName: (id) => (id === 'prapor' ? 'Prapor' : undefined),
  questName: (id) => (id === 'debut' ? 'Debut' : undefined),
  mapName: (id) => ({ customs: 'Customs', factory: 'Factory' })[id],
  ...extra
})

describe('objectives the app ticks off by itself', () => {
  it('checks levels, loyalty levels and other quests', () => {
    const q = quest('q', [
      objective('level-15', { playerLevel: 15 }),
      objective('level-30', { playerLevel: 30 }),
      objective('prapor-2', { traderLevel: { traderId: 'prapor', level: 2 } }),
      objective('prapor-3', { traderLevel: { traderId: 'prapor', level: 3 } }),
      objective('therapist-1', { traderLevel: { traderId: 'therapist', level: 1 } }),
      objective('debut-done', { questStatus: { questId: 'debut', status: ['complete'] } }),
      objective('debut-started', { questStatus: { questId: 'debut', status: ['active'] } })
    ])
    const found = detectObjectives(
      [q],
      context({
        traderLevels: { prapor: 2 },
        progress: { debut: active(1) }
      })
    )
    expect(found).toEqual({
      q: {
        'level-15': { value: 1, why: 'Your level is 20 (set in Settings)' },
        'prapor-2': { value: 1, why: "You're LL2 with Prapor (set in Settings)" },
        // A trader not set in Settings is at level 1.
        'therapist-1': { value: 1, why: "You're LL1 with the trader (set in Settings)" },
        'debut-started': { value: 1, why: 'Debut is started' }
      }
    })
  })

  it('counts raids on the map since the chapter started, not as a scav, for "visit N times"', () => {
    const visit = objective('visit-customs', { count: 3, maps: ['customs'], visits: true })
    const factory = objective('visit-factory', { count: 3, maps: ['factory'], visits: true })
    const tour = quest('tour', [visit, factory])
    const raids = [
      raid('bigmap', 50), // before the chapter started
      raid('bigmap', 150),
      raid('bigmap', 160, 'scav'),
      raid('bigmap', null), // found a match but never started
      raid('bigmap', 170, null), // side unknown: counted
      raid('factory4_night', 180),
      raid('Woods', 190)
    ]
    const found = detectObjectives([tour], context({ raids, progress: { tour: active(100) } }))
    expect(found.tour).toEqual({
      'visit-customs': {
        value: 2,
        why: "2 raids on Customs since you started Tour (from the game's logs)"
      },
      // Night Factory is Factory.
      'visit-factory': { value: 1, why: "1 raid on Factory since you started Tour (from the game's logs)" }
    })
    // More raids than it takes stop at the count.
    const many = [...raids, raid('bigmap', 200), raid('bigmap', 210)]
    expect(
      detectObjectives([tour], context({ raids: many, progress: { tour: active(100) } })).tour
    ).toMatchObject({ 'visit-customs': { value: 3 } })
    // Not started: nothing counts.
    expect(detectObjectives([tour], context({ raids }))).toEqual({})
  })

  it('leaves finished quests alone, and merges with what was ticked off by taking the larger', () => {
    const q = quest('q', [objective('level', { playerLevel: 1 }), objective('count', { count: 5 })])
    expect(
      detectObjectives([q], context({ progress: { q: { status: 'completed', at: 1, source: 'log' } } }))
    ).toEqual({})
    const detected = { q: { level: { value: 1, why: '' }, count: { value: 2, why: '' } } }
    expect(withDetected({ q: { count: 4 }, other: { x: 1 } }, detected)).toEqual({
      q: { level: 1, count: 4 },
      other: { x: 1 }
    })
    expect(withDetected(undefined, detected)).toEqual({ q: { level: 1, count: 2 } })
  })
})
