// Temporary: which maps tarkov.dev lists, and the quest objectives on unusual ones.
const q = async (query) => {
  const res = await fetch('https://api.tarkov.dev/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query })
  })
  return (await res.json()).data
}
for (const mode of ['regular', 'pve']) {
  const d = await q(`{ maps(gameMode: ${mode}) { id name normalizedName nameId enemies minPlayerLevel maxPlayerLevel } tasks(gameMode: ${mode}) { id name map { id name } objectives { id type description maps { id name } ... on TaskObjectiveBasic { zones { map { id } } } ... on TaskObjectiveQuestItem { possibleLocations { map { id } } } } } }`)
  console.log(`== ${mode}: ${d.maps.length} maps`)
  for (const m of d.maps) console.log(JSON.stringify(m))
  const odd = new Set(d.maps.filter((m) => /tutorial|start/i.test(`${m.name} ${m.normalizedName} ${m.nameId}`)).map((m) => m.id))
  for (const t of d.tasks) {
    if (t.map && odd.has(t.map.id)) console.log('TASK MAP', t.name, t.map.name)
    for (const o of t.objectives) {
      const ids = [...(o.maps ?? []).map((m) => m.id), ...(o.zones ?? []).map((z) => z.map?.id), ...(o.possibleLocations ?? []).map((l) => l.map?.id)]
      if (ids.some((id) => odd.has(id))) console.log('OBJ', t.name, '|', o.type, '|', o.description, '|', JSON.stringify(o.maps))
    }
  }
}
