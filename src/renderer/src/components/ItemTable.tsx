import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import type { KeepInfo } from '../../../shared/hideout'
import type { PriceState, SortKey, SortState } from '../../../shared/types'
import type { RankedItem } from '../../../shared/valuation'
import { formatPercent, formatRub } from '../lib/format'
import { useStore } from '../store'

interface Props {
  rows: RankedItem[]
  priceState: PriceState | null
  sort: SortState
  /** Show the per-search spawn chance column (a container is selected). */
  showChance: boolean
  /** e.g. "Jacket on Customs", for the empty state. */
  scopeLabel: string | null
  /** Items the hideout or active quests still need. */
  keep: ReadonlyMap<string, KeepInfo>
}

interface Column {
  key: SortKey | null
  label: string
  align?: 'right'
  className?: string
  title?: string
}

const COLUMNS: Column[] = [
  { key: null, label: '' },
  { key: 'name', label: 'Item' },
  { key: 'slots', label: 'Size', align: 'right' },
  { key: 'flea', label: 'Flea (net)', align: 'right' },
  { key: 'trader', label: 'Best trader', align: 'right' },
  { key: 'worth', label: 'Worth', align: 'right' },
  { key: 'valuePerSlot', label: '₽ / slot', align: 'right' },
  {
    key: 'chance',
    label: 'Chance',
    align: 'right',
    className: 'col-chance',
    title: 'Chance one search of this container turns up at least one'
  },
  { key: null, label: 'Flea access' },
  { key: null, label: 'Source', className: 'col-source' }
]

const ROW_HEIGHT = 52

function SortHeader({
  sort,
  columns,
  rowClass
}: {
  sort: SortState
  columns: Column[]
  rowClass: string
}): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  function toggle(key: SortKey): void {
    const dir = sort.key === key ? (sort.dir === 'desc' ? 'asc' : 'desc') : key === 'name' ? 'asc' : 'desc'
    void updateSettings({ sort: { key, dir } })
  }
  return (
    <div className={`${rowClass} header`} role="row">
      {columns.map((col, i) => (
        <div
          key={i}
          role="columnheader"
          className={[col.align === 'right' ? 'num' : '', col.className ?? ''].join(' ').trim()}
          title={col.title}
        >
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

/** Why not to sell an item: what still needs it, and whether it's hard to replace. */
function KeepTags({ keep }: { keep: KeepInfo }): React.JSX.Element {
  const what = [keep.hideout ? `hideout ${keep.hideout}` : null, keep.quests ? `quests ${keep.quests}` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <span className="keep-tags">
      {keep.scarce?.kind === 'rare' && (
        <span className="badge bad rare-badge" title={`${keep.scarce.reason}. Don't sell it.`}>
          Rare: don&rsquo;t sell
        </span>
      )}
      {keep.scarce?.kind === 'locked' && (
        <span className="badge warn rare-badge" title={`${keep.scarce.reason}. Don't sell it.`}>
          Can&rsquo;t buy yet
        </span>
      )}
      <span
        className="keep-tag"
        title={`Still needed: ${[
          keep.hideout ? `${keep.hideout} for the hideout` : null,
          keep.quests ? `${keep.quests} for active quests` : null
        ]
          .filter(Boolean)
          .join(', ')}`}
      >
        Keep · {what}
      </span>
    </span>
  )
}

function ItemRow({
  row,
  source,
  cached,
  showChance,
  keep
}: {
  row: RankedItem
  source: string
  cached: boolean
  showChance: boolean
  keep: KeepInfo | undefined
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
        {keep ? (
          <KeepTags keep={keep} />
        ) : (
          <small>{[item.shortName, item.category].filter(Boolean).join(' · ')}</small>
        )}
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
      {showChance && (
        <div
          className="num col-chance"
          title={
            row.chance != null ? `${formatPercent(row.chance)} of the items this container rolls` : undefined
          }
        >
          {row.searchChance != null ? formatPercent(row.searchChance) : '—'}
        </div>
      )}
      <div>
        <AccessBadge row={row} />
      </div>
      <div className="col-source">
        <span className="source" title={cached ? `Cached price from ${source}` : `Live price from ${source}`}>
          {source}
          {cached && ' *'}
        </span>
      </div>
    </>
  )
}

export default function ItemTable({
  rows,
  priceState,
  sort,
  showChance,
  scopeLabel,
  keep
}: Props): React.JSX.Element {
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
  const columns = showChance ? COLUMNS : COLUMNS.filter((c) => c.key !== 'chance')
  const rowClass = showChance ? 'row with-chance' : 'row'

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
    empty = <p>No items{scopeLabel ? ` from ${scopeLabel}` : ''} match these filters.</p>
  }

  return (
    <div className="table" role="table" aria-label="Loot ranked by value per slot">
      <SortHeader sort={sort} columns={columns} rowClass={rowClass} />
      <div className="table-body" ref={scrollRef}>
        {empty ? (
          <div className="empty">{empty}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index]
              const needed = keep.get(row.item.id)
              const classes = [
                rowClass,
                row.access.status !== 'sellable' ? 'not-sellable' : '',
                needed ? `keep ${needed.scarce?.kind ?? ''}` : ''
              ]
              return (
                <div
                  key={row.item.id}
                  role="row"
                  className={classes.filter(Boolean).join(' ')}
                  style={{ transform: `translateY(${v.start}px)`, height: ROW_HEIGHT }}
                >
                  <ItemRow row={row} source={source} cached={cached} showChance={showChance} keep={needed} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
