import { join } from 'node:path'
import type { WikiQuest, WikiQuestEntry } from '../../shared/questTypes'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { errorMessage, type FetchFn } from '../pricing/http'
import { plainText, WIKI_PAGE, wikiApi } from './questGuide'
import { linkTargets, mapNamer, parseObjectives, section, type StoryMap } from './storyChapters'

// Event quests (Fog of War…) that tarkov.dev doesn't list: the player picks them from the wiki's event
// quests, and each is read from its page there: the infobox (who gives it, where, what it follows),
// the objectives (as story chapters' are read) and the rewards.

type Raw = Record<string, unknown>

/** Quest pages rarely change: refresh twice a day. */
const MAX_AGE_MS = 12 * 3_600_000
/** Most pages one load fetches: enough for anyone's event quests, few enough to stay quick. */
const MAX_FETCH = 40

const EVENT = 'event content'
const PAST = 'historical content'
const QUESTS = 'quests'

const category = (name: string): string =>
  name
    .replace(/^Category:/i, '')
    .replace(/_/g, ' ')
    .toLowerCase()
const count = (text: string): number => Number(text.replace(/,/g, ''))

/** The quest infobox's fields, by name in lower case (`given by`, `location`, `previous`…). */
export function infoboxFields(wikitext: string): Record<string, string> | null {
  const start = /\{\{\s*Infobox quest\b/i.exec(wikitext)
  if (!start) return null
  // To the infobox's own closing braces, past any templates inside it.
  let depth = 0
  let end = wikitext.length
  for (let i = start.index; i < wikitext.length - 1; i++) {
    const two = wikitext.slice(i, i + 2)
    if (two === '{{') depth++
    else if (two === '}}') depth--
    else continue
    i++
    if (depth === 0) {
      end = i - 1
      break
    }
  }
  const fields: Record<string, string> = {}
  for (const line of wikitext.slice(start.index + start[0].length, end).split('\n')) {
    const m = /^\s*\|\s*([^=|]+?)\s*=(.*)$/.exec(line)
    if (m) fields[m[1].toLowerCase()] = m[2].trim()
  }
  return fields
}

/** What the trader says when giving it: the first quote under `== Dialogue ==`. */
function dialogue(wikitext: string): string {
  const quote = /\{\{\s*quote\s*\|([\s\S]*?)\}\}/i.exec(section(wikitext, 'Dialogue'))
  return quote ? plainText(quote[1].split('|')[0]) : ''
}

const CURRENCY: Record<string, '₽' | '$' | '€'> = { rouble: '₽', ruble: '₽', dollar: '$', euro: '€' }

/** The `== Rewards ==` list's top-level points: experience, money, items, reputation and the rest. */
export function parseRewards(wikitext: string): WikiQuest['rewards'] {
  const rewards: WikiQuest['rewards'] = { experience: 0, money: [], items: [], standing: [], other: [] }
  for (const raw of section(wikitext, 'Rewards').split('\n')) {
    // Second-level points are variants ("315,000 Roubles with Intelligence Center Level 1").
    const point = /^\*(?!\*)\s*(.*)$/.exec(raw.trim())
    if (!point) continue
    const markup = point[1]
    const text = plainText(markup).replace(/\s+/g, ' ')
    if (!text) continue
    const exp = /^\+?\s*([\d,]+)\s*EXP\b/i.exec(text)
    const money = /^([\d,]+)\s*(rouble|ruble|dollar|euro)s?\b/i.exec(text)
    const item = /^(\d+)\s*[×x]\s*\[\[([^\]|#]+)/i.exec(markup)
    const rep = /^\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]\s*Rep\b/i.exec(markup)
    if (exp) rewards.experience += count(exp[1])
    else if (money)
      rewards.money.push({ currency: CURRENCY[money[2].toLowerCase()], amount: count(money[1]) })
    else if (item) rewards.items.push({ name: item[2].trim(), count: Number(item[1]) })
    else if (rep) {
      const value = /([+-])\s*(\d+(?:\.\d+)?)/.exec(text.slice(rep[1].length))
      if (value) rewards.standing.push({ trader: rep[1].trim(), value: Number(value[1] + value[2]) })
    } else rewards.other.push(text)
  }
  return rewards
}

/** A quest's page on the wiki, read; null when the page isn't a quest's. */
export function parseWikiQuest(
  title: string,
  page: string,
  categories: readonly string[],
  maps: readonly StoryMap[] = []
): WikiQuest | null {
  // Lines end in \n from the wiki; a copy saved on Windows may end them in \r\n.
  const wikitext = page.replace(/\r\n?/g, '\n')
  const fields = infoboxFields(wikitext)
  if (!fields) return null
  const cats = new Set(categories.map(category))
  const namer = mapNamer(maps)
  const links = (key: string): string[] =>
    linkTargets(fields[key] ?? '').filter((t) => !/^(file|image|category):/i.test(t))
  const at = [...new Set(links('location').flatMap((name) => namer.byName(name) ?? []))]
  const loyalty = /\d+/.exec(plainText(fields['ll requirement'] ?? ''))
  const trader = links('given by')[0] ?? (plainText(fields['given by'] ?? '') || null)
  const objectives = parseObjectives(wikitext, maps).map((o) => ({
    ...o,
    // Links to maps and traders in a step aren't items.
    itemNames: o.itemNames.filter((name) => !namer.byName(name) && name !== trader),
    // A step that names no map is done wherever the quest is (the infobox's location), hand-overs aside.
    maps: o.maps?.length || o.handOver || !at.length ? o.maps : at
  }))
  return {
    title,
    name: title,
    wikiLink: `${WIKI_PAGE}${encodeURIComponent(title.replace(/ /g, '_'))}`,
    event: cats.has(EVENT) || /\{\{\s*event content\s*\}\}/i.test(wikitext),
    past: cats.has(PAST) || /\{\{\s*historical content\s*\}\}/i.test(wikitext),
    trader,
    maps: at,
    loyaltyLevel: loyalty ? Number(loyalty[0]) : null,
    previous: links('previous'),
    leadsTo: links('leads to'),
    kappa: /^yes\b/i.test(plainText(fields.reqkappa ?? '')),
    description: dialogue(wikitext),
    objectives,
    rewards: parseRewards(wikitext)
  }
}

/**
 * The wiki's event quests: pages in both its event content and quests categories, with the ones from
 * events that are over (its historical content) marked. This event's first, then by name.
 */
export async function fetchEventQuests(fetchFn: FetchFn): Promise<WikiQuestEntry[]> {
  const pages = new Map<string, Set<string>>()
  let more: Record<string, string> = {}
  for (let batch = 0; batch < 20; batch++) {
    const body = await wikiApi(fetchFn, {
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: 'Category:Event_content',
      gcmnamespace: '0',
      gcmlimit: '500',
      prop: 'categories',
      clcategories: 'Category:Quests|Category:Historical_content',
      cllimit: 'max',
      ...more
    })
    const list = (body.query as Raw | undefined)?.pages
    for (const page of Array.isArray(list) ? (list as Raw[]) : []) {
      const title = typeof page.title === 'string' ? page.title : null
      if (!title) continue
      const cats = pages.get(title) ?? new Set<string>()
      for (const c of Array.isArray(page.categories) ? (page.categories as Raw[]) : [])
        if (typeof c.title === 'string') cats.add(category(c.title))
      pages.set(title, cats)
    }
    if (!body.continue || typeof body.continue !== 'object') break
    more = Object.fromEntries(Object.entries(body.continue as Raw).map(([k, v]) => [k, String(v)]))
  }
  return [...pages]
    .filter(([, cats]) => cats.has(QUESTS))
    .map(([title, cats]) => ({ title, past: cats.has(PAST) }))
    .sort((a, b) => Number(a.past) - Number(b.past) || a.title.localeCompare(b.title))
}

/** A page's wikitext and categories, under its own title (after any redirect). */
async function fetchPage(
  fetchFn: FetchFn,
  page: string
): Promise<{ title: string; wikitext: string; categories: string[] }> {
  const body = await wikiApi(fetchFn, { action: 'parse', page, prop: 'wikitext|categories', redirects: '1' })
  const parse = (body.parse ?? {}) as Raw
  return {
    title: typeof parse.title === 'string' ? parse.title : page,
    wikitext: typeof parse.wikitext === 'string' ? parse.wikitext : '',
    categories: (Array.isArray(parse.categories) ? (parse.categories as Raw[]) : [])
      .map((c) => c.category)
      .filter((c): c is string => typeof c === 'string')
  }
}

/** A wiki link (with or without the https://) or a page's title, as a title. */
export function titleFromInput(input: string): string | null {
  const text = input.trim()
  const link = /\/wiki\/([^?#\s]+)/i.exec(text)
  if (link) {
    try {
      return decodeURIComponent(link[1]).replace(/_/g, ' ').trim() || null
    } catch {
      return null
    }
  }
  return text && !/^https?:\/\//i.test(text) ? text : null
}

interface CachedPage {
  title: string
  fetchedAt: number
  wikitext: string
  categories: string[]
}

interface Cache {
  pages: Record<string, CachedPage>
  list?: { fetchedAt: number; quests: WikiQuestEntry[] }
}

export interface WikiQuestService {
  /** The wiki's event quests, to pick from. */
  list(force?: boolean): Promise<{ quests: WikiQuestEntry[]; error: string | null }>
  /** The quests added, read from their pages (cached, refreshed twice a day), with what couldn't be read. */
  get(
    titles: readonly string[],
    maps: readonly StoryMap[]
  ): Promise<{ quests: WikiQuest[]; errors: Record<string, string> }>
  /** A pasted link or name, as a quest page's title. */
  resolve(input: string): Promise<{ title: string } | { error: string }>
}

export function createWikiQuestService(deps: {
  fetchFn: FetchFn
  cacheDir: string
  now?: () => number
}): WikiQuestService {
  const now = deps.now ?? Date.now
  const file = join(deps.cacheDir, 'wiki-quests.json')
  let cache: Cache | null = null

  async function load(): Promise<Cache> {
    if (!cache) {
      const raw = (await readJsonFile(file)) as Partial<Cache> | undefined
      cache = { pages: raw?.pages && typeof raw.pages === 'object' ? raw.pages : {}, list: raw?.list }
    }
    return cache
  }
  const save = (): Promise<void> => writeJsonFileAtomic(file, cache)

  async function fetchInto(c: Cache, title: string): Promise<CachedPage> {
    const page = { ...(await fetchPage(deps.fetchFn, title)), fetchedAt: now() }
    c.pages[title] = page
    if (page.title !== title) c.pages[page.title] = page
    return page
  }

  return {
    async list(force = false) {
      const c = await load()
      if (!force && c.list && now() - c.list.fetchedAt < MAX_AGE_MS)
        return { quests: c.list.quests, error: null }
      try {
        const quests = await fetchEventQuests(deps.fetchFn)
        if (!quests.length) throw new Error('The wiki lists no event quests')
        c.list = { fetchedAt: now(), quests }
        await save()
        return { quests, error: null }
      } catch (err) {
        return { quests: c.list?.quests ?? [], error: errorMessage(err) }
      }
    },

    async get(titles, maps) {
      const c = await load()
      const errors: Record<string, string> = {}
      let fetched = 0
      for (const title of titles) {
        const cached = c.pages[title]
        if ((cached && now() - cached.fetchedAt < MAX_AGE_MS) || fetched >= MAX_FETCH) continue
        fetched++
        try {
          await fetchInto(c, title)
        } catch (err) {
          // Keep what was read last time.
          if (!cached) errors[title] = errorMessage(err)
        }
      }
      if (fetched) await save()
      const quests: WikiQuest[] = []
      for (const title of titles) {
        const page = c.pages[title]
        if (!page) continue
        const quest = parseWikiQuest(title, page.wikitext, page.categories, maps)
        if (quest) quests.push(quest)
        else errors[title] = 'That page isn’t a quest’s.'
      }
      return { quests, errors }
    },

    async resolve(input) {
      const asked = titleFromInput(input)
      if (!asked) return { error: 'Paste a link to a quest on the Escape from Tarkov wiki, or its name.' }
      const c = await load()
      try {
        let page: CachedPage
        try {
          page = await fetchInto(c, asked)
        } catch {
          // Not a page's exact title: search for it.
          const body = await wikiApi(deps.fetchFn, {
            action: 'query',
            list: 'search',
            srsearch: asked,
            srnamespace: '0',
            srlimit: '1'
          })
          const hit = ((body.query as Raw | undefined)?.search as Raw[] | undefined)?.[0]?.title
          if (typeof hit !== 'string') return { error: `The wiki has no page called “${asked}”.` }
          page = await fetchInto(c, hit)
        }
        await save()
        if (!infoboxFields(page.wikitext)) return { error: `“${page.title}” isn’t a quest’s page.` }
        return { title: page.title }
      } catch (err) {
        return { error: `Couldn’t reach the wiki: ${errorMessage(err)}` }
      }
    }
  }
}
