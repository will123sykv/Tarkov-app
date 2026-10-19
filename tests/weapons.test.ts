import { describe, expect, it } from 'vitest'
import { NO_REWARDS } from '../src/main/quests/questData'
import type { Quest, QuestObjective } from '../src/shared/questTypes'
import { todoPlan, type MapGroup } from '../src/shared/todo'
import { gunForObjective, gunOptions, mapGun, mapKills } from '../src/shared/weapons'

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

  it('suggests the best gun until one is chosen, and says what it misses', () => {
    expect(mapGun(kills('customs'), undefined)).toMatchObject({ itemId: 'akms', chosen: false })
    const chosen = mapGun(kills('customs'), 'akm')!
    expect([chosen.itemId, chosen.chosen, ids(chosen.covers), ids(chosen.misses)]).toEqual([
      'akm',
      true,
      ['akm'],
      ['m4', 'anywhere']
    ])
    // A gun that no longer counts there: back to the suggestion.
    expect(mapGun(kills('customs'), 'sv98')).toMatchObject({ itemId: 'akms', chosen: false })
    expect(mapGun([], 'akm')).toBeNull()
  })

  it('finds the gun chosen for a kill objective by the maps it’s on', () => {
    const byMap = { customs: 'akms', woods: 'sv98' }
    expect(gunForObjective(akm, byMap, groupOf)).toBe('akms')
    expect(gunForObjective(sv98, byMap, groupOf)).toBe('sv98')
    // On any map: a gun chosen for any map that counts.
    expect(gunForObjective(anywhere, byMap, groupOf)).toBe('akms')
    // Chosen for another map, or not one that counts: none.
    expect(gunForObjective(akm, { woods: 'akms' }, groupOf)).toBeNull()
    expect(gunForObjective(m4, { customs: 'akm' }, groupOf)).toBeNull()
  })
})
