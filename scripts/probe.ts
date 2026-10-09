// Temporary: the quests only the wiki has, on the live data, and two of their pages for test fixtures.
import { fetchQuestData } from '../src/main/quests/questData'
import { wikiApi } from '../src/main/quests/questGuide'

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    const started = Date.now()
    const data = await fetchQuestData(fetch, mode, Date.now())
    const names = new Map<string, string[]>()
    for (const [id, name] of Object.entries(data.otherQuestNames))
      names.set(name.toLowerCase(), [...(names.get(name.toLowerCase()) ?? []), id])
    const only = data.wikiOnlyQuests
    console.log(`\n== ${mode}: ${only.length} wiki-only quests (${Date.now() - started} ms total)`)
    let matched = 0
    for (const q of only) {
      const ids = names.get(q.name.toLowerCase()) ?? []
      if (ids.length === 1) matched++
      console.log(
        `  ${q.title} | name ${q.name} | ${q.trader} | lvl ${q.level} | ${q.previousMode} ${JSON.stringify(q.previous)} | maps ${q.maps.length} | steps ${q.objectives.length} | ids ${ids.join(',') || '-'}`
      )
    }
    console.log(`matched to one game id: ${matched}/${only.length}`)
    const unmatched = Object.values(data.otherQuestNames).filter(
      (n) => !only.some((q) => q.name.toLowerCase() === n.toLowerCase())
    )
    console.log(
      `other game quest names not matched (${unmatched.length}): ${unmatched.slice(0, 80).join(' · ')}`
    )
  }
  for (const page of ['Make Amends - Buyout', 'Uninvited Guests - Part 1']) {
    const body = await wikiApi(fetch, { action: 'parse', page, prop: 'wikitext', redirects: '1' })
    const text = String((body.parse as Record<string, unknown>).wikitext)
    console.log(`\n@@@BEGIN ${page}\n${text}\n@@@END ${page}`)
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
