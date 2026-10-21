import { describe, expect, it } from 'vitest'
import { NO_REWARDS } from '../src/main/quests/questData'
import type { Quest, QuestObjective } from '../src/shared/questTypes'
import { todoPlan, type MapGroup } from '../src/shared/todo'
import {
  bestGuns,
  gunFor,
  gunForObjective,
  gunOptions,
  killForGun,
  mapGun,
  mapKills,
  questGunMaps,
  toggleGun
} from '../src/shared/weapons'

const CUSTOMS = 'customs-id'
const WOODS = 'woods-id'
const GROUPS: MapGroup[] = [
  { key: 'customs', name: 'Customs', mapIds: [CUSTOMS] },
  { key: 'woods', name: 'Woods', mapIds: [WOODS] }
]
const groupOf = (mapId: string): MapGroup | undefined => GROUPS.find((g) => g.mapIds.includes(mapId))

const kill = (id: string, weapons: string[], maps = [CUSTOMS], count = 5): QuestObjective => ({
  id,
  type: 'shoot',
  description: `Kill ${id}`,
  optional: false,
  count,
  maps,
  items: [],
  foundInRaid: false,
  questItem: null,
  zones: [],
  locations: [],
  traderLevel: null,
  playerLevel: null,
  questStatus: null,
  requiredKeys: [],
  weapons
})
const quest = (id: string, objectives: QuestObjective[]): Quest => ({
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
  imageLink: null
})

// Customs: an AKM or AKMS kill and an M4 or AKMS kill; any map: an AKMS or SVD kill; Woods: an SV-98 kill.
const akm = kill('akm', ['akm', 'akms'])
const m4 = kill('m4', ['m4a1', 'akms'])
const anywhere = kill('anywhere', ['akms', 'svd'], [])
const sv98 = kill('sv98', ['sv98'], [WOODS])
const plan = todoPlan(
  [
    { quest: quest('a', [akm, sv98]), status: 'active' as const },
    { quest: quest('b', [m4]), status: 'active' as const },
    { quest: quest('c', [anywhere]), status: 'active' as const },
    { quest: quest('d', [kill('plain', [])]), status: 'active' as const }
  ],
  {},
  groupOf
)
const kills = (key: string) => mapKills(plan.maps.find((p) => p.group.key === key)!.steps, plan.anyMap)
const ids = (list: { objective: QuestObjective }[]) => list.map((k) => k.objective.id)

describe('the gun to bring to each map (since 1.54.0)', () => {
  it('lists a map’s kills that need particular weapons, then the ones on any map', () => {
    expect(kills('customs').map((k) => [k.objective.id, k.anyMap])).toEqual([
      ['akm', false],
      ['m4', false],
      ['anywhere', true]
    ])
  })

  it('offers every gun that counts, the ones covering the most first', () => {
    expect(gunOptions(kills('customs')).map((o) => [o.itemId, ids(o.covers)])).toEqual([
      ['akms', ['akm', 'm4', 'anywhere']],
      ['akm', ['akm']],
      ['m4a1', ['m4']],
      ['svd', ['anywhere']]
    ])
  })

  it('suggests the best guns until some are chosen, and says what they miss', () => {
    // The AKMS covers every kill on Customs: suggested alone.
    expect(mapGun(kills('customs'), undefined)).toMatchObject({ itemIds: ['akms'], chosen: false })
    const chosen = mapGun(kills('customs'), ['akm'])!
    expect([chosen.itemIds, chosen.chosen, ids(chosen.covers), ids(chosen.misses)]).toEqual([
      ['akm'],
      true,
      ['akm'],
      ['m4', 'anywhere']
    ])
    // A gun that no longer counts there: back to the suggestion.
    expect(mapGun(kills('customs'), ['sv98'])).toMatchObject({ itemIds: ['akms'], chosen: false })
    expect(mapGun([], ['akm'])).toBeNull()
  })

  it('brings two guns, covering what they do between them (since 1.62.0)', () => {
    const two = mapGun(kills('customs'), ['akm', 'm4a1'])!
    expect(two.itemIds).toEqual(['akm', 'm4a1'])
    expect(two.guns.map((g) => [g.itemId, ids(g.covers)])).toEqual([
      ['akm', ['akm']],
      ['m4a1', ['m4']]
    ])
    expect([ids(two.covers), ids(two.misses)]).toEqual([['akm', 'm4'], ['anywhere']])
    // One of the two no longer counting: the other is kept on its own.
    expect(mapGun(kills('customs'), ['sv98', 'm4a1'])).toMatchObject({ itemIds: ['m4a1'], chosen: true })
  })

  it('suggests the pair that covers the most, or one gun when it covers them all (since 1.62.0)', () => {
    // Woods: the SV-98 kill and the any-map one (AKMS or SVD): no gun covers both.
    expect(bestGuns(kills('woods')).map((o) => o.itemId)).toEqual(['sv98', 'akms'])
    const pair = mapGun(kills('woods'), undefined)!
    expect([pair.itemIds, pair.chosen, pair.misses]).toEqual([['sv98', 'akms'], false, []])
    // Three kills, no gun for more than one: the first two of them.
    const three = [kill('x', ['a']), kill('y', ['b']), kill('z', ['c'])]
    const p = todoPlan([{ quest: quest('t', three), status: 'active' as const }], {}, groupOf)
    const k = mapKills(p.maps[0].steps, [])
    expect(bestGuns(k).map((o) => o.itemId)).toEqual(['a', 'b'])
    // One covering them all: just that one.
    expect(bestGuns(kills('customs')).map((o) => o.itemId)).toEqual(['akms'])
    expect(bestGuns([])).toEqual([])
  })

  it('adds a gun clicked, takes off one chosen, and a third replaces the first (since 1.62.0)', () => {
    expect(toggleGun([], 'akm')).toEqual(['akm'])
    expect(toggleGun(['akm'], 'm4a1')).toEqual(['akm', 'm4a1'])
    expect(toggleGun(['akm', 'm4a1'], 'akm')).toEqual(['m4a1'])
    expect(toggleGun(['akm', 'm4a1'], 'm4a1')).toEqual(['akm'])
    expect(toggleGun(['akm', 'm4a1'], 'svd')).toEqual(['m4a1', 'svd'])
    expect(toggleGun(['akm'], 'akm')).toEqual([])
  })

  it('finds the gun chosen for a kill objective by the maps it’s on', () => {
    const byMap = { customs: ['akms'], woods: ['sv98'] }
    expect(gunForObjective(akm, byMap, groupOf)).toBe('akms')
    expect(gunForObjective(sv98, byMap, groupOf)).toBe('sv98')
    // On any map: a gun chosen for any map that counts.
    expect(gunForObjective(anywhere, byMap, groupOf)).toBe('akms')
    // Chosen for another map, or not one that counts: none.
    expect(gunForObjective(akm, { woods: ['akms'] }, groupOf)).toBeNull()
    expect(gunForObjective(m4, { customs: ['akm'] }, groupOf)).toBeNull()
    // Two guns on a map (since 1.62.0): the one that counts.
    expect(gunForObjective(m4, { customs: ['akm', 'm4a1'] }, groupOf)).toBe('m4a1')
    expect(gunForObjective(akm, { customs: ['akm', 'm4a1'] }, groupOf)).toBe('akm')
  })

  it('finds the maps where a quest’s gun would do for it too (since 1.56.0)', () => {
    // Supply Plans: an AKM or AKMS on Customs and an AKMS on Woods; quest c: an AKMS or SVD on any map.
    const woodsAkms = kill('woods-akms', ['akms'], [WOODS])
    const p = todoPlan(
      [
        { quest: quest('a', [akm, woodsAkms]), status: 'active' as const },
        { quest: quest('c', [anywhere]), status: 'active' as const }
      ],
      {},
      groupOf
    )
    const maps = p.maps.map((m) => ({ key: m.group.key, kills: mapKills(m.steps, p.anyMap) }))
    // The AKMS counts for Supply Plans on both maps; the AKM only on Customs.
    expect(questGunMaps(maps, 'a', 'akms').sort()).toEqual(['customs', 'woods'])
    expect(questGunMaps(maps, 'a', 'akm')).toEqual(['customs'])
    // A kill on any map: every map listed.
    expect(questGunMaps(maps, 'c', 'svd').sort()).toEqual(['customs', 'woods'])
    expect(questGunMaps(maps, 'c', 'm4a1')).toEqual([])
  })

  it('says which kills the map’s gun completes (since 1.57.0)', () => {
    expect(killForGun(akm, ['akms'])).toBe('gun')
    expect(killForGun(sv98, ['akms'])).toBe('other')
    // Two guns (since 1.62.0): either one does, and which is named.
    expect(killForGun(sv98, ['akms', 'sv98'])).toBe('gun')
    expect(gunFor(sv98, ['akms', 'sv98'])).toBe('sv98')
    expect(gunFor(akm, ['m4a1', 'akms'])).toBe('akms')
    expect(gunFor(sv98, ['akms'])).toBeNull()
    // Any weapon will do, or no gun chosen.
    expect(killForGun(kill('plain', []), ['akms'])).toBeNull()
    expect(killForGun(akm, undefined)).toBeNull()
    expect(killForGun(akm, [])).toBeNull()
  })

  it('prefers the gun of the map an objective is shown under, and places it by its zones too (since 1.58.0)', () => {
    const both = kill('both', ['akm', 'm4a1'], [CUSTOMS, WOODS])
    const byMap = { customs: ['akm'], woods: ['m4a1'] }
    expect(gunForObjective(both, byMap, groupOf, 'woods')).toBe('m4a1')
    expect(gunForObjective(both, byMap, groupOf, 'customs')).toBe('akm')
    // A kill placed only by a zone on Woods isn't one for any map.
    const zoned = {
      ...kill('zoned', ['akm', 'm4a1'], []),
      zones: [{ map: WOODS, position: { x: 0, y: 0, z: 0 }, outline: [] }]
    }
    expect(gunForObjective(zoned, byMap, groupOf)).toBe('m4a1')
  })
})
