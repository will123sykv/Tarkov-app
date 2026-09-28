/**
 * Live check of the tarkov.dev sources the app uses. Runs in CI (non-blocking) so a format
 * change on tarkov.dev's side shows up quickly. Usage: npm run smoke:api
 *
 * json.tarkov.dev (the primary source) must work; the GraphQL fallback is only reported.
 */
import type { DataMode } from '../src/shared/types'
import { rankItems } from '../src/shared/valuation'
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonPools } from '../src/main/pricing/mapPools'
import { fetchTarkovDev } from '../src/main/pricing/tarkovDev'
import { fetchTarkovDevJson } from '../src/main/pricing/tarkovDevJson'

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
    { category: 'all', mapItemIds: null, search: '', hideLocked: false, minValuePerSlot: 0 },
    { key: 'valuePerSlot', dir: 'desc' }
  ).slice(0, 5)
  for (const r of top) {
    console.log(
      `  ${r.item.name} (${r.item.width}x${r.item.height}): ₽${Math.round(r.valuePerSlot).toLocaleString()}/slot ` +
        `via ${r.via}${r.via === 'trader' ? ` (${r.item.bestTrader?.name})` : ''}`
    )
  }

  const [pools, mapMs] = await timed(() => fetchJsonPools(fetch, dataMode))
  console.log(
    `[json ${dataMode}] map pools in ${mapMs} ms: ${pools.map((p) => `${p.name} (${p.itemIds.length})`).join(', ')}`
  )
  check(pools.length >= 5, 'expected loose loot for at least 5 maps')
}

async function reportGraphql(dataMode: DataMode): Promise<void> {
  try {
    const [dataset, ms] = await timed(() => fetchTarkovDev(fetch, dataMode))
    console.log(`[graphql ${dataMode}] ok: ${dataset.items.length} items in ${ms} ms`)
  } catch (err) {
    console.log(`[graphql ${dataMode}] unavailable (fallback only, not a failure): ${errorMessage(err)}`)
  }
}

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    await smokeJson(mode)
    await reportGraphql(mode)
  }
  console.log('tarkov.dev smoke test passed')
}

main().catch((err) => {
  console.error(`tarkov.dev smoke test failed: ${errorMessage(err)}`)
  process.exit(1)
})
