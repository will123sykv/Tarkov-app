/**
 * Temporary probe (removed after use): what intraday price history tarkov.dev offers, how often it
 * rescans prices, and, where 30 days of scans can be had, whether items' lowest prices really follow
 * the time of day (measured out of sample: buy and sell times picked on the first half of the days,
 * tested on the second).
 */
import { fleaMarketFee, type FleaFeeRates } from '../src/shared/fleaFee'

const GQL = 'https://api.tarkov.dev/graphql'
const JSON_BASE = 'https://json.tarkov.dev'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const HOUR = 3_600_000

type Raw = Record<string, unknown>

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const quantiles = (values: number[]): string =>
  values.length
    ? [0, 0.1, 0.5, 0.9, 1]
        .map((q) => [...values].sort((a, b) => a - b)[Math.round(q * (values.length - 1))])
        .map((v) => Math.round(v * 10) / 10)
        .join(' / ')
    : '—'

async function get(url: string, init: RequestInit = {}): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
    return { status: res.status, text: await res.text() }
  } catch (err) {
    return { status: 0, text: String(err) }
  }
}

interface Variant {
  name: string
  run: (query: string) => Promise<{ status: number; text: string }>
}

const VARIANTS: Variant[] = [
  {
    name: 'POST',
    run: (query) =>
      get(GQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query })
      })
  },
  {
    name: 'POST+UA',
    run: (query) =>
      get(GQL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': BROWSER_UA,
          Origin: 'https://tarkov.dev',
          Referer: 'https://tarkov.dev/'
        },
        body: JSON.stringify({ query })
      })
  },
  { name: 'GET', run: (query) => get(`${GQL}?query=${encodeURIComponent(query)}`) },
  {
    name: 'GET+UA',
    run: (query) =>
      get(`${GQL}?query=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': BROWSER_UA, Origin: 'https://tarkov.dev', Referer: 'https://tarkov.dev/' }
      })
  }
]

interface Point {
  t: number
  p: number
}

function gaps(points: Point[]): string {
  const g: number[] = []
  for (let i = 1; i < points.length; i++) g.push((points[i].t - points[i - 1].t) / 60_000)
  return `median gap ${g.length ? Math.round(median(g)) : '—'} min, gaps (min) ${quantiles(g)}`
}

function toPoints(raw: unknown): Point[] {
  return (Array.isArray(raw) ? (raw as Raw[]) : [])
    .map((p) => ({ t: Number(p.timestamp), p: Number(p.priceMin) }))
    .filter((p) => Number.isFinite(p.t) && p.p > 0)
    .sort((a, b) => a.t - b.t)
}

/** Lowest price by interval of the day (UTC), each day's levels relative to that day's median. */
function analyse(
  points: Point[],
  hours: number,
  basePrice: number,
  rates: FleaFeeRates
): {
  buy: number
  sell: number
  spread: number
  profit: number | null
  inSample: number
  outSample: number | null
  days: number
} | null {
  const slots = 24 / hours
  const byDay = new Map<string, number[][]>()
  for (const { t, p } of points) {
    const day = new Date(t).toISOString().slice(0, 10)
    const slot = Math.floor(new Date(t).getUTCHours() / hours)
    let d = byDay.get(day)
    if (!d) byDay.set(day, (d = Array.from({ length: slots }, () => [])))
    d[slot].push(p)
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  // Per day: each interval's median over the day's median.
  const ratios = days.map(([, d]) => {
    const all = d.flat()
    const mid = all.length ? median(all) : 0
    return d.map((v) => (v.length && mid > 0 ? median(v) / mid : null))
  })
  const levelsOf = (rows: (number | null)[][]): (number | null)[] =>
    Array.from({ length: slots }, (_, s) => {
      const v = rows.map((r) => r[s]).filter((x): x is number => x !== null)
      return v.length >= 4 ? median(v) : null
    })
  const pick = (levels: (number | null)[]): { buy: number; sell: number } | null => {
    const known = levels.map((l, s) => [l, s] as const).filter(([l]) => l !== null) as [number, number][]
    if (known.length < 2) return null
    const buy = known.reduce((a, b) => (b[0] < a[0] ? b : a))[1]
    const sell = known.reduce((a, b) => (b[0] > a[0] ? b : a))[1]
    return { buy, sell }
  }
  const all = pick(levelsOf(ratios))
  if (!all) return null
  const levels = levelsOf(ratios)
  // Share of days whose sell interval was dearer than their buy interval (no fee).
  const share = (rows: (number | null)[][], buy: number, sell: number): number | null => {
    const both = rows.filter((r) => r[buy] !== null && r[sell] !== null)
    return both.length >= 3 ? both.filter((r) => r[sell]! > r[buy]!).length / both.length : null
  }
  const half = Math.floor(ratios.length / 2)
  const first = pick(levelsOf(ratios.slice(0, half)))
  const outSample = first ? share(ratios.slice(half), first.buy, first.sell) : null
  const recent = points.slice(-Math.min(points.length, 72)).map((p) => p.p)
  const ref = median(recent)
  const buyPrice = ref * levels[all.buy]!
  const sellPrice = ref * levels[all.sell]!
  const fee = fleaMarketFee(basePrice, sellPrice, rates)
  return {
    buy: all.buy * hours,
    sell: all.sell * hours,
    spread: levels[all.sell]! / levels[all.buy]! - 1,
    profit: fee === null ? null : sellPrice - fee - buyPrice,
    inSample: share(ratios, all.buy, all.sell) ?? 0,
    outSample,
    days: days.length
  }
}

async function probeMode(mode: 'regular' | 'pve'): Promise<void> {
  const itemsRes = await get(`${JSON_BASE}/${mode}/items`)
  console.log(`[probe ${mode}] items: HTTP ${itemsRes.status}, ${itemsRes.text.length} bytes`)
  if (itemsRes.status !== 200) return
  const data = (JSON.parse(itemsRes.text) as { data: Raw }).data
  const items = (Array.isArray(data.items) ? data.items : Object.values(data.items as Raw)) as Raw[]
  const flea = (data.fleaMarket ?? {}) as Raw
  const rates: FleaFeeRates = {
    sellOfferFeeRate: Number(flea.sellOfferFeeRate ?? 0.03),
    sellRequirementFeeRate: Number(flea.sellRequirementFeeRate ?? 0.03)
  }
  console.log(`[probe ${mode}] item keys: ${Object.keys(items[0] ?? {}).join(', ')}`)
  // How fresh each item's price is: tarkov.dev's scan cadence.
  const now = Date.now()
  for (const key of ['updated', 'lastScan', 'timestamp']) {
    const ages = items
      .map((i) =>
        typeof i[key] === 'string' || typeof i[key] === 'number' ? new Date(i[key] as string).getTime() : NaN
      )
      .filter(Number.isFinite)
      .map((t) => (now - t) / 60_000)
    if (ages.length)
      console.log(
        `[probe ${mode}] ${key}: ${ages.length} items, minutes since (0/10/50/90/100%): ${quantiles(ages)}`
      )
  }
  const liquid = items
    .filter(
      (i) =>
        !(i.types as string[] | undefined)?.includes('preset') &&
        Number(i.lastLowPrice) >= 10_000 &&
        Number(i.lastOfferCount) >= 25
    )
    .sort((a, b) => Number(b.lastOfferCount) - Number(a.lastOfferCount))
  console.log(`[probe ${mode}] liquid items (offers ≥ 25, price ≥ ₽10k): ${liquid.length}`)
  const first = String(liquid[0]?.id)

  // Other JSON files that might hold intraday history.
  for (const path of [
    '',
    `prices/${first}`,
    `historical_prices/${first}`,
    `historicalPrices/${first}`,
    `historical-prices/${first}`,
    `history/${first}`,
    `prices_30d/${first}`
  ]) {
    const res = await get(`${JSON_BASE}/${mode}/${path}`)
    let detail = res.text.slice(0, 160).replace(/\s+/g, ' ')
    if (res.status === 200) {
      try {
        const body = JSON.parse(res.text) as { data?: unknown }
        const points = toPoints(body.data)
        if (points.length) {
          const last30 = points.filter((p) => p.t >= now - 30 * 24 * HOUR)
          detail = `${points.length} points over ${((points.at(-1)!.t - points[0].t) / 86_400_000).toFixed(1)} days; last 30 days: ${last30.length} points, ${gaps(last30)}`
        }
      } catch {
        // not JSON
      }
    }
    console.log(`[probe ${mode}] json /${path}: HTTP ${res.status}: ${detail}`)
  }

  // GraphQL: is it up at all, and from which kind of request?
  const gqlMode = mode === 'regular' ? 'regular' : 'pve'
  let working: Variant | null = null
  for (const variant of VARIANTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await variant.run(`{ status { generalStatus { name } } }`)
      const ok = res.status === 200 && res.text.includes('generalStatus')
      console.log(
        `[probe ${mode}] graphql ${variant.name} status, try ${attempt}: HTTP ${res.status} ${res.text.slice(0, 160).replace(/\s+/g, ' ')}`
      )
      if (ok) {
        working ??= variant
        break
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  const history = async (ids: string[]): Promise<Map<string, Point[]> | null> => {
    if (!working) return null
    const query = `{ ${ids.map((id, i) => `h${i}: historicalItemPrices(id: "${id}", days: 30, gameMode: ${gqlMode}) { priceMin timestamp }`).join(' ')} }`
    const res = await working.run(query)
    if (res.status !== 200) {
      console.log(`[probe ${mode}] history batch: HTTP ${res.status} ${res.text.slice(0, 200)}`)
      return null
    }
    const body = JSON.parse(res.text) as { data?: Record<string, unknown>; errors?: unknown }
    if (!body.data) {
      console.log(`[probe ${mode}] history batch: no data ${JSON.stringify(body.errors).slice(0, 200)}`)
      return null
    }
    return new Map(ids.map((id, i) => [id, toPoints(body.data![`h${i}`])]))
  }
  // Also try the history query directly on every variant, in case only the status query is blocked.
  for (const variant of VARIANTS) {
    const res = await variant.run(
      `{ historicalItemPrices(id: "${first}", days: 30, gameMode: ${gqlMode}) { priceMin timestamp } }`
    )
    let detail = res.text.slice(0, 160).replace(/\s+/g, ' ')
    try {
      const points = toPoints((JSON.parse(res.text) as { data?: Raw }).data?.historicalItemPrices)
      if (points.length) {
        detail = `${points.length} points over ${((points.at(-1)!.t - points[0].t) / 86_400_000).toFixed(1)} days, ${gaps(points)}`
        working ??= variant
      }
    } catch {
      // not JSON
    }
    console.log(`[probe ${mode}] graphql ${variant.name} history: HTTP ${res.status}: ${detail}`)
  }
  if (!working) {
    console.log(`[probe ${mode}] GraphQL history: NOT AVAILABLE from here`)
    return
  }

  // Do lowest prices follow the time of day? 150 liquid items, 30 days.
  const top = liquid.slice(0, 150)
  const series = new Map<string, Point[]>()
  for (let i = 0; i < top.length; i += 10) {
    const batch = await history(top.slice(i, i + 10).map((item) => String(item.id)))
    for (const [id, points] of batch ?? []) series.set(id, points)
  }
  const counts = [...series.values()].map((p) => p.length)
  console.log(`[probe ${mode}] history for ${series.size} items: points per item ${quantiles(counts)}`)
  for (const hours of [2, 3, 4, 6]) {
    const results = top
      .map((item) => {
        const points = series.get(String(item.id)) ?? []
        const r = points.length ? analyse(points, hours, Number(item.basePrice) || 0, rates) : null
        return r ? { name: String(item.name ?? item.id), offers: Number(item.lastOfferCount), ...r } : null
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
    const out = results.map((r) => r.outSample).filter((x): x is number => x !== null)
    const reliable = results.filter((r) => (r.outSample ?? 0) >= 0.7)
    const pays = results.filter((r) => (r.profit ?? -1) >= 2000 && r.inSample >= 0.6)
    console.log(
      `[probe ${mode}] ${hours} h intervals: ${results.length} items with a buy and sell time · spread ${quantiles(results.map((r) => r.spread * 100))} % · ` +
        `held on later days (out of sample, 50% = chance): ${quantiles(out.map((x) => x * 100))} % · ${reliable.length} items ≥ 70% · ` +
        `${pays.length} clear ₽2,000 after the fee on 60%+ of days`
    )
    for (const r of [...results]
      .sort((a, b) => (b.outSample ?? 0) - (a.outSample ?? 0))
      .slice(0, hours === 3 ? 10 : 3))
      console.log(
        `   ${r.name.slice(0, 40)}: buy ${String(r.buy).padStart(2, '0')}:00, sell ${String(r.sell).padStart(2, '0')}:00 UTC, ` +
          `+${(r.spread * 100).toFixed(1)}%, profit ${r.profit === null ? '—' : Math.round(r.profit)}, ` +
          `in sample ${(r.inSample * 100).toFixed(0)}%, later days ${r.outSample === null ? '—' : (r.outSample * 100).toFixed(0) + '%'}, ${r.days} days, ${r.offers} offers`
      )
  }
}

async function main(): Promise<void> {
  for (const mode of ['regular', 'pve'] as const) await probeMode(mode)
}

void main()
