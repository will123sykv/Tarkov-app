import type { StoryChapter, StoryObjective } from '../../shared/questTypes'
import type { FetchFn } from '../pricing/http'
import { imageInfo, plainText, WIKI_PAGE, wikiApi } from './questGuide'

// The main story's chapters (Tour, Falling Skies, The Ticket…). tarkov.dev leaves them out of its quest
// list, so each chapter's objectives come from its page on the Escape from Tarkov wiki: the bulleted
// `== Objectives ==` list, with sub-steps, optional steps and the branches some chapters take.

const LIST_PAGE = 'Story chapters'
/** The main line first; the side chapters after, by name. */
const MAIN_LINE = ['Tour', 'Falling Skies', 'The Ticket']
/** Linked pages that aren't items in a hand-over step. */
const NOT_ITEMS = /^(found in raid|hideout|file:|image:|category:)/i
/** Steps that take items into a raid to leave there: their linked items are what to bring. */
const STASH = /^(stash|plant|hide|place|leave)\b/i
/** Steps whose number is how many of something they take. */
const COUNTED = /^(hand over|eliminate|kill|neutralize|find|obtain|collect|bring|stash|plant|mark|launch)\b/i

/** The chapters the wiki's list page links to: page title and the name shown. */
export function chapterList(wikitext: string): { title: string; name: string }[] {
  const result: { title: string; name: string }[] = []
  for (const line of wikitext.split('\n')) {
    const m = /^\|\s*\[\[([^\]|:]+)(?:\|([^\]]+))?\]\]\s*$/.exec(line)
    if (m) result.push({ title: m[1].trim(), name: (m[2] ?? m[1]).trim() })
  }
  return result
}

/** A top-level `== Heading ==` section's text, up to the next one. */
export function section(wikitext: string, heading: string): string {
  const start = new RegExp(`^==\\s*${heading}\\s*==\\s*$`, 'im').exec(wikitext)
  if (!start) return ''
  const rest = wikitext.slice(start.index + start[0].length)
  const end = /^==[^=].*$/m.exec(rest)
  return end ? rest.slice(0, end.index) : rest
}

export const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '') || 'step'

const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g

/** The pages a piece of markup links to (`[[Page|text]]` → Page). */
export function linkTargets(markup: string): string[] {
  return [...markup.matchAll(LINK)].map((m) => m[1].trim())
}

/** A map the steps can name: its id and its names (tarkov.dev's). */
export interface StoryMap {
  id: string
  name: string
  normalizedName: string
}

/** Other names the wiki uses for maps, by tarkov.dev's normalized name. */
const ALIASES: Record<string, string[]> = {
  'streets-of-tarkov': ['Streets'],
  'the-lab': ['Lab', 'Labs'],
  'the-labyrinth': ['Labyrinth'],
  'ground-zero': ['GZ']
}
/** Of those, the ones that aren't part of other names in plain text ("TerraGroup Labs keycard"). */
const TEXT_ALIASES = new Set(['Streets', 'Lab', 'Labyrinth', 'GZ'])
/** Names that are also places on other maps (the Terminal is seen from Shoreline): only "on/in X" counts. */
const AMBIGUOUS = new Set(['terminal', 'icebreaker'])
/** "The Woods transit", "the Customs extract": a way to the map, not a step done on it. */
const QUALIFIER = /^\s+(?:transit|extract|extraction|exit|exfil|v-ex|border)\b/i
/** "Ensure access to Reserve", "the entrance to the port Terminal": where it leads, not where it's done. */
const DESTINATION = /\b(?:to|towards|into)(?:\s+[\w'-]+){0,2}\s+$/i

export interface MapNamer {
  /** A map by a link's target or any of its names (case doesn't matter). */
  byName: (name: string) => string | null
  /** Names to look for in plain text (as written), longest first. */
  names: { text: string; id: string; ambiguous: boolean }[]
}

export function mapNamer(maps: readonly StoryMap[]): MapNamer {
  const lookup = new Map<string, string>()
  const names: MapNamer['names'] = []
  for (const map of maps) {
    const all = [map.name, map.normalizedName.replace(/-/g, ' '), ...(ALIASES[map.normalizedName] ?? [])]
    for (const name of all) lookup.set(name.toLowerCase(), map.id)
    const aliases = (ALIASES[map.normalizedName] ?? []).filter((a) => TEXT_ALIASES.has(a))
    for (const text of new Set([map.name, ...aliases]))
      names.push({ text, id: map.id, ambiguous: AMBIGUOUS.has(text.toLowerCase()) })
  }
  names.sort((a, b) => b.text.length - a.text.length)
  return { byName: (name) => lookup.get(name.trim().toLowerCase()) ?? null, names }
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The maps a piece of markup says something is done on, in the order it names them: linked map
 * pages and map names in the text, but not a way to one ("the Woods transit on Reserve" is on
 * Reserve) or where something leads ("access to Reserve").
 */
function mapsNamed(markup: string, namer: MapNamer): string[] {
  // Mark linked maps (the link's text may not be the map's name: "the [[The Lab|TerraGroup facility]]").
  const marked = markup.replace(LINK, (all, target: string, display: string | undefined) => {
    if (/^(file|image|category):/i.test(target)) return all
    const id = namer.byName(target)
    return id ? `\u0001${id}\u0002${display ?? target}\u0003` : all
  })
  const text = plainText(marked).replace(/\s+/g, ' ')
  const named: { id: string; start: number; end: number; linked: boolean }[] = []
  let clean = ''
  let last = 0
  for (const m of text.matchAll(/\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003/g)) {
    clean += text.slice(last, m.index)
    named.push({ id: m[1], start: clean.length, end: clean.length + m[2].length, linked: true })
    clean += m[2]
    last = m.index + m[0].length
  }
  clean += text.slice(last)
  for (const { text: name, id, ambiguous } of namer.names) {
    for (const m of clean.matchAll(new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, 'g'))) {
      const start = m.index
      const end = start + name.length
      if (named.some((x) => x.start < end && start < x.end)) continue
      if (ambiguous && !/\b(?:on|in|from)\s+$/i.test(clean.slice(0, start))) continue
      named.push({ id, start, end, linked: false })
    }
  }
  const ids = named
    .filter(({ start, end }) => !QUALIFIER.test(clean.slice(end)) && !DESTINATION.test(clean.slice(0, start)))
    .sort((a, b) => a.start - b.start)
    .map((x) => x.id)
  return [...new Set(ids)]
}

/** A part of the chapter's guide: one `=== Heading ===` and the text under it. */
interface GuideSection {
  level: number
  /** The heading's alternatives ("Retrieve the armored case/Find any additional clues"), as words. */
  titles: string[][]
  maps: string[]
  text: string
}

/** Words too common to tell a step from another. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with'
])

/** A step's or heading's words, for matching one to the other. */
const words = (text: string): string[] =>
  plainText(text)
    .toLowerCase()
    .replace(/\(optional\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w))

/** Most of a guide's text a step keeps: enough for the places it names. */
const GUIDE_TEXT = 600

/** The guide's parts, each with the maps it names (or, failing that, its sub-headings name). */
function guideSections(wikitext: string, namer: MapNamer): GuideSection[] {
  const parts: { level: number; title: string; body: string[] }[] = []
  for (const raw of section(wikitext, 'Guide').split('\n')) {
    const line = raw.trim()
    const heading = /^(={3,})\s*(.*?)\s*\1$/.exec(line)
    if (heading) parts.push({ level: heading[1].length, title: heading[2], body: [] })
    else if (parts.length) parts[parts.length - 1].body.push(raw)
  }
  return parts.map((part, i) => {
    const body = part.body
      .join('\n')
      .replace(/<gallery[\s\S]*?<\/gallery>/gi, '')
      .split('\n')
      .filter((line) => !/^\s*(\{\||\||!|File:)/.test(line))
      .join('\n')
    let maps = mapsNamed(body, namer)
    if (!maps.length) {
      // "Locate the traces…" with a sub-heading per map: "==== Customs ====", "==== Woods ====".
      const under: string[] = []
      for (const sub of parts.slice(i + 1)) {
        if (sub.level <= part.level) break
        under.push(sub.title)
      }
      maps = mapsNamed(under.join('. '), namer)
    }
    return {
      level: part.level,
      titles: plainText(part.title).split('/').map(words),
      maps,
      text: plainText(body).replace(/\s+/g, ' ').slice(0, GUIDE_TEXT)
    }
  })
}

/** How alike two lists of words are: shared words over all words. */
function overlap(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const shared = [...setA].filter((w) => setB.has(w)).length
  return shared / (setA.size + setB.size - shared || 1)
}

/** How alike a step and a heading must be ("Wait for information…" and "Wait for the information…"). */
const MIN_OVERLAP = 0.6

/** The guide's part about a step: the best-matching heading, the next unused one on a tie. */
function sectionFor(step: string, sections: readonly GuideSection[], after: number): number {
  const target = words(step)
  let best = -1
  let bestScore = 0
  sections.forEach((s, i) => {
    const score = Math.max(...s.titles.map((t) => overlap(target, t)))
    if (score < MIN_OVERLAP) return
    if (score > bestScore || (score === bestScore && best <= after && i > after)) {
      best = i
      bestScore = score
    }
  })
  return best
}

/**
 * A chapter's steps, from its `== Objectives ==` section, each with the maps it's done on: the ones
 * it names, else the ones its part of the guide names, else its parent step's.
 */
export function parseObjectives(wikitext: string, maps: readonly StoryMap[] = []): StoryObjective[] {
  const namer = mapNamer(maps)
  const sections = guideSections(wikitext, namer)
  const result: StoryObjective[] = []
  const seen = new Map<string, number>()
  let branch: string | null = null
  let lastSection = -1
  for (const raw of section(wikitext, 'Objectives').split('\n')) {
    const line = raw.trim()
    const heading = /^===+\s*(.*?)\s*===+$/.exec(line)
    // A sub-heading, a bold line or a rule starts (or ends) a branch.
    if (heading) branch = plainText(heading[1]) || null
    else if (/^'''[^']/.test(line) && /'''$/.test(line)) branch = plainText(line) || null
    else if (/^<hr\s*\/?>$/i.test(line)) branch = null
    const bullet = /^(\*+)\s*(.*)$/.exec(line)
    if (!bullet) continue
    const markup = bullet[2]
    let text = plainText(markup).replace(/\s+/g, ' ')
    const optional = /^\(optional\)\s*/i.test(text)
    text = text.replace(/^\(optional\)\s*/i, '')
    if (!text) continue
    const depth = bullet[1].length - 1
    const handOver = /^hand over\b/i.test(text)
    // A number of things ("Hand over 3", "Eliminate any 15"), not a name or level ("Item 1156", "level 3").
    const number = COUNTED.test(text)
      ? /(?<![-\w.])(?<!\b(?:item|level|lvl|part|#)\s*)(\d{1,3}(?:,\d{3})+|\d+)(?=\s+\S)/i.exec(text)
      : null
    // "Survive and extract from Customs or visit Customs 3 times".
    const visits = /\bvisit\b.*?\b(\d+)\s+times?\b/i.exec(text)
    const count = visits ? Number(visits[1]) : number ? Number(number[1].replace(/,/g, '')) : 0
    const loyalty = /^reach loyalty level (\d)\s+with\s+(.+?)\.?$/i.exec(text)
    const found = sectionFor(text, sections, lastSection)
    if (found >= 0) lastSection = found
    const guide = found >= 0 ? sections[found] : null
    let onMaps = mapsNamed(markup, namer)
    if (!onMaps.length && guide) onMaps = guide.maps
    if (!onMaps.length && depth > 0) onMaps = result.findLast((step) => step.depth < depth)?.maps ?? []
    const base = slug(text)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    result.push({
      id: n > 1 ? `${base}#${n}` : base,
      text,
      optional,
      depth,
      count: count >= 2 ? count : null,
      itemNames: handOver || STASH.test(text) ? linkTargets(markup).filter((t) => !NOT_ITEMS.test(t)) : [],
      handOver,
      foundInRaid: /\bin raid\b/i.test(text),
      branch,
      maps: onMaps,
      guide: guide?.text || null,
      visits: Boolean(visits),
      loyalty: loyalty ? { trader: loyalty[2].trim(), level: Number(loyalty[1]) } : null
    })
  }
  return result
}

/** The chapter's blurb: the quote under `== Description ==`. */
export function parseDescription(wikitext: string): string {
  const quote = /\{\{\s*quote\s*\|([\s\S]*?)\}\}/i.exec(section(wikitext, 'Description'))
  return quote ? plainText(quote[1].split('|')[0]) : ''
}

/** What starts the chapter, from `== Requirements ==`: one line per point, without the galleries. */
export function parseHowItStarts(wikitext: string): string {
  return section(wikitext, 'Requirements')
    .replace(/<li[^>]*>\s*<gallery[\s\S]*?<\/gallery>\s*<\/li>/gi, '')
    .replace(/<gallery[\s\S]*?<\/gallery>/gi, '')
    .split('\n')
    .map((line) => {
      const text = plainText(line.replace(/^\*+\s*/, ''))
      return text && line.trim().startsWith('*') ? `• ${text}` : text
    })
    .filter(Boolean)
    .join('\n')
}

/** The banner picture's file name, from the page's infobox. */
const bannerFile = (wikitext: string): string | null =>
  /\|\s*image\s*=\s*([^|\n}]+)/.exec(wikitext)?.[1].trim() || null

const pageUrl = (title: string): string => `${WIKI_PAGE}${encodeURIComponent(title.replace(/ /g, '_'))}`

/**
 * Every story chapter with its steps. `questIds` names tarkov.dev's quests it doesn't list (by id),
 * which is where the chapters' own ids come from, so the game's logs can tick them off; `maps` are
 * the maps the steps can be on.
 */
export async function fetchStoryChapters(
  fetchFn: FetchFn,
  questIds: Record<string, string>,
  maps: readonly StoryMap[] = []
): Promise<StoryChapter[]> {
  const wikitext = async (page: string): Promise<string> => {
    const body = await wikiApi(fetchFn, { action: 'parse', page, prop: 'wikitext', redirects: '1' })
    const text = (body.parse as Record<string, unknown> | undefined)?.wikitext
    return typeof text === 'string' ? text : ''
  }
  const list = chapterList(await wikitext(LIST_PAGE))
  if (!list.length) throw new Error('The wiki lists no story chapters')
  const idByName = new Map(Object.entries(questIds).map(([id, name]) => [name.toLowerCase(), id]))
  const chapters: (StoryChapter & { banner: string | null })[] = []
  for (const { title, name } of list) {
    const text = await wikitext(title).catch(() => '')
    const objectives = parseObjectives(text, maps)
    if (!objectives.length) continue
    chapters.push({
      id: idByName.get(name.toLowerCase()) ?? `story-${slug(name)}`,
      name,
      wikiLink: pageUrl(title),
      description: parseDescription(text),
      howItStarts: parseHowItStarts(text),
      imageLink: null,
      objectives,
      banner: bannerFile(text)
    })
  }
  const banners = chapters.flatMap((c) => (c.banner ? [c.banner] : []))
  const pictures = banners.length ? await imageInfo(fetchFn, banners).catch(() => new Map()) : new Map()
  const rank = (name: string): number => {
    const i = MAIN_LINE.indexOf(name)
    return i < 0 ? MAIN_LINE.length : i
  }
  return chapters
    .map(({ banner, ...chapter }) => ({
      ...chapter,
      imageLink: (banner && pictures.get(banner.charAt(0).toUpperCase() + banner.slice(1))?.thumb) ?? null
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}
