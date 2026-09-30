/**
 * Temporary probe for 1.5.0: why liquid items have no usable 24h swing. Informational.
 */
import { fleaAccess } from '../src/shared/valuation'
import type { DataMode } from '../src/shared/types'
import { errorMessage } from '../src/main/pricing/http'
import { fetchTarkovDevJson } from '../src/main/pricing/tarkovDevJson'

const log = (section: string, ...parts: unknown[]): void =>
  console.log(`[${section}]`, ...parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))))

async function section(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (err) {
    log(name, `FAILED: ${errorMessage(err)}`)
  }
}

function count<T>(list: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of list) out[key(t)] = (out[key(t)] ?? 0) + 1
  return out
}

async function probeSwing(dataMode: DataMode): Promise<void> {
  const S = `swing ${dataMode}`
  const dataset = await fetchTarkovDevJson(fetch, dataMode, Date.now())
  const base = dataset.items.filter((i) => !i.bannedOnFlea && !i.types.includes('preset'))
  for (const [offers, price, level] of [
    [25, 10_000, 62],
    [25, 10_000, 30],
    [25, 10_000, 15],
    [50, 20_000, 62]
  ]) {
    const pool = base.filter(
      (i) =>
        (i.offerCount ?? 0) >= offers &&
        (i.fleaPrice ?? 0) >= price &&
        fleaAccess(i, level, dataset.fleaMinLevel).status === 'sellable'
    )
    const reasons = count(pool, (i) => {
      const low = i.low24hPrice ?? null
      const high = i.high24hPrice ?? null
      const p = i.fleaPrice ?? null
      if (!low || !high || !p) return 'missing'
      if (high < low) return 'high<low'
      if (high > p * 1.5) return 'high>1.5p'
      if (low < p / 1.5) return 'low<p/1.5'
      return 'ok'
    })
    const ratio = (i: (typeof pool)[number]): number =>
      i.low24hPrice && i.high24hPrice ? (i.high24hPrice - i.low24hPrice) / i.low24hPrice : -1
    const buckets = count(pool, (i) => {
      const r = ratio(i)
      return r < 0
        ? 'none'
        : r < 0.05
          ? '<5%'
          : r < 0.15
            ? '5-15%'
            : r < 0.3
              ? '15-30%'
              : r < 0.6
                ? '30-60%'
                : r < 1
                  ? '60-100%'
                  : r < 3
                    ? '1-3x'
                    : '>3x'
    })
    // Swing with the outlier clamped to 1.5× / 2× / 3× the current price rather than dropped.
    const clamp = (f: number) => (i: (typeof pool)[number]) => {
      const p = i.fleaPrice!
      const low = Math.max(i.low24hPrice ?? 0, p / f)
      const high = Math.min(i.high24hPrice ?? 0, p * f)
      return i.low24hPrice && i.high24hPrice && high > low ? (high - low) / low : -1
    }
    const counts = (fn: (i: (typeof pool)[number]) => number) =>
      Object.fromEntries(
        [0.05, 0.1, 0.15, 0.2, 0.3].map((t) => [`${t * 100}%`, pool.filter((i) => fn(i) >= t).length])
      )
    log(S, `offers≥${offers} price≥${price} level ${level}: ${pool.length}`, reasons, buckets)
    log(S, '  clamped 1.5x', counts(clamp(1.5)), '2x', counts(clamp(2)), '3x', counts(clamp(3)))
    log(
      S,
      '  samples',
      pool
        .filter((i) => ratio(i) >= 0.5)
        .slice(0, 8)
        .map(
          (i) =>
            `${i.name}: now ${i.fleaPrice} low ${i.low24hPrice} high ${i.high24hPrice} offers ${i.offerCount}`
        )
    )
  }
}

async function main(): Promise<void> {
  for (const mode of ['pvp', 'pve'] as const) await section(`swing ${mode}`, () => probeSwing(mode))
}

void main()
