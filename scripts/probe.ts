// Temporary probe (1.45.0): Map Genie's Lab page, and the Lab's locks and the keys that open them.
import { fetchQuestData } from '../src/main/quests/questData'

const fetchFn = (url: string, init?: RequestInit): Promise<Response> => fetch(url, init)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

async function main(): Promise<void> {
  for (const url of ['https://mapgenie.io/tarkov/maps/lab', 'https://mapgenie.io/tarkov']) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'manual' })
      const body = await res.text()
      console.log('==', url, res.status)
      for (const h of ['location', 'x-frame-options', 'content-security-policy', 'server', 'cf-ray'])
        console.log(`  ${h}: ${res.headers.get(h)}`)
      console.log('  title:', /<title>([^<]*)/.exec(body)?.[1], 'bytes:', body.length)
      console.log(
        '  frame-ancestors:',
        /frame-ancestors[^;]*/.exec(res.headers.get('content-security-policy') ?? '')?.[0]
      )
    } catch (e) {
      console.log('==', url, 'failed', e)
    }
  }
  const gql = await fetch('https://api.tarkov.dev/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: '{ maps(lang: en) { normalizedName locks { lockType key { id name shortName } } } }'
    })
  }).then(
    (r) =>
      r.json() as Promise<{
        data: {
          maps: {
            normalizedName: string
            locks: { lockType: string; key: { id: string; name: string; shortName: string } | null }[]
          }[]
        }
      }>
  )
  const lab = gql.data.maps.find((m) => m.normalizedName === 'the-lab')
  console.log('== tarkov.dev Lab locks:', lab?.locks.length)
  const counts = new Map<string, number>()
  for (const l of lab?.locks ?? []) {
    const k = `${l.lockType} | ${l.key?.id} | ${l.key?.name} | ${l.key?.shortName}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  for (const [k, n] of [...counts].sort()) console.log(`  ${n}× ${k}`)
  const keycards = new Set<string>()
  for (const m of gql.data.maps)
    for (const l of m.locks ?? [])
      if (/keycard/i.test(l.key?.name ?? '')) keycards.add(`${m.normalizedName}: ${l.key?.name}`)
  console.log('== keycard locks on every map:', [...keycards].sort())
  const ds = await fetchQuestData(fetchFn as never, 'pvp', Date.now())
  const appLab = ds.maps.filter((m) => m.normalizedName === 'the-lab')
  console.log(
    '== app Lab maps:',
    appLab.map((m) => `${m.id} ${m.name} locks=${m.locks?.length}`)
  )
}

void main()
