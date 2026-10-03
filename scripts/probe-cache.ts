// Temporary CI probe (removed after use): does json.tarkov.dev let its files be cached, how often
// do the items file's prices change, and how varied is the last day of each item's price history?

const BASE = 'https://json.tarkov.dev'
const MODES = ['regular', 'pve'] as const
const ROUNDS = 4
const GAP_MS = 10 * 60_000
const HEADERS = [
  'cache-control',
  'age',
  'etag',
  'last-modified',
  'expires',
  'date',
  'cf-cache-status',
  'vary'
]

interface Item {
  id: string
  lastLowPrice?: number | null
  lastOfferCount?: number | null
  updated?: unknown
}

function headerLine(res: Response): string {
  return HEADERS.map((h) => `${h}=${res.headers.get(h) ?? '-'}`).join(' · ')
}

async function get(
  url: string
): Promise<{ res: Response; body: { data?: Record<string, unknown> } & Record<string, unknown> }> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const body = (await res.json()) as { data?: Record<string, unknown> } & Record<string, unknown>
  return { res, body }
}

function itemList(data: Record<string, unknown> | undefined): Item[] {
  const items = data?.items
  if (!items) return []
  return (Array.isArray(items) ? items : Object.values(items)) as Item[]
}

async function main(): Promise<void> {
  const prices = new Map<string, Map<string, number>[]>()
  let top: Record<string, string[]> = {}
  for (let round = 0; round < ROUNDS; round++) {
    if (round) await new Promise((r) => setTimeout(r, GAP_MS))
    for (const mode of MODES) {
      const { res, body } = await get(`${BASE}/${mode}/items`)
      const items = itemList(body.data)
      if (round === 0) {
        console.log(
          `[${mode}] top-level keys: ${Object.keys(body).join(', ')} · data keys: ${Object.keys(body.data ?? {}).join(', ')}`
        )
        const sample = items.find((i) => i.lastLowPrice)
        console.log(`[${mode}] item keys: ${Object.keys(sample ?? {}).join(', ')}`)
        if (sample?.updated !== undefined) console.log(`[${mode}] sample updated: ${String(sample.updated)}`)
        top[mode] = items
          .filter((i) => (i.lastLowPrice ?? 0) >= 10_000 && (i.lastOfferCount ?? 0) > 0)
          .sort((a, b) => (b.lastOfferCount ?? 0) - (a.lastOfferCount ?? 0))
          .slice(0, 300)
          .map((i) => i.id)
      }
      console.log(
        `[${mode}] round ${round + 1} ${new Date().toISOString()} HTTP ${res.status} · ${headerLine(res)}`
      )
      const byId = new Map(items.map((i) => [i.id, i.lastLowPrice ?? 0]))
      const snapshot = new Map(top[mode].map((id) => [id, byId.get(id) ?? 0]))
      const list = prices.get(mode) ?? []
      list.push(snapshot)
      prices.set(mode, list)
      if (list.length > 1) {
        const before = list[list.length - 2]
        const changed = top[mode].filter((id) => before.get(id) !== snapshot.get(id)).length
        console.log(
          `[${mode}]   ${changed} of ${top[mode].length} top items changed price since the last round`
        )
      }
    }
  }
  for (const mode of MODES) {
    const list = prices.get(mode)!
    const ever = top[mode].filter((id) => list.some((s) => s.get(id) !== list[0].get(id))).length
    console.log(
      `[${mode}] over ${ROUNDS} rounds (${((ROUNDS - 1) * GAP_MS) / 60_000} min): ${ever} of ${top[mode].length} items changed at least once`
    )
  }

  // The last day of price history for 20 of the most-listed items.
  const now = Date.now()
  for (const mode of MODES) {
    let shown = 0
    for (const id of top[mode].slice(0, 20)) {
      const { res, body } = await get(`${BASE}/${mode}/prices/${id}`)
      const points = (Array.isArray(body.data) ? body.data : []) as {
        timestamp?: number
        priceMin?: number
      }[]
      const day = points.filter((p) => Number(p.timestamp) >= now - 24 * 3_600_000)
      const distinct = new Set(day.map((p) => p.priceMin)).size
      const latest = Math.max(...points.map((p) => Number(p.timestamp) || 0))
      const mins = day.map((p) => p.priceMin ?? 0).filter((v) => v > 0)
      const current = prices.get(mode)!.at(-1)!.get(id)
      if (shown++ < 3) console.log(`[${mode} history] headers: ${headerLine(res)}`)
      console.log(
        `[${mode} history] ${id}: ${day.length} points in 24h, ${distinct} distinct, ` +
          `range ${Math.min(...mins)}–${Math.max(...mins)}, latest ${((now - latest) / 3_600_000).toFixed(1)} h ago, ` +
          `items file now ${current}`
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
