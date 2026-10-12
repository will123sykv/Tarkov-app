// Plane geometry for map outlines: points as [x, y] (or Leaflet's [lat, lng]; any two axes work).

export type Point = readonly [number, number, number?]

/** The area an outline encloses (shoelace formula), whichever way round it goes. */
export function polygonArea(outline: readonly Point[]): number {
  let twice = 0
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i]
    const [x2, y2] = outline[(i + 1) % outline.length]
    twice += x1 * y2 - x2 * y1
  }
  return Math.abs(twice) / 2
}

/** Whether a point is inside an outline (even-odd rule: a ray from it crosses the edges an odd number of times). */
export function pointInPolygon([px, py]: Point, outline: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i]
    const [xj, yj] = outline[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
