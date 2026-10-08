// Temporary: the wiki's interactive Lab map's markers (image pixels) and tarkov.dev's Lab positions
// (game coordinates), to calibrate the wiki's image (removed after use).

const WIKI = 'https://escapefromtarkov.fandom.com/api.php'
const UA = { 'user-agent': 'TarkovLootOptimiser-probe/1.0 (github.com/will123sykv/tarkov-app)' }
type Raw = Record<string, unknown>

async function wiki(): Promise<void> {
  const url = `${WIKI}?${new URLSearchParams({ format: 'json', formatversion: '2', action: 'parse', page: 'Map:The_Lab', prop: 'wikitext' })}`
  const res = await fetch(url, { headers: UA })
  const text = String(((await res.json()) as { parse: { wikitext: string } }).parse.wikitext)
  const map = JSON.parse(text) as Raw
  console.log('top-level keys:', Object.keys(map))
  for (const k of Object.keys(map))
    if (!['categories', 'markers', 'description'].includes(k))
      console.log(`  ${k}:`, JSON.stringify(map[k]).slice(0, 600))
  const markers = (map.markers as Raw[]) ?? []
  const wanted = /exfil|spawn|locked|lever|loot_key|boss|scav/
  const counts = new Map<string, number>()
  for (const m of markers) {
    const cat = String(m.categoryId)
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
    if (!wanted.test(cat)) continue
    const pos = m.position as number[]
    const title = (m.popup as Raw | undefined)?.title
    console.log(`W ${cat} ${pos.map((n) => Math.round(n * 10) / 10).join(' ')} ${JSON.stringify(title)}`)
  }
  console.log('counts', JSON.stringify([...counts]))
}

async function main(): Promise<void> {
  await wiki().catch((e) => console.log('wiki failed', e))
}

void main()
