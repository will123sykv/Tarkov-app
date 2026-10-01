/**
 * Temporary probe for 1.8.0: the parsed hideout stations, as one JSON line. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, fetchTarkovDevJson } from '../src/main/pricing/tarkovDevJson'
import { hideoutStations } from '../src/main/quests/questData'

type Raw = Record<string, unknown>

async function main(): Promise<void> {
  const [hideout, en] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'hideout'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'hideout_en')
  ])
  const stations = hideoutStations(hideout, en)
  console.log(`[stations] ${JSON.stringify(stations)}`)
  const ids = new Set(stations.flatMap((s) => s.levels.flatMap((l) => l.items.map((i) => i.itemId))))
  const prices = await fetchTarkovDevJson(fetch, 'pvp')
  const rows = prices.items
    .filter((i) => ids.has(i.id))
    .map((i) => [i.id, i.name, i.fleaPrice, i.offerCount ?? null, i.bannedOnFlea, i.iconLink])
  console.log(`[prices] ${JSON.stringify(rows)}`)
}

main().catch((err) => console.log(`[stations] FAILED ${errorMessage(err)}`))
