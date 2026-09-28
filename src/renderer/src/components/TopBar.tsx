import { GAME_MODES } from '../../../shared/gameModes'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { useStore } from '../store'
import LevelInput from './LevelInput'

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
          <p>Value per inventory slot</p>
        </div>
      </div>

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

      <LevelInput
        key={settings.gameMode}
        level={level}
        fleaMinLevel={fleaMinLevel}
        onChange={(value) => void setPlayerLevel(value)}
      />

      <div className="topbar-actions">
        <button className="button" onClick={() => void refreshPrices()} disabled={refreshing}>
          <span className={refreshing ? 'spin' : ''} aria-hidden>
            ⟳
          </span>
          {refreshing ? 'Refreshing…' : 'Refresh prices'}
        </button>
        <button className="button icon" onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙
        </button>
      </div>
    </header>
  )
}
