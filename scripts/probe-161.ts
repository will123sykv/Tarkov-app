/**
 * Temporary probe for 1.6.1: db4tarkov's tiles and tarkov.dev's map data for Reserve, Interchange,
 * Lighthouse and Streets. Informational.
 *
 *   npx tsx scripts/probe-161.ts              map data
 *   npx tsx scripts/probe-161.ts --dump=slug  that map's tiles as base64
 */
import { createHash } from 'node:crypto'
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, values } from '../src/main/pricing/tarkovDevJson'

type Raw = Record<string, unknown>
const DUMP = /--dump=(\w+)/.exec(process.argv.join(' '))?.[1] ?? null
const WANTED = ['reserve', 'interchange', 'lighthouse', 'streets-of-tarkov']
const tileUrl = (slug: string, z: number, x: number, y: number): string =>
  `https://cdn.db4tarkov.com/webp/map/${slug}/${slug}-${z}-${x}-${y}.webp`

const log = (section: string, ...parts: unknown[]): void =>
  console.log(`[${section}]`, ...parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))))
const round = (n: unknown): number => Math.round(Number(n) * 100) / 100
const pos = (p: unknown): string => {
  const v = (p ?? {}) as Raw
  return `${round(v.x)},${round(v.y)},${round(v.z)}`
}

async function dumpTiles(slug: string): Promise<void> {
  let top = -1
  for (let z = 0; z <= 8; z++) if ((await fetch(tileUrl(slug, z, 0, 0))).status === 200) top = z
  let total = 0
  for (let z = 1; z <= top; z++) {
    for (let y = 0; y < 64; y++) {
      let any = false
      for (let x = 0; x < 64; x++) {
        const res = await fetch(tileUrl(slug, z, x, y))
        if (res.status !== 200) break
        any = true
        const body = Buffer.from(await res.arrayBuffer())
        total += body.length
        const sha = createHash('sha256').update(body).digest('hex').slice(0, 16)
        console.log(`@@TILE ${slug} ${z} ${x} ${y} ${sha} ${body.toString('base64')}`)
      }
      if (!any) break
    }
  }
  console.log(`@@DONE ${slug} z1-${top} ${total} bytes`)
}

async function probeMaps(): Promise<void> {
  const [maps, mapsEn] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'maps'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'maps_en')
  ])
  const tr = (k: unknown): string => (typeof k === 'string' ? (mapsEn[k] ?? k) : JSON.stringify(k))
  for (const m of values(maps.maps as Raw[] | Record<string, Raw>)) {
    const name = String(m.normalizedName)
    if (!WANTED.includes(name)) continue
    const S = `map ${name}`
    for (const e of (m.extracts ?? []) as Raw[]) {
      const extra = Object.fromEntries(Object.entries(e).filter(([k]) => ['transferItem'].includes(k)))
      log(S, `extract ${tr(e.name)} [${String(e.faction)}] @ ${pos(e.position)}`, extra)
    }
    for (const t of (m.transits ?? []) as Raw[])
      log(S, `transit ${tr(t.description)} / x @ ${pos(t.position)}`)
    for (const b of (m.bosses ?? []) as Raw[]) {
      const locs = ((b.spawnLocations ?? []) as Raw[]).map(
        (l) => `${String(l.spawnKey)}=${tr(l.name)}:${String(l.chance)}`
      )
      log(S, `boss x / x chance ${String(b.spawnChance)}`, locs, { other: { mob: b.mob } })
    }
    for (const s of (m.spawns ?? []) as Raw[]) {
      const cats = (s.categories ?? []) as string[]
      const zone = String(s.zoneName ?? '')
      if (/snipe/i.test(zone)) log(S, `sniper ${zone} @ ${pos(s.position)}`)
      else if (cats.includes('boss')) log('boss point', `${name} ${zone} @ ${pos(s.position)}`)
    }
    for (const l of (m.locks ?? []) as Raw[]) log(S, `lock ${String(l.lockType)} @ ${pos(l.position)}`)
  }
}

async function main(): Promise<void> {
  try {
    if (DUMP) await dumpTiles(DUMP)
    else await probeMaps()
  } catch (err) {
    log('probe', `FAILED: ${errorMessage(err)}`)
  }
}

void main()
