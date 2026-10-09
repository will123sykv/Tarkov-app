import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { opens } from '../../../shared/keys'
import type { GameMap, MapLabel, Vec3 } from '../../../shared/questTypes'
import type { FindArea } from '../../../shared/whereToFind'
import type { MapProjection } from '../lib/mapProjection'
import {
  bossLines,
  extractDetail,
  extractKind,
  extractsFor,
  labelAnchor,
  mergeBossSpawns
} from '../lib/mapMarkers'
import { badgeElement, pinElement, placeElement, questPinElement } from '../lib/mapPins'
import { questPins, type ObjectiveMarker, type QuestPin } from '../lib/questPins'

/** Locks and key spawn spots to draw: one key's (focused), or those of the keys quests need. */
export interface KeyMarks {
  locks: {
    position: Vec3
    kind: string
    name: string
    focused: boolean
    have: boolean
    /** Friends who have the key (from the codes they shared). */
    friends: string[]
  }[]
  spawns: { position: Vec3; names: string[]; items: number; focused: boolean }[]
  /** The key shown from the Keys tab: the map centres on its marks. */
  focusKey: string | null
}

/** A favourite item shown on the map: a circle where it turns up most. */
export interface FindAreaMark {
  itemId: string
  name: string
  icon: string | null
  color: string
  area: FindArea
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
  /** The player's keys: pins needing one they don't have say so (null: not known). */
  owned?: ReadonlySet<string> | null
  layers: MapLayers
  /** Whose extracts to show. */
  faction: 'pmc' | 'scav'
  itemName: (id: string) => string | undefined
  focus: { questId: string; objectiveId: string | null } | null
  /** Its pins stand out and the others fade. */
  selectedQuest: string | null
  onSelectQuest: (questId: string) => void
  keyMarks?: KeyMarks | null
  /** Favourite items' areas: the map fits them in view when they change. */
  findAreas?: readonly FindAreaMark[]
  /** Waiting for a click on where a story step is; `onPlace` gets the spot in the game. */
  placing?: boolean
  onPlace?: (position: Vec3) => void
  onCancelPlace?: () => void
}

export const MARKER_COLORS = {
  quest: '#e2c985',
  questOther: '#aebdcc',
  spawn: '#c9ccce'
}

/** A pin's tooltip: the quest, its trader, what to do there, and the keys it takes (and which are missing). */
function pinTooltip(
  pin: QuestPin,
  itemName: (id: string) => string | undefined,
  owned: ReadonlySet<string> | null
): HTMLElement {
  const locks = new Map<string, string[]>()
  for (const o of pin.objectives) for (const g of o.requiredKeys) if (g.length) locks.set(g.join(), g)
  const keys = [...locks.values()].map((g) => {
    const names = g.map((id) => itemName(id) ?? 'unknown key').join(' or ')
    return owned && !opens(g, owned) ? `Key: ${names} (you don’t have it)` : `Key: ${names}`
  })
  return label(pin.quest.name, [
    ...(pin.trader ? [pin.trader.name] : []),
    ...pin.objectives.map((o) => `• ${o.description || o.type}`),
    ...keys,
    ...(pin.rough ? [`Roughly here: the step names ${pin.places.join(' and ')}`] : []),
    ...(pin.mine ? ['Your pin'] : []),
    'Click for details'
  ])
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

const NO_AREAS: readonly FindAreaMark[] = []

/** An area's tooltip: the items shown that turn up there (this one first), with their icons. */
function findTooltip(mark: FindAreaMark, all: readonly FindAreaMark[]): HTMLElement {
  const here = [
    mark,
    ...all.filter(
      (o) =>
        o !== mark &&
        Math.hypot(o.area.centre.x - mark.area.centre.x, o.area.centre.z - mark.area.centre.z) <=
          o.area.radius
    )
  ]
  const tip = document.createElement('div')
  for (const m of here) {
    const row = document.createElement('div')
    row.className = 'find-tip-row'
    if (m.icon) {
      const img = document.createElement('img')
      img.src = m.icon
      img.alt = ''
      img.style.borderColor = m.color
      row.append(img)
    }
    const text = document.createElement('div')
    const name = document.createElement('strong')
    name.textContent = m.name
    const detail = document.createElement('span')
    const parts = [
      m.area.loose ? `${m.area.loose} loose spot${m.area.loose === 1 ? '' : 's'}` : null,
      m.area.containers ? `${m.area.containers} container${m.area.containers === 1 ? '' : 's'}` : null
    ].filter(Boolean)
    detail.textContent = `${parts.join(' · ')} in this area`
    text.append(name, detail)
    row.append(text)
    tip.append(row)
  }
  return tip
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
  owned = null,
  layers,
  faction,
  itemName,
  focus,
  selectedQuest,
  onSelectQuest,
  keyMarks = null,
  findAreas = NO_AREAS,
  placing = false,
  onPlace,
  onCancelPlace
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Layer[]>())
  const [baseError, setBaseError] = useState<string | null>(null)
  const handledFocus = useRef<Props['focus']>(null)
  const handledKey = useRef<string | null>(null)
  const handledFind = useRef<string | null>(null)

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
        // Over an extract at the same spot (Streets' Scav Checkpoint and its Labs transit), as db4tarkov shows it.
        htmlMarker(at(t.position), pinElement('transit', t.name), { riseOnHover: true, zIndexOffset: 100 })
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
    if (keyMarks) {
      for (const l of keyMarks.locks.filter((l) => shown(l.position))) {
        const what = l.kind === 'trunk' ? 'Locked container' : 'Locked door'
        add(
          l.focused ? 'key:focus' : 'key:other',
          htmlMarker(at(l.position), badgeElement('lock', l.focused ? 'focused' : l.have ? 'have' : ''), {
            riseOnHover: true,
            zIndexOffset: l.focused ? 500 : 0
          }).bindTooltip(
            label(what, [
              `Opens with the ${l.name}`,
              l.have ? 'You have the key' : "You don't have the key",
              ...(l.friends.length
                ? [`${l.friends.join(', ')} ${l.friends.length === 1 ? 'has' : 'have'} it`]
                : [])
            ]),
            { direction: 'top', offset: [0, -14] }
          )
        )
      }
      for (const sp of keyMarks.spawns.filter((sp) => shown(sp.position))) {
        add(
          sp.focused ? 'key:focus' : 'key:other',
          htmlMarker(at(sp.position), badgeElement('key', sp.focused ? 'focused' : ''), {
            riseOnHover: true,
            zIndexOffset: sp.focused ? 400 : 0
          }).bindTooltip(
            label(`${sp.names.join(', ')} can spawn here`, [
              sp.items <= sp.names.length
                ? 'A spot only keys spawn at'
                : `Loose loot: one of ${sp.items} items that can spawn here`
            ]),
            { direction: 'top', offset: [0, -14] }
          )
        )
      }
    }
    for (const mark of findAreas) {
      const centre = at(mark.area.centre)
      // The radius in image units: game metres scaled by the map's transform, along both axes.
      const r = mark.area.radius
      const along = (dx: number, dz: number): number => {
        const [lat, lng] = at({ ...mark.area.centre, x: mark.area.centre.x + dx, z: mark.area.centre.z + dz })
        return Math.hypot(lat - centre[0], lng - centre[1])
      }
      add(
        'find',
        L.circle(centre, {
          radius: (along(r, 0) + along(0, r)) / 2,
          color: mark.color,
          weight: 2,
          fillColor: mark.color,
          fillOpacity: 0.2,
          pane: 'mapObjectives'
        }).bindTooltip(findTooltip(mark, findAreas), { direction: 'top', className: 'find-tip' })
      )
    }
    const color = (status: string): string =>
      status === 'active' ? MARKER_COLORS.quest : MARKER_COLORS.questOther
    const fade = (questId: string): boolean => selectedQuest !== null && questId !== selectedQuest
    // Zone outlines, faint, under the pins.
    for (const { quest, status, objective, zones } of objectives) {
      for (const z of zones.filter((z) => z.outline.length > 2)) {
        add(
          `${quest.id}:${objective.id}`,
          L.polygon(
            z.outline.map((p) => at(p, z.position)),
            {
              color: color(status),
              weight: quest.id === selectedQuest ? 2.5 : 1.5,
              opacity: fade(quest.id) ? 0.35 : 0.9,
              fillOpacity: fade(quest.id) ? 0.05 : 0.15,
              pane: 'mapObjectives'
            }
          )
            .bindTooltip(label(quest.name, objective.description))
            .on('click', () => onSelectQuest(quest.id))
        )
      }
    }
    const { pins, dots } = questPins(objectives, owned)
    for (const d of dots) {
      add(
        `${d.quest.id}:${d.objective.id}`,
        dot(d.position, color(d.status), 4, 'mapObjectives')
          .setStyle({ opacity: fade(d.quest.id) ? 0.4 : 1, fillOpacity: fade(d.quest.id) ? 0.4 : 1 })
          .bindTooltip(label(d.quest.name, [`Could be here: ${d.objective.description}`]))
          .on('click', () => onSelectQuest(d.quest.id))
      )
    }
    for (const pin of pins) {
      const selected = pin.quest.id === selectedQuest
      const marker = htmlMarker(
        at(pin.position),
        questPinElement(pin, selected ? 'selected' : fade(pin.quest.id) ? 'dimmed' : null),
        { riseOnHover: true, pane: 'mapObjectives', zIndexOffset: selected ? 1000 : 0 }
      )
        .bindTooltip(pinTooltip(pin, itemName, owned), {
          direction: 'top',
          offset: [0, -48 - pin.stack * 44]
        })
        .on('click', () => onSelectQuest(pin.quest.id))
      for (const o of pin.objectives) add(`${pin.quest.id}:${o.id}`, marker)
    }
    markersRef.current = markers
  }, [
    projection,
    maps,
    labels,
    objectives,
    owned,
    layers,
    faction,
    itemName,
    selectedQuest,
    onSelectQuest,
    keyMarks,
    findAreas
  ])

  // Placing a pin: the next click on the map is where it goes; Esc cancels.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !placing || !onPlace) return
    const click = (e: L.LeafletMouseEvent): void =>
      onPlace(projection.fromLatLng([e.latlng.lat, e.latlng.lng]))
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancelPlace?.()
    }
    map.on('click', click)
    window.addEventListener('keydown', key)
    return () => {
      map.off('click', click)
      window.removeEventListener('keydown', key)
    }
  }, [placing, onPlace, onCancelPlace, projection])

  // Centre on a key's locks and spawns (from the Keys tab's "Show on map").
  useEffect(() => {
    const map = mapRef.current
    const focusKey = keyMarks?.focusKey ?? null
    const id = focusKey ? `${focusKey}@${maps.map((m) => m.id).join()}` : null
    if (!map || !id || handledKey.current === id) return
    const points = (markersRef.current.get('key:focus') ?? []).flatMap((l) =>
      l instanceof L.Marker ? [l.getLatLng()] : []
    )
    if (!points.length) return
    handledKey.current = id
    map.flyToBounds(L.latLngBounds(points).pad(0.4), { maxZoom: projection.focusZoom, duration: 0.6 })
  }, [keyMarks, maps, projection])

  // Fit the favourite items' areas in view when the ones shown (or the map) change.
  useEffect(() => {
    const map = mapRef.current
    const id = findAreas.length
      ? `${findAreas.map((a) => a.itemId).join()}@${maps.map((m) => m.id).join()}`
      : null
    if (!map || !id || handledFind.current === id) return
    handledFind.current = id
    const circles = (markersRef.current.get('find') ?? []).filter((l): l is L.Circle => l instanceof L.Circle)
    if (!circles.length) return
    const bounds = circles.reduce((b, c) => b.extend(c.getBounds()), circles[0].getBounds())
    // Clear of the favourites panel over the map's top right.
    map.flyToBounds(bounds, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [340, 40],
      maxZoom: projection.focusZoom,
      duration: 0.6
    })
  }, [findAreas, maps, projection])

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
        : l instanceof L.CircleMarker || l instanceof L.Marker
          ? [l.getLatLng()]
          : []
    )
    if (!points.length) return
    handledFocus.current = focus
    map.flyToBounds(L.latLngBounds(points).pad(0.5), { maxZoom: projection.focusZoom, duration: 0.6 })
    layers.find((l) => l instanceof L.Marker)?.openTooltip()
  }, [focus, objectives, projection])

  return (
    <div className={`map-canvas ${placing ? 'placing' : ''}`}>
      <div ref={containerRef} className="leaflet-host" />
      {baseError && <div className="map-error">{baseError}</div>}
    </div>
  )
}
