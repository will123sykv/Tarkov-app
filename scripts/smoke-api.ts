/**
 * Live check of the tarkov.dev sources the app uses. Runs in CI (non-blocking) so a format
 * change on tarkov.dev's side shows up quickly. Usage: npm run smoke:api
 *
 * json.tarkov.dev (the primary source) must work and still know most bundled container loot
 * items; the GraphQL fallback is only reported.
 */
import type { DataMode } from '../src/shared/types'
import { rankItems } from '../src/shared/valuation'
import containerLoot from '../src/main/data/containerLoot.json'
import { errorMessage } from '../src/main/pricing/http'
import { fetchTarkovDev } from '../src/main/pricing/tarkovDev'
import { fetchJsonData, fetchTarkovDevJson, jsonUrl, values } from '../src/main/pricing/tarkovDevJson'

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

async function timed<T>(load: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now()
  const result = await load()
  return [result, Date.now() - start]
}

async function smokeJson(dataMode: DataMode): Promise<void> {
  const [dataset, ms] = await timed(() => fetchTarkovDevJson(fetch, dataMode))
  const { items } = dataset
  const count = (predicate: (i: (typeof items)[number]) => unknown) => items.filter(predicate).length
  const untranslated = count((i) => i.name.endsWith(' Name'))
  console.log(
    `[json ${dataMode}] ${items.length} items in ${ms} ms · ${count((i) => i.fleaPrice)} with flea price · ` +
      `${count((i) => i.bestTrader)} with trader price · ${count((i) => i.fleaFee)} with flea fee · ` +
      `${count((i) => i.minLevelForFlea)} with a flea level gate · ${count((i) => i.bannedOnFlea)} flea-banned · ` +
      `${count((i) => i.category)} with category · ${untranslated} untranslated · flea unlocks at ${dataset.fleaMinLevel}`
  )
  check(items.length > 1000, 'expected more than 1000 items')
  check(count((i) => i.fleaPrice) > 500, 'expected flea prices for more than 500 items')
  check(count((i) => i.bestTrader) > 500, 'expected trader prices for more than 500 items')
  check(untranslated < items.length / 10, 'item names are not being translated')
  check(count((i) => i.category) > items.length / 2, 'item categories are missing')
  check(
    items.some((i) => i.bestTrader && !/^[0-9a-f]{24}/.test(i.bestTrader.name)),
    'trader names are not being translated'
  )

  const top = rankItems(
    items,
    { playerLevel: 62, fleaMinLevel: dataset.fleaMinLevel, subtractFleaFee: true },
    { container: null, search: '', hideLocked: false, minValuePerSlot: 0 },
    { key: 'valuePerSlot', dir: 'desc' }
  ).slice(0, 5)
  for (const r of top) {
    console.log(
      `  ${r.item.name} (${r.item.width}x${r.item.height}): ₽${Math.round(r.valuePerSlot).toLocaleString()}/slot ` +
        `via ${r.via}${r.via === 'trader' ? ` (${r.item.bestTrader?.name})` : ''}`
    )
  }

  // The bundled container loot tables are a snapshot; flag it when too many of their items no
  // longer exist on tarkov.dev (npm run data:containers refreshes them).
  const known = new Set(items.map((i) => i.id))
  const covered = containerLoot.items.filter((id) => known.has(id)).length
  const coverage = covered / containerLoot.items.length
  console.log(
    `[json ${dataMode}] container loot tables (as of ${containerLoot.dataAsOf}): ` +
      `${covered} of ${containerLoot.items.length} items known to tarkov.dev (${(coverage * 100).toFixed(1)}%)`
  )
  check(coverage >= 0.8, 'fewer than 80% of container loot items exist on tarkov.dev')
}

async function reportGraphql(dataMode: DataMode): Promise<void> {
  try {
    const [dataset, ms] = await timed(() => fetchTarkovDev(fetch, dataMode))
    console.log(`[graphql ${dataMode}] ok: ${dataset.items.length} items in ${ms} ms`)
  } catch (err) {
    console.log(`[graphql ${dataMode}] unavailable (fallback only, not a failure): ${errorMessage(err)}`)
  }
}

/**
 * Informational: what the raw items dump and the per-item price history files contain, for the
 * flea trends feature (offer counts, 24h range, history granularity and size). Never fails.
 */
async function probeTrendData(dataMode: DataMode): Promise<void> {
  try {
    const raw = await fetchJsonData<Record<string, unknown>>(fetch, dataMode, 'items')
    const flea = raw.fleaMarket as Record<string, unknown> | undefined
    console.log(`[probe ${dataMode}] fleaMarket keys: ${Object.keys(flea ?? {}).join(', ')}`)
    console.log(`[probe ${dataMode}] fleaMarket.foundInRaidRequired = ${String(flea?.foundInRaidRequired)}`)
    const items = values(raw.items as Record<string, Record<string, unknown>>)
    const fields = ['lastOfferCount', 'low24hPrice', 'high24hPrice', 'changeLast48hPercent', 'basePrice']
    for (const field of fields) {
      const present = items.filter((i) => typeof i[field] === 'number').length
      console.log(`[probe ${dataMode}] items with ${field}: ${present} of ${items.length}`)
    }
    const liquid = items
      .filter((i) => typeof i.lastOfferCount === 'number')
      .sort((a, b) => (b.lastOfferCount as number) - (a.lastOfferCount as number))
    console.log(
      `[probe ${dataMode}] offer count percentiles: ` +
        [0.01, 0.05, 0.1, 0.25, 0.5]
          .map((q) => `top ${q * 100}%≥${liquid[Math.floor(liquid.length * q)]?.lastOfferCount ?? '?'}`)
          .join(', ')
    )
    for (const item of liquid.slice(0, 3)) {
      const id = String(item.id)
      const res = await fetch(jsonUrl(dataMode, `prices/${id}`))
      const text = await res.text()
      const body = JSON.parse(text) as { data?: Record<string, unknown>[] }
      const points = Array.isArray(body.data) ? body.data : []
      const times = points
        .map((p) => Number(p.timestamp))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
      const gaps = times
        .slice(1)
        .map((t, i) => t - times[i])
        .sort((a, b) => a - b)
      const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : NaN
      console.log(
        `[probe ${dataMode}] history ${id} (${item.lastOfferCount} offers): HTTP ${res.status}, ${text.length} bytes, ` +
          `${points.length} points, span ${((times.at(-1)! - times[0]) / 3_600_000 / 24).toFixed(1)} days, ` +
          `median gap ${(median / 60_000).toFixed(1)} min, keys: ${Object.keys(points[0] ?? {}).join(', ')}, ` +
          `sample: ${JSON.stringify(points.at(-1))}`
      )
    }
  } catch (err) {
    console.log(`[probe ${dataMode}] failed: ${errorMessage(err)}`)
  }
}

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    await smokeJson(mode)
    await reportGraphql(mode)
    await probeTrendData(mode)
  }
  console.log('tarkov.dev smoke test passed')
}

main().catch((err) => {
  console.error(`tarkov.dev smoke test failed: ${errorMessage(err)}`)
  process.exit(1)
})
