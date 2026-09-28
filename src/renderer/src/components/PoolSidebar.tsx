import { CATEGORIES } from '../../../shared/categories'
import type { DataMode, PublicSettings } from '../../../shared/types'
import { useStore } from '../store'

interface Props {
  settings: PublicSettings
  dataMode: DataMode
}

export default function PoolSidebar({ settings, dataMode }: Props): React.JSX.Element {
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const updateSettings = useStore((s) => s.updateSettings)
  const mapPools = useStore((s) => s.mapPools[dataMode])
  const mapPoolsLoading = useStore((s) => s.mapPoolsLoading)
  const loadMapPools = useStore((s) => s.loadMapPools)
  const { pool } = settings

  return (
    <aside className="sidebar">
      <input
        className="search"
        type="search"
        placeholder="Search items…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search items"
      />

      <section>
        <h2>Loot pool</h2>
        <ul className="category-list">
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <button
                className={pool.category === c.id ? 'active' : ''}
                aria-pressed={pool.category === c.id}
                onClick={() => void updateSettings({ pool: { ...pool, category: c.id } })}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Map</h2>
        <select
          value={pool.mapId ?? ''}
          onChange={(e) => void updateSettings({ pool: { ...pool, mapId: e.target.value || null } })}
          disabled={!mapPools?.pools.length}
          aria-label="Map"
        >
          <option value="">Any map</option>
          {mapPools?.pools.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {mapPoolsLoading && !mapPools && <p className="hint">Loading map loot data…</p>}
        {mapPools?.error && (
          <p className="hint error">
            {mapPools.pools.length ? 'Using saved map data. ' : "Map data isn't available right now. "}
            <button className="link" onClick={() => void loadMapPools(true)} disabled={mapPoolsLoading}>
              Retry
            </button>
          </p>
        )}
        <p className="hint">Map pools list loose-loot spawns only, not what can spawn inside containers.</p>
      </section>

      <section>
        <h2>Filters</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.hideLocked}
            onChange={(e) => void updateSettings({ hideLocked: e.target.checked })}
          />
          Hide items I can't sell on the flea
        </label>
        <label className="field">
          <span>Min ₽ per slot</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={settings.minValuePerSlot}
            onChange={(e) => void updateSettings({ minValuePerSlot: Number(e.target.value) || 0 })}
          />
        </label>
      </section>
    </aside>
  )
}
