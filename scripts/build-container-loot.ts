/**
 * Regenerates src/main/data/containerLoot.json from SPT's per-map container loot tables.
 *
 *   npm run data:containers                     # archived sp-tarkov repo (NCSA licence)
 *   npm run data:containers -- --source tushonka # its maintained successor (CC BY-NC-SA 4.0)
 *
 * The tables record which items were seen in each container in live raids, with relative weights.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { aggregateStaticLoot, type MapLootInput, type StaticLootFile } from './containerLoot'

const SOURCES = {
  spt: {
    source: 'SPT (Single Player Tarkov) server database',
    sourceUrl: 'https://github.com/sp-tarkov/server-csharp',
    license: 'NCSA',
    database:
      'https://raw.githubusercontent.com/sp-tarkov/server-csharp/main/Libraries/SPTarkov.Server.Assets/SPT_Data/database'
  },
  tushonka: {
    source: 'Single Player Tushonka server database',
    sourceUrl: 'https://github.com/SP-Tushonka/server-csharp',
    license: 'CC BY-NC-SA 4.0',
    database:
      'https://raw.githubusercontent.com/SP-Tushonka/server-csharp/main/Libraries/SPTushonka.Server.Assets/SPT_Data/database'
  }
} as const

/** SPT location folder → map name as players know it. Hideout and dev maps are left out. */
const MAPS: { id: string; name: string }[] = [
  { id: 'bigmap', name: 'Customs' },
  { id: 'factory4_day', name: 'Factory' },
  { id: 'factory4_night', name: 'Night Factory' },
  { id: 'interchange', name: 'Interchange' },
  { id: 'laboratory', name: 'The Lab' },
  { id: 'labyrinth', name: 'The Labyrinth' },
  { id: 'lighthouse', name: 'Lighthouse' },
  { id: 'rezervbase', name: 'Reserve' },
  { id: 'sandbox', name: 'Ground Zero' },
  { id: 'sandbox_high', name: 'Ground Zero 21+' },
  { id: 'shoreline', name: 'Shoreline' },
  { id: 'tarkovstreets', name: 'Streets of Tarkov' },
  { id: 'woods', name: 'Woods' }
]

// npm scripts run from the repo root.
const OUTPUT = resolve('src/main/data/containerLoot.json')

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()) as T
}

async function main(): Promise<void> {
  const sourceArg = process.argv.indexOf('--source')
  const key = (sourceArg >= 0 ? process.argv[sourceArg + 1] : 'spt') as keyof typeof SOURCES
  const source = SOURCES[key]
  if (!source) throw new Error(`unknown source "${key}" (expected ${Object.keys(SOURCES).join(' or ')})`)

  console.log(`Reading loot tables from ${source.sourceUrl}`)
  const locale = await getJson<Record<string, string>>(`${source.database}/locales/global/en.json`)
  const perMap: MapLootInput[] = []
  for (const map of MAPS) {
    const loot = await getJson<StaticLootFile>(`${source.database}/locations/${map.id}/staticLoot.json`)
    perMap.push({ map, loot })
    console.log(`  ${map.name}: ${Object.keys(loot).length} container templates`)
  }

  const data = aggregateStaticLoot(perMap, locale, {
    source: source.source,
    sourceUrl: source.sourceUrl,
    license: source.license,
    generatedAt: new Date().toISOString().slice(0, 10)
  })

  mkdirSync(dirname(OUTPUT), { recursive: true })
  const json = JSON.stringify(data)
  writeFileSync(OUTPUT, json + '\n')
  console.log(
    `Wrote ${data.containers.length} containers, ${data.items.length} items, data as of ${data.dataAsOf} ` +
      `(${(json.length / 1024 / 1024).toFixed(2)} MB) to ${OUTPUT}`
  )
  for (const c of data.containers) console.log(`  ${c.name}: ${Object.keys(c.maps).length} maps`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
