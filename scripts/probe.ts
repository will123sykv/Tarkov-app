// Temporary: the wiki's corrections on the live data, counted by kind, with samples.
import { fetchQuestData } from '../src/main/quests/questData'
import { applyWikiCorrections } from '../src/shared/wikiCorrections'

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    const started = Date.now()
    const data = await fetchQuestData(fetch, mode, Date.now())
    console.log(
      `\n== ${mode}: ${data.quests.length} quests, wiki pages for ${Object.keys(data.wikiFacts).length} (${Date.now() - started} ms, cache ${Math.round(JSON.stringify(data.wikiFacts).length / 1024)} KB)`
    )
    const questIds = new Map(
      data.quests.flatMap((q) => {
        const name = q.name.toLowerCase()
        return [[name, q.id] as const, [name.replace(/\s*\[(pvp|pve) zone\]$/, ''), q.id] as const]
      })
    )
    const fixed = applyWikiCorrections(data.quests, data.wikiFacts, {
      gameMode: mode,
      questIds,
      mapNames: new Map(data.maps.map((m) => [m.id, m.name])),
      itemIds: new Map(),
      traderIds: new Map()
    })
    const kinds = new Map<string, string[]>()
    const add = (kind: string, line: string): void => {
      kinds.set(kind, [...(kinds.get(kind) ?? []), line])
    }
    for (const q of fixed) {
      for (const c of q.corrections?.changes ?? []) {
        const kind = /^Level/.test(c)
          ? 'level'
          : /Kappa/.test(c)
            ? 'kappa'
            : /^Unlocks after/.test(c)
              ? 'previous'
              : /^Added:/.test(c)
                ? 'added step'
                : 'count'
        add(kind, `${q.name}: ${c}`)
      }
      for (const n of q.corrections?.notes ?? [])
        add(/^The wiki also lists/.test(n) ? 'map note' : 'condition', `${q.name}: ${n}`)
    }
    console.log(`quests corrected: ${fixed.filter((q) => q.corrections).length}`)
    console.log(
      `kappa: tarkov.dev ${data.quests.filter((q) => q.kappaRequired).length} · corrected ${fixed.filter((q) => q.kappaRequired).length}`
    )
    for (const [kind, lines] of kinds) {
      console.log(`\n### ${kind}: ${lines.length}`)
      for (const l of lines.slice(0, 15)) console.log(`  - ${l}`)
    }
    for (const name of ['Dandies', 'Vacate the Premises', 'Slaughterhouse', 'The Tarkov Shooter - Part 4']) {
      const q = fixed.find((x) => x.name === name)
      if (q)
        console.log(
          `\nSAMPLE ${name}:`,
          JSON.stringify({
            level: q.minPlayerLevel,
            corrections: q.corrections,
            objectives: q.objectives.map((o) => `${o.id.slice(0, 12)} ${o.description} x${o.count}`)
          })
        )
    }
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
