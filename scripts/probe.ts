// Temporary probe (1.43.0): the BTR Driver's quests and Invasive Therapy, in tarkov.dev, the wiki
// and what the app keeps.
import { fetchJsonData } from '../src/main/pricing/tarkovDevJson'
import { fetchQuestData } from '../src/main/quests/questData'
import { wikiApi } from '../src/main/quests/questGuide'

type Raw = Record<string, unknown>
const fetchFn = (url: string, init?: RequestInit): Promise<Response> => fetch(url, init)

async function main(): Promise<void> {
  const raw = await fetchJsonData<Raw>(fetchFn as never, 'pvp', 'tasks')
  const lang = await fetchJsonData<Raw>(fetchFn as never, 'pvp', 'tasks_en').catch(() => ({}) as Raw)
  const tasks = Object.values((raw.tasks ?? raw) as Raw) as Raw[]
  const tr = (k: unknown): string => String((lang as Raw)[String(k)] ?? k)
  const invasive = tasks.filter((t) => /invasive/i.test(tr(t.name)))
  console.log('== tarkov.dev Invasive Therapy:', invasive.length)
  for (const t of invasive)
    console.log(
      JSON.stringify({
        ...t,
        name: tr(t.name),
        objectives: (t.objectives as Raw[]).map((o) => ({ ...o, description: tr(o.description) }))
      }).slice(0, 4000)
    )
  // Objectives naming items that aren't hand-overs or finds: what could be "brought".
  const kinds = new Map<string, string[]>()
  for (const t of tasks)
    for (const o of (t.objectives as Raw[]) ?? []) {
      const type = String(o.type)
      if (
        [
          'giveItem',
          'findItem',
          'giveQuestItem',
          'findQuestItem',
          'sellItem',
          'buildWeapon',
          'traderLevel',
          'taskStatus',
          'skill',
          'experience',
          'traderStanding'
        ].includes(type)
      )
        continue
      const fields = Object.keys(o).filter(
        (k) =>
          /item|useAny|containsAll|effects/i.test(k) &&
          o[k] &&
          (!Array.isArray(o[k]) || (o[k] as unknown[]).length)
      )
      if (fields.length)
        kinds.set(`${type} [${fields.join(',')}]`, [
          ...(kinds.get(`${type} [${fields.join(',')}]`) ?? []),
          tr(t.name)
        ])
    }
  console.log('== objective types with item fields:')
  for (const [k, names] of kinds) console.log(k, names.length, names.slice(0, 12).join(' | '))

  const traders = await fetchJsonData<Raw>(fetchFn as never, 'pvp', 'traders')
  const traderList = Object.values((traders.traders ?? traders) as Raw)
  const tLang = await fetchJsonData<Raw>(fetchFn as never, 'pvp', 'traders_en').catch(() => ({}) as Raw)
  console.log(
    '== traders:',
    (traderList as Raw[])
      .map((t) => `${String(t.id)}=${String((tLang as Raw)[String(t.name)] ?? t.name)}`)
      .join(', ')
  )
  const btr = (traderList as Raw[]).find((t) => /btr/i.test(String((tLang as Raw)[String(t.name)] ?? t.name)))
  const btrTasks = tasks.filter((t) => String(t.trader) === String(btr?.id))
  console.log(
    `== tarkov.dev tasks given by the BTR Driver (${String(btr?.id)}): ${btrTasks.length}`,
    btrTasks.map((t) => tr(t.name)).join(' | ')
  )

  const ds = await fetchQuestData(fetchFn as never, 'pvp', Date.now())
  const kept = ds.quests.filter((q) => q.traderId === String(btr?.id))
  console.log(
    `== app keeps from tarkov.dev for the BTR Driver: ${kept.length}`,
    kept.map((q) => q.name).join(' | ')
  )
  console.log('== dataset traders', ds.traders.map((t) => `${t.id}=${t.name}`).join(', '))
  console.log(`== app wiki-only quests: ${ds.wikiOnlyQuests.length}`)
  for (const q of ds.wikiOnlyQuests) console.log(`  ${q.title} | trader=${q.trader} | season=${q.season}`)
  const inv = ds.quests.find((q) => /invasive/i.test(q.name))
  console.log(
    '== app Invasive Therapy',
    JSON.stringify(
      inv?.objectives.map((o) => ({
        id: o.id,
        type: o.type,
        description: o.description,
        items: o.items,
        maps: o.maps,
        count: o.count
      }))
    )
  )

  // The wiki's BTR Driver page and its quests.
  for (const title of ['BTR Driver']) {
    const body = await wikiApi(fetchFn as never, { action: 'parse', page: title, prop: 'wikitext|links' })
    const parse = body.parse as Raw
    const lines = String(parse.wikitext ?? '').split('\n')
    const at = lines.findIndex((l) => /==\s*Quests?\s*==/i.test(l) || /==\s*Tasks?\s*==/i.test(l))
    console.log(
      `== wiki ${title} quests section (line ${at}):\n` + lines.slice(Math.max(0, at), at + 60).join('\n')
    )
  }
}
void main().catch((e) => console.log('probe failed', e))
