import { describe, expect, it } from 'vitest'
import {
  doableMarkers,
  objectiveKind,
  questPins,
  type ObjectiveMarker
} from '../src/renderer/src/lib/questPins'
import { formatMoney, formatStanding, itemsNeeded, keysNeeded } from '../src/renderer/src/lib/questSummary'
import { NO_REWARDS } from '../src/main/quests/questData'
import type { Quest, QuestObjective, Vec3 } from '../src/shared/questTypes'

const CUSTOMS = 'customs-id'
const objective = (id: string, type: string, extra: Partial<QuestObjective> = {}): QuestObjective => ({
  id,
  type,
  description: `${type} ${id}`,
  optional: false,
  count: 1,
  maps: [CUSTOMS],
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
const quest = (id: string, objectives: QuestObjective[], extra: Partial<Quest> = {}): Quest => ({
  id,
  name: `Quest ${id}`,
  normalizedName: id,
  traderId: 'prapor',
  wikiLink: null,
  minPlayerLevel: 1,
  requires: [],
  traderRequirements: [],
  objectives,
  map: CUSTOMS,
  kappaRequired: false,
  lightkeeperRequired: false,
  faction: 'Any',
  experience: 0,
  neededKeys: [],
  rewards: NO_REWARDS,
  startRewards: NO_REWARDS,
  imageLink: null,
  ...extra
})
const at = (x: number, z: number, y = 1): Vec3 => ({ x, y, z })
const marker = (
  q: Quest,
  o: QuestObjective,
  zones: Vec3[],
  spots: Vec3[] = [],
  status: ObjectiveMarker['status'] = 'active'
): ObjectiveMarker => ({
  quest: q,
  status,
  trader: { id: 'prapor', name: 'Prapor', levels: [], imageLink: null },
  objective: o,
  zones: zones.map((position) => ({ position, outline: [] })),
  spots
})

describe('quest pins', () => {
  it('knows what each objective has you do', () => {
    expect(
      ['visit', 'findQuestItem', 'plantItem', 'plantQuestItem', 'mark', 'shoot', 'extract', 'giveItem'].map(
        (type) => objectiveKind({ type })
      )
    ).toEqual(['visit', 'pickup', 'stash', 'stash', 'mark', 'kill', 'extract', 'other'])
  })

  it('gives each spot a quest sends you to one pin, with every objective done there', () => {
    // Golden Swag: pick up the lighter in room 303 (behind a key), then stash another on the same desk.
    const find = objective('find', 'findQuestItem', { requiredKeys: [['key-303']] })
    const stash = objective('stash', 'plantItem')
    const visit = objective('visit', 'visit')
    const q = quest('swag', [find, stash, visit])
    const { pins, dots } = questPins([
      marker(q, find, [], [at(180.8, 150.1, 6.7)]),
      // tarkov.dev lists some zones twice.
      marker(q, stash, [at(180.6, 149.3, 6.8), at(180.6, 149.3, 6.8)]),
      // Downstairs in the same building, and across the map.
      marker(q, visit, [at(181, 150, 0.5), at(300, -50)])
    ])
    expect(dots).toEqual([])
    expect(pins.map((p) => [p.position, p.objectives.map((o) => o.id), p.kinds, p.needsKey])).toEqual([
      [at(180.8, 150.1, 6.7), ['find', 'stash'], ['pickup', 'stash'], true],
      [at(181, 150, 0.5), ['visit'], ['visit'], false],
      [at(300, -50), ['visit'], ['visit'], false]
    ])
    expect(pins[0].trader?.name).toBe('Prapor')
  })

  it('stacks pins of different quests at the same spot, and dots items that could be in many places', () => {
    const a = objective('a', 'visit')
    const b = objective('b', 'mark')
    const c = objective('c', 'findQuestItem')
    const many = [at(1, 1), at(50, 50), at(100, 100), at(150, 150)]
    const { pins, dots } = questPins([
      marker(quest('one', [a]), a, [at(10, 10)]),
      marker(quest('two', [b]), b, [at(11, 10)], [], 'available'),
      marker(quest('three', [c]), c, [], many)
    ])
    expect(pins.map((p) => [p.quest.id, p.status, p.stack])).toEqual([
      ['one', 'active', 0],
      ['two', 'available', 1]
    ])
    expect(dots.map((d) => d.position)).toEqual(many)
  })
})

describe('only quests I can do, on the map', () => {
  // Customs: Painkiller's stash behind the Unknown key, Golden Swag's room 303 (either copy of its key
  // opens it), and a dorm room the player has the key to.
  const free = objective('free', 'visit')
  const pills = objective('pills', 'findQuestItem', { requiredKeys: [['unknown-key']] })
  const swag = objective('swag', 'findQuestItem', { requiredKeys: [['key-303', 'key-303-copy']] })
  const stash = objective('stash', 'plantItem', { requiredKeys: [['key-303', 'key-303-copy']] })
  const dorm = objective('dorm', 'visit', { requiredKeys: [['dorm-key']] })
  const markers = [
    marker(quest('trip', [free]), free, [at(0, 0)]),
    marker(quest('painkiller', [pills]), pills, [at(100, 0)]),
    marker(quest('golden', [swag, stash]), swag, [at(180, 150)]),
    marker(quest('golden', [swag, stash]), stash, [at(181, 150)]),
    marker(quest('dorm', [dorm]), dorm, [at(200, 100)])
  ]
  const ids = (list: ObjectiveMarker[]): string[] => list.map((m) => m.objective.id)

  it('leaves out objectives behind keys the player doesn’t have, and counts them', () => {
    const shown = doableMarkers(markers, new Set(['dorm-key']), false)
    expect(ids(shown.markers)).toEqual(['free', 'dorm'])
    expect([shown.hidden, shown.quests]).toEqual([3, 2])
    // Either copy of a key opens its lock.
    expect(ids(doableMarkers(markers, new Set(['dorm-key', 'key-303-copy']), false).markers)).toEqual([
      'free',
      'swag',
      'stash',
      'dorm'
    ])
  })

  it('leaves out a whole quest a missing key holds up, even its free objectives and on other maps', () => {
    // Its free objective here, and a locked one on Woods (not on this map at all).
    const here = objective('here', 'visit')
    const woods = objective('woods', 'visit', { maps: ['woods-id'], requiredKeys: [['cabin-key']] })
    const split = quest('split', [here, woods])
    const list = [...markers, marker(split, here, [at(50, 50)])]
    const shown = doableMarkers(list, new Set(['dorm-key']), false)
    expect(ids(shown.markers)).toEqual(['free', 'dorm'])
    expect([shown.hidden, shown.quests]).toEqual([4, 3])
    expect(ids(doableMarkers(list, new Set(['dorm-key', 'cabin-key']), false).markers)).toContain('here')
    // Once the locked objective's done (as the Maps tab says through `blocked`), the quest's back.
    const done = doableMarkers(list, new Set(['dorm-key']), false, undefined, (q) => q.id === 'painkiller')
    expect(ids(done.markers)).toEqual(['free', 'swag', 'stash', 'dorm', 'here'])
  })

  it('leaves out everything on a map the player can’t get onto, but the quest asked for', () => {
    const all = new Set(['dorm-key', 'unknown-key', 'key-303'])
    expect(doableMarkers(markers, all, false).hidden).toBe(0)
    expect(doableMarkers(markers, all, true)).toMatchObject({ markers: [], hidden: 5, quests: 4 })
    const shown = doableMarkers(markers, new Set(), false, (m) => m.quest.id === 'painkiller')
    expect(ids(shown.markers)).toEqual(['free', 'pills'])
    expect([shown.hidden, shown.quests]).toEqual([3, 2])
  })

  it('marks pins needing a key the player doesn’t have, when their keys are known', () => {
    const missing = (owned: ReadonlySet<string> | null): [string, boolean, boolean][] =>
      questPins(markers, owned).pins.map((p) => [
        p.objectives.map((o) => o.id).join(),
        p.needsKey,
        p.keyMissing
      ])
    expect(missing(new Set(['dorm-key', 'key-303']))).toEqual([
      ['free', false, false],
      ['pills', true, true],
      ['swag,stash', true, false],
      ['dorm', true, false]
    ])
    expect(missing(null).every(([, , keyMissing]) => !keyMissing)).toBe(true)
  })
})

describe('story steps on the map', () => {
  it('marks pins that are only roughly placed, or the player’s own', () => {
    const plane = objective('plane', 'story')
    const drive = objective('drive', 'story')
    const recorder = objective('recorder', 'story')
    const q = quest('skies', [plane, drive, recorder])
    const zone = (position: Vec3, source: 'rough' | 'mine', place?: string) => ({
      position,
      outline: [],
      source,
      place
    })
    const { pins } = questPins([
      { ...marker(q, plane, []), zones: [zone(at(10, 10), 'rough', 'Crash Site')] },
      { ...marker(q, drive, []), zones: [zone(at(200, 10), 'mine')] },
      // The player's pin right by a rough one: the spot is known.
      { ...marker(q, recorder, []), zones: [zone(at(12, 10), 'mine')] }
    ])
    expect(pins.map((p) => [p.objectives.map((o) => o.id), p.rough, p.mine, p.places])).toEqual([
      [['plane', 'recorder'], false, true, ['Crash Site']],
      [['drive'], false, true, []]
    ])
    expect(
      questPins([{ ...marker(q, plane, []), zones: [zone(at(10, 10), 'rough', 'Crash Site')] }]).pins[0]
    ).toMatchObject({ rough: true, mine: false, places: ['Crash Site'] })
  })
})

describe('quest summary', () => {
  it('lists each lock once with the keys that open it and where, adding tarkov.dev’s extras', () => {
    const q = quest('swag', [
      objective('find', 'findQuestItem', { requiredKeys: [['key-303', 'key-303-copy']] }),
      objective('stash', 'plantItem', { requiredKeys: [['key-303', 'key-303-copy']], maps: ['woods'] })
    ])
    q.neededKeys = [
      { map: CUSTOMS, keyIds: ['key-303', 'key-114'] },
      { map: '', keyIds: ['key-any'] }
    ]
    expect(keysNeeded(q)).toEqual([
      { keyIds: ['key-303', 'key-303-copy'], mapIds: [CUSTOMS, 'woods'] },
      { keyIds: ['key-114'], mapIds: [CUSTOMS] },
      { keyIds: ['key-any'], mapIds: [] }
    ])
  })

  it('sums the items the quest takes, but not the ones it has you find', () => {
    expect(
      itemsNeeded([
        objective('f', 'findItem', { items: ['salewa'], count: 3, foundInRaid: true }),
        objective('g', 'giveItem', { items: ['salewa'], count: 3, foundInRaid: true }),
        objective('g2', 'giveItem', { items: ['salewa'], count: 2, foundInRaid: true }),
        objective('p', 'plantItem', { items: ['zibbo'] }),
        objective('m', 'mark', { items: ['ms2000'] }),
        objective('any', 'giveItem', { items: ['a', 'b'], count: 4 })
      ])
    ).toEqual([
      { action: 'Hand over', itemIds: ['salewa'], count: 5, foundInRaid: true },
      { action: 'Stash', itemIds: ['zibbo'], count: 1, foundInRaid: false },
      { action: 'Mark with', itemIds: ['ms2000'], count: 1, foundInRaid: false },
      { action: 'Hand over', itemIds: ['a', 'b'], count: 4, foundInRaid: false }
    ])
  })

  it('formats money and reputation', () => {
    expect(formatMoney('5449016a4bdc2d6f028b456f', 80000)).toBe('₽80,000')
    expect(formatMoney('5696686a4bdc2da3298b456a', 450)).toBe('$450')
    expect(formatMoney('569668774bdc2da2298b4568', 1200)).toBe('€1,200')
    expect(formatMoney('salewa', 2)).toBeNull()
    expect([formatStanding(0.1), formatStanding(-0.05)]).toEqual(['+0.10', '−0.05'])
  })
})
