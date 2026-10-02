import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LogEvent } from '../src/main/logs/interpret'
import { normalizeQuestData } from '../src/main/quests/questData'
import { createPlayerStore, MAX_PINS } from '../src/main/quests/playerStore'
import {
  applyQuestEvent,
  forFaction,
  levelRequirement,
  lockReasons,
  markUpTo,
  neededItems,
  objectiveSummary,
  objectiveTarget,
  objectiveValue,
  questMaps,
  setObjective,
  questStatus,
  requirementLabels,
  setQuestStatus,
  withoutLogEntries,
  type QuestProgress
} from '../src/shared/questProgress'
import { tempDir } from './helpers'
import { CUSTOMS, Q, RAW_QUEST_DATA, THERAPIST, WOODS } from './questFixtures'

const { quests, traders: traderList } = normalizeQuestData(RAW_QUEST_DATA, 'pvp', 0)
const traders = new Map(traderList.map((t) => [t.id, t]))
const byId = new Map(quests.map((q) => [q.id, q]))
const get = (id: string) => byId.get(id)!
const ctx = (playerLevel = 15, faction: string | null = null) => ({ playerLevel, faction })
const status = (id: string, progress: QuestProgress, level = 15) =>
  questStatus(get(id), progress, ctx(level), byId)
const done = (at = 1): QuestProgress[string] => ({ status: 'completed', at, source: 'log' })

describe('quest status', () => {
  it('is available once level and prerequisites are met, else locked with reasons', () => {
    expect(status(Q.debut, {})).toBe('available')
    expect(status(Q.checking, {})).toBe('locked')
    expect(lockReasons(get(Q.checking), {}, ctx(1), byId)).toEqual(['Needs level 2', 'Needs Debut completed'])
    expect(status(Q.checking, { [Q.debut]: done() })).toBe('available')
  })

  it('accepts a prerequisite that only has to be started, or failed', () => {
    const started: QuestProgress = {
      [Q.debut]: done(),
      [Q.checking]: { status: 'active', at: 2, source: 'log' }
    }
    expect(status(Q.shootout, started)).toBe('available')
    expect(status(Q.shootout, started, 5)).toBe('locked')
    expect(status(Q.firstAid, { [Q.debut]: done() })).toBe('locked')
    expect(status(Q.firstAid, { [Q.debut]: { status: 'failed', at: 1, source: 'log' } })).toBe('available')
  })

  it('reports what the player did with it, whatever the prerequisites', () => {
    expect(status(Q.kappaOnly, { [Q.kappaOnly]: { status: 'active', at: 1, source: 'manual' } }, 1)).toBe(
      'active'
    )
  })

  it('filters by faction', () => {
    expect(forFaction(get(Q.usecOnly), 'BEAR')).toBe(false)
    expect(forFaction(get(Q.usecOnly), 'USEC')).toBe(true)
    expect(forFaction(get(Q.usecOnly), null)).toBe(true)
    expect(forFaction(get(Q.debut), 'BEAR')).toBe(true)
  })
})

describe('level requirements', () => {
  it('tells a quest’s own level from one tarkov.dev inherits from loyalty levels or earlier quests', () => {
    // Checking needs level 2 itself; Debut before it only needs level 1.
    expect(levelRequirement(get(Q.checking), byId, traders)).toEqual({
      own: true,
      gate: { kind: 'quest', questId: Q.debut }
    })
    // Aid Stations' level 5 is what Therapist LL2 needs.
    expect(levelRequirement(get(Q.aidStations), byId, traders)).toEqual({
      own: false,
      gate: { kind: 'loyalty', traderId: THERAPIST, level: 2 }
    })
    // Shootout Picnic's 10 is above Checking's 2 and the Therapist LL2 (level 5) Checking asks for.
    expect(levelRequirement(get(Q.shootout), byId, traders).own).toBe(true)
    expect(levelRequirement({ ...get(Q.shootout), minPlayerLevel: 5 }, byId, traders)).toEqual({
      own: false,
      gate: { kind: 'quest', questId: Q.checking }
    })
  })

  it('labels what the game asks for: its own level, loyalty levels and reputation', () => {
    expect(requirementLabels(get(Q.checking), byId, traders)).toEqual(['Level 2'])
    expect(requirementLabels(get(Q.aidStations), byId, traders)).toEqual(['Therapist LL2', 'Prapor rep ≤ -1'])
    expect(requirementLabels(get(Q.debut), byId, traders)).toEqual([])
  })

  it('names the loyalty level as the reason a quest is locked', () => {
    const at = (playerLevel: number) =>
      lockReasons(get(Q.aidStations), {}, { ...ctx(playerLevel), traders }, byId)
    expect(at(3)).toEqual(['Needs Therapist LL2 (from level 5)'])
    expect(at(5)).toEqual([])
    expect(lockReasons(get(Q.checking), {}, { ...ctx(1), traders }, byId)).toEqual([
      'Needs level 2',
      'Needs Debut completed'
    ])
  })
})

describe('recording progress', () => {
  it('keeps the newest of log events and manual changes', () => {
    let p: QuestProgress = {}
    p = applyQuestEvent(p, Q.debut, 'active', 100)
    p = applyQuestEvent(p, Q.debut, 'completed', 200)
    expect(p[Q.debut]).toEqual({ status: 'completed', at: 200, source: 'log' })
    // A click at 300 beats an older event read later (say, while scanning old logs).
    p = setQuestStatus(p, Q.debut, 'active', 300)
    expect(applyQuestEvent(p, Q.debut, 'completed', 250)).toBe(p)
    // A newer event (the quest restarted and was finished again) beats the click.
    expect(applyQuestEvent(p, Q.debut, 'completed', 400)[Q.debut].source).toBe('log')
    expect(setQuestStatus(p, Q.debut, null, 500)).toEqual({})
  })

  it('marks a quest and everything before it done, failing what had to fail', () => {
    const p = markUpTo({ [Q.checking]: { status: 'active', at: 5, source: 'log' } }, Q.shootout, byId, 99)
    expect(p).toEqual({
      [Q.shootout]: { status: 'completed', at: 99, source: 'manual' },
      [Q.checking]: { status: 'completed', at: 99, source: 'manual' },
      [Q.debut]: { status: 'completed', at: 99, source: 'manual' }
    })
    expect(markUpTo({}, Q.firstAid, byId, 1)[Q.debut].status).toBe('failed')
    // Already-recorded outcomes stay as they are.
    expect(markUpTo({ [Q.debut]: done(7) }, Q.checking, byId, 99)[Q.debut]).toEqual(done(7))
  })

  it('drops log entries before a full rescan, keeping manual ones', () => {
    const p: QuestProgress = { a: done(), b: { status: 'failed', at: 2, source: 'manual' } }
    expect(withoutLogEntries(p)).toEqual({ b: p.b })
  })
})

describe('neededItems', () => {
  it('adds up single-item hand-overs and lists "any of" objectives separately', () => {
    const { items, anyOf } = neededItems([get(Q.debut), get(Q.shootout)])
    expect(items).toEqual([
      {
        itemId: '5448be9a4bdc2dfd2f8b456a',
        count: 2,
        foundInRaid: true,
        quests: [{ questId: Q.debut, name: 'Debut', count: 2 }]
      }
    ])
    expect(anyOf.map((a) => a.objective.id)).toEqual(['o-shootout-give'])
  })

  it('leaves out what has been handed over already', () => {
    const progress = setObjective(
      setObjective({}, Q.debut, 'o-debut-give', 1),
      Q.shootout,
      'o-shootout-give',
      2
    )
    const { items, anyOf } = neededItems([get(Q.debut), get(Q.shootout)], progress)
    expect(items.map((i) => [i.itemId, i.count, i.quests[0].count])).toEqual([
      ['5448be9a4bdc2dfd2f8b456a', 1, 1]
    ])
    expect(anyOf.map((a) => a.count)).toEqual([(get(Q.shootout).objectives.at(-1)!.count ?? 1) - 2])
    // All handed over: nothing left.
    expect(neededItems([get(Q.debut)], setObjective({}, Q.debut, 'o-debut-give', 2)).items).toEqual([])
  })

  it('collects the maps a quest involves', () => {
    expect([...questMaps(get(Q.checking))]).toEqual([CUSTOMS])
    expect([...questMaps(get(Q.shootout))]).toEqual([WOODS])
  })
})

describe('objective progress', () => {
  const debut = get(Q.debut)
  const give = debut.objectives.find((o) => o.id === 'o-debut-give')!

  it('counts towards an objective’s target, one for a one-off', () => {
    expect(objectiveTarget(give)).toBe(2)
    expect(objectiveTarget({ count: null })).toBe(1)
    let progress = setObjective({}, Q.debut, give.id, 1)
    expect(objectiveValue(give, Q.debut, progress)).toBe(1)
    progress = setObjective(progress, Q.debut, give.id, 9)
    // Never more than it takes; every objective of a completed quest is done.
    expect(objectiveValue(give, Q.debut, progress)).toBe(2)
    expect(objectiveValue(give, Q.checking, progress)).toBe(0)
    expect(objectiveValue(give, Q.checking, {}, true)).toBe(2)
  })

  it('clears an objective set back to 0, and a quest with none left', () => {
    const progress = setObjective(setObjective({}, Q.debut, give.id, 1), Q.debut, give.id, 0)
    expect(progress).toEqual({})
  })

  it('sums up the required objectives done', () => {
    const progress = setObjective({}, Q.debut, give.id, 2)
    const required = debut.objectives.filter((o) => !o.optional).length
    expect(objectiveSummary(debut, progress)).toEqual({ done: 1, total: required })
    expect(objectiveSummary(debut, {}, true)).toEqual({ done: required, total: required })
  })
})

describe('createPlayerStore', () => {
  const quest = (
    mode: 'pvp' | 'pve',
    questId: string,
    status: 'started' | 'completed',
    t: number
  ): LogEvent => ({
    kind: 'quest',
    mode,
    questId,
    status,
    t
  })

  it('applies log events per game mode and keeps raids and flea sales newest first', async () => {
    const file = join(await tempDir(), 'player.json')
    const store = createPlayerStore({ file, now: () => 1_000 })
    const changed = await store.applyEvents(
      [
        quest('pve', Q.debut, 'started', 10),
        quest('pve', Q.debut, 'completed', 20),
        {
          kind: 'fleaSold',
          t: 30,
          mode: 'pvp',
          itemId: 'x',
          count: 1,
          buyer: 'B',
          payment: { currency: 'RUB', amount: 5 }
        },
        {
          kind: 'raid',
          mode: 'pvp',
          raid: {
            map: 'bigmap',
            raidId: 'A',
            side: 'pmc',
            online: true,
            queueSeconds: 1,
            loadSeconds: 2,
            foundAt: 40,
            startedAt: 41,
            endedAt: 50
          }
        },
        {
          kind: 'raid',
          mode: 'pvp',
          raid: {
            map: 'Woods',
            raidId: 'B',
            side: 'scav',
            online: true,
            queueSeconds: 1,
            loadSeconds: 2,
            foundAt: 60,
            startedAt: 61,
            endedAt: 70
          }
        }
      ],
      false
    )
    expect([...changed].sort()).toEqual(['pve', 'pvp'])
    expect(await store.progress('pve')).toEqual({ [Q.debut]: { status: 'completed', at: 20, source: 'log' } })
    expect(await store.progress('pvp')).toEqual({})
    const history = await store.history('pvp')
    expect(history.raids.map((r) => r.raidId)).toEqual(['B', 'A'])
    expect(history.flea).toEqual([
      { kind: 'sold', t: 30, itemId: 'x', count: 1, buyer: 'B', payment: { currency: 'RUB', amount: 5 } }
    ])

    // Saved: a new store sees the same.
    const reopened = createPlayerStore({ file })
    expect((await reopened.history('pvp')).raids).toHaveLength(2)
  })

  it('takes manual changes, and a rescan keeps only those', async () => {
    const store = createPlayerStore({ file: join(await tempDir(), 'player.json'), now: () => 500 })
    await store.applyEvents([quest('pvp', Q.checking, 'started', 10)], false)
    await store.markUpTo('pvp', Q.checking, quests)
    await store.setStatus('pvp', Q.kappaOnly, 'active')
    const changed = await store.applyEvents([], true)
    expect(changed.size).toBe(3)
    expect(Object.keys(await store.progress('pvp')).sort()).toEqual([Q.checking, Q.debut, Q.kappaOnly].sort())
    await store.setStatus('pvp', Q.kappaOnly, null)
    expect(await store.progress('pvp')).not.toHaveProperty(Q.kappaOnly)
  })

  it('keeps objective progress per game mode', async () => {
    const file = join(await tempDir(), 'player.json')
    const store = createPlayerStore({ file })
    await store.setObjective('pvp', Q.debut, 'o-debut-give', 1)
    await store.setObjective('pve', Q.debut, 'o-debut-give', 2)
    await store.setObjective('pvp', 'story-tour', 'escape-ground-zero', 1)
    const reopened = createPlayerStore({ file })
    expect(await reopened.objectives('pvp')).toEqual({
      [Q.debut]: { 'o-debut-give': 1 },
      'story-tour': { 'escape-ground-zero': 1 }
    })
    expect(await reopened.objectives('pve')).toEqual({ [Q.debut]: { 'o-debut-give': 2 } })
    expect(await reopened.objectives('season')).toEqual({})
  })

  it('keeps the player’s pins on story steps, the same in every mode, and loads files from before them', async () => {
    const file = join(await tempDir(), 'player.json')
    await writeFile(file, JSON.stringify({ version: 1, progress: {}, history: {} }))
    const store = createPlayerStore({ file })
    expect(await store.pins()).toEqual({})
    const pin = { map: 'customs-id', position: { x: 1, y: 2, z: 3 } }
    await store.setPin('story-tour', 'escape-ground-zero', pin)
    await store.setPin('story-tour', 'talk-to-skier', { ...pin, map: 'woods-id' })
    expect(await createPlayerStore({ file }).pins()).toEqual({
      'story-tour': { 'escape-ground-zero': pin, 'talk-to-skier': { ...pin, map: 'woods-id' } }
    })
    await store.setPin('story-tour', 'escape-ground-zero', null)
    await store.setPin('story-tour', 'talk-to-skier', null)
    expect(await createPlayerStore({ file }).pins()).toEqual({})
  })

  it('stops taking new pins at the limit, but still moves the ones there', async () => {
    const file = join(await tempDir(), 'player.json')
    const pin = { map: 'customs-id', position: { x: 0, y: 0, z: 0 } }
    const full = Object.fromEntries(Array.from({ length: MAX_PINS }, (_, i) => [`step-${i}`, pin]))
    await writeFile(
      file,
      JSON.stringify({ version: 1, progress: {}, history: {}, pins: { 'story-tour': full } })
    )
    const store = createPlayerStore({ file })
    await expect(store.setPin('story-tour', 'one-more', pin)).rejects.toThrow('Too many pins')
    await store.setPin('story-tour', 'step-0', { ...pin, map: 'woods-id' })
    expect((await store.pins())['story-tour']['step-0'].map).toBe('woods-id')
  })
})
