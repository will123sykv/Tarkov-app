import { describe, expect, it } from 'vitest'
import {
  candidateTitles,
  extensionFor,
  parsePageImages,
  wikiPageUrl,
  type PageImagesResponse
} from '../scripts/containerImages'

const thumb = (name: string) => ({
  source: `https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/${name}/revision/latest/scale-to-width-down/480`,
  width: 480,
  height: 270
})

const response: PageImagesResponse = {
  query: {
    normalized: [{ from: 'medbag SMU06', to: 'Medbag SMU06' }],
    redirects: [
      { from: 'Medbag SMU06', to: 'Medbag' },
      { from: 'Dead Scav', to: 'Scav corpse' }
    ],
    pages: [
      { title: 'Jacket', pageimage: 'Jacket.png', thumbnail: thumb('Jacket.png') },
      { title: 'Medbag', pageimage: 'Medbag.png', thumbnail: thumb('Medbag.png') },
      { title: 'Scav corpse', pageimage: 'Scav_corpse.jpg', thumbnail: thumb('Scav_corpse.jpg') },
      { title: 'PMC body', missing: true },
      { title: 'Common fund stash' },
      {
        title: 'Lab technician body',
        pageimage: 'Saving_the_Mole_Map.png',
        thumbnail: thumb('Saving_the_Mole_Map.png')
      },
      { title: 'Civilian body', pageimage: 'Dead_Civilian.png', thumbnail: thumb('Dead_Civilian.png') }
    ]
  }
}

describe('container images', () => {
  const candidates = candidateTitles(
    [
      { id: 'jacket', name: 'Jacket' },
      { id: 'medbag-smu06', name: 'Medbag SMU06' },
      { id: 'pmc-body', name: 'PMC body' },
      { id: 'common-fund-stash', name: 'Common fund stash' },
      { id: 'lab-technician-body', name: 'Lab technician body' },
      { id: 'jacket-without-picture', name: 'Jacket' }
    ],
    {
      'medbag-smu06': ['medbag SMU06'],
      'pmc-body': ['PMC body', 'Dead Scav'],
      'lab-technician-body': ['Lab technician body', 'Civilian body'],
      'jacket-without-picture': []
    }
  )

  it('uses the container name unless an override lists titles', () => {
    expect(candidates.get('jacket')).toEqual(['Jacket'])
    expect(candidates.get('pmc-body')).toEqual(['PMC body', 'Dead Scav'])
  })

  it('follows normalisation and redirects to the page with the image', () => {
    const images = parsePageImages(response, candidates)
    expect(images.get('jacket')).toMatchObject({ pageTitle: 'Jacket', file: 'Jacket.png', width: 480 })
    expect(images.get('medbag-smu06')).toMatchObject({ pageTitle: 'Medbag', file: 'Medbag.png' })
  })

  it('falls through missing pages to the next candidate', () => {
    expect(parsePageImages(response, candidates).get('pmc-body')?.pageTitle).toBe('Scav corpse')
  })

  it('skips map images and falls back to the next candidate', () => {
    expect(parsePageImages(response, candidates).get('lab-technician-body')?.file).toBe('Dead_Civilian.png')
  })

  it('gives no picture for an empty candidate list', () => {
    expect(parsePageImages(response, candidates).has('jacket-without-picture')).toBe(false)
  })

  it('skips containers whose pages have no image', () => {
    expect(parsePageImages(response, candidates).has('common-fund-stash')).toBe(false)
    expect(parsePageImages({}, candidates).size).toBe(0)
  })

  it('maps content types to file extensions', () => {
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/jpeg; charset=binary')).toBe('jpg')
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('text/html')).toBeNull()
    expect(extensionFor(null)).toBeNull()
  })

  it('builds wiki page links', () => {
    expect(wikiPageUrl('PC block')).toBe('https://escapefromtarkov.fandom.com/wiki/PC_block')
  })
})
