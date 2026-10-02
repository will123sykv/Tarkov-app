import type { Vec3 } from './questTypes'

// Story steps have no positions anywhere (tarkov.dev leaves the story out, and the wiki describes
// places in words), so a step that names a place the map knows (Resort, Dorms, an extract) gets a
// "roughly here" pin there, and the player can put their own pin on any step.

/** A named spot on a map: a place name, an extract or a transit. */
export interface MapPlace {
  name: string
  position: Vec3
  /** Other ways a step can name it ("the Woods transit" for "Transit to Woods"). */
  aliases?: string[]
}

/** A pin the player put on a story step. */
export interface StoryPin {
  /** Map id. */
  map: string
  position: Vec3
}

/** Quest id → objective id → the player's pin. */
export type StoryPins = Record<string, Record<string, StoryPin>>

/** Shorter names ("Pit", "K1") are too easily part of something else. */
const MIN_NAME = 4

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Each place's names as patterns, made once (every step is checked against every place). */
const patterns = new WeakMap<MapPlace, RegExp[]>()

function namePatterns(place: MapPlace): RegExp[] {
  let list = patterns.get(place)
  if (!list) {
    list = [place.name, ...(place.aliases ?? [])]
      .filter((name) => name.length >= MIN_NAME)
      .map((name) => new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, 'gi'))
    patterns.set(place, list)
  }
  return list
}

/** Where in the text the place is named, as a name (a capital or a digit first: "the Resort", not "a resort"). */
function firstMention(text: string, place: MapPlace): { at: number; length: number } | null {
  let best: { at: number; length: number } | null = null
  for (const pattern of namePatterns(place)) {
    for (const m of text.matchAll(pattern)) {
      if (!/^[A-Z0-9]/.test(m[0])) continue
      if (!best || m.index < best.at || (m.index === best.at && m[0].length > best.length))
        best = { at: m.index, length: m[0].length }
      break
    }
  }
  return best
}

/**
 * The place a step names on a map: the first one its own text names (the longest where names
 * overlap), else the one its part of the guide names, when it names exactly one.
 */
export function namedPlace(text: string, guide: string | null, places: readonly MapPlace[]): MapPlace | null {
  let best: { place: MapPlace; at: number; length: number } | null = null
  for (const place of places) {
    const found = firstMention(text, place)
    if (found && (!best || found.at < best.at || (found.at === best.at && found.length > best.length)))
      best = { place, ...found }
  }
  if (best) return best.place
  if (!guide) return null
  const named = new Map<string, MapPlace>()
  for (const place of places) if (firstMention(guide, place)) named.set(place.name, place)
  // "Sawmill" inside "Old Sawmill" is the same mention.
  const names = [...named.keys()]
  const distinct = names.filter((n) => !names.some((other) => other !== n && other.includes(n)))
  return distinct.length === 1 ? named.get(distinct[0])! : null
}
