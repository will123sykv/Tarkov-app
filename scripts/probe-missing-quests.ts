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

async function query(params: Record<string, string>): Promise<Raw | null> {
  const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })
  return (await getJson(`${WIKI}?${q}`, { headers: { Accept: 'application/json' } })) as Raw | null
}

async function main(): Promise<void> {
  // The wiki's event quests: pages in both Category:Event_content and Category:Quests.
  const pages: { title: string; quest: boolean; touched?: string }[] = []
  let cont: Record<string, string> = {}
  for (let i = 0; i < 10; i++) {
    const body = await query({
      generator: 'categorymembers',
      gcmtitle: 'Category:Event_content',
      gcmlimit: '500',
      gcmnamespace: '0',
      prop: 'categories|info',
      clcategories: 'Category:Quests',
      cllimit: 'max',
      ...cont
    })
    for (const p of list((body?.query as Raw)?.pages))
      pages.push({
        title: String(p.title),
        quest: list(p.categories).length > 0,
        touched: String(p.touched ?? '')
      })
    if (!body?.continue) break
    cont = body.continue as Record<string, string>
  }
  const quests = pages.filter((p) => p.quest)
  console.log(`event content pages: ${pages.length}; of them quests: ${quests.length}`)
  console.log(quests.map((p) => `${p.title} (${p.touched?.slice(0, 10)})`).join(' | '))
  console.log(
    'non-quest sample:',
    pages
      .filter((p) => !p.quest)
      .slice(0, 15)
      .map((p) => p.title)
      .join(' | ')
  )

  // The event template, and a few event quests to parse.
  const tpl = await wikitext('Template:Event content')
  console.log('\n===== Template:Event content =====\n' + tpl.text.slice(0, 1500))
  const sample = [
    'Number Temporarily Unavailable',
    ...quests
      .map((p) => p.title)
      .filter((t) => t !== 'Fog of War')
      .slice(0, 3)
  ]
  for (const title of sample) {
    const page = await wikitext(title)
    console.log(`\n===== wiki: ${title} =====`)
    console.log('categories:', page.categories)
    const cut = page.text.indexOf('==Guide==')
    console.log(page.text.slice(0, cut > 0 ? Math.min(cut, 4500) : 4500))
  }
  // A regular quest with a hand-over and trader rep, for the reward and item formats.
  const hand = await wikitext('Gunsmith - Part 1')
  console.log('\n===== wiki: Gunsmith - Part 1 =====')
  const cut = hand.text.indexOf('==Guide==')
  console.log(hand.text.slice(0, cut > 0 ? Math.min(cut, 3500) : 3500))
  // The search the picker would use to resolve a pasted name.
  const search = await query({ list: 'search', srsearch: 'Fog of War', srlimit: '3' })
  console.log('\nsearch:', JSON.stringify((search?.query as Raw)?.search).slice(0, 600))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
