import { useDeferredValue, useEffect, useMemo } from 'react'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../shared/constants'
import { rankContainers, valuesById } from '../../shared/containerValue'
import { dataModeFor } from '../../shared/gameModes'
import { rankItems, type ContainerFilter } from '../../shared/valuation'
import ErrorBoundary from './components/ErrorBoundary'
import ContainerSidebar from './components/ContainerSidebar'
import ContainerSummary from './components/ContainerSummary'
import HideoutView from './components/HideoutView'
import ItemTable from './components/ItemTable'
import KeysView from './components/KeysView'
import { useKeepList } from './lib/useKeepList'
import MapsView from './components/MapsView'
import QuestsView from './components/QuestsView'
import RaidsView from './components/RaidsView'
import ModeBanner from './components/ModeBanner'
import SettingsDialog from './components/SettingsDialog'
import StatusBar from './components/StatusBar'
import TodoView from './components/TodoView'
import TopBar from './components/TopBar'
import TrendsView from './components/TrendsView'
import { useTrendRanking } from './lib/useTrendRanking'
import { containerLootKey, useStore } from './store'

export default function App(): React.JSX.Element {
  const init = useStore((s) => s.init)
  const settings = useStore((s) => s.settings)
  const initError = useStore((s) => s.initError)
  const prices = useStore((s) => s.prices)
  const catalog = useStore((s) => s.containerCatalog)
  const containerLoot = useStore((s) => s.containerLoot)
  const search = useDeferredValue(useStore((s) => s.search))

  useEffect(() => {
    void init()
  }, [init])

  const dataMode = settings ? dataModeFor(settings.gameMode) : 'pvp'
  const priceState = prices[dataMode] ?? null
  const dataset = priceState?.dataset ?? null
  const fleaMinLevel = dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL
  const playerLevel = settings ? settings.playerLevels[settings.gameMode] : 1
  const subtractFleaFee = settings?.subtractFleaFee ?? true
  const mapId = settings?.pool.mapId ?? null
  const containerId = settings?.pool.containerId ?? null

  const view = settings?.view ?? 'loot'
  const trendsView = view === 'trends'
  const lootView = view === 'loot'
  const trendRanking = useTrendRanking(settings, dataset, trendsView)

  const ctx = useMemo(
    () => ({ playerLevel, fleaMinLevel, subtractFleaFee }),
    [playerLevel, fleaMinLevel, subtractFleaFee]
  )
  // What every item is worth to this player; shared by the container ranking and summary.
  // The loot view is hidden while the trends view is open, so skip the work.
  const values = useMemo(
    () => valuesById(lootView ? (dataset?.items ?? []) : [], ctx),
    [dataset, ctx, lootView]
  )
  const lootList = containerLoot[containerLootKey(mapId)]
  const ranking = useMemo(() => rankContainers(lootList ?? [], values), [lootList, values])
  const selected = containerId ? (ranking.find((r) => r.loot.id === containerId) ?? null) : null

  const containerFilter = useMemo<ContainerFilter | null>(
    () =>
      selected
        ? {
            chances: new Map(selected.loot.items.map((i) => [i.id, i.chance])),
            expectedCount: selected.loot.expectedCount
          }
        : null,
    [selected]
  )

  // What the hideout and active quests still need, with what's hard to replace marked.
  const keep = useKeepList(settings, priceState)
  const keepOnly = settings?.keepOnly ?? false
  const ranked = useMemo(() => {
    if (!dataset || !settings || !lootView) return []
    const rows = rankItems(
      dataset.items,
      ctx,
      {
        container: containerFilter,
        search,
        hideLocked: settings.hideLocked,
        minValuePerSlot: settings.minValuePerSlot
      },
      settings.sort
    )
    // Only what to save: needed, and can't be bought now or rare.
    return keepOnly ? rows.filter((r) => keep.get(r.item.id)?.scarce) : rows
  }, [dataset, settings, ctx, containerFilter, search, lootView, keepOnly, keep])

  if (initError) {
    return <div className="fatal">Failed to start: {initError}</div>
  }
  if (!settings) {
    return <div className="fatal muted">Loading…</div>
  }

  const mapName = mapId ? (catalog?.maps.find((m) => m.id === mapId)?.name ?? null) : null
  // A remembered container may not exist on the chosen map (e.g. no PC blocks on Factory).
  const unavailableContainer =
    containerId && lootList && !selected
      ? (catalog?.containers.find((c) => c.id === containerId)?.name ?? null)
      : null

  return (
    <div className="app">
      <TopBar settings={settings} priceState={priceState} fleaMinLevel={fleaMinLevel} />
      <ModeBanner gameMode={settings.gameMode} priceState={priceState} />
      <ErrorBoundary key={view} what="this tab" variant="tab">
        {view === 'trends' ? (
          <TrendsView settings={settings} priceState={priceState} ranking={trendRanking} />
        ) : view === 'todo' ? (
          <TodoView settings={settings} priceState={priceState} />
        ) : view === 'quests' ? (
          <QuestsView settings={settings} priceState={priceState} />
        ) : view === 'hideout' ? (
          <HideoutView settings={settings} priceState={priceState} />
        ) : view === 'keys' ? (
          <KeysView settings={settings} priceState={priceState} />
        ) : view === 'maps' ? (
          <MapsView settings={settings} priceState={priceState} />
        ) : view === 'raids' ? (
          <RaidsView settings={settings} priceState={priceState} />
        ) : (
          <div className="workspace">
            <ContainerSidebar
              settings={settings}
              catalog={catalog}
              ranking={lootList ? ranking : null}
              pricesLoaded={dataset !== null}
            />
            <main className="content">
              <ContainerSummary
                selected={selected}
                mapName={mapName}
                unavailableContainer={unavailableContainer}
                pricesLoaded={dataset !== null}
              />
              <ItemTable
                keep={keep}
                rows={ranked}
                priceState={priceState}
                sort={settings.sort}
                showChance={selected !== null}
                scopeLabel={selected ? `${selected.loot.name}${mapName ? ` on ${mapName}` : ''}` : null}
              />
            </main>
          </div>
        )}
      </ErrorBoundary>
      <StatusBar
        priceState={priceState}
        shown={trendsView ? trendRanking.rows.length : lootView ? ranked.length : null}
        total={dataset?.items.length ?? 0}
        playerLevel={playerLevel}
      />
      <SettingsDialog />
    </div>
  )
}
