/**
 * Temporary probe for 1.7.0: quest rewards, keys and objective fields in tarkov.dev's data, trader
 * images, and the pictures in quests' guides on the Escape from Tarkov wiki. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, values } from '../src/main/pricing/tarkovDevJson'

type Raw = Record<string, unknown>
const rec = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {})
const WIKI = 'https://escapefromtarkov.fandom.com'
const UA = { 'User-Agent': 'TarkovLootOptimiser-probe/1.0 (github.com/will123sykv/Tarkov-app)' }

const log = (section: string, ...parts: unknown[]): void =>
  console.log(`[${section}]`, ...parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))))

async function section(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (err) {
    log(name, `FAILED: ${errorMessage(err)}`)
  }
}

async function probeTasks(): Promise<void> {
  const [data, en, traders] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'tasks'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'tasks_en'),
    fetchJsonData<Raw>(fetch, 'pvp', 'traders')
  ])
  const tasks = values(data.tasks as Raw[] | Record<string, Raw>)
  const tr = (k: unknown): string => (typeof k === 'string' ? (en[k] ?? k) : JSON.stringify(k))
  const objectiveKeys = new Map<string, number>()
  const rewardKeys = new Map<string, number>()
  for (const t of tasks) {
    for (const o of (t.objectives ?? []) as Raw[])
      for (const k of Object.keys(o)) objectiveKeys.set(k, (objectiveKeys.get(k) ?? 0) + 1)
    for (const r of [t.finishRewards, t.startRewards] as Raw[])
      for (const [k, v] of Object.entries(r ?? {}))
        if (v && (!Array.isArray(v) || v.length)) rewardKeys.set(k, (rewardKeys.get(k) ?? 0) + 1)
  }
  log('tasks', 'objective keys', Object.fromEntries(objectiveKeys))
  log('tasks', 'reward keys (non-empty)', Object.fromEntries(rewardKeys))
  for (const key of [
    'offerUnlock',
    'skillLevelReward',
    'traderUnlock',
    'achievement',
    'customization',
    'traderDialogueUnlock',
    'craftUnlock'
  ]) {
    const samples = tasks
      .flatMap((t) => [rec(t.finishRewards)[key], rec(t.startRewards)[key]])
      .flatMap((v) => (Array.isArray(v) ? v : []))
      .slice(0, 3)
    log('rewards', key, samples)
  }
  const startItems = tasks.filter((t) => ((rec(t.startRewards).items ?? []) as unknown[]).length).slice(0, 2)
  for (const t of startItems) log('rewards', `start items ${tr(t.name)}`, rec(t.startRewards).items)
  const [hideout, hideoutEn] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'hideout'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'hideout_en')
  ])
  log('hideout', 'top keys', Object.keys(hideout))
  for (const [k, v] of Object.entries(hideout)) {
    log('hideout', k, JSON.stringify(v).slice(0, 300), hideoutEn[String(rec(v).name)])
  }
  const skillKeys = [
    '664f23e44702fd5db50ee732 name',
    '664f23e44702fd5db50ee732 Name',
    '67585d2cd7a2703986067e99 Name',
    'Surgery',
    ...Object.keys(en).filter((k) => k.startsWith('664f23e44702fd5db50ee732'))
  ]
  log(
    'rewards',
    'en skill keys',
    skillKeys,
    skillKeys.map((k) => en[k])
  )
  log('tasks', 'objective types', [
    ...new Set(tasks.flatMap((t) => ((t.objectives ?? []) as Raw[]).map((o) => o.type)))
  ])
  for (const name of [
    'Debut',
    'Checking',
    'Delivery from the Past',
    'Shortage',
    'The Extortionist',
    'Gunsmith - Part 1',
    'Chemical - Part 4',
    'Golden Swag'
  ]) {
    const t = tasks.find((x) => tr(x.name) === name)
    if (!t) {
      log('task', `${name}: not found`)
      continue
    }
    log('task', name, {
      wikiLink: t.wikiLink,
      taskImageLink: t.taskImageLink,
      neededKeys: t.neededKeys,
      finishRewards: t.finishRewards,
      startRewards: t.startRewards,
      experience: t.experience,
      failConditions: t.failConditions
    })
    for (const o of (t.objectives ?? []) as Raw[]) log('task', `  objective ${String(o.type)}`, o)
  }
  const traderList = values((traders.traders ?? traders) as Raw[] | Record<string, Raw>)
  log(
    'traders',
    traderList
      .slice(0, 3)
      .map((x) => ({ id: x.id, name: x.name, imageLink: x.imageLink, image4xLink: x.image4xLink }))
  )
}

async function wikiJson(params: Record<string, string>): Promise<Raw> {
  const url = `${WIKI}/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return (await res.json()) as Raw
}

async function probeWiki(): Promise<void> {
  for (const page of [
    'Checking',
    'Delivery_from_the_Past',
    'Bad_Rep_Evidence',
    'Setup',
    'Spa_Tour_-_Part_1',
    'Gunsmith_-_Part_1'
  ]) {
    await section('wiki', async () => {
      const parsed = (
        await wikiJson({ action: 'parse', page, prop: 'wikitext|images|sections', redirects: '1' })
      ).parse as Raw
      const text = String(parsed.wikitext ?? '')
      log(
        'wiki',
        `${page}: ${text.length} chars, sections`,
        ((parsed.sections ?? []) as Raw[]).map((s) => s.line)
      )
      log('wiki', `${page}: images`, parsed.images)
      const guide = /==\s*Guide\s*==([\s\S]*?)(\n==[^=]|$)/.exec(text)?.[1] ?? ''
      log('wiki', `${page}: guide`, guide.slice(0, 2500))
      const files = (parsed.images as string[] | undefined)?.slice(0, 6) ?? []
      if (!files.length) return
      const info = (
        await wikiJson({
          action: 'query',
          titles: files.map((f) => `File:${f}`).join('|'),
          prop: 'imageinfo',
          iiprop: 'url|size|mime',
          iiurlwidth: '800'
        })
      ).query as Raw
      const pages = (info.pages ?? []) as Raw[]
      for (const p of pages) log('wiki', `  ${String(p.title)}`, (p.imageinfo as Raw[] | undefined)?.[0])
      const first = ((pages[0]?.imageinfo as Raw[] | undefined)?.[0] ?? {}) as Raw
      for (const key of ['thumburl', 'url']) {
        const url = first[key]
        if (typeof url !== 'string') continue
        const res = await fetch(url, { headers: UA })
        log(
          'wiki',
          `  fetch ${key}: HTTP ${res.status} ${res.headers.get('content-type')} ${(await res.arrayBuffer()).byteLength} bytes, cors ${res.headers.get('access-control-allow-origin')}`
        )
      }
    })
  }
}

async function main(): Promise<void> {
  await section('tasks', probeTasks)
  await section('wiki', probeWiki)
}

void main()
