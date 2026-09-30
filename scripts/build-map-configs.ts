/**
 * Regenerates src/renderer/src/data/mapConfigs.json from tarkov.dev's interactive map definitions
 * (github.com/the-hideout/tarkov-dev, src/data/maps.json, MIT licence): how game coordinates
 * project onto each map image, where the images are, and the place names on each map. The images themselves stay on
 * assets.tarkov.dev (CC BY-NC-SA 4.0) and are downloaded by the app when a map is opened.
 *
 *   npm run data:maps
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { MapConfig, MapLabel } from '../src/shared/questTypes'

const SOURCE = 'https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/src/data/maps.json'
const OUT = resolve('src/renderer/src/data/mapConfigs.json')

type Raw = Record<string, unknown>

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function labels(value: unknown): MapLabel[] {
  const result: MapLabel[] = []
  for (const raw of Array.isArray(value) ? (value as Raw[]) : []) {
    const [x, z] = Array.isArray(raw.position) ? raw.position.map(num) : []
    if (typeof raw.text !== 'string' || x == null || z == null) continue
    const bottom = num(raw.bottom)
    const top = num(raw.top)
    result.push({
      text: raw.text,
      position: [x, z],
      size: num(raw.size) ?? 100,
      rotation: num(raw.rotation) ?? 0,
      // tarkov.dev writes ±10000 for "no limit".
      bottom: bottom === null || bottom <= -1000 ? null : bottom,
      top: top === null || top >= 1000 ? null : top
    })
  }
  return result
}

async function main(): Promise<void> {
  const groups = (await (await fetch(SOURCE)).json()) as { normalizedName: string; maps: Raw[] }[]
  const configs: MapConfig[] = []
  for (const group of groups) {
    const map = group.maps.find((m) => m.projection === 'interactive')
    if (!map || !Array.isArray(map.transform) || !Array.isArray(map.bounds)) continue
    if (!map.tilePath && !map.svgPath) continue
    configs.push({
      key: String(map.key ?? group.normalizedName),
      altMaps: Array.isArray(map.altMaps) ? map.altMaps.map(String) : [],
      minZoom: Number(map.minZoom ?? 1),
      maxZoom: Number(map.maxZoom ?? 6),
      tileSize: Number(map.tileSize ?? 256),
      transform: map.transform as MapConfig['transform'],
      coordinateRotation: Number(map.coordinateRotation ?? 0),
      bounds: map.bounds as MapConfig['bounds'],
      svgBounds: (map.svgBounds as MapConfig['svgBounds']) ?? null,
      tilePath: typeof map.tilePath === 'string' ? map.tilePath : null,
      svgPath: typeof map.svgPath === 'string' ? map.svgPath : null,
      svgLayer: typeof map.svgLayer === 'string' ? map.svgLayer : null,
      otherLayers: (Array.isArray(map.layers) ? (map.layers as Raw[]) : [])
        .map((l) => l.svgLayer)
        .filter((l): l is string => typeof l === 'string'),
      labels: labels(map.labels),
      author: String(map.author ?? 'tarkov.dev'),
      authorLink: String(map.authorLink ?? 'https://tarkov.dev')
    })
  }
  if (configs.length < 8) throw new Error(`only ${configs.length} interactive maps found`)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: 'tarkov.dev (github.com/the-hideout/tarkov-dev, src/data/maps.json)',
        license: 'MIT',
        images: 'assets.tarkov.dev, CC BY-NC-SA 4.0',
        generatedAt: new Date().toISOString().slice(0, 10),
        maps: configs
      },
      null,
      1
    ) + '\n'
  )
  console.log(`Wrote ${configs.length} map configs to ${OUT}: ${configs.map((c) => c.key).join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
