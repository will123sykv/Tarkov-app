// Temporary: how tarkov.dev's quests compare with the wiki's quest pages.
import { fetchQuestData } from '../src/main/quests/questData'
import { wikiApi, wikiTitle } from '../src/main/quests/questGuide'
import { infoboxFields, parseWikiQuest } from '../src/main/quests/wikiQuests'
import type { Quest, WikiQuest } from '../src/shared/questTypes'
import { objectiveMapIds } from '../src/shared/todo'

type Raw = Record<string, unknown>
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&#0?39;|['’`]/g, "'")
    .replace(/\[pvp zone\]|\[pve zone\]/g, '')
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
const MAX = 12

function report(title: string, items: string[]): void {
  console.log(`\n### ${title}: ${items.length}`)
  for (const line of items.slice(0, MAX)) console.log(`  - ${line}`)
}

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
  console.log(`tarkov.dev: ${data.quests.length} quests · wiki: ${pages.length} quest pages`)
  const maps = data.maps.map((m) => ({ id: m.id, name: m.name, normalizedName: m.normalizedName }))
  const mapName = new Map(data.maps.map((m) => [m.id, m.name]))
  const group = (name: string): string =>
    name.replace(/^Night Factory$/, 'Factory').replace(/^Ground Zero 21\+$/, 'Ground Zero')
  const trader = new Map(data.traders.map((t) => [t.id, t.name]))
  const questName = new Map(data.quests.map((q) => [q.id, q.name]))

  const fieldUse = new Map<string, number>()
  const wiki = new Map<string, { quest: WikiQuest; content: string }>()
  for (const p of pages) {
    const fields = infoboxFields(p.content)
    for (const k of Object.keys(fields ?? {})) fieldUse.set(k, (fieldUse.get(k) ?? 0) + 1)
    const quest = parseWikiQuest(p.title, p.content, p.categories, maps)
    if (quest) wiki.set(norm(p.title), { quest, content: p.content })
  }
  console.log(`parsed as quests: ${wiki.size}`)
  console.log(
    'infobox fields:',
    [...fieldUse.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([k, n]) => `${k}=${n}`)
      .join(', ')
  )

  const matched: { q: Quest; w: WikiQuest; content: string }[] = []
  const onlyDev: string[] = []
  const seen = new Set<string>()
  for (const q of data.quests) {
    const key = norm(wikiTitle(q.wikiLink) ?? q.name)
    const hit = wiki.get(key) ?? wiki.get(norm(q.name))
    if (hit) {
      matched.push({ q, w: hit.quest, content: hit.content })
      seen.add(norm(hit.quest.title))
    } else onlyDev.push(`${q.name} (${trader.get(q.traderId) ?? q.traderId}) ${q.wikiLink ?? 'no wiki link'}`)
  }
  const onlyWiki = [...wiki.values()]
    .filter(({ quest }) => !seen.has(norm(quest.title)))
    .map(({ quest }) => `${quest.title}${quest.event ? ' [event]' : ''}${quest.past ? ' [historical]' : ''}`)
  console.log(`matched: ${matched.length}`)
  // Raw values behind the noisier comparisons.
  const kappaRaw = new Map<string, number>()
  for (const { content } of matched) {
    const v = (infoboxFields(content)?.reqkappa ?? '(none)').slice(0, 30)
    kappaRaw.set(v, (kappaRaw.get(v) ?? 0) + 1)
  }
  console.log('reqkappa values:', JSON.stringify([...kappaRaw.entries()]))
  const kappaDevTrue = matched.filter(({ q }) => q.kappaRequired).length
  const kappaWikiTrue = matched.filter(({ w }) => w.kappa).length
  console.log(`kappa: tarkov.dev ${kappaDevTrue} · wiki ${kappaWikiTrue}`)
  for (const name of [
    'Chemical - Part 3',
    'Audit',
    'Dandies',
    'The Tarkov Shooter - Part 4',
    'Vacate the Premises',
    'First in Line'
  ]) {
    const hit = matched.find(({ q }) => q.name === name)
    if (!hit) continue
    const req = /==\s*Requirements\s*==([\s\S]*?)(\n==[^=]|$)/i.exec(hit.content)?.[1] ?? ''
    const obj = /==\s*Objectives\s*==([\s\S]*?)(\n==[^=]|$)/i.exec(hit.content)?.[1] ?? ''
    console.log(
      `\n--- ${name} (tarkov.dev level ${hit.q.minPlayerLevel}, kappa ${hit.q.kappaRequired}; objectives ${hit.q.objectives.map((o) => `${o.description} x${o.count ?? 1}`).join(' | ')})`
    )
    console.log('requirements:', req.trim().slice(0, 400))
    console.log('objectives:', obj.trim().slice(0, 500))
    console.log('reqkappa:', infoboxFields(hit.content)?.reqkappa)
  }
  const missingCats = new Map<string, number>()
  for (const p of pages) {
    const key = norm(p.title)
    const w = wiki.get(key)
    if (!w || seen.has(norm(w.quest.title)) || w.quest.event || w.quest.past) continue
    for (const c of p.categories) missingCats.set(c, (missingCats.get(c) ?? 0) + 1)
  }
  console.log(
    'categories of wiki-only current quests:',
    JSON.stringify([...missingCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
  )
  report('On tarkov.dev, no wiki page found', onlyDev)
  report(
    'On the wiki, not on tarkov.dev (current, not event/historical)',
    onlyWiki.filter((s) => !/\[(event|historical)\]/.test(s))
  )
  report(
    'On the wiki, not on tarkov.dev (event or historical)',
    onlyWiki.filter((s) => /\[(event|historical)\]/.test(s))
  )

  const traderDiff: string[] = []
  const prevDiff: string[] = []
  const levelDiff: string[] = []
  const loyaltyNote: string[] = []
  const countDiff: string[] = []
  const numDiff: string[] = []
  const mapDiff: string[] = []
  const kappaDiff: string[] = []
  for (const { q, w, content } of matched) {
    const t = trader.get(q.traderId) ?? ''
    if (w.trader && norm(w.trader) !== norm(t) && !q.story)
      traderDiff.push(`${q.name}: tarkov.dev ${t} · wiki ${w.trader}`)
    const devPrev = new Set(q.requires.map((r) => norm(questName.get(r.questId) ?? r.questId)))
    const wikiPrev = new Set(w.previous.map(norm))
    const missingOnDev = [...wikiPrev].filter((p) => !devPrev.has(p))
    const extraOnDev = [...devPrev].filter((p) => !wikiPrev.has(p))
    if (missingOnDev.length || extraOnDev.length)
      prevDiff.push(
        `${q.name}: wiki also needs [${missingOnDev.join(', ')}] · tarkov.dev also needs [${extraOnDev.join(', ')}]`
      )
    const level = /(?:must be|reach|player)?\s*level\s*(\d+)/i.exec(
      (/==\s*Requirements\s*==([\s\S]*?)(\n==[^=]|$)/i.exec(content)?.[1] ?? '') +
        (infoboxFields(content)?.['requirements'] ?? '')
    )
    if (level && Number(level[1]) !== q.minPlayerLevel)
      levelDiff.push(`${q.name}: tarkov.dev ${q.minPlayerLevel} · wiki ${level[1]}`)
    if (w.loyaltyLevel) loyaltyNote.push(`${q.name}: wiki LL${w.loyaltyLevel}`)
    const devObj = q.objectives.filter((o) => !o.optional)
    const wikiObj = w.objectives.filter((o) => !o.optional && o.depth === 0)
    if (devObj.length !== wikiObj.length)
      countDiff.push(
        `${q.name}: tarkov.dev ${devObj.length} [${devObj.map((o) => o.description).join(' | ')}] · wiki ${wikiObj.length} [${wikiObj.map((o) => o.text).join(' | ')}]`
      )
    const devNums = devObj
      .map((o) => o.count ?? 1)
      .filter((n) => n > 1)
      .sort((a, b) => a - b)
    const wikiNums = wikiObj
      .map((o) => o.count ?? 1)
      .filter((n) => n > 1)
      .sort((a, b) => a - b)
    if (devNums.join() !== wikiNums.join())
      numDiff.push(`${q.name}: tarkov.dev [${devNums.join(', ')}] · wiki [${wikiNums.join(', ')}]`)
    const devMaps = new Set(
      devObj.flatMap((o) => objectiveMapIds(o)).map((id) => group(mapName.get(id) ?? id))
    )
    const devAny = devObj.some((o) => !objectiveMapIds(o).length) || devMaps.size >= 6
    const wikiMaps = new Set(w.maps.map((id) => group(mapName.get(id) ?? id)))
    const wikiLoc = (infoboxFields(content)?.location ?? '').replace(/\[\[|\]\]/g, '')
    const wikiAny = /any|various/i.test(wikiLoc)
    if (
      !(devAny && wikiAny) &&
      [...wikiMaps].sort().join() !== [...devMaps].sort().join() &&
      (wikiMaps.size || !devAny)
    )
      mapDiff.push(
        `${q.name}: tarkov.dev [${[...devMaps].join(', ')}${devAny ? ' +any' : ''}] · wiki [${wikiLoc.slice(0, 80)}]`
      )
    if (w.kappa !== q.kappaRequired)
      kappaDiff.push(`${q.name}: tarkov.dev ${q.kappaRequired} · wiki ${w.kappa}`)
  }
  report('Trader differs', traderDiff)
  report('Previous quests differ', prevDiff)
  report('Minimum level differs', levelDiff)
  report('Wiki states a loyalty level (tarkov.dev has trader requirements separately)', loyaltyNote)
  report('Number of objectives differs', countDiff)
  report('Objective counts (numbers > 1) differ', numDiff)
  report('Maps differ', mapDiff)
  report('Kappa flag differs', kappaDiff)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
