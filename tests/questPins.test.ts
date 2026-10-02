import { describe, expect, it } from 'vitest'
import { objectiveKind, questPins, type ObjectiveMarker } from '../src/renderer/src/lib/questPins'
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
