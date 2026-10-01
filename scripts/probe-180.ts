/**
 * Temporary probe for 1.8.0: the parsed hideout stations, as one JSON line. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData } from '../src/main/pricing/tarkovDevJson'
import { hideoutStations } from '../src/main/quests/questData'

type Raw = Record<string, unknown>

async function main(): Promise<void> {
  const [hideout, en] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'hideout'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'hideout_en')
  ])
  console.log(`[stations] ${JSON.stringify(hideoutStations(hideout, en))}`)
}

main().catch((err) => console.log(`[stations] FAILED ${errorMessage(err)}`))
