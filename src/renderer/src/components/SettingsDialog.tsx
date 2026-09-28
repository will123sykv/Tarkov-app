import { useEffect, useRef, useState } from 'react'
import type { UpdaterStatus } from '../../../shared/types'
import { useStore } from '../store'

const REFRESH_OPTIONS = [1, 2, 5, 10, 15, 30, 60]

function describeUpdater(status: UpdaterStatus): string {
  switch (status.state) {
    case 'disabled':
      return status.message ?? 'Updates are disabled.'
    case 'idle':
      return 'Not checked yet.'
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Version ${status.version} is available, downloading…`
    case 'not-available':
      return "You're on the latest version."
    case 'downloading':
      return `Downloading update… ${status.percent ?? 0}%`
    case 'downloaded':
      return `Version ${status.version} is ready to install.`
    case 'error':
      return `Update check failed: ${status.message ?? 'unknown error'}`
  }
}

export default function SettingsDialog(): React.JSX.Element | null {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const updater = useStore((s) => s.updater)
  const appVersion = useStore((s) => s.appVersion)
  const [apiKey, setApiKey] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!settings) return null

  return (
    <dialog ref={dialogRef} className="dialog" onClose={() => setOpen(false)}>
      <header>
        <h2>Settings</h2>
        <button className="button icon" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
      </header>

      <section>
        <h3>Prices</h3>
        <label className="field">
          <span>Auto-refresh prices every</span>
          <select
            value={settings.refreshIntervalMin}
            onChange={(e) => void updateSettings({ refreshIntervalMin: Number(e.target.value) })}
          >
            {[...new Set([...REFRESH_OPTIONS, settings.refreshIntervalMin])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.subtractFleaFee}
            onChange={(e) => void updateSettings({ subtractFleaFee: e.target.checked })}
          />
          Subtract flea listing fees from flea prices
        </label>
      </section>

      <section>
        <h3>tarkov-market fallback (optional)</h3>
        <p className="hint">
          If tarkov.dev can't be reached, PvP and PvE prices are fetched from tarkov-market instead. This
          needs an API key from a tarkov-market Pro account. The key is encrypted and stored only on this PC.
        </p>
        {settings.hasTarkovMarketKey ? (
          <div className="inline">
            <span className="badge ok">API key saved</span>
            <button className="button" onClick={() => void updateSettings({ tarkovMarketApiKey: null })}>
              Remove key
            </button>
          </div>
        ) : (
          <form
            className="inline"
            onSubmit={(e) => {
              e.preventDefault()
              if (!apiKey.trim()) return
              void updateSettings({ tarkovMarketApiKey: apiKey.trim() })
              setApiKey('')
            }}
          >
            <input
              type="password"
              placeholder="tarkov-market API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            <button className="button" type="submit" disabled={!apiKey.trim()}>
              Save key
            </button>
          </form>
        )}
      </section>

      <section>
        <h3>Updates</h3>
        <p className="hint">
          Version {appVersion}. {describeUpdater(updater)}
        </p>
        <div className="inline">
          <button
            className="button"
            onClick={() => void window.api.checkForUpdates()}
            disabled={
              updater.state === 'disabled' || updater.state === 'checking' || updater.state === 'downloading'
            }
          >
            Check for updates
          </button>
          {updater.state === 'downloaded' && (
            <button className="button primary" onClick={() => void window.api.installUpdate()}>
              Restart and install
            </button>
          )}
        </div>
      </section>

      <footer className="hint">
        Price data from{' '}
        <a href="https://tarkov.dev" target="_blank" rel="noreferrer">
          tarkov.dev
        </a>{' '}
        and{' '}
        <a href="https://tarkov-market.com" target="_blank" rel="noreferrer">
          tarkov-market
        </a>
        . Container images from the{' '}
        <a href="https://escapefromtarkov.fandom.com" target="_blank" rel="noreferrer">
          Official Escape from Tarkov Wiki
        </a>{' '}
        (CC BY-SA 3.0). Not affiliated with Battlestate Games.
      </footer>
    </dialog>
  )
}
