import type { WikiExit, WikiMapExits } from '../../shared/questTypes'
import type { FetchFn } from '../pricing/http'
import { plainText } from './questGuide'
import { fetchPages } from './wikiQuests'

// What each map's page on the wiki says about its extracts and transits: the Extractions and Transits
// tables (Name, Faction, Always available, Single-Use, Requirements, Notes), for the map's extract
// popups. tarkov.dev only says what a vehicle or secret extract costs.

/** A table cell's markup as lines of text: files named by what they link to, roubles as amounts. */
function cellLines(markup: string): string[] {
  const text = markup
    // [[File:5000 Roubles.png|...]] per player: 5,000 ₽ per player.
    .replace(
      /\[\[File:([\d,.]+) Roubles\.png[^\]]*\]\]/gi,
      (_, n: string) => `${Number(n.replace(/[,.]/g, '')).toLocaleString('en-GB')} ₽`
    )
    // A file linking to an item (a key's icon): the item.
    .replace(/\[\[File:[^\]]*?\|link=([^\]|]+)[^\]]*\]\]/gi, '$1')
    .replace(/<font[^>]*>\s*✔\s*<\/font>/gi, 'Yes')
    .replace(/<font[^>]*>\s*✘\s*<\/font>/gi, 'No')
    .replace(/✔/g, 'Yes')
    .replace(/✘/g, 'No')
  return text
    .split(/<br\s*\/?>|\n/i)
    .map((line) =>
      plainText(line)
        .replace(/^[-–]$/, '')
        .trim()
    )
    .filter(Boolean)
}

/** Split a row line into cells on `||` (or `!!`) outside links and templates. */
function splitCells(line: string, separator: '||' | '!!'): string[] {
  const cells: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < line.length; i++) {
    const two = line.slice(i, i + 2)
    if (two === '[[' || two === '{{') depth++
    else if ((two === ']]' || two === '}}') && depth) depth--
    if (two === separator && !depth) {
      cells.push(current)
      current = ''
      i++
    } else current += line[i]
  }
  cells.push(current)
  return cells
}

/** A cell's content without its attributes (`style="…" |Name`: Name). */
function cellContent(cell: string): string {
  let depth = 0
  for (let i = 0; i < cell.length; i++) {
    const two = cell.slice(i, i + 2)
    if (two === '[[' || two === '{{') depth++
    else if ((two === ']]' || two === '}}') && depth) depth--
    else if (cell[i] === '|' && !depth) return cell.slice(i + 1)
  }
  return cell
}

/** The rows of the first table after a section heading (`==Extractions==`), as cells by column name. */
export function sectionTable(wikitext: string, heading: RegExp): Record<string, string>[] {
  const lines = wikitext.split('\n')
  const at = lines.findIndex((l) => /^==[^=]/.test(l.trim()) && heading.test(l))
  if (at < 0) return []
  const start = lines.findIndex((l, i) => i > at && l.trim().startsWith('{|'))
  if (start < 0 || lines.slice(at + 1, start).some((l) => /^==[^=]/.test(l.trim()))) return []
  const columns: string[] = []
  const rows: string[][] = []
  let row: string[] | null = null
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim()
    if (line.startsWith('|}')) break
    if (line.startsWith('|-')) {
      row = []
      rows.push(row)
    } else if (line.startsWith('!') || line.startsWith('|')) {
      const separator = line.startsWith('!') ? '!!' : '||'
      const cells = splitCells(line.slice(1), separator).map(cellContent)
      if (row) row.push(...cells)
      else columns.push(...cells.map((c) => c.trim().toLowerCase()))
    } else if (row?.length) row[row.length - 1] += `\n${raw}`
  }
  return rows
    .filter((r) => r.length >= columns.length - 1)
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])))
}

function exits(rows: Record<string, string>[]): WikiExit[] {
  const result: WikiExit[] = []
  for (const row of rows) {
    const name = cellLines(row.name ?? '').join(' ')
    if (!name) continue
    result.push({
      name,
      faction: cellLines(row.faction ?? '').join(' ') || 'All',
      alwaysAvailable: cellLines(row['always available'] ?? '').join(', '),
      singleUse: /^yes/i.test(cellLines(row['single-use'] ?? '').join(' ')),
      requirements: cellLines(row.requirements ?? ''),
      // Sounds and pictures aren't text; the rest, a sentence or so a line.
      notes: cellLines((row.notes ?? '').replace(/\[\[File:[^\]]*\.(wav|ogg|mp3)[^\]]*\]\]/gi, ''))
    })
  }
  return result
}

/** A map page's extracts and transits. */
export function wikiMapExits(wikitext: string): WikiMapExits {
  return {
    extracts: exits(sectionTable(wikitext, /Extractions?\b/i)),
    transits: exits(sectionTable(wikitext, /Transits?\b/i))
  }
}

/** A map's page on the wiki: Night Factory's is Factory's, Ground Zero 21+'s is Ground Zero's. */
export function mapPageTitle(name: string): string {
  return name.replace(/^night\s+/i, '').replace(/\s*21\+$/, '')
}

/** Each map's extracts and transits from its wiki page, by map id (maps without a page left out). */
export async function fetchWikiExtracts(
  fetchFn: FetchFn,
  maps: readonly { id: string; name: string }[]
): Promise<Record<string, WikiMapExits>> {
  const titles = [...new Set(maps.map((m) => mapPageTitle(m.name)))]
  const byTitle = new Map<string, WikiMapExits>()
  for (const page of await fetchPages(fetchFn, titles)) {
    const found = wikiMapExits(page.wikitext)
    if (found.extracts.length || found.transits.length) byTitle.set(page.asked, found)
  }
  const result: Record<string, WikiMapExits> = {}
  for (const m of maps) {
    const found = byTitle.get(mapPageTitle(m.name))
    if (found) result[m.id] = found
  }
  return result
}
