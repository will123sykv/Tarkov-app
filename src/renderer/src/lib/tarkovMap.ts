import L from 'leaflet'
import type { MapConfig, Vec3 } from '../../../shared/questTypes'

// Game coordinates onto tarkov.dev's map images, the way tarkov.dev's own map does it
// (github.com/the-hideout/tarkov-dev, src/pages/map, MIT): positions are (z, x) as (lat, lng),
// rotated by the map's `coordinateRotation`, then scaled and offset by its `transform`.

function applyRotation(latLng: L.LatLng, rotation: number): L.LatLng {
  if (!latLng.lng && !latLng.lat) return L.latLng(0, 0)
  if (!rotation) return latLng
  const angle = (rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const { lng: x, lat: y } = latLng
  return L.latLng(x * sin + y * cos, x * cos - y * sin)
}

export function createCrs(config: MapConfig): L.CRS {
  const [scaleX, marginX, scaleY, marginY] = config.transform
  return L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(scaleX, marginX, scaleY * -1, marginY),
    projection: L.extend({}, L.Projection.LonLat, {
      project: (latLng: L.LatLng) =>
        L.Projection.LonLat.project(applyRotation(latLng, config.coordinateRotation)),
      unproject: (point: L.Point) =>
        applyRotation(L.Projection.LonLat.unproject(point), config.coordinateRotation * -1)
    })
  }) as L.CRS
}

export const toLatLng = (p: Vec3): L.LatLngTuple => [p.z, p.x]

export function toBounds(bounds: [[number, number], [number, number]]): L.LatLngBounds {
  return L.latLngBounds([bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]])
}

/**
 * Parse a map SVG for display: drop anything scriptable, and hide the other floors so only the
 * ground level shows.
 */
export function prepareSvg(text: string, otherLayers: readonly string[]): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.documentElement as unknown as SVGSVGElement
  if (svg.nodeName.toLowerCase() !== 'svg') return null
  svg.querySelectorAll('script, foreignObject').forEach((el) => el.remove())
  svg.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
    }
  })
  for (const id of otherLayers) svg.querySelector(`#${CSS.escape(id)}`)?.setAttribute('display', 'none')
  return svg
}
