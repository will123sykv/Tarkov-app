import { GAME_MODES } from '../../../shared/gameModes'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { useStore } from '../store'
import LevelInput from './LevelInput'
import { openQuickSearch } from './QuickSearch'
import RaidClock from './RaidClock'
import { VIEWS } from '../lib/views'

interface Props {
  settings: PublicSettings
  priceState: PriceState | null
  fleaMinLevel: number
}

export default function TopBar({ settings, priceState, fleaMinLevel }: Props): React.JSX.Element {
  const setGameMode = useStore((s) => s.setGameMode)
  const setPlayerLevel = useStore((s) => s.setPlayerLevel)
  const refreshPrices = useStore((s) => s.refreshPrices)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const updateSettings = useStore((s) => s.updateSettings)
  const level = settings.playerLevels[settings.gameMode]
  const refreshing = priceState?.refreshing ?? false

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ₽
        </span>
        {/* Just the name: a line per tab here moved the tabs beside it (since 1.69.0). Each tab's
            tooltip says what it's for. */}
        <div>
          <h1>Tarkov Loot Optimiser</h1>
        </div>
      </div>

      <nav className="view-tabs" role="tablist" aria-label="View">
        {VIEWS.map((view, i) => (
          <button
            key={view.id}
            role="tab"
            title={`${view.subtitle} (Ctrl+${(i + 1) % 10})`}
            aria-selected={settings.view === view.id}
            className={settings.view === view.id ? 'active' : ''}
            onClick={() => void updateSettings({ view: view.id })}
          >
            {view.label}
          </button>
        ))}
      </nav>

      <div className="segmented" role="radiogroup" aria-label="Game mode">
        {GAME_MODES.map((mode) => (
          <button
            key={mode.id}
            role="radio"
            aria-checked={settings.gameMode === mode.id}
            className={settings.gameMode === mode.id ? 'active' : ''}
            onClick={() => void setGameMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <RaidClock />

      <LevelInput
        key={settings.gameMode}
        level={level}
        fleaMinLevel={fleaMinLevel}
        onChange={(value) => void setPlayerLevel(value)}
      />

      <div className="topbar-actions">
        <button
          className="button icon"
          title="Search quests, keys and items (Ctrl+K)"
          aria-label="Search"
          onClick={openQuickSearch}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="topbar-icon">
            <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
          </svg>
        </button>
        <button
          className="button"
          title="Refresh prices"
          onClick={() => void refreshPrices()}
          disabled={refreshing}
        >
          <span className={refreshing ? 'spin' : ''} aria-hidden>
            ⟳
          </span>
          <span className="refresh-label">{refreshing ? 'Refreshing…' : 'Refresh prices'}</span>
        </button>
        <button className="button icon" onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙
        </button>
      </div>
    </header>
  )
}
