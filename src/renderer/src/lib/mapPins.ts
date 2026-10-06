import type { MapLabel } from '../../../shared/questTypes'
import { BOSS_ICON, LOCK_ICON, pinIcons, SNIPER_ICON, type PinKind } from './mapMarkers'
import { KEY_ICON, MINE_ICON, OBJECTIVE_ICONS, ROUGH_ICON, type QuestPin } from './questPins'

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

function iconTile(path: string, className = 'map-pin-icon'): HTMLElement {
  const tile = document.createElement('span')
  tile.className = className
  tile.append(iconSvg(path))
  return tile
}

/** A pin's height without a stem: the name box, the icon tiles and the gap between. */
const QUEST_PIN_HEIGHT = 44

/**
 * A quest's pin: the quest and its trader in a box over the trader's portrait and an icon per thing to
 * do there (and a key when one's needed). Pins of other quests at the same spot stand on longer stems.
 */
export function questPinElement(pin: QuestPin, state: 'selected' | 'dimmed' | null): HTMLElement {
  const el = document.createElement('div')
  el.className = [
    'map-pin',
    'quest',
    pin.status === 'active' ? '' : 'other',
    pin.rough ? 'rough' : '',
    pin.mine ? 'mine' : '',
    state ?? ''
  ]
    .filter(Boolean)
    .join(' ')
  const label = document.createElement('div')
  label.className = 'map-pin-label'
  const name = document.createElement('span')
  name.textContent = pin.quest.name
  label.append(name)
  if (pin.trader) {
    const trader = document.createElement('span')
    trader.className = 'map-pin-trader'
    trader.textContent = pin.trader.name
    label.append(trader)
  }
  const icons = document.createElement('div')
  icons.className = 'map-pin-icons'
  if (pin.trader?.imageLink) {
    const tile = document.createElement('span')
    tile.className = 'map-pin-icon portrait'
    const img = document.createElement('img')
    img.src = pin.trader.imageLink
    img.alt = ''
    img.draggable = false
    tile.append(img)
    icons.append(tile)
  }
  if (pin.rough) icons.append(iconTile(ROUGH_ICON, 'map-pin-icon note'))
  if (pin.mine) icons.append(iconTile(MINE_ICON, 'map-pin-icon note'))
  for (const kind of pin.kinds) icons.append(iconTile(OBJECTIVE_ICONS[kind]))
  if (pin.needsKey) icons.append(iconTile(KEY_ICON, `map-pin-icon key${pin.keyMissing ? ' missing' : ''}`))
  const stem = document.createElement('div')
  stem.className = 'map-pin-stem'
  stem.style.height = `${5 + pin.stack * QUEST_PIN_HEIGHT}px`
  el.append(label, icons, stem)
  return el
}

/** A round badge with a tail (boss) or a target (sniper), pointing at the spot. */
const BADGE_ICONS = { boss: BOSS_ICON, sniper: SNIPER_ICON, lock: LOCK_ICON, key: KEY_ICON }

/** A round badge: a boss spawn, a sniper, a locked door or trunk, or where a key can spawn. */
export function badgeElement(kind: keyof typeof BADGE_ICONS, extra = ''): HTMLElement {
  const badge = document.createElement('div')
  badge.className = `map-badge ${kind} ${extra}`.trim()
  badge.append(iconSvg(BADGE_ICONS[kind]))
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
