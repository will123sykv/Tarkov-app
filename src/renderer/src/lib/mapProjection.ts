import L from 'leaflet'
import type { MapConfig, Vec3 } from '../../../shared/questTypes'
import { mapAsset } from './questUi'
import { toImagePoint, type Re3mrMap } from './re3mrMap'
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
  /** `floorY` picks the floor a point is drawn on (e.g. an outline on its zone's floor). */
  toLatLng: (p: Vec3, floorY?: number) => L.LatLngTuple
  /** Adds the base image in the `mapBase` pane; returns a cleanup. */
  addBase: (map: L.Map, onError: (message: string) => void) => () => void
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

/** `factory-2d.jpg` → the app's cached copy of Re3MR's image. */
export const re3mrAsset = (file: string): string => `tarkov-map://re3mr/${file}`

/**
 * A Re3MR poster as a flat image (1 unit = 1 image pixel at zoom 0), with positions placed on the
 * panel of their floor.
 */
export function re3mrProjection(re3mr: Re3mrMap): MapProjection {
  const bounds = L.latLngBounds([-re3mr.height, 0], [0, re3mr.width])
  return {
    id: `re3mr:${re3mr.key}`,
    crs: L.CRS.Simple,
    bounds,
    minZoom: -5,
    maxZoom: 1.5,
    focusZoom: -0.5,
    toLatLng(p, floorY) {
      const [u, v] = toImagePoint(re3mr, p, floorY)
      return [-v, u]
    },
    addBase(map, onError) {
      const image = L.imageOverlay(re3mrAsset(re3mr.file), bounds, {
        pane: 'mapBase',
        className: 'map-image'
      })
      image
        .on('error', () => {
          image.remove()
          onError('The Re3MR map couldn’t be loaded (offline?). Switch to tarkov.dev, or try again later.')
        })
        .addTo(map)
      return () => undefined
    }
  }
}
