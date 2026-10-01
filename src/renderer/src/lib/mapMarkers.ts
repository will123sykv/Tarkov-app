import { mdiCar, mdiCrosshairsGps, mdiFlare, mdiHandshake, mdiRun, mdiScriptText, mdiSkull } from '@mdi/js'
import type { BossSpawn, MapExtract, MapLabel } from '../../../shared/questTypes'
import type { Anchor } from './posterMap'

// Pins in db4tarkov's style: a coloured name box over an icon tile, pointing at the spot.

export type ExtractKind = 'extract' | 'flare' | 'vehicle' | 'coop' | 'secret'
export type PinKind = ExtractKind | 'transit'

const ROUBLES = '5449016a4bdc2d6f028b456f'

/** Vehicle extracts cost roubles; secret ones take an item; co-op and flare ones say so in their name. */
export function extractKind(e: Pick<MapExtract, 'name' | 'transferItem'>): ExtractKind {
  if (e.transferItem) return e.transferItem.itemId === ROUBLES ? 'vehicle' : 'secret'
  if (/\bco-?op\b/i.test(e.name)) return 'coop'
  if (/\(flare\)/i.test(e.name)) return 'flare'
  if (/\bv-ex\b/i.test(e.name)) return 'vehicle'
  return 'extract'
}

/**
 * The extracts one side can use: its own, shared ones and co-op ones. Maps that share an image (e.g.
 * Ground Zero and Ground Zero 21+) list the same extract twice: the first one listed counts.
 */
export function extractsFor(extracts: readonly MapExtract[], faction: 'pmc' | 'scav'): MapExtract[] {
  const seen = new Set<string>()
  const result: MapExtract[] = []
  for (const e of extracts) {
    const key = `${e.name}@${Math.round(e.position.x)},${Math.round(e.position.z)}`
    if (seen.has(key)) continue
    seen.add(key)
    if (e.faction === faction || e.faction === 'shared' || extractKind(e) === 'coop') result.push(e)
  }
  return result
}

/** What an extract needs, for its tooltip. */
export function extractDetail(
  e: Pick<MapExtract, 'name' | 'faction' | 'transferItem'>,
  itemName: (id: string) => string | undefined = () => undefined
): string {
  const kind = extractKind(e)
  if (kind === 'vehicle')
    return e.transferItem
      ? `Vehicle extract: ${e.transferItem.count.toLocaleString('en-GB')} ₽`
      : 'Vehicle extract: pay the driver'
  if (kind === 'secret')
    return `Secret extract: needs ${(e.transferItem && itemName(e.transferItem.itemId)) ?? 'a special item'}`
  if (kind === 'coop') return 'Co-op extract: a PMC and a scav leave together'
  if (kind === 'flare') return 'Fire a flare near it to open it'
  return e.faction === 'pmc' ? 'PMC extract' : e.faction === 'scav' ? 'Scav extract' : 'PMC and scav extract'
}

const percent = (n: number): string => `${Math.round(n * 100)}%`

/** "Reshala: 60% a raid, here 33% of the time", per boss that can spawn at this point. */
export function bossLines(spawn: Pick<BossSpawn, 'bosses'>): string[] {
  return spawn.bosses.map(
    (b) =>
      `${b.name}: ${percent(b.chance)} a raid${b.here < 1 ? `, here ${percent(b.here)} of the time` : ''}`
  )
}

/**
 * Boss spawn points of the maps sharing an image, merged: points within 40 m of one another are one
 * point, with the bosses of both.
 */
export function mergeBossSpawns(lists: readonly (readonly BossSpawn[])[]): BossSpawn[] {
  const result: BossSpawn[] = []
  for (const spawn of lists.flat()) {
    const near = result.find(
      (s) => Math.hypot(s.position.x - spawn.position.x, s.position.z - spawn.position.z) < 40
    )
    if (!near) result.push({ ...spawn, bosses: [...spawn.bosses] })
    else for (const b of spawn.bosses) if (!near.bosses.some((o) => o.name === b.name)) near.bosses.push(b)
  }
  return result
}

/**
 * Where a place name goes: on the floor it names when tarkov.dev gives it one (a narrow height range,
 * a floor and everything above it, or everything below a height), else on no particular floor.
 */
export function labelAnchor(label: MapLabel): Anchor {
  const [x, z] = label.position
  const { bottom, top } = label
  // tarkov.dev writes 999 for "no limit" as well as leaving it out.
  const upward = top === null || top >= 500
  if (bottom !== null && (upward || top - bottom <= 20)) return { x, y: bottom + 0.5, z }
  if (bottom === null && top !== null) return { x, y: top - 0.5, z }
  return { x, y: null, z }
}

const PIN_ICONS: Record<PinKind, string[]> = {
  extract: [mdiRun],
  flare: [mdiFlare],
  vehicle: [mdiCar],
  coop: [mdiHandshake],
  secret: [mdiRun, mdiScriptText],
  transit: [mdiCar]
}

/** The SVG icon paths of a pin kind, for the legend and the pins. */
export const pinIcons = (kind: PinKind): string[] => PIN_ICONS[kind]
export const BOSS_ICON = mdiSkull
export const SNIPER_ICON = mdiCrosshairsGps
