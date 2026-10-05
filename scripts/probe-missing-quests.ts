// Temporary: why some quests (Fog of War…) aren't in tarkov.dev's task list, and what the wiki has (removed after use).

type Raw = Record<string, unknown>

const JSON_BASE = 'https://json.tarkov.dev'
const WIKI = 'https://escapefromtarkov.fandom.com/api.php'

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init)
  if (!res.ok) {
    console.log(`  ${url}: HTTP ${res.status}`)
    return null
  }
  const body = (await res.json()) as Raw
  return body && typeof body === 'object' && 'data' in body && !('tasks' in body) ? body.data : body
}

const list = (v: unknown): Raw[] =>
  Array.isArray(v) ? (v as Raw[]) : v && typeof v === 'object' ? (Object.values(v) as Raw[]) : []

async function wikitext(page: string): Promise<{ text: string; categories: string[] }> {
  const q = new URLSearchParams({
    action: 'parse',
    page,
    prop: 'wikitext|categories',
    redirects: '1',
    format: 'json',
    formatversion: '2'
  })
  const body = (await getJson(`${WIKI}?${q}`, { headers: { Accept: 'application/json' } })) as Raw | null
  const parse = (body?.parse ?? {}) as Raw
  return {
    text: typeof parse.wikitext === 'string' ? parse.wikitext : '',
    categories: list(parse.categories).map((c) => String(c.category ?? c['*'] ?? ''))
  }
}

async function main(): Promise<void> {
  for (const mode of ['regular', 'pve']) {
    console.log(`\n===== ${mode} =====`)
    const tasksFile = (await getJson(`${JSON_BASE}/${mode}/tasks`)) as Raw
    const lang = ((await getJson(`${JSON_BASE}/${mode}/tasks_en`)) ?? {}) as Record<string, string>
    const tasks = list(tasksFile?.tasks)
    console.log('tasks file keys:', Object.keys(tasksFile ?? {}))
    console.log('tasks listed:', tasks.length)
    const ids = new Set(tasks.map((t) => String(t.id)))
    const achievements = new Set(
      tasks.flatMap((t) => [
        ...list((t.finishRewards as Raw)?.achievement).map(String),
        ...list((t.startRewards as Raw)?.achievement).map(String)
      ])
    )
    const named = Object.entries(lang)
      .map(([k, v]) => [/^([0-9a-f]{24}) name$/.exec(k)?.[1], v] as const)
      .filter((e): e is readonly [string, string] => !!e[0])
    const fog = named.filter(([, n]) => /fog of war/i.test(n))
    console.log('"Fog of War" in tasks_en:', fog)
    for (const [id] of fog) {
      const t = tasks.find((x) => x.id === id)
      console.log(`  listed in tasks? ${!!t}`)
      if (t) console.log('  raw:', JSON.stringify(t).slice(0, 2500))
    }
    const byName = tasks.filter((t) => /fog/i.test(String(lang[String(t.name)] ?? t.name ?? '')))
    console.log(
      'tasks whose name mentions fog:',
      byName.map((t) => `${t.id} ${lang[String(t.name)] ?? t.name}`)
    )
    const missing = named.filter(([id]) => !ids.has(id) && !achievements.has(id))
    console.log(`names in tasks_en not listed (and not achievements): ${missing.length}`)
    console.log(missing.map(([id, n]) => `${n} [${id}]`).join(' | '))
    if (mode === 'regular') {
      const t0 = tasks[0] ?? {}
      console.log('a listed task, keys:', Object.keys(t0))
      console.log(
        'trader / faction / level fields:',
        JSON.stringify({ trader: t0.trader, factionName: t0.factionName, minPlayerLevel: t0.minPlayerLevel })
      )
    }
  }

  // tarkov.dev's GraphQL API.
  for (const gameMode of ['regular', 'pve']) {
    const res = (await getJson('https://api.tarkov.dev/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `{ tasks(lang: en, gameMode: ${gameMode}) { id name trader { name } factionName minPlayerLevel map { name } } }`
      })
    })) as Raw | null
    const tasks = list((res?.tasks ?? (res?.data as Raw)?.tasks) as unknown)
    console.log(
      `\nGraphQL ${gameMode}: ${tasks.length} tasks; fog:`,
      JSON.stringify(tasks.filter((t) => /fog/i.test(String(t.name))))
    )
    if (!tasks.length) console.log('  body:', JSON.stringify(res).slice(0, 500))
  }

  // The wiki.
  const fog = await wikitext('Fog of War')
  console.log('\n===== wiki: Fog of War =====')
  console.log('categories:', fog.categories)
  console.log(fog.text.slice(0, 5000))
  const quests = await wikitext('Quests')
  console.log('\n===== wiki: Quests (layout) =====')
  console.log('categories:', quests.categories)
  console.log(
    'headings:',
    [...quests.text.matchAll(/^(=+)\s*(.+?)\s*\1\s*$/gm)].map((m) => m[0]).slice(0, 40)
  )
  const i = quests.text.indexOf('Fog of War')
  console.log(
    'around Fog of War:',
    i < 0 ? 'not on the page' : quests.text.slice(Math.max(0, i - 1500), i + 500)
  )
  console.log('first 2500 chars:', quests.text.slice(0, 2500))
  // Another missing one, and an ordinary listed one, for the infobox fields.
  const debut = await wikitext('Debut')
  console.log('\n===== wiki: Debut (a quest tarkov.dev lists) =====')
  console.log('categories:', debut.categories)
  console.log(debut.text.slice(0, 2500))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
