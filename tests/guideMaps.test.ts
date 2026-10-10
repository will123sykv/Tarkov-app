import { describe, expect, it } from 'vitest'
import { guideImageMaps, imageMaps, mapAliases } from '../src/shared/guideMaps'

const MAPS = [
  'Customs',
  'Woods',
  'Factory',
  'Streets of Tarkov',
  'The Lab',
  'The Labyrinth',
  'Ground Zero'
].map((name) => ({ key: name, names: mapAliases(name) }))
const image = (heading: string, caption: string, file = 'Picture.png') => ({ heading, caption, file })

describe('which map a guide picture is of', () => {
  it('knows the names the wiki uses for a map', () => {
    expect(mapAliases('Streets of Tarkov')).toEqual(['streets of tarkov', 'streets'])
    expect(mapAliases('The Lab')).toEqual(['the lab', 'lab', 'labs'])
    expect(mapAliases('Ground Zero 21+')).toEqual(['ground zero 21+', 'ground zero'])
  })

  it('goes by the heading first, then the caption, then the file name', () => {
    // The caption mentions the factory chimney, but the heading says Customs.
    expect(imageMaps(image('Customs', 'The factory chimney'), MAPS)).toEqual(['Customs'])
    expect(imageMaps(image('Part 2', 'The stash on Streets'), MAPS)).toEqual(['Streets of Tarkov'])
    expect(imageMaps(image('', '', 'Shooter Born in Heaven Woods.png'), MAPS)).toEqual(['Woods'])
    expect(imageMaps(image('', 'Inside the Labs elevator'), MAPS)).toEqual(['The Lab'])
  })

  it('matches whole words, and leaves pictures naming no map unplaced', () => {
    expect(imageMaps(image('', 'Deep in The Labyrinth'), MAPS)).toEqual(['The Labyrinth'])
    expect(imageMaps(image('', 'Woodsman’s cabin'), MAPS)).toEqual([])
    expect(imageMaps(image('Guide', 'The spot', 'Spot 1.jpg'), MAPS)).toEqual([])
  })

  it('reads file names that run words together', () => {
    expect(imageMaps(image('', 'Placement location', 'ViewerWoodsLocation.png'), MAPS)).toEqual(['Woods'])
    expect(imageMaps(image('', '', 'StreetsTransitToLabsMap.png'), MAPS)).toEqual([
      'Streets of Tarkov',
      'The Lab'
    ])
  })

  it('gives a picture naming no map the map of the others under its heading, when they agree', () => {
    // Falling Skies, as the wiki has it.
    const plane = 'Locate the fallen plane'
    const recorder = 'Retrieve the flight recorder'
    expect(
      guideImageMaps(
        [
          image(plane, 'Location marked on map', 'Falling Skies Map.jpg'),
          image(plane, 'The wanted plane', 'Woods Showcase 12.png'),
          image(recorder, 'The recorder', 'Recorder.png'),
          image('Both', 'On Customs', 'a.png'),
          image('Both', 'On Woods', 'b.png'),
          image('Both', 'The spot', 'c.png')
        ],
        MAPS
      )
    ).toEqual([['Woods'], ['Woods'], [], ['Customs'], ['Woods'], []])
  })
})
