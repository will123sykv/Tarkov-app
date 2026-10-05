import { canCraft, type BuyInfo, type CraftOption, type GetInfo } from '../../../shared/hideout'
import type { LootItem } from '../../../shared/types'
import { formatDuration, formatRub } from '../lib/format'

// How to get an item: buy it, or, when it must be found in raid (bought items never are), craft it in
// the hideout (crafted ones are) or find it.

type Items = ReadonlyMap<string, LootItem>

/** The cheapest way to buy one now, or what's in the way. */
export function BuyCell({ buy, note }: { buy: BuyInfo | null; note?: string }): React.JSX.Element {
  const best = buy?.options[0]
  if (best)
    return (
      <span
        className="get-line"
        title={buy.options.map((o) => `${o.label}: ${formatRub(o.price)}`).join('\n')}
      >
        {formatRub(best.price)}
        <small>
          {best.label}
          {note && ` · ${note}`}
        </small>
      </span>
    )
  if (buy?.locked.length)
    return (
      <span className="get-line muted locked-buy" title={`Opens up with: ${buy.locked.join(', ')}`}>
        Can&rsquo;t buy yet
        <small>{buy.locked[0]}</small>
      </span>
    )
  return <span className="get-line muted">—</span>
}

const names = (list: { itemId: string; count: number }[], items: Items): string =>
  list.map((i) => `${i.count} × ${items.get(i.itemId)?.name ?? 'an item'}`).join(', ')

/** One craft, for a tooltip: where, what it takes and uses up, and what that costs. */
export function craftText(o: CraftOption, items: Items): string {
  const where = [
    `${o.stationName} level ${o.craft.level}`,
    !o.stationReady && `(yours is ${o.stationLevel ? `level ${o.stationLevel}` : 'not built'})`,
    !o.questDone && `after ${o.questName}`
  ]
    .filter(Boolean)
    .join(' ')
  const tools = o.craft.tools.map((id) => items.get(id)?.name ?? 'a tool')
  return (
    `${where}: ${formatDuration(o.craft.duration)}` +
    (o.makes > 1 ? `, makes ${o.makes}` : '') +
    (o.craft.inputs.length ? `; uses ${names(o.craft.inputs, items)}` : '') +
    (tools.length ? ` (tools: ${tools.join(', ')})` : '') +
    (o.costEach !== null
      ? `; ≈ ${formatRub(o.costEach)} each to buy what it uses`
      : '; you can’t buy everything it uses yet')
  )
}

/**
 * The cheapest way to get one: the buy price for copies that needn't be found in raid; for the rest, a
 * craft you can do now (with what its inputs cost each), or finding it in raid.
 */
export function GetCell({ get, items }: { get: GetInfo; items: Items }): React.JSX.Element {
  if (!get.find) return <BuyCell buy={get.buy} />
  const best = get.crafts[0]
  const ready = best !== undefined && canCraft(best)
  const total = get.find + get.buyCount
  const title = [
    `${get.find === 1 ? 'It has' : `${get.find} have`} to be found in raid: bought items never are, ` +
      'crafted ones are.',
    ...(get.crafts.length ? ['Crafts:', ...get.crafts.map((o) => `• ${craftText(o, items)}`)] : [])
  ].join('\n')
  const count = get.buyCount ? `${get.find} ` : ''
  return (
    <>
      {get.buyCount > 0 && <BuyCell buy={get.buy} note={`for ${get.buyCount} of ${total}`} />}
      <span className={`get-line ${ready ? 'get-craft' : 'get-find'}`} title={title}>
        {ready
          ? `Craft ${count}${best.costEach !== null ? `≈ ${formatRub(best.costEach)}` : ''}`.trim()
          : `Find ${count}in raid`}
        <small>
          {ready
            ? `${best.stationName} ${best.craft.level} · ${formatDuration(best.craft.duration)}`
            : best
              ? `or craft at ${best.stationName} ${best.craft.level}${best.questDone ? '' : ', after a quest'}`
              : 'bought ones don’t count'}
        </small>
      </span>
    </>
  )
}
