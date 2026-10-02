import { describe, expect, it } from 'vitest'
import type { StoryChapter } from '../src/shared/questTypes'
import { namedPlace, type MapPlace } from '../src/shared/storyPlaces'
import { storyQuests } from '../src/shared/storyQuests'

const at = (x: number) => ({ x, y: 0, z: -x })
const PLACES: MapPlace[] = [
  { name: 'Resort', position: at(1) },
  { name: 'Dorms', position: at(2) },
  { name: 'Hole', position: at(3) },
  { name: 'Tunnel', position: at(4) },
  { name: 'Transit to Woods', position: at(5), aliases: ['Woods transit'] },
  { name: 'Old Sawmill', position: at(6) },
  { name: 'Sawmill', position: at(7) },
  { name: 'K1', position: at(8) }
]
const named = (text: string, guide: string | null = null): string | null =>
  namedPlace(text, guide, PLACES)?.name ?? null

describe('the place a story step names', () => {
  it('finds a place named in the step, as a name', () => {
    expect(named("Locate A.P.'s room in the Health Resort")).toBe('Resort')
    expect(named('Launch a yellow signal flare at the Woods transit on Reserve')).toBe('Transit to Woods')
    // The first one named.
    expect(named('Search the Dorms near the Resort')).toBe('Dorms')
    // "the hole in the wall" isn't the place called Hole, and short names are left out.
    expect(named('Find the hole in the wall')).toBeNull()
    expect(named('Go to K1')).toBeNull()
  })

  it('falls back on the guide only when it names one place', () => {
    expect(named('Locate the flash drive', 'It lies next to the "Tunnel" extraction on Shoreline.')).toBe(
      'Tunnel'
    )
    // Old Sawmill and the Sawmill in it are one place.
    expect(named('Locate the outpost', 'The outpost is north of the Old Sawmill.')).toBe('Old Sawmill')
    expect(named('Locate the outpost', 'Somewhere between the Resort and the Dorms.')).toBeNull()
    // The step's own place wins.
    expect(named('Search the Dorms', 'Next to the Tunnel.')).toBe('Dorms')
  })
})

describe('story steps on the maps', () => {
  const chapter: StoryChapter = {
    id: 'story-test',
    name: 'Test',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Test',
    description: '',
    howItStarts: '',
    imageLink: null,
    objectives: [
      ['resort', "Locate A.P.'s room in the Health Resort", ['shoreline']],
      ['plane', 'Locate the fallen plane', ['woods']],
      ['mine', 'Search the Dorms', ['customs']],
      ['terminal', 'Use the intercom to contact the port garrison', []],
      ['prapor', 'Reach Loyalty Level 2 with Prapor', []]
    ].map(([id, text, maps]) => ({
      id: id as string,
      text: text as string,
      optional: false,
      depth: 0,
      count: null,
      itemNames: [],
      handOver: false,
      foundInRaid: false,
      branch: null,
      maps: maps as string[],
      guide: null,
      visits: false,
      loyalty: id === 'prapor' ? { trader: 'Prapor', level: 2 } : null
    }))
  }

  it('pins a step roughly at the place it names, or where the player put it', () => {
    const pin = { map: 'shoreline', position: { x: 10, y: 1, z: 20 } }
    const [quest] = storyQuests([chapter], {
      itemIds: new Map(),
      traderIds: new Map([['prapor', 'prapor-id']]),
      places: new Map([
        ['shoreline', PLACES],
        ['customs', PLACES]
      ]),
      pins: { 'story-test': { mine: { map: 'customs', position: at(9) }, terminal: pin } }
    })
    const byId = new Map(quest.objectives.map((o) => [o.id, o]))
    expect(byId.get('resort')).toMatchObject({
      maps: ['shoreline'],
      zones: [{ map: 'shoreline', position: at(1), outline: [], source: 'rough', place: 'Resort' }]
    })
    // On Woods, but naming no place there: listed, not pinned.
    expect(byId.get('plane')).toMatchObject({ maps: ['woods'], zones: [] })
    // The player's pin beats the rough one.
    expect(byId.get('mine')!.zones).toEqual([
      { map: 'customs', position: at(9), outline: [], source: 'mine' }
    ])
    // A pin puts a step on a map the wiki didn't name.
    expect(byId.get('terminal')).toMatchObject({ maps: ['shoreline'], zones: [{ source: 'mine' }] })
    expect(byId.get('prapor')!.traderLevel).toEqual({ traderId: 'prapor-id', level: 2 })
  })
})
