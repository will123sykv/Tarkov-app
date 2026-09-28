import { memo } from 'react'
import {
  consistencyShare,
  hasPattern,
  liquidity,
  todaySwing,
  type TrendRow
} from '../../../shared/fleaTrends'
import { formatPercent, formatRub, formatRubCompact, formatSlot } from '../lib/format'

interface Props {
  row: TrendRow
  selected: boolean
  bucketHours: number
  patternsReady: boolean
  onSelect: (itemId: string) => void
}

/** One flea trends row. Memoised: selecting a row or a price refresh only re-renders what changed. */
function TrendTableRow({ row, selected, bucketHours, patternsReady, onSelect }: Props): React.JSX.Element {
  const { item, stats, access } = row
  const swing = todaySwing(item)
  const pattern = hasPattern(row) ? stats! : null
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
      <td className="num">{Math.round(liquidity(row) ?? 0).toLocaleString()}</td>
      <td className="num">{formatRub(item.fleaPrice)}</td>
      <td className="num">
        {item.low24hPrice && item.high24hPrice
          ? `${formatRubCompact(item.low24hPrice)}–${formatRubCompact(item.high24hPrice)}`
          : '—'}
        {swing !== null ? (
          <small>{formatPercent(swing)} swing</small>
        ) : (
          item.low24hPrice != null && item.high24hPrice != null && <small>includes outlier offers</small>
        )}
      </td>
      <td>
        {pattern ? (
          <>
            {formatSlot(pattern.buy!.startHour, bucketHours)}
            <small>~{formatRubCompact(pattern.buy!.price)}</small>
          </>
        ) : (
          <span className="muted">{patternsReady ? 'not enough data' : 'collecting…'}</span>
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
