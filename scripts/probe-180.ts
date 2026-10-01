/**
 * Temporary probe for 1.8.0: the shape of tarkov.dev's hideout stations and their requirements, and
 * how scarce the items they need are on the flea. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, fetchTarkovDevJson, values } from '../src/main/pricing/tarkovDevJson'

type Raw = Record<string, unknown>

async function main(): Promise<void> {
  const [hideout, en] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'hideout'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'hideout_en')
  ])
  const stations = values(hideout as Record<string, Raw>)
  console.log(`[hideout] ${stations.length} stations, keys ${JSON.stringify(Object.keys(stations[0] ?? {}))}`)
  const lavatory = stations.find((s) => s.normalizedName === 'lavatory') ?? stations[0]
  console.log(`[hideout] lavatory ${JSON.stringify(lavatory).slice(0, 300)}`)
  const keys = {
    level: new Set<string>(),
    item: new Set<string>(),
    station: new Set<string>(),
    trader: new Set<string>(),
    skill: new Set<string>()
  }
  const attributes = new Map<string, number>()
  for (const s of stations)
    for (const l of (s.levels ?? []) as Raw[]) {
      Object.keys(l).forEach((k) => keys.level.add(k))
      for (const r of (l.itemRequirements ?? []) as Raw[]) {
        Object.keys(r).forEach((k) => keys.item.add(k))
        const key = JSON.stringify(r.attributes)
        attributes.set(key, (attributes.get(key) ?? 0) + 1)
      }
      for (const r of (l.stationLevelRequirements ?? []) as Raw[])
        Object.keys(r).forEach((k) => keys.station.add(k))
      for (const r of (l.traderRequirements ?? []) as Raw[]) Object.keys(r).forEach((k) => keys.trader.add(k))
      for (const r of (l.skillRequirements ?? []) as Raw[]) Object.keys(r).forEach((k) => keys.skill.add(k))
    }
  console.log(
    '[hideout] keys',
    JSON.stringify(Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, [...v]])))
  )
  console.log('[hideout] item attributes', JSON.stringify([...attributes.entries()].slice(0, 12)))
  const sample = stations
    .flatMap((s) =>
      (s.levels as Raw[]).flatMap((l) => [
        ...((l.skillRequirements ?? []) as Raw[]),
        ...((l.traderRequirements ?? []) as Raw[])
      ])
    )
    .slice(0, 4)
  console.log('[hideout] skill/trader samples', JSON.stringify(sample))
  console.log(
    '[hideout] names',
    JSON.stringify(
      stations.map((s) => [
        s.normalizedName,
        en[String(s.name)],
        (s.levels as Raw[]).length,
        s.imageLink ?? null
      ])
    )
  )
  const lang = Object.keys(en)
    .filter((k) => /skill|Skill/.test(k))
    .slice(0, 8)
  console.log('[hideout] lang keys', JSON.stringify(lang.map((k) => [k, en[k]])))

  const prices = await fetchTarkovDevJson(fetch, 'pvp')
  const byId = new Map(prices.items.map((i) => [i.id, i]))
  const needed = new Set(
    stations.flatMap((s) =>
      (s.levels as Raw[]).flatMap((l) => ((l.itemRequirements ?? []) as Raw[]).map((r) => String(r.item)))
    )
  )
  const rows = [...needed].map((id) => byId.get(id)).filter((i) => i !== undefined)
  const banned = rows.filter((i) => i.bannedOnFlea)
  const few = rows.filter((i) => !i.bannedOnFlea && (i.offerCount ?? 0) < 10)
  const pricey = rows.filter((i) => !i.bannedOnFlea && (i.fleaPrice ?? 0) >= 100_000)
  console.log(
    `[rare] ${needed.size} hideout items, ${rows.length} priced · ${banned.length} flea-banned · ${few.length} under 10 offers · ${pricey.length} at ₽100k or more`
  )
  console.log('[rare] banned', banned.map((i) => i.name).join(', '))
  console.log('[rare] few offers', few.map((i) => `${i.name} (${i.offerCount})`).join(', '))
  console.log(
    '[rare] pricey',
    pricey.map((i) => `${i.name} (${Math.round((i.fleaPrice ?? 0) / 1000)}k, ${i.offerCount})`).join(', ')
  )
  const offers = rows.map((i) => i.offerCount ?? 0).sort((a, b) => a - b)
  console.log(
    '[rare] offer count quartiles',
    [0.1, 0.25, 0.5, 0.75].map((q) => offers[Math.floor(q * offers.length)])
  )
}

main().catch((err) => console.log(`[hideout] FAILED ${errorMessage(err)}`))
