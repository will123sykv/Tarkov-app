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
 * Translate them to tarkov.dev item types so fallback data is typed like tarkov.dev data.
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
