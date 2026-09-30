/**
 * Temporary probe for 1.6.0: where db4tarkov's map images are, and tarkov.dev's extract, boss and
 * sniper data for the maps being redone. Informational.
 *
 *   npx tsx scripts/probe-160.ts          facts
 *   npx tsx scripts/probe-160.ts --dump   also prints each map image as base64
 */
import { createHash } from 'node:crypto'
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, values } from '../src/main/pricing/tarkovDevJson'

type Raw = Record<string, unknown>
const DUMP = process.argv.includes('--dump')
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}
const SITE = 'https://db4tarkov.com'
const MAP_WORDS =
  /customs|bigmap|woods|shore|ground|sandbox|factory|interchange|reserve|lighthouse|streets|labs?\b|lab-|terminal|labyrinth|icebreaker|map/i

const log = (section: string, ...parts: unknown[]): void =>
  console.log(`[${section}]`, ...parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))))
const round = (n: unknown): number => Math.round(Number(n) * 100) / 100
const pos = (p: unknown): string => {
  const v = (p ?? {}) as Raw
  return `${round(v.x)},${round(v.y)},${round(v.z)}`
}

async function section(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (err) {
    log(name, `FAILED: ${errorMessage(err)}`)
  }
}

async function get(url: string): Promise<{ status: number; type: string; body: Buffer }> {
  const res = await fetch(url, { headers: UA, redirect: 'follow' })
  return {
    status: res.status,
    type: res.headers.get('content-type') ?? '',
    body: Buffer.from(await res.arrayBuffer())
  }
}

function dims(b: Buffer): string {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47)
    return `png ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i < b.length - 9) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const m = b[i + 1]
      const len = b.readUInt16BE(i + 2)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return `jpg ${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}`
      i += 2 + len
    }
    return 'jpg ?'
  }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8X') return `webp ${1 + b.readUIntLE(24, 3)}x${1 + b.readUIntLE(27, 3)}`
    if (kind === 'VP8 ') return `webp ${b.readUInt16LE(26) & 0x3fff}x${b.readUInt16LE(28) & 0x3fff}`
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21)
      return `webp ${(bits & 0x3fff) + 1}x${((bits >> 14) & 0x3fff) + 1}`
    }
    return 'webp ?'
  }
  if (b.toString('ascii', 4, 12).includes('ftypavif')) return 'avif'
  if (b.toString('utf8', 0, 200).includes('<svg')) return 'svg'
  return `? ${b.subarray(0, 12).toString('hex')}`
}

const abs = (u: string, base: string): string | null => {
  try {
    return new URL(u.replace(/\\\//g, '/'), base).href
  } catch {
    return null
  }
}

/** URLs of images and scripts mentioned in a page or script. */
function urlsIn(text: string, base: string): { images: string[]; scripts: string[]; data: string[] } {
  const found = new Set<string>()
  for (const m of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) found.add(m[1])
  for (const m of text.matchAll(
    /["'`(]((?:https?:)?\/?\/?[\w./%@~:+-]+\.(?:png|jpe?g|webp|avif|svg|js|json)(?:\?[^"'`)\s]*)?)["'`)]/gi
  ))
    found.add(m[1])
  const images: string[] = []
  const scripts: string[] = []
  const data: string[] = []
  for (const raw of found) {
    const u = abs(raw, base)
    if (!u) continue
    if (/\.(png|jpe?g|webp|avif|svg)(\?|$)/i.test(u)) images.push(u)
    else if (/\.js(\?|$)/i.test(u)) scripts.push(u)
    else if (/\.json(\?|$)/i.test(u)) data.push(u)
  }
  return { images, scripts, data }
}

function snippets(text: string, pattern: RegExp, max: number, width = 160): string[] {
  const out: string[] = []
  for (const m of text.matchAll(pattern)) {
    const i = m.index ?? 0
    out.push(text.slice(Math.max(0, i - width), i + width).replace(/\s+/g, ' '))
    if (out.length >= max) break
  }
  return out
}

async function probeDb4tarkov(): Promise<string[]> {
  const S = 'db4tarkov'
  const pages = ['/map', '/map/customs', '/map/woods', '/maps', '/']
  const images = new Set<string>()
  const scripts = new Set<string>()
  const data = new Set<string>()
  for (const path of pages) {
    await section(S, async () => {
      const page = await get(SITE + path)
      const html = page.body.toString('utf8')
      log(S, `${path}: HTTP ${page.status} ${page.type} ${html.length} chars`)
      if (path === '/map') {
        log(S, 'map page head', html.slice(0, 1500).replace(/\s+/g, ' '))
        log(S, 'map page tail', html.slice(-1500).replace(/\s+/g, ' '))
      }
      const found = urlsIn(html, SITE + path)
      found.images.forEach((u) => images.add(u))
      found.scripts.forEach((u) => scripts.add(u))
      found.data.forEach((u) => data.add(u))
      for (const s of snippets(html, /bounds|imageOverlay|tileLayer|L\.CRS|leaflet|openlayers|maplibre/gi, 8))
        log(S, `${path} snippet`, s)
    })
  }
  log(S, `scripts (${scripts.size})`, [...scripts])
  const sameSite = [...scripts].filter((u) => u.startsWith(SITE) || !/^https?:/.test(u)).slice(0, 60)
  for (const url of sameSite) {
    await section(S, async () => {
      const res = await get(url)
      const js = res.body.toString('utf8')
      const found = urlsIn(js, url)
      found.images.forEach((u) => images.add(u))
      found.data.forEach((u) => data.add(u))
      const hits = snippets(js, /customs|shoreline|ground.?zero|sandbox|woods/gi, 1)
      if (!hits.length && !found.images.length) return
      log(S, `script ${url} (${js.length} chars): ${found.images.length} images`)
      for (const s of snippets(
        js,
        /imageOverlay|tileLayer|CRS\.Simple|bounds\s*:|transform\s*:|coordinateRotation|\{z\}/g,
        12,
        220
      ))
        log(S, `  ${url.split('/').pop()} config`, s)
      for (const s of snippets(js, /customs|shoreline|ground.?zero|sandbox/gi, 6, 200))
        log(S, `  ${url.split('/').pop()} map`, s)
    })
  }
  log(S, `data urls (${data.size})`, [...data].slice(0, 80))
  const mapImages = [...images].filter((u) => MAP_WORDS.test(u))
  log(S, `images (${images.size}); map-like (${mapImages.length})`, mapImages.slice(0, 200))
  log(S, 'other images', [...images].filter((u) => !MAP_WORDS.test(u)).slice(0, 80))

  for (const url of data) {
    if (!MAP_WORDS.test(url)) continue
    await section(S, async () => {
      const res = await get(url)
      log(
        S,
        `data ${url}: HTTP ${res.status} ${res.body.length} bytes`,
        res.body.toString('utf8').slice(0, 3000)
      )
    })
  }

  const kept: string[] = []
  for (const url of mapImages.slice(0, 120)) {
    await section(S, async () => {
      const res = await get(url)
      const sha = createHash('sha256').update(res.body).digest('hex').slice(0, 16)
      log(
        S,
        `image ${url}: HTTP ${res.status} ${res.type} ${res.body.length} bytes ${dims(res.body)} sha ${sha}`
      )
      if (res.status === 200 && res.body.length > 200_000) kept.push(url)
    })
  }
  return kept
}

async function dumpImages(urls: string[]): Promise<void> {
  for (const url of urls) {
    await section('dump', async () => {
      const res = await get(url)
      if (res.status !== 200 || res.body.length > 25_000_000) return
      const sha = createHash('sha256').update(res.body).digest('hex')
      const b64 = res.body.toString('base64')
      console.log(`@@BEGIN ${url} ${res.body.length} ${sha}`)
      for (let i = 0; i < b64.length; i += 60_000) console.log(`@@ ${b64.slice(i, i + 60_000)}`)
      console.log(`@@END ${url}`)
    })
  }
}

const WANTED = ['customs', 'woods', 'shoreline', 'ground-zero', 'ground-zero-21', 'factory']

async function probeTarkovDev(): Promise<void> {
  const [maps, mapsEn] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'maps'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'maps_en')
  ])
  const tr = (k: unknown): string => (typeof k === 'string' ? (mapsEn[k] ?? k) : JSON.stringify(k))
  log('maps', 'top-level keys', Object.keys(maps))
  for (const [key, value] of Object.entries(maps)) {
    if (key === 'maps') continue
    const list = values(value as Raw[] | Record<string, Raw>)
    log('maps', `${key}: ${list.length}`, list.slice(0, 3))
  }
  for (const m of values(maps.maps as Raw[] | Record<string, Raw>)) {
    const name = String(m.normalizedName)
    if (!WANTED.includes(name)) continue
    const S = `map ${name}`
    const extracts = (m.extracts ?? []) as Raw[]
    if (extracts[0]) log(S, 'extract keys', Object.keys(extracts[0]), extracts[0])
    for (const e of extracts) {
      const extra = Object.fromEntries(
        Object.entries(e).filter(
          ([k]) => !['id', 'name', 'faction', 'position', 'outline', 'top', 'bottom'].includes(k)
        )
      )
      log(S, `extract ${tr(e.name)} [${String(e.faction)}] @ ${pos(e.position)}`, extra)
    }
    for (const t of (m.transits ?? []) as Raw[])
      log(S, `transit ${tr(t.description)} / ${tr(t.name)} @ ${pos(t.position)}`, Object.keys(t))
    const bosses = (m.bosses ?? []) as Raw[]
    if (bosses[0]) log(S, 'boss keys', Object.keys(bosses[0]))
    for (const b of bosses) {
      const locs = ((b.spawnLocations ?? []) as Raw[]).map(
        (l) => `${String(l.spawnKey)}=${tr(l.name)}:${String(l.chance)}`
      )
      log(S, `boss ${tr(b.boss)} / ${tr(b.name)} chance ${String(b.spawnChance)}`, locs, {
        escorts: ((b.escorts ?? []) as Raw[]).map((e) => tr(e.boss)),
        other: Object.fromEntries(
          Object.entries(b).filter(
            ([k]) => !['spawnLocations', 'escorts', 'boss', 'name', 'spawnChance'].includes(k)
          )
        )
      })
    }
    const zones = new Map<string, { cats: Set<string>; sides: Set<string>; pts: Raw[] }>()
    for (const s of (m.spawns ?? []) as Raw[]) {
      const z = String(s.zoneName ?? '')
      const entry = zones.get(z) ?? { cats: new Set(), sides: new Set(), pts: [] }
      ;((s.categories ?? []) as string[]).forEach((c) => entry.cats.add(c))
      ;((s.sides ?? []) as string[]).forEach((c) => entry.sides.add(c))
      entry.pts.push((s.position ?? {}) as Raw)
      zones.set(z, entry)
    }
    for (const [z, e] of zones) {
      if (!e.cats.has('boss') && !/snipe/i.test(z)) continue
      const c = ['x', 'y', 'z'].map((k) => round(e.pts.reduce((a, p) => a + Number(p[k]), 0) / e.pts.length))
      log(
        S,
        `zone ${z} [${[...e.cats].join('+')} / ${[...e.sides].join('+')}] ${e.pts.length} pts @ ${c.join(',')}`
      )
    }
    for (const h of (m.hazards ?? []) as Raw[])
      log(S, `hazard ${String(h.hazardType)} ${tr(h.name)} @ ${pos(h.position)}`)
  }
}

async function main(): Promise<void> {
  let kept: string[] = []
  await section('db4tarkov', async () => {
    kept = await probeDb4tarkov()
  })
  if (DUMP) {
    await dumpImages(kept)
    return
  }
  await section('maps', probeTarkovDev)
}

void main()
