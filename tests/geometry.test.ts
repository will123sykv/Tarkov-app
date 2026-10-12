import { describe, expect, it } from 'vitest'
import { pointInPolygon, polygonArea } from '../src/shared/geometry'

const square = (x: number, y: number, size: number): [number, number][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size]
]

describe('map outlines', () => {
  it('measures an outline’s area either way round', () => {
    expect(polygonArea(square(0, 0, 10))).toBe(100)
    expect(polygonArea([...square(0, 0, 10)].reverse())).toBe(100)
    expect(
      polygonArea([
        [0, 0],
        [4, 0],
        [0, 3]
      ])
    ).toBe(6)
    expect(polygonArea([])).toBe(0)
  })

  it('tells whether a point is inside', () => {
    expect(pointInPolygon([5, 5], square(0, 0, 10))).toBe(true)
    expect(pointInPolygon([15, 5], square(0, 0, 10))).toBe(false)
    // An L shape: its inner corner is outside.
    const l: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10]
    ]
    expect(pointInPolygon([2, 8], l)).toBe(true)
    expect(pointInPolygon([8, 8], l)).toBe(false)
  })
})
