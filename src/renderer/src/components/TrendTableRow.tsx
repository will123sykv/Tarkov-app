import { memo } from 'react'
import {
  consistencyShare,
  currentSwing,
  hasPattern,
  liquidity,
  timing,
  type TrendRow
} from '../../../shared/fleaTrends'
import { formatPercent, formatRub, formatRubCompact, formatSlot } from '../lib/format'
import DayStrip from './DayStrip'

interface Props {
  row: TrendRow
  selected: boolean
  bucketHours: number
  /** The hour of the day now (local). */
  hour: number
  patternsReady: boolean
  onSelect: (itemId: string) => void
}

/** "Buy now", "Sell now", or how long until the next of them. */
function Now({ row, hour, bucketHours }: { row: TrendRow; hour: number; bucketHours: number }) {
  const when = hasPattern(row) ? timing(row.stats!, hour, bucketHours) : null
  if (!when) return null
  if (when.now === 'buy') return <span className="badge info">Buy now</span>
  if (when.now === 'sell') return <span className="badge warn">Sell now</span>
  const buyFirst = when.buyIn <= when.sellIn
  return (
    <span className="muted">
      {buyFirst ? 'buy' : 'sell'} in {buyFirst ? when.buyIn : when.sellIn} h
    </span>
  )
}

/** One flea trends row. Memoised: selecting a row or a price refresh only re-renders what changed. */
function TrendTableRow({
  row,
  selected,
  bucketHours,
  hour,
  patternsReady,
  onSelect
}: Props): React.JSX.Element {
  const { item, stats, access } = row
  const swing = currentSwing(row)
  const recent = stats?.recent ?? null
  const pattern = hasPattern(row) ? stats! : null
  const partDay = pattern !== null && pattern.coveredHours.length * bucketHours < 24
  return (
    <tr
      className={selected ? 'selected' : ''}
      onClick={() => onSelect(item.id)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(item.id)}
    >
      <td className="name">
        <span title={item.name}>{item.name}</span>
        <small>
          {item.shortName}
          {access.status === 'locked' && ` · locked until level ${access.unlockLevel}`}
        </small>
      </td>
      <td>
        <Now row={row} hour={hour} bucketHours={bucketHours} />
      </td>
      <td className="num">{Math.round(liquidity(row) ?? 0).toLocaleString()}</td>
      <td className="num">{formatRub(item.fleaPrice)}</td>
      <td className="num">
        {recent
          ? `${formatRubCompact(recent.low)}–${formatRubCompact(recent.high)}`
          : item.low24hPrice && item.high24hPrice
            ? `${formatRubCompact(item.low24hPrice)}–${formatRubCompact(item.high24hPrice)}`
            : '—'}
        {swing !== null ? (
          <small
            title={
              recent
                ? `The cheapest and dearest hour of the last 24 (from ${recent.prices} prices over ${recent.hours} hours)`
                : 'tarkov.dev’s 24h range'
            }
          >
            {formatPercent(swing)} swing{recent ? '' : ' (tarkov.dev)'}
          </small>
        ) : (
          item.low24hPrice != null && item.high24hPrice != null && <small>includes bait offers</small>
        )}
      </td>
      <td>{pattern && <DayStrip stats={pattern} bucketHours={bucketHours} hour={hour} />}</td>
      <td>
        {pattern ? (
          <>
            {formatSlot(pattern.buy!.startHour, bucketHours)}
            <small title={partDay ? 'Only some hours of the day have prices so far' : undefined}>
              ~{formatRubCompact(pattern.buy!.price)}
              {partDay && ' · part of the day'}
            </small>
          </>
        ) : (
          <span className="muted">{patternsReady ? 'not enough prices' : 'loading…'}</span>
        )}
      </td>
      <td>
        {pattern && (
          <>
            {formatSlot(pattern.sell!.startHour, bucketHours)}
            <small>
              ~{formatRubCompact(pattern.sell!.price)}
              {pattern.spreadPct !== null && ` (+${formatPercent(pattern.spreadPct)})`}
            </small>
          </>
        )}
      </td>
      <td className={`num ${pattern?.profit != null && pattern.profit > 0 ? 'profit' : ''}`}>
        {pattern?.profit != null ? formatRub(pattern.profit) : ''}
        {pattern?.fee != null && <small>after {formatRubCompact(pattern.fee)} fee</small>}
      </td>
      <td className="num">
        {pattern?.consistency ? `${pattern.consistency.wins} of ${pattern.consistency.days} days` : ''}
        {pattern?.consistency && <small>{formatPercent(consistencyShare(pattern))}</small>}
      </td>
    </tr>
  )
}

export default memo(TrendTableRow)
