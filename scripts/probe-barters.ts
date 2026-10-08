// Temporary: what json.tarkov.dev's barters look like, and the wiki's 2D map of the Lab (removed after use).
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'https://json.tarkov.dev'
const WIKI = 'https://escapefromtarkov.fandom.com/api.php'
const UA = { 'user-agent': 'TarkovLootOptimiser-probe/1.0 (github.com/will123sykv/tarkov-app)' }

type Raw = Record<string, unknown>

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'cache-control': 'no-cache' } })
  console.log(`GET ${path}: ${res.status} ${res.headers.get('content-length') ?? '?'} bytes`)
  if (!res.ok) return null
  const body = (await res.json()) as Raw
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

const list = (v: unknown): Raw[] =>
  Array.isArray(v) ? (v as Raw[]) : v && typeof v === 'object' ? (Object.values(v) as Raw[]) : []

async function barters(): Promise<void> {
  const raw = await get('regular/barters')
  console.log(
    'top-level type:',
    Array.isArray(raw) ? 'array' : typeof raw,
    raw && typeof raw === 'object' ? Object.keys(raw as Raw).slice(0, 5) : ''
  )
  const all = list(raw)
  console.log('barters:', all.length)
  console.log('first barter keys:', Object.keys(all[0] ?? {}))
  console.log('first two barters:', JSON.stringify(all.slice(0, 2), null, 1).slice(0, 3000))
  const keys = new Map<string, number>()
  const req = new Map<string, number>()
  let withTask = 0
  for (const b of all) {
    for (const k of Object.keys(b)) keys.set(k, (keys.get(k) ?? 0) + 1)
    if (b.taskUnlock) withTask++
    for (const r of list(b.requiredItems)) for (const k of Object.keys(r)) req.set(k, (req.get(k) ?? 0) + 1)
  }
  console.log('barter keys:', [...keys])
  console.log('requiredItems keys:', [...req])
  console.log('with taskUnlock:', withTask, JSON.stringify(all.find((b) => b.taskUnlock)?.taskUnlock))
  console.log(
    'trader field samples:',
    JSON.stringify(all.slice(0, 3).map((b) => [b.trader, b.level, b.trader_id, b.traderId]))
  )
  for (const mode of ['pve/barters']) {
    const r = list(await get(mode))
    console.log(mode, r.length)
  }
}

async function wiki(): Promise<void> {
  const q = async (params: Record<string, string>): Promise<Raw> => {
    const url = `${WIKI}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
    const res = await fetch(url, { headers: UA })
    console.log(`wiki ${params.action} ${params.prop ?? ''}: ${res.status}`)
    return (await res.json()) as Raw
  }
  const parsed = (await q({ action: 'parse', page: 'Map:The_Lab', prop: 'images|wikitext' })).parse as Raw
  const images = (parsed?.images as string[]) ?? []
  console.log('images:', images)
  console.log('wikitext:', String(parsed?.wikitext ?? '').slice(0, 4000))
  const info = await q({
    action: 'query',
    titles: images.map((i) => `File:${i}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|user|timestamp|extmetadata'
  })
  const pages = ((info.query as Raw)?.pages as Raw[]) ?? []
  mkdirSync('probe-out', { recursive: true })
  for (const p of pages) {
    const ii = ((p.imageinfo as Raw[]) ?? [])[0]
    if (!ii) continue
    const meta = ii.extmetadata as Record<string, { value?: string }> | undefined
    console.log(
      JSON.stringify({
        title: p.title,
        url: ii.url,
        width: ii.width,
        height: ii.height,
        size: ii.size,
        user: ii.user,
        time: ii.timestamp,
        artist: meta?.Artist?.value?.slice(0, 200),
        license: meta?.LicenseShortName?.value,
        description: meta?.ImageDescription?.value?.slice(0, 300)
      })
    )
    if (Number(ii.width) >= 1000 && typeof ii.url === 'string') {
      const res = await fetch(ii.url, { headers: UA })
      const buf = Buffer.from(await res.arrayBuffer())
      const name = String(p.title)
        .replace(/^File:/, '')
        .replace(/[^\w.-]+/g, '_')
      writeFileSync(`probe-out/${name}`, buf)
      console.log('  saved', name, buf.length, res.headers.get('content-type'))
    }
  }
}

async function main(): Promise<void> {
  await barters().catch((e) => console.log('barters failed', e))
  await wiki().catch((e) => console.log('wiki failed', e))
}

void main()
