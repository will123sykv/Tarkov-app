// Temporary: the quests only the wiki has on the live data, and which are the seasonal mode's.
import { fetchQuestData } from '../src/main/quests/questData'
import { gameQuestIds } from '../src/shared/wikiQuests'

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    const data = await fetchQuestData(fetch, mode, Date.now())
    const ids = gameQuestIds(data.otherQuestNames)
    const only = data.wikiOnlyQuests
    const season = only.filter((q) => q.season)
    console.log(`\n== ${mode}: ${only.length} wiki-only, ${season.length} seasonal`)
    console.log(`  seasonal: ${season.map((q) => q.title).join(' · ')}`)
    console.log(
      `  everywhere: ${only
        .filter((q) => !q.season)
        .map((q) => q.title)
        .join(' · ')}`
    )
    console.log(
      `  with game ids: ${only
        .filter((q) => ids.has(q.name.toLowerCase()))
        .map((q) => q.title)
        .join(' · ')}`
    )
    console.log(
      `  traders: ${[...new Set(only.map((q) => q.trader))].join(', ')} · tarkov.dev's: ${data.traders.map((t) => t.name).join(', ')}`
    )
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
