import type { HideoutCraft, HideoutStation } from './questTypes'

// What crafting burns besides its inputs (since 1.66.0), from the wiki: a 60-unit Expeditionary fuel
// tank runs the Generator for 14 h 26 min, and Solar Power halves that use; a 100-unit water filter
// lasts 8 h 12 min 25 s in the Water Collector. The Generator runs whatever the hideout does, so a
// craft's share of it is an estimate: as if it ran just for that craft.

export const FUEL_PER_HOUR = 60 / (14 + 26 / 60)
export const WATER_FILTER_PER_HOUR = 100 / (8 + 12 / 60 + 25 / 3600)

/** Fuel tanks and water filters, with the units each holds. */
export const FUEL_TANKS: Readonly<Record<string, number>> = {
  '5d1b371186f774253763a656': 60, // Expeditionary fuel tank
  '5d1b36a186f7742523398433': 100 // Metal fuel tank
}
export const WATER_FILTERS: Readonly<Record<string, number>> = {
  '5d1b385e86f774252167b98a': 100 // Water filter
}

/** Stations that craft without power. */
const UNPOWERED = new Set(['scav-case', 'cultist-circle'])

/** Roubles for one unit of fuel or filter: the cheapest tank or filter now, by what it holds. */
export function unitCost(
  holders: Readonly<Record<string, number>>,
  price: (itemId: string) => number | null
): number | null {
  let best: number | null = null
  for (const [id, units] of Object.entries(holders)) {
    const p = price(id)
    if (p !== null && (best === null || p / units < best)) best = p / units
  }
  return best
}

export interface ResourceCost {
  /** Roubles of fuel and of water filter a craft burns; null when they can't be bought now. */
  fuel: number | null
  filter: number | null
}

/** The fuel and water filter one run of a craft burns, in roubles. */
export function craftResources(
  craft: Pick<HideoutCraft, 'duration' | 'inputs'>,
  station: Pick<HideoutStation, 'normalizedName'> | undefined,
  solarPower: boolean,
  fuelUnit: number | null,
  filterUnit: number | null
): ResourceCost {
  const hours = craft.duration / 3600
  const powered = !!station && !UNPOWERED.has(station.normalizedName)
  // A craft that lists the filter among what it uses already pays for it.
  const filtered =
    station?.normalizedName === 'water-collector' && !craft.inputs.some((i) => WATER_FILTERS[i.itemId])
  return {
    fuel: powered
      ? fuelUnit === null
        ? null
        : hours * FUEL_PER_HOUR * (solarPower ? 0.5 : 1) * fuelUnit
      : 0,
    filter: filtered ? (filterUnit === null ? null : hours * WATER_FILTER_PER_HOUR * filterUnit) : 0
  }
}
