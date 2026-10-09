import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NO_REWARDS } from '../src/main/quests/questData'
import { wikiFacts } from '../src/main/quests/wikiQuests'
import type { Quest, QuestObjective, WikiQuestFacts } from '../src/shared/questTypes'
import { applyWikiCorrections, type CorrectionContext } from '../src/shared/wikiCorrections'

// tarkov.dev's quests as it lists them (October 2026), against their wiki pages (tests/fixtures/wiki).
const page = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/wiki/${name}.wiki`, import.meta.url)), 'utf8')

const MAPS = [
  { id: 'streets', name: 'Streets of Tarkov', normalizedName: 'streets-of-tarkov' },
  { id: 'labyrinth', name: 'The Labyrinth', normalizedName: 'the-labyrinth' },
  { id: 'factory', name: 'Factory', normalizedName: 'factory' },
  { id: 'lighthouse', name: 'Lighthouse', normalizedName: 'lighthouse' },
  { id: 'woods', name: 'Woods', normalizedName: 'woods' },
  { id: 'shoreline', name: 'Shoreline', normalizedName: 'shoreline' },
  { id: 'interchange', name: 'Interchange', normalizedName: 'interchange' },
  { id: 'customs', name: 'Customs', normalizedName: 'customs' },
  { id: 'reserve', name: 'Reserve', normalizedName: 'reserve' },
  { id: 'gz', name: 'Ground Zero', normalizedName: 'ground-zero' }
]
const facts = (title: string, file: string): WikiQuestFacts => wikiFacts(title, page(file), ['Quests'], MAPS)!

const objective = (
  id: string,
  type: string,
  description: string,
  extra: Partial<QuestObjective> = {}
): QuestObjective => ({
  id,
  type,
  description,
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
const quest = (
  id: string,
  name: string,
  objectives: QuestObjective[],
  extra: Partial<Quest> = {}
): Quest => ({
  id,
  name,
  normalizedName: id,
  traderId: 'ragman',
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

const ctx = (extra: Partial<CorrectionContext> = {}): CorrectionContext => ({
  gameMode: 'pvp',
  questIds: new Map([
    ['the huntsman path - administrator', 'administrator'],
    ['broadcast - part 4', 'broadcast-4'],
    ['ballet lover', 'ballet-lover'],
    ['create a distraction - part 1', 'distraction-1']
  ]),
  mapNames: new Map(MAPS.map((m) => [m.id, m.name])),
  itemIds: new Map(),
  traderIds: new Map(),
  ...extra
})

describe('correcting tarkov.dev’s quests from the wiki', () => {
  it('raises the level, sets Kappa and the quests before it, and says what changed', () => {
    const dandies = quest(
      'dandies',
      'Dandies',
      [
        objective(
          'kill',
          'shoot',
          'Eliminate any target while wearing a Bomber beanie and RayBench Hipster Reserve sunglasses on Streets of Tarkov',
          { count: 15, maps: ['streets'] }
        ),
        objective(
          'beanie',
          'plantItem',
          'Stash a Bomber beanie inside the barber shop on Streets of Tarkov',
          { maps: ['streets'] }
        ),
        objective(
          'glasses',
          'plantItem',
          'Stash RayBench Hipster Reserve sunglasses inside the barber shop on Streets of Tarkov',
          { maps: ['streets'] }
        )
      ],
      { minPlayerLevel: 12, kappaRequired: true }
    )
    const [fixed] = applyWikiCorrections([dandies], { dandies: facts('Dandies', 'dandies') }, ctx())
    expect(fixed).toMatchObject({
      minPlayerLevel: 33,
      kappaRequired: false,
      requires: [{ questId: 'ballet-lover', status: ['complete'] }],
      corrections: {
        changes: ['Level 12 → 33', 'Not needed for Kappa', 'Unlocks after Ballet Lover'],
        notes: []
      }
    })
    // The same objectives, ids kept: their counts and wording agree.
    expect(fixed.objectives).toBe(dandies.objectives)
  })

  it('corrects a count and its wording, keeping the objective’s id; in PvE a page noting PvE keeps tarkov.dev’s', () => {
    const vacate = quest('vacate', 'Vacate the Premises', [
      objective('kill', 'shoot', 'Eliminate any target inside The Labyrinth', {
        count: 36,
        maps: ['labyrinth']
      })
    ])
    const f = { vacate: facts('Vacate the Premises', 'vacate-the-premises') }
    const [pvp] = applyWikiCorrections([vacate], f, ctx())
    expect(pvp.objectives).toEqual([
      expect.objectContaining({
        id: 'kill',
        count: 24,
        description: 'Eliminate 24 PMC operatives inside The Labyrinth',
        wiki: { was: 'Eliminate any target inside The Labyrinth (36)' }
      })
    ])
    expect(pvp.corrections!.changes).toContain('Eliminate 24 PMC operatives inside The Labyrinth: 36 → 24')
    const [pve] = applyWikiCorrections([vacate], f, ctx({ gameMode: 'pve' }))
    expect(pve.objectives[0].count).toBe(36)
  })

  it('adds the steps tarkov.dev leaves out, on their maps, and keeps conditions as notes', () => {
    const own = ['factory', 'streets', 'lighthouse', 'shoreline', 'reserve', 'gz'].map((map) =>
      objective(
        map,
        'shoot',
        `Eliminate Scavs with melee weapons on ${MAPS.find((m) => m.id === map)!.name}`,
        { count: 10, maps: [map] }
      )
    )
    const slaughter = quest('slaughter', 'Slaughterhouse', own, { minPlayerLevel: 40 })
    const [fixed] = applyWikiCorrections(
      [slaughter],
      { slaughter: facts('Slaughterhouse', 'slaughterhouse') },
      ctx()
    )
    const added = fixed.objectives.filter((o) => o.wiki && 'added' in o.wiki)
    expect(added.map((o) => [o.type, o.count, o.maps])).toEqual([
      ['shoot', 10, ['woods']],
      ['shoot', 10, ['interchange']],
      ['shoot', 10, ['customs']]
    ])
    expect(added.every((o) => o.id.startsWith('wiki:'))).toBe(true)
    expect(fixed.requires.map((r) => r.questId)).toEqual(['administrator', 'broadcast-4'])

    const distraction = quest(
      'distraction',
      'Create a Distraction - Part 2',
      [
        objective('guards', 'shoot', "Eliminate Kaban's or Kollontay's guards on Streets of Tarkov", {
          count: 2,
          maps: ['streets']
        })
      ],
      { requires: [{ questId: 'distraction-1', status: ['complete'] }] }
    )
    const [noted] = applyWikiCorrections(
      [distraction],
      { distraction: facts('Create a Distraction - Part 2', 'create-a-distraction-part-2') },
      ctx()
    )
    expect(noted.corrections).toEqual({ changes: [], notes: ['Do not harm Kaban or Kollontay'] })
    expect(noted.objectives).toBe(distraction.objectives)
  })

  it('leaves alone: "find" steps beside hand-overs, alternatives before it, faction quests, story and pageless quests', () => {
    const items = [
      'Antique teapot',
      'Antique vase',
      'Axel parrot figurine',
      'Raven figurine',
      'Gold skull ring'
    ]
    const counts = [3, 3, 2, 2, 5]
    const antiques = quest(
      'antiques',
      'Antique Enthusiast',
      items.map((name, i) =>
        objective(`give${i}`, 'giveItem', `Hand over the found in raid item: ${name}`, {
          count: counts[i],
          foundInRaid: true
        })
      ),
      { kappaRequired: true }
    )
    const [same] = applyWikiCorrections(
      [antiques],
      { antiques: facts('Antique Enthusiast', 'antique-enthusiast') },
      ctx()
    )
    expect(same).toBe(antiques)

    const dragnet = quest('dragnet', 'Dragnet', [], { requires: [{ questId: 'x', status: ['complete'] }] })
    const [loose] = applyWikiCorrections([dragnet], { dragnet: facts('Dragnet', 'dragnet') }, ctx())
    expect(loose.requires).toEqual(dragnet.requires)

    const usec = quest('usec', 'Slaughterhouse', [], { faction: 'USEC', minPlayerLevel: 40 })
    const [side] = applyWikiCorrections([usec], { usec: facts('Slaughterhouse', 'slaughterhouse') }, ctx())
    expect(side.objectives).toEqual([])

    const story = quest('story', 'Tour', [], { story: { description: '', howItStarts: '' } })
    const pageless = quest('pageless', 'Pageless', [])
    const out = applyWikiCorrections([story, pageless], { story: facts('Dandies', 'dandies') }, ctx())
    expect(out[0]).toBe(story)
    expect(out[1]).toBe(pageless)
  })

  it('takes only counts a step states up front, and notes hand-overs and skill levels tarkov.dev doesn’t have', () => {
    const step = (text: string, count: number | null): WikiQuestFacts['objectives'][number] => ({
      id: text.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      text,
      optional: false,
      depth: 0,
      count,
      itemNames: [],
      handOver: /^hand over/i.test(text),
      foundInRaid: false,
      branch: null,
      maps: [],
      guide: '',
      visits: false,
      loyalty: null
    })
    const f: WikiQuestFacts = {
      title: 'Kind of Sabotage',
      level: null,
      kappa: null,
      previous: [],
      previousLoose: false,
      maps: [],
      byFaction: false,
      pveNote: false,
      objectives: [
        step('Hand over Secure Folder 0052 to Skier', 52),
        step('Eliminate 5 PMC operatives on Customs', 5),
        step('Hand over 2 Power cords to Mechanic', 2),
        step('Reach the required Bolt-action Rifles skill level of 10', 10)
      ]
    }
    const q = quest('sabotage', 'Kind of Sabotage', [
      objective('folder', 'giveQuestItem', 'Hand over Secure Folder 0052 to Skier'),
      objective('kill', 'shoot', 'Eliminate PMC operatives on Customs', { count: 8, maps: ['customs'] })
    ])
    const [fixed] = applyWikiCorrections([q], { sabotage: f }, ctx())
    expect(fixed.objectives.map((o) => [o.id, o.count])).toEqual([
      ['folder', 1],
      ['kill', 5]
    ])
    expect(fixed.corrections!.notes).toEqual([
      'The wiki also has: Hand over 2 Power cords to Mechanic',
      'The wiki also has: Reach the required Bolt-action Rifles skill level of 10'
    ])
  })
})
