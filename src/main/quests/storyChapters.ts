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
function section(wikitext: string, heading: string): string {
  const start = new RegExp(`^==\\s*${heading}\\s*==\\s*$`, 'im').exec(wikitext)
  if (!start) return ''
  const rest = wikitext.slice(start.index + start[0].length)
  const end = /^==[^=].*$/m.exec(rest)
  return end ? rest.slice(0, end.index) : rest
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '') || 'step'

/** The pages a piece of markup links to (`[[Page|text]]` → Page). */
function linkTargets(markup: string): string[] {
  return [...markup.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim())
}

/** A chapter's steps, from its `== Objectives ==` section. */
export function parseObjectives(wikitext: string): StoryObjective[] {
  const result: StoryObjective[] = []
  const seen = new Map<string, number>()
  let branch: string | null = null
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
    const handOver = /^hand over\b/i.test(text)
    // A number of things ("Hand over 3", "Eliminate any 15"), not a name or level ("Item 1156", "level 3").
    const number = COUNTED.test(text)
      ? /(?<![-\w.])(?<!\b(?:item|level|lvl|part|#)\s*)(\d{1,3}(?:,\d{3})+|\d+)(?=\s+\S)/i.exec(text)
      : null
    const count = number ? Number(number[1].replace(/,/g, '')) : 0
    const base = slug(text)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    result.push({
      id: n > 1 ? `${base}#${n}` : base,
      text,
      optional,
      depth: bullet[1].length - 1,
      count: count >= 2 ? count : null,
      itemNames: handOver ? linkTargets(markup).filter((t) => !NOT_ITEMS.test(t)) : [],
      handOver,
      foundInRaid: /\bin raid\b/i.test(text),
      branch
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
 * which is where the chapters' own ids come from, so the game's logs can tick them off.
 */
export async function fetchStoryChapters(
  fetchFn: FetchFn,
  questIds: Record<string, string>
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
    const objectives = parseObjectives(text)
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
