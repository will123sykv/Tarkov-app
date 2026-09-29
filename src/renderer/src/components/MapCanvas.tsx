import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type { GameMap, MapConfig, Quest, QuestObjective, Vec3 } from '../../../shared/questTypes'
import { mapAsset } from '../lib/questUi'
import { createCrs, prepareSvg, toBounds, toLatLng } from '../lib/tarkovMap'

export interface ObjectiveMarker {
  quest: Quest
  objective: QuestObjective
  /** Zones and quest-item spots on this map. */
  zones: { position: Vec3; outline: Vec3[] }[]
  spots: Vec3[]
}

interface Props {
  config: MapConfig
  /** The map and its alternate versions (e.g. Night Factory) share one image. */
  maps: GameMap[]
  objectives: ObjectiveMarker[]
  showExtracts: boolean
  showSpawns: boolean
  showTransits: boolean
  focus: { questId: string; objectiveId: string | null } | null
  onSelectQuest: (questId: string) => void
}

export const MARKER_COLORS = {
  quest: '#e2c985',
  pmc: '#7fb069',
  scav: '#d9a441',
  shared: '#6a9fd4',
  transit: '#b48ce0',
  spawn: '#c9ccce'
}

/** Tooltip content as a DOM node, so names from the data are never parsed as HTML. */
function label(title: string, detail?: string): HTMLElement {
  const el = document.createElement('div')
  const strong = document.createElement('strong')
  strong.textContent = title
  el.append(strong)
  if (detail) {
    const span = document.createElement('div')
    span.textContent = detail
    el.append(span)
  }
  return el
}

/** A Leaflet map of one Tarkov map with quest objectives, extracts, spawns and transits on it. */
export default function MapCanvas({
  config,
  maps,
  objectives,
  showExtracts,
  showSpawns,
  showTransits,
  focus,
  onSelectQuest
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Layer[]>())
  const [baseError, setBaseError] = useState<string | null>(null)
  const handledFocus = useRef<Props['focus']>(null)

  // The map itself and its base image; rebuilt when switching maps.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setBaseError(null)
    const map = L.map(el, {
      crs: createCrs(config),
      minZoom: config.minZoom,
      maxZoom: config.maxZoom + 2,
      zoomSnap: 0.5,
      attributionControl: false,
      maxBounds: toBounds(config.bounds).pad(0.3)
    })
    map.fitBounds(toBounds(config.bounds))
    // The base image sits under the markers, whenever it finishes loading.
    map.createPane('mapBase').style.zIndex = '250'
    let cancelled = false
    if (config.tilePath) {
      L.tileLayer(mapAsset(config.tilePath), {
        tileSize: config.tileSize,
        bounds: toBounds(config.bounds),
        maxNativeZoom: config.maxZoom,
        maxZoom: config.maxZoom + 2,
        noWrap: true
      })
        .on('tileerror', () => setBaseError('Some map tiles couldn’t be loaded (offline?).'))
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
        .catch((err: Error) => !cancelled && setBaseError(`The map image couldn’t be loaded: ${err.message}`))
    }
    overlayRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(el)
    return () => {
      cancelled = true
      resize.disconnect()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [config])

  // Markers; redrawn when the data or the layer toggles change.
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.clearLayers()
    const markers = new Map<string, L.Layer[]>()
    const add = (key: string, layer: L.Layer): void => {
      layer.addTo(overlay)
      markers.set(key, [...(markers.get(key) ?? []), layer])
    }
    const dot = (p: Vec3, color: string, radius = 6): L.CircleMarker =>
      L.circleMarker(toLatLng(p), { radius, color: '#101214', weight: 2, fillColor: color, fillOpacity: 1 })

    for (const map of maps) {
      if (showSpawns) {
        for (const s of map.spawns) {
          dot(s.position, MARKER_COLORS.spawn, 3)
            .bindTooltip(label('Spawn', s.sides.join(', ')))
            .addTo(overlay)
        }
      }
      if (showExtracts) {
        for (const e of map.extracts) {
          const color = MARKER_COLORS[e.faction as 'pmc' | 'scav' | 'shared'] ?? MARKER_COLORS.shared
          if (e.outline.length > 2)
            L.polygon(e.outline.map(toLatLng), {
              color,
              weight: 1,
              fillOpacity: 0.15,
              interactive: false
            }).addTo(overlay)
          dot(e.position, color, 7)
            .bindTooltip(
              label(e.name, `${e.faction === 'shared' ? 'PMC and scav' : e.faction.toUpperCase()} extract`)
            )
            .addTo(overlay)
        }
      }
      if (showTransits) {
        for (const t of map.transits) {
          dot(t.position, MARKER_COLORS.transit, 7).bindTooltip(label(t.name, 'Transit')).addTo(overlay)
        }
      }
    }
    for (const { quest, objective, zones, spots } of objectives) {
      const key = `${quest.id}:${objective.id}`
      const tip = (): HTMLElement => label(quest.name, objective.description)
      for (const z of zones) {
        if (z.outline.length > 2)
          add(
            key,
            L.polygon(z.outline.map(toLatLng), { color: MARKER_COLORS.quest, weight: 2, fillOpacity: 0.2 })
              .bindTooltip(tip())
              .on('click', () => onSelectQuest(quest.id))
          )
        add(
          key,
          dot(z.position, MARKER_COLORS.quest, 7)
            .bindTooltip(tip())
            .on('click', () => onSelectQuest(quest.id))
        )
      }
      for (const p of spots) {
        add(
          key,
          dot(p, MARKER_COLORS.quest, 5)
            .bindTooltip(tip())
            .on('click', () => onSelectQuest(quest.id))
        )
      }
    }
    markersRef.current = markers
  }, [config, maps, objectives, showExtracts, showSpawns, showTransits, onSelectQuest])

  // Centre on a focused objective (from "Show on map").
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus || handledFocus.current === focus) return
    const layers = [...markersRef.current.entries()]
      .filter(
        ([key]) =>
          key.startsWith(`${focus.questId}:`) && (!focus.objectiveId || key.endsWith(`:${focus.objectiveId}`))
      )
      .flatMap(([, l]) => l)
    const points = layers.flatMap((l) =>
      l instanceof L.Polygon
        ? (l.getLatLngs().flat(2) as L.LatLng[])
        : l instanceof L.CircleMarker
          ? [l.getLatLng()]
          : []
    )
    if (!points.length) return
    handledFocus.current = focus
    // Close enough to see the spot, far enough to see what's around it.
    const maxZoom = Math.max(config.minZoom + 1, config.maxZoom - 2)
    map.flyToBounds(L.latLngBounds(points).pad(0.5), { maxZoom, duration: 0.6 })
    layers.forEach((l) => l instanceof L.CircleMarker && l.openTooltip())
  }, [focus, objectives, config])

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="leaflet-host" />
      {baseError && <div className="map-error">{baseError}</div>}
    </div>
  )
}
