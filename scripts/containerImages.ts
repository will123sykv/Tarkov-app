/** Wiki page titles to try for a container, in order; the first page with an image wins. */
export type TitleOverrides = Record<string, string[]>

export interface ContainerRef {
  id: string
  name: string
}

export interface PageImage {
  /** Final page title after normalisation and redirects. */
  pageTitle: string
  source: string
  width: number
  height: number
  /** File name of the image on the wiki. */
  file: string | null
}

/** MediaWiki `prop=pageimages` response (formatversion=2), as much of it as we read. */
export interface PageImagesResponse {
  query?: {
    normalized?: { from: string; to: string }[]
    redirects?: { from: string; to: string }[]
    pages?: {
      title: string
      missing?: boolean
      pageimage?: string
      thumbnail?: { source: string; width: number; height: number }
    }[]
  }
}

export function candidateTitles(
  containers: ContainerRef[],
  overrides: TitleOverrides
): Map<string, string[]> {
  return new Map(containers.map((c) => [c.id, overrides[c.id] ?? [c.name]]))
}

/** Pick, for each container, the first candidate title whose page has a lead image. */
export function parsePageImages(
  response: PageImagesResponse,
  candidates: Map<string, string[]>
): Map<string, PageImage> {
  const query = response.query ?? {}
  const renames = new Map<string, string>()
  for (const { from, to } of [...(query.normalized ?? []), ...(query.redirects ?? [])]) renames.set(from, to)
  const resolve = (title: string): string => {
    const seen = new Set<string>()
    while (renames.has(title) && !seen.has(title)) {
      seen.add(title)
      title = renames.get(title)!
    }
    return title
  }
  const pages = new Map((query.pages ?? []).map((p) => [p.title, p]))

  const result = new Map<string, PageImage>()
  for (const [id, titles] of candidates) {
    for (const title of titles) {
      const page = pages.get(resolve(title))
      if (!page || page.missing || !page.thumbnail?.source) continue
      result.set(id, {
        pageTitle: page.title,
        source: page.thumbnail.source,
        width: page.thumbnail.width,
        height: page.thumbnail.height,
        file: page.pageimage ?? null
      })
      break
    }
  }
  return result
}

export function extensionFor(contentType: string | null): string | null {
  const type = contentType?.split(';')[0].trim().toLowerCase()
  switch (type) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return null
  }
}

export function wikiPageUrl(title: string): string {
  return `https://escapefromtarkov.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}
