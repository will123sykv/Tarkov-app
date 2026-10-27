import { session, type WebContents } from 'electron'
import { gestureGate, isWikiUrl, WIKI_PARTITION } from '../shared/questWiki'

/**
 * Lets the window show the Escape from Tarkov wiki in a `<webview>` in the quest panel, and nothing
 * else: no preload or Node, its own sandboxed session that grants no permissions, and links off the
 * wiki (and pop-ups) opened in the user's browser instead, only when the user clicked them (since
 * 1.65.0: ads can't open the browser by themselves).
 */
export function allowQuestWiki(contents: WebContents, openExternal: (url: string) => void): void {
  contents.on('will-attach-webview', (event, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.nodeIntegrationInSubFrames = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    prefs.webSecurity = true
    if (params.partition !== WIKI_PARTITION || !isWikiUrl(params.src)) event.preventDefault()
  })
  contents.on('did-attach-webview', (_event, guest) => {
    const gesture = gestureGate()
    guest.on('input-event', (_e, input) => gesture.input(input.type))
    const leave = (url: string): void => {
      if (gesture.recent()) openExternal(url)
    }
    // A wiki link meant for a new window opens in the panel; anything else in the browser, if clicked.
    guest.setWindowOpenHandler(({ url }) => {
      if (isWikiUrl(url)) void guest.loadURL(url)
      else leave(url)
      return { action: 'deny' }
    })
    guest.on('will-navigate', (event, url) => {
      if (isWikiUrl(url)) return
      event.preventDefault()
      leave(url)
    })
    // A redirect off the wiki (an ad's, a link shortener's) stays out of the panel.
    guest.on('will-redirect', (event) => {
      if (event.isMainFrame && !isWikiUrl(event.url)) {
        event.preventDefault()
        leave(event.url)
      }
    })
  })
  const guestSession = session.fromPartition(WIKI_PARTITION)
  guestSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  guestSession.setPermissionCheckHandler(() => false)
}
