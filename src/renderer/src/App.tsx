import { useDeferredValue, useEffect, useMemo } from 'react'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../shared/constants'
import { dataModeFor } from '../../shared/gameModes'
import { rankItems } from '../../shared/valuation'
import ItemTable from './components/ItemTable'
import ModeBanner from './components/ModeBanner'
import PoolSidebar from './components/PoolSidebar'
import SettingsDialog from './components/SettingsDialog'
import StatusBar from './components/StatusBar'
import TopBar from './components/TopBar'
import { useStore } from './store'

export default function App(): React.JSX.Element {
  const init = useStore((s) => s.init)
  const settings = useStore((s) => s.settings)
  const initError = useStore((s) => s.initError)
  const prices = useStore((s) => s.prices)
  const mapPools = useStore((s) => s.mapPools)
  const search = useDeferredValue(useStore((s) => s.search))

  useEffect(() => {
    void init()
  }, [init])

  const dataMode = settings ? dataModeFor(settings.gameMode) : 'pvp'
  const priceState = prices[dataMode] ?? null
  const dataset = priceState?.dataset ?? null
  const fleaMinLevel = dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL
  const playerLevel = settings ? settings.playerLevels[settings.gameMode] : 1
  const selectedMap = settings?.pool.mapId
    ? (mapPools[dataMode]?.pools.find((p) => p.id === settings.pool.mapId) ?? null)
    : null

  const mapItemIds = useMemo(() => (selectedMap ? new Set(selectedMap.itemIds) : null), [selectedMap])

  const ranked = useMemo(() => {
    if (!dataset || !settings) return []
    return rankItems(
      dataset.items,
      { playerLevel, fleaMinLevel, subtractFleaFee: settings.subtractFleaFee },
      {
        category: settings.pool.category,
        mapItemIds,
        search,
        hideLocked: settings.hideLocked,
        minValuePerSlot: settings.minValuePerSlot
      },
      settings.sort
    )
  }, [dataset, settings, playerLevel, fleaMinLevel, mapItemIds, search])

  if (initError) {
    return <div className="fatal">Failed to start: {initError}</div>
  }
  if (!settings) {
    return <div className="fatal muted">Loading…</div>
  }

  return (
    <div className="app">
      <TopBar settings={settings} priceState={priceState} fleaMinLevel={fleaMinLevel} />
      <ModeBanner gameMode={settings.gameMode} priceState={priceState} />
      <div className="workspace">
        <PoolSidebar settings={settings} dataMode={dataMode} />
        <ItemTable
          rows={ranked}
          priceState={priceState}
          sort={settings.sort}
          selectedMapName={selectedMap?.name ?? null}
        />
      </div>
      <StatusBar
        priceState={priceState}
        shown={ranked.length}
        total={dataset?.items.length ?? 0}
        playerLevel={playerLevel}
      />
      <SettingsDialog />
    </div>
  )
}
