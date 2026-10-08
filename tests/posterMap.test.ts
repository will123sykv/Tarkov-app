import { describe, expect, it } from 'vitest'
import {
  fromImagePoint,
  panelFor,
  posterFor,
  POSTER_MAPS,
  sizeMismatch,
  toImagePoint,
  type PosterMap
} from '../src/renderer/src/lib/posterMap'
import { MAP_CONFIGS } from '../src/renderer/src/lib/questUi'
import { DB4TARKOV_MAPS } from '../src/shared/db4tarkov'
import { RE3MR_FILES } from '../src/shared/re3mr'
import { WIKI_MAPS } from '../src/shared/wikiMaps'

const map = (key: string): PosterMap => {
  const m = posterFor(key)
  if (!m) throw new Error(`no 2D map for ${key}`)
  return m
}
const at = (x: number, y: number | null, z: number) => ({ x, y, z })

describe('2D maps', () => {
  it('covers Re3MR’s, db4tarkov’s and the wiki’s maps, with the images the app is allowed to fetch', () => {
    expect(POSTER_MAPS.map((m) => m.key).sort()).toEqual([
      'customs',
      'factory',
      'ground-zero',
      'icebreaker',
      'interchange',
      'lighthouse',
      'reserve',
      'shoreline',
      'streets-of-tarkov',
      'terminal',
      'the-lab',
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
    const wiki = POSTER_MAPS.filter((m) => m.provider === 'wiki')
    expect(wiki.map((m) => m.file).sort()).toEqual(Object.keys(WIKI_MAPS).sort())
  })

  it('gives every height exactly one whole-map panel, and each inset area at most one per height', () => {
    for (const m of POSTER_MAPS) {
      const groups = new Map<string, typeof m.panels>()
      for (const p of m.panels) {
        const key = JSON.stringify(p.area ?? null)
        groups.set(key, [...(groups.get(key) ?? []), p])
      }
      expect(groups.has('null'), m.key).toBe(true)
      for (const [area, panels] of groups) {
        if (area === 'null') {
          expect(panels[0].minY, m.key).toBeNull()
          expect(panels.at(-1)!.maxY, m.key).toBeNull()
          for (let i = 1; i < panels.length; i++) expect(panels[i].minY, m.key).toBe(panels[i - 1].maxY)
        } else {
          // An inset's heights needn't start at the bottom (Reserve's upper bunker level), but never overlap.
          for (let i = 1; i < panels.length; i++)
            expect(panels[i].minY!, `${m.key} ${area}`).toBeGreaterThanOrEqual(panels[i - 1].maxY!)
        }
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

  it('puts Reserve’s bunkers and Interchange’s mall on their own plans', () => {
    const reserve = map('reserve')
    // tarkov.dev's extract positions.
    expect(panelFor(reserve, at(61.92, -5.26, -190.54)).name).toBe('Underground north (hermetic door)')
    expect(panelFor(reserve, at(120.78, -10.27, -120.35)).name).toBe('Underground north (storage bunker)')
    expect(panelFor(reserve, at(-121.48, -17, 172.25)).name).toBe('Underground south (D-2)')
    expect(panelFor(reserve, at(36.53, -5.97, -221.56)).name).toBe('Map') // Exit to Woods, at the fence
    // Reserve's place names (the ground and up) stay on the map, even over the dome's tunnels.
    expect(panelFor(reserve, at(-8.5, -5.5, 175)).name).toBe('Map')
    expect(panelFor(reserve, at(-8.5, -10, 175)).name).toBe('Underground south (dome tunnels)')

    const interchange = map('interchange')
    expect(panelFor(interchange, at(-47.73, 22.97, 44.06)).name).toBe('Mall parking') // Saferoom Exfil
    expect(panelFor(interchange, at(-138.53, 22.51, -175.11)).name).toBe('Mall parking') // Smugglers' Tunnel
    expect(panelFor(interchange, at(-38, 25.5, -129)).name).toBe('Mall first floor') // Book Store
    expect(panelFor(interchange, at(-180, 36, 0)).name).toBe('Mall second floor')
    expect(panelFor(interchange, at(-30, 34.5, -150)).name).toBe('Mall second floor') // a second-floor shop
    expect(panelFor(interchange, at(-219.92, 13.79, -37.02)).name).toBe('Map') // Hole in the Fence
    expect(panelFor(interchange, at(-175.5, -0.5, 145.1)).name).toBe('Map') // the ramps, outside
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
    ['shoreline', 'Lighthouse (end of the pier)', { x: -458.15, y: -54.29, z: 567.29 }, [3369, 4380], 40],
    ['reserve', 'Tarmac (the helicopter)', { x: -120, y: -2, z: 37 }, [2378, 1440], 40],
    // The Lab: where the wiki's own markers are.
    ['the-lab', 'Main Elevator (basement)', { x: -282.7, y: -2.8, z: -334.7 }, [562.5, 101.9], 40],
    ['the-lab', 'Quarantine Zone door lock', { x: -123.2, y: 1, z: -406.5 }, [1388.1, 1813.8], 30],
    ['the-lab', 'PMC spawn by the hangar', { x: -116.5, y: 0, z: -253.9 }, [2411.6, 1835.4], 30],
    [
      'the-lab',
      'Kruglov’s Office door lock (second floor)',
      { x: -261.4, y: 5.2, z: -372.8 },
      [2892, 171.9],
      30
    ],
    ['the-lab', 'Cargo Elevator (second floor)', { x: -111.8, y: 5.4, z: -408.5 }, [2648.5, 1060.4], 30],
    ['interchange', 'Oli Tower (the roundabout)', { x: 202.3, y: 22, z: 219.4 }, [1945, 4200], 60],
    ['lighthouse', 'Northern Checkpoint (the booth)', { x: 114.67, y: 11.86, z: -989.46 }, [878, 442], 50],
    [
      'streets-of-tarkov',
      'Expo Checkpoint (the road through the wall)',
      { x: 213.12, y: -0.74, z: -104.96 },
      [2865, 1420],
      50
    ]
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

  it('turns a spot on the image back into the game position drawn there, on its floor', () => {
    let checked = 0
    for (const poster of POSTER_MAPS) {
      const bounds = MAP_CONFIGS.find((c) => c.key === poster.key)!.bounds
      const [[bx0, bz0], [bx1, bz1]] = bounds
      for (const panel of poster.panels) {
        const { minY, maxY } = panel
        const y =
          minY !== null && maxY !== null ? (minY + maxY) / 2 : minY !== null ? minY + 1 : (maxY ?? 1) - 1
        const spots = panel.area
          ? [[(panel.area[0] + panel.area[2]) / 2, (panel.area[1] + panel.area[3]) / 2]]
          : [0.4, 0.5, 0.6].flatMap((fx) =>
              [0.3, 0.6].map((fz) => [bx0 + fx * (bx1 - bx0), bz0 + fz * (bz1 - bz0)])
            )
        for (const [x, z] of spots) {
          const p = { x, y, z }
          // Spots inside a building's inset are drawn there instead.
          if (panelFor(poster, p) !== panel) continue
          const back = fromImagePoint(poster, toImagePoint(poster, p), bounds)
          expect(back.x, `${poster.key} ${panel.name}`).toBeCloseTo(x, 1)
          expect(back.z, `${poster.key} ${panel.name}`).toBeCloseTo(z, 1)
          // Drawn in the same place (Reserve's two bunkers share one drawing).
          expect(panelFor(poster, back).transform, `${poster.key} ${panel.name}`).toEqual(panel.transform)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(60)
  })

  it('notices when an image comes at another size than it was calibrated for', () => {
    const lab = map('the-lab')
    expect(sizeMismatch(lab, 3820, 2189)).toBeNull()
    expect(sizeMismatch(lab, 4096, 2348)).toMatch(
      /has changed .*4096×2348, not 3820×2189.*markers may be off/
    )
  })
})
