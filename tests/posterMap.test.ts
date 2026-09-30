import { describe, expect, it } from 'vitest'
import { panelFor, re3mrFor, RE3MR_MAPS, toImagePoint, type Re3mrMap } from '../src/renderer/src/lib/re3mrMap'
import { RE3MR_FILES } from '../src/shared/re3mr'

const map = (key: string): Re3mrMap => {
  const m = re3mrFor(key)
  if (!m) throw new Error(`no Re3MR map for ${key}`)
  return m
}

describe('Re3MR maps', () => {
  it('covers the four maps Re3MR draws in 2D, with the images the app is allowed to fetch', () => {
    expect(RE3MR_MAPS.map((m) => m.key).sort()).toEqual([
      'factory',
      'icebreaker',
      'terminal',
      'the-labyrinth'
    ])
    expect(RE3MR_MAPS.map((m) => m.file).sort()).toEqual([...RE3MR_FILES].sort())
    expect(re3mrFor('customs')).toBeNull()
  })

  it('gives every height exactly one panel, in order', () => {
    for (const m of RE3MR_MAPS) {
      expect(m.panels[0].minY, m.key).toBeNull()
      expect(m.panels.at(-1)!.maxY, m.key).toBeNull()
      for (let i = 1; i < m.panels.length; i++) expect(m.panels[i].minY, m.key).toBe(m.panels[i - 1].maxY)
    }
  })

  it('picks the floor by height, and the nearest floor outside every range', () => {
    const factory = map('factory')
    expect(panelFor(factory, -3).name).toBe('Tunnels')
    expect(panelFor(factory, 0.5).name).toBe('Ground floor')
    expect(panelFor(factory, 4.6).name).toBe('Middle floor')
    expect(panelFor(factory, 9).name).toBe('Top floor')
    const gappy: Re3mrMap = {
      ...factory,
      panels: [
        { name: 'low', minY: null, maxY: 0, transform: [1, 0, 0, 1, 0, 0] },
        { name: 'high', minY: 10, maxY: null, transform: [1, 0, 0, 1, 0, 0] }
      ]
    }
    expect(panelFor(gappy, 2).name).toBe('low')
    expect(panelFor(gappy, 8).name).toBe('high')
  })

  // Game positions from tarkov.dev's map data, and where Re3MR draws the same thing (image pixels).
  const references: [string, string, { x: number; y: number; z: number }, [number, number], number][] = [
    ['factory', 'Med Tent Gate door lock', { x: -19.08, y: 1.45, z: -48.57 }, [4710, 1577], 50],
    ['factory', 'Transit to The Lab (tunnels)', { x: -27.01, y: -3.09, z: -42.75 }, [6288, 1673], 50],
    ['factory', 'office door lock (top floor)', { x: 29.12, y: 9.08, z: 36.52 }, [413, 977], 50],
    ['terminal', 'PMC spawn (Infiltration)', { x: 127.57, y: -60.07, z: -417.35 }, [4733, 1667], 40],
    ['the-labyrinth', 'The Way Up', { x: -7.31, y: -0.01, z: 40.13 }, [3552, 1805], 60],
    ['the-labyrinth', 'Toxic Puddle trap switch', { x: 46.42, y: 1.03, z: 11.08 }, [2596, 3552], 90],
    ['icebreaker', 'Helicopter extract (helipad)', { x: 0.28, y: 22.56, z: -66.03 }, [4658, 477], 40],
    ['icebreaker', 'PMC spawn (infirmary deck)', { x: -0.35, y: 19.48, z: 82.34 }, [5196, 2542], 40]
  ]
  it.each(references)('places %s: %s where Re3MR draws it', (key, _what, position, [u, v], tolerance) => {
    const [x, y] = toImagePoint(map(key), position)
    expect(Math.hypot(x - u, y - v)).toBeLessThan(tolerance)
  })

  it('draws an outline on its zone’s floor', () => {
    const factory = map('factory')
    const corner = { x: 30, y: 6.5, z: 36 }
    expect(toImagePoint(factory, corner, 1)).not.toEqual(toImagePoint(factory, corner))
    expect(toImagePoint(factory, corner, 1)).toEqual(toImagePoint(factory, { ...corner, y: 1 }))
  })
})
