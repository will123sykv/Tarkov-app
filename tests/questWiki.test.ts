import { describe, expect, it } from 'vitest'
import { isWikiUrl, wikiPageUrl } from '../src/shared/questWiki'

describe('the quest wiki in the panel', () => {
  it('lets only the Escape from Tarkov wiki load in the panel', () => {
    expect(isWikiUrl('https://escapefromtarkov.fandom.com/wiki/Supply_Plans')).toBe(true)
    expect(isWikiUrl('https://escapefromtarkov.fandom.com/wiki/Customs#Extracts')).toBe(true)
    expect(isWikiUrl('http://escapefromtarkov.fandom.com/wiki/Supply_Plans')).toBe(false)
    expect(isWikiUrl('https://escapefromtarkov.fandom.com.evil.com/wiki/Supply_Plans')).toBe(false)
    expect(isWikiUrl('https://minecraft.fandom.com/wiki/Creeper')).toBe(false)
    expect(isWikiUrl('https://auth.fandom.com/signin')).toBe(false)
    expect(isWikiUrl('javascript:alert(1)')).toBe(false)
    expect(isWikiUrl('not a url')).toBe(false)
  })

  it('opens a quest’s wiki page only when its link is to the wiki', () => {
    expect(wikiPageUrl('https://escapefromtarkov.fandom.com/wiki/Supply_Plans')).toBe(
      'https://escapefromtarkov.fandom.com/wiki/Supply_Plans'
    )
    expect(wikiPageUrl('https://tarkov.dev/task/supply-plans')).toBeNull()
    expect(wikiPageUrl('https://escapefromtarkov.fandom.com/')).toBeNull()
    expect(wikiPageUrl(null)).toBeNull()
  })
})
