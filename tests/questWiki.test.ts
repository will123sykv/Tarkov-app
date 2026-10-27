import { describe, expect, it } from 'vitest'
import { GESTURE_MS, gestureGate, isWikiUrl, wikiPageUrl } from '../src/shared/questWiki'

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

  it('opens a link off the wiki in the browser only just after a click or key press (since 1.65.0)', () => {
    let t = 1_000
    const gate = gestureGate(() => t)
    // An ad opening a window by itself.
    expect(gate.recent()).toBe(false)
    gate.input('mouseMove')
    expect(gate.recent()).toBe(false)
    gate.input('mouseUp')
    expect(gate.recent()).toBe(true)
    t += GESTURE_MS + 1
    expect(gate.recent()).toBe(false)
    gate.input('keyDown')
    expect(gate.recent()).toBe(true)
  })
})
