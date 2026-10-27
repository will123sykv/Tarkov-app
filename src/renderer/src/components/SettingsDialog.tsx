import { useEffect, useRef, useState } from 'react'
import { formatDateTime } from '../lib/format'
import type { UpdaterStatus } from '../../../shared/types'
import type { BackupInfo } from '../../../shared/ipc'
import { useStore } from '../store'
import BackgroundToggles from './BackgroundToggles'
import {
  CraftingSettingsSection,
  LoyaltySettingsSection,
  QuestSettingsSection,
  TrendSettingsSection,
  WikiSettingsSection
} from './GlobalSettings'
import LogStatusPanel from './LogStatusPanel'

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

const BACKUP_KIND: Record<BackupInfo['kind'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  'before-import': 'Before an import',
  'before-rescan': 'Before reading the logs again',
  'before-restore': 'Before a restore'
}

/** The backups there are, each with Restore (since 1.66.0). */
function BackupList({ onRestored }: { onRestored: () => Promise<void> }): React.JSX.Element {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = (): void => void window.api.listBackups().then(setBackups, () => setBackups([]))
  const restore = async (b: BackupInfo): Promise<void> => {
    if (
      !window.confirm(
        `Put back your progress and settings from ${formatDateTime(b.at)} (${BACKUP_KIND[b.kind].toLowerCase()})? What you have now is backed up first.`
      )
    )
      return
    const result = await window.api.restoreBackup(b.name)
    if (result.ok) await onRestored()
    else setError(result.error)
  }
  return (
    <details
      className="backup-list"
      onToggle={(e) => (e.currentTarget.open && !backups ? load() : undefined)}
    >
      <summary>Backups to put back…</summary>
      {!backups ? (
        <p className="hint">Loading…</p>
      ) : backups.length === 0 ? (
        <p className="hint">No backups yet.</p>
      ) : (
        <ul>
          {backups.map((b) => (
            <li key={b.name}>
              <span>{formatDateTime(b.at)}</span>
              <span className="muted">{BACKUP_KIND[b.kind]}</span>
              <button className="link small" onClick={() => void restore(b)}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="hint error">{error}</p>}
    </details>
  )
}

/** Backups of the progress, and exporting or importing it as a file (since 1.47.0). */
function ProgressSection(): React.JSX.Element {
  const info = useStore((s) => s.progressInfo)
  const loadProgressInfo = useStore((s) => s.loadProgressInfo)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const exportProgress = async (): Promise<void> => {
    setBusy(true)
    const result = await window.api.exportProgress()
    setBusy(false)
    if (result.ok) setMessage({ tone: 'ok', text: `Saved to ${result.path}` })
    else if ('error' in result) setMessage({ tone: 'error', text: result.error })
  }
  const importProgress = async (): Promise<void> => {
    if (
      !window.confirm(
        'Importing replaces your progress and settings with the file’s (this PC’s game logs folder and tray settings stay). Today’s are backed up first. Go on?'
      )
    )
      return
    setBusy(true)
    const result = await window.api.importProgress()
    setBusy(false)
    if (result.ok) {
      await loadProgressInfo()
      // Everything shown comes from the progress: start the page again from the imported one.
      window.location.reload()
    } else if ('error' in result) setMessage({ tone: 'error', text: result.error })
  }
  return (
    <section id="settings-progress">
      <h3>Your progress</h3>
      <p className="hint">
        Quests, objectives, hideout, items put aside, keys, loyalty, pins and favourites are backed up each
        day, week and month (the last 7 days, 4 weeks and 6 months are kept) and just before an import,
        reading the logs again or a restore, and put back from there if the file is ever damaged.{' '}
        {info?.lastBackupAt ? `Last backup: ${formatDateTime(info.lastBackupAt)}.` : 'No backup yet.'}
      </p>
      <div className="inline">
        <button className="button" disabled={busy} onClick={() => void exportProgress()}>
          Export progress…
        </button>
        <button className="button" disabled={busy} onClick={() => void importProgress()}>
          Import progress…
        </button>
        <button className="link small" onClick={() => void window.api.openBackupsFolder()}>
          Open backups folder
        </button>
      </div>
      {message && <p className={`hint ${message.tone === 'error' ? 'error' : ''}`}>{message.text}</p>}
      <BackupList
        onRestored={async () => {
          await loadProgressInfo()
          // Everything shown comes from the progress: start the page again from the restored one.
          window.location.reload()
        }}
      />
      <p className="hint">
        Export to keep your own copy or move to another PC; the tarkov-market key isn&rsquo;t included.
      </p>
    </section>
  )
}

export default function SettingsDialog(): React.JSX.Element | null {
  const open = useStore((s) => s.settingsOpen)
  const section = useStore((s) => s.settingsSection)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const loadQuestData = useStore((s) => s.loadQuestData)
  const loadPlayerData = useStore((s) => s.loadPlayerData)
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
  // The traders (for loyalty) come with the quest data, and the levels set with the player's.
  useEffect(() => {
    if (!open) return
    void loadQuestData()
    void loadPlayerData()
    void useStore.getState().loadProgressInfo()
  }, [open, loadQuestData, loadPlayerData])
  // Opened from a page's "Settings" link: straight to its section.
  useEffect(() => {
    if (open && section) document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' })
  }, [open, section])

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

      <QuestSettingsSection settings={settings} />
      <WikiSettingsSection settings={settings} />
      <LoyaltySettingsSection settings={settings} />
      <CraftingSettingsSection settings={settings} />
      <TrendSettingsSection settings={settings} />

      <div className="dialog-logs" id="settings-logs">
        <LogStatusPanel />
      </div>

      <ProgressSection />

      <section>
        <h3>Background</h3>
        <p className="hint">
          Flea trends are recorded at each price refresh for the selected game mode. Keep the app in the tray
          so recordings cover the whole day.
        </p>
        <BackgroundToggles settings={settings} />
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
