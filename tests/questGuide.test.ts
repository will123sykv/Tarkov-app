import { describe, expect, it, vi } from 'vitest'
import type { FetchFn } from '../src/main/pricing/http'
import {
  createQuestGuideService,
  guideSection,
  parseGuide,
  plainText,
  wikiTitle
} from '../src/main/quests/questGuide'
import { jsonResponse, tempDir } from './helpers'

// The Extortionist's page as the CI probe logged it (trimmed).
const EXTORTIONIST = `{{Infobox quest}}
==Objectives==
* Locate and obtain the Secure Folder 0048 on [[Customs]]
==Rewards==
* +0.10 [[Skier]] Rep
==Guide==
{|class="wikitable"
! colspan="6" |Related Quest Items
|-
|[[File:Unknown-key-Icon.png|link=Unknown key]]
|[[Unknown key]]
|}
In this quest you have to pick up a folder from a locked cabin on [[Customs]]. The required [[Unknown key]] can be found on a dead Scav.<ref>Patch 0.12</ref>
<li style="display: inline-block;"><gallery widths="300" heights="169" mode="packed">
File:Customs.PNG|Dead Scav and cabin marked on map
File:The bush where the hidden body is.png|The dead Scav is located in a bush behind [[Customs#Garages|garages]]
</gallery></li>
===Where to stash===
[[File:Stash spot.jpg|thumb|right|300px|Under the '''bed''']]
* Behind the [[Dorms|dorm]] {{Note|tip}}
[[File:Key icon.png|64px]] Use the key.

{{Navbox quests}}
[[Category:Quests]]
[[fr:L'Extorqueur]]`

describe('quest guides', () => {
  it('reads the wiki page title from tarkov.dev’s link', () => {
    expect(wikiTitle('https://escapefromtarkov.fandom.com/wiki/Spa_Tour_-_Part_1')).toBe('Spa Tour - Part 1')
    expect(wikiTitle('https://escapefromtarkov.fandom.com/wiki/Ice_Cream_Cones%3F#Guide')).toBe(
      'Ice Cream Cones?'
    )
    expect(wikiTitle('https://example.com/wiki/Debut')).toBeNull()
    expect(wikiTitle(null)).toBeNull()
  })

  it('finds the Guide section up to the next heading of its level', () => {
    expect(guideSection(EXTORTIONIST)).toContain('===Where to stash===')
    expect(guideSection(EXTORTIONIST)).not.toContain('Skier')
    expect(guideSection('==Objectives==\nx')).toBe('')
  })

  it('turns markup into plain text', () => {
    expect(plainText("A [[Customs#Garages|garage]] on '''[[Customs]]''' {{Tpl|x}}<br/>now")).toBe(
      'A garage on Customs now'
    )
    expect(plainText('[https://example.com the site] &amp; more')).toBe('the site & more')
  })

  it('keeps the text and the pictures of places, in order, without tables or item icons', () => {
    const { blocks, images } = parseGuide(EXTORTIONIST)
    expect(blocks).toEqual([
      {
        kind: 'p',
        text: 'In this quest you have to pick up a folder from a locked cabin on Customs. The required Unknown key can be found on a dead Scav.'
      },
      { kind: 'h', text: 'Where to stash' },
      { kind: 'li', text: 'Behind the dorm' },
      { kind: 'p', text: 'Use the key.' }
    ])
    expect(images).toEqual([
      { file: 'Customs.PNG', caption: 'Dead Scav and cabin marked on map' },
      {
        file: 'The bush where the hidden body is.png',
        caption: 'The dead Scav is located in a bush behind garages'
      },
      { file: 'Stash spot.jpg', caption: 'Under the bed' }
    ])
  })
})

describe('createQuestGuideService', () => {
  const thumb = (file: string) => `https://static.wikia.nocookie.net/eft/images/${file}/800`
  const wiki = (fail = false) =>
    vi.fn<FetchFn>(async (url) => {
      if (fail) return jsonResponse({}, 503)
      const params = new URL(url).searchParams
      if (params.get('action') === 'parse') {
        expect(params.get('redirects')).toBe('1')
        return params.get('page') === 'Missing'
          ? jsonResponse({ error: { code: 'missingtitle', info: "The page you specified doesn't exist." } })
          : jsonResponse({ parse: { title: 'The Extortionist', wikitext: EXTORTIONIST } })
      }
      const titles = params.get('titles')!.split('|')
      return jsonResponse({
        query: {
          pages: titles.map((title) =>
            title === 'File:Stash spot.jpg'
              ? { title, missing: true }
              : {
                  title,
                  imageinfo: [
                    {
                      url: `${thumb(title)}/full`,
                      thumburl: thumb(title),
                      thumbwidth: 800,
                      thumbheight: 450,
                      descriptionurl: `https://escapefromtarkov.fandom.com/wiki/${title}`,
                      mime: 'image/png'
                    }
                  ]
                }
          )
        }
      })
    })
  const LINK = 'https://escapefromtarkov.fandom.com/wiki/The_Extortionist'

  it('fetches a guide with its pictures, caches it, and serves the cache when offline', async () => {
    const cacheDir = await tempDir()
    let clock = 1_000
    const fetchFn = wiki()
    const online = createQuestGuideService({ fetchFn, cacheDir, now: () => clock })
    const [first, again] = await Promise.all([online.get(LINK), online.get(LINK)])
    expect(again).toBe(first)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(first.error).toBeNull()
    expect(first.guide).toMatchObject({
      title: 'The Extortionist',
      url: LINK,
      fetchedAt: 1_000,
      images: [
        {
          file: 'Customs.PNG',
          caption: 'Dead Scav and cabin marked on map',
          thumb: thumb('File:Customs.PNG'),
          full: `${thumb('File:Customs.PNG')}/full`,
          width: 800,
          height: 450,
          page: 'https://escapefromtarkov.fandom.com/wiki/File:Customs.PNG'
        },
        { file: 'The bush where the hidden body is.png' }
      ]
    })
    // A file the wiki doesn't have is left out.
    expect(first.guide!.images).toHaveLength(2)

    // Within the week: from memory, then from disk in a new session.
    clock += 3 * 24 * 3_600_000
    await online.get(LINK)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const offline = createQuestGuideService({ fetchFn: wiki(true), cacheDir, now: () => clock })
    expect((await offline.get(LINK)).guide).toEqual(first.guide)

    // After a week offline: the old guide, with the error.
    clock += 5 * 24 * 3_600_000
    const stale = await createQuestGuideService({ fetchFn: wiki(true), cacheDir, now: () => clock }).get(LINK)
    expect(stale.guide).toEqual(first.guide)
    expect(stale.error).toMatch(/503/)
  })

  it('says when there is no page', async () => {
    const service = createQuestGuideService({ fetchFn: wiki(), cacheDir: await tempDir() })
    expect(await service.get('https://escapefromtarkov.fandom.com/wiki/Missing')).toEqual({
      guide: null,
      error: "Couldn't load the guide from the wiki: The wiki has no page for this quest yet."
    })
    expect((await service.get(null)).error).toMatch(/no wiki page/)
  })
})
