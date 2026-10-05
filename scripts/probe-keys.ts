// Temporary CI probe (removed after use): what tarkov.dev's data says about keys on the maps: the
// locks each key opens (doors, containers) and where keys spawn as loose loot.

export {}

const BASE = 'https://json.tarkov.dev'
type Raw = Record<string, unknown>

const values = (c: unknown): Raw[] =>
  Array.isArray(c) ? (c as Raw[]) : c && typeof c === 'object' ? (Object.values(c) as Raw[]) : []
const idOf = (v: unknown): string | null =>
  typeof v === 'string'
    ? v
    : v && typeof v === 'object' && typeof (v as Raw).id === 'string'
      ? ((v as Raw).id as string)
      : null
const short = (v: unknown, n = 500): string => JSON.stringify(v)?.slice(0, n) ?? 'undefined'

async function get(path: string): Promise<Raw> {
  const res = await fetch(`${BASE}/${path}`, { headers: { Accept: 'application/json' } })
  const body = (await res.json()) as Raw
  return ((body.data as Raw) ?? body) as Raw
}

async function json(): Promise<void> {
  const [maps, mapsLang, items, itemsLang] = await Promise.all([
    get('regular/maps'),
    get('regular/maps_en'),
    get('regular/items'),
    get('regular/items_en')
  ])
  const lang = itemsLang as Record<string, string>
  const name = (id: string): string => {
    const item = itemById.get(id)
    const key = typeof item?.name === 'string' ? item.name : null
    return (key && lang[key]) || key || id
  }
  const itemById = new Map(values(items.items).map((i) => [i.id as string, i]))
  const keys = new Set(
    values(items.items)
      .filter((i) => Array.isArray(i.types) && (i.types as string[]).includes('keys'))
      .map((i) => i.id as string)
  )
  console.log(
    `[items] ${itemById.size} items, ${keys.size} keys: ${[...keys].slice(0, 6).map(name).join(' | ')}`
  )
  const sampleKey = [...keys][0]
  console.log(`[items] a key's fields: ${short(Object.keys(itemById.get(sampleKey) ?? {}), 2000)}`)
  console.log(`[maps] top-level: ${short(Object.keys(maps))}`)
  const mlang = mapsLang as Record<string, string>
  const keySpawnTotal = new Map<string, number>()
  const keyLockTotal = new Map<string, number>()
  for (const m of values(maps.maps)) {
    const mapName = mlang[m.name as string] ?? m.name
    console.log(`\n[map ${m.normalizedName} / ${mapName}] fields: ${short(Object.keys(m), 2000)}`)
    for (const field of [
      'locks',
      'lootLoose',
      'lootContainers',
      'switches',
      'hazards',
      'btrStops',
      'artillery'
    ]) {
      const v = m[field]
      if (!Array.isArray(v)) continue
      console.log(`  ${field}: ${v.length} · first: ${short(v[0], 700)}`)
    }
    if (Array.isArray(m.locks)) {
      const withKey = (m.locks as Raw[]).filter((l) => idOf(l.key))
      const types = new Map<string, number>()
      for (const l of m.locks as Raw[])
        types.set(String(l.lockType), (types.get(String(l.lockType)) ?? 0) + 1)
      console.log(`  locks with a key: ${withKey.length} · lock types ${short([...types])}`)
      for (const l of withKey.slice(0, 4))
        console.log(
          `    ${name(idOf(l.key)!)} [${l.lockType}] power=${l.needsPower} @ ${short(l.position, 120)} top=${l.top} bottom=${l.bottom}`
        )
      for (const l of withKey) keyLockTotal.set(idOf(l.key)!, (keyLockTotal.get(idOf(l.key)!) ?? 0) + 1)
    }
    if (Array.isArray(m.lootLoose)) {
      const spots = m.lootLoose as Raw[]
      const keySpots = spots.filter((s) => values(s.items).some((i) => keys.has(idOf(i) ?? '')))
      console.log(`  loose loot spots: ${spots.length}, with a key: ${keySpots.length}`)
      for (const s of keySpots.slice(0, 4)) {
        const ks = values(s.items)
          .map(idOf)
          .filter((i): i is string => !!i && keys.has(i))
        console.log(
          `    ${ks.map(name).join(', ')} (${values(s.items).length} items) @ ${short(s.position, 120)} ${short(Object.keys(s))}`
        )
      }
      for (const s of keySpots)
        for (const i of values(s.items).map(idOf))
          if (i && keys.has(i)) keySpawnTotal.set(i, (keySpawnTotal.get(i) ?? 0) + 1)
    }
    if (Array.isArray(m.lootContainers)) {
      const c = (m.lootContainers as Raw[])[0]
      console.log(`  a loot container: ${short(c, 300)}`)
    }
  }
  console.log(
    `\n[keys] with a lock on a map: ${keyLockTotal.size} of ${keys.size}; with loose spawns: ${keySpawnTotal.size}`
  )
  for (const id of [
    '5780cf7f2459777de4559322',
    '5938144586f77473c2087145',
    '5d80c62a86f7744036212b3f',
    '5c94bbff86f7747ee735c08f'
  ])
    console.log(
      `  ${name(id)}: locks ${keyLockTotal.get(id) ?? 0}, loose spawns ${keySpawnTotal.get(id) ?? 0}`
    )
}

async function graphql(): Promise<void> {
  const query = `{ maps(lang: en) { normalizedName locks { lockType key { id name } needsPower position { x y z } top bottom } lootLoose { items { id } position { x y z } } } }`
  const res = await fetch('https://api.tarkov.dev/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query })
  })
  const body = (await res.json()) as { data?: { maps?: Raw[] }; errors?: unknown[] }
  console.log(`\n[graphql] HTTP ${res.status} errors: ${short(body.errors, 800)}`)
  for (const m of body.data?.maps ?? []) {
    const locks = (m.locks as Raw[] | null) ?? []
    const loose = (m.lootLoose as Raw[] | null) ?? []
    console.log(
      `[graphql ${m.normalizedName}] locks ${locks.length} (with key ${locks.filter((l) => l.key).length}) · lootLoose ${loose.length} · first lock ${short(
        locks.find((l) => l.key),
        300
      )}`
    )
  }
}

await json().catch((e) => console.log('[json] failed', e))
await graphql().catch((e) => console.log('[graphql] failed', e))
