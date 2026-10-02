import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { GuideBlock, GuideImage, QuestGuide, QuestGuideState } from '../../shared/questTypes'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { errorMessage, fetchJson, type FetchFn } from '../pricing/http'

// The "Guide" section of a quest's page on the Escape from Tarkov wiki (escapefromtarkov.fandom.com,
// CC BY-SA 3.0): what to do, as plain text, and its pictures of where things are, with captions.

export const WIKI_BASE = 'https://escapefromtarkov.fandom.com'
export const WIKI_PAGE = `${WIKI_BASE}/wiki/`
/** Guides change now and then: refresh weekly. */
const MAX_AGE_MS = 7 * 24 * 3_600_000
const TIMEOUT_MS = 20_000
/** Pictures in the prose this small or smaller are item icons, not pictures of places. */
const ICON_MAX_PX = 128
const IMAGE_WIDTH = 800

type Raw = Record<string, unknown>

class MissingPage extends Error {
  constructor() {
    super('The wiki has no page for this quest yet.')
  }
}

/** The wiki page a tarkov.dev `wikiLink` points to, or null for a link elsewhere. */
export function wikiTitle(wikiLink: string | null): string | null {
  if (!wikiLink?.startsWith(WIKI_PAGE)) return null
  const path = wikiLink.slice(WIKI_PAGE.length).split(/[?#]/)[0]
  if (!path) return null
  try {
    return decodeURIComponent(path).replace(/_/g, ' ')
  } catch {
    return null
  }
}

/** The text of the `== Guide ==` section, up to the next top-level heading. */
export function guideSection(wikitext: string): string {
  const start = /^==\s*Guide\s*==\s*$/im.exec(wikitext)
  if (!start) return ''
  const rest = wikitext.slice(start.index + start[0].length)
  const end = /^==[^=].*$/m.exec(rest)
  return end ? rest.slice(0, end.index) : rest
}

/** Remove `open … close` spans, nested ones included (templates, tables). */
function stripNested(text: string, open: string, close: string): string {
  let result = ''
  let depth = 0
  let i = 0
  while (i < text.length) {
    if (text.startsWith(open, i)) {
      depth++
      i += open.length
    } else if (depth && text.startsWith(close, i)) {
      depth--
      i += close.length
    } else {
      if (!depth) result += text[i]
      i++
    }
  }
  return result
}

const IMAGE_OPTION =
  /^(thumb|thumbnail|frame|framed|frameless|border|left|right|center|centre|none|upright.*|baseline|middle|sub|super|top|text-top|bottom|text-bottom|\d*x?\d+px|(link|alt|page|class|lang)=.*)$/i

/** Wiki markup in a caption or paragraph, as plain text. */
export function plainText(markup: string): string {
  return stripNested(markup, '{{', '}}')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1')
    .replace(/\[https?:\/\/[^\]]+\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Split `a|b|[[c|d]]` on the pipes outside links and templates. */
function splitOptions(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2)
    if (two === '[[' || two === '{{') {
      depth++
      current += two
      i++
    } else if ((two === ']]' || two === '}}') && depth) {
      depth--
      current += two
      i++
    } else if (text[i] === '|' && !depth) {
      parts.push(current)
      current = ''
    } else current += text[i]
  }
  parts.push(current)
  return parts
}

/** A wiki file name as the API writes titles: spaces, first letter capitalised. */
const fileKey = (name: string): string => {
  const n = name.replace(/_/g, ' ').trim()
  return n.charAt(0).toUpperCase() + n.slice(1)
}

/** `[[File:…]]` links (balanced, captions may hold links) and where each starts and ends. */
function fileLinks(text: string): { start: number; end: number; inner: string }[] {
  const result: { start: number; end: number; inner: string }[] = []
  const re = /\[\[\s*(?:File|Image)\s*:/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let depth = 0
    let i = m.index
    for (; i < text.length - 1; i++) {
      if (text.startsWith('[[', i)) {
        depth++
        i++
      } else if (text.startsWith(']]', i)) {
        depth--
        i++
        if (!depth) break
      }
    }
    result.push({ start: m.index, end: i + 1, inner: text.slice(m.index + 2, i - 1) })
    re.lastIndex = i + 1
  }
  return result
}

/** A guide's text and the pictures in it (gallery entries and framed or large inline pictures). */
export function parseGuide(wikitext: string): {
  blocks: GuideBlock[]
  images: { file: string; caption: string }[]
} {
  // Tables list the quest's items (shown from tarkov.dev's data instead), with their icons.
  let section = stripNested(guideSection(wikitext), '{|', '|}')
  const found: { at: number; file: string; caption: string }[] = []
  const cut: { start: number; end: number }[] = []
  for (const gallery of section.matchAll(/<gallery[^>]*>([\s\S]*?)<\/gallery>/gi)) {
    for (const line of gallery[1].split('\n')) {
      const [file, ...caption] = splitOptions(line.trim())
      const name = file?.replace(/^(?:File|Image)\s*:/i, '').trim()
      if (name) found.push({ at: gallery.index, file: name, caption: caption.join('|') })
    }
    cut.push({ start: gallery.index, end: gallery.index + gallery[0].length })
  }
  for (const link of fileLinks(section)) {
    if (cut.some((c) => link.start >= c.start && link.start < c.end)) continue
    const [file, ...options] = splitOptions(link.inner)
    const px = options.map((o) => /^(\d+)(?:x\d+)?px$/i.exec(o.trim())).find(Boolean)
    const framed = options.some((o) => /^(thumb|thumbnail|frame|framed)$/i.test(o.trim()))
    if (framed || !px || Number(px[1]) > ICON_MAX_PX)
      found.push({
        at: link.start,
        file: file.replace(/^\s*(?:File|Image)\s*:/i, ''),
        caption: options.filter((o) => !IMAGE_OPTION.test(o.trim())).pop() ?? ''
      })
    cut.push(link)
  }
  for (const { start, end } of cut.sort((a, b) => b.start - a.start))
    section = `${section.slice(0, start)}\n${section.slice(end)}`
  const images: { file: string; caption: string }[] = []
  for (const { file, caption } of found.sort((a, b) => a.at - b.at)) {
    const key = fileKey(file)
    if (key && !images.some((i) => i.file === key)) images.push({ file: key, caption: plainText(caption) })
  }

  section = section
    .replace(/\[\[(?:Category|[a-z]{2}(?:-[a-z]{2})?):[^\]]*\]\]/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  const blocks: GuideBlock[] = []
  let paragraph: string[] = []
  const flush = (): void => {
    const text = plainText(paragraph.join(' '))
    if (text) blocks.push({ kind: 'p', text })
    paragraph = []
  }
  for (const raw of stripNested(section, '{{', '}}').split('\n')) {
    const line = raw.trim()
    const heading = /^=+\s*(.*?)\s*=+$/.exec(line)
    const item = /^[*#:]+\s*(.*)$/.exec(line)
    if (!line) flush()
    else if (heading) {
      flush()
      const text = plainText(heading[1])
      if (text) blocks.push({ kind: 'h', text })
    } else if (item) {
      flush()
      const text = plainText(item[1])
      if (text) blocks.push({ kind: 'li', text })
    } else paragraph.push(line)
  }
  flush()
  return { blocks, images }
}

export async function wikiApi(fetchFn: FetchFn, params: Record<string, string>): Promise<Raw> {
  const query = new URLSearchParams({ format: 'json', formatversion: '2', ...params })
  const body = (await fetchJson(
    fetchFn,
    `${WIKI_BASE}/api.php?${query}`,
    { headers: { Accept: 'application/json' } },
    TIMEOUT_MS
  )) as Raw
  const error = body.error as Raw | undefined
  if (error?.code === 'missingtitle') throw new MissingPage()
  if (error) throw new Error(`The wiki said: ${String(error.info ?? error.code)}`)
  return body
}

/** Where the wiki serves each file (scaled to IMAGE_WIDTH at most), by file name. */
export async function imageInfo(
  fetchFn: FetchFn,
  files: string[]
): Promise<Map<string, Omit<GuideImage, 'caption'>>> {
  const result = new Map<string, Omit<GuideImage, 'caption'>>()
  for (let i = 0; i < files.length; i += 50) {
    const body = await wikiApi(fetchFn, {
      action: 'query',
      titles: files
        .slice(i, i + 50)
        .map((f) => `File:${f}`)
        .join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      iiurlwidth: String(IMAGE_WIDTH)
    })
    for (const page of ((body.query as Raw | undefined)?.pages ?? []) as Raw[]) {
      const info = ((page.imageinfo ?? []) as Raw[])[0]
      const file = String(page.title ?? '').replace(/^File:/, '')
      if (!info || typeof info.url !== 'string' || !String(info.mime ?? '').startsWith('image/')) continue
      result.set(file, {
        file,
        thumb: typeof info.thumburl === 'string' ? info.thumburl : info.url,
        full: info.url,
        width: Number(info.thumbwidth ?? info.width) || 0,
        height: Number(info.thumbheight ?? info.height) || 0,
        page: typeof info.descriptionurl === 'string' ? info.descriptionurl : `${WIKI_PAGE}File:${file}`
      })
    }
  }
  return result
}

export async function fetchQuestGuide(fetchFn: FetchFn, title: string, now: number): Promise<QuestGuide> {
  const body = await wikiApi(fetchFn, { action: 'parse', page: title, prop: 'wikitext', redirects: '1' })
  const parsed = (body.parse ?? {}) as Raw
  const wikitext = typeof parsed.wikitext === 'string' ? parsed.wikitext : ''
  const pageTitle = typeof parsed.title === 'string' ? parsed.title : title
  const { blocks, images } = parseGuide(wikitext)
  const info = images.length
    ? await imageInfo(
        fetchFn,
        images.map((i) => i.file)
      )
    : new Map()
  return {
    title: pageTitle,
    url: `${WIKI_PAGE}${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
    blocks,
    images: images.flatMap((i) => {
      const found = info.get(i.file)
      return found ? [{ ...found, caption: i.caption }] : []
    }),
    fetchedAt: now
  }
}

/** Quest guides from the wiki: cached on disk per page, refreshed weekly, the cache when offline. */
export function createQuestGuideService(deps: { fetchFn: FetchFn; cacheDir: string; now?: () => number }) {
  const now = deps.now ?? Date.now
  const memory = new Map<string, QuestGuide>()
  const inFlight = new Map<string, Promise<QuestGuideState>>()
  const cacheFile = (title: string): string => {
    const hash = createHash('sha1').update(title).digest('hex').slice(0, 8)
    return join(deps.cacheDir, 'quest-guides', `${title.replace(/[^\w-]+/g, '_').slice(0, 80)}-${hash}.json`)
  }

  async function load(title: string): Promise<QuestGuideState> {
    let cached = memory.get(title)
    if (!cached) {
      const raw = (await readJsonFile(cacheFile(title))) as QuestGuide | undefined
      if (raw?.blocks && raw.images) cached = raw
    }
    if (cached && now() - cached.fetchedAt < MAX_AGE_MS) {
      memory.set(title, cached)
      return { guide: cached, error: null }
    }
    try {
      const guide = await fetchQuestGuide(deps.fetchFn, title, now())
      await writeJsonFileAtomic(cacheFile(title), guide)
      memory.set(title, guide)
      return { guide, error: null }
    } catch (err) {
      const reason =
        err instanceof MissingPage
          ? err.message
          : `Couldn't load the guide from the wiki: ${errorMessage(err)}`
      return { guide: cached ?? null, error: reason }
    }
  }

  return {
    /** The guide on a quest's wiki page (`wikiLink` as tarkov.dev gives it). */
    get(wikiLink: string | null): Promise<QuestGuideState> {
      const title = wikiTitle(wikiLink)
      if (!title) return Promise.resolve({ guide: null, error: 'This quest has no wiki page.' })
      const pending = inFlight.get(title)
      if (pending) return pending
      const request = load(title).finally(() => inFlight.delete(title))
      inFlight.set(title, request)
      return request
    }
  }
}

export type QuestGuideService = ReturnType<typeof createQuestGuideService>
