import type { MapLabel } from '../../../shared/questTypes'
import { BOSS_ICON, pinIcons, SNIPER_ICON, type PinKind } from './mapMarkers'

// The map's HTML markers (see mapMarkers.ts for what they show).

const SVG_NS = 'http://www.w3.org/2000/svg'

export function iconSvg(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', path)
  svg.append(p)
  return svg
}

/** A name box over icon tiles, with a stem down to the spot (the element's bottom centre). */
export function pinElement(kind: PinKind, name: string): HTMLElement {
  const pin = document.createElement('div')
  pin.className = `map-pin ${kind}`
  const label = document.createElement('div')
  label.className = 'map-pin-label'
  label.textContent = name
  const icons = document.createElement('div')
  icons.className = 'map-pin-icons'
  for (const path of pinIcons(kind)) {
    const tile = document.createElement('span')
    tile.className = 'map-pin-icon'
    tile.append(iconSvg(path))
    icons.append(tile)
  }
  const stem = document.createElement('div')
  stem.className = 'map-pin-stem'
  pin.append(label, icons, stem)
  return pin
}

/** A round badge with a tail (boss) or a target (sniper), pointing at the spot. */
export function badgeElement(kind: 'boss' | 'sniper'): HTMLElement {
  const badge = document.createElement('div')
  badge.className = `map-badge ${kind}`
  badge.append(iconSvg(kind === 'boss' ? BOSS_ICON : SNIPER_ICON))
  return badge
}

/** A place name in white on the map. */
export function placeElement(label: MapLabel): HTMLElement {
  const el = document.createElement('div')
  el.className = 'map-place'
  el.textContent = label.text
  el.style.fontSize = `${Math.round(13 * (label.size / 100) * 10) / 10}px`
  if (label.rotation) el.style.setProperty('--rotation', `${label.rotation}deg`)
  return el
}
