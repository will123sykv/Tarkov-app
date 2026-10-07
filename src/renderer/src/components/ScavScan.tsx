import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../../shared/constants'
import { CURRENCIES } from '../../../shared/constants'
import {
  getBackNow,
  keepOnlyHardToReplace,
  type GetBack,
  type HideoutNeed,
  type HideoutProgress
} from '../../../shared/hideout'
import {
  adviseScan,
  lootAdditions,
  scanTotals,
  stashCounts,
  type CountChange,
  type ScanAdvice
} from '../../../shared/scavAdvice'
import { EMPTY_KEYS, keyScanChanges } from '../../../shared/keys'
import type { OcrJob } from '../../../shared/scanTypes'
import type { LootItem, PriceState, PublicSettings } from '../../../shared/types'
import type { ValuationContext } from '../../../shared/valuation'
import { formatRub } from '../lib/format'
import {
  countLabel,
  findOverlap,
  inOverlap,
  matchName,
  nameIsSure,
  nameLabel,
  ocrImage,
  parseCount,
  pickItem,
  scanGrids,
  shortlist,
  tileDistance,
  type Confidence,
  type GridScan,
  type NameMatch,
  type PlacedItem,
  type Region,
  type RgbaImage,
  type ScanTile
} from '../lib/scavScan'
import { useBuyContext, useCraftContext, useKeepList } from '../lib/useKeepList'
import { useKeyInfo } from '../lib/useKeyInfo'
import { useStore } from '../store'
import ScarceBadge from './ScarceBadge'

// The screenshot scanner, in the Items to collect tab and the Keys tab. New loot (a scav case haul, a
// container): it finds each item, reads its name and count, says what to keep for the hideout and active
// quests and what to sell, and can add what's kept to the hideout's counts. Everything I have (stash
// pages, cases): it counts what the screenshots show and sets the hideout's counts to it. Keys (the key
// tool, cases, stash pages): the keys the screenshots show become the keys the player has. Everything it
// read can be corrected.

type Items = ReadonlyMap<string, LootItem>
export type ScanMode = 'loot' | 'stash' | 'keys'

interface ScanRow {
  key: number
  /** Which screenshot and grid, and where; null for items added by hand. */
  shot: number | null
  grid: number | null
  tile: ScanTile | null
  itemId: string | null
  count: number
  confidence: Confidence
  /** Likely items, best first (for correcting a wrong read). */
  guesses: string[]
  /** What OCR read off the label. */
  read: string
  /** Units of the stack added to the hideout's counts. */
  stored: number
}

interface Shot {
  id: number
  /** Where it came from, to notice the same screenshot added twice. */
  source: string
  url: string
  name: string
  width: number
  height: number
  pixels: RgbaImage
  grids: GridScan[]
  /** Grids whose items are listed. */
  shown: number[]
  region: Region | null
  seconds: number | null
  error: string | null
  /** Count rows that repeat the previous screenshot anyway. */
  keepRepeats: boolean
}

interface ScanState {
  mode: ScanMode
  shots: Shot[]
  /** The screenshot being shown. */
  active: number | null
  busy: boolean
  error: string | null
  rows: ScanRow[]
  /** The last change made to the hideout's counts (or the keys the player has), to undo it. */
  applied: {
    mode: ScanMode
    changes: CountChange[]
    stored: Map<number, number>
    /** The keys the player had before. */
    keysBefore?: string[]
  } | null
}

const EMPTY: Omit<ScanState, 'mode'> = {
  shots: [],
  active: null,
  busy: false,
  error: null,
  rows: [],
  applied: null
}

// Kept while the app runs, so switching tabs doesn't lose a scan.
const useScan = create<ScanState>(() => ({ mode: 'loot', ...EMPTY }))
const patch = (p: Partial<ScanState>): void => useScan.setState(p)
let nextKey = 1
let nextShot = 1

/** Open the scanner for counting everything the player has (from the Items needed list). */
export function startStashCount(): void {
  setMode('stash')
}

function setMode(mode: ScanMode): void {
  const { shots } = useScan.getState()
  patch({ mode, shots: shots.map((s) => ({ ...s, shown: defaultShown(s.grids, mode) })) })
}

async function decode(blob: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Couldn’t read the picture')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { width, height, data }
}

/** Grid images of these items, decoded; null where one couldn't be had. */
async function loadPictures(ids: string[]): Promise<Map<string, RgbaImage | null>> {
  const result = new Map<string, RgbaImage | null>()
  const queue = [...ids]
  const work = async (): Promise<void> => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const bytes = await window.api.getGridImage(id).catch(() => null)
      result.set(
        id,
        bytes
          ? await decode(new Blob([new Uint8Array(bytes)], { type: 'image/webp' })).catch(() => null)
          : null
      )
    }
  }
  await Promise.all(Array.from({ length: 6 }, work))
  return result
}

/** Find the items, read their labels and match them, settling look-alikes by their pictures. */
async function readShot(
  shot: number,
  pixels: RgbaImage,
  region: Region | null,
  items: LootItem[]
): Promise<{ grids: GridScan[]; rows: ScanRow[] }> {
  const grids = scanGrids(pixels, region ?? undefined)
  if (!grids.length) return { grids, rows: [] }
  const tiles = grids.flatMap((grid, g) =>
    grid.tiles.map((tile) => ({ grid: g, tile, cell: grid.lattice.cell }))
  )
  const jobs: OcrJob[] = []
  const slots = tiles.map(({ tile, cell }) => {
    const name = nameLabel(pixels, tile, cell)
    const count = countLabel(pixels, tile, cell)
    return {
      name: name ? jobs.push({ kind: 'name', image: ocrImage(name) }) - 1 : -1,
      count: count ? jobs.push({ kind: 'count', image: ocrImage(count) }) - 1 : -1
    }
  })
  const texts = jobs.length ? await window.api.readLabels(jobs) : []
  const sized = items.filter((i) => i.width && i.height)
  const read = tiles.map(({ grid, tile }, i) => {
    const name = texts[slots[i].name]?.text ?? ''
    const countText = texts[slots[i].count]
    const matches = matchName(name, tile.w, tile.h, sized)
    return {
      grid,
      tile,
      name,
      count: countText ? parseCount(countText.text, countText.confidence) : 1,
      matches,
      check: nameIsSure(matches) ? null : shortlist(matches)
    }
  })
  const pictures = await loadPictures([...new Set(read.flatMap((r) => r.check?.map((m) => m.item.id) ?? []))])
  const rows = read.map((r): ScanRow => {
    let pick = pickItem(r.matches)
    let guesses: NameMatch[] = r.matches
    if (r.check) {
      const distances = r.check.map((m) => {
        const picture = pictures.get(m.item.id)
        return picture ? tileDistance(pixels, r.tile, m.item, picture) : null
      })
      pick = pickItem(r.check, distances)
      guesses = r.check
    }
    const ids = [pick.item?.id, ...guesses.map((m) => m.item.id)].filter((id): id is string => !!id)
    return {
      key: nextKey++,
      shot,
      grid: r.grid,
      tile: r.tile,
      itemId: pick.item?.id ?? null,
      count: r.count,
      confidence: pick.confidence,
      guesses: [...new Set(ids)].slice(0, 4),
      read: r.name,
      stored: 0
    }
  })
  return { grids, rows }
}

/**
 * The grids to list: for new loot with more than one, the smaller (the container rather than the stash);
 * for everything the player has (or their keys), all of them.
 */
const defaultShown = (grids: GridScan[], mode: ScanMode): number[] =>
  grids.length <= 1 || mode !== 'loot'
    ? grids.map((_, i) => i)
    : [grids.reduce((best, g, i) => (g.tiles.length < grids[best].tiles.length ? i : best), 0)]

const updateShot = (id: number, change: Partial<Shot>): void =>
  patch({ shots: useScan.getState().shots.map((s) => (s.id === id ? { ...s, ...change } : s)) })

/** (Re)read one screenshot, replacing its rows. */
async function scanShot(id: number, items: LootItem[], region: Region | null): Promise<void> {
  const shot = useScan.getState().shots.find((s) => s.id === id)
  if (!shot) return
  patch({ busy: true, error: null })
  updateShot(id, { region })
  const started = performance.now()
  try {
    const { grids, rows } = await readShot(id, shot.pixels, region, items)
    const { shots, rows: current, mode } = useScan.getState()
    // Rows stay in screenshot order, with items added by hand last.
    const ordered = shots.flatMap((s) => (s.id === id ? rows : current.filter((r) => r.shot === s.id)))
    patch({ busy: false, rows: [...ordered, ...current.filter((r) => r.shot === null)] })
    updateShot(id, {
      grids,
      shown: defaultShown(grids, mode),
      seconds: (performance.now() - started) / 1000,
      error: grids.length
        ? null
        : region
          ? 'No items in that area. Drag a box around the whole container.'
          : 'Couldn’t find an item grid in this picture. Use a screenshot taken in game, or drag a box around the container.'
    })
  } catch (err) {
    patch({ busy: false, error: `Couldn’t scan it: ${err instanceof Error ? err.message : String(err)}` })
  }
}

/** Add a screenshot to the scan, or start a new scan with it. */
async function addShot(
  blob: Blob,
  name: string,
  source: string,
  items: LootItem[],
  fresh: boolean
): Promise<void> {
  const state = useScan.getState()
  if (!fresh && state.shots.some((s) => s.source === source)) {
    patch({ error: 'That screenshot is already in this scan. Take another one in game first.' })
    return
  }
  if (fresh) {
    for (const s of state.shots) URL.revokeObjectURL(s.url)
    patch({ ...EMPTY })
  }
  patch({ busy: true, error: null })
  let pixels: RgbaImage
  try {
    pixels = await decode(blob)
  } catch {
    patch({ busy: false, error: 'That file isn’t a picture the app can read. Use a PNG or JPEG screenshot.' })
    return
  }
  const id = nextShot++
  const shot: Shot = {
    id,
    source,
    url: URL.createObjectURL(blob),
    name,
    width: pixels.width,
    height: pixels.height,
    pixels,
    grids: [],
    shown: [],
    region: null,
    seconds: null,
    error: null,
    keepRepeats: false
  }
  patch({ shots: [...useScan.getState().shots, shot], active: id })
  await scanShot(id, items, null)
}

function removeShot(id: number): void {
  const { shots, rows, active } = useScan.getState()
  const shot = shots.find((s) => s.id === id)
  if (shot) URL.revokeObjectURL(shot.url)
  const left = shots.filter((s) => s.id !== id)
  patch({
    shots: left,
    rows: rows.filter((r) => r.shot !== id),
    active: active === id ? (left[left.length - 1]?.id ?? null) : active
  })
}

const fileSource = (file: File): string => `file:${file.name}:${file.size}:${file.lastModified}`

function imageFrom(list: DataTransferItemList | FileList | null | undefined): File | null {
  if (!list) return null
  const files: (File | null)[] =
    list instanceof FileList
      ? Array.from(list)
      : Array.from(list).map((entry) => (entry.kind === 'file' ? entry.getAsFile() : null))
  return files.find((file) => file?.type.startsWith('image/')) ?? null
}

/** Where each item sits in its grid, for spotting rows a screenshot repeats. */
const placed = (rows: ScanRow[], shot: number, grid: number): PlacedItem[] =>
  rows
    .filter((r) => r.shot === shot && r.grid === grid && r.tile)
    .map((r) => ({ col: r.tile!.col, row: r.tile!.row, w: r.tile!.w, h: r.tile!.h, itemId: r.itemId }))

/** Per screenshot after the first: the grid rows at its top that repeat the one before. */
function repeatedRows(
  shots: Shot[],
  rows: ScanRow[]
): Map<number, { grid: number; first: number; rows: number }> {
  const result = new Map<number, { grid: number; first: number; rows: number }>()
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1]
    const next = shots[i]
    for (const g of next.shown) {
      const lattice = next.grids[g]?.lattice
      const match = prev.shown.find(
        (p) => Math.abs((prev.grids[p]?.lattice.cell ?? 0) - (lattice?.cell ?? -9)) < 1
      )
      if (match === undefined || !lattice) continue
      const tiles = placed(rows, next.id, g)
      const repeated = findOverlap(placed(rows, prev.id, match), tiles)
      if (repeated) {
        result.set(next.id, { grid: g, first: Math.min(...tiles.map((t) => t.row)), rows: repeated })
        break
      }
    }
  }
  return result
}

/** Search box plus the scanner's best guesses, to set a row's item. */
function ItemPicker({
  items,
  guesses,
  prefer,
  onPick,
  onClose
}: {
  items: Items
  guesses: string[]
  /** Items to list first (keys, when reading keys). */
  prefer?: (id: string) => boolean
  onPick: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const first = (a: LootItem, b: LootItem): number =>
    prefer ? Number(prefer(b.id)) - Number(prefer(a.id)) : 0
  const [term, setTerm] = useState('')
  const results = useMemo(() => {
    const t = term.trim().toLowerCase()
    if (t.length < 2) return []
    return [...items.values()]
      .filter((i) => i.name.toLowerCase().includes(t) || i.shortName.toLowerCase().includes(t))
      .sort(
        (a, b) =>
          first(a, b) ||
          Number(b.shortName.toLowerCase() === t) - Number(a.shortName.toLowerCase() === t) ||
          Number(b.name.toLowerCase().startsWith(t)) - Number(a.name.toLowerCase().startsWith(t)) ||
          a.name.length - b.name.length
      )
      .slice(0, 8)
  }, [items, term, prefer])
  const shown =
    term.trim().length >= 2
      ? results
      : guesses
          .map((id) => items.get(id))
          .filter((i): i is LootItem => !!i)
          .sort(first)
  return (
    <div className="item-picker" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <input
        autoFocus
        type="search"
        placeholder="Search for the item"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      {term.trim().length < 2 && shown.length > 0 && <div className="muted picker-note">Likely:</div>}
      <ul>
        {shown.map((i) => (
          <li key={i.id}>
            <button onClick={() => onPick(i.id)}>
              {i.iconLink && <img src={i.iconLink} alt="" loading="lazy" />}
              <span>{i.name}</span>
              <span className="muted">
                {i.shortName} · {i.width}×{i.height}
              </span>
            </button>
          </li>
        ))}
        {term.trim().length >= 2 && !shown.length && <li className="muted">No item by that name.</li>}
      </ul>
      <button className="button small" onClick={onClose}>
        Cancel
      </button>
    </div>
  )
}

function Advice({
  advice,
  item,
  firOnly,
  getLater
}: {
  advice: ScanAdvice
  item: LootItem | undefined
  /** The kept ones are only the copies that must be found in raid (the rest can be got back). */
  firOnly: boolean
  /** Set when it's sold only because it can be got back: bought (where, for how much) or crafted. */
  getLater: GetBack | null
}): React.JSX.Element {
  if (!item) return <span className="badge warn">Pick the item</span>
  const keepFor = [
    advice.keepFor.hideout ? `hideout ×${advice.keepFor.hideout}` : null,
    advice.keepFor.quests ? `quests ×${advice.keepFor.quests}` : null
  ].filter(Boolean)
  const where = advice.via === 'flea' ? 'on the flea' : advice.trader ? `to ${advice.trader}` : 'to a trader'
  return (
    <div className="scan-advice">
      {advice.keep > 0 && (
        <span>
          <span className="badge ok">{advice.sell ? `Keep ${advice.keep}` : 'Keep'}</span>{' '}
          <span className="muted nowrap">
            for {keepFor.join(', ')}
            {firOnly && ' (found in raid)'}
          </span>
          {advice.stored > 0 && (
            <span className="muted nowrap" title="Added to the Have counts in Items needed">
              {' '}
              · added
            </span>
          )}
          {/* Kept only because they must be found in raid: how hard it is to buy isn't the reason. */}
          {advice.scarce && !firOnly && <ScarceBadge scarce={advice.scarce} />}
        </span>
      )}
      {advice.sell > 0 &&
        (advice.via ? (
          <span>
            <span className="badge info">
              {advice.keep ? `Sell ${advice.sell}` : 'Sell'} {where}
            </span>
            {getLater && (
              <span
                className="muted nowrap"
                title={`The hideout or a quest needs it, but it needn't be found in raid and you can ${getLater.kind === 'buy' ? 'buy' : 'craft'} it when you do`}
              >
                {' '}
                needed later ·{' '}
                {getLater.kind === 'buy'
                  ? `buy back ${formatRub(getLater.option.price)} (${getLater.option.label})`
                  : `craft at ${getLater.option.stationName}`}
              </span>
            )}
          </span>
        ) : (
          <span
            className="badge muted"
            title="No trader buys it and it can't be sold on the flea at your level"
          >
            No buyer
          </span>
        ))}
    </div>
  )
}

/** For counting everything the player has: whether the hideout's list wants the item. */
function Listed({
  need,
  item
}: {
  need: HideoutNeed | undefined
  item: LootItem | undefined
}): React.JSX.Element {
  if (!item) return <span className="badge warn">Pick the item</span>
  if (CURRENCIES[item.id]) return <span className="muted">Money isn&rsquo;t counted</span>
  return need ? (
    <span className="scan-advice">
      <span className="badge ok">On the list</span>
      <span className="muted nowrap">needs {need.needed}</span>
    </span>
  ) : (
    <span className="muted nowrap" title="Not needed by the hideout: its count isn't kept">
      Not on the list
    </span>
  )
}

export default function ScavScan({
  settings,
  priceState,
  items,
  progress,
  allNeeds,
  variant = 'items'
}: {
  settings: PublicSettings
  priceState: PriceState | null
  items: Items
  progress: HideoutProgress
  /** What every unbuilt level and quest left still needs (the list counts are set against). */
  allNeeds: HideoutNeed[]
  /** In the Items to collect tab (new loot, everything I have) or the Keys tab (your keys). */
  variant?: 'items' | 'keys'
}): React.JSX.Element {
  const state = useScan()
  // The scan is shared between the tabs: each shows it in its own mode, keeping the screenshots.
  const mode: ScanMode = variant === 'keys' ? 'keys' : state.mode === 'keys' ? 'stash' : state.mode
  useEffect(() => {
    if (useScan.getState().mode !== mode) setMode(mode)
  }, [mode])
  const { keyIds } = useKeyInfo(settings, priceState)
  const isKey = (id: string | null): boolean => !!id && keyIds.has(id)
  const inventory = useStore((s) => s.keys[settings.gameMode]) ?? EMPTY_KEYS
  const setOwnedKeys = useStore((s) => s.setOwnedKeys)
  const keepAll = useKeepList(settings, priceState)
  const buyCtx = useBuyContext(settings, priceState)
  const craftCtx = useCraftContext(settings, priceState)
  const updateSettings = useStore((s) => s.updateSettings)
  // By default, sell what's needed but can be bought or crafted now, keeping only what can't and the
  // copies that must be found in raid.
  const sellBuyable = settings.hideout.scanSellBuyable
  const getBack = useCallback(
    (itemId: string): GetBack | null => {
      const item = items.get(itemId)
      return item ? getBackNow(item, buyCtx, craftCtx) : null
    },
    [items, buyCtx, craftCtx]
  )
  const keep = useMemo(
    () => (sellBuyable ? keepOnlyHardToReplace(keepAll, (id) => getBack(id) !== null) : keepAll),
    [keepAll, sellBuyable, getBack]
  )
  /** For an item sold only because it can be got back: the cheapest way to buy it, or a craft. */
  const getLater = (itemId: string | null): GetBack | null => {
    if (!sellBuyable || !itemId) return null
    const all = keepAll.get(itemId)
    const kept = keep.get(itemId)
    if (!all || !kept || all.hideout + all.quests <= kept.hideout + kept.quests) return null
    return getBack(itemId)
  }
  const setHaveMany = useStore((s) => s.setHideoutHaveMany)
  const [picking, setPicking] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [dropping, setDropping] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const list = useMemo(() => [...items.values()], [items])
  const listRef = useRef(list)
  listRef.current = list

  const { shots } = state
  const ctx: ValuationContext = {
    playerLevel: settings.playerLevels[settings.gameMode],
    fleaMinLevel: priceState?.dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL,
    subtractFleaFee: settings.subtractFleaFee
  }
  const shotsById = new Map(shots.map((s) => [s.id, s]))
  const shotNumber = new Map(shots.map((s, i) => [s.id, i + 1]))
  const repeats = repeatedRows(shots, state.rows)
  const isRepeat = (r: ScanRow): boolean => {
    const rep = r.shot !== null ? repeats.get(r.shot) : undefined
    return (
      !!rep &&
      !!r.tile &&
      !shotsById.get(r.shot!)?.keepRepeats &&
      r.grid === rep.grid &&
      inOverlap(r.tile, rep.first, rep.rows)
    )
  }
  const counted = state.rows.filter(
    (r) => (r.shot === null || !!shotsById.get(r.shot)?.shown.includes(r.grid ?? -1)) && !isRepeat(r)
  )
  const advice = adviseScan(counted, items, keep, ctx)
  const adviceOf = new Map(counted.map((r, i) => [r.key, advice[i]]))
  const totals = scanTotals(advice)
  // Reading keys: only keys are listed (and rows it isn't sure of that could be one, and rows added by
  // hand); the rest of the screenshot is left out.
  const unsure = (r: ScanRow): boolean => r.confidence === 'low' || !r.itemId
  const listed =
    mode === 'keys'
      ? counted.filter((r) => r.shot === null || isKey(r.itemId) || (unsure(r) && r.guesses.some(isKey)))
      : counted
  const otherItems = counted.length - listed.length
  const toCheck = listed.filter(unsure).length
  const number = new Map(listed.map((r, i) => [r.key, i + 1]))
  const foundKeys =
    mode === 'keys' ? ([...new Set(listed.map((r) => r.itemId).filter(isKey))] as string[]) : []
  const keyChanges = mode === 'keys' ? keyScanChanges(foundKeys, inventory.owned) : null
  const owned = new Set(inventory.owned)
  const noSizes = list.length > 0 && !list.some((i) => i.width && i.height)
  const needById = new Map(allNeeds.map((n) => [n.itemId, n]))
  const loot = mode === 'loot' ? lootAdditions(counted, advice, progress.have) : null
  const toAdd = loot?.changes.reduce((n, c) => n + c.to - c.from, 0) ?? 0
  const added = advice.reduce((n, a) => n + a.stored, 0)
  const stash = mode === 'stash' ? stashCounts(counted, allNeeds, progress.have) : null
  const zeroed = stash?.changes.filter((c) => c.to === 0) ?? []
  const active = state.active !== null ? (shotsById.get(state.active) ?? null) : null
  const activeRepeat = active ? repeats.get(active.id) : undefined
  const name = (id: string): string => items.get(id)?.name ?? 'Unknown item'

  // Paste and drop anywhere on the tab; stop a dropped file from replacing the page.
  useEffect(() => {
    const fresh = (): boolean => useScan.getState().mode === 'loot' || !useScan.getState().shots.length
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea')) return
      const file = imageFrom(e.clipboardData?.items)
      if (file) {
        e.preventDefault()
        void addShot(file, 'Pasted picture', `paste:${Date.now()}`, listRef.current, fresh())
      }
    }
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault()
      setDropping(true)
    }
    const onDragLeave = (e: DragEvent): void => {
      if (!e.relatedTarget) setDropping(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      setDropping(false)
      const file = imageFrom(e.dataTransfer?.files)
      if (file) void addShot(file, file.name, fileSource(file), listRef.current, fresh())
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  /** New loot starts a new scan; counting everything adds to the one under way. */
  const fresh = mode === 'loot' || !shots.length
  const useLatest = async (startNew: boolean): Promise<void> => {
    patch({ busy: true, error: null })
    const file = await window.api.getLatestScreenshot().catch(() => null)
    if (!file) {
      patch({
        busy: false,
        error:
          'No screenshots in Documents\\Escape from Tarkov\\Screenshots yet. Take one in game (Print Screen).'
      })
      return
    }
    const type = /\.jpe?g$/i.test(file.name)
      ? 'image/jpeg'
      : /\.bmp$/i.test(file.name)
        ? 'image/bmp'
        : 'image/png'
    await addShot(
      new Blob([new Uint8Array(file.data)], { type }),
      file.name,
      `latest:${file.name}:${file.modified}`,
      list,
      startNew
    )
  }

  const updateRow = (key: number, change: Partial<ScanRow>): void =>
    patch({ rows: useScan.getState().rows.map((r) => (r.key === key ? { ...r, ...change } : r)) })
  const removeRow = (key: number): void =>
    patch({ rows: useScan.getState().rows.filter((r) => r.key !== key) })
  const addRow = (): void => {
    const key = nextKey++
    patch({
      rows: [
        ...useScan.getState().rows,
        {
          key,
          shot: null,
          grid: null,
          tile: null,
          itemId: null,
          count: 1,
          confidence: 'high',
          guesses: [],
          read: '',
          stored: 0
        }
      ]
    })
    setPicking(key)
  }

  const updateKeys = async (): Promise<void> => {
    if (!keyChanges || !(keyChanges.add.length || keyChanges.remove.length)) return
    if (keyChanges.remove.length && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    const before = inventory.owned
    setSaving(true)
    try {
      await setOwnedKeys(foundKeys)
      patch({ applied: { mode: 'keys', changes: [], stored: new Map(), keysBefore: before } })
    } catch (err) {
      patch({ error: `Couldn’t update your keys: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setSaving(false)
    }
  }
  const save = async (counts: CountChange[], use: 'from' | 'to'): Promise<boolean> => {
    setSaving(true)
    try {
      await setHaveMany(Object.fromEntries(counts.map((c) => [c.itemId, c[use]])))
      return true
    } catch (err) {
      patch({ error: `Couldn’t update Items needed: ${err instanceof Error ? err.message : String(err)}` })
      return false
    } finally {
      setSaving(false)
    }
  }
  const addLoot = async (): Promise<void> => {
    if (!loot?.changes.length) return
    const before = new Map(counted.map((r) => [r.key, r.stored]))
    if (!(await save(loot.changes, 'to'))) return
    const after = new Map(counted.map((r, i) => [r.key, loot.stored[i]]))
    patch({
      rows: useScan.getState().rows.map((r) => (after.has(r.key) ? { ...r, stored: after.get(r.key)! } : r)),
      applied: { mode: 'loot', changes: loot.changes, stored: before }
    })
  }
  const updateCounts = async (): Promise<void> => {
    if (!stash?.changes.length) return
    if (zeroed.length && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    if (await save(stash.changes, 'to'))
      patch({ applied: { mode: 'stash', changes: stash.changes, stored: new Map() } })
  }
  const undo = async (): Promise<void> => {
    const { applied } = useScan.getState()
    if (applied?.keysBefore) {
      setSaving(true)
      try {
        await setOwnedKeys(applied.keysBefore)
        patch({ applied: null })
      } finally {
        setSaving(false)
      }
      return
    }
    if (!applied || !(await save(applied.changes, 'from'))) return
    patch({
      applied: null,
      rows: useScan
        .getState()
        .rows.map((r) => (applied.stored.has(r.key) ? { ...r, stored: applied.stored.get(r.key)! } : r))
    })
  }

  // Region selection, in picture pixels.
  const toImage = (e: React.PointerEvent): { x: number; y: number } | null => {
    const rect = svg.current?.getBoundingClientRect()
    if (!rect || !active) return null
    return {
      x: ((e.clientX - rect.left) / rect.width) * active.width,
      y: ((e.clientY - rect.top) / rect.height) * active.height
    }
  }
  const finishDrag = (): void => {
    if (!drag || !active) return
    const region = {
      x: Math.min(drag.x0, drag.x1),
      y: Math.min(drag.y0, drag.y1),
      width: Math.abs(drag.x1 - drag.x0),
      height: Math.abs(drag.y1 - drag.y0)
    }
    setDrag(null)
    setSelecting(false)
    if (region.width > 40 && region.height > 40) void scanShot(active.id, list, region)
  }

  const focusRow = (key: number): void => {
    setHover(key)
    rowRefs.current.get(key)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const found = shots.reduce((n, s) => n + s.grids.reduce((m, g) => m + g.tiles.length, 0), 0)
  const repeated = state.rows.filter(isRepeat).length
  const status = state.busy
    ? 'Reading the screenshot…'
    : shots.length
      ? `${mode === 'keys' ? `${foundKeys.length} key${foundKeys.length === 1 ? '' : 's'} among ${found} items` : `${found} items found`}${shots.length > 1 ? ` in ${shots.length} screenshots` : ''}${
          active?.seconds != null && shots.length === 1 ? ` in ${active.seconds.toFixed(1)} s` : ''
        }${repeated ? `, ${repeated} repeated ones left out` : ''}${active?.region ? ' (part of the picture)' : ''}`
      : ''

  return (
    <div className={`scan ${dropping ? 'dropping' : ''}`}>
      <div className="scan-toolbar">
        {variant === 'items' && (
          <div className="segmented small" role="radiogroup" aria-label="What the screenshots show">
            {(
              [
                ['loot', 'New loot', 'A scav case haul or a container: what to keep, what to sell'],
                ['stash', 'Everything I have', 'Your stash and cases: set the Have counts in Items needed']
              ] as const
            ).map(([id, text, title]) => (
              <button
                key={id}
                role="radio"
                aria-checked={mode === id}
                className={mode === id ? 'active' : ''}
                title={title}
                onClick={() => setMode(id)}
                disabled={state.busy}
              >
                {text}
              </button>
            ))}
          </div>
        )}
        <button className="button primary" onClick={() => void useLatest(fresh)} disabled={state.busy}>
          {fresh ? 'Use latest screenshot' : 'Add latest screenshot'}
        </button>
        {mode === 'loot' && shots.length > 0 && (
          <button
            className="button"
            onClick={() => void useLatest(false)}
            disabled={state.busy}
            title="Add your newest screenshot to this scan, for a haul that takes more than one"
          >
            Add another
          </button>
        )}
        <button className="button" onClick={() => fileInput.current?.click()} disabled={state.busy}>
          {fresh ? 'Open picture…' : 'Add picture…'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/bmp,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void addShot(file, file.name, fileSource(file), list, fresh)
            e.target.value = ''
          }}
        />
        {active && (
          <>
            <button
              className={`button ${selecting ? 'primary' : ''}`}
              onClick={() => setSelecting(!selecting)}
              disabled={state.busy}
              title="Drag a box around the container to scan just that"
            >
              {selecting ? 'Drag a box on the picture…' : 'Scan part of it'}
            </button>
            {active.region && (
              <button
                className="button"
                onClick={() => void scanShot(active.id, list, null)}
                disabled={state.busy}
              >
                Scan all of it
              </button>
            )}
          </>
        )}
        {shots.length > 0 && (
          <button
            className="button"
            onClick={() => {
              for (const s of shots) URL.revokeObjectURL(s.url)
              patch({ ...EMPTY })
            }}
            disabled={state.busy}
          >
            Start over
          </button>
        )}
        <span className="muted scan-status">{status}</span>
      </div>
      {state.error && <p className="scan-error">{state.error}</p>}
      {active?.error && <p className="scan-error">{active.error}</p>}
      {noSizes && (
        <p className="scan-error">
          The scanner needs item sizes, which only tarkov.dev prices have. Switch the price source in
          Settings.
        </p>
      )}
      {!active ? (
        <div className="empty scan-empty">
          {mode === 'keys' ? (
            <>
              <p>
                <strong>Tick your keys from screenshots</strong>
              </p>
              <p>
                In game, open your key tool, keycard holder and any case you keep keys in, and take a
                screenshot of each (and of stash pages with loose keys). Add them all here with{' '}
                <em>Use latest screenshot</em>, open the pictures, paste (Ctrl+V) or drop them.
              </p>
              <p className="muted">
                The app finds each key and reads its name (on your PC, nothing is uploaded). Then{' '}
                <em>Update my keys</em> ticks the keys found in the Keys tab and unticks keys you&rsquo;d
                ticked that aren&rsquo;t in any screenshot, so include every place you keep keys. Undo puts
                your old list back.
              </p>
            </>
          ) : mode === 'loot' ? (
            <>
              <p>
                <strong>What to keep from your scav case</strong>
              </p>
              <p>
                Take a screenshot in game of your scav case haul (or any container), then use{' '}
                <em>Use latest screenshot</em>, open the picture, paste it (Ctrl+V) or drop it here.
              </p>
              <p className="muted">
                The app finds each item, reads its name and count (on your PC, nothing is uploaded), says what
                to keep for your hideout and active quests and what to sell, and can add what you keep to
                Items needed.
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>Count everything you have</strong>
              </p>
              <p>
                Screenshot each page of your stash (scroll down between them) and every case or container you
                keep hideout items in, open, and add them all here. Then update Items needed: each item on the
                list gets the number your screenshots show.
              </p>
              <p className="muted">
                Items on the list that aren&rsquo;t in any screenshot go back to 0, so include every place you
                keep them. Rows a screenshot repeats from the one before aren&rsquo;t counted twice.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="scan-body">
          <div className="scan-shot">
            {(shots.length > 1 || mode !== 'loot') && (
              <div className="scan-shots">
                {shots.map((s, i) => (
                  <div key={s.id} className={`scan-thumb ${s.id === active.id ? 'active' : ''}`}>
                    <button onClick={() => patch({ active: s.id })} title={s.name}>
                      <img src={s.url} alt="" />
                      <span>{i + 1}</span>
                    </button>
                    <button
                      className="scan-thumb-remove"
                      title="Leave this screenshot out"
                      onClick={() => removeShot(s.id)}
                      disabled={state.busy}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {activeRepeat && (
              <p className="scan-repeat">
                {active.keepRepeats
                  ? `Counting the top ${activeRepeat.rows} rows, which repeat screenshot ${
                      (shotNumber.get(active.id) ?? 2) - 1
                    }.`
                  : `The top ${activeRepeat.rows} rows repeat screenshot ${
                      (shotNumber.get(active.id) ?? 2) - 1
                    }, so they aren’t counted twice.`}{' '}
                <button
                  className="link-like"
                  onClick={() => updateShot(active.id, { keepRepeats: !active.keepRepeats })}
                >
                  {active.keepRepeats ? 'Don’t count them' : 'Count them anyway'}
                </button>
              </p>
            )}
            {active.grids.length > 1 && (
              <div className="scan-grids">
                <span className="muted">Found {active.grids.length} item grids:</span>
                {active.grids.map((g, i) => (
                  <label key={i} className="check">
                    <input
                      type="checkbox"
                      checked={active.shown.includes(i)}
                      onChange={(e) =>
                        updateShot(active.id, {
                          shown: e.target.checked ? [...active.shown, i] : active.shown.filter((s) => s !== i)
                        })
                      }
                    />
                    {g.tiles.length} items
                  </label>
                ))}
              </div>
            )}
            <div className="scan-frame">
              <img src={active.url} alt={active.name} draggable={false} />
              <svg
                ref={svg}
                viewBox={`0 0 ${active.width} ${active.height}`}
                className={selecting ? 'selecting' : ''}
                onPointerDown={(e) => {
                  if (!selecting) return
                  const p = toImage(e)
                  if (p) {
                    e.currentTarget.setPointerCapture(e.pointerId)
                    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
                  }
                }}
                onPointerMove={(e) => {
                  if (!drag) return
                  const p = toImage(e)
                  if (p) setDrag({ ...drag, x1: p.x, y1: p.y })
                }}
                onPointerUp={finishDrag}
              >
                {active.region && (
                  <rect
                    className="scan-region"
                    x={active.region.x}
                    y={active.region.y}
                    width={active.region.width}
                    height={active.region.height}
                  />
                )}
                {state.rows.map((r) => {
                  if (r.shot !== active.id || !r.tile || r.grid === null) return null
                  const n = number.get(r.key)
                  const a = adviceOf.get(r.key) ?? null
                  const kind = !n
                    ? 'off'
                    : r.confidence === 'low' || !r.itemId
                      ? 'check'
                      : mode === 'keys'
                        ? isKey(r.itemId)
                          ? 'keep'
                          : 'check'
                        : mode === 'stash'
                          ? r.itemId && needById.has(r.itemId)
                            ? 'keep'
                            : 'sell'
                          : a && a.keep > 0
                            ? 'keep'
                            : 'sell'
                  const t = r.tile
                  return (
                    <g
                      key={r.key}
                      className={`scan-box ${kind} ${hover === r.key ? 'hover' : ''}`}
                      onMouseEnter={() => n && setHover(r.key)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => n && focusRow(r.key)}
                    >
                      <rect
                        x={t.left + 1}
                        y={t.top + 1}
                        width={t.right - t.left - 2}
                        height={t.bottom - t.top - 2}
                      />
                      {n && (
                        <text x={t.left + 4} y={t.top + 4} dominantBaseline="hanging">
                          {n}
                        </text>
                      )}
                    </g>
                  )
                })}
                {drag && (
                  <rect
                    className="scan-drag"
                    x={Math.min(drag.x0, drag.x1)}
                    y={Math.min(drag.y0, drag.y1)}
                    width={Math.abs(drag.x1 - drag.x0)}
                    height={Math.abs(drag.y1 - drag.y0)}
                  />
                )}
              </svg>
            </div>
          </div>
          <div className="scan-results">
            {counted.length > 0 && mode === 'loot' && (
              <div className="scan-totals">
                <div>
                  <span className="muted">Sell the rest for</span> <strong>≈ {formatRub(totals.sell)}</strong>
                  {totals.flea > 0 && totals.traders > 0 && (
                    <span className="muted">
                      {' '}
                      ({formatRub(totals.flea)} on the flea, {formatRub(totals.traders)} to traders)
                    </span>
                  )}
                </div>
                <div>
                  <span className="muted">Keep</span> <strong>{totals.keep}</strong>{' '}
                  <span className="muted">
                    item{totals.keep === 1 ? '' : 's'} for your hideout and quests
                    {toCheck ? ` · ${toCheck} to check` : ''}
                  </span>
                </div>
                <div className="scan-apply">
                  {toAdd > 0 ? (
                    <button className="button primary small" onClick={() => void addLoot()} disabled={saving}>
                      Add {toAdd} kept item{toAdd === 1 ? '' : 's'} to Items needed
                    </button>
                  ) : added > 0 ? (
                    <span className="badge ok">Added to Items needed ✓</span>
                  ) : null}
                  {state.applied?.mode === 'loot' && (
                    <button className="button small" onClick={() => void undo()} disabled={saving}>
                      Undo
                    </button>
                  )}
                </div>
                <div className="muted scan-note">
                  Keeps what your active quests need and what the hideout needs for{' '}
                  {settings.hideout.scope === 'next' ? 'the next level of each station' : 'every level left'}{' '}
                  (see <em>Count items for</em>)
                  {sellBuyable &&
                    ', except what you can buy or craft now: of those it keeps only the copies that must be found in raid'}
                  , and sells the rest where it pays most at level {ctx.playerLevel}.
                </div>
                <label
                  className="check scan-note"
                  title="Sell needed items you can buy now (on the flea or from a trader) or craft in the hideout, and get them again when you need them; copies that must be found in raid are kept"
                >
                  <input
                    type="checkbox"
                    checked={sellBuyable}
                    onChange={(e) =>
                      void updateSettings({
                        hideout: { ...settings.hideout, scanSellBuyable: e.target.checked }
                      })
                    }
                  />
                  Sell what I can buy or craft later
                </label>
              </div>
            )}
            {stash && (
              <div className="scan-totals">
                <div>
                  <strong>
                    Items needed from{' '}
                    {shots.length === 1 ? 'this screenshot' : `these ${shots.length} screenshots`}
                  </strong>
                </div>
                {stash.changes.length ? (
                  <ul className="scan-changes">
                    {stash.changes
                      .filter((c) => c.to > 0)
                      .sort((a, b) => name(a.itemId).localeCompare(name(b.itemId)))
                      .map((c) => (
                        <li key={c.itemId}>
                          {name(c.itemId)}{' '}
                          <span className="muted">
                            {c.from} → <strong>{c.to}</strong>
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className="muted">
                    {state.applied?.mode === 'stash' ? 'Counts updated ✓' : 'Your counts already match.'}
                  </div>
                )}
                {zeroed.length > 0 && (
                  <div className="scan-zeroed">
                    <span className="muted">Not in your screenshots, back to 0:</span>{' '}
                    {zeroed
                      .map((c) => `${name(c.itemId)} (${c.from})`)
                      .sort()
                      .join(', ')}
                  </div>
                )}
                <div className="muted scan-note">
                  {stash.unchanged} already right · {stash.ignored} item{stash.ignored === 1 ? '' : 's'} seen
                  that neither the hideout nor a quest needs{toCheck ? ` · ${toCheck} to check` : ''}
                </div>
                <div className="scan-apply">
                  {stash.changes.length > 0 &&
                    (confirming ? (
                      <>
                        <span className="scan-warn">
                          {zeroed.length} item{zeroed.length === 1 ? '' : 's'} will go back to 0.
                        </span>
                        <button
                          className="button primary small"
                          onClick={() => void updateCounts()}
                          disabled={saving}
                        >
                          Update anyway
                        </button>
                        <button className="button small" onClick={() => setConfirming(false)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="button primary small"
                        onClick={() => void updateCounts()}
                        disabled={saving || state.busy}
                      >
                        Update my counts
                      </button>
                    ))}
                  {state.applied?.mode === 'stash' && (
                    <button className="button small" onClick={() => void undo()} disabled={saving}>
                      Undo
                    </button>
                  )}
                </div>
              </div>
            )}
            {keyChanges && (
              <div className="scan-totals">
                <div>
                  <strong>
                    Your keys from{' '}
                    {shots.length === 1 ? 'this screenshot' : `these ${shots.length} screenshots`}
                  </strong>
                </div>
                {keyChanges.add.length > 0 && (
                  <div className="scan-changes-line">
                    <span className="muted">To tick:</span> {keyChanges.add.map(name).sort().join(', ')}
                  </div>
                )}
                {keyChanges.remove.length > 0 && (
                  <div className="scan-zeroed">
                    <span className="muted">Not in your screenshots, to untick:</span>{' '}
                    {keyChanges.remove.map(name).sort().join(', ')}
                  </div>
                )}
                {!keyChanges.add.length && !keyChanges.remove.length && (
                  <div className="muted">
                    {state.applied?.mode === 'keys' ? 'Keys updated ✓' : 'Your keys already match.'}
                  </div>
                )}
                <div className="muted scan-note">
                  {keyChanges.unchanged} already ticked · {otherItems} other item{otherItems === 1 ? '' : 's'}{' '}
                  left out{toCheck ? ` · ${toCheck} to check` : ''}
                </div>
                <div className="scan-apply">
                  {(keyChanges.add.length > 0 || keyChanges.remove.length > 0) &&
                    (confirming ? (
                      <>
                        <span className="scan-warn">
                          {keyChanges.remove.length} key{keyChanges.remove.length === 1 ? '' : 's'} will be
                          unticked.
                        </span>
                        <button
                          className="button primary small"
                          onClick={() => void updateKeys()}
                          disabled={saving}
                        >
                          Update anyway
                        </button>
                        <button className="button small" onClick={() => setConfirming(false)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="button primary small"
                        onClick={() => void updateKeys()}
                        disabled={saving || state.busy}
                      >
                        Update my keys
                      </button>
                    ))}
                  {state.applied?.mode === 'keys' && (
                    <button className="button small" onClick={() => void undo()} disabled={saving}>
                      Undo
                    </button>
                  )}
                </div>
              </div>
            )}
            <table className="values-table scan-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>{mode === 'keys' ? 'Key' : 'Item'}</th>
                  {mode !== 'keys' && <th className="num">Count</th>}
                  <th>{mode === 'keys' ? 'Your keys' : mode === 'stash' ? 'Items needed' : 'Do'}</th>
                  {mode !== 'keys' && <th className="num">Worth</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {listed.map((r, i) => {
                  const item = r.itemId ? items.get(r.itemId) : undefined
                  const a = adviceOf.get(r.key)!
                  const check = r.confidence === 'low' || !item || (mode === 'keys' && !isKey(r.itemId))
                  const onList =
                    mode === 'keys'
                      ? isKey(r.itemId)
                      : mode === 'stash' && !!r.itemId && needById.has(r.itemId)
                  return (
                    <tr
                      key={r.key}
                      ref={(el) => {
                        if (el) rowRefs.current.set(r.key, el)
                        else rowRefs.current.delete(r.key)
                      }}
                      className={`${check ? 'check' : (mode === 'loot' ? a.keep : onList) ? 'keep' : ''} ${
                        hover === r.key ? 'hover' : ''
                      }`}
                      onMouseEnter={() => setHover(r.key)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <td className="num muted">
                        {r.shot !== null && r.shot !== active.id ? (
                          <button
                            className="link-like"
                            title={`On screenshot ${shotNumber.get(r.shot)}: show it`}
                            onClick={() => patch({ active: r.shot })}
                          >
                            {i + 1}
                          </button>
                        ) : (
                          i + 1
                        )}
                      </td>
                      <td className="item-cell">
                        {item?.iconLink && <img src={item.iconLink} alt="" loading="lazy" />}
                        <span>
                          <button
                            className="link-like"
                            onClick={() => setPicking(picking === r.key ? null : r.key)}
                            title={r.read ? `Read as “${r.read}”. Click to change.` : 'Click to change'}
                          >
                            {item?.name ?? 'Unknown item'}
                          </button>
                          {check && item && (
                            <span className="badge warn rare-badge" title={`Read as “${r.read}”`}>
                              Check this one
                            </span>
                          )}
                          {picking === r.key && (
                            <ItemPicker
                              items={items}
                              guesses={r.guesses}
                              prefer={mode === 'keys' ? isKey : undefined}
                              onPick={(id) => {
                                updateRow(r.key, { itemId: id, confidence: 'high' })
                                setPicking(null)
                              }}
                              onClose={() => setPicking(null)}
                            />
                          )}
                        </span>
                      </td>
                      {mode !== 'keys' && (
                        <td className="num">
                          <input
                            className="scan-count"
                            type="number"
                            min={1}
                            max={9999}
                            value={r.count}
                            aria-label="Count"
                            onChange={(e) => {
                              const n = Math.round(Number(e.target.value))
                              if (n >= 1 && n <= 9999) updateRow(r.key, { count: n })
                            }}
                          />
                        </td>
                      )}
                      <td>
                        {mode === 'keys' ? (
                          !item ? (
                            <span className="badge warn">Pick the key</span>
                          ) : !isKey(r.itemId) ? (
                            <span className="muted">Not a key: pick the key, or remove it</span>
                          ) : owned.has(r.itemId!) ? (
                            <span className="badge ok">Ticked</span>
                          ) : (
                            <span className="badge info">New</span>
                          )
                        ) : mode === 'stash' ? (
                          <Listed need={r.itemId ? needById.get(r.itemId) : undefined} item={item} />
                        ) : (
                          <Advice
                            advice={a}
                            item={item}
                            firOnly={sellBuyable && !!r.itemId && getBack(r.itemId) !== null}
                            getLater={getLater(r.itemId)}
                          />
                        )}
                      </td>
                      {mode !== 'keys' && (
                        <td className="num">
                          {mode === 'loot' && a.total > 0 ? (
                            formatRub(a.total)
                          ) : a.each > 0 ? (
                            <span
                              className="muted"
                              title={
                                mode === 'loot'
                                  ? 'What the ones you keep would sell for'
                                  : 'What they would sell for'
                              }
                            >
                              {formatRub(a.each * (mode === 'loot' ? a.keep : r.count))}
                            </span>
                          ) : (
                            '—'
                          )}
                          {mode === 'loot' && a.sell > 1 && a.each > 0 && (
                            <small>{formatRub(a.each)} each</small>
                          )}
                        </td>
                      )}
                      <td>
                        <button className="button icon small" title="Remove" onClick={() => removeRow(r.key)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!state.busy && (
              <button className="button small scan-add" onClick={addRow}>
                {mode === 'keys' ? 'Add a key it missed' : 'Add an item it missed'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
