import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import trayIconPath from '../../build/icon.png?asset'

const HIDDEN_ARG = '--hidden'

/** True when Windows launched the app at login (it then starts in the tray). */
export function launchedHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG)
}

/**
 * Background recording: with it on, closing the window hides it to a tray icon so prices keep
 * refreshing and being recorded; "Quit" in the tray menu exits for real.
 */
export function createBackgroundMode(opts: {
  isEnabled: () => boolean
  getWindow: () => BrowserWindow | null
}) {
  let tray: Tray | null = null
  let quitting = false
  app.on('before-quit', () => {
    quitting = true
  })

  function showWindow(): void {
    const win = opts.getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  function ensureTray(): void {
    if (tray) return
    try {
      tray = new Tray(nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 }))
    } catch {
      return // No tray support on this desktop; the window simply stays hidden until reopened.
    }
    tray.setToolTip('Tarkov Loot Optimiser: recording flea prices')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Tarkov Loot Optimiser', click: showWindow },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
      ])
    )
    tray.on('click', showWindow)
  }

  function removeTray(): void {
    tray?.destroy()
    tray = null
  }

  return {
    /** Wire a window's close button to hide it while background recording is on. */
    attach(win: BrowserWindow): void {
      // Windows is shutting down or logging off: let the window close instead of blocking it.
      win.on('session-end', () => {
        quitting = true
      })
      win.on('close', (event) => {
        if (quitting || !opts.isEnabled()) return
        event.preventDefault()
        win.hide()
        ensureTray()
      })
    },
    /** Apply the settings: tray icon while enabled, login item on Windows (installed builds only). */
    apply(settings: { backgroundRecording: boolean; startWithWindows: boolean }): void {
      if (settings.backgroundRecording) ensureTray()
      else removeTray()
      if (app.isPackaged && process.platform === 'win32') {
        app.setLoginItemSettings({
          openAtLogin: settings.backgroundRecording && settings.startWithWindows,
          args: [HIDDEN_ARG]
        })
      }
    },
    showWindow
  }
}
