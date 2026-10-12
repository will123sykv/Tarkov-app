// Temporary probe (1.41.0): does tarkov.dev or the wiki say which objectives a squad shares?
import { fetchJsonData } from '../src/main/pricing/tarkovDevJson'
import { wikiApi } from '../src/main/quests/questGuide'

type Raw = Record<string, unknown>
const fetchFn = (url: string, init?: RequestInit): Promise<Response> => fetch(url, init)
const LOOK = /shar|group|squad|team|coop|co-op|party|mates?\b/i

async function main(): Promise<void> {
  for (const mode of ['regular', 'pve'] as const) {
    try {
      const data = await fetchJsonData<Raw>(fetchFn as never, mode === 'regular' ? 'pvp' : 'pve', 'tasks')
      const tasks = Object.values((data.tasks ?? data) as Raw) as Raw[]
      const taskKeys = new Map<string, number>()
      const objKeys = new Map<string, number>()
      const hits: string[] = []
      for (const t of tasks) {
        for (const k of Object.keys(t ?? {})) taskKeys.set(k, (taskKeys.get(k) ?? 0) + 1)
        for (const o of (t?.objectives as Raw[]) ?? []) {
          for (const [k, v] of Object.entries(o)) {
            objKeys.set(k, (objKeys.get(k) ?? 0) + 1)
            if (LOOK.test(k) && hits.length < 30) hits.push(`${String(t.name)} :: ${k}=${JSON.stringify(v)}`)
          }
        }
      }
      console.log(`== tarkov.dev ${mode}: ${tasks.length} tasks; data keys ${Object.keys(data).join(',')}`)
      console.log('task keys', JSON.stringify([...taskKeys]))
      console.log('objective keys', JSON.stringify([...objKeys]))
      console.log('suspicious objective keys', hits.length ? hits.join('\n') : 'none')
      const sample = tasks.find((t) => String(t.name) === 'Shootout Picnic') ?? tasks[0]
      console.log('sample', JSON.stringify(sample).slice(0, 2500))
    } catch (e) {
      console.log(`tarkov.dev ${mode} failed`, e)
    }
  }
  for (const title of [
    'Shootout Picnic',
    'Debut',
    'Supply Plans',
    'Checking',
    'The Punisher - Part 1',
    'Bunker - Part 1'
  ]) {
    try {
      const body = await wikiApi(fetchFn as never, {
        action: 'parse',
        page: title,
        prop: 'wikitext|templates|images'
      })
      const parse = body.parse as Raw
      const text = String(parse.wikitext ?? '')
      console.log(`== wiki ${title}: ${text.length} chars`)
      console.log('templates', JSON.stringify(((parse.templates as Raw[]) ?? []).map((t) => t.title)))
      console.log('images', JSON.stringify(parse.images))
      const lines = text.split('\n')
      const start = lines.findIndex((l) => /==\s*Objectives\s*==/i.test(l))
      console.log('objectives section:\n' + lines.slice(Math.max(0, start), start + 14).join('\n'))
      console.log(
        'suspicious lines:\n' +
          lines
            .filter((l) => LOOK.test(l))
            .slice(0, 12)
            .join('\n')
      )
    } catch (e) {
      console.log(`wiki ${title} failed`, e)
    }
  }
  // Pages the wiki may have about the 1.1.0 change.
  for (const search of ['shared progress', 'group progress task', 'squad tasks']) {
    try {
      const body = await wikiApi(fetchFn as never, {
        action: 'query',
        list: 'search',
        srsearch: search,
        srlimit: '8'
      })
      console.log(
        `== wiki search "${search}":`,
        JSON.stringify(((body.query as Raw).search as Raw[]).map((s) => [s.title, s.snippet]))
      )
    } catch (e) {
      console.log(`wiki search ${search} failed`, e)
    }
  }
}
void main()
