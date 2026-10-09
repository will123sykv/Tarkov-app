// Temporary: how tarkov.dev's quests compare with the wiki's quest pages.
import { fetchQuestData } from '../src/main/quests/questData'
import { wikiApi, wikiTitle } from '../src/main/quests/questGuide'
import { infoboxFields, parseWikiQuest } from '../src/main/quests/wikiQuests'

type Raw = Record<string, unknown>
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&#0?39;|['’`]/g, "'")
    .replace(/\[pvp zone\]|\[pve zone\]/g, '')
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
async function wikiPages(): Promise<{ title: string; content: string; categories: string[] }[]> {
  const titles: string[] = []
  let cont: Record<string, string> = {}
  for (let i = 0; i < 20; i++) {
    const body = await wikiApi(fetch, {
      action: 'query',
      list: 'categorymembers',
      cmtitle: 'Category:Quests',
      cmlimit: '500',
      cmnamespace: '0',
      ...cont
    })
    const members = ((body.query as Raw).categorymembers as Raw[]) ?? []
    titles.push(...members.map((m) => String(m.title)))
    const next = body.continue as Record<string, string> | undefined
    if (!next) break
    cont = next
  }
  const pages: { title: string; content: string; categories: string[] }[] = []
  for (let i = 0; i < titles.length; i += 50) {
    const body = await wikiApi(fetch, {
      action: 'query',
      prop: 'revisions|categories',
      rvprop: 'content',
      rvslots: 'main',
      cllimit: 'max',
      titles: titles.slice(i, i + 50).join('|')
    })
    for (const p of ((body.query as Raw).pages as Raw[]) ?? []) {
      const rev = (p.revisions as Raw[] | undefined)?.[0]
      const content = String(((rev?.slots as Raw)?.main as Raw)?.content ?? '')
      pages.push({
        title: String(p.title),
        content,
        categories: ((p.categories as Raw[]) ?? []).map((c) => String(c.title))
      })
    }
  }
  return pages
}

async function main(): Promise<void> {
  const data = await fetchQuestData(fetch, 'pvp', Date.now())
  const pages = await wikiPages()
  const devNames = new Set(data.quests.flatMap((q) => [norm(q.name), norm(wikiTitle(q.wikiLink) ?? q.name)]))
  const only = pages.filter((p) => {
    const w = parseWikiQuest(p.title, p.content, p.categories)
    return w && !w.event && !w.past && !devNames.has(norm(p.title))
  })
  console.log(`wiki-only current quests: ${only.length}`)
  const givers = new Map<string, number>()
  for (const p of only) {
    const f = infoboxFields(p.content) ?? {}
    const giver = (f['given by'] ?? '').replace(/\[\[|\]\]/g, '')
    givers.set(giver, (givers.get(giver) ?? 0) + 1)
  }
  console.log('givers:', JSON.stringify([...givers.entries()].sort((a, b) => b[1] - a[1])))
  for (const p of only) {
    const f = infoboxFields(p.content) ?? {}
    const obj = (/==\s*Objectives\s*==([\s\S]*?)(\n==[^=]|$)/i.exec(p.content)?.[1] ?? '')
      .trim()
      .split('\n')[0]
    const top = p.content.slice(0, 160).replace(/\n/g, ' ')
    console.log(
      `ONLY | ${p.title} | by ${f['given by'] ?? ''} | at ${(f.location ?? '').slice(0, 60)} | #${f['quest number'] ?? ''} | prev ${(f.previous ?? '').slice(0, 60)} | ${obj.slice(0, 100)} | top: ${top}`
    )
  }
  const samples = [
    'Dandies',
    'Vacate the Premises',
    'Slaughterhouse',
    'Create a Distraction - Part 2',
    'The Survivalist Path - Wounded Beast',
    'Dragnet',
    'The Huntsman Path - Administrator',
    'Antique Enthusiast',
    'Chumming',
    'Cease Fire!',
    'Revision - Lighthouse',
    'Bullshit',
    'Shooting Cans'
  ]
  for (const name of samples) {
    const p = pages.find((x) => x.title === name)
    if (!p) {
      console.log(`SAMPLE missing ${name}`)
      continue
    }
    console.log(`\n===== SAMPLE ${name} (${p.content.length} chars) =====`)
    console.log(p.content.slice(0, 3500))
    console.log('===== END =====')
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
