import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import type { PriceState, SortKey, SortState } from '../../../shared/types'
import type { RankedItem } from '../../../shared/valuation'
import { formatRub } from '../lib/format'
import { useStore } from '../store'

interface Props {
  rows: RankedItem[]
  priceState: PriceState | null
  sort: SortState
  selectedMapName: string | null
}

const COLUMNS: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: null, label: '' },
  { key: 'name', label: 'Item' },
  { key: 'slots', label: 'Size', align: 'right' },
  { key: 'flea', label: 'Flea (net)', align: 'right' },
  { key: 'trader', label: 'Best trader', align: 'right' },
  { key: 'worth', label: 'Worth', align: 'right' },
  { key: 'valuePerSlot', label: '₽ / slot', align: 'right' },
  { key: null, label: 'Flea access' },
  { key: null, label: 'Source' }
]

const ROW_HEIGHT = 52

function SortHeader({ sort }: { sort: SortState }): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  function toggle(key: SortKey): void {
    const dir = sort.key === key ? (sort.dir === 'desc' ? 'asc' : 'desc') : key === 'name' ? 'asc' : 'desc'
    void updateSettings({ sort: { key, dir } })
  }
  return (
    <div className="row header" role="row">
      {COLUMNS.map((col, i) => (
        <div key={i} role="columnheader" className={col.align === 'right' ? 'num' : ''}>
          {col.key ? (
            <button
              className={`sort ${sort.key === col.key ? 'active' : ''}`}
              onClick={() => toggle(col.key!)}
              aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              {col.label}
              {sort.key === col.key && <span aria-hidden>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
            </button>
          ) : (
            col.label
          )}
        </div>
      ))}
    </div>
  )
}

function AccessBadge({ row }: { row: RankedItem }): React.JSX.Element {
  const { status, unlockLevel } = row.access
  if (status === 'sellable') return <span className="badge ok">Sellable</span>
  if (status === 'banned') return <span className="badge bad">Flea banned</span>
  return <span className="badge warn">Locked · Lv {unlockLevel}</span>
}

function ItemRow({
  row,
  source,
  cached
}: {
  row: RankedItem
  source: string
  cached: boolean
}): React.JSX.Element {
  const { item } = row
  const size = item.width && item.height ? `${item.width}×${item.height}` : `${item.slots}`
  const fleaTitle =
    item.fleaPrice != null
      ? `Listed at ${formatRub(item.fleaPrice)}${item.fleaFee ? `, listing fee ${formatRub(item.fleaFee)}` : ''}`
      : 'No flea price'
  return (
    <>
      <div className="icon">
        {item.iconLink && (
          <img
            src={item.iconLink}
            alt=""
            loading="lazy"
            width={40}
            height={40}
            onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          />
        )}
      </div>
      <div className="name">
        {item.wikiLink ? (
          <a href={item.wikiLink} target="_blank" rel="noreferrer" title={`${item.name} (open wiki page)`}>
            {item.name}
          </a>
        ) : (
          <span title={item.name}>{item.name}</span>
        )}
        <small>{[item.shortName, item.category].filter(Boolean).join(' · ')}</small>
      </div>
      <div className="num" title={`${item.slots} slot${item.slots === 1 ? '' : 's'}`}>
        {size}
      </div>
      <div className={`num ${row.access.status !== 'sellable' ? 'dim' : ''}`} title={fleaTitle}>
        {formatRub(row.fleaNet)}
      </div>
      <div className="num">
        {formatRub(item.bestTrader?.price)}
        {item.bestTrader && <small>{item.bestTrader.name}</small>}
      </div>
      <div className="num">
        {formatRub(row.worth)}
        {row.via && <small>via {row.via}</small>}
      </div>
      <div className="num per-slot">{formatRub(row.valuePerSlot)}</div>
      <div>
        <AccessBadge row={row} />
      </div>
      <div>
        <span className="source" title={cached ? `Cached price from ${source}` : `Live price from ${source}`}>
          {source}
          {cached && ' *'}
        </span>
      </div>
    </>
  )
}

export default function ItemTable({ rows, priceState, sort, selectedMapName }: Props): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const refreshPrices = useStore((s) => s.refreshPrices)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const dataset = priceState?.dataset ?? null
  const source = dataset?.source ?? ''
  const cached = priceState?.fromCache ?? false

  let empty: React.ReactNode = null
  if (!dataset) {
    empty = priceState?.error ? (
      <>
        <p>No price data yet: {priceState.error}</p>
        <button className="button" onClick={() => void refreshPrices()} disabled={priceState.refreshing}>
          Try again
        </button>
      </>
    ) : (
      <p>Fetching prices…</p>
    )
  } else if (rows.length === 0) {
    empty = (
      <p>No items match this pool{selectedMapName ? ` on ${selectedMapName}` : ''} and these filters.</p>
    )
  }

  return (
    <main className="table" role="table" aria-label="Loot ranked by value per slot">
      <SortHeader sort={sort} />
      <div className="table-body" ref={scrollRef}>
        {empty ? (
          <div className="empty">{empty}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index]
              return (
                <div
                  key={row.item.id}
                  role="row"
                  className={`row ${row.access.status !== 'sellable' ? 'not-sellable' : ''}`}
                  style={{ transform: `translateY(${v.start}px)`, height: ROW_HEIGHT }}
                >
                  <ItemRow row={row} source={source} cached={cached} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
