import L from 'leaflet'
import type { MapConfig, Vec3 } from '../../../shared/questTypes'
import { mapAsset } from './questUi'
import { toImagePoint, type Anchor, type PosterMap } from './posterMap'
import { createCrs, prepareSvg, toBounds, toLatLng } from './tarkovMap'

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
  /** Adds the base image in the `mapBase` pane; returns a cleanup. */
  addBase: (map: L.Map, onError: (message: string) => void) => () => void
  /** Whether a marker there is on (or just off the edge of) the image, not somewhere else entirely. */
  shows: (at: L.LatLngTuple) => boolean
  /** Behind the image, matching its margins. */
  background: string | null
}

/** tarkov.dev's interactive maps: tiles or an SVG, with its projection. */
export function interactiveProjection(config: MapConfig): MapProjection {
  const bounds = toBounds(config.bounds)
  return {
    id: `tarkov.dev:${config.key}`,
    crs: createCrs(config),
    bounds,
    minZoom: config.minZoom,
    maxZoom: config.maxZoom + 2,
    focusZoom: Math.max(config.minZoom + 1, config.maxZoom - 2),
    toLatLng: (p) => toLatLng(p),
    shows: () => true,
    background: null,
    addBase(map, onError) {
      let cancelled = false
      if (config.tilePath) {
        L.tileLayer(mapAsset(config.tilePath), {
          tileSize: config.tileSize,
          bounds,
          maxNativeZoom: config.maxZoom,
          maxZoom: config.maxZoom + 2,
          noWrap: true
        })
          .on('tileerror', () => onError('Some map tiles couldn’t be loaded (offline?).'))
          .addTo(map)
      } else if (config.svgPath) {
        fetch(mapAsset(config.svgPath))
          .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
          .then((text) => {
            if (cancelled) return
            const svg = prepareSvg(text, config.otherLayers)
            if (!svg) throw new Error('not an SVG')
            L.svgOverlay(svg, toBounds(config.svgBounds ?? config.bounds), {
              className: 'map-svg',
              pane: 'mapBase'
            }).addTo(map)
          })
          .catch((err: Error) => !cancelled && onError(`The map image couldn’t be loaded: ${err.message}`))
      }
      return () => {
        cancelled = true
      }
    }
  }
}

/**
 * A community 2D map as a flat image (1 unit = 1 image pixel at zoom 0), with positions placed on the
 * panel (floor or inset) they belong to. Re3MR's come as one image, db4tarkov's as tiles whose top
 * zoom is the image at full size.
 */
export function posterProjection(poster: PosterMap): MapProjection {
  const bounds = L.latLngBounds([-poster.height, 0], [0, poster.width])
  const failed = `The ${poster.author} map couldn’t be loaded (offline?). Switch to tarkov.dev, or try again later.`
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
        const image = L.imageOverlay(`tarkov-map://re3mr/${poster.file}`, bounds, {
          pane: 'mapBase',
          className: 'map-image'
        })
        image
          .on('error', () => {
            image.remove()
            onError(failed)
          })
          .addTo(map)
      }
      return () => undefined
    }
  }
}
