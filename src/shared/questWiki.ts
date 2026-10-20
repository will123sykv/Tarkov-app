// A quest's page on the Escape from Tarkov wiki, read inside the quest panel (since 1.60.0): the
// wiki's own site in a locked-down page (src/main/questWiki.ts), and nothing else.

export const WIKI_BASE = 'https://escapefromtarkov.fandom.com'
export const WIKI_PAGE = `${WIKI_BASE}/wiki/`
/** Its own session, kept between runs (the wiki's cookie choice stays). */
export const WIKI_PARTITION = 'persist:quest-wiki'

/** Whether a page is on the wiki (where the panel may go without leaving the app). */
export function isWikiUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && hostname === 'escapefromtarkov.fandom.com'
  } catch {
    return false
  }
}

/** The quest's wiki page to open in the panel, or null when its link isn't to the wiki. */
export function wikiPageUrl(wikiLink: string | null | undefined): string | null {
  return wikiLink && wikiLink.startsWith(WIKI_PAGE) && isWikiUrl(wikiLink) ? wikiLink : null
}
