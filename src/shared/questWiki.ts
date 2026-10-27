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

/** How long after a click or key press a link off the wiki may open in the browser. */
export const GESTURE_MS = 1500

/**
 * Whether the user just clicked or pressed a key in the wiki panel (since 1.65.0): a link off the wiki
 * opens in their browser only then, so an ad that opens a window or navigates by itself can't.
 */
export function gestureGate(now: () => number = Date.now): {
  input: (type: string | undefined) => void
  recent: () => boolean
} {
  let last = -Infinity
  return {
    input(type) {
      if (type === 'mouseDown' || type === 'mouseUp' || type === 'keyDown' || type === 'rawKeyDown')
        last = now()
    },
    recent: () => now() - last <= GESTURE_MS
  }
}
