import { describe, expect, it } from 'vitest'
import {
  panelFor,
  posterFor,
  POSTER_MAPS,
  toImagePoint,
  type PosterMap
} from '../src/renderer/src/lib/posterMap'
import { DB4TARKOV_MAPS } from '../src/shared/db4tarkov'
import { RE3MR_FILES } from '../src/shared/re3mr'

const map = (key: string): PosterMap => {
  const m = posterFor(key)
  if (!m) throw new Error(`no 2D map for ${key}`)
  return m
}
const at = (x: number, y: number | null, z: number) => ({ x, y, z })

describe('2D maps', () => {
  it('covers Re3MR’s and db4tarkov’s maps, with the images the app is allowed to fetch', () => {
    expect(POSTER_MAPS.map((m) => m.key).sort()).toEqual([
      'customs',
      'factory',
      'ground-zero',
      'icebreaker',
      'shoreline',
      'terminal',
      'the-labyrinth',
      'woods'
    ])
    const re3mr = POSTER_MAPS.filter((m) => m.provider === 're3mr')
    expect(re3mr.map((m) => m.file).sort()).toEqual([...RE3MR_FILES].sort())
    const db4 = POSTER_MAPS.filter((m) => m.provider === 'db4tarkov')
    expect(Object.fromEntries(db4.map((m) => [m.tiles!.slug, m.tiles!.maxZoom]))).toEqual(
      Object.fromEntries(Object.entries(DB4TARKOV_MAPS).map(([slug, { maxZoom }]) => [slug, maxZoom]))
    )
    // At the top zoom a 512 px tile is 512 image pixels: the image fits the tile grid.
    for (const m of db4)
      expect(Math.max(m.width, m.height), m.key).toBeLessThanOrEqual(512 * 2 ** (m.tiles!.maxZoom - 1))
    expect(posterFor('lighthouse')).toBeNull()
  })

  it('gives every height exactly one whole-map panel, and each inset area one panel per height', () => {
    for (const m of POSTER_MAPS) {
      const groups = new Map<string, typeof m.panels>()
      for (const p of m.panels) {
        const key = JSON.stringify(p.area ?? null)
        groups.set(key, [...(groups.get(key) ?? []), p])
      }
      expect(groups.has('null'), m.key).toBe(true)
      for (const [area, panels] of groups) {
        expect(panels[0].minY, `${m.key} ${area}`).toBeNull()
        if (area === 'null') expect(panels.at(-1)!.maxY, m.key).toBeNull()
        for (let i = 1; i < panels.length; i++) expect(panels[i].minY, m.key).toBe(panels[i - 1].maxY)
      }
    }
  })

  it('picks the floor by height, and the nearest floor outside every range', () => {
    const factory = map('factory')
    expect(panelFor(factory, at(0, -3, 0)).name).toBe('Tunnels')
    expect(panelFor(factory, at(0, 0.5, 0)).name).toBe('Ground floor')
    expect(panelFor(factory, at(0, 4.6, 0)).name).toBe('Middle floor')
    expect(panelFor(factory, at(0, 9, 0)).name).toBe('Top floor')
    const gappy: PosterMap = {
      ...factory,
      panels: [
        { name: 'low', minY: null, maxY: 0, transform: [1, 0, 0, 1, 0, 0] },
        { name: 'high', minY: 10, maxY: null, transform: [1, 0, 0, 1, 0, 0] }
      ]
    }
    expect(panelFor(gappy, at(0, 2, 0)).name).toBe('low')
    expect(panelFor(gappy, at(0, 8, 0)).name).toBe('high')
  })

  it('puts positions inside a building with an inset on that inset’s floor', () => {
    const shoreline = map('shoreline')
    // tarkov.dev's positions of the Labyrinth transit, the gym and admin basement extracts, and a pier.
    expect(panelFor(shoreline, at(-195.13, -9.83, -82.93)).name).toBe('Resort west wing, basement')
    expect(panelFor(shoreline, at(-296.95, -6.63, -100.89)).name).toBe('Resort east wing, 1st floor')
    expect(panelFor(shoreline, at(-256.87, -7.71, -149.78)).name).toBe('Resort admin, basement')
    expect(panelFor(shoreline, at(-200, 3, -80)).name).toBe('Resort west wing, 3rd floor')
    expect(panelFor(shoreline, at(-335.89, -66.12, 564.14)).name).toBe('Map')
    // No particular floor: the whole map, even inside the resort.
    expect(panelFor(shoreline, at(-195, null, -83)).name).toBe('Map')

    const gz = map('ground-zero')
    expect(panelFor(gz, at(80, 15, 45)).name).toBe('Underground (garage)')
    expect(panelFor(gz, at(130, 15, 60)).name).toBe('Underground (underpass)')
    expect(panelFor(gz, at(80, 25, 45)).name).toBe('Map')
  })

  // Game positions from tarkov.dev's map data, and where the image draws the same thing (image pixels).
  const references: [string, string, { x: number; y: number; z: number }, [number, number], number][] = [
    ['factory', 'Med Tent Gate door lock', { x: -19.08, y: 1.45, z: -48.57 }, [4710, 1577], 50],
    ['factory', 'Transit to The Lab (tunnels)', { x: -27.01, y: -3.09, z: -42.75 }, [6288, 1673], 50],
    ['factory', 'office door lock (top floor)', { x: 29.12, y: 9.08, z: 36.52 }, [413, 977], 50],
    ['terminal', 'PMC spawn (Infiltration)', { x: 127.57, y: -60.07, z: -417.35 }, [4733, 1667], 40],
    ['the-labyrinth', 'The Way Up', { x: -7.31, y: -0.01, z: 40.13 }, [3552, 1805], 60],
    ['the-labyrinth', 'Toxic Puddle trap switch', { x: 46.42, y: 1.03, z: 11.08 }, [2596, 3552], 90],
    ['icebreaker', 'Helicopter extract (helipad)', { x: 0.28, y: 22.56, z: -66.03 }, [4658, 477], 40],
    ['icebreaker', 'PMC spawn (infirmary deck)', { x: -0.35, y: 19.48, z: 82.34 }, [5196, 2542], 40],
    ['customs', 'Big Red (the warehouse’s middle)', { x: -215, y: 2, z: -119 }, [3505, 611], 40],
    ['ground-zero', 'Emercom Checkpoint', { x: 151.63, y: 24.66, z: -97.46 }, [1852, 740], 60],
    ['woods', 'Friendship Bridge', { x: 93.17, y: 16.57, z: -843.98 }, [2800, 488], 40],
    ['shoreline', 'Lighthouse (end of the pier)', { x: -458.15, y: -54.29, z: 567.29 }, [3369, 4380], 40]
  ]
  it.each(references)('places %s: %s where the image draws it', (key, _what, position, [u, v], tolerance) => {
    const [x, y] = toImagePoint(map(key), position)
    expect(Math.hypot(x - u, y - v)).toBeLessThan(tolerance)
  })

  it('draws an outline on its zone’s floor', () => {
    const factory = map('factory')
    const corner = { x: 30, y: 6.5, z: 36 }
    expect(toImagePoint(factory, corner, { ...corner, y: 1 })).not.toEqual(toImagePoint(factory, corner))
    expect(toImagePoint(factory, corner, { ...corner, y: 1 })).toEqual(
      toImagePoint(factory, { ...corner, y: 1 })
    )
  })
})
