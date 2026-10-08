import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { NO_REWARDS } from '../src/main/quests/questData'
import { createPlayerStore } from '../src/main/quests/playerStore'
import {
  blockedByKeys,
  EMPTY_KEYS,
  keyRewards,
  keyScanChanges,
  keysNeeded,
  missingKeys,
  opens
} from '../src/shared/keys'
import type { QuestStatus } from '../src/shared/questProgress'
import type { Quest, QuestObjective } from '../src/shared/questTypes'
import { tempDir } from './helpers'

const CUSTOMS = 'customs-id'
const objective = (id: string, extra: Partial<QuestObjective> = {}): QuestObjective => ({
  id,
  type: 'visit',
  description: `visit ${id}`,
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
const row = (q: Quest, status: QuestStatus) => ({ quest: q, status })

describe('which locks are open', () => {
  it('needs only one of a lock’s keys', () => {
    const owned = new Set(['b'])
    expect(opens(['a', 'b'], owned)).toBe(true)
    expect(opens(['a'], owned)).toBe(false)
    expect(missingKeys(objective('x', { requiredKeys: [['a', 'b'], ['c'], []] }), owned)).toEqual([['c']])
  })

  it('says which keys hold up a whole quest, on any map', () => {
    const q = quest('q', [
      objective('free'),
      objective('locked', { maps: ['woods-id'], requiredKeys: [['dorm', 'dormCopy']] }),
      objective('extra', { optional: true, requiredKeys: [['safe']] })
    ])
    // A lock on another map still holds the quest up; an optional objective's lock doesn't.
    expect(blockedByKeys(q, new Set(), undefined)).toEqual([['dorm', 'dormCopy']])
    // Either copy of the key opens it.
    expect(blockedByKeys(q, new Set(['dormCopy']), undefined)).toEqual([])
    // Done already: its lock is no longer in the way.
    expect(blockedByKeys(q, new Set(), { q: { locked: 1 } })).toEqual([])
  })
})

describe('keysNeeded', () => {
  it('lists each lock once with the quests behind it, active first, then by level', () => {
    const active = quest('active', [objective('o1', { requiredKeys: [['dorm']] })], { minPlayerLevel: 5 })
    const later = quest('later', [objective('o1', { requiredKeys: [['dorm']], maps: ['woods'] })], {
      minPlayerLevel: 25
    })
    const soon = quest('soon', [objective('o1', { requiredKeys: [['cabin', 'cabin2']] })])
    const done = quest('done', [objective('o1', { requiredKeys: [['safe']] })])
    const needs = keysNeeded(
      [row(later, 'locked'), row(soon, 'available'), row(active, 'active'), row(done, 'completed')],
      {}
    )
    expect(needs.map((n) => n.keyIds)).toEqual([['dorm'], ['cabin', 'cabin2']])
    expect(needs[0].uses.map((u) => [u.quest.id, u.status, u.mapIds])).toEqual([
      ['active', 'active', [CUSTOMS]],
      ['later', 'locked', ['woods']]
    ])
    expect(needs[0].uses[0].objectives.map((o) => o.id)).toEqual(['o1'])
  })

  it('leaves out locks behind objectives already done, and adds tarkov.dev’s list of the quest’s keys', () => {
    const q = quest(
      'q',
      [objective('done', { requiredKeys: [['old']] }), objective('open', { requiredKeys: [['dorm']] })],
      { neededKeys: [{ map: CUSTOMS, keyIds: ['dorm', 'extra'] }] }
    )
    // "old" is named by an objective already done, so tarkov.dev's list doesn't bring it back.
    const withOld = { ...q, neededKeys: [...q.neededKeys, { map: CUSTOMS, keyIds: ['old'] }] }
    expect(keysNeeded([row(withOld, 'active')], { q: { done: 1 } }).map((n) => n.keyIds)).toEqual([
      ['dorm'],
      ['extra']
    ])
    const needs = keysNeeded([row(q, 'active')], { q: { done: 1 } })
    expect(needs.map((n) => [n.keyIds, n.uses[0].objectives.map((o) => o.id), n.uses[0].mapIds])).toEqual([
      [['dorm'], ['open'], [CUSTOMS]],
      [['extra'], [], [CUSTOMS]]
    ])
  })

  it('takes only the statuses asked for', () => {
    const q = quest('q', [objective('o', { requiredKeys: [['dorm']] })])
    expect(keysNeeded([row(q, 'locked')], {}, new Set(['active']))).toEqual([])
  })
})

describe('keyRewards', () => {
  it('finds the quests that hand out each key, as a reward or on accepting', () => {
    const reward = quest('reward', [], { rewards: { ...NO_REWARDS, items: [{ itemId: 'dorm', count: 1 }] } })
    const start = quest('start', [], {
      startRewards: {
        ...NO_REWARDS,
        items: [
          { itemId: 'dorm', count: 1 },
          { itemId: 'bolts', count: 3 }
        ]
      }
    })
    const rewards = keyRewards([reward, start], (id) => id === 'dorm')
    expect([...rewards.keys()]).toEqual(['dorm'])
    expect(rewards.get('dorm')!.map((r) => [r.quest.id, r.onStart])).toEqual([
      ['reward', false],
      ['start', true]
    ])
  })
})

describe('keyScanChanges', () => {
  it('ticks what the screenshots show and unticks what they don’t, each key once', () => {
    expect(keyScanChanges(['a', 'b', 'b', 'c'], ['c', 'd', 'e'])).toEqual({
      add: ['a', 'b'],
      remove: ['d', 'e'],
      unchanged: 1
    })
    expect(keyScanChanges([], [])).toEqual({ add: [], remove: [], unchanged: 0 })
  })
})

describe('the saved key lists', () => {
  it('keeps owned and wanted keys per game mode, and a key you get stops being one to get', async () => {
    const file = join(await tempDir(), 'player.json')
    const store = createPlayerStore({ file })
    expect(await store.keys('pvp')).toEqual(EMPTY_KEYS)
    await store.setKey('pvp', 'dorm', 'toDo', true)
    await store.setKey('pvp', 'cabin', 'toDo', true)
    await store.setKey('pvp', 'cabin', 'toDo', true)
    await store.setKey('pvp', 'safe', 'owned', true)
    expect(await store.setKey('pvp', 'dorm', 'owned', true)).toEqual({
      owned: ['safe', 'dorm'],
      toDo: ['cabin']
    })
    await store.setKey('pvp', 'safe', 'owned', false)
    await store.setKey('pve', 'cabin', 'owned', true)
    const reopened = createPlayerStore({ file })
    expect(await reopened.keys('pvp')).toEqual({ owned: ['dorm'], toDo: ['cabin'] })
    expect(await reopened.keys('pve')).toEqual({ owned: ['cabin'], toDo: [] })
  })

  it('replaces the keys you have from screenshots, and keys you now have stop being ones to get', async () => {
    const file = join(await tempDir(), 'player.json')
    const store = createPlayerStore({ file })
    await store.setKey('pvp', 'old', 'owned', true)
    await store.setKey('pvp', 'dorm', 'toDo', true)
    await store.setKey('pvp', 'cabin', 'toDo', true)
    expect(await store.setOwnedKeys('pvp', ['dorm', 'safe', 'dorm'])).toEqual({
      owned: ['dorm', 'safe'],
      toDo: ['cabin']
    })
    expect(await createPlayerStore({ file }).keys('pvp')).toEqual({
      owned: ['dorm', 'safe'],
      toDo: ['cabin']
    })
    expect(await store.keys('pve')).toEqual(EMPTY_KEYS)
  })

  it('reads files from before 1.17.0, and drops anything that isn’t a key id', async () => {
    const file = join(await tempDir(), 'player.json')
    await writeFile(
      file,
      JSON.stringify({ version: 1, progress: {}, keys: { pvp: { owned: ['a', 'a', 3, null], toDo: 'x' } } })
    )
    const store = createPlayerStore({ file })
    expect(await store.keys('pvp')).toEqual({ owned: ['a'], toDo: [] })
    expect(await store.keys('season')).toEqual(EMPTY_KEYS)
  })
})
