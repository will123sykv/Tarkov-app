import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LogEvent } from '../src/main/logs/interpret'
import { normalizeQuestData } from '../src/main/quests/questData'
import { createPlayerStore } from '../src/main/quests/playerStore'
import {
  applyQuestEvent,
  forFaction,
  lockReasons,
  markUpTo,
  neededItems,
  questMaps,
  questStatus,
  setQuestStatus,
  withoutLogEntries,
  type QuestProgress
} from '../src/shared/questProgress'
import { tempDir } from './helpers'
import { CUSTOMS, Q, RAW_QUEST_DATA, WOODS } from './questFixtures'

const { quests } = normalizeQuestData(RAW_QUEST_DATA, 'pvp', 0)
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

  it('collects the maps a quest involves', () => {
    expect([...questMaps(get(Q.checking))]).toEqual([CUSTOMS])
    expect([...questMaps(get(Q.shootout))]).toEqual([WOODS])
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
})
