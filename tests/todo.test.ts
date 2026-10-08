import { describe, expect, it } from 'vitest'
import { NO_REWARDS } from '../src/main/quests/questData'
import type { QuestStatus } from '../src/shared/questProgress'
import type { Quest, QuestObjective } from '../src/shared/questTypes'
import {
  inRaid,
  killObjectives,
  mapOverview,
  objectiveCategory,
  objectiveMapIds,
  questSummary,
  shortObjective,
  todoPlan,
  type MapGroup
} from '../src/shared/todo'

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
    const plan = todoPlan([row(q)], {}, groupOf, { have: { salewa: 3, bolts: 1 } })
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

  it('with your keys, flags objectives behind a lock you can’t open, or leaves out their quests, and says which keys to get', () => {
    const locked = quest('locked', [objective('a', 'visit', { requiredKeys: [['dorm', 'dormCopy']] })])
    const half = quest('half', [
      objective('a', 'visit'),
      objective('b', 'findQuestItem', { requiredKeys: [['dorm', 'dormCopy']] })
    ])
    const open = quest('open', [objective('a', 'visit', { maps: [WOODS] })])
    const rows = [row(locked), row(half), row(open)]
    // Without keys checked, Customs moves both Customs quests on.
    expect(names(todoPlan(rows, {}, groupOf).maps[0].quests)).toEqual(['half', 'locked'])

    // Show all: everything counts, with what's missing flagged.
    const all = todoPlan(rows, {}, groupOf, { owned: new Set() })
    const customsAll = all.maps.find((p) => p.group.name === 'Customs')!
    expect(names(customsAll.quests)).toEqual(['half', 'locked'])
    expect(names(customsAll.blocked)).toEqual(['locked'])
    expect(customsAll.finishes).toEqual([])
    expect(customsAll.steps.find((s) => s.quest === locked)!.missing).toEqual([['dorm', 'dormCopy']])
    expect(all.hidden).toBe(0)
    expect(all.maps.map((p) => p.group.name)).toEqual(['Customs', 'Woods'])

    // Only what you can do: "locked" goes, and so does all of "half" (the lock holds the quest up).
    const plan = todoPlan(rows, {}, groupOf, { owned: new Set(), hideBlocked: true })
    expect(plan.maps.map((p) => [p.group.name, names(p.quests)])).toEqual([['Woods', ['open']]])
    expect(plan.hidden).toBe(2)
    // The keys are listed either way.
    for (const p of [all, plan])
      expect(p.keysToGet.map((k) => [k.keyIds, names(k.quests), k.mapIds, k.access])).toEqual([
        [['dorm', 'dormCopy'], ['locked', 'half'], [CUSTOMS], false]
      ])

    // A lock on another map holds the quest up here too.
    const split = quest('split', [
      objective('a', 'visit', { maps: [WOODS] }),
      objective('b', 'visit', { requiredKeys: [['dorm', 'dormCopy']] })
    ])
    const splitPlan = todoPlan([row(split), row(open)], {}, groupOf, { owned: new Set(), hideBlocked: true })
    expect(splitPlan.maps.map((p) => names(p.quests))).toEqual([['open']])
    expect(splitPlan.keysToGet.map((k) => names(k.quests))).toEqual([['split']])
    // Once the locked objective's done, the quest's back.
    const doneB = todoPlan([row(split)], { split: { b: 1 } }, groupOf, {
      owned: new Set(),
      hideBlocked: true
    })
    expect(names(doneB.maps[0].quests)).toEqual(['split'])

    // Either copy of the key opens it.
    const withKey = todoPlan(rows, {}, groupOf, { owned: new Set(['dormCopy']), hideBlocked: true })
    expect(names(withKey.maps[0].quests)).toEqual(['half', 'locked'])
    expect(withKey.keysToGet).toEqual([])
    expect(withKey.hidden).toBe(0)
  })

  it('flags, or leaves out, a map you can’t get onto without its access item', () => {
    const lab: MapGroup = { key: 'lab', name: 'The Lab', mapIds: ['lab-id'], accessKeys: ['labCard'] }
    const groups = (id: string): MapGroup | undefined => (id === 'lab-id' ? lab : groupOf(id))
    const q = quest('q', [objective('a', 'visit', { maps: ['lab-id'] })])
    const all = todoPlan([row(q)], {}, groups, { owned: new Set() })
    expect(all.maps[0]).toMatchObject({ noAccess: ['labCard'] })
    expect(names(all.maps[0].quests)).toEqual(['q'])
    expect(names(all.maps[0].blocked)).toEqual(['q'])
    expect(all.keysToGet.map((k) => [k.keyIds, k.access])).toEqual([[['labCard'], true]])
    const doable = todoPlan([row(q)], {}, groups, { owned: new Set(), hideBlocked: true })
    expect(doable.maps).toEqual([])
    expect(doable.hidden).toBe(1)
    expect(doable.keysToGet.map((k) => k.keyIds)).toEqual([['labCard']])
    expect(todoPlan([row(q)], {}, groups, { owned: new Set(['labCard']) }).maps[0].noAccess).toBeNull()
  })

  it('shows only kill or only locate objectives, a quest with both keeping just those', () => {
    expect(objectiveCategory({ type: 'shoot' })).toBe('kill')
    expect(
      ['visit', 'mark', 'findQuestItem', 'plantItem', 'extract'].map((type) => objectiveCategory({ type }))
    ).toEqual(['locate', 'locate', 'locate', 'locate', 'locate'])
    const mixed = quest('mixed', [
      objective('mark', 'mark'),
      objective('kills', 'shoot', { count: 5 }),
      objective('far', 'visit', { maps: [WOODS] })
    ])
    const killer = quest('killer', [objective('kills', 'shoot', { maps: [WOODS] })])
    const finder = quest('finder', [objective('a', 'visit')])
    const pickUp = quest('pickUp', [objective('a', 'shoot', { maps: [WOODS] })])
    const rows = [row(mixed), row(killer), row(finder), row(pickUp, 'available')]
    const kill = todoPlan(rows, {}, groupOf, { kinds: 'kill' })
    expect(kill.maps.map((p) => [p.group.name, names(p.quests), p.steps.map((s) => s.objective.id)])).toEqual(
      [
        ['Woods', ['killer'], ['kills']],
        ['Customs', ['mixed'], ['kills']]
      ]
    )
    // "mixed" still has a spot to visit on Woods, so it isn't finished on Customs.
    expect(kill.maps[1].finishes).toEqual([])
    expect(names(kill.maps[0].available)).toEqual(['pickUp'])
    const locate = todoPlan(rows, {}, groupOf, { kinds: 'locate' })
    expect(
      locate.maps.map((p) => [p.group.name, names(p.quests), p.steps.map((s) => s.objective.id)])
    ).toEqual([
      ['Customs', ['finder', 'mixed'], ['mark', 'a']],
      ['Woods', ['mixed'], ['far']]
    ])
    expect(locate.maps[1].available).toEqual([])
  })
})

describe('the map overview', () => {
  const q1 = quest('q1', [
    objective('a', 'visit'),
    objective('b', 'visit', { requiredKeys: [['dorm']] }),
    objective('c', 'shoot', { count: 5 }),
    objective('d', 'visit', { optional: true }),
    objective('e', 'giveItem', { items: ['bolts'] }),
    objective('f', 'visit', { maps: [WOODS] })
  ])
  const q2 = quest('q2', [
    objective('m', 'mark', { items: ['marker'], requiredKeys: [['safe']] }),
    objective('p', 'plantQuestItem', { questItem: { id: 'x', name: 'Flash drive' } })
  ])
  const q3 = quest('q3', [objective('a', 'visit')])
  const q4 = quest('q4', [objective('z', 'visit', { requiredKeys: [['dorm']] })])
  const rows = [row(q1), row(q2), row(q3, 'available'), row(q4)]
  const progress = { q1: { a: 1, c: 2, d: 1, e: 1, f: 1 } }

  it('counts the objectives done on each map, of the kinds shown', () => {
    const customs = (kinds?: 'kill' | 'locate') =>
      todoPlan(rows, progress, groupOf, { kinds }).maps.find((p) => p.group.name === 'Customs')!
    // "a" is done; the optional one, the hand-over and the one on Woods don't count.
    expect([customs().done, customs().steps.length]).toEqual([1, 5])
    expect([customs('kill').done, customs('kill').steps.length]).toEqual([0, 1])
    expect([customs('locate').done, customs('locate').steps.length]).toEqual([1, 4])
    // Nothing is left for q1 on Woods, so Woods isn't listed.
    expect(todoPlan(rows, progress, groupOf).maps.map((p) => p.group.name)).toEqual(['Customs'])
  })

  it('sums up a map: quests, objectives, kills, keys, what to take and quests to pick up', () => {
    const owned = new Set(['safe'])
    const [customs] = todoPlan(rows, progress, groupOf, { owned }).maps
    expect(mapOverview(customs, owned)).toEqual({
      quests: 3,
      left: 5,
      done: 1,
      // 3 of 5 Scavs left; the four others are spots to visit, mark or plant at.
      kills: 3,
      locate: 4,
      // q2 is finished here; q4 is all behind the dorm key.
      finishes: 1,
      blocked: 1,
      keys: 2,
      missingKeys: 1,
      // A marker and the flash drive.
      bring: 2,
      pickUp: 1
    })
    expect(mapOverview(todoPlan(rows, progress, groupOf).maps[0]).missingKeys).toBe(0)
  })
})

describe('quest summaries', () => {
  it('drops the map from an objective’s text', () => {
    expect(shortObjective('Eliminate 5 Scavs on Customs', ['Customs'])).toBe('Eliminate 5 Scavs')
    expect(shortObjective('Locate the bunker on the Customs territory.', ['Customs'])).toBe(
      'Locate the bunker'
    )
    expect(shortObjective('Eliminate 5 Scavs on Woods', ['Customs'])).toBe('Eliminate 5 Scavs on Woods')
  })

  it('lists kills with their counts and the rest by kind, done ones included, a few lines at most', () => {
    const q = quest('q', [
      objective('m1', 'mark', { description: 'Mark the first fuel tank on Customs' }),
      objective('m2', 'mark'),
      objective('m3', 'mark'),
      objective('k', 'shoot', { description: 'Eliminate 5 Scavs on Customs', count: 5 }),
      objective('v', 'visit', { description: 'Locate the hideout on Customs' }),
      objective('woods', 'mark', { maps: [WOODS] }),
      objective('g', 'giveItem', { maps: [], items: ['x'] })
    ])
    const progress = { q: { m1: 1, k: 2 } }
    const plan = todoPlan([row(q)], progress, groupOf)
    const customs = plan.maps.find((p) => p.group.name === 'Customs')!
    const summary = questSummary(q, progress, customs.steps, customs.group, ['Customs'])
    expect(summary).toEqual({
      lines: [
        { kind: 'mark', text: 'Mark 3 spots', done: 1, total: 3 },
        { kind: 'kill', text: 'Eliminate 5 Scavs', done: 2, total: 5 },
        { kind: 'visit', text: 'Locate the hideout', done: 0, total: 1 }
      ],
      more: 0
    })
    expect(questSummary(q, progress, customs.steps, customs.group, ['Customs'], 2).more).toBe(1)
  })
})

describe('kill objectives for the banner over the map', () => {
  it('lists the active quests’ kills left on this map (Night Factory with Factory), fewest maps first, then any-map ones', () => {
    const b = quest('b', [
      objective('kill', 'shoot', { maps: [NIGHT_FACTORY], count: 5 }),
      objective('visit', 'visit', { maps: [FACTORY] }),
      objective('woods', 'shoot', { maps: [WOODS] })
    ])
    const a = quest('a', [
      objective('kill', 'shoot', { maps: [FACTORY], count: 3 }),
      objective('anywhere', 'shoot', { maps: [], count: 10 }),
      objective('optional', 'shoot', { maps: [FACTORY], optional: true })
    ])
    const c = quest('c', [objective('many', 'shoot', { maps: [WOODS, CUSTOMS, FACTORY], count: 8 })])
    const done = quest('done', [objective('kill', 'shoot', { maps: [FACTORY], count: 2 })])
    const available = quest('avail', [objective('kill', 'shoot', { maps: [FACTORY] })])
    const kills = killObjectives(
      [row(c), row(b), row(a), row(done), row(available, 'available')],
      { b: { kill: 2 }, a: { anywhere: 4 }, done: { kill: 2 } },
      new Set(GROUPS.factory.mapIds)
    )
    expect(kills.map((k) => [k.quest.id, k.objective.id, k.done, k.total, k.anyMap])).toEqual([
      ['a', 'kill', 0, 3, false],
      ['b', 'kill', 2, 5, false],
      ['c', 'many', 0, 8, false],
      ['a', 'anywhere', 4, 10, true]
    ])
  })

  it('leaves out quests a missing key holds up', () => {
    const a = quest('a', [objective('kill', 'shoot', { maps: [WOODS] })])
    const b = quest('b', [objective('kill', 'shoot', { maps: [WOODS] })])
    const kills = killObjectives([row(a), row(b)], {}, new Set([WOODS]), (q) => q.id === 'a')
    expect(kills.map((k) => k.quest.id)).toEqual(['b'])
  })
})
