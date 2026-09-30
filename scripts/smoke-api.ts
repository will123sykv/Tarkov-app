/**
 * Live check of the tarkov.dev sources the app uses. Runs in CI (non-blocking) so a format
 * change on tarkov.dev's side shows up quickly. Usage: npm run smoke:api
 *
 * json.tarkov.dev (the primary source) must work, still know most bundled container loot items and
 * still carry what the flea trends, quests and maps views need; the GraphQL fallback is only
 * reported.
 */
import { rankTrends, todaySwing } from '../src/shared/fleaTrends'
import { levelRequirement } from '../src/shared/questProgress'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { DataMode, PriceDataset } from '../src/shared/types'
import { fleaAccess, rankItems } from '../src/shared/valuation'
import containerLoot from '../src/main/data/containerLoot.json'
import { errorMessage } from '../src/main/pricing/http'
import { fetchTarkovDev } from '../src/main/pricing/tarkovDev'
import { fetchJsonData, fetchTarkovDevJson } from '../src/main/pricing/tarkovDevJson'
import { fetchQuestData } from '../src/main/quests/questData'
import mapConfigData from '../src/renderer/src/data/mapConfigs.json'
import type { MapConfig } from '../src/shared/questTypes'
import { normalizeDailyHistory } from '../src/main/trends/trendService'

/** Matches the recorder's default price floor (src/main/trends/recorder.ts). */
const RECORDER_MIN_PRICE = 10_000

const MAP_CONFIGS = (mapConfigData as unknown as { maps: MapConfig[] }).maps

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

async function timed<T>(load: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now()
  const result = await load()
  return [result, Date.now() - start]
}

async function smokeJson(dataMode: DataMode): Promise<PriceDataset> {
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
  return dataset
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
 * The flea trends view records the most-listed items and ranks them by offers and today's swing,
 * and shows tarkov.dev's daily history per item: check those fields are still there.
 */
async function smokeTrends(dataset: PriceDataset): Promise<void> {
  const { items, dataMode } = dataset
  const recordable = items
    .filter(
      (i) =>
        !i.bannedOnFlea &&
        !i.types.includes('preset') &&
        (i.fleaPrice ?? 0) >= RECORDER_MIN_PRICE &&
        (i.offerCount ?? 0) > 0
    )
    .sort((a, b) => (b.offerCount ?? 0) - (a.offerCount ?? 0))
  const withRange = items.filter((i) => todaySwing(i) !== null).length
  console.log(
    `[trends ${dataMode}] ${recordable.length} recordable items (offers up, flea price ≥ ₽${RECORDER_MIN_PRICE.toLocaleString()}) · ` +
      `${withRange} with a 24h range · found-in-raid required: ${String(dataset.foundInRaidRequired)} · ` +
      `fee rates: ${JSON.stringify(dataset.fleaFeeRates)}`
  )
  check(recordable.length >= 300, 'fewer than 300 items have offer counts and flea prices to record')
  check(withRange > 500, 'the 24h low/high prices are missing')
  if (dataset.foundInRaidRequired)
    console.log(`[trends ${dataMode}] note: the flea requires found-in-raid items`)

  // What the trends view lists before any recordings, with the default filters at level 62.
  const rows = items.map((item) => ({
    item,
    stats: null,
    access: fleaAccess(item, 62, dataset.fleaMinLevel)
  }))
  const listed = rankTrends(rows, DEFAULT_SETTINGS.trends, 'swing', false)
  const d = DEFAULT_SETTINGS.trends
  console.log(
    `[trends ${dataMode}] ${listed.length} items listed while collecting with the defaults ` +
      `(offers ≥ ${d.minOffers}, price ≥ ₽${d.minPrice.toLocaleString()}, swing ≥ ${d.minSwing * 100}%, level 62):`
  )
  if (listed.length < 20)
    console.log(`[trends ${dataMode}] warning: the default filters list fewer than 20 items while collecting`)
  for (const { item: i } of listed.slice(0, 5)) {
    console.log(
      `  ${i.name}: ${i.offerCount} offers, now ₽${i.fleaPrice?.toLocaleString()}, ` +
        `24h ₽${i.low24hPrice?.toLocaleString()}–₽${i.high24hPrice?.toLocaleString()} ` +
        `(${Math.round(todaySwing(i)! * 100)}% swing)`
    )
  }

  const top = recordable[0]
  const daily = normalizeDailyHistory(await fetchJsonData(fetch, dataMode, `prices/${top.id}`))
  const priced = daily.filter((p) => p.priceMin !== null)
  console.log(
    `[trends ${dataMode}] daily history for ${top.name}: ${daily.length} points, ${priced.length} with a lowest price, ` +
      `latest ${new Date(daily.at(-1)?.t ?? 0).toISOString()}`
  )
  check(priced.length >= 7, 'the daily price history has fewer than 7 points with a lowest price')
}

/**
 * The quests and maps views: json.tarkov.dev's tasks and maps still normalise into quests with
 * objectives and map positions, and every bundled map projection still matches a map.
 */
async function smokeQuests(dataMode: DataMode): Promise<void> {
  const [data, ms] = await timed(() => fetchQuestData(fetch, dataMode, Date.now()))
  const objectives = data.quests.flatMap((q) => q.objectives)
  const placed = objectives.filter((o) => o.zones.length || o.locations.length).length
  const known = new Set(data.quests.map((q) => q.id))
  const brokenRequirements = data.quests
    .flatMap((q) => q.requires)
    .filter((r) => !known.has(r.questId)).length
  const untranslated = data.quests.filter((q) => q.name.endsWith(' name')).length
  console.log(
    `[quests ${dataMode}] ${data.quests.length} quests in ${ms} ms · ${objectives.length} objectives, ${placed} with map positions · ` +
      `${data.quests.filter((q) => q.kappaRequired).length} for Kappa · ${untranslated} untranslated · ` +
      `${brokenRequirements} requirements on unknown quests · ${data.maps.length} maps · ${data.traders.length} traders`
  )
  const traders = new Map(data.traders.map((t) => [t.id, t]))
  const byId = new Map(data.quests.map((q) => [q.id, q]))
  const own = data.quests.filter((q) => levelRequirement(q, byId, traders).own && q.minPlayerLevel > 1).length
  const loyalty = data.quests.filter((q) => q.traderRequirements.some((r) => r.type === 'level')).length
  const unlockLevels = data.traders.filter((t) => t.levels.some((l) => l.playerLevel > 1)).length
  console.log(
    `[quests ${dataMode}] ${own} quests with their own level requirement · ${loyalty} gated by loyalty level · ` +
      `${unlockLevels} traders with loyalty-level player levels · ` +
      `${Object.keys(data.otherQuestNames).length} names of quests not in the list (story and others)`
  )
  check(loyalty > 20 && unlockLevels > 3, 'trader loyalty requirements are missing from the quest data')
  check(data.quests.length > 300, 'expected more than 300 quests')
  check(placed > 100, 'expected quest objectives with map positions')
  check(untranslated < data.quests.length / 10, 'quest names are not being translated')
  const mapKeys = new Set(data.maps.map((m) => m.normalizedName))
  const unmatched = MAP_CONFIGS.filter((c) => !mapKeys.has(c.key)).map((c) => c.key)
  console.log(
    `[quests ${dataMode}] maps: ${data.maps.map((m) => `${m.name} (${m.nameId}, ${m.extracts.length} extracts)`).join(', ')}`
  )
  if (unmatched.length)
    console.log(`[quests ${dataMode}] map projections with no matching map: ${unmatched.join(', ')}`)
  check(unmatched.length <= 2, 'several bundled map projections no longer match a map (npm run data:maps)')
}

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    const dataset = await smokeJson(mode)
    await smokeTrends(dataset)
    await reportGraphql(mode)
    await smokeQuests(mode)
  }
  console.log('tarkov.dev smoke test passed')
}

main().catch((err) => {
  console.error(`tarkov.dev smoke test failed: ${errorMessage(err)}`)
  process.exit(1)
})
