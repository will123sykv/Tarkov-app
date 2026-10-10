// Temporary: how many guide pictures of quests on several maps can be put to a map.
import { fetchQuestGuide, wikiTitle } from '../src/main/quests/questGuide'
import { fetchQuestData } from '../src/main/quests/questData'
import { imageMaps, mapAliases, type MapNames } from '../src/shared/guideMaps'
import { objectiveMapIds } from '../src/shared/todo'

async function main(): Promise<void> {
  const data = await fetchQuestData(fetch, 'pvp', Date.now())
  const byName = new Map<string, MapNames>()
  for (const m of data.maps) {
    const name = m.name.replace(/^Night\s+/i, '').replace(/\s*21\+$/, '')
    const entry = byName.get(name) ?? { key: name, names: mapAliases(name) }
    byName.set(name, entry)
  }
  const maps = [...byName.values()]
  const nameOf = new Map(
    data.maps.map((m) => [m.id, m.name.replace(/^Night\s+/i, '').replace(/\s*21\+$/, '')])
  )
  const multi = data.quests
    .map((q) => ({
      q,
      maps: new Set(q.objectives.flatMap((o) => objectiveMapIds(o)).map((id) => nameOf.get(id)))
    }))
    .filter((x) => x.maps.size >= 3)
    .slice(0, 16)
  const pages = [
    ...multi.map((x) => ({ name: x.q.name, title: wikiTitle(x.q.wikiLink) ?? x.q.name, maps: [...x.maps] })),
    ...['Tour', 'Falling Skies', 'The Ticket'].map((t) => ({
      name: t,
      title: t,
      maps: [] as (string | undefined)[]
    }))
  ]
  let total = 0
  let matched = 0
  for (const p of pages) {
    try {
      const guide = await fetchQuestGuide(fetch, p.title, Date.now())
      const rows = guide.images.map((i) => ({ i, at: imageMaps(i, maps) }))
      total += rows.length
      matched += rows.filter((r) => r.at.length).length
      const counts = new Map<string, number>()
      for (const r of rows) for (const k of r.at) counts.set(k, (counts.get(k) ?? 0) + 1)
      console.log(
        `\n## ${p.name} (objectives on ${p.maps.join(', ')}): ${rows.length} pictures, ${rows.filter((r) => r.at.length).length} put to a map: ${[...counts].map(([k, n]) => `${k} ${n}`).join(', ')}`
      )
      for (const r of rows.slice(0, 14))
        console.log(
          `  [${r.at.join('/') || '-'}] h="${r.i.heading}" c="${r.i.caption.slice(0, 70)}" f="${r.i.file.slice(0, 50)}"`
        )
    } catch (e) {
      console.log(`\n## ${p.name}: ${String(e)}`)
    }
  }
  console.log(`\nTOTAL ${matched}/${total} pictures put to a map`)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
