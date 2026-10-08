// Temporary: the maps tarkov.dev lists, and the quest objectives on ones that aren't regular maps.
import { fetchQuestData } from '../src/main/quests/questData'
import { objectiveMapIds } from '../src/shared/todo'

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) {
    const data = await fetchQuestData(fetch, mode, Date.now())
    console.log(`== ${mode}: ${data.maps.length} maps`)
    for (const m of data.maps)
      console.log(
        JSON.stringify({ id: m.id, name: m.name, key: m.normalizedName, nameId: m.nameId, access: m.access }),
        `extracts ${m.extracts.length} spawns ${m.spawns.length} locks ${m.locks.length}`
      )
    const odd = new Set(
      data.maps
        .filter((m) => /tutorial|start/i.test(`${m.name} ${m.normalizedName} ${m.nameId}`))
        .map((m) => m.id)
    )
    for (const q of data.quests)
      for (const o of q.objectives) {
        const ids = objectiveMapIds(o)
        if (ids.some((id) => odd.has(id)))
          console.log(
            'OBJ',
            q.name,
            '|',
            o.type,
            '|',
            o.description,
            '|',
            ids.join(','),
            '| optional',
            o.optional
          )
      }
    for (const q of data.quests) if (q.map && odd.has(q.map)) console.log('QUEST MAP', q.name)
  }
}
void main()
