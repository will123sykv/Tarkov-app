import { describe, expect, it } from 'vitest'
import { matchExit } from '../src/shared/extracts'
import { mapPageTitle, wikiMapExits } from '../src/main/quests/wikiExtracts'

// Rows as the wiki's map pages have them (October 2026).
const TABLE_HEAD = `==Extractions==
To locate the extractions use the [[Customs#Maps|maps]] below the table.
{| class="wikitable sortable stickyheader" style="text-align: center;"
!Extraction
!Name
!Faction
!Always available
!Single-Use
!Requirements 
!Notes`

const PAGE = `Intro text.
${TABLE_HEAD}
|-
![[File:Dorms V-Ex.png|240px]]
! style="text-align: left;" |Dorms V-Ex
|PMC
|<font color="red">✘</font>
|<font color="green">✔</font>
|[[File:5000 Roubles.png|link=Roubles]] per player
'''Maximum of 4 players'''
|The fee amount is influenced by your [[Scavs#Scav karma|Scav karma]].
|-
![[File:Old Gas Station Extraction.png|240px]]
! style="text-align: left;" |Old Gas Station
|All
|PMC: <font color="red">✘</font><br/>Scav: <font color="green">✔</font>
|<font color="red">✘</font>
|Green flares = Open for PMCs
|In the basement.
|-
![[File:Shoreline Climber's Trail Extraction.png|240px]]
! style="text-align: left;" | Climber's Trail
|PMC
|<font color="green">✔</font>
|<font color="red">✘</font>
|[[Red Rebel ice pick]]<br/>[[Paracord]]<br/>No [[armor vest]] equipped
|
|-
![[File:Fac Cellars.png|240px]]
! style="text-align: left;" |Cellars
|PMC
|<font color="green">✔</font>
|<font color="red">✘</font>
|[[File:Factory key icon.png|frameless|64px|link=Factory emergency exit key]]<br/>Used to open the door to the extraction
|
|-
![[File:Lighthouse - Armored train.png|240px]]
! style="text-align: left;" |Armored Train
|All
|<font color="green">✔</font>
|<font color="red">✘</font>
| -
||Arrives between 20 and 15 minutes left in the raid.<br/>Honks twice on arrival.<br/>[[File:ExtractionTrainHorn.wav|282px]]
|}

==Transits==
{| class="wikitable sortable stickyheader" style="text-align: center;"
!Transit
!Name
!Faction
!Always available
!Single-Use
!Requirements
!Notes
|-
![[File:InterchangeTransitToCustoms.png|240px]]
! style="text-align: left;" |Transit to Customs
|All
|<font color="green">✔</font>
|<font color="red">✘</font>
|Only available 1 min after raid start
|
|}

==Maps==
`

describe('extracts from the wiki’s map pages', () => {
  const { extracts, transits } = wikiMapExits(PAGE)

  it('reads every row of the Extractions table', () => {
    expect(extracts.map((e) => e.name)).toEqual([
      'Dorms V-Ex',
      'Old Gas Station',
      "Climber's Trail",
      'Cellars',
      'Armored Train'
    ])
  })

  it('reads the cost, who can use it and whether it’s always open', () => {
    expect(extracts[0]).toEqual({
      name: 'Dorms V-Ex',
      faction: 'PMC',
      alwaysAvailable: 'No',
      singleUse: true,
      requirements: ['5,000 ₽ per player', 'Maximum of 4 players'],
      notes: ['The fee amount is influenced by your Scav karma.']
    })
    expect(extracts[1].alwaysAvailable).toBe('PMC: No, Scav: Yes')
    expect(extracts[1].requirements).toEqual(['Green flares = Open for PMCs'])
  })

  it('lists each requirement, naming items shown as pictures', () => {
    expect(extracts[2].requirements).toEqual(['Red Rebel ice pick', 'Paracord', 'No armor vest equipped'])
    expect(extracts[2].notes).toEqual([])
    expect(extracts[3].requirements).toEqual([
      'Factory emergency exit key',
      'Used to open the door to the extraction'
    ])
  })

  it('leaves out a dash for no requirements, and sounds', () => {
    expect(extracts[4].requirements).toEqual([])
    expect(extracts[4].notes).toEqual([
      'Arrives between 20 and 15 minutes left in the raid.',
      'Honks twice on arrival.'
    ])
  })

  it('reads the Transits table too', () => {
    expect(transits).toEqual([
      {
        name: 'Transit to Customs',
        faction: 'All',
        alwaysAvailable: 'Yes',
        singleUse: false,
        requirements: ['Only available 1 min after raid start'],
        notes: []
      }
    ])
  })

  it('finds nothing on a page without the tables', () => {
    expect(wikiMapExits('==Description==\nA map.')).toEqual({ extracts: [], transits: [] })
  })

  it('uses one page for a map’s versions', () => {
    expect(mapPageTitle('Night Factory')).toBe('Factory')
    expect(mapPageTitle('Ground Zero 21+')).toBe('Ground Zero')
    expect(mapPageTitle('Streets of Tarkov')).toBe('Streets of Tarkov')
  })

  it('matches tarkov.dev’s names with the wiki’s', () => {
    expect(matchExit('Dorms V-Ex', extracts)?.name).toBe('Dorms V-Ex')
    expect(matchExit('Climbers Trail', extracts)?.name).toBe("Climber's Trail")
    expect(matchExit('Old Gas Station (Flare)', extracts)?.name).toBe('Old Gas Station')
    expect(matchExit('Smugglers Boat', extracts)).toBeNull()
  })
})
