import type { GuideImage } from './questTypes'

// Which map a guide's picture is of, from the words around it: the heading it's under, its caption or
// its file name, in that order (a heading naming a map is surest; a caption can mention a map in
// passing, "the factory chimney on Customs").

/** A map (or maps shown as one) and the names it goes by. */
export interface MapNames {
  key: string
  names: string[]
}

/** The names a map goes by in the wiki's words: "Streets of Tarkov" is "Streets", "The Lab" "Labs". */
export function mapAliases(name: string): string[] {
  const names = new Set([name])
  const bare = name.replace(/^the\s+/i, '')
  names.add(bare)
  if (/^streets of tarkov$/i.test(name)) names.add('Streets')
  if (/^lab$/i.test(bare)) names.add('Labs')
  if (/^ground zero/i.test(name)) names.add('Ground Zero')
  return [...names].map((n) => n.toLowerCase())
}

const words = (text: string): string =>
  ` ${text
    // File names run words together: "ViewerWoodsLocation", "LabsServerRoomMap".
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\.(png|jpe?g|gif|webp)$/i, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()} `

/** The maps (keys) a picture shows: by its heading, else its caption, else its file name. */
export function imageMaps(
  image: Pick<GuideImage, 'heading' | 'caption' | 'file'>,
  maps: readonly MapNames[]
): string[] {
  for (const text of [image.heading ?? '', image.caption, image.file]) {
    const said = words(text)
    const found = maps.filter((m) => m.names.some((n) => said.includes(words(n)))).map((m) => m.key)
    if (found.length) return found
  }
  return []
}

/**
 * Each picture's maps (see `imageMaps`); a picture naming none takes the map of the others under the
 * same heading, when they agree ("Locate the fallen plane": the map, then a photo of the plane on Woods).
 */
export function guideImageMaps(
  images: readonly Pick<GuideImage, 'heading' | 'caption' | 'file'>[],
  maps: readonly MapNames[]
): string[][] {
  const own = images.map((image) => imageMaps(image, maps))
  return own.map((found, i) => {
    const heading = images[i].heading ?? ''
    if (found.length || !heading) return found
    const siblings = own.filter((o, j) => j !== i && o.length && images[j].heading === heading)
    const first = siblings[0]?.join()
    return first && siblings.every((o) => o.join() === first) ? siblings[0] : []
  })
}
