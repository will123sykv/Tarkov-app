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

async function main(): Promise<void> {
  await wiki().catch((e) => console.log('wiki failed', e))
}

void main()
