/**
 * Temporary probe for 1.8.1: what tarkov.dev's items say traders sell (buyFromTrader). Informational.
 */
import { errorMessage } from '../src/main/pricing/http'
import { fetchJsonData, values } from '../src/main/pricing/tarkovDevJson'
import { hideoutStations } from '../src/main/quests/questData'

type Raw = Record<string, unknown>

async function main(): Promise<void> {
  const [data, hideout, hideoutEn] = await Promise.all([
    fetchJsonData<Raw>(fetch, 'pvp', 'items'),
    fetchJsonData<Raw>(fetch, 'pvp', 'hideout'),
    fetchJsonData<Record<string, string>>(fetch, 'pvp', 'hideout_en')
  ])
  const items = values(data.items as Raw[] | Record<string, Raw>)
  const offers = items.flatMap((i) => ((i.buyFromTrader ?? []) as Raw[]).map((o) => ({ item: i, o })))
  const keys = new Map<string, number>()
  for (const { o } of offers) for (const k of Object.keys(o)) keys.set(k, (keys.get(k) ?? 0) + 1)
  console.log(
    `[buy] ${items.filter((i) => ((i.buyFromTrader ?? []) as Raw[]).length).length} items with offers, ${offers.length} offers, keys ${JSON.stringify(Object.fromEntries(keys))}`
  )
  for (const name of [
    'LEDX Skin Transilluminator',
    'Bolts',
    'Salewa first aid kit',
    'Pack of screws',
    'Graphics card'
  ]) {
    const it = items.find((i) => i.normalizedName === name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    console.log(`[buy] ${name}: ${JSON.stringify(it?.buyFromTrader ?? 'not found').slice(0, 800)}`)
  }
  const odd = offers.filter(({ o }) =>
    Object.entries(o).some(
      ([k, v]) =>
        /task|quest|unlock|limit|barter|require/i.test(k) &&
        v != null &&
        v !== 0 &&
        !(Array.isArray(v) && !v.length)
    )
  )
  console.log(
    `[buy] ${odd.length} offers with unlock/limit fields; samples ${JSON.stringify(odd.slice(0, 4).map(({ item, o }) => [item.normalizedName, o]))}`
  )
  const currencies = new Map<string, number>()
  for (const { o } of offers)
    currencies.set(
      String(o.currency ?? o.currencyItem ?? '?'),
      (currencies.get(String(o.currency ?? o.currencyItem ?? '?')) ?? 0) + 1
    )
  console.log(`[buy] currencies ${JSON.stringify(Object.fromEntries(currencies))}`)
  const stations = hideoutStations(hideout, hideoutEn)
  const needed = new Set(stations.flatMap((s) => s.levels.flatMap((l) => l.items.map((i) => i.itemId))))
  const sold = items.filter((i) => needed.has(String(i.id)) && ((i.buyFromTrader ?? []) as Raw[]).length)
  console.log(
    `[buy] ${sold.length} of ${needed.size} hideout items sold by traders: ${sold.map((i) => i.normalizedName).join(', ')}`
  )
  console.log(`[buy] hideout offers ${JSON.stringify(sold.map((i) => [i.id, i.buyFromTrader]))}`)
}

main().catch((err) => console.log(`[buy] FAILED ${errorMessage(err)}`))
