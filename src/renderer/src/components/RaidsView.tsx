import { useMemo } from 'react'
import type { FleaRecord, RaidRecord } from '../../../shared/logTypes'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { formatDateTime, formatRub } from '../lib/format'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
import { useTableSort, type SortColumn } from '../lib/useTableSort'
import { useStore } from '../store'
import { LogStatusLine } from './LogStatusPanel'
import Sidebar, { SidebarSection } from './Sidebar'
import { SortHead } from './SortHeader'

const MAX_ROWS = 200

/** Maps the quest data leaves out, by the game's location id: the Ground Zero tutorial (since 1.33.0). */
const OTHER_MAP_NAMES: Record<string, string> = { sandbox_start: 'Ground Zero Tutorial' }

const when = formatDateTime

// The same empty lists each time, so the stats aren't worked out again on every render.
const NO_RAIDS: RaidRecord[] = []
const NO_FLEA: FleaRecord[] = []

function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const average = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null
}

function payment(record: FleaRecord): string {
  if (record.kind === 'expired') return 'Expired'
  if (!record.payment) return '—'
  const { currency, amount } = record.payment
  return currency === 'RUB' ? formatRub(amount) : `${amount.toLocaleString()} ${currency}`
}

/** Raids and flea market activity read from the game's logs. */
export default function RaidsView({
  settings,
  priceState
}: {
  settings: PublicSettings
  priceState: PriceState | null
}): React.JSX.Element {
  const { questState } = useQuestRows(settings)
  const history = useStore((s) => s.logHistory[settings.gameMode])
  const items = useItemLookup(priceState)
  const mapNames = useMemo(
    () => new Map((questState?.dataset?.maps ?? []).map((m) => [m.nameId.toLowerCase(), m.name])),
    [questState]
  )
  const nameOf = (id: string): string =>
    mapNames.get(id.toLowerCase()) ?? OTHER_MAP_NAMES[id.toLowerCase()] ?? id
  const mapName = (raid: RaidRecord): string => nameOf(raid.map)
  const raids = history?.raids ?? NO_RAIDS
  const flea = history?.flea ?? NO_FLEA

  // Both lists sort by any column (since 1.59.0); their own order is newest first.
  const raidColumns = useMemo<SortColumn<RaidRecord>[]>(
    () => [
      { key: 'when', label: 'When', desc: true, value: (r) => r.startedAt ?? r.foundAt },
      {
        key: 'map',
        label: 'Map',
        value: (r) => mapNames.get(r.map.toLowerCase()) ?? OTHER_MAP_NAMES[r.map.toLowerCase()] ?? r.map
      },
      { key: 'side', label: 'As', value: (r) => r.side },
      { key: 'queue', label: 'Queue', num: true, desc: true, value: (r) => r.queueSeconds },
      { key: 'load', label: 'Load', num: true, desc: true, value: (r) => r.loadSeconds },
      {
        key: 'length',
        label: 'Length',
        num: true,
        desc: true,
        value: (r) => (r.startedAt && r.endedAt ? r.endedAt - r.startedAt : null)
      }
    ],
    [mapNames]
  )
  const fleaColumns = useMemo<SortColumn<FleaRecord>[]>(
    () => [
      { key: 'when', label: 'When', desc: true, value: (f) => f.t },
      {
        key: 'item',
        label: 'Item',
        value: (f) => (f.itemId ? (items.get(f.itemId)?.name ?? f.itemId) : null)
      },
      { key: 'count', label: 'Count', num: true, desc: true, value: (f) => f.count },
      { key: 'buyer', label: 'Buyer', value: (f) => f.buyer },
      {
        key: 'received',
        label: 'Received',
        num: true,
        desc: true,
        title: 'Roubles received (other currencies and expired offers last)',
        value: (f) => (f.kind === 'sold' && f.payment?.currency === 'RUB' ? f.payment.amount : null)
      }
    ],
    [items]
  )
  const raidSort = useTableSort('raids', raidColumns)
  const fleaSort = useTableSort('flea-sales', fleaColumns)
  const stats = useMemo(() => {
    const byMap = new Map<string, number>()
    for (const r of raids) byMap.set(r.map.toLowerCase(), (byMap.get(r.map.toLowerCase()) ?? 0) + 1)
    const sold = flea.filter((f) => f.kind === 'sold')
    const roubles = sold.reduce((sum, f) => sum + (f.payment?.currency === 'RUB' ? f.payment.amount : 0), 0)
    return {
      pmc: raids.filter((r) => r.side === 'pmc').length,
      scav: raids.filter((r) => r.side === 'scav').length,
      queue: average(raids.map((r) => r.queueSeconds)),
      load: average(raids.map((r) => r.loadSeconds)),
      byMap: [...byMap.entries()].sort((a, b) => b[1] - a[1]),
      sold: sold.length,
      expired: flea.length - sold.length,
      roubles
    }
  }, [raids, flea])

  return (
    <div className="raids">
      <Sidebar view="raids">
        <LogStatusLine />
        <SidebarSection title="Raids">
          <dl className="stat-list">
            <dt>Raids read</dt>
            <dd>{raids.length.toLocaleString()}</dd>
            <dt>PMC / scav</dt>
            <dd>
              {stats.pmc} / {stats.scav}
            </dd>
            <dt>Average queue</dt>
            <dd>{duration(stats.queue)}</dd>
            <dt>Average load</dt>
            <dd>{duration(stats.load)}</dd>
          </dl>
          {stats.byMap.length > 0 && (
            <ul className="map-counts">
              {stats.byMap.map(([id, count]) => (
                <li key={id}>
                  <span>{nameOf(id)}</span>
                  <span className="muted">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </SidebarSection>
        <SidebarSection title="Flea market">
          <dl className="stat-list">
            <dt>Sold</dt>
            <dd>{stats.sold.toLocaleString()}</dd>
            <dt>Earned</dt>
            <dd>{formatRub(stats.roubles)}</dd>
            <dt>Expired unsold</dt>
            <dd>{stats.expired.toLocaleString()}</dd>
          </dl>
        </SidebarSection>
      </Sidebar>
      <main className="content raids-content">
        <div className="summary">
          <div className="summary-title">
            <strong>Raids</strong>
            <span className="muted">
              Raids and flea sales the game&rsquo;s logs recorded for{' '}
              {settings.gameMode === 'pve' ? 'PvE' : settings.gameMode === 'season' ? 'PvP Season' : 'PvP'}.
              How raids ended isn&rsquo;t in the logs.
            </span>
          </div>
        </div>
        <div className="raids-tables">
          <section>
            <h3>Raids</h3>
            {raids.length === 0 ? (
              <p className="muted">No raids read yet.</p>
            ) : (
              <table className="values-table">
                <SortHead columns={raidColumns} sort={raidSort.sort} onSort={raidSort.onSort} />
                <tbody>
                  {raidSort
                    .sorted(raids)
                    .slice(0, MAX_ROWS)
                    .map((r) => (
                      <tr key={`${r.foundAt}:${r.raidId}`}>
                        <td>{when(r.startedAt ?? r.foundAt)}</td>
                        <td>{mapName(r)}</td>
                        <td>{r.side === 'pmc' ? 'PMC' : r.side === 'scav' ? 'Scav' : '—'}</td>
                        <td className="num">{duration(r.queueSeconds)}</td>
                        <td className="num">{duration(r.loadSeconds)}</td>
                        <td className="num">
                          {r.startedAt && r.endedAt ? duration((r.endedAt - r.startedAt) / 1000) : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
          <section>
            <h3>Flea market</h3>
            {flea.length === 0 ? (
              <p className="muted">No flea sales read yet.</p>
            ) : (
              <table className="values-table">
                <SortHead columns={fleaColumns} sort={fleaSort.sort} onSort={fleaSort.onSort} />
                <tbody>
                  {fleaSort
                    .sorted(flea)
                    .slice(0, MAX_ROWS)
                    .map((f, i) => (
                      <tr key={`${f.t}:${i}`} className={f.kind === 'expired' ? 'dim-row' : ''}>
                        <td>{when(f.t)}</td>
                        <td>{f.itemId ? (items.get(f.itemId)?.name ?? f.itemId) : '—'}</td>
                        <td className="num">{f.count ?? '—'}</td>
                        <td>{f.buyer ?? ''}</td>
                        <td className="num">{payment(f)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
