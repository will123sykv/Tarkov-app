/**
 * Temporary probe for 1.6.0: how db4tarkov lays out its map tiles and places game positions on
 * them. Informational.
 *
 *   npx tsx scripts/probe-160.ts              facts
 *   npx tsx scripts/probe-160.ts --dump=slug  also prints that map's tiles as base64
 */
import { createHash } from 'node:crypto'
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, values } from '../src/main/pricing/tarkovDevJson'

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

async function dumpTiles(slug: string): Promise<void> {
  let top = -1
  for (let z = 0; z <= 8; z++) if ((await get(tileUrl(slug, z, 0, 0))).status === 200) top = z
  let total = 0
  for (let z = 1; z <= top; z++) {
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
  }
  console.log(`@@DONE ${slug} z1-${top} ${total} bytes`)
}

async function probeBossPoints(): Promise<void> {
  const [maps, mapsEn] = await Promise.all([
    fetchJsonData<Record<string, unknown>>(fetch, 'pvp', 'maps'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'maps_en')
  ])
  log(
    'mobs',
    ((maps.mobs ?? []) as Record<string, unknown>[])
      .slice(0, 60)
      .map((m) => `${String(m.id)}=${mapsEn[String(m.name)] ?? '?'}`)
  )
  for (const m of values(maps.maps as Record<string, unknown>[])) {
    const name = String(m.normalizedName)
    const spawns = ((m.spawns ?? []) as Record<string, unknown>[]).filter((s) =>
      ((s.categories ?? []) as string[]).includes('boss')
    )
    const kept: { zone: string; x: number; z: number; y: number }[] = []
    for (const s of spawns) {
      const p = s.position as { x: number; y: number; z: number }
      const zone = String(s.zoneName)
      if (/snipe/i.test(zone)) continue
      if (!kept.some((k) => k.zone === zone && Math.hypot(k.x - p.x, k.z - p.z) < 5))
        kept.push({ zone, ...p })
    }
    log('boss points', `${name}: ${spawns.length} boss spawns, ${kept.length} after merging within 5 m`)
    if (['customs', 'woods', 'shoreline', 'ground-zero', 'ground-zero-21', 'factory'].includes(name))
      for (const k of kept)
        log('boss point', `${name} ${k.zone} @ ${Math.round(k.x)},${Math.round(k.y)},${Math.round(k.z)}`)
  }
}

async function probeTileAccess(): Promise<void> {
  const url = tileUrl('customs', 1, 0, 0)
  for (const [label, headers] of [
    ['no user agent', {}],
    [
      'electron-like',
      {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TarkovLootOptimiser/1.6.0 Chrome/140.0 Electron/44.4.5 Safari/537.36'
      }
    ]
  ] as const) {
    const res = await fetch(url, { headers })
    log(
      'tile access',
      `${label}: HTTP ${res.status} ${res.headers.get('content-type')} cache ${res.headers.get('cache-control')} cors ${res.headers.get('access-control-allow-origin')}`
    )
  }
}

async function main(): Promise<void> {
  if (DUMP) return dumpTiles(DUMP)
  await section('boss points', probeBossPoints)
  await section('tile access', probeTileAccess)
}

void main()
