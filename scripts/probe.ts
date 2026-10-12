// Temporary probe (1.41.0): what the wiki says about objectives a group shares.
import { wikiApi } from '../src/main/quests/questGuide'

type Raw = Record<string, unknown>
const fetchFn = (url: string, init?: RequestInit): Promise<Response> => fetch(url, init)
const LOOK = /group|squad|teammate|shared|share |co-op|together|icon/i

async function main(): Promise<void> {
  for (const title of ['Changelog', 'Quests', 'Combat groups', 'Operational tasks']) {
    try {
      const body = await wikiApi(fetchFn as never, { action: 'parse', page: title, prop: 'wikitext' })
      const lines = String((body.parse as Raw).wikitext ?? '').split('\n')
      console.log(`== ${title}: ${lines.length} lines`)
      if (title === 'Changelog') {
        const at = lines.findIndex((l) => /Group-shared task progression/.test(l))
        console.log(lines.slice(at, at + 16).join('\n'))
      }
      lines.forEach((l, i) => {
        if (LOOK.test(l) && /task|quest|objective|progress/i.test(l)) console.log(`${i}: ${l.slice(0, 600)}`)
      })
    } catch (e) {
      console.log(`${title} failed`, e)
    }
  }
}
void main()
