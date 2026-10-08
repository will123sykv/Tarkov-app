import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { NO_REWARDS } from '../src/main/quests/questData'
import { createPlayerStore } from '../src/main/quests/playerStore'
import {
  EMPTY_FAVOURITES,
  favouriteNeeds,
  sanitizeFavourites,
  type FavouriteInput
} from '../src/shared/favourites'
import { EMPTY_HIDEOUT, type HideoutProgress } from '../src/shared/hideout'
import type { HideoutStation, Quest, QuestObjective } from '../src/shared/questTypes'
import { tempDir } from './helpers'

const objective = (id: string, type: string, extra: Partial<QuestObjective> = {}): QuestObjective => ({
  id,
  type,
  description: `${type} ${id}`,
  optional: false,
  count: 1,
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
const quest = (id: string, name: string, objectives: QuestObjective[]): Quest => ({
  id,
  name,
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

describe('favourites on the map', () => {
  const WORKBENCH: HideoutStation = {
    id: 'wb',
    name: 'Workbench',
    normalizedName: 'workbench',
    imageLink: null,
    levels: [1, 2].map((level) => ({
      level,
      constructionTime: 0,
      items:
        level === 2
          ? [
              { itemId: 'bolts', count: 5, foundInRaid: false },
              { itemId: 'drill', count: 2, foundInRaid: true },
              { itemId: 'ledx', count: 1, foundInRaid: false },
              { itemId: '5449016a4bdc2d6f028b456f', count: 50_000, foundInRaid: false }
            ]
          : [],
      stations: [],
      traders: [],
      skills: []
    }))
  }
  const swag = quest('swag', 'Golden Swag', [
    objective('find', 'findQuestItem', { questItem: { id: 'zibbo-gold', name: 'Golden Zibbo lighter' } }),
    objective('stash', 'plantItem', { items: ['zibbo'], count: 1 }),
    objective('give', 'giveItem', { items: ['drill'], count: 1, foundInRaid: true })
  ])
  const progress = (have: Record<string, number> = {}, wb = 1): HideoutProgress => ({
    ...EMPTY_HIDEOUT,
    levels: { wb },
    have
  })
  const input = (extra: Partial<FavouriteInput> = {}): FavouriteInput => ({
    favourites: EMPTY_FAVOURITES,
    everything: new Map([
      ['drill', { missing: 5, firNeeded: 3 }],
      ['ledx', { missing: 2, firNeeded: 0 }],
      ['bolts', { missing: 4, firNeeded: 0 }]
    ]),
    stations: [WORKBENCH],
    quests: new Map([[swag.id, swag]]),
    finished: () => false,
    objectives: {},
    progress: progress(),
    // Nobody sells the LEDX or barters for it, and the Workbench can't make it.
    canGet: (id) => id !== 'ledx',
    ...extra
  })
  const rows = (i: FavouriteInput) => favouriteNeeds(i).map((n) => [n.itemId, n.count, n.reason, n.for])

  it('lists a starred item’s copies that must be found in raid, or all of one that can’t be got', () => {
    expect(rows(input({ favourites: { ...EMPTY_FAVOURITES, items: ['drill', 'ledx', 'bolts'] } }))).toEqual([
      ['ledx', 2, 'cantGet', ['Starred']],
      // 3 of the 5 must be found in raid; the other 2 can be bought.
      ['drill', 3, 'fir', ['Starred']]
    ])
  })

  it('lists a starred upgrade’s parts, leaving out money and what’s put aside or easy to get', () => {
    const favourites = { ...EMPTY_FAVOURITES, upgrades: ['wb:2'] }
    expect(rows(input({ favourites, progress: progress({ drill: 1 }) }))).toEqual([
      ['ledx', 1, 'cantGet', ['Workbench 2']],
      ['drill', 1, 'fir', ['Workbench 2']]
    ])
    // Once built, it's done with.
    expect(rows(input({ favourites, progress: progress({}, 2) }))).toEqual([])
  })

  it('lists a starred quest’s hand-overs to find in raid and its quest items, and merges the same item', () => {
    const favourites = { ...EMPTY_FAVOURITES, quests: ['swag'], upgrades: ['wb:2'] }
    expect(rows(input({ favourites }))).toEqual([
      ['ledx', 1, 'cantGet', ['Workbench 2']],
      ['drill', 3, 'fir', ['Workbench 2', 'Golden Swag']],
      ['zibbo-gold', 1, 'questItem', ['Golden Swag']]
    ])
    expect(favouriteNeeds(input({ favourites })).find((n) => n.itemId === 'zibbo-gold')?.name).toBe(
      'Golden Zibbo lighter'
    )
    // The lighter picked up, and a finished quest, leave the list.
    expect(
      rows(
        input({ favourites: { ...EMPTY_FAVOURITES, quests: ['swag'] }, objectives: { swag: { find: 1 } } })
      )
    ).toEqual([['drill', 1, 'fir', ['Golden Swag']]])
    expect(
      rows(input({ favourites: { ...EMPTY_FAVOURITES, quests: ['swag'] }, finished: () => true }))
    ).toEqual([])
  })

  it('keeps saved favourites to ids, once each', () => {
    expect(sanitizeFavourites({ items: ['a', 'a', 7, 'bad id!'], upgrades: ['wb:2'], quests: 'x' })).toEqual({
      items: ['a'],
      upgrades: ['wb:2'],
      quests: []
    })
    expect(sanitizeFavourites(null)).toEqual(EMPTY_FAVOURITES)
  })

  it('saves favourites per game mode, and reads files from before them', async () => {
    const file = join(await tempDir(), 'player.json')
    await writeFile(file, JSON.stringify({ version: 1, progress: {} }))
    const store = createPlayerStore({ file })
    expect(await store.favourites('pvp')).toEqual(EMPTY_FAVOURITES)
    await store.setFavourite('pvp', 'quests', 'swag', true)
    await store.setFavourite('pvp', 'quests', 'swag', true)
    await store.setFavourite('pvp', 'upgrades', 'wb:2', true)
    expect(await store.favourites('pve')).toEqual(EMPTY_FAVOURITES)
    expect(await createPlayerStore({ file }).favourites('pvp')).toEqual({
      items: [],
      upgrades: ['wb:2'],
      quests: ['swag']
    })
    expect((await store.setFavourite('pvp', 'quests', 'swag', false)).quests).toEqual([])
  })
})
