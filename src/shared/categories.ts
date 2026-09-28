export type CategoryId =
  | 'all'
  | 'barter'
  | 'keys'
  | 'meds'
  | 'provisions'
  | 'ammo'
  | 'weapons'
  | 'mods'
  | 'armor'
  | 'carry'
  | 'containers'
  | 'gear'

export interface Category {
  id: CategoryId
  label: string
  /** tarkov.dev item types that belong to this pool; empty means everything. */
  types: string[]
}

export const CATEGORIES: Category[] = [
  { id: 'all', label: 'All items', types: [] },
  { id: 'barter', label: 'Barter items', types: ['barter'] },
  { id: 'keys', label: 'Keys & keycards', types: ['keys'] },
  { id: 'meds', label: 'Meds & stims', types: ['meds', 'injectors'] },
  { id: 'provisions', label: 'Food & drink', types: ['provisions'] },
  { id: 'ammo', label: 'Ammo', types: ['ammo', 'ammoBox'] },
  { id: 'weapons', label: 'Weapons', types: ['gun'] },
  { id: 'mods', label: 'Weapon mods', types: ['mods', 'suppressor', 'pistolGrip'] },
  { id: 'armor', label: 'Armor & helmets', types: ['armor', 'armorPlate', 'helmet'] },
  { id: 'carry', label: 'Rigs & backpacks', types: ['rig', 'backpack'] },
  { id: 'containers', label: 'Containers', types: ['container'] },
  { id: 'gear', label: 'Other gear', types: ['headphones', 'glasses', 'wearable', 'grenade'] }
]

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id))

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && CATEGORY_IDS.has(value)
}

export function categoryById(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]
}

// Ordered: the first matching rule wins, so specific phrases come before broad ones
// ("medical supplies" are barter items, "weapon parts" are mods, not guns).
const MARKET_TAG_RULES: [RegExp, string][] = [
  [/\bammo (box|pack)/, 'ammoBox'],
  [/\bammo\b|\brounds?\b/, 'ammo'],
  [/\bkeys?\b|keycard/, 'keys'],
  [/stim|injector/, 'injectors'],
  [/medical supplies/, 'barter'],
  [/\bmed|drug|injur|pill/, 'meds'],
  [/provision|food|drink/, 'provisions'],
  [/armou?r plate|\bplates?\b/, 'armorPlate'],
  [/helmet/, 'helmet'],
  [/armou?r/, 'armor'],
  [/\brigs?\b/, 'rig'],
  [/backpack/, 'backpack'],
  [/container|\bcases?\b/, 'container'],
  [/headphone|headset/, 'headphones'],
  [/eyewear|glasses/, 'glasses'],
  [/grenade|throwable/, 'grenade'],
  [/suppressor|silencer/, 'suppressor'],
  [/pistol grip/, 'pistolGrip'],
  [
    /weapon parts?|\bmods?\b|magazine|sight|scope|barrel|stock|handguard|mount|muzzle|receiver|foregrip|tactical device/,
    'mods'
  ],
  [/weapon|\bguns?\b|rifle|pistol|shotgun|launcher|\bsmg\b|carbine/, 'gun'],
  [
    /barter|valuable|electronic|energy|building|flammable|household|info|\btools?\b|jewel|battery|fuel/,
    'barter'
  ],
  [/gear|face|headwear|cover|armband/, 'wearable']
]

/**
 * tarkov-market tags are free-form category names ("Barter", "Weapon parts", …).
 * Translate them to tarkov.dev item types so category pools keep working on fallback data.
 */
export function typesFromMarketTags(tags: string[]): string[] {
  const types = new Set<string>()
  for (const raw of tags) {
    const tag = raw.toLowerCase()
    for (const [pattern, type] of MARKET_TAG_RULES) {
      if (pattern.test(tag)) {
        types.add(type)
        break
      }
    }
  }
  return [...types]
}
