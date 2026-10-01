/**
 * Temporary probe for 1.7.0: how many quests' wiki links give a guide with pictures. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'
import { fetchQuestData } from '../src/main/quests/questData'
import { fetchQuestGuide, wikiTitle } from '../src/main/quests/questGuide'

async function main(): Promise<void> {
  const data = await fetchQuestData(fetch, 'pvp', Date.now())
  const quests = data.quests.filter((_, i) => i % 12 === 0).slice(0, 45)
  let ok = 0
  let withImages = 0
  for (const q of quests) {
    const title = wikiTitle(q.wikiLink)
    try {
      if (!title) throw new Error(`no title in ${q.wikiLink}`)
      const guide = await fetchQuestGuide(fetch, title, Date.now())
      ok++
      if (guide.images.length) withImages++
      console.log(
        `[guide] ${q.name}: ${guide.blocks.length} blocks, ${guide.images.length} pictures` +
          ` (${guide.images
            .map((i) => i.caption || i.file)
            .join(' | ')
            .slice(0, 200)}) ${guide.blocks[0]?.text.slice(0, 120) ?? ''}`
      )
    } catch (err) {
      console.log(`[guide] ${q.name}: FAILED ${errorMessage(err)} (${q.wikiLink})`)
    }
  }
  console.log(`[guide] ${ok} of ${quests.length} guides, ${withImages} with pictures`)
}

void main()
