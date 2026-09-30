import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type { GameMap, MapLabel, Quest, QuestObjective, Vec3 } from '../../../shared/questTypes'
import type { MapProjection } from '../lib/mapProjection'
import {
  bossLines,
  extractDetail,
  extractKind,
  extractsFor,
  labelAnchor,
  mergeBossSpawns
} from '../lib/mapMarkers'
import { badgeElement, pinElement, placeElement } from '../lib/mapPins'

export interface ObjectiveMarker {
  quest: Quest
  objective: QuestObjective
  /** Zones and quest-item spots on this map. */
  zones: { position: Vec3; outline: Vec3[] }[]
  spots: Vec3[]
}

export interface MapLayers {
  extracts: boolean
  transits: boolean
  spawns: boolean
  labels: boolean
  bosses: boolean
  snipers: boolean
}

interface Props {
  projection: MapProjection
  /** The map and its alternate versions (e.g. Night Factory) share one image. */
  maps: GameMap[]
  /** Place names. */
  labels: MapLabel[]
  objectives: ObjectiveMarker[]
  layers: MapLayers
  /** Whose extracts to show. */
  faction: 'pmc' | 'scav'
  itemName: (id: string) => string | undefined
  focus: { questId: string; objectiveId: string | null } | null
  onSelectQuest: (questId: string) => void
}

export const MARKER_COLORS = {
  quest: '#e2c985',
  spawn: '#c9ccce'
}

/** Tooltip content as a DOM node, so names from the data are never parsed as HTML. */
function label(title: string, detail?: string | string[]): HTMLElement {
  const el = document.createElement('div')
  const strong = document.createElement('strong')
  strong.textContent = title
  el.append(strong)
  for (const line of typeof detail === 'string' ? [detail] : (detail ?? [])) {
    const div = document.createElement('div')
    div.textContent = line
    el.append(div)
  }
  return el
}

/** An HTML marker whose element's bottom centre sits on the spot. */
function htmlMarker(at: L.LatLngTuple, el: HTMLElement, options: L.MarkerOptions = {}): L.Marker {
  return L.marker(at, {
    icon: L.divIcon({ html: el, className: 'map-marker', iconSize: [0, 0], iconAnchor: [0, 0] }),
    keyboard: false,
    ...options
  })
}

/**
 * A Leaflet map of one Tarkov map with quest objectives, and extracts, transits, bosses, snipers,
 * spawns and place names in db4tarkov's style.
 */
export default function MapCanvas({
  projection,
  maps,
  labels,
  objectives,
  layers,
  faction,
  itemName,
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
      crs: projection.crs,
      minZoom: projection.minZoom,
      maxZoom: projection.maxZoom,
      zoomSnap: 0.5,
      attributionControl: false,
      maxBounds: projection.bounds.pad(0.3)
    })
    map.fitBounds(projection.bounds)
    el.style.background = projection.background ?? ''
    // The base image sits under the markers, whenever it finishes loading; place names above it.
    map.createPane('mapBase').style.zIndex = '250'
    map.createPane('mapLabels').style.zIndex = '450'
    // Quest objectives over the pins (Leaflet's markers are at 600, tooltips at 650).
    map.createPane('mapObjectives').style.zIndex = '620'
    const removeBase = projection.addBase(map, setBaseError)
    overlayRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(el)
    return () => {
      removeBase()
      resize.disconnect()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [projection])

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
    const at = projection.toLatLng
    const shown = (p: Vec3): boolean => projection.shows(at(p))
    const dot = (p: Vec3, color: string, radius = 6, pane = 'overlayPane'): L.CircleMarker =>
      L.circleMarker(at(p), { radius, color: '#101214', weight: 2, fillColor: color, fillOpacity: 1, pane })
    const tipAbove: L.TooltipOptions = { direction: 'top', offset: [0, -46] }

    if (layers.labels) {
      for (const l of labels) {
        const anchor = labelAnchor(l)
        const p = { x: l.position[0], y: anchor.y ?? 0, z: l.position[1] }
        htmlMarker(at(p, anchor), placeElement(l), { interactive: false, pane: 'mapLabels' }).addTo(overlay)
      }
    }
    if (layers.spawns) {
      for (const s of maps.flatMap((m) => m.spawns)) {
        dot(s.position, MARKER_COLORS.spawn, 3)
          .bindTooltip(label('Spawn', s.sides.join(', ')))
          .addTo(overlay)
      }
    }
    if (layers.snipers) {
      const seen: Vec3[] = []
      for (const p of maps.flatMap((m) => m.snipers ?? []).filter(shown)) {
        if (seen.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 5)) continue
        seen.push(p)
        htmlMarker(at(p), badgeElement('sniper'))
          .bindTooltip(label('Sniper scav'), { direction: 'top', offset: [0, -30] })
          .addTo(overlay)
      }
    }
    if (layers.bosses) {
      for (const b of mergeBossSpawns(maps.map((m) => m.bossSpawns ?? []))) {
        if (!shown(b.position)) continue
        const lines = bossLines(b)
        htmlMarker(at(b.position), badgeElement('boss'))
          .bindTooltip(label('Boss spawn', lines.length ? lines : 'Bosses and their guards can spawn here'), {
            direction: 'top',
            offset: [0, -34]
          })
          .addTo(overlay)
      }
    }
    if (layers.transits) {
      const seen = new Set<string>()
      for (const t of maps.flatMap((m) => m.transits).filter((t) => shown(t.position))) {
        const key = `${t.name}@${Math.round(t.position.x)},${Math.round(t.position.z)}`
        if (seen.has(key)) continue
        seen.add(key)
        htmlMarker(at(t.position), pinElement('transit', t.name), { riseOnHover: true })
          .bindTooltip(label(t.name, 'Transit to another map'), tipAbove)
          .addTo(overlay)
      }
    }
    if (layers.extracts) {
      for (const e of extractsFor(
        maps.flatMap((m) => m.extracts),
        faction
      ).filter((e) => shown(e.position))) {
        htmlMarker(at(e.position), pinElement(extractKind(e), e.name), { riseOnHover: true })
          .bindTooltip(label(e.name, extractDetail(e, itemName)), tipAbove)
          .addTo(overlay)
      }
    }
    for (const { quest, objective, zones, spots } of objectives) {
      const key = `${quest.id}:${objective.id}`
      const tip = (): HTMLElement => label(quest.name, objective.description)
      for (const z of zones) {
        if (z.outline.length > 2)
          add(
            key,
            L.polygon(
              z.outline.map((p) => at(p, z.position)),
              { color: MARKER_COLORS.quest, weight: 2, fillOpacity: 0.2, pane: 'mapObjectives' }
            )
              .bindTooltip(tip())
              .on('click', () => onSelectQuest(quest.id))
          )
        add(
          key,
          dot(z.position, MARKER_COLORS.quest, 7, 'mapObjectives')
            .bindTooltip(tip())
            .on('click', () => onSelectQuest(quest.id))
        )
      }
      for (const p of spots) {
        add(
          key,
          dot(p, MARKER_COLORS.quest, 5, 'mapObjectives')
            .bindTooltip(tip())
            .on('click', () => onSelectQuest(quest.id))
        )
      }
    }
    markersRef.current = markers
  }, [projection, maps, labels, objectives, layers, faction, itemName, onSelectQuest])

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
    map.flyToBounds(L.latLngBounds(points).pad(0.5), { maxZoom: projection.focusZoom, duration: 0.6 })
    layers.forEach((l) => l instanceof L.CircleMarker && l.openTooltip())
  }, [focus, objectives, projection])

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="leaflet-host" />
      {baseError && <div className="map-error">{baseError}</div>}
    </div>
  )
}
