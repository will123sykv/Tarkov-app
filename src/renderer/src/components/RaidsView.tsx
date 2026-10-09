import { useMemo } from 'react'
import type { FleaRecord, RaidRecord } from '../../../shared/logTypes'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { formatRub } from '../lib/format'
import { useItemLookup } from '../lib/useItemLookup'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'
import LogStatusPanel from './LogStatusPanel'
import Sidebar, { SidebarSection } from './Sidebar'

const MAX_ROWS = 200

/** Maps the quest data leaves out, by the game's location id: the Ground Zero tutorial (since 1.33.0). */
const OTHER_MAP_NAMES: Record<string, string> = { sandbox_start: 'Ground Zero Tutorial' }

const when = (t: number): string =>
  new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

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
  const raids = history?.raids ?? []
  const flea = history?.flea ?? []

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
        <LogStatusPanel />
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
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Map</th>
                    <th>As</th>
                    <th className="num">Queue</th>
                    <th className="num">Load</th>
                    <th className="num">Length</th>
                  </tr>
                </thead>
                <tbody>
                  {raids.slice(0, MAX_ROWS).map((r) => (
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
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Item</th>
                    <th className="num">Count</th>
                    <th>Buyer</th>
                    <th className="num">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {flea.slice(0, MAX_ROWS).map((f, i) => (
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
