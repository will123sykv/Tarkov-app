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
  const markers = map.markers as Record<string, Raw[]>
  for (const [group, list] of Object.entries(markers ?? {})) {
    console.log(`MARKERS ${group} (${list.length})`)
    for (const m of list) {
      const { description, image, ...rest } = m as Raw
      void description
      void image
      console.log('  M', group, JSON.stringify(rest).slice(0, 300))
    }
  }
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
  await tarkovDev().catch((e) => console.log('tarkov.dev failed', e))
}

void main()
