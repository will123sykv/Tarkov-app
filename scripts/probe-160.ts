/**
 * Temporary probe for 1.6.0: how db4tarkov lays out its map tiles and places game positions on
 * them. Informational.
 *
 *   npx tsx scripts/probe-160.ts              facts
 *   npx tsx scripts/probe-160.ts --dump=slug  also prints that map's tiles as base64
 */
import { createHash } from 'node:crypto'
import { errorMessage } from '../src/main/pricing/http'

const DUMP = /--dump=(\w+)/.exec(process.argv.join(' '))?.[1] ?? null
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
}
const SLUGS = ['customs', 'ground_zero', 'woods', 'shoreline', 'factory']
const tileUrl = (slug: string, z: number, x: number, y: number): string =>
  `https://cdn.db4tarkov.com/webp/map/${slug}/${slug}-${z}-${x}-${y}.webp`

const log = (section: string, ...parts: unknown[]): void =>
  console.log(`[${section}]`, ...parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))))

async function section(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (err) {
    log(name, `FAILED: ${errorMessage(err)}`)
  }
}

async function get(url: string): Promise<{ status: number; type: string; body: Buffer }> {
  const res = await fetch(url, { headers: UA })
  return {
    status: res.status,
    type: res.headers.get('content-type') ?? '',
    body: Buffer.from(await res.arrayBuffer())
  }
}

function webpSize(b: Buffer): string {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF') return `? ${b.subarray(0, 8).toString('hex')}`
  const kind = b.toString('ascii', 12, 16)
  if (kind === 'VP8X') return `${1 + b.readUIntLE(24, 3)}x${1 + b.readUIntLE(27, 3)}`
  if (kind === 'VP8 ') return `${b.readUInt16LE(26) & 0x3fff}x${b.readUInt16LE(28) & 0x3fff}`
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return `${(bits & 0x3fff) + 1}x${((bits >> 14) & 0x3fff) + 1}`
  }
  return '?'
}

function around(text: string, pattern: RegExp, max: number, before: number, after: number): string[] {
  const out: string[] = []
  for (const m of text.matchAll(pattern)) {
    const i = m.index ?? 0
    out.push(text.slice(Math.max(0, i - before), i + after).replace(/\s+/g, ' '))
    if (out.length >= max) break
  }
  return out
}

async function probeCode(): Promise<void> {
  const S = 'code'
  const js = (await get('https://db4tarkov.com/main.dart.js')).body.toString('utf8')
  log(S, `main.dart.js ${js.length} chars`)
  const patterns: [string, RegExp, number, number, number][] = [
    ['tile urls', /cdn\.db4tarkov\.com\/webp\/map/g, 6, 1500, 1500],
    ['lazy jl', /"jl",/g, 3, 200, 3000],
    ['lazy hI', /"hI",/g, 3, 200, 2500],
    ['fn qF', /[,{\s]qF\(a,b\)\{/g, 3, 50, 2500],
    ['fn a3q', /[,{\s]a3q\(a\)\{/g, 3, 50, 800],
    ['fn Ss', /[,{\s]Ss\(a\)\{/g, 3, 50, 1200],
    ['fn dC9', /[,{\s]dC9\(a,b,c,d,e,f,g\)\{/g, 3, 50, 1500],
    ['fn dyS', /[,{\s]dyS\(\)\{/g, 3, 50, 800],
    ['cCH', /A\.cCH\.prototype=/g, 2, 50, 800],
    ['cTD', /A\.cTD\.prototype=/g, 2, 50, 800],
    ['slug dims', /"ground_zero",A\.b\(\[\d/g, 6, 600, 900],
    ['customs dims', /"customs",A\.b\(\[\d/g, 6, 300, 600],
    ['CrsSimple', /CrsSimple|Transformation\(/g, 6, 400, 600],
    ['offsets', /"offset|mapOffset|"scale",|imageSize/g, 10, 300, 500]
  ]
  for (const [name, re, max, before, after] of patterns)
    for (const s of around(js, re, max, before, after)) log(S, name, s)
}

async function probeTiles(): Promise<void> {
  for (const slug of SLUGS) {
    const S = `tiles ${slug}`
    await section(S, async () => {
      let top = -1
      for (let z = 0; z <= 8; z++) {
        const res = await get(tileUrl(slug, z, 0, 0))
        log(S, `z${z} 0,0: HTTP ${res.status} ${res.type} ${res.body.length} bytes ${webpSize(res.body)}`)
        if (res.status === 200) top = z
      }
      if (top < 0) return
      for (const z of [top - 1, top]) {
        let cols = 0
        while (cols < 64 && (await get(tileUrl(slug, z, cols, 0))).status === 200) cols++
        let rows = 0
        while (rows < 64 && (await get(tileUrl(slug, z, 0, rows))).status === 200) rows++
        const last = await get(tileUrl(slug, z, cols - 1, rows - 1))
        log(S, `z${z}: ${cols} x ${rows} tiles; last tile ${webpSize(last.body)} ${last.body.length} bytes`)
      }
    })
  }
}

async function dumpTiles(slug: string): Promise<void> {
  let top = -1
  for (let z = 0; z <= 8; z++) if ((await get(tileUrl(slug, z, 0, 0))).status === 200) top = z
  const z = top - 1
  let total = 0
  for (let y = 0; y < 64; y++) {
    let any = false
    for (let x = 0; x < 64; x++) {
      const res = await get(tileUrl(slug, z, x, y))
      if (res.status !== 200) break
      any = true
      total += res.body.length
      const sha = createHash('sha256').update(res.body).digest('hex').slice(0, 16)
      console.log(`@@TILE ${slug} ${z} ${x} ${y} ${sha} ${res.body.toString('base64')}`)
    }
    if (!any) break
  }
  console.log(`@@DONE ${slug} z${z} ${total} bytes`)
}

async function main(): Promise<void> {
  if (DUMP) return dumpTiles(DUMP)
  await section('code', probeCode)
  await probeTiles()
}

void main()
