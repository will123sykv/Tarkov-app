/**
 * Live check of the tarkov.dev sources the app uses. Runs in CI (non-blocking) so a format
 * change on tarkov.dev's side shows up quickly. Usage: npm run smoke:api
 *
 * json.tarkov.dev (the primary source) must work, still know most bundled container loot items and
 * still carry what the flea trends, quests and maps views need; the GraphQL fallback is only
 * reported. db4tarkov's map tiles must still be where the app looks for them, the wiki must still
 * give quest guides with pictures and the story chapters' steps, and items must still have short names,
 * sizes and grid images (the scav case scanner reads screenshots with them).
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeHistory, rankTrends, todaySwing } from '../src/shared/fleaTrends'
import { levelRequirement } from '../src/shared/questProgress'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { DataMode, PriceDataset } from '../src/shared/types'
import { fleaAccess, rankItems } from '../src/shared/valuation'
import containerLoot from '../src/main/data/containerLoot.json'
import { errorMessage } from '../src/main/pricing/http'
import { fetchTarkovDev } from '../src/main/pricing/tarkovDev'
import { fetchJsonData, fetchTarkovDevJson } from '../src/main/pricing/tarkovDevJson'
import { fetchQuestData } from '../src/main/quests/questData'
import { fetchQuestGuide, wikiTitle } from '../src/main/quests/questGuide'
import mapConfigData from '../src/renderer/src/data/mapConfigs.json'
import { mapPlaces } from '../src/renderer/src/lib/storyMaps'
import { storyQuests } from '../src/shared/storyQuests'
import { DB4TARKOV_MAPS, db4tarkovTileUrl } from '../src/shared/db4tarkov'
import type { MapConfig } from '../src/shared/questTypes'
import { createTarkovDevHistory, normalizeDailyHistory } from '../src/main/trends/history'

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
      `${count((i) => i.category)} with category · ${untranslated} untranslated · flea unlocks at ${dataset.fleaMinLevel} · ` +
      `${count((i) => i.buyFrom?.length)} sold by traders (${count((i) => i.buyFrom?.some((o) => o.questId))} after a quest)`
  )
  check(items.length > 1000, 'expected more than 1000 items')
  check(count((i) => i.fleaPrice) > 500, 'expected flea prices for more than 500 items')
  check(count((i) => i.bestTrader) > 500, 'expected trader prices for more than 500 items')
  check(untranslated < items.length / 10, 'item names are not being translated')
  check(count((i) => i.category) > items.length / 2, 'item categories are missing')
  check(count((i) => i.buyFrom?.length) > 500, 'what traders sell is missing')
  // The scav case scanner matches labels against short names of items the same size.
  check(
    count((i) => i.shortName && i.width && i.height) > items.length * 0.9,
    'item short names or sizes are missing'
  )
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

  // Buy and sell times from tarkov.dev's last 30 days (a point every scan), for the 60 most-listed
  // items, as the app works them out (3-hour parts of the day, UTC here).
  const now = Date.now()
  const history = await createTarkovDevHistory({
    dir: await mkdtemp(join(tmpdir(), 'trends-')),
    fetchFn: fetch,
    maxItems: 60
  }).load(dataMode, dataset)
  const counts = [...history.byItem.values()].map((p) => p.length).sort((a, b) => a - b)
  console.log(
    `[trends ${dataMode}] 30-day history for ${history.byItem.size} items: ${counts[0] ?? 0}–${counts.at(-1) ?? 0} points each` +
      (history.error ? ` · error: ${history.error}` : '')
  )
  check(history.byItem.size >= 50, "tarkov.dev's 30-day price history is missing")
  check(
    (counts[Math.floor(counts.length / 2)] ?? 0) > 150,
    "tarkov.dev's 30-day price history has under 5 points a day"
  )
  const withStats = rows.map((row) => {
    const points = history.byItem.get(row.item.id)
    return {
      ...row,
      stats: points
        ? analyzeHistory(points, {
            now,
            days: 30,
            bucketHours: 3,
            hourOf: (t) => new Date(t).getUTCHours(),
            dayOf: (t) => new Date(t).toISOString().slice(0, 10),
            basePrice: row.item.basePrice ?? null,
            feeRates: dataset.fleaFeeRates
          })
        : null
    }
  })
  const patterns = withStats.filter((row) => row.stats?.insufficient === null)
  const passing = rankTrends(withStats, d, 'profit', true)
  console.log(
    `[trends ${dataMode}] ${patterns.length} items with buy and sell times · ${passing.length} pass the default filters ` +
      `(profit ≥ ₽${d.minProfit.toLocaleString()}, worked on ≥ ${d.minConsistency * 100}% of days):`
  )
  for (const { item: i, stats } of passing.slice(0, 5))
    console.log(
      `  ${i.name}: buy ${stats!.buy!.startHour}:00 UTC ~₽${Math.round(stats!.buy!.price).toLocaleString()}, ` +
        `sell ${stats!.sell!.startHour}:00 ~₽${Math.round(stats!.sell!.price).toLocaleString()}, ` +
        `profit ₽${Math.round(stats!.profit ?? 0).toLocaleString()}, worked on ${stats!.consistency?.wins} of ${stats!.consistency?.days} days`
    )
  check(patterns.length >= 40, 'fewer than 40 items have buy and sell times from 30 days of prices')
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
  // What objectives the app can tick off by itself.
  const playerLevels = objectives.filter((o) => o.playerLevel !== null).length
  const questStatuses = objectives.filter((o) => o.questStatus !== null).length
  const loyaltySteps = objectives.filter((o) => o.traderLevel !== null).length
  console.log(
    `[quests ${dataMode}] objectives the app checks itself: ${playerLevels} player levels · ` +
      `${loyaltySteps} loyalty levels · ${questStatuses} other quests' progress`
  )
  check(loyalty > 20 && unlockLevels > 3, 'trader loyalty requirements are missing from the quest data')
  check(data.quests.length > 300, 'expected more than 300 quests')
  // The story chapters come from the wiki, with the game's ids from tarkov.dev's names.
  const chapters = data.storyChapters
  const steps = chapters.reduce((n, c) => n + c.objectives.length, 0)
  const handOvers = chapters
    .flatMap((c) => c.objectives)
    .filter((o) => o.handOver && o.itemNames.length).length
  console.log(
    `[story ${dataMode}] ${chapters.length} chapters (${chapters.map((c) => c.name).join(', ')}) · ${steps} steps · ` +
      `${handOvers} hand-overs naming items · ${chapters.filter((c) => /^[0-9a-f]{24}$/.test(c.id)).length} with the game's id`
  )
  // Which maps their steps are on, and the places they name there.
  const asQuests = storyQuests(chapters, {
    itemIds: new Map(),
    traderIds: new Map(data.traders.map((t) => [t.name.toLowerCase(), t.id])),
    places: mapPlaces(data.maps)
  })
  const storySteps = asQuests.flatMap((q) => q.objectives)
  console.log(
    `[story ${dataMode}] ${storySteps.filter((o) => o.maps.length).length} steps placed on a map, ` +
      `${storySteps.filter((o) => o.zones.length).length} with a rough pin · ` +
      `${storySteps.filter((o) => o.visits).length} "visit N times" · ` +
      `${storySteps.filter((o) => o.traderLevel).length} loyalty levels · e.g. ` +
      storySteps
        .filter((o) => o.zones.length)
        .slice(0, 6)
        .map((o) => `"${o.description}" → ${o.zones.map((z) => z.place).join(', ')}`)
        .join('; ')
  )
  check(chapters.length >= 5 && steps > 100, 'the story chapters are missing (the wiki pages changed?)')
  check(
    storySteps.filter((o) => o.maps.length).length > 50,
    'story steps are no longer placed on maps (the wiki pages changed?)'
  )
  check(
    chapters.some((c) => c.name === 'Tour' && /^[0-9a-f]{24}$/.test(c.id)),
    'Tour has no game id'
  )
  check(placed > 100, 'expected quest objectives with map positions')
  check(untranslated < data.quests.length / 10, 'quest names are not being translated')
  const mapKeys = new Set(data.maps.map((m) => m.normalizedName))
  const unmatched = MAP_CONFIGS.filter((c) => !mapKeys.has(c.key)).map((c) => c.key)
  console.log(
    `[quests ${dataMode}] maps: ${data.maps.map((m) => `${m.name} (${m.nameId}, ${m.extracts.length} extracts)`).join(', ')}`
  )
  if (unmatched.length)
    console.log(`[quests ${dataMode}] map projections with no matching map: ${unmatched.join(', ')}`)
  // The Keys tab: locks and the keys that open them, loose spots keys spawn at, and who can enter.
  const locks = data.maps.reduce((n, m) => n + m.locks.length, 0)
  const keySpawns = data.maps.reduce((n, m) => n + m.keySpawns.length, 0)
  console.log(
    `[keys ${dataMode}] ${locks} locks with a key · ${keySpawns} loose loot spots with a key · entry items: ` +
      data.maps
        .filter((m) => m.access.keyIds.length || m.access.maxPlayerLevel)
        .map(
          (m) =>
            `${m.name} (${m.access.keyIds.length} items${m.access.maxPlayerLevel ? `, up to level ${m.access.maxPlayerLevel}` : ''})`
        )
        .join(', ')
  )
  check(locks > 100 && keySpawns > 50, 'locks or key spawns are missing from the map data')
  check(unmatched.length <= 2, 'several bundled map projections no longer match a map (npm run data:maps)')

  const rewards = data.quests.map((q) => q.rewards)
  const keyed = objectives.filter((o) => o.requiredKeys.length).length
  const stations = new Set(rewards.flatMap((r) => r.craftUnlocks.map((c) => c.station)))
  const portraits = data.traders.filter((t) => t.imageLink).length
  console.log(
    `[quests ${dataMode}] rewards: ${rewards.filter((r) => r.items.length).length} quests with items, ` +
      `${rewards.filter((r) => r.traderStanding.length).length} with reputation, ` +
      `${rewards.filter((r) => r.offerUnlocks.length).length} with trader unlocks, ` +
      `${rewards.filter((r) => r.skills.length).length} with skills (${[...new Set(rewards.flatMap((r) => r.skills.map((k) => k.name)))].slice(0, 6).join(', ')}), ` +
      `crafts at ${[...stations].join(', ')} · other: ${[...new Set(rewards.flatMap((r) => r.other))].slice(0, 6).join(', ')} · ` +
      `${keyed} objectives needing keys · ${data.quests.filter((q) => q.neededKeys.length).length} quests with keys · ` +
      `${portraits} trader portraits · ${data.quests.filter((q) => q.wikiLink).length} wiki links`
  )
  check(rewards.filter((r) => r.items.length).length > 200, 'quest reward items are missing')
  check(keyed > 20, 'the keys quest objectives need are missing')
  check(portraits >= data.traders.length - 2, 'trader portraits are missing')
  check(!stations.has('Hideout'), 'hideout station names are missing from craft rewards')

  const levels = data.stations.flatMap((s) => s.levels)
  const untranslatedStations = data.stations.filter((s) => /_name$|^[0-9a-f]{24}$/.test(s.name))
  console.log(
    `[hideout ${dataMode}] ${data.stations.length} stations, ${levels.length} levels, ` +
      `${levels.reduce((n, l) => n + l.items.length, 0)} item requirements ` +
      `(${levels.reduce((n, l) => n + l.items.filter((i) => i.foundInRaid).length, 0)} found in raid), ` +
      `${levels.reduce((n, l) => n + l.stations.length + l.traders.length + l.skills.length, 0)} other requirements · ` +
      `${data.stations.map((s) => `${s.name} ${s.levels.length}`).join(', ')}`
  )
  check(data.stations.length >= 20, 'hideout stations are missing')
  check(levels.filter((l) => l.items.length).length > 30, 'hideout item requirements are missing')
  check(untranslatedStations.length === 0, 'hideout station names are not being translated')
}

/** A well-known quest's guide on the wiki: its text and pictures, and that the pictures load. */
async function smokeQuestGuide(): Promise<void> {
  const title = wikiTitle('https://escapefromtarkov.fandom.com/wiki/The_Extortionist')!
  const [guide, ms] = await timed(() => fetchQuestGuide(fetch, title, Date.now()))
  console.log(
    `[wiki] ${guide.title} in ${ms} ms: ${guide.blocks.length} paragraphs, ${guide.images.length} pictures ` +
      `(${guide.images.map((i) => `${i.file} "${i.caption}"`).join('; ')})`
  )
  check(guide.blocks.length > 0 && guide.images.length > 1, 'quest guides on the wiki changed format')
  const picture = await fetch(guide.images[0].thumb)
  console.log(`[wiki] picture: HTTP ${picture.status} ${picture.headers.get('content-type')}`)
  check(picture.ok && /^image\//.test(picture.headers.get('content-type') ?? ''), 'wiki pictures do not load')
}

/** Each db4tarkov map's corner tile at its top zoom (where a tile pixel is an image pixel). */
async function smokeDb4tarkovTiles(): Promise<void> {
  for (const [slug, { maxZoom }] of Object.entries(DB4TARKOV_MAPS)) {
    const top = await fetch(db4tarkovTileUrl(slug, maxZoom, 0, 0))
    const beyond = await fetch(db4tarkovTileUrl(slug, maxZoom + 1, 0, 0))
    console.log(
      `[db4tarkov] ${slug}: top zoom ${maxZoom} HTTP ${top.status}, zoom ${maxZoom + 1} HTTP ${beyond.status}`
    )
    check(top.ok && top.headers.get('content-type') === 'image/webp', `db4tarkov's ${slug} tiles moved`)
    check(!beyond.ok, `db4tarkov's ${slug} map has a new zoom level: its image changed size (recalibrate)`)
  }
}

/** The scav case scanner compares screenshot tiles with tarkov.dev's grid images. */
async function smokeGridImages(): Promise<void> {
  // Bolts (1×1), Water filter (1×2) and Electric motor (2×2).
  for (const id of ['57347c5b245977448d35f6e1', '5d1b385e86f774252167b98a', '5d1b2fa286f77425227d1674']) {
    const res = await fetch(`https://assets.tarkov.dev/${id}-grid-image.webp`)
    check(res.ok, `grid image for ${id}: HTTP ${res.status}`)
    check((await res.arrayBuffer()).byteLength > 500, `grid image for ${id} is empty`)
  }
  console.log('[grid images] ok')
}

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    const dataset = await smokeJson(mode)
    await smokeTrends(dataset)
    await reportGraphql(mode)
    await smokeQuests(mode)
  }
  await smokeDb4tarkovTiles()
  await smokeGridImages()
  await smokeQuestGuide()
  console.log('tarkov.dev smoke test passed')
}

main().catch((err) => {
  console.error(`tarkov.dev smoke test failed: ${errorMessage(err)}`)
  process.exit(1)
})
