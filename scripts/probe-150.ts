/**
 * Temporary probe for 1.5.0: facts about quests, maps and flea swings from live data. Informational.
 */
import { analyzeHistory, todaySwing, type HistoryPoint } from '../src/shared/fleaTrends'
import type { DataMode } from '../src/shared/types'
import { fleaAccess } from '../src/shared/valuation'
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, fetchTarkovDevJson, values } from '../src/main/pricing/tarkovDevJson'

type Raw = Record<string, unknown>
const UA = { 'User-Agent': 'TarkovLootOptimiser-probe/1.0 (github.com/will123sykv/Tarkov-app)' }

const log = (section: string, ...parts: unknown[]): void =>
  console.log(`[${section}]`, ...parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))))
const round = (n: unknown): number => Math.round(Number(n) * 100) / 100
const pos = (p: unknown): string => {
  const v = (p ?? {}) as Raw
  return `${round(v.x)},${round(v.y)},${round(v.z)}`
}

async function section(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (err) {
    log(name, `FAILED: ${errorMessage(err)}`)
  }
}

function count<T>(list: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of list) out[key(t)] = (out[key(t)] ?? 0) + 1
  return out
}

interface TaskInfo {
  id: string
  name: string
  minPlayerLevel: number | null
  trader: string
  wikiLink: string | null
  inherited: number
  gate: string
  own: 'own' | 'inherited' | 'none'
}

async function probeQuests(dataMode: DataMode): Promise<TaskInfo[]> {
  const S = `quests ${dataMode}`
  const [tasksData, tasksEn, traders, tradersEn] = await Promise.all([
    fetchJsonData<Raw>(fetch, dataMode, 'tasks'),
    fetchJsonData<Record<string, string>>(fetch, dataMode, 'tasks_en'),
    fetchJsonData<Raw>(fetch, dataMode, 'traders'),
    fetchJsonData<Record<string, string>>(fetch, dataMode, 'traders_en')
  ])
  log(S, 'tasks data keys', Object.keys(tasksData))
  const tasks = values(tasksData.tasks as Raw[] | Record<string, Raw>)
  const byId = new Map(tasks.map((t) => [String(t.id), t]))
  const tr = (k: unknown): string => (typeof k === 'string' ? (tasksEn[k] ?? k) : String(k))
  log(S, `${tasks.length} tasks`)

  const traderList = values((traders.traders ?? traders) as Raw[] | Record<string, Raw>)
  log(S, `traders: ${traderList.length}; first trader keys`, Object.keys(traderList[0] ?? {}))
  const firstLevels = (traderList[0]?.levels ?? null) as unknown
  log(S, 'first trader levels', firstLevels)
  const traderName = new Map(
    traderList.map((t) => [String(t.id), tradersEn[String(t.name)] ?? String(t.normalizedName ?? t.id)])
  )
  const llMin = new Map<string, number>()
  for (const t of traderList) {
    for (const l of (t.levels ?? []) as Raw[]) {
      const lvl = Number(l.level)
      const req = Number(l.requiredPlayerLevel ?? l.minLevel ?? l.playerLevel)
      llMin.set(`${String(t.id)}:${lvl}`, Number.isFinite(req) ? req : 0)
    }
  }
  log(
    S,
    'LL min levels',
    traderList.map(
      (t) =>
        `${traderName.get(String(t.id))}: ${((t.levels ?? []) as Raw[]).map((l) => `${String(l.level)}@${String(l.requiredPlayerLevel)}`).join(' ')}`
    )
  )

  // Names in the locale for quests tarkov.dev leaves out.
  const extra = Object.entries(tasksEn)
    .map(([k, v]) => [/^([0-9a-f]{24}) name$/i.exec(k)?.[1], v] as const)
    .filter(([id, v]) => id && !byId.has(id) && v)
  log(
    S,
    `${extra.length} quest names in tasks_en with no task:`,
    extra.slice(0, 120).map(([, v]) => v)
  )

  const trReqs = tasks.flatMap((t) => (t.traderRequirements ?? []) as Raw[])
  log(
    S,
    `${tasks.filter((t) => ((t.traderRequirements ?? []) as unknown[]).length).length} tasks with traderRequirements; kinds`,
    count(trReqs, (r) => `${String(r.requirementType)} ${String(r.compareMethod)} ${String(r.value)}`)
  )
  log(S, 'sample traderRequirements', trReqs.slice(0, 3))
  const other = tasks.flatMap((t) => (t.otherRequirements ?? []) as Raw[])
  log(
    S,
    'otherRequirements types',
    count(other, (r) => String(r.type)),
    'sample',
    other.slice(0, 3)
  )
  log(
    S,
    'minPlayerLevel',
    count(tasks, (t) => (t.minPlayerLevel == null ? 'null' : Number(t.minPlayerLevel) <= 1 ? '<=1' : '>1'))
  )
  log(
    S,
    'tasks per trader',
    count(tasks, (t) => traderName.get(String(t.trader)) ?? String(t.trader))
  )
  const taskKeys = new Set(tasks.flatMap((t) => Object.keys(t)))
  log(S, 'all task keys', [...taskKeys])

  // Own vs inherited level (tarkov.dev's minPlayerLevel is a maximum over requirements).
  const infos: TaskInfo[] = []
  for (const t of tasks) {
    let inherited = 0
    let gate = ''
    const bump = (lvl: number, why: string): void => {
      if (lvl > inherited) {
        inherited = lvl
        gate = why
      }
    }
    for (const r of (t.traderRequirements ?? []) as Raw[]) {
      if (r.requirementType !== 'level') continue
      const trader = String(r.trader ?? r.trader_id)
      bump(
        llMin.get(`${trader}:${Number(r.value ?? r.level)}`) ?? 0,
        `${traderName.get(trader)} LL${String(r.value)}`
      )
    }
    for (const r of (t.taskRequirements ?? []) as Raw[]) {
      const pre = byId.get(String(r.task))
      if (!pre) continue
      bump(Number(pre.minPlayerLevel ?? 0), `after ${tr(pre.name)}`)
      for (const o of (pre.objectives ?? []) as Raw[]) {
        if (o.type !== 'traderLevel') continue
        bump(llMin.get(`${String(o.trader)}:${Number(o.level)}`) ?? 0, `after ${tr(pre.name)} (LL objective)`)
      }
    }
    const min = t.minPlayerLevel == null ? null : Number(t.minPlayerLevel)
    infos.push({
      id: String(t.id),
      name: tr(t.name),
      minPlayerLevel: min,
      trader: traderName.get(String(t.trader)) ?? String(t.trader),
      wikiLink: typeof t.wikiLink === 'string' ? t.wikiLink : null,
      inherited,
      gate,
      own: min !== null && min > inherited ? 'own' : inherited > 0 ? 'inherited' : 'none'
    })
  }
  log(
    S,
    'own/inherited',
    count(infos, (i) => i.own)
  )
  log(
    S,
    'min < inherited (unexpected)',
    infos
      .filter((i) => i.minPlayerLevel !== null && i.minPlayerLevel < i.inherited)
      .slice(0, 20)
      .map((i) => `${i.name}: ${i.minPlayerLevel} < ${i.inherited} (${i.gate})`)
  )
  log(
    S,
    'inherited examples',
    infos
      .filter((i) => i.own === 'inherited')
      .slice(0, 30)
      .map((i) => `${i.name} [${i.trader}]: ${i.minPlayerLevel} via ${i.gate}`)
  )
  log(
    S,
    'level<=1 with requirements',
    tasks
      .filter(
        (t) =>
          Number(t.minPlayerLevel ?? 0) <= 1 &&
          (((t.taskRequirements ?? []) as unknown[]).length ||
            ((t.traderRequirements ?? []) as unknown[]).length)
      )
      .slice(0, 20)
      .map((t) => tr(t.name))
  )
  return infos
}

async function probeSeason(): Promise<void> {
  for (const mode of ['season', 'seasonal', 'pvpseason', 'regular_season']) {
    const res = await fetch(`https://json.tarkov.dev/${mode}/tasks`, { method: 'GET', headers: UA })
    log('season', `json.tarkov.dev/${mode}/tasks → HTTP ${res.status}`)
  }
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s*\(quest\)$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

async function wikiApi(params: Record<string, string>): Promise<Raw> {
  const url = `https://escapefromtarkov.fandom.com/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`wiki HTTP ${res.status}`)
  return (await res.json()) as Raw
}

async function probeWiki(infos: TaskInfo[]): Promise<void> {
  const titles: string[] = []
  let cont: string | undefined
  do {
    const body = await wikiApi({
      action: 'query',
      list: 'categorymembers',
      cmtitle: 'Category:Quests',
      cmlimit: '500',
      ...(cont ? { cmcontinue: cont } : {})
    })
    for (const m of ((body.query as Raw)?.categorymembers ?? []) as Raw[]) titles.push(String(m.title))
    cont = ((body.continue as Raw)?.cmcontinue as string | undefined) ?? undefined
  } while (cont)
  const ours = new Set(infos.map((i) => norm(i.name)))
  const wiki = new Set(titles.map(norm))
  log('wiki', `${titles.length} pages in Category:Quests`)
  log('wiki', 'in wiki, not tarkov.dev', titles.filter((t) => !ours.has(norm(t))).slice(0, 150))
  log(
    'wiki',
    'in tarkov.dev, not wiki',
    infos
      .filter((i) => !wiki.has(norm(i.name)))
      .map((i) => i.name)
      .slice(0, 80)
  )

  // Levels: sample quests with own and inherited levels and read the wiki's requirement lines.
  const sample = [
    ...infos.filter((i) => i.own === 'inherited').slice(0, 35),
    ...infos.filter((i) => i.own === 'own').slice(0, 15)
  ].filter((i) => i.wikiLink)
  const pageOf = (i: TaskInfo): string =>
    decodeURIComponent(i.wikiLink!.split('/wiki/')[1] ?? '').replace(/_/g, ' ')
  let printedRaw = 0
  for (let k = 0; k < sample.length; k += 40) {
    const batch = sample.slice(k, k + 40)
    const body = await wikiApi({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: '1',
      titles: batch.map(pageOf).join('|')
    })
    const pages = ((body.query as Raw)?.pages ?? []) as Raw[]
    const redirects = ((body.query as Raw)?.redirects ?? []) as Raw[]
    const resolve = (title: string): string => String(redirects.find((r) => r.from === title)?.to ?? title)
    for (const i of batch) {
      const page = pages.find((p) => p.title === resolve(pageOf(i)))
      const text = String(
        ((page?.revisions as Raw[] | undefined)?.[0]?.slots as Raw | undefined)?.main
          ? (((page!.revisions as Raw[])[0].slots as Raw).main as Raw).content
          : ''
      )
      const lines = text
        .split('\n')
        .filter((l) => /level|loyalty|\bLL\s?\d/i.test(l))
        .slice(0, 4)
      if (printedRaw < 3 && text) {
        printedRaw++
        const req = text.indexOf('Requirements')
        log(
          'wiki raw',
          i.name,
          text.slice(0, 600),
          '…',
          req >= 0 ? text.slice(req, req + 500) : '(no Requirements heading)'
        )
      }
      log(
        'wiki level',
        `${i.name} [${i.trader}] tarkov.dev ${i.minPlayerLevel} (${i.own}${i.gate ? `, ${i.gate}` : ''}) → ${lines.map((l) => l.trim().slice(0, 120)).join(' | ') || '(no level lines)'}`
      )
    }
  }
}

async function probeDb4tarkov(): Promise<void> {
  for (const url of ['https://db4tarkov.com/quest', 'https://db4tarkov.com/']) {
    const res = await fetch(url, { headers: UA })
    const html = await res.text()
    log('db4tarkov', `${url} → HTTP ${res.status}, ${html.length} bytes`)
    log(
      'db4tarkov',
      'scripts',
      [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).slice(0, 20)
    )
    log(
      'db4tarkov',
      'urls',
      [...new Set([...html.matchAll(/https?:\/\/[^"'\s)<>]+/g)].map((m) => m[0]))]
        .filter((u) => /api|json|data|quest/i.test(u))
        .slice(0, 30)
    )
    log('db4tarkov', 'head', html.slice(0, 800).replace(/\s+/g, ' '))
  }
}

async function probeMaps(): Promise<void> {
  const [maps, mapsEn, itemsEn] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'maps'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'maps_en'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'items_en')
  ])
  const tr = (k: unknown): string => (typeof k === 'string' ? (mapsEn[k] ?? k) : String(k))
  const item = (id: unknown): string =>
    itemsEn[`${String(id)} ShortName`] ?? itemsEn[`${String(id)} Name`] ?? String(id)
  for (const m of values(maps.maps as Raw[] | Record<string, Raw>)) {
    if (!['factory', 'icebreaker', 'the-labyrinth', 'terminal'].includes(String(m.normalizedName))) continue
    const S = `map ${String(m.normalizedName)}`
    log(S, 'keys', Object.keys(m))
    for (const kind of ['locks', 'switches', 'hazards', 'stationaryWeapons', 'btrStops'])
      log(S, `first ${kind}`, ((m[kind] ?? []) as Raw[])[0] ?? null)
    for (const e of (m.extracts ?? []) as Raw[])
      log(S, `extract ${tr(e.name)} [${String(e.faction)}] @ ${pos(e.position)}`)
    for (const t of (m.transits ?? []) as Raw[]) log(S, `transit ${tr(t.description)} @ ${pos(t.position)}`)
    for (const l of (m.locks ?? []) as Raw[])
      log(S, `lock ${String(l.lockType)} key=${item(l.key)} @ ${pos(l.position)}`)
    for (const s of (m.switches ?? []) as Raw[])
      log(S, `switch ${tr(s.name)} ${String(s.switchType)} @ ${pos(s.position)}`)
    for (const h of (m.hazards ?? []) as Raw[])
      log(S, `hazard ${String(h.hazardType)} ${tr(h.name)} @ ${pos(h.position)}`)
    const spawns = (m.spawns ?? []) as Raw[]
    log(
      S,
      'spawn categories',
      count(
        spawns,
        (s) => `${((s.categories ?? []) as string[]).join('+')} / ${((s.sides ?? []) as string[]).join('+')}`
      )
    )
    for (const s of spawns.filter((s) => ((s.categories ?? []) as string[]).includes('player')))
      log(
        S,
        `spawn ${((s.sides ?? []) as string[]).join('+')} ${String(s.zoneName ?? '')} @ ${pos(s.position)}`
      )
    for (const s of spawns.filter((s) => ((s.categories ?? []) as string[]).includes('boss')).slice(0, 12))
      log(S, `boss spawn ${String(s.zoneName ?? '')} @ ${pos(s.position)}`)
  }
  for (const url of [
    'https://tarkov.dev/maps/factory-2d.jpg',
    'https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/public/maps/factory-2d.jpg'
  ]) {
    const res = await fetch(url, { method: 'HEAD', headers: UA })
    log(
      're3mr',
      `${url} → HTTP ${res.status} ${res.headers.get('content-type')} ${res.headers.get('content-length')}`
    )
  }
}

async function graphqlHistory(id: string, dataMode: DataMode): Promise<HistoryPoint[] | null> {
  const query = `{ historicalItemPrices(id: "${id}", days: 7, gameMode: ${dataMode === 'pve' ? 'pve' : 'regular'}) { price priceMin offerCount timestamp } }`
  const res = await fetch('https://api.tarkov.dev/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...UA },
    body: JSON.stringify({ query })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { data?: { historicalItemPrices?: Raw[] }; errors?: unknown }
  if (!body.data?.historicalItemPrices)
    throw new Error(`no data: ${JSON.stringify(body.errors).slice(0, 300)}`)
  return body.data.historicalItemPrices.map((p) => ({
    t: Number(p.timestamp),
    price: typeof p.price === 'number' ? p.price : null,
    priceMin: typeof p.priceMin === 'number' && p.priceMin > 0 ? p.priceMin : null,
    offers: typeof p.offerCount === 'number' ? p.offerCount : null
  }))
}

async function probeFlea(dataMode: DataMode): Promise<void> {
  const S = `flea ${dataMode}`
  const dataset = await fetchTarkovDevJson(fetch, dataMode, Date.now())
  const base = dataset.items.filter((i) => !i.bannedOnFlea && !i.types.includes('preset'))
  const thresholds = [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3]
  for (const [offers, price] of [
    [50, 20_000],
    [25, 10_000],
    [25, 20_000]
  ]) {
    for (const level of [15, 30, 62]) {
      const pool = base.filter(
        (i) =>
          (i.offerCount ?? 0) >= offers &&
          (i.fleaPrice ?? 0) >= price &&
          fleaAccess(i, level, dataset.fleaMinLevel).status === 'sellable'
      )
      const swings = pool.map((i) => todaySwing(i) ?? -1)
      log(
        S,
        `offers≥${offers} price≥${price} level ${level}: ${pool.length} items; swing≥`,
        Object.fromEntries(thresholds.map((t) => [`${t * 100}%`, swings.filter((s) => s >= t).length]))
      )
    }
  }

  // Intraday history, if the GraphQL API answers.
  const liquid = base
    .filter((i) => (i.offerCount ?? 0) >= 25 && (i.fleaPrice ?? 0) >= 10_000)
    .sort((a, b) => (b.offerCount ?? 0) - (a.offerCount ?? 0))
    .slice(0, 150)
  let first: HistoryPoint[] | null
  try {
    first = await graphqlHistory(liquid[0].id, dataMode)
  } catch (err) {
    log(S, `GraphQL history unavailable: ${errorMessage(err)}`)
    return
  }
  log(
    S,
    `GraphQL history for ${liquid[0].name}: ${first?.length} points, first ${new Date(first?.[0]?.t ?? 0).toISOString()}`
  )
  if (!first || first.length < 100) return
  const rows: {
    name: string
    vol: number | null
    spread: number | null
    profit: number | null
    cons: number
  }[] = []
  for (let k = 0; k < liquid.length; k += 6) {
    const batch = liquid.slice(k, k + 6)
    const histories = await Promise.all(batch.map((i) => graphqlHistory(i.id, dataMode).catch(() => null)))
    batch.forEach((item, j) => {
      const points = histories[j]
      if (!points) return
      const stats = analyzeHistory(points, {
        now: Date.now(),
        days: 7,
        bucketHours: 1,
        hourOf: (t) => new Date(t).getUTCHours(),
        dayOf: (t) => new Date(t).toISOString().slice(0, 10),
        basePrice: item.basePrice ?? null,
        feeRates: dataset.fleaFeeRates
      })
      if (stats.insufficient) return
      rows.push({
        name: item.name,
        vol: stats.volatility,
        spread: stats.spreadPct,
        profit: stats.profit,
        cons:
          stats.consistency && stats.consistency.days ? stats.consistency.wins / stats.consistency.days : 0
      })
    })
  }
  log(S, `${rows.length} of ${liquid.length} items with a pattern`)
  for (const t of thresholds) {
    const vol = rows.filter((r) => (r.vol ?? 0) >= t)
    const spread = rows.filter((r) => (r.spread ?? 0) >= t)
    log(
      S,
      `swing ${t * 100}%: volatility ${vol.length} (profit≥0 & cons≥0.6: ${vol.filter((r) => (r.profit ?? -1) >= 0 && r.cons >= 0.6).length}; profit≥2000 & cons≥0.6: ${vol.filter((r) => (r.profit ?? -1) >= 2000 && r.cons >= 0.6).length}; profit≥5000 & cons≥0.7: ${vol.filter((r) => (r.profit ?? -1) >= 5000 && r.cons >= 0.7).length}) · buy→sell ${spread.length} (profit≥5000 & cons≥0.7: ${spread.filter((r) => (r.profit ?? -1) >= 5000 && r.cons >= 0.7).length})`
    )
  }
  const q = (xs: number[], p: number): number =>
    xs.sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)] ?? NaN
  const vols = rows.map((r) => r.vol ?? 0)
  const spreads = rows.map((r) => r.spread ?? 0)
  log(
    S,
    'volatility quartiles',
    [0.25, 0.5, 0.75, 0.9].map((p) => round(q([...vols], p)))
  )
  log(
    S,
    'buy→sell quartiles',
    [0.25, 0.5, 0.75, 0.9].map((p) => round(q([...spreads], p)))
  )
}

async function main(): Promise<void> {
  let infos: TaskInfo[] = []
  for (const mode of ['pvp', 'pve'] as const) {
    await section(`quests ${mode}`, async () => {
      const result = await probeQuests(mode)
      if (mode === 'pvp') infos = result
    })
  }
  await section('season', probeSeason)
  await section('wiki', () => probeWiki(infos))
  await section('db4tarkov', probeDb4tarkov)
  await section('maps', probeMaps)
  for (const mode of ['pvp', 'pve'] as const) await section(`flea ${mode}`, () => probeFlea(mode))
}

void main()
