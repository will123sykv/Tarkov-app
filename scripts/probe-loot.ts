// Temporary: what tarkov.dev's maps say about loose loot and loot containers (removed after use).
import { fetchJsonData, values } from '../src/main/pricing/tarkovDevJson'

type Raw = Record<string, unknown>
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])

async function main(): Promise<void> {
  const data = await fetchJsonData<unknown>(fetch as never, 'pvp', 'maps')
  const raw = data as Raw
  const maps = (Array.isArray(raw) ? raw : values((raw.maps ?? raw) as never)) as Raw[]
  let shown = false
  const names = new Map<string, number>()
  for (const map of maps) {
    const containers = arr(map.lootContainers)
    const loose = arr(map.lootLoose)
    const items = loose.reduce((n, s) => n + arr(s.items).length, 0)
    const distinct = new Set(
      loose.flatMap((s) => (Array.isArray(s.items) ? (s.items as unknown[]) : []).map(String))
    )
    console.log(
      `MAP ${map.normalizedName} nameId=${map.nameId} containers=${containers.length} loose=${loose.length} looseItems=${items} distinct=${distinct.size} bytes=${JSON.stringify(loose).length}`
    )
    if (!shown && containers.length && loose.length) {
      console.log('CONTAINER', JSON.stringify(containers[0]).slice(0, 800))
      console.log('LOOSE', JSON.stringify(loose[0]).slice(0, 800))
      shown = true
    }
    for (const c of containers) {
      const lc = (c.lootContainer ?? {}) as Raw
      const key = `${String(lc.id ?? '?')} | ${String(lc.name ?? lc.normalizedName ?? JSON.stringify(c).slice(0, 80))}`
      names.set(key, (names.get(key) ?? 0) + 1)
    }
  }
  for (const [key, n] of [...names].sort((a, b) => b[1] - a[1])) console.log('CTYPE', n, key)
}

void main().catch((e) => console.log('failed', e))
