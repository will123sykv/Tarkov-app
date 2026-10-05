import { describe, expect, it } from 'vitest'
import { NO_REWARDS } from '../src/main/quests/questData'
import type { QuestStatus } from '../src/shared/questProgress'
import type { Quest, QuestObjective } from '../src/shared/questTypes'
import { inRaid, objectiveMapIds, todoPlan, type MapGroup } from '../src/shared/todo'

const CUSTOMS = 'customs-id'
const WOODS = 'woods-id'
const FACTORY = 'factory-id'
const NIGHT_FACTORY = 'night-factory-id'
const GROUPS: Record<string, MapGroup> = {
  customs: { key: 'customs', name: 'Customs', mapIds: [CUSTOMS] },
  woods: { key: 'woods', name: 'Woods', mapIds: [WOODS] },
  factory: { key: 'factory', name: 'Factory', mapIds: [FACTORY, NIGHT_FACTORY] }
}
const groupOf = (mapId: string): MapGroup | undefined =>
  Object.values(GROUPS).find((g) => g.mapIds.includes(mapId))

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
  map: null,
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
const row = (q: Quest, status: QuestStatus = 'active') => ({ quest: q, status })
const names = (quests: Quest[]): string[] => quests.map((q) => q.id)

describe('which objectives are done in raid, and where', () => {
  it('collects the maps an objective names, its zones and its quest item spots', () => {
    const o = objective('a', 'visit', {
      maps: [CUSTOMS],
      zones: [{ map: WOODS, position: { x: 0, y: 0, z: 0 }, outline: [] }],
      locations: [{ map: CUSTOMS, positions: [] }]
    })
    expect(objectiveMapIds(o)).toEqual([CUSTOMS, WOODS])
  })

  it('leaves out hand-overs, loyalty, levels, other quests and story steps with no map', () => {
    expect(inRaid(objective('a', 'visit'))).toBe(true)
    expect(inRaid(objective('a', 'shoot', { maps: [] }))).toBe(true)
    expect(inRaid(objective('a', 'giveItem', { maps: [] }))).toBe(false)
    expect(inRaid(objective('a', 'giveQuestItem'))).toBe(false)
    expect(inRaid(objective('a', 'traderLevel', { traderLevel: { traderId: 't', level: 2 } }))).toBe(false)
    expect(inRaid(objective('a', 'playerLevel', { playerLevel: 10 }))).toBe(false)
    expect(inRaid(objective('a', 'story', { maps: [] }))).toBe(false)
    expect(inRaid(objective('a', 'story', { maps: [WOODS] }))).toBe(true)
  })
})

describe('todoPlan', () => {
  it('ranks maps by the active quests a raid there moves on, finishing ones counting twice', () => {
    // Quest 1 is all on Woods; quest 2 is on Customs and Woods; quests 3 and 4 only on Customs.
    const q1 = quest('1', [
      objective('a', 'visit', { maps: [WOODS] }),
      objective('b', 'shoot', { maps: [WOODS] })
    ])
    const q2 = quest('2', [
      objective('a', 'visit', { maps: [CUSTOMS] }),
      objective('b', 'mark', { maps: [WOODS] })
    ])
    const q3 = quest('3', [objective('a', 'visit')])
    const q4 = quest('4', [objective('a', 'findQuestItem')])
    const plan = todoPlan([row(q1), row(q2), row(q3), row(q4)], {}, groupOf)
    expect(plan.active).toBe(4)
    const [first, second] = plan.maps
    // Customs: quests 2, 3 and 4, with 3 and 4 finished there (score 5); Woods: 1 and 2, 1 finished (3).
    expect(first.group.name).toBe('Customs')
    expect(names(first.quests)).toEqual(['3', '4', '2'])
    expect(names(first.finishes)).toEqual(['3', '4'])
    expect(second.group.name).toBe('Woods')
    expect(names(second.finishes)).toEqual(['1'])
    expect(second.steps.map((s) => `${s.quest.id}${s.objective.id}`)).toEqual(['1a', '1b', '2b'])
  })

  it('leaves out what is done, optional or off-raid, and counts how many are left', () => {
    const q = quest('1', [
      objective('a', 'visit'),
      objective('b', 'shoot', { count: 5 }),
      objective('c', 'visit', { optional: true }),
      objective('d', 'giveItem', { maps: [], items: ['salewa'] })
    ])
    const plan = todoPlan([row(q)], { '1': { a: 1, b: 2 } }, groupOf)
    expect(plan.maps).toHaveLength(1)
    expect(plan.maps[0].steps.map((s) => [s.objective.id, s.left])).toEqual([['b', 3]])
  })

  it('shows Factory and Night Factory as one map, an objective on both once', () => {
    const q = quest('1', [objective('a', 'shoot', { maps: [FACTORY, NIGHT_FACTORY] })])
    const plan = todoPlan([row(q)], {}, groupOf)
    expect(plan.maps.map((p) => [p.group.name, p.steps.length])).toEqual([['Factory', 1]])
  })

  it('lists objectives for any map apart, and items to find less what is put aside', () => {
    const q = quest('1', [
      objective('kills', 'shoot', { maps: [] }),
      objective('find', 'findItem', { maps: [], items: ['salewa'], count: 3 }),
      objective('find2', 'findItem', { maps: [], items: ['bolts'], count: 2 }),
      objective('give', 'giveItem', { maps: [], items: ['salewa'], count: 3 })
    ])
    const plan = todoPlan([row(q)], {}, groupOf, { salewa: 3, bolts: 1 })
    expect(plan.maps).toEqual([])
    expect(plan.anyMap.map((s) => s.objective.id)).toEqual(['kills'])
    expect(plan.finds.map((s) => s.objective.id)).toEqual(['find2'])
    // The salewas are put aside: hand them over.
    expect(plan.handOvers.map((h) => [h.itemId, h.count, h.have])).toEqual([['salewa', 3, 3]])
  })

  it('says which quests to hand in, and which quest items are ready to hand over', () => {
    const done = quest('done', [objective('a', 'visit')])
    const item = { id: 'pkg', name: 'Package' }
    const found = quest('found', [
      objective('find', 'findQuestItem', { questItem: item }),
      objective('give', 'giveQuestItem', { questItem: item, maps: [] })
    ])
    const notYet = quest('notYet', [
      objective('find', 'findQuestItem', { questItem: item }),
      objective('give', 'giveQuestItem', { questItem: item, maps: [] })
    ])
    const plan = todoPlan(
      [row(done), row(found), row(notYet)],
      { done: { a: 1 }, found: { find: 1 } },
      groupOf
    )
    expect(names(plan.turnIn)).toEqual(['done'])
    expect(plan.handOvers.map((h) => [h.quest.id, h.itemId])).toEqual([['found', null]])
    expect(names(plan.maps[0].quests)).toEqual(['notYet'])
  })

  it('lists quests to pick up on each map, without story chapters, and ranks maps with only those last', () => {
    const active = quest('active', [objective('a', 'visit')])
    const pickUp = quest('pickUp', [objective('a', 'visit', { maps: [WOODS] }), objective('b', 'visit')])
    const story = quest('story', [objective('a', 'story', { maps: [WOODS] })], {
      story: { description: '', howItStarts: '' }
    })
    const locked = quest('locked', [objective('a', 'visit', { maps: [FACTORY] })])
    const plan = todoPlan(
      [row(pickUp, 'available'), row(story, 'available'), row(locked, 'locked'), row(active)],
      {},
      groupOf
    )
    expect(plan.active).toBe(1)
    expect(plan.maps.map((p) => [p.group.name, names(p.quests), names(p.available)])).toEqual([
      ['Customs', ['active'], ['pickUp']],
      ['Woods', [], ['pickUp']]
    ])
  })

  it('gathers the keys and items each map needs', () => {
    const q = quest(
      '1',
      [
        objective('a', 'visit', { requiredKeys: [['key1', 'key2']] }),
        objective('b', 'visit', { requiredKeys: [['key1', 'key2']] }),
        objective('c', 'mark', { items: ['marker'] }),
        objective('d', 'mark', { items: ['marker'], count: 2 }),
        objective('e', 'plantQuestItem', { questItem: { id: 'x', name: 'Flash drive' } })
      ],
      {
        neededKeys: [
          { map: CUSTOMS, keyIds: ['key2', 'key3'] },
          { map: WOODS, keyIds: ['key4'] }
        ]
      }
    )
    const [customs] = todoPlan([row(q)], {}, groupOf).maps
    expect(customs.keys).toEqual([['key1', 'key2'], ['key3']])
    expect(customs.bring).toEqual([{ itemId: 'marker', count: 3 }])
    expect(customs.questItems).toEqual([{ name: 'Flash drive', questId: '1' }])
  })
})
