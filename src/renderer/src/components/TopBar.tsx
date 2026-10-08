import { GAME_MODES } from '../../../shared/gameModes'
import type { AppView, PriceState, PublicSettings } from '../../../shared/types'
import { useStore } from '../store'
import LevelInput from './LevelInput'
import RaidClock from './RaidClock'

const VIEWS: { id: AppView; label: string; subtitle: string }[] = [
  { id: 'loot', label: 'Loot', subtitle: 'Value per inventory slot' },
  { id: 'trends', label: 'Flea trends', subtitle: 'Best times to buy and sell' },
  { id: 'todo', label: 'To do', subtitle: 'Which map to raid next for your quests' },
  { id: 'quests', label: 'Quests', subtitle: 'Quest progress from your game logs' },
  { id: 'hideout', label: 'Items to collect', subtitle: 'What your hideout and quests still need' },
  { id: 'keys', label: 'Keys', subtitle: 'Your keys and the ones quests need' },
  { id: 'maps', label: 'Maps', subtitle: 'Quest objectives, extracts and spawns' },
  { id: 'raids', label: 'Raids', subtitle: 'Raids and flea sales from your logs' }
]

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
        <div>
          <h1>Tarkov Loot Optimiser</h1>
          <p>{VIEWS.find((v) => v.id === settings.view)?.subtitle}</p>
        </div>
      </div>

      <nav className="view-tabs" role="tablist" aria-label="View">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            role="tab"
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
