import { describe, expect, it } from 'vitest'
import { craftingPlan, upgradableNow, type StationPlan } from '../src/shared/crafting'
import type { BuyContext, CraftContext, HideoutNeed, HideoutProgress } from '../src/shared/hideout'
import type { HideoutCraft, HideoutStation } from '../src/shared/questTypes'
import type { LootItem } from '../src/shared/types'

const ROUBLES = '5449016a4bdc2d6f028b456f'
const HOUR = 3600

const item = (id: string, fleaPrice: number | null): LootItem => ({
  id,
  name: id,
  shortName: id,
  iconLink: null,
  wikiLink: null,
  width: 1,
  height: 1,
  slots: 1,
  types: [],
  category: null,
  bannedOnFlea: fleaPrice === null,
  minLevelForFlea: null,
  fleaPrice,
  fleaFee: null,
  bestTrader: null,
  offerCount: 50,
  buyFrom: []
})
const items = new Map(
  (
    [
      ['bolts', 10_000],
      ['screws', 5_000],
      ['wire', 2_000],
      ['gpu', 300_000],
      ['ledx', null],
      ['salewa', 20_000]
    ] as const
  ).map(([id, price]) => [id, item(id, price)])
)
// What a craft's output sells for, for profit.
const worth = (i: LootItem): number => ({ gpu: 400_000, salewa: 25_000 })[i.id] ?? i.fleaPrice ?? 0

const station = (id: string, name: string, levels: number): HideoutStation => ({
  id,
  name,
  normalizedName: name.toLowerCase(),
  imageLink: null,
  levels: Array.from({ length: levels }, (_, i) => ({
    level: i + 1,
    constructionTime: 0,
    items: [],
    stations: [],
    traders: [],
    skills: []
  }))
})
const craft = (
  id: string,
  stationId: string,
  level: number,
  inputs: [string, number][],
  outputs: [string, number][],
  duration: number,
  questId: string | null = null
): HideoutCraft => ({
  id,
  stationId,
  level,
  duration,
  inputs: inputs.map(([itemId, count]) => ({ itemId, count })),
  tools: [],
  outputs: outputs.map(([itemId, count]) => ({ itemId, count })),
  questId
})
const need = (
  itemId: string,
  missing: number,
  firNeeded = 0,
  extra: Partial<HideoutNeed> = {}
): HideoutNeed => ({
  itemId,
  foundInRaid: firNeeded > 0,
  needed: missing,
  firNeeded,
  have: 0,
  missing,
  uses: [
    { stationId: 'med', stationName: 'Medstation', level: 1, count: missing, foundInRaid: firNeeded > 0 }
  ],
  quests: [],
  ...extra
})

const WORKBENCH = station('wb', 'Workbench', 3)
const LAB = station('lab', 'Intelligence Center', 2)
const LAV = station('lav', 'Lavatory', 2)
const STASH = station('stash', 'Stash', 4)
const ctx: BuyContext = { playerLevel: 30, fleaMinLevel: 15, traderLevels: {}, completedQuests: new Set() }
const crafts = [
  // Two bolts for four screws, an hour.
  craft('bolts', 'wb', 1, [['screws', 4]], [['bolts', 2]], HOUR),
  // A wire for a screw: quick.
  craft('wire', 'wb', 1, [['screws', 1]], [['wire', 1]], 600),
  // A LEDX nobody sells, from a GPU, at Workbench 3.
  craft('ledx', 'wb', 3, [['gpu', 1]], [['ledx', 1]], 2 * HOUR),
  // For profit: a GPU from screws, 3 hours; salewa from wire, 20 minutes.
  craft('gpu', 'lab', 1, [['screws', 10]], [['gpu', 1]], 3 * HOUR),
  craft('salewa', 'lab', 1, [['wire', 1]], [['salewa', 1]], 20 * 60),
  craft('quest-only', 'lav', 1, [['wire', 1]], [['salewa', 3]], HOUR, 'q1')
]
const progress = (levels: Record<string, number>): HideoutProgress => ({ levels, have: {}, traders: {} })
const cc = (levels: Record<string, number>): CraftContext => ({
  crafts,
  stations: new Map([
    ['wb', WORKBENCH],
    ['lab', LAB],
    ['lav', LAV],
    ['stash', STASH]
  ]),
  progress: progress(levels),
  items
})
const plan = (
  needs: HideoutNeed[],
  levels: Record<string, number> = { wb: 1, lab: 1, lav: 1 },
  minutes = 30,
  buy: BuyContext = ctx
): StationPlan[] => craftingPlan(needs, cc(levels), buy, worth, minutes * 60)
const at = (plans: StationPlan[], id: string): StationPlan => plans.find((p) => p.stationId === id)!

describe('what to craft at each station', () => {
  it('puts what upgrades and quests need first, found-in-raid ones before the rest', () => {
    const needs = [
      need('wire', 3),
      need('bolts', 3, 3, {
        quests: [{ questId: 'q', name: 'Shootout Picnic', count: 3, foundInRaid: true }]
      })
    ]
    const wb = at(plan(needs), 'wb')
    expect(wb.needed.map((n) => [n.itemId, n.fir, n.runs, n.time, n.cost])).toEqual([
      // Three bolts, all found in raid: two runs of an hour, eight screws.
      ['bolts', 3, 2, 2 * HOUR, 8 * 5_000],
      ['wire', 0, 3, 3 * 600, 3 * 5_000]
    ])
    expect(wb.needed[0].forWhat).toEqual(['Medstation 1', 'Shootout Picnic'])
    expect(wb.next).toMatchObject({ kind: 'needed', craft: { itemId: 'bolts' } })
  })

  it('compares crafting with buying what needn’t be found in raid', () => {
    const [wire] = at(plan([need('wire', 2)]), 'wb').needed
    // Two wires bought: 4,000; crafted: two screws, 10,000.
    expect([wire.buyPrice, wire.saving]).toEqual([4_000, -6_000])
    // Found in raid: nothing to buy, nothing to compare.
    const [bolts] = at(plan([need('bolts', 2, 2)]), 'wb').needed
    expect([bolts.buyPrice, bolts.saving]).toEqual([null, null])
    // Some found in raid: only the others are compared (half the crafting cost).
    const [half] = at(plan([need('bolts', 2, 1)]), 'wb').needed
    expect([half.buyPrice, half.saving]).toEqual([10_000, 10_000 - 20_000 / 2])
  })

  it('leaves out crafts that can’t be made now, needs met and money', () => {
    const needs = [need('ledx', 1, 1), need(ROUBLES, 50_000), need('screws', 0)]
    expect(at(plan(needs), 'wb').needed).toEqual([])
    // With Workbench 3, the LEDX can be crafted.
    expect(at(plan(needs, { wb: 3, lab: 1 }), 'wb').needed.map((n) => n.itemId)).toEqual(['ledx'])
  })

  it('picks the best profit per hour at least the minimum time long, when nothing’s needed', () => {
    const lab = at(plan([]), 'lab')
    // The GPU: 400,000 for 50,000 over 3 hours; the salewa's 20 minutes are under 30.
    expect(lab.profit.map((p) => [p.craft.id, p.perHour])).toEqual([['gpu', (350_000 * HOUR) / (3 * HOUR)]])
    expect(lab.next).toMatchObject({ kind: 'profit', craft: { craft: { id: 'gpu' } } })
    // With no minimum, the salewa (23,000 every 20 minutes) shows too, below the GPU.
    expect(at(plan([], undefined, 0), 'lab').profit.map((p) => p.craft.id)).toEqual(['gpu', 'salewa'])
    // Over 3 hours: nothing for profit.
    expect(at(plan([], undefined, 240), 'lab').next).toBeNull()
    // A craft behind a quest not done isn't picked.
    expect(at(plan([]), 'lav').profit).toEqual([])
  })

  it('lists only stations built that craft something, the ones with most to make first', () => {
    const plans = plan([need('wire', 1), need('bolts', 1)], { wb: 1, lab: 1, lav: 0, stash: 1 })
    expect(plans.map((p) => p.stationId)).toEqual(['wb', 'lab'])
  })

  it('finds the upgrades you can work on now: other stations built and loyalty met', () => {
    const gen = station('gen', 'Generator', 3)
    // Generator 2 needs Workbench 2 and Mechanic LL2; Generator 1 needs nothing.
    gen.levels[1] = {
      ...gen.levels[1],
      stations: [{ stationId: 'wb', level: 2 }],
      traders: [{ traderId: 'mechanic', level: 2 }]
    }
    const all = [WORKBENCH, gen]
    const ids = (levels: Record<string, number>, traders: Record<string, number> = {}): string[] =>
      upgradableNow(all, progress(levels), traders).map((s) => s.id)
    expect(ids({ wb: 1, gen: 0 })).toEqual(['wb', 'gen'])
    expect(ids({ wb: 1, gen: 1 })).toEqual(['wb'])
    expect(ids({ wb: 2, gen: 1 }, { mechanic: 2 })).toEqual(['wb', 'gen'])
    // Built all the way: nothing left to upgrade.
    expect(ids({ wb: 3, gen: 1 }, { mechanic: 1 })).toEqual([])
  })
})
