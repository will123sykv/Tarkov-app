import { session, type WebContents } from 'electron'
import { isWikiUrl, WIKI_PARTITION } from '../shared/questWiki'

/**
 * Lets the window show the Escape from Tarkov wiki in a `<webview>` in the quest panel, and nothing
 * else: no preload or Node, its own sandboxed session that grants no permissions, and links off the
 * wiki (and pop-ups) opened in the user's browser instead.
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
    // A wiki link meant for a new window opens in the panel; anything else in the browser.
    guest.setWindowOpenHandler(({ url }) => {
      if (isWikiUrl(url)) void guest.loadURL(url)
      else openExternal(url)
      return { action: 'deny' }
    })
    guest.on('will-navigate', (event, url) => {
      if (isWikiUrl(url)) return
      event.preventDefault()
      openExternal(url)
    })
  })
  const guestSession = session.fromPartition(WIKI_PARTITION)
  guestSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  guestSession.setPermissionCheckHandler(() => false)
}
