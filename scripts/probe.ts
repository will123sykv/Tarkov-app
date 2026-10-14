// Temporary probe (1.42.0): what tarkov.dev and the wiki say about each extract's requirements.
import { fetchJsonData } from '../src/main/pricing/tarkovDevJson'
import { wikiApi } from '../src/main/quests/questGuide'

type Raw = Record<string, unknown>
const fetchFn = (url: string, init?: RequestInit): Promise<Response> => fetch(url, init)

async function main(): Promise<void> {
  try {
    const data = await fetchJsonData<Raw>(fetchFn as never, 'pvp', 'maps')
    const maps = Object.values((data.maps ?? data) as Raw) as Raw[]
    console.log('== tarkov.dev maps data keys', Object.keys(data).join(','), 'maps', maps.length)
    console.log('map keys', Object.keys(maps[0] ?? {}).join(','))
    const exKeys = new Map<string, number>()
    for (const m of maps)
      for (const e of (m.extracts as Raw[]) ?? [])
        for (const k of Object.keys(e)) exKeys.set(k, (exKeys.get(k) ?? 0) + 1)
    console.log('extract keys', JSON.stringify([...exKeys]))
    const inter = maps.find((m) => String(m.normalizedName) === 'interchange') ?? maps[0]
    console.log('interchange extracts', JSON.stringify(inter.extracts).slice(0, 3000))
    console.log('interchange switches', JSON.stringify(inter.switches).slice(0, 3000))
    for (const m of maps) {
      const sw = (m.switches as Raw[]) ?? []
      if (sw.length)
        console.log(
          `switches on ${String(m.normalizedName)}: ${sw.length}`,
          JSON.stringify(sw[0]).slice(0, 600)
        )
    }
  } catch (e) {
    console.log('tarkov.dev maps failed', e)
  }
  for (const title of [
    'Customs',
    'Woods',
    'Interchange',
    'Reserve',
    'Lighthouse',
    'Streets of Tarkov',
    'Factory',
    'Shoreline'
  ]) {
    try {
      const body = await wikiApi(fetchFn as never, {
        action: 'parse',
        page: title,
        prop: 'wikitext|sections'
      })
      const parse = body.parse as Raw
      const lines = String(parse.wikitext ?? '').split('\n')
      console.log(
        `== wiki ${title}: ${lines.length} lines; sections`,
        JSON.stringify(((parse.sections as Raw[]) ?? []).map((s) => s.line))
      )
      const at = lines.findIndex((l) => /^=+\s*(Extraction|Extracts|Exfil)/i.test(l))
      console.log(lines.slice(at, at + (title === 'Customs' || title === 'Interchange' ? 90 : 30)).join('\n'))
    } catch (e) {
      console.log(`wiki ${title} failed`, e)
    }
  }
}
void main()
