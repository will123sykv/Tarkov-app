/**
 * Live check of the tarkov.dev queries the app uses. Runs in CI (non-blocking) so a schema
 * change on tarkov.dev's side shows up quickly. Usage: npm run smoke:api
 */
import { MAP_REQUEST_TIMEOUT_MS } from '../src/shared/constants'
import { TARKOV_DEV_GAME_MODE } from '../src/shared/gameModes'
import type { DataMode } from '../src/shared/types'
import { rankItems } from '../src/shared/valuation'
import { tarkovDevQuery } from '../src/main/pricing/http'
import { MAP_LOOT_QUERY, reduceMapLoot, type TarkovDevMap } from '../src/main/pricing/mapPools'
import { fetchTarkovDev } from '../src/main/pricing/tarkovDev'

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

async function smoke(dataMode: DataMode): Promise<void> {
  const dataset = await fetchTarkovDev(fetch, dataMode)
  const { items } = dataset
  const withFlea = items.filter((i) => i.fleaPrice).length
  const withTrader = items.filter((i) => i.bestTrader).length
  const gated = items.filter((i) => i.minLevelForFlea).length
  const banned = items.filter((i) => i.bannedOnFlea).length
  console.log(
    `[${dataMode}] ${items.length} items · ${withFlea} with flea price · ${withTrader} with trader price · ` +
      `${gated} with a flea level gate · ${banned} flea-banned · flea unlocks at ${dataset.fleaMinLevel}`
  )
  check(items.length > 1000, 'expected more than 1000 items')
  check(withFlea > 500, 'expected flea prices for more than 500 items')
  check(withTrader > 500, 'expected trader prices for more than 500 items')

  const top = rankItems(
    items,
    { playerLevel: 62, fleaMinLevel: dataset.fleaMinLevel, subtractFleaFee: true },
    { category: 'all', mapItemIds: null, search: '', hideLocked: false, minValuePerSlot: 0 },
    { key: 'valuePerSlot', dir: 'desc' }
  ).slice(0, 5)
  for (const r of top) console.log(`  ${r.item.name}: ₽${Math.round(r.valuePerSlot).toLocaleString()}/slot`)

  const { maps } = await tarkovDevQuery<{ maps: (TarkovDevMap | null)[] }>(
    fetch,
    MAP_LOOT_QUERY,
    { gameMode: TARKOV_DEV_GAME_MODE[dataMode] },
    MAP_REQUEST_TIMEOUT_MS
  )
  const pools = reduceMapLoot(maps)
  console.log(`[${dataMode}] map pools: ${pools.map((p) => `${p.name} (${p.itemIds.length})`).join(', ')}`)
  check(pools.length >= 5, 'expected loose loot for at least 5 maps')
}

// Each piece of the app's queries on its own, so a rejected query points at the field responsible.
const PROBES: [string, string][] = [
  ['items (no args)', '{ items(limit: 1) { id } }'],
  ['items(gameMode)', '{ items(limit: 1, gameMode: regular) { id } }'],
  ['fleaMarket(gameMode)', '{ fleaMarket(gameMode: regular) { minPlayerLevel enabled } }'],
  ...[
    'name shortName width height types',
    'basePrice avg24hPrice lastLowPrice',
    'minLevelForFlea',
    'fleaMarketFee',
    'iconLink wikiLink',
    'category { name }',
    'sellFor { priceRUB vendor { name normalizedName } }'
  ].map((fields): [string, string] => [`item ${fields}`, `{ items(limit: 1) { id ${fields} } }`]),
  ['maps lootLoose', '{ maps(limit: 1) { id name lootLoose { items { id } } } }']
]

async function probe(): Promise<void> {
  console.log('Probing query parts individually:')
  for (const [label, query] of PROBES) {
    try {
      await tarkovDevQuery(fetch, query, {}, MAP_REQUEST_TIMEOUT_MS)
      console.log(`  ok    ${label}`)
    } catch (err) {
      console.log(`  FAIL  ${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

async function main(): Promise<void> {
  try {
    for (const mode of ['pvp', 'pve'] as const) await smoke(mode)
  } catch (err) {
    await probe()
    throw err
  }
  console.log('tarkov.dev smoke test passed')
}

main().catch((err) => {
  console.error(`tarkov.dev smoke test failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
