import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { FetchFn } from '../src/main/pricing/http'
import {
  createWikiQuestService,
  fetchEventQuests,
  fetchWikiFacts,
  parseWikiQuest,
  titleFromInput,
  wikiFacts
} from '../src/main/quests/wikiQuests'
import { nextWikiQuests, wikiQuestId, wikiQuests } from '../src/shared/wikiQuests'
import { jsonResponse, tempDir } from './helpers'

// Quest pages from the Escape from Tarkov wiki (CC BY-SA), as of October 2026: Fog of War and
// Number Temporarily Unavailable (this event's), Party Preparations (an old event's, trimmed, with a
// skill reward added) and Debut (a regular quest); and regular quests whose pages differ from
// tarkov.dev's data: Dandies, Vacate the Premises, Slaughterhouse, Create a Distraction - Part 2,
// Dragnet, Antique Enthusiast and The Survivalist Path - Wounded Beast.
const page = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/wiki/${name}.wiki`, import.meta.url)), 'utf8')
const FOG = page('fog-of-war')
const NUMBER = page('number-temporarily-unavailable')
const PARTY = page('party-preparations')
const DEBUT = page('debut')

const MAPS = [
  { id: 'lighthouse-id', name: 'Lighthouse', normalizedName: 'lighthouse' },
  { id: 'woods-id', name: 'Woods', normalizedName: 'woods' },
  { id: 'customs-id', name: 'Customs', normalizedName: 'customs' },
  { id: 'interchange-id', name: 'Interchange', normalizedName: 'interchange' },
  { id: 'gz-id', name: 'Ground Zero', normalizedName: 'ground-zero' }
]

describe('reading a quest from its wiki page', () => {
  it('reads an event quest: who gives it, where, what it follows and leads to, and its steps', () => {
    const quest = parseWikiQuest('Fog of War', FOG, ['Event_content', 'Quests'], MAPS)!
    expect(quest).toMatchObject({
      title: 'Fog of War',
      name: 'Fog of War',
      wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Fog_of_War',
      event: true,
      past: false,
      trader: 'Prapor',
      maps: ['lighthouse-id'],
      loyaltyLevel: 2,
      previous: [],
      leadsTo: ['Number Temporarily Unavailable'],
      kappa: false
    })
    expect(quest.description).toMatch(/^Hey\. Been out by the treatment plant lately\?/)
    expect(quest.objectives.map((o) => [o.text.slice(0, 40), o.maps])).toEqual([
      ["Scout the Rogues' position near the BRDM", ['lighthouse-id']],
      ["Scout the Rogues' checkpoint with the gu", ['lighthouse-id']],
      ['Scout the water treatment plant territor', ['lighthouse-id']]
    ])
    expect(quest.rewards).toEqual({
      experience: 10_000,
      money: [{ currency: '₽', amount: 300_000 }],
      items: [
        { name: 'SVDS 7.62x54R sniper rifle', count: 1 },
        { name: 'SVD 7.62x54R 10-round magazine', count: 3 },
        { name: '7.62x54mm R PS gzh ammo pack (20 pcs)', count: 2 }
      ],
      standing: [],
      other: []
    })
  })

  it('reads items to stash, and the quest before', () => {
    const quest = parseWikiQuest('Number Temporarily Unavailable', NUMBER, [], MAPS)!
    expect(quest).toMatchObject({
      event: true,
      past: false,
      previous: ['Fog of War'],
      leadsTo: ['All-Inclusive Support'],
      loyaltyLevel: null,
      kappa: false
    })
    expect(quest.objectives.map((o) => [o.itemNames, o.count, o.handOver, o.maps])).toEqual([
      [['Electronic components'], 3, false, ['lighthouse-id']],
      [['Military cable'], null, false, ['lighthouse-id']],
      [['Capacitors'], 3, false, ['lighthouse-id']]
    ])
    expect(quest.rewards.items).toEqual([{ name: '6B45 armored rig (Medic, EMR)', count: 2 }])
  })

  it('marks an old event’s quest, and reads hand-overs, reputation and other rewards', () => {
    const quest = parseWikiQuest('Party Preparations', PARTY, [], MAPS)!
    expect(quest).toMatchObject({
      event: true,
      past: true,
      trader: 'Ragman',
      maps: [],
      previous: ['Only Business']
    })
    expect(quest.objectives.map((o) => [o.handOver, o.count, o.foundInRaid, o.itemNames[0], o.maps])).toEqual(
      [
        [true, 5, true, 'Santa hat', []],
        [true, 5, true, 'Ded Moroz hat', []],
        [true, 5, true, 'Fake white beard', []]
      ]
    )
    expect(quest.rewards).toEqual({
      experience: 5_400,
      money: [{ currency: '₽', amount: 47_000 }],
      items: [{ name: 'First Spear Strandhogg plate carrier (Ranger Green)', count: 1 }],
      standing: [{ trader: 'Ragman', value: 0.01 }],
      other: ['+1 level Charisma']
    })
  })

  it('reads a regular quest the same way, and nothing from a page that isn’t a quest’s', () => {
    expect(parseWikiQuest('Debut', DEBUT, ['Quests'], MAPS)).toMatchObject({
      event: false,
      past: false,
      trader: 'Prapor',
      maps: ['woods-id', 'gz-id', 'interchange-id', 'customs-id'],
      loyaltyLevel: 1,
      kappa: true,
      rewards: { experience: 3_000, standing: [{ trader: 'Prapor', value: 0.1 }] }
    })
    expect(parseWikiQuest('Santa hat', "'''Santa hat''' is a hat.\n==Location==\n* Scavs", [])).toBeNull()
  })

  it('reads a page saved with Windows line endings the same', () => {
    const windows = FOG.replace(/\r?\n/g, '\r\n')
    expect(parseWikiQuest('Fog of War', windows, [], MAPS)).toEqual(
      parseWikiQuest('Fog of War', FOG, [], MAPS)
    )
    expect(parseWikiQuest('Fog of War', windows, [], MAPS)?.leadsTo).toEqual([
      'Number Temporarily Unavailable'
    ])
  })

  it('takes a page’s title from a link or a name', () => {
    expect(titleFromInput('https://escapefromtarkov.fandom.com/wiki/Fog_of_War')).toBe('Fog of War')
    expect(titleFromInput('escapefromtarkov.fandom.com/wiki/Fog_of_War#Guide')).toBe('Fog of War')
    expect(titleFromInput('https://escapefromtarkov.fandom.com/wiki/What%E2%80%99s_Your_Evidence%3F')).toBe(
      'What’s Your Evidence?'
    )
    expect(titleFromInput('  Fog of War ')).toBe('Fog of War')
    expect(titleFromInput('https://tarkov.dev/task/debut')).toBeNull()
    expect(titleFromInput('   ')).toBeNull()
  })
})

/** A wiki serving pages by title, an event category in two batches, and a search. */
function fakeWiki(pages: Record<string, { text: string; categories?: string[] }>) {
  return vi.fn<FetchFn>(async (url) => {
    const params = new URL(url).searchParams
    if (params.get('action') === 'parse') {
      const title = params.get('page')!
      const p = pages[title]
      if (!p)
        return jsonResponse({
          error: { code: 'missingtitle', info: 'The page you specified does not exist.' }
        })
      return jsonResponse({
        parse: { title, wikitext: p.text, categories: (p.categories ?? []).map((category) => ({ category })) }
      })
    }
    if (params.get('list') === 'search') {
      const hit = Object.keys(pages).find((t) =>
        t.toLowerCase().includes(params.get('srsearch')!.toLowerCase())
      )
      return jsonResponse({ query: { search: hit ? [{ title: hit }] : [] } })
    }
    const cat = (title: string) => ({ ns: 14, title })
    if (!params.get('gcmcontinue'))
      return jsonResponse({
        continue: { gcmcontinue: 'page|2', continue: 'gcmcontinue||' },
        query: {
          pages: [
            { title: 'Santa hat' },
            {
              title: 'Party Preparations',
              categories: [cat('Category:Historical content'), cat('Category:Quests')]
            },
            { title: 'Number Temporarily Unavailable', categories: [cat('Category:Quests')] }
          ]
        }
      })
    return jsonResponse({ query: { pages: [{ title: 'Fog of War', categories: [cat('Category:Quests')] }] } })
  })
}

describe('the wiki quest service', () => {
  it('lists the wiki’s event quests, this event’s first', async () => {
    expect(await fetchEventQuests(fakeWiki({}))).toEqual([
      { title: 'Fog of War', past: false },
      { title: 'Number Temporarily Unavailable', past: false },
      { title: 'Party Preparations', past: true }
    ])
  })

  it('reads the quests added, caching them, and keeps what it had when the wiki can’t be reached', async () => {
    const cacheDir = await tempDir()
    let time = 1_000
    const wiki = fakeWiki({ 'Fog of War': { text: FOG, categories: ['Event_content', 'Quests'] } })
    const service = createWikiQuestService({ fetchFn: wiki, cacheDir, now: () => time })
    const first = await service.get(['Fog of War', 'Nowhere'], MAPS)
    expect(first.quests.map((q) => [q.title, q.event, q.maps])).toEqual([
      ['Fog of War', true, ['lighthouse-id']]
    ])
    expect(Object.keys(first.errors)).toEqual(['Nowhere'])
    const calls = wiki.mock.calls.length
    // Fresh: from the cache.
    await service.get(['Fog of War'], MAPS)
    expect(wiki.mock.calls.length).toBe(calls)
    // A day later, with the wiki down: what it had, read again from a new service (the file).
    time += 24 * 3_600_000
    const offline = createWikiQuestService({
      fetchFn: vi.fn<FetchFn>(async () => {
        throw new Error('offline')
      }),
      cacheDir,
      now: () => time
    })
    const again = await offline.get(['Fog of War'], MAPS)
    expect(again.quests.map((q) => q.title)).toEqual(['Fog of War'])
    expect(again.errors).toEqual({})
  })

  it('finds a pasted link or name, and turns down pages that aren’t quests', async () => {
    const service = createWikiQuestService({
      fetchFn: fakeWiki({ 'Fog of War': { text: FOG }, 'Santa hat': { text: "'''Santa hat''' is a hat." } }),
      cacheDir: await tempDir()
    })
    expect(await service.resolve('https://escapefromtarkov.fandom.com/wiki/Fog_of_War')).toEqual({
      title: 'Fog of War'
    })
    expect(await service.resolve('fog of')).toEqual({ title: 'Fog of War' })
    expect(await service.resolve('Santa hat')).toEqual({ error: '“Santa hat” isn’t a quest’s page.' })
    const offline = createWikiQuestService({
      fetchFn: vi.fn<FetchFn>(async () => {
        throw new Error('offline')
      }),
      cacheDir: await tempDir()
    })
    expect(await offline.resolve('Fog of War')).toEqual({ error: 'Couldn’t reach the wiki: offline' })
    expect(await service.resolve('Nothing like it')).toEqual({
      error: 'The wiki has no page called “Nothing like it”.'
    })
  })
})

describe('event quests as quests', () => {
  const ROUBLES = '5449016a4bdc2d6f028b456f'
  const ctx = {
    itemIds: new Map([
      ['electronic components', 'ec'],
      ['capacitors', 'caps'],
      ['santa hat', 'hat'],
      ['svds 7.62x54r sniper rifle', 'svds']
    ]),
    traderIds: new Map([
      ['prapor', 'prapor-id'],
      ['ragman', 'ragman-id']
    ]),
    questIds: new Map([['fog of war', wikiQuestId('Fog of War')]])
  }
  const fog = parseWikiQuest('Fog of War', FOG, ['Event_content'], MAPS)!
  const number = parseWikiQuest('Number Temporarily Unavailable', NUMBER, [], MAPS)!
  const party = parseWikiQuest('Party Preparations', PARTY, [], MAPS)!
  const [fogQuest, numberQuest, partyQuest] = wikiQuests([fog, number, party], ctx)

  it('puts them under their trader, with what they need and the trader’s loyalty level', () => {
    expect(fogQuest).toMatchObject({
      id: 'wiki-fog-of-war',
      name: 'Fog of War',
      traderId: 'prapor-id',
      map: 'lighthouse-id',
      requires: [],
      traderRequirements: [{ traderId: 'prapor-id', type: 'level', compareMethod: '>=', value: 2 }],
      experience: 10_000,
      wiki: { title: 'Fog of War', event: true, past: false }
    })
    // After Fog of War (added too).
    expect(numberQuest.requires).toEqual([{ questId: 'wiki-fog-of-war', status: ['complete'] }])
    expect(partyQuest.wiki?.past).toBe(true)
  })

  it('gives each step a type from its wording, with the items it takes', () => {
    expect(fogQuest.objectives.map((o) => [o.type, o.maps])).toEqual([
      ['visit', ['lighthouse-id']],
      ['visit', ['lighthouse-id']],
      ['visit', ['lighthouse-id']]
    ])
    // A military cable isn't an item the app knows: the step is still listed, without an item.
    expect(numberQuest.objectives.map((o) => [o.type, o.items, o.count])).toEqual([
      ['plantItem', ['ec'], 3],
      ['story', [], null],
      ['plantItem', ['caps'], 3]
    ])
    expect(partyQuest.objectives.map((o) => [o.type, o.items, o.foundInRaid])).toEqual([
      ['giveItem', ['hat'], true],
      ['story', [], true],
      ['story', [], true]
    ])
  })

  it('matches rewards to items and traders, listing the rest by name', () => {
    expect(fogQuest.rewards.items).toEqual([
      { itemId: ROUBLES, count: 300_000 },
      { itemId: 'svds', count: 1 }
    ])
    expect(fogQuest.rewards.other).toEqual([
      '3 × SVD 7.62x54R 10-round magazine',
      '2 × 7.62x54mm R PS gzh ammo pack (20 pcs)'
    ])
    expect(partyQuest.rewards.traderStanding).toEqual([{ traderId: 'ragman-id', standing: 0.01 }])
    expect(partyQuest.rewards.other).toContain('+1 level Charisma')
  })

  it('offers the quests the added ones lead to', () => {
    expect(nextWikiQuests([fog, number], ['Fog of War', 'Number Temporarily Unavailable'])).toEqual([
      'All-Inclusive Support'
    ])
    expect(nextWikiQuests([fog], ['Fog of War'])).toEqual(['Number Temporarily Unavailable'])
  })
})

describe('what a quest’s wiki page says, to correct tarkov.dev with', () => {
  const MORE_MAPS = [
    ...MAPS,
    { id: 'streets-id', name: 'Streets of Tarkov', normalizedName: 'streets-of-tarkov' },
    { id: 'labyrinth-id', name: 'The Labyrinth', normalizedName: 'the-labyrinth' },
    { id: 'factory-id', name: 'Factory', normalizedName: 'factory' },
    { id: 'shoreline-id', name: 'Shoreline', normalizedName: 'shoreline' },
    { id: 'reserve-id', name: 'Reserve', normalizedName: 'reserve' }
  ]

  it('reads the level, Kappa (in its coloured font), the quests before it and the steps', () => {
    expect(wikiFacts('Dandies', page('dandies'), ['Quests'], MORE_MAPS)).toMatchObject({
      title: 'Dandies',
      level: 33,
      kappa: false,
      previous: ['Ballet Lover'],
      previousLoose: false,
      maps: ['streets-id'],
      byFaction: false,
      pveNote: false
    })
    const beast = wikiFacts('The Survivalist Path - Wounded Beast', page('wounded-beast'), ['Quests'])!
    expect(beast).toMatchObject({ level: null, kappa: true, previous: ['The Survivalist Path - Zhivchik'] })
    expect(beast.objectives.map((o) => o.text)).toEqual([
      'Eliminate 3 Scavs while suffering from pain effect'
    ])
  })

  it('notes a PvE difference, quests before it that are alternatives, and several maps', () => {
    const vacate = wikiFacts('Vacate the Premises', page('vacate-the-premises'), ['Quests'], MORE_MAPS)!
    expect(vacate).toMatchObject({ pveNote: true, maps: ['labyrinth-id'] })
    expect(vacate.objectives.map((o) => [o.text, o.count])).toEqual([
      ['Eliminate 24 PMC operatives inside The Labyrinth', 24]
    ])
    expect(wikiFacts('Dragnet', page('dragnet'), ['Quests'])).toMatchObject({
      previous: ['One Less Loose End', 'A Healthy Alternative'],
      previousLoose: true
    })
    const slaughter = wikiFacts('Slaughterhouse', page('slaughterhouse'), ['Quests'], MORE_MAPS)!
    expect(slaughter).toMatchObject({ level: 40, previousLoose: false })
    expect(slaughter.previous).toHaveLength(2)
    expect(slaughter.objectives).toHaveLength(9)
    expect(slaughter.objectives.every((o) => o.count === 10)).toBe(true)
  })

  it('fetches pages 50 at a time, through redirects, by quest id; leaving out missing ones', async () => {
    const titles = new Map<string, string>(Array.from({ length: 51 }, (_, i) => [`q${i}`, `Quest ${i}`]))
    titles.set('dandies-id', 'dandies')
    const calls: URL[] = []
    const fetchFn = vi.fn(async (input: string) => {
      const url = new URL(input)
      calls.push(url)
      const asked = url.searchParams.get('titles')!.split('|')
      const query: Record<string, unknown> = {
        pages: asked.filter((t) => t !== 'dandies').map((t) => ({ title: t, missing: true }))
      }
      if (asked.includes('dandies')) {
        query.normalized = [{ from: 'dandies', to: 'Dandies' }]
        query.redirects = [{ from: 'Dandies', to: 'Dandies (quest)' }]
        ;(query.pages as unknown[]).push({
          title: 'Dandies (quest)',
          revisions: [{ slots: { main: { content: page('dandies') } } }],
          categories: [{ title: 'Category:Quests' }]
        })
      }
      return jsonResponse({ query })
    }) as unknown as FetchFn
    const facts = await fetchWikiFacts(fetchFn, titles, MORE_MAPS)
    expect(calls).toHaveLength(2)
    expect(calls[0].searchParams.get('titles')!.split('|')).toHaveLength(50)
    expect(Object.keys(facts)).toEqual(['dandies-id'])
    expect(facts['dandies-id']).toMatchObject({ title: 'Dandies (quest)', level: 33 })
  })
})
