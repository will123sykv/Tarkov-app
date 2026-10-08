import L from 'leaflet'
import type { Vec3 } from '../../../shared/questTypes'
import { fromImagePoint, sizeMismatch, toImagePoint, type Anchor, type PosterMap } from './posterMap'

/** How a map's base image and game positions are laid out in Leaflet. */
export interface MapProjection {
  /** Changes whenever the base image does. */
  id: string
  crs: L.CRS
  bounds: L.LatLngBounds
  minZoom: number
  maxZoom: number
  /** Zoom used to show a focused objective: close enough to see it, far enough to see around it. */
  focusZoom: number
  /** `anchor` picks the floor or inset a point is drawn on (e.g. an outline on its zone's floor). */
  toLatLng: (p: Vec3, anchor?: Anchor) => L.LatLngTuple
  /** Where a spot on the map (a click) is in the game, on the floor drawn there. */
  fromLatLng: (at: L.LatLngTuple) => Vec3
  /** Adds the base image in the `mapBase` pane; returns a cleanup. */
  addBase: (map: L.Map, onError: (message: string) => void) => () => void
  /** Whether a marker there is on (or just off the edge of) the image, not somewhere else entirely. */
  shows: (at: L.LatLngTuple) => boolean
  /** Behind the image, matching its margins. */
  background: string | null
}

/**
 * A community 2D map as a flat image (1 unit = 1 image pixel at zoom 0), with positions placed on the
 * panel (floor or inset) they belong to. Re3MR's come as one image, db4tarkov's as tiles whose top
 * zoom is the image at full size.
 */
export function posterProjection(
  poster: PosterMap,
  gameBounds: [[number, number], [number, number]] | null = null
): MapProjection {
  const bounds = L.latLngBounds([-poster.height, 0], [0, poster.width])
  const failed = `The ${poster.author} map couldn’t be loaded (offline?). Try again later.`
  // tarkov.dev lists the odd position from another map; a little past the edge is still this map.
  const margin = 0.05 * Math.max(poster.width, poster.height)
  return {
    id: `${poster.provider}:${poster.key}`,
    crs: L.CRS.Simple,
    bounds,
    minZoom: -5,
    maxZoom: 1.5,
    focusZoom: -0.5,
    toLatLng(p, anchor) {
      const [u, v] = toImagePoint(poster, p, anchor)
      return [-v, u]
    },
    fromLatLng: ([lat, lng]) => fromImagePoint(poster, [lng, -lat], gameBounds),
    shows: ([lat, lng]) =>
      lng > -margin && lng < poster.width + margin && lat < margin && lat > -poster.height - margin,
    // db4tarkov's tiles are padded with this grey.
    background: poster.tiles ? '#222' : null,
    addBase(map, onError) {
      if (poster.tiles) {
        const { slug, maxZoom } = poster.tiles
        let reported = false
        L.tileLayer(`tarkov-map://db4tarkov/${slug}/{z}/{x}/{y}.webp`, {
          tileSize: 512,
          zoomOffset: maxZoom,
          minNativeZoom: 1 - maxZoom,
          maxNativeZoom: 0,
          minZoom: -5,
          maxZoom: 1.5,
          // A pixel inside the image, so an edge on a tile boundary never asks for the tile beyond.
          bounds: L.latLngBounds([1 - poster.height, 1], [-1, poster.width - 1]),
          noWrap: true,
          pane: 'mapBase',
          className: 'map-image'
        })
          .on('tileerror', () => {
            if (!reported) onError(failed)
            reported = true
          })
          .addTo(map)
      } else if (poster.file) {
        const image = L.imageOverlay(`tarkov-map://${poster.provider}/${poster.file}`, bounds, {
          pane: 'mapBase',
          className: 'map-image'
        })
        image
          .on('error', () => {
            image.remove()
            onError(failed)
          })
          .on('load', () => {
            const el = image.getElement()
            const changed = el && sizeMismatch(poster, el.naturalWidth, el.naturalHeight)
            if (changed) onError(changed)
          })
          .addTo(map)
      }
      return () => undefined
    }
  }
}
