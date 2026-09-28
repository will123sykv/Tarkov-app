/**
 * Downloads a picture of each container in src/main/data/containerLoot.json from the
 * Official Escape from Tarkov Wiki (the lead image of its wiki page) into
 * src/renderer/src/assets/containers, with credits.json for attribution (CC BY-SA 3.0).
 *
 *   npm run data:container-images
 *
 * The .github/workflows/container-images.yml workflow runs this and commits the result.
 * Page titles that differ from the container name go in scripts/container-image-titles.json.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  candidateTitles,
  extensionFor,
  parsePageImages,
  wikiPageUrl,
  type ContainerRef,
  type PageImagesResponse,
  type TitleOverrides
} from './containerImages'

// npm scripts run from the repo root.
const OUTPUT_DIR = resolve('src/renderer/src/assets/containers')
const API = 'https://escapefromtarkov.fandom.com/api.php'
const USER_AGENT = 'TarkovLootOptimiser/1.x (https://github.com/will123sykv/Tarkov-app; container images)'
const THUMB_WIDTH = 480

async function main(): Promise<void> {
  const data = JSON.parse(readFileSync('src/main/data/containerLoot.json', 'utf8')) as {
    containers: ContainerRef[]
  }
  const overrides = JSON.parse(readFileSync('scripts/container-image-titles.json', 'utf8')) as TitleOverrides
  const candidates = candidateTitles(data.containers, overrides)
  const titles = [...new Set([...candidates.values()].flat())]
  if (titles.length > 50) throw new Error(`too many titles for one API call (${titles.length})`)

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: String(THUMB_WIDTH),
    titles: titles.join('|')
  })
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`wiki API: HTTP ${res.status}`)
  const images = parsePageImages((await res.json()) as PageImagesResponse, candidates)

  mkdirSync(OUTPUT_DIR, { recursive: true })
  for (const file of readdirSync(OUTPUT_DIR)) rmSync(join(OUTPUT_DIR, file))

  const credits = []
  for (const container of data.containers) {
    const image = images.get(container.id)
    if (!image) {
      console.warn(`  no image: ${container.name} (tried ${candidates.get(container.id)!.join(', ')})`)
      continue
    }
    const download = await fetch(image.source, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/png,image/jpeg,image/webp' }
    })
    const ext = extensionFor(download.headers.get('content-type'))
    if (!download.ok || !ext) {
      console.warn(`  failed: ${container.name} (${download.status} ${download.headers.get('content-type')})`)
      continue
    }
    const file = `${container.id}.${ext}`
    const bytes = Buffer.from(await download.arrayBuffer())
    writeFileSync(join(OUTPUT_DIR, file), bytes)
    credits.push({
      id: container.id,
      file,
      pageTitle: image.pageTitle,
      pageUrl: wikiPageUrl(image.pageTitle),
      wikiFile: image.file,
      license: 'CC BY-SA 3.0'
    })
    console.log(`  ${container.name}: ${image.pageTitle} → ${file} (${(bytes.length / 1024).toFixed(0)} KB)`)
  }

  writeFileSync(join(OUTPUT_DIR, 'credits.json'), JSON.stringify(credits, null, 2) + '\n')
  console.log(`${credits.length} of ${data.containers.length} containers have an image`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
