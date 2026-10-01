import { useRef, useState } from 'react'
import type { RankedContainer } from '../../../shared/containerValue'
import type { ContainerCatalog, PublicSettings } from '../../../shared/types'
import { containerImage } from '../lib/containerImages'
import { formatDataMonth, formatRub } from '../lib/format'
import { useStore } from '../store'
import ContainerPreview from './ContainerPreview'

interface Props {
  settings: PublicSettings
  catalog: ContainerCatalog | null
  /** Containers on the selected map with their average value per search; null while loading. */
  ranking: RankedContainer[] | null
  pricesLoaded: boolean
}

export default function ContainerSidebar({
  settings,
  catalog,
  ranking,
  pricesLoaded
}: Props): React.JSX.Element {
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const updateSettings = useStore((s) => s.updateSettings)
  const setContainerMap = useStore((s) => s.setContainerMap)
  const { pool, containerSort } = settings
  const [preview, setPreview] = useState<{ id: string; top: number; left: number } | null>(null)
  const previewRow = useRef<HTMLElement | null>(null)

  const containers = ranking
    ? containerSort === 'name'
      ? [...ranking].sort((a, b) => a.loot.name.localeCompare(b.loot.name))
      : ranking
    : []
  const selectContainer = (containerId: string | null): void =>
    void updateSettings({ pool: { ...pool, containerId } })
  const showPreview = (id: string, row: HTMLElement): void => {
    previewRow.current = row
    const rowRect = row.getBoundingClientRect()
    const sidebarRect = row.closest('.sidebar')?.getBoundingClientRect()
    setPreview({ id, top: rowRect.top, left: sidebarRect?.right ?? rowRect.right })
  }
  const hidePreview = (): void => {
    previewRow.current = null
    setPreview(null)
  }
  // Keep the card level with its row while the list scrolls (e.g. keyboard focus scrolling a
  // row into view); hide it once the row leaves the visible part of the list.
  const followRow = (e: React.UIEvent<HTMLElement>): void => {
    const row = previewRow.current
    if (!row || !preview) return
    const rowRect = row.getBoundingClientRect()
    const sidebarRect = e.currentTarget.getBoundingClientRect()
    if (rowRect.bottom < sidebarRect.top || rowRect.top > sidebarRect.bottom) hidePreview()
    else setPreview({ ...preview, top: rowRect.top })
  }
  const previewed = preview ? containers.find((c) => c.loot.id === preview.id) : undefined

  return (
    <aside className="sidebar" onScroll={followRow}>
      <input
        className="search"
        type="search"
        placeholder="Search items…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search items"
      />

      <section>
        <h2>Map</h2>
        <select
          value={pool.mapId ?? ''}
          onChange={(e) => void setContainerMap(e.target.value || null)}
          disabled={!catalog}
          aria-label="Map"
        >
          <option value="">All maps</option>
          {catalog?.maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </section>

      <section>
        <div className="section-head">
          <h2>Container</h2>
          <div className="mini-toggle" role="radiogroup" aria-label="Sort containers">
            {(['value', 'name'] as const).map((key) => (
              <button
                key={key}
                role="radio"
                aria-checked={containerSort === key}
                className={containerSort === key ? 'active' : ''}
                onClick={() => void updateSettings({ containerSort: key })}
              >
                {key === 'value' ? 'By value' : 'A–Z'}
              </button>
            ))}
          </div>
        </div>
        <ul className="container-list">
          <li>
            <button
              className={pool.containerId === null ? 'active' : ''}
              aria-pressed={pool.containerId === null}
              onClick={() => selectContainer(null)}
            >
              <span className="thumb all" aria-hidden>
                ∗
              </span>
              <span className="name">All items</span>
            </button>
          </li>
          {containers.map(({ loot, value }) => {
            const image = containerImage(loot.id)
            return (
              <li key={loot.id}>
                <button
                  className={pool.containerId === loot.id ? 'active' : ''}
                  aria-pressed={pool.containerId === loot.id}
                  onClick={() => selectContainer(loot.id)}
                  onMouseEnter={(e) => showPreview(loot.id, e.currentTarget)}
                  onMouseLeave={hidePreview}
                  onFocus={(e) => showPreview(loot.id, e.currentTarget)}
                  onBlur={hidePreview}
                >
                  <span className="thumb" aria-hidden>
                    {image && <img src={image.url} alt="" />}
                  </span>
                  <span className="name">{loot.name}</span>
                  <span className="avg">{pricesLoaded ? formatRub(value.average) : ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {preview && previewed && (
          <ContainerPreview
            container={previewed}
            mapCount={catalog?.containers.find((c) => c.id === preview.id)?.mapIds.length ?? 0}
            pricesLoaded={pricesLoaded}
            anchor={preview}
          />
        )}
        {!ranking && <p className="hint">Loading container loot tables…</p>}
        {catalog && (
          <p className="hint">
            ₽ = average value per search. Loot tables: SPT data as of {formatDataMonth(catalog.dataAsOf)}.
            Money and ammo count as one unit, not a full stack, so safes and registers read low.
          </p>
        )}
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
        <label
          className="check"
          title="Items the hideout or your active quests still need that you can't buy now (at your level and trader loyalty) or that are rare"
        >
          <input
            type="checkbox"
            checked={settings.keepOnly}
            onChange={(e) => void updateSettings({ keepOnly: e.target.checked })}
          />
          Only items to save (can&rsquo;t buy or rare)
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
