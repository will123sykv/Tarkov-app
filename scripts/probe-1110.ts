/**
 * Temporary probe for 1.11.0: the wiki pages of the story chapters, for writing and testing the
 * chapter parser. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'

const PAGES = [
  'Story chapters',
  'Tour',
  'Falling Skies',
  'The Ticket',
  'Batya',
  'The Unheard',
  'Blue Fire',
  'They Are Already Here',
  'Accidental Witness',
  'The Labyrinth (story chapter)',
  'Boreas'
]

async function main(): Promise<void> {
  for (const page of PAGES) {
    try {
      const url = `https://escapefromtarkov.fandom.com/api.php?${new URLSearchParams({
        format: 'json',
        formatversion: '2',
        action: 'parse',
        page,
        prop: 'wikitext',
        redirects: '1'
      })}`
      const body = (await (await fetch(url)).json()) as { parse?: { title?: string; wikitext?: string } }
      const text = body.parse?.wikitext ?? ''
      console.log(`[page] ${page} ${text.length} ${Buffer.from(text).toString('base64')}`)
    } catch (e) {
      console.log(`[page] ${page} failed: ${errorMessage(e)}`)
    }
  }
}

main().catch((e) => console.log(`[probe] failed: ${errorMessage(e)}`))
