// Temporary: the wiki's interactive Lab map's markers (image pixels) and tarkov.dev's Lab positions
// (game coordinates), to calibrate the wiki's image (removed after use).
import { fetchQuestData } from '../src/main/quests/questData'

const WIKI = 'https://escapefromtarkov.fandom.com/api.php'
const UA = { 'user-agent': 'TarkovLootOptimiser-probe/1.0 (github.com/will123sykv/tarkov-app)' }
type Raw = Record<string, unknown>
const r1 = (n: number): number => Math.round(n * 10) / 10

async function wiki(): Promise<void> {
  const url = `${WIKI}?${new URLSearchParams({ format: 'json', formatversion: '2', action: 'parse', page: 'Map:The_Lab', prop: 'wikitext' })}`
  const res = await fetch(url, { headers: UA })
  const text = String(((await res.json()) as { parse: { wikitext: string } }).parse.wikitext)
  const map = JSON.parse(text) as Raw
  console.log('top-level keys:', Object.keys(map))
  for (const k of Object.keys(map))
    if (!['categories', 'markers', 'description'].includes(k))
      console.log(`  ${k}:`, JSON.stringify(map[k]).slice(0, 600))
  const markers = map.markers as unknown
  const dump = (v: unknown, depth = 0): void => {
    if (Array.isArray(v)) {
      console.log(`${'  '.repeat(depth)}[array ${v.length}]`)
      for (const x of v) dump(x, depth + 1)
      return
    }
    if (v && typeof v === 'object') {
      const o = v as Raw
      const flat: Raw = {}
      const nested: [string, unknown][] = []
      for (const [k, x] of Object.entries(o)) {
        if (k === 'description' || k === 'image') continue
        if (x && typeof x === 'object' && !(Array.isArray(x) && x.every((n) => typeof n === 'number')))
          nested.push([k, x])
        else flat[k] = x
      }
      console.log(`${'  '.repeat(depth)}M ${JSON.stringify(flat).slice(0, 260)}`)
      for (const [k, x] of nested) {
        console.log(`${'  '.repeat(depth + 1)}.${k}:`)
        dump(x, depth + 2)
      }
      return
    }
    console.log(`${'  '.repeat(depth)}${JSON.stringify(v)}`)
  }
  dump(markers)
}

async function tarkovDev(): Promise<void> {
  const data = await fetchQuestData(fetch as never, 'pvp', Date.now())
  for (const map of data.maps.filter(
    (m) => /lab/.test(m.normalizedName) && !/labyrinth/.test(m.normalizedName)
  )) {
    console.log('MAP', map.normalizedName, map.id)
    for (const e of map.extracts)
      console.log(
        '  E',
        e.faction,
        JSON.stringify(e.name),
        r1(e.position.x),
        r1(e.position.y),
        r1(e.position.z)
      )
    for (const t of map.transits)
      console.log('  T', JSON.stringify(t.name), r1(t.position.x), r1(t.position.y), r1(t.position.z))
    for (const s of map.spawns)
      console.log('  S', s.sides.join('/'), r1(s.position.x), r1(s.position.y), r1(s.position.z))
    for (const l of map.locks ?? [])
      console.log('  L', l.kind, l.keyId, r1(l.position.x), r1(l.position.y), r1(l.position.z))
    for (const b of map.bossSpawns ?? [])
      console.log('  B', JSON.stringify(b.zone), r1(b.position.x), r1(b.position.y), r1(b.position.z))
    for (const k of map.keySpawns ?? [])
      console.log('  K', k.keyIds.join(','), r1(k.position.x), r1(k.position.y), r1(k.position.z))
  }
}

async function main(): Promise<void> {
  await wiki().catch((e) => console.log('wiki failed', e))
}

void main()
