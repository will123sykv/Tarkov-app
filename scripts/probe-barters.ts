// Temporary: the wiki's Lab map image (its URL, size, uploader and licence), to show it (removed after use).

const WIKI = 'https://escapefromtarkov.fandom.com/api.php'
const UA = { 'user-agent': 'TarkovLootOptimiser-probe/1.0 (github.com/will123sykv/tarkov-app)' }

async function main(): Promise<void> {
  const params = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    action: 'query',
    titles: 'File:The Lab Interactive Map Base.png',
    prop: 'imageinfo',
    iiprop: 'url|size|user|timestamp|sha1|mime|extmetadata',
    iilimit: '3'
  })
  const res = await fetch(`${WIKI}?${params}`, { headers: UA })
  const json = (await res.json()) as {
    query: { pages: { title: string; imageinfo?: Record<string, unknown>[] }[] }
  }
  for (const page of json.query.pages) {
    console.log('PAGE', page.title)
    for (const info of page.imageinfo ?? []) {
      const { extmetadata, ...rest } = info
      console.log('INFO', JSON.stringify(rest))
      const meta = (extmetadata ?? {}) as Record<string, { value: unknown }>
      for (const key of ['LicenseShortName', 'License', 'LicenseUrl', 'Artist', 'Credit', 'Attribution'])
        if (meta[key]) console.log('META', key, JSON.stringify(meta[key].value).slice(0, 300))
    }
  }
  const url = json.query.pages[0]?.imageinfo?.[0]?.url as string | undefined
  if (!url) return
  // Whether the image comes straight from the CDN (as the app will fetch it), and how big it is.
  const image = await fetch(url, { headers: UA })
  const bytes = new Uint8Array(await image.arrayBuffer())
  console.log('IMAGE', image.status, image.headers.get('content-type'), bytes.length, 'bytes')
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const view = new DataView(bytes.buffer)
    console.log('PNG size', view.getUint32(16), 'x', view.getUint32(20))
  }
  console.log('final url', image.url)
}

void main().catch((e) => console.log('failed', e))
