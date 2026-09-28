/**
 * Live check of the tarkov.dev sources the app uses. Runs in CI (non-blocking) so a format
 * change on tarkov.dev's side shows up quickly. Usage: npm run smoke:api
 *
 * json.tarkov.dev (the primary source) must work, still know most bundled container loot items and
 * still carry what the flea trends view needs; the GraphQL fallback is only reported.
 */
import { rankTrends, todaySwing } from '../src/shared/fleaTrends'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { DataMode, PriceDataset } from '../src/shared/types'
import { fleaAccess, rankItems } from '../src/shared/valuation'
import containerLoot from '../src/main/data/containerLoot.json'
import { errorMessage } from '../src/main/pricing/http'
import { fetchTarkovDev } from '../src/main/pricing/tarkovDev'
import { fetchJsonData, fetchTarkovDevJson, jsonUrl, values } from '../src/main/pricing/tarkovDevJson'
import { normalizeDailyHistory } from '../src/main/trends/trendService'

/** Matches the recorder's default price floor (src/main/trends/recorder.ts). */
const RECORDER_MIN_PRICE = 10_000

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
 * Informational, for the upcoming quests and maps views: which task and map files json.tarkov.dev
 * serves, what a task, objective and map look like, and tarkov.dev's map projection configs.
 * Never fails.
 */
async function probeQuestData(dataMode: DataMode): Promise<void> {
  const short = (value: unknown, max = 1500): string => JSON.stringify(value)?.slice(0, max) ?? 'undefined'
  for (const file of ['tasks', 'tasks_en', 'maps', 'maps_en', 'quests', 'hideout']) {
    try {
      const res = await fetch(jsonUrl(dataMode, file))
      const text = await res.text()
      console.log(`[probe ${dataMode}] ${file}: HTTP ${res.status}, ${text.length} bytes`)
      if (!res.ok) continue
      const body = JSON.parse(text) as { data?: unknown }
      const data = body.data as Record<string, unknown>
      console.log(
        `[probe ${dataMode}] ${file} data keys: ${short(Object.keys(data ?? {}).slice(0, 30), 600)}`
      )
      if (file === 'tasks') {
        const tasks = values((data.tasks ?? data) as Record<string, Record<string, unknown>>)
        console.log(
          `[probe ${dataMode}] tasks: ${tasks.length}; first task keys: ${short(Object.keys(tasks[0] ?? {}))}`
        )
        console.log(`[probe ${dataMode}] first task: ${short(tasks[0], 2500)}`)
        const types = new Map<string, number>()
        const objectiveKeys = new Set<string>()
        let withZones = 0
        let withLocations = 0
        for (const task of tasks) {
          for (const o of (task.objectives as Record<string, unknown>[] | undefined) ?? []) {
            types.set(String(o.type), (types.get(String(o.type)) ?? 0) + 1)
            Object.keys(o).forEach((k) => objectiveKeys.add(k))
            if (Array.isArray(o.zones) && o.zones.length) withZones++
            if (Array.isArray(o.possibleLocations) && o.possibleLocations.length) withLocations++
          }
        }
        console.log(`[probe ${dataMode}] objective types: ${short([...types])}`)
        console.log(`[probe ${dataMode}] objective keys: ${short([...objectiveKeys])}`)
        console.log(
          `[probe ${dataMode}] objectives with zones: ${withZones}, with possibleLocations: ${withLocations}`
        )
        for (const type of ['giveItem', 'findQuestItem', 'visit', 'mark', 'shoot', 'extract']) {
          const task = tasks.find((t) =>
            (t.objectives as { type: string }[] | undefined)?.some((o) => o.type === type)
          )
          const objective = (task?.objectives as { type: string }[] | undefined)?.find((o) => o.type === type)
          console.log(`[probe ${dataMode}] sample ${type} objective: ${short(objective, 1200)}`)
        }
        console.log(
          `[probe ${dataMode}] other top-level task data: ${short(Object.keys(data).filter((k) => k !== 'tasks'))}`
        )
      }
      if (file === 'maps') {
        const maps = values((data.maps ?? data) as Record<string, Record<string, unknown>>)
        console.log(
          `[probe ${dataMode}] maps: ${maps.length}; first map keys: ${short(Object.keys(maps[0] ?? {}))}`
        )
        for (const m of maps) {
          const size = (k: string): number => (Array.isArray(m[k]) ? (m[k] as unknown[]).length : -1)
          console.log(
            `  ${String(m.normalizedName ?? m.name)} (${String(m.id)}): extracts ${size('extracts')}, spawns ${size('spawns')}, ` +
              `transits ${size('transits')}, lootContainers ${size('lootContainers')}, locks ${size('locks')}`
          )
        }
        const withExtracts = maps.find((m) => Array.isArray(m.extracts) && (m.extracts as unknown[]).length)
        console.log(
          `[probe ${dataMode}] sample extract: ${short((withExtracts?.extracts as unknown[])?.[0], 800)}`
        )
        const withSpawns = maps.find((m) => Array.isArray(m.spawns) && (m.spawns as unknown[]).length)
        console.log(`[probe ${dataMode}] sample spawn: ${short((withSpawns?.spawns as unknown[])?.[0], 600)}`)
        console.log(
          `[probe ${dataMode}] map without arrays: ${short(Object.fromEntries(Object.entries(maps[0] ?? {}).filter(([, v]) => !Array.isArray(v))), 1200)}`
        )
      }
      if (file.endsWith('_en')) {
        const sample = Object.entries(data ?? {}).slice(0, 5)
        console.log(
          `[probe ${dataMode}] ${file}: ${Object.keys(data ?? {}).length} entries, e.g. ${short(sample, 600)}`
        )
      }
    } catch (err) {
      console.log(`[probe ${dataMode}] ${file} failed: ${errorMessage(err)}`)
    }
  }
}

/** Informational: tarkov.dev's interactive map configs (MIT) and whether their images respond. */
async function probeMapConfigs(): Promise<void> {
  try {
    const url = 'https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/src/data/maps.json'
    const groups = (await (await fetch(url)).json()) as {
      normalizedName: string
      maps: Record<string, unknown>[]
    }[]
    for (const group of groups) {
      for (const map of group.maps.filter((m) => m.projection === 'interactive')) {
        const { layers, ...rest } = map
        console.log(
          `[probe maps] ${group.normalizedName}: ${JSON.stringify(rest)} layers: ${Array.isArray(layers) ? layers.length : 0}`
        )
      }
    }
    const customs = groups
      .find((g) => g.normalizedName === 'customs')
      ?.maps.find((m) => m.projection === 'interactive')
    if (customs) {
      const svg = await fetch(String(customs.svgPath), { method: 'HEAD' })
      console.log(`[probe maps] customs svg: HTTP ${svg.status} ${svg.headers.get('content-length')} bytes`)
      const tile = String(customs.tilePath).replace('{z}', '3').replace('{x}', '4').replace('{y}', '3')
      const res = await fetch(tile, { method: 'HEAD' })
      console.log(`[probe maps] customs tile ${tile}: HTTP ${res.status} ${res.headers.get('content-type')}`)
    }
    const layered = groups
      .flatMap((g) => g.maps)
      .find((m) => Array.isArray(m.layers) && (m.layers as unknown[]).length)
    console.log(
      `[probe maps] sample layer: ${JSON.stringify((layered?.layers as unknown[])?.[0])?.slice(0, 600)}`
    )
  } catch (err) {
    console.log(`[probe maps] failed: ${errorMessage(err)}`)
  }
}

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    const dataset = await smokeJson(mode)
    await smokeTrends(dataset)
    await reportGraphql(mode)
    await probeQuestData(mode)
  }
  await probeMapConfigs()
  console.log('tarkov.dev smoke test passed')
}

main().catch((err) => {
  console.error(`tarkov.dev smoke test failed: ${errorMessage(err)}`)
  process.exit(1)
})
