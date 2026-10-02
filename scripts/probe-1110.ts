/**
 * Temporary probe for 1.11.0: where the main story chapters (Tour, Falling Skies, Batya…) and their
 * objectives can be had. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, values } from '../src/main/pricing/tarkovDevJson'

type Raw = Record<string, unknown>

async function gql(query: string): Promise<unknown> {
  const res = await fetch('https://api.tarkov.dev/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  return res.json()
}

async function step(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    console.log(`[${name}] failed: ${errorMessage(e)}`)
  }
}

async function main(): Promise<void> {
  await step('gql-fields', async () => {
    const r = (await gql('{ __schema { queryType { fields { name } } } }')) as Raw
    console.log(`[gql-fields] ${JSON.stringify(r).slice(0, 3000)}`)
  })
  await step('gql-story-types', async () => {
    const r = (await gql('{ __schema { types { name kind } } }')) as {
      data?: { __schema?: { types?: { name: string }[] } }
    }
    const names = (r.data?.__schema?.types ?? [])
      .map((t) => t.name)
      .filter((n) => /story|chapter|quest|task/i.test(n))
    console.log(`[gql-story-types] ${JSON.stringify(names)}`)
    for (const n of names.filter((x) => /story|chapter/i.test(x)))
      console.log(
        `[gql-type ${n}] ${JSON.stringify(await gql(`{ __type(name: "${n}") { fields { name type { name kind ofType { name kind ofType { name } } } } } }`)).slice(0, 3000)}`
      )
  })
  for (const q of [
    '{ storyChapters { id name normalizedName wikiLink } }',
    '{ storyChapters(lang: en) { id name } }'
  ])
    await step('gql-story', async () =>
      console.log(`[gql-story] ${q} => ${JSON.stringify(await gql(q)).slice(0, 4000)}`)
    )
  for (const file of [
    'storyChapters',
    'storyChapters_en',
    'story_chapters',
    'story',
    'storylines',
    'achievements'
  ])
    await step('json', async () => {
      const d = (await fetchJsonData<unknown>(fetch, 'pvp', file)) as unknown
      console.log(`[json ${file}] ${JSON.stringify(d).slice(0, 3000)}`)
    })
  await step('tasks_en', async () => {
    const [tasks, lang] = await Promise.all([
      fetchJsonData<Raw>(fetch, 'pvp', 'tasks'),
      fetchJsonData<Record<string, string>>(fetch, 'pvp', 'tasks_en')
    ])
    const known = new Set(
      values((tasks as Raw).tasks as Raw[] | Record<string, Raw>).map((t) => String(t.id))
    )
    const other = Object.entries(lang).filter(([k]) => / name$/.test(k) && !known.has(k.split(' ')[0]))
    console.log(`[tasks_en] ${other.length} other names: ${JSON.stringify(other)}`)
    for (const [k] of other.slice(0, 40)) {
      const id = k.split(' ')[0]
      const related = Object.entries(lang).filter(([key]) => key.startsWith(id) && key !== k)
      console.log(`[tasks_en ${id}] ${JSON.stringify(related).slice(0, 1500)}`)
    }
    // How a normal give-item quest looks, for objective progress (Bad Habit).
    const badHabit = values((tasks as Raw).tasks as Raw[] | Record<string, Raw>).find(
      (t) => lang[`${t.id} name`] === 'Bad Habit'
    )
    console.log(`[bad habit] ${JSON.stringify(badHabit).slice(0, 2500)}`)
    console.log(`[tasks keys] ${JSON.stringify(Object.keys(tasks as Raw))}`)
  })
  const wiki = async (params: Record<string, string>): Promise<unknown> => {
    const url = `https://escapefromtarkov.fandom.com/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
    return (await fetch(url, { headers: { 'User-Agent': 'TarkovLootOptimiser/1.10 (probe)' } })).json()
  }
  await step('wiki-search', async () => {
    for (const s of ['main story chapter', 'Falling Skies', 'storyline quests'])
      console.log(
        `[wiki-search ${s}] ${JSON.stringify(await wiki({ action: 'query', list: 'search', srsearch: s, srlimit: '10' })).slice(0, 1500)}`
      )
  })
  for (const page of ['Story', 'Storyline', 'Main story', 'Tour', 'Falling Skies', 'Batya', 'Quests'])
    await step('wiki-page', async () => {
      const r = (await wiki({ action: 'parse', page, prop: 'wikitext', redirects: '1' })) as {
        parse?: { title?: string; wikitext?: string }
      }
      console.log(
        `[wiki-page ${page}] ${r.parse?.title ?? 'missing'} :: ${(r.parse?.wikitext ?? JSON.stringify(r)).slice(0, page === 'Quests' ? 6000 : 5000)}`
      )
    })
}

main().catch((e) => console.log(`[probe] failed: ${errorMessage(e)}`))
