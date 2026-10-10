import { describe, expect, it, vi } from 'vitest'
import {
  chapterList,
  fetchStoryChapters,
  parseDescription,
  parseHowItStarts,
  parseObjectives
} from '../src/main/quests/storyChapters'
import { reachableSteps, storyQuests } from '../src/shared/storyQuests'
import type { FetchFn } from '../src/main/pricing/http'
import { jsonResponse } from './helpers'

// Excerpts of the Escape from Tarkov wiki's story chapter pages (CC BY-SA), as of October 2026.

const LIST = `'''{{PAGENAME}}''' in ''[[Escape from Tarkov]]'' are multistage quests.
{| class="wikitable sortable stickyheader"
!Icon
!Chapter
!Banner
|-
|style="text-align:center;"|[[File:Batya Icon.png|link=Batya]]
|[[Batya]]
|[[File:Batya Banner.png|450px]]
|-
|style="text-align:center;"|[[File:Falling Skies Icon.png|link=Falling Skies]]
|[[Falling Skies]]
|[[File:Falling Skies Banner.png|450px]]
|-
|style="text-align:center;"|[[File:The Labyrinth Chapter Icon.png|link=The Labyrinth (story chapter)]]
|[[The Labyrinth (story chapter)|The Labyrinth]]
|[[File:The Labyrinth Chapter Banner.png|450px]]
|}`

const FALLING_SKIES = `{{Infobox quest
|image        =Falling Skies Banner.png
|icon         =Falling Skies Icon.png
|leads to     =[[The Ticket]]
}}

'''{{PAGENAME}}''' is a [[Story chapters|story chapter]] in ''[[Escape from Tarkov]]''.

==Description==
{{quote|Mechanic and I got to talking about that plane that went down somewhere in the nature reserve.}}

==Requirements==
Ask [[Mechanic]] about the downed plane while progressing through the story chapter [[Tour]].

==Objectives==
* Locate the fallen plane
* Reach Loyalty Level 2 with [[Prapor]]
* (''Optional'') Hand over 2,000 [[Dollars|USD]] to [[Therapist]] to learn details about the SUV
* Wait for information from [[Prapor]]
* Hand over 3 found [[Found in raid|<font color="red">in raid</font>]] [[Rechargeable battery|Rechargeable batteries]]
* Hand over 5 found [[Found in raid|<font color="red">in raid</font>]] [[Printed circuit board]]s
* Wait for information from [[Prapor]]
* Retrieve the [[Armored case|armored case]]
** (''Optional'') Find any [[Note from Mr. Kerman|additional clues]]

==Guide==
===Locate the fallen plane===
The fallen plane is located on the eastern side of [[Woods]].
`

const BATYA = `==Requirements==
Visit one of the following locations:
* Mattress on the second floor of the Scav base on [[Customs]]
<li style="display: inline-block;"><gallery widths="300" heights="169" mode="packed">
File:EasyMoneyPart1CustomsMap1.png|Scav base location marked on map
</gallery></li>
* Radome on top of the white queen radar station building on [[Reserve]]

==Objectives==
* Obtain [[Hideout#Modules|Intelligence Center]] level 3
* Find a lead on Item 1156
* Hand over the [[AMG-10 hydraulic fluid (quest item)|AMG-10 fluid]] to [[Prapor]]
* Eliminate any 15 targets without dying
`

const BOREAS = `==Objectives==
* Arrange a transport to the [[icebreaker]]
'''If you kept the [[Armored case]] from [[Prapor]] in [[Falling Skies]]'''
* Hand over 3 found [[Found in raid|<font color="red">in raid</font>]] [[Military power filter]]s to [[Prapor]]
<hr/>
* Find an alternative transport to the [[icebreaker]]
===Identical for all endings [[File:Savior icon.png|Savior ending|74x74px|link=]]===
* Hand over 200 [[7.62x54mm R BT gzh]]
==Guide==
`

const MAPS = [
  { id: 'woods', name: 'Woods', normalizedName: 'woods' },
  { id: 'customs', name: 'Customs', normalizedName: 'customs' },
  { id: 'reserve', name: 'Reserve', normalizedName: 'reserve' },
  { id: 'shoreline', name: 'Shoreline', normalizedName: 'shoreline' },
  { id: 'lab', name: 'The Lab', normalizedName: 'the-lab' },
  { id: 'factory', name: 'Factory', normalizedName: 'factory' },
  { id: 'terminal', name: 'Terminal', normalizedName: 'terminal' }
]

// Steps from Tour, Boreas, Batya and Falling Skies, with parts of their guides.
const MIXED = `==Objectives==
* Survive and extract from [[Customs]] or visit [[Customs]] 3 times
* Talk to [[Skier]]
* Locate the entrance to the port Terminal
* Find a way to contact the soldiers at the Terminal
* Ensure access to [[Reserve]]
** Survive and extract from [[Shoreline]] or visit [[Shoreline]] 3 times
** Hand over 5 [[Dogtag|PMC dogtag]]s to [[Prapor]]
* Ensure access to [[The Lab]]
** Access the secret [[The Lab|TerraGroup facility]]
** (''Optional'') Locate the entrance to the [[The Lab|facility]] on [[Factory]]
*** Find the way in
** Obtain the [[TerraGroup Labs access keycard]]
* Launch a yellow signal flare at the Woods transit on [[Reserve]]
* Locate the traces of the BEAR special squad
* Retrieve the flash drive from one of the G-Wagon SUVs
* Wait for information from [[Prapor]]
* Reach Loyalty Level 2 with [[Prapor]]

==Guide==
===Locate the traces of the BEAR special squad===
To fulfill this objective, you have to pick up and read the patch.
====Customs====
On a couch inside the cabin.
====Woods====
On the ground next to the BRDM.
===Retrieve the flash drive from one of the G-Wagon SUVs===
The [[G-Wagon flash drive]] can be found next to the "Tunnel" extraction on [[Shoreline]].
<gallery>
File:Tunnel.png|Seen from [[Customs]]
</gallery>
===Wait for the information from [[Prapor]]===
Wait 1 hour then visit [[Prapor]] in the menu.
`

describe('reading story chapters from the wiki', () => {
  it('finds the maps each step is on: named, from its part of the guide, or its parent’s', () => {
    const steps = parseObjectives(MIXED, MAPS)
    expect(steps.map((s) => [s.text, s.maps])).toEqual([
      ['Survive and extract from Customs or visit Customs 3 times', ['customs']],
      ['Talk to Skier', []],
      // The Terminal is also a place seen from Shoreline: only "on/in Terminal" or a link counts.
      ['Locate the entrance to the port Terminal', []],
      ['Find a way to contact the soldiers at the Terminal', []],
      // Where a step leads isn't where it's done.
      ['Ensure access to Reserve', []],
      ['Survive and extract from Shoreline or visit Shoreline 3 times', ['shoreline']],
      ['Hand over 5 PMC dogtags to Prapor', []],
      ['Ensure access to The Lab', []],
      ['Access the secret TerraGroup facility', ['lab']],
      ['Locate the entrance to the facility on Factory', ['factory']],
      ['Find the way in', ['factory']],
      // "TerraGroup Labs" in an item's name isn't the map.
      ['Obtain the TerraGroup Labs access keycard', []],
      // A way to Woods, on Reserve.
      ['Launch a yellow signal flare at the Woods transit on Reserve', ['reserve']],
      // The guide's sub-headings name the maps.
      ['Locate the traces of the BEAR special squad', ['customs', 'woods']],
      // The guide names Shoreline (and the gallery's caption isn't read).
      ['Retrieve the flash drive from one of the G-Wagon SUVs', ['shoreline']],
      ['Wait for information from Prapor', []],
      ['Reach Loyalty Level 2 with Prapor', []]
    ])
    expect(steps[0]).toMatchObject({ visits: true, count: 3 })
    expect(steps[1]).toMatchObject({ visits: false, guide: null })
    expect(steps[14].guide).toBe(
      'The G-Wagon flash drive can be found next to the "Tunnel" extraction on Shoreline.'
    )
    expect(steps[15].guide).toBe('Wait 1 hour then visit Prapor in the menu.')
    expect(steps[16].loyalty).toEqual({ trader: 'Prapor', level: 2 })
  })

  it('lists the chapters with the names they go by', () => {
    expect(chapterList(LIST)).toEqual([
      { title: 'Batya', name: 'Batya' },
      { title: 'Falling Skies', name: 'Falling Skies' },
      { title: 'The Labyrinth (story chapter)', name: 'The Labyrinth' }
    ])
  })

  it('reads the steps: optional ones, sub-steps, counts, hand-overs, and repeats', () => {
    const steps = parseObjectives(FALLING_SKIES)
    expect(steps.map((s) => s.id)).toEqual([
      'locate-the-fallen-plane',
      'reach-loyalty-level-2-with-prapor',
      'hand-over-2-000-usd-to-therapist-to-learn-details-about-the-suv',
      'wait-for-information-from-prapor',
      'hand-over-3-found-in-raid-rechargeable-batteries',
      'hand-over-5-found-in-raid-printed-circuit-boards',
      'wait-for-information-from-prapor#2',
      'retrieve-the-armored-case',
      'find-any-additional-clues'
    ])
    expect(steps[1]).toMatchObject({
      text: 'Reach Loyalty Level 2 with Prapor',
      count: null,
      handOver: false
    })
    expect(steps[2]).toMatchObject({ optional: true, count: 2000, itemNames: ['Dollars', 'Therapist'] })
    expect(steps[4]).toMatchObject({
      text: 'Hand over 3 found in raid Rechargeable batteries',
      count: 3,
      foundInRaid: true,
      handOver: true,
      itemNames: ['Rechargeable battery'],
      depth: 0
    })
    expect(steps[8]).toMatchObject({ text: 'Find any additional clues', optional: true, depth: 1 })
  })

  it('doesn’t take a level, a name or a part of a name for a count', () => {
    expect(parseObjectives(BATYA).map((s) => s.count)).toEqual([null, null, null, 15])
  })

  it('notes which path a step is on when the chapter branches', () => {
    expect(parseObjectives(BOREAS).map((s) => [s.text, s.branch])).toEqual([
      ['Arrange a transport to the icebreaker', null],
      [
        'Hand over 3 found in raid Military power filters to Prapor',
        'If you kept the Armored case from Prapor in Falling Skies'
      ],
      ['Find an alternative transport to the icebreaker', null],
      ['Hand over 200 7.62x54mm R BT gzh', 'Identical for all endings']
    ])
  })

  it('reads the blurb and what starts the chapter, without the galleries', () => {
    expect(parseDescription(FALLING_SKIES)).toBe(
      'Mechanic and I got to talking about that plane that went down somewhere in the nature reserve.'
    )
    expect(parseHowItStarts(BATYA)).toBe(
      'Visit one of the following locations:\n' +
        '• Mattress on the second floor of the Scav base on Customs\n' +
        '• Radome on top of the white queen radar station building on Reserve'
    )
  })

  it('fetches every chapter, with the game’s ids and the banners, main line first', async () => {
    const pages: Record<string, string> = {
      'Story chapters': LIST,
      Batya: BATYA,
      'Falling Skies': FALLING_SKIES,
      'The Labyrinth (story chapter)': ''
    }
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      const params = new URL(url).searchParams
      if (params.get('action') === 'parse')
        return jsonResponse({
          parse: { title: params.get('page'), wikitext: pages[params.get('page')!] ?? '' }
        })
      return jsonResponse({
        query: {
          pages: [
            {
              title: 'File:Falling Skies Banner.png',
              imageinfo: [
                {
                  url: 'https://img/fs.png',
                  thumburl: 'https://img/fs-800.png',
                  mime: 'image/png',
                  width: 1,
                  height: 1
                }
              ]
            }
          ]
        }
      })
    })
    const chapters = await fetchStoryChapters(fetchFn, { '68cbcdc4c964ab83cc0c928e': 'Falling Skies' })
    // The Labyrinth's page has no steps, so it's left out.
    expect(chapters.map((c) => [c.id, c.name, c.imageLink])).toEqual([
      ['68cbcdc4c964ab83cc0c928e', 'Falling Skies', 'https://img/fs-800.png'],
      ['story-batya', 'Batya', null]
    ])
    expect(chapters[0].wikiLink).toBe('https://escapefromtarkov.fandom.com/wiki/Falling_Skies')
  })
})

describe('story chapters as quests', () => {
  it('turns steps into objectives, counting only the hand-overs every player makes', () => {
    const steps = [...parseObjectives(FALLING_SKIES), ...parseObjectives(BOREAS)]
    const [quest] = storyQuests(
      [
        {
          id: 'story-test',
          name: 'Test',
          wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Test',
          description: 'Blurb',
          howItStarts: 'Talk to Mechanic',
          imageLink: null,
          objectives: steps
        }
      ],
      {
        itemIds: new Map([
          ['rechargeable battery', 'battery-id'],
          ['military power filter', 'filter-id'],
          ['7.62x54mm r bt gzh', 'ammo-id'],
          ['dollars', 'usd-id']
        ])
      }
    )
    expect(quest).toMatchObject({
      traderId: 'story',
      story: { description: 'Blurb', howItStarts: 'Talk to Mechanic' }
    })
    const giving = quest.objectives.filter((o) => o.type === 'giveItem')
    expect(giving.map((o) => [o.items, o.count, o.optional])).toEqual([
      [['usd-id'], 2000, true],
      [['battery-id'], 3, false],
      [['ammo-id'], 200, false]
    ])
    // The power filters are on one path only: listed, but not counted as needed.
    expect(quest.objectives.find((o) => o.description.includes('power filters'))).toMatchObject({
      type: 'story',
      items: [],
      branch: 'If you kept the Armored case from Prapor in Falling Skies'
    })
  })
})

describe('story steps in order', () => {
  const chapter = (steps: string) =>
    storyQuests(
      [
        {
          id: 'story-test',
          name: 'Test',
          wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Test',
          description: '',
          howItStarts: '',
          imageLink: null,
          objectives: parseObjectives(`==Objectives==\n${steps}`)
        }
      ],
      {
        itemIds: new Map([
          ['boreas engine room keycard', 'engine-key'],
          ['terragroup labs access keycard', 'labs-card']
        ])
      }
    )[0]
  const ids = (q: ReturnType<typeof chapter>, reachable: Set<string>) =>
    q.objectives.filter((o) => reachable.has(o.id)).map((o) => o.description)

  it('shows a step once every required step before it is done; optional ones hold nothing up after them', () => {
    const q = chapter(`* Talk to [[Skier]]
* (''Optional'') Read the note
* Ensure access to [[The Lab]]
** Access the secret facility
** Obtain the [[TerraGroup Labs access keycard]]
* Hand over the case to [[Prapor]]`)
    expect(ids(q, reachableSteps(q, {}))).toEqual(['Talk to Skier'])
    const talked = { 'story-test': { [q.objectives[0].id]: 1 } }
    expect(ids(q, reachableSteps(q, talked))).toEqual([
      'Talk to Skier',
      'Read the note',
      'Ensure access to The Lab',
      // Sub-steps go with their step.
      'Access the secret facility',
      'Obtain the TerraGroup Labs access keycard'
    ])
    // Other quests' objectives can all be worked on.
    const plain = { ...q, story: undefined }
    expect(reachableSteps(plain, {}).size).toBe(q.objectives.length)
  })

  it('lets each path move on by itself once the chapter branches', () => {
    const q = chapter(`* Talk to [[Skier]]
===If you handed over the case===
* Meet Prapor
* Hand over the documents
===If you kept the case===
* Open the case
* Sell the contents
===Identical for all===
* Report back`)
    const steps = (done: string[]) =>
      ids(
        q,
        reachableSteps(q, {
          'story-test': Object.fromEntries(
            q.objectives.filter((o) => done.includes(o.description)).map((o) => [o.id, 1])
          )
        })
      )
    expect(steps(['Talk to Skier'])).toEqual(['Talk to Skier', 'Meet Prapor', 'Open the case', 'Report back'])
    expect(steps(['Talk to Skier', 'Meet Prapor'])).toEqual([
      'Talk to Skier',
      'Meet Prapor',
      'Hand over the documents',
      'Open the case',
      'Report back'
    ])
  })

  it('needs the keys a step links to, but not when the step is to get the key', () => {
    const q = chapter(`* Access the [[Boreas engine room keycard|engine room]]
* Locate and obtain the [[Boreas engine room keycard|engine room keycard]]
* Obtain the [[TerraGroup Labs access keycard]]`)
    expect(q.objectives.map((o) => o.requiredKeys)).toEqual([[['engine-key']], [], []])
  })
})
