// Temporary: what json.tarkov.dev's crafts look like (removed after use).

const BASE = 'https://json.tarkov.dev'

type Raw = Record<string, unknown>

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'cache-control': 'no-cache' } })
  console.log(`GET ${path}: ${res.status} ${res.headers.get('content-length') ?? '?'} bytes`)
  if (!res.ok) return null
  const body = (await res.json()) as Raw
  // Some files wrap the data: { data: ... }
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

const list = (v: unknown): Raw[] =>
  Array.isArray(v) ? (v as Raw[]) : v && typeof v === 'object' ? (Object.values(v) as Raw[]) : []

const idOf = (v: unknown): string | null =>
  typeof v === 'string'
    ? v
    : v && typeof v === 'object' && typeof (v as Raw).id === 'string'
      ? ((v as Raw).id as string)
      : null

async function main(): Promise<void> {
  const raw = await get('regular/crafts')
  console.log(
    'top-level type:',
    Array.isArray(raw) ? 'array' : typeof raw,
    raw && typeof raw === 'object' ? Object.keys(raw as Raw).slice(0, 5) : ''
  )
  const crafts = list(raw)
  console.log('crafts:', crafts.length)
  console.log('first craft keys:', Object.keys(crafts[0] ?? {}))
  console.log('first two crafts:', JSON.stringify(crafts.slice(0, 2), null, 1).slice(0, 3000))
  const reqKeys = new Map<string, number>()
  const attrShapes = new Map<string, number>()
  const rewardKeys = new Map<string, number>()
  let withTask = 0
  const otherKeys = new Map<string, number>()
  for (const c of crafts) {
    for (const k of Object.keys(c)) otherKeys.set(k, (otherKeys.get(k) ?? 0) + 1)
    if (c.taskUnlock) withTask++
    for (const r of list(c.requiredItems)) {
      for (const k of Object.keys(r)) reqKeys.set(k, (reqKeys.get(k) ?? 0) + 1)
      const a = JSON.stringify(r.attributes ?? null)
      attrShapes.set(a, (attrShapes.get(a) ?? 0) + 1)
    }
    for (const r of list(c.rewardItems))
      for (const k of Object.keys(r)) rewardKeys.set(k, (rewardKeys.get(k) ?? 0) + 1)
  }
  console.log('craft keys (count):', [...otherKeys])
  console.log('requiredItems keys:', [...reqKeys])
  console.log('requiredItems attributes shapes:', [...attrShapes].sort((a, b) => b[1] - a[1]).slice(0, 15))
  console.log('rewardItems keys:', [...rewardKeys])
  console.log(
    'crafts with taskUnlock:',
    withTask,
    JSON.stringify(crafts.find((c) => c.taskUnlock)?.taskUnlock)
  )
  const multi = crafts.filter((c) => list(c.rewardItems).length > 1)
  console.log('crafts with several reward items:', multi.length)
  console.log(
    'reward counts > 1:',
    crafts.filter((c) => list(c.rewardItems).some((r) => Number(r.count ?? r.quantity) > 1)).length
  )
  for (const k of ['duration', 'level', 'station', 'requiredQuestItems', 'source']) {
    const vals = crafts.slice(0, 5).map((c) => JSON.stringify(c[k]))
    console.log(`sample ${k}:`, vals.join(' | '))
  }

  // Which items the hideout needs found in raid can be crafted.
  const hideout = list(await get('regular/hideout'))
  const hideoutLang = ((await get('regular/hideout_en')) ?? {}) as Record<string, string>
  const stationName = new Map(
    hideout.map((s) => [String(s.id), hideoutLang[String(s.name)] ?? String(s.normalizedName ?? s.name)])
  )
  const itemsLang = ((await get('regular/items_en')) ?? {}) as Record<string, string>
  const name = (id: string): string => itemsLang[`${id} Name`] ?? itemsLang[`${id} ShortName`] ?? id
  const firNeeded = new Set<string>()
  for (const s of hideout)
    for (const l of list(s.levels))
      for (const r of list(l.itemRequirements)) {
        const attrs = r.attributes as Raw | undefined
        if (attrs && (attrs.foundInRaid === true || JSON.stringify(attrs).includes('foundInRaid')))
          firNeeded.add(idOf(r.item) ?? '')
      }
  console.log('hideout FIR item kinds:', firNeeded.size)
  const crafted = new Map<string, Raw[]>()
  for (const c of crafts)
    for (const r of [c.productItem as Raw]) {
      const id = idOf(r?.item)
      if (id) crafted.set(id, [...(crafted.get(id) ?? []), c])
    }
  const firCraftable = [...firNeeded].filter((id) => crafted.has(id))
  console.log('of those, craftable:', firCraftable.length)
  for (const id of firCraftable.slice(0, 30)) {
    const c = crafted.get(id)![0]
    console.log(
      `  ${name(id)}: ${stationName.get(idOf(c.station) ?? '') ?? c.station} ${c.level}, ${c.duration}s, needs`,
      list(c.requiredItems)
        .map(
          (r) =>
            `${r.count ?? r.quantity}× ${name(idOf(r.item) ?? '')}${r.attributes ? ' ' + JSON.stringify(r.attributes) : ''}`
        )
        .join(', '),
      '→',
      list(c.rewardItems)
        .map((r) => `${r.count ?? r.quantity}× ${name(idOf(r.item) ?? '')}`)
        .join(', ')
    )
  }
  // A craft with a tool.
  const tooled = crafts.find((c) =>
    list(c.requiredItems).some((r) => JSON.stringify(r).toLowerCase().includes('tool'))
  )
  console.log('a craft mentioning tool:', JSON.stringify(tooled)?.slice(0, 1500))

  const tasks = list(await get('regular/tasks'))
  const questFir = new Set<string>()
  for (const t of tasks)
    for (const o of list(t.objectives))
      if ((o.type === 'giveItem' || o.type === 'plantItem') && o.foundInRaid)
        for (const i of list(o.items)) questFir.add(idOf(i) ?? '')
  const questCraftable = [...questFir].filter((id) => crafted.has(id))
  console.log(
    'quest FIR hand-over kinds:',
    questFir.size,
    'craftable:',
    questCraftable.length,
    questCraftable.slice(0, 30).map(name).join('; ')
  )
  console.log(
    'gameEditions non-empty:',
    crafts
      .filter((c) => list(c.gameEditions).length)
      .map((c) => JSON.stringify(c.gameEditions))
      .slice(0, 5)
  )
  console.log(
    'functional sample:',
    JSON.stringify(crafts.find((c) => JSON.stringify(c).includes('functional'))).slice(0, 800)
  )
  console.log('items crafted by several crafts:', [...crafted].filter(([, cs]) => cs.length > 1).length)
  const pve = list(await get('pve/crafts'))
  console.log('pve crafts:', pve.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
