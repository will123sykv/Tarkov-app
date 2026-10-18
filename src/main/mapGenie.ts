import { session, type WebContents } from 'electron'
import { isMapGenieUrl, MAP_GENIE_PARTITION } from '../shared/mapGenie'

/**
 * Lets the window show Map Genie's page in a `<webview>`, and nothing else: no preload or Node, its
 * own sandboxed session that grants no permissions, and links off Map Genie (and pop-ups) opened in
 * the user's browser instead.
 */
export function allowMapGenie(contents: WebContents, openExternal: (url: string) => void): void {
  contents.on('will-attach-webview', (event, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.nodeIntegrationInSubFrames = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    prefs.webSecurity = true
    if (params.partition !== MAP_GENIE_PARTITION || !isMapGenieUrl(params.src)) event.preventDefault()
  })
  contents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })
    guest.on('will-navigate', (event, url) => {
      if (isMapGenieUrl(url)) return
      event.preventDefault()
      openExternal(url)
    })
  })
  const guestSession = session.fromPartition(MAP_GENIE_PARTITION)
  guestSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  guestSession.setPermissionCheckHandler(() => false)
}
