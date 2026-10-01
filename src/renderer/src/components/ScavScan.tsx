import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../../shared/constants'
import { adviseScan, scanTotals, type ScanAdvice } from '../../../shared/scavAdvice'
import type { OcrJob } from '../../../shared/scanTypes'
import type { LootItem, PriceState, PublicSettings } from '../../../shared/types'
import type { ValuationContext } from '../../../shared/valuation'
import { formatRub } from '../lib/format'
import {
  countLabel,
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
  type Region,
  type RgbaImage,
  type ScanTile
} from '../lib/scavScan'
import { useKeepList } from '../lib/useKeepList'
import ScarceBadge from './ScarceBadge'

// The Hideout tab's scav case scanner: add a screenshot of a scav case haul (or any container), and it
// finds each item, reads its name and count, and says what to keep for the hideout and active quests and
// what to sell, and where. Everything it read can be corrected.

type Items = ReadonlyMap<string, LootItem>

interface ScanRow {
  key: number
  /** Which grid in the screenshot, and where; null for items added by hand. */
  grid: number | null
  tile: ScanTile | null
  itemId: string | null
  count: number
  confidence: Confidence
  /** Likely items, best first (for correcting a wrong read). */
  guesses: string[]
  /** What OCR read off the label. */
  read: string
}

interface Shot {
  url: string
  name: string
  width: number
  height: number
}

interface ScanState {
  shot: Shot | null
  pixels: RgbaImage | null
  busy: boolean
  error: string | null
  grids: GridScan[]
  /** Grids whose items are listed. */
  shown: number[]
  rows: ScanRow[]
  region: Region | null
  seconds: number | null
}

const EMPTY: ScanState = {
  shot: null,
  pixels: null,
  busy: false,
  error: null,
  grids: [],
  shown: [],
  rows: [],
  region: null,
  seconds: null
}

// Kept while the app runs, so switching tabs doesn't lose a scan.
const useScan = create<ScanState>(() => EMPTY)
const patch = (p: Partial<ScanState>): void => useScan.setState(p)
let nextKey = 1

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
      grid: r.grid,
      tile: r.tile,
      itemId: pick.item?.id ?? null,
      count: r.count,
      confidence: pick.confidence,
      guesses: [...new Set(ids)].slice(0, 4),
      read: r.name
    }
  })
  return { grids, rows }
}

/** The grid to list first: with more than one, the smaller (the container rather than the stash). */
const defaultShown = (grids: GridScan[]): number[] =>
  grids.length <= 1
    ? grids.map((_, i) => i)
    : [grids.reduce((best, g, i) => (g.tiles.length < grids[best].tiles.length ? i : best), 0)]

async function scan(items: LootItem[], region: Region | null = useScan.getState().region): Promise<void> {
  const { pixels } = useScan.getState()
  if (!pixels) return
  patch({ busy: true, error: null, region })
  const started = performance.now()
  try {
    const { grids, rows } = await readShot(pixels, region, items)
    patch({
      busy: false,
      grids,
      rows,
      shown: defaultShown(grids),
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

async function open(blob: Blob, name: string, items: LootItem[]): Promise<void> {
  const previous = useScan.getState().shot
  patch({ ...EMPTY, busy: true })
  if (previous) URL.revokeObjectURL(previous.url)
  try {
    const pixels = await decode(blob)
    patch({
      pixels,
      shot: { url: URL.createObjectURL(blob), name, width: pixels.width, height: pixels.height }
    })
    await scan(items, null)
  } catch {
    patch({ ...EMPTY, error: 'That file isn’t a picture the app can read. Use a PNG or JPEG screenshot.' })
  }
}

function imageFrom(list: DataTransferItemList | FileList | null | undefined): File | null {
  if (!list) return null
  const files: (File | null)[] =
    list instanceof FileList
      ? Array.from(list)
      : Array.from(list).map((entry) => (entry.kind === 'file' ? entry.getAsFile() : null))
  return files.find((file) => file?.type.startsWith('image/')) ?? null
}

/** Search box plus the scanner's best guesses, to set a row's item. */
function ItemPicker({
  items,
  guesses,
  onPick,
  onClose
}: {
  items: Items
  guesses: string[]
  onPick: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [term, setTerm] = useState('')
  const results = useMemo(() => {
    const t = term.trim().toLowerCase()
    if (t.length < 2) return []
    return [...items.values()]
      .filter((i) => i.name.toLowerCase().includes(t) || i.shortName.toLowerCase().includes(t))
      .sort(
        (a, b) =>
          Number(b.shortName.toLowerCase() === t) - Number(a.shortName.toLowerCase() === t) ||
          Number(b.name.toLowerCase().startsWith(t)) - Number(a.name.toLowerCase().startsWith(t)) ||
          a.name.length - b.name.length
      )
      .slice(0, 8)
  }, [items, term])
  const shown =
    term.trim().length >= 2 ? results : guesses.map((id) => items.get(id)).filter((i): i is LootItem => !!i)
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

function Advice({ advice, item }: { advice: ScanAdvice; item: LootItem | undefined }): React.JSX.Element {
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
          <span className="muted nowrap">for {keepFor.join(', ')}</span>
          {advice.scarce && <ScarceBadge scarce={advice.scarce} />}
        </span>
      )}
      {advice.sell > 0 &&
        (advice.via ? (
          <span>
            <span className="badge info">
              {advice.keep ? `Sell ${advice.sell}` : 'Sell'} {where}
            </span>
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

export default function ScavScan({
  settings,
  priceState,
  items
}: {
  settings: PublicSettings
  priceState: PriceState | null
  items: Items
}): React.JSX.Element {
  const state = useScan()
  const keep = useKeepList(settings, priceState)
  const [picking, setPicking] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [dropping, setDropping] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const list = useMemo(() => [...items.values()], [items])
  const listRef = useRef(list)
  listRef.current = list

  const ctx: ValuationContext = {
    playerLevel: settings.playerLevels[settings.gameMode],
    fleaMinLevel: priceState?.dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL,
    subtractFleaFee: settings.subtractFleaFee
  }
  const rows = state.rows.filter((r) => r.grid === null || state.shown.includes(r.grid))
  const advice = adviseScan(rows, items, keep, ctx)
  const totals = scanTotals(advice)
  const toCheck = rows.filter((r) => r.confidence === 'low' || !r.itemId).length
  const number = new Map(rows.map((r, i) => [r.key, i + 1]))
  const noSizes = list.length > 0 && !list.some((i) => i.width && i.height)

  // Paste and drop anywhere on the tab; stop a dropped file from replacing the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea')) return
      const file = imageFrom(e.clipboardData?.items)
      if (file) {
        e.preventDefault()
        void open(file, 'Pasted picture', listRef.current)
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
      if (file) void open(file, file.name, listRef.current)
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

  const useLatest = async (): Promise<void> => {
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
    await open(new Blob([new Uint8Array(file.data)], { type }), file.name, list)
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
        { key, grid: null, tile: null, itemId: null, count: 1, confidence: 'high', guesses: [], read: '' }
      ]
    })
    setPicking(key)
  }

  // Region selection, in picture pixels.
  const toImage = (e: React.PointerEvent): { x: number; y: number } | null => {
    const rect = svg.current?.getBoundingClientRect()
    if (!rect || !state.shot) return null
    return {
      x: ((e.clientX - rect.left) / rect.width) * state.shot.width,
      y: ((e.clientY - rect.top) / rect.height) * state.shot.height
    }
  }
  const finishDrag = (): void => {
    if (!drag) return
    const region = {
      x: Math.min(drag.x0, drag.x1),
      y: Math.min(drag.y0, drag.y1),
      width: Math.abs(drag.x1 - drag.x0),
      height: Math.abs(drag.y1 - drag.y0)
    }
    setDrag(null)
    setSelecting(false)
    if (region.width > 40 && region.height > 40) void scan(list, region)
  }

  const focusRow = (key: number): void => {
    setHover(key)
    rowRefs.current.get(key)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const status = state.busy
    ? 'Reading the screenshot…'
    : state.shot && !state.error
      ? `${state.grids.reduce((n, g) => n + g.tiles.length, 0)} items found${
          state.seconds != null ? ` in ${state.seconds.toFixed(1)} s` : ''
        }${state.region ? ' in the area you picked' : ''}`
      : ''

  return (
    <div className={`scan ${dropping ? 'dropping' : ''}`}>
      <div className="scan-toolbar">
        <button className="button primary" onClick={() => void useLatest()} disabled={state.busy}>
          Use latest screenshot
        </button>
        <button className="button" onClick={() => fileInput.current?.click()} disabled={state.busy}>
          Open picture…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/bmp,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void open(file, file.name, list)
            e.target.value = ''
          }}
        />
        {state.shot && (
          <>
            <button
              className={`button ${selecting ? 'primary' : ''}`}
              onClick={() => setSelecting(!selecting)}
              disabled={state.busy}
              title="Drag a box around the container to scan just that"
            >
              {selecting ? 'Drag a box on the picture…' : 'Scan part of it'}
            </button>
            {state.region && (
              <button className="button" onClick={() => void scan(list, null)} disabled={state.busy}>
                Scan all of it
              </button>
            )}
          </>
        )}
        <span className="muted scan-status">{status}</span>
      </div>
      {state.error && <p className="scan-error">{state.error}</p>}
      {noSizes && (
        <p className="scan-error">
          The scanner needs item sizes, which only tarkov.dev prices have. Switch the price source in
          Settings.
        </p>
      )}
      {!state.shot ? (
        <div className="empty scan-empty">
          <p>
            <strong>What to keep from your scav case</strong>
          </p>
          <p>
            Take a screenshot in game of your scav case haul (or any container), then use{' '}
            <em>Use latest screenshot</em>, open the picture, paste it (Ctrl+V) or drop it here.
          </p>
          <p className="muted">
            The app finds each item, reads its name and count (on your PC, nothing is uploaded), and says what
            to keep for your hideout and active quests and what to sell, and where.
          </p>
        </div>
      ) : (
        <div className="scan-body">
          <div className="scan-shot">
            {state.grids.length > 1 && (
              <div className="scan-grids">
                <span className="muted">Found {state.grids.length} item grids:</span>
                {state.grids.map((g, i) => (
                  <label key={i} className="check">
                    <input
                      type="checkbox"
                      checked={state.shown.includes(i)}
                      onChange={(e) =>
                        patch({
                          shown: e.target.checked ? [...state.shown, i] : state.shown.filter((s) => s !== i)
                        })
                      }
                    />
                    {g.tiles.length} items
                  </label>
                ))}
              </div>
            )}
            <div className="scan-frame">
              <img src={state.shot.url} alt={state.shot.name} draggable={false} />
              <svg
                ref={svg}
                viewBox={`0 0 ${state.shot.width} ${state.shot.height}`}
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
                {state.region && (
                  <rect
                    className="scan-region"
                    x={state.region.x}
                    y={state.region.y}
                    width={state.region.width}
                    height={state.region.height}
                  />
                )}
                {state.rows.map((r, i) => {
                  if (!r.tile || r.grid === null) return null
                  const shown = state.shown.includes(r.grid)
                  const a = shown ? advice[rows.indexOf(r)] : null
                  const kind = !shown
                    ? 'off'
                    : r.confidence === 'low' || !r.itemId
                      ? 'check'
                      : a && a.keep > 0
                        ? 'keep'
                        : 'sell'
                  const t = r.tile
                  return (
                    <g
                      key={r.key}
                      className={`scan-box ${kind} ${hover === r.key ? 'hover' : ''}`}
                      onMouseEnter={() => shown && setHover(r.key)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => shown && focusRow(r.key)}
                    >
                      <rect
                        x={t.left + 1}
                        y={t.top + 1}
                        width={t.right - t.left - 2}
                        height={t.bottom - t.top - 2}
                      />
                      {shown && (
                        <text x={t.left + 4} y={t.top + 4} dominantBaseline="hanging">
                          {number.get(r.key) ?? i + 1}
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
            {rows.length > 0 && (
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
                <div className="muted scan-note">
                  Keeps what your active quests need and what the hideout needs for{' '}
                  {settings.hideout.scope === 'next' ? 'the next level of each station' : 'every level left'}{' '}
                  (see <em>Count items for</em>), sells the rest where it pays most at level {ctx.playerLevel}
                  .
                </div>
              </div>
            )}
            <table className="values-table scan-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Item</th>
                  <th className="num">Count</th>
                  <th>Do</th>
                  <th className="num">Worth</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const item = r.itemId ? items.get(r.itemId) : undefined
                  const a = advice[i]
                  const check = r.confidence === 'low' || !item
                  return (
                    <tr
                      key={r.key}
                      ref={(el) => {
                        if (el) rowRefs.current.set(r.key, el)
                        else rowRefs.current.delete(r.key)
                      }}
                      className={`${check ? 'check' : a.keep ? 'keep' : ''} ${hover === r.key ? 'hover' : ''}`}
                      onMouseEnter={() => setHover(r.key)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <td className="num muted">{i + 1}</td>
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
                              onPick={(id) => {
                                updateRow(r.key, { itemId: id, confidence: 'high' })
                                setPicking(null)
                              }}
                              onClose={() => setPicking(null)}
                            />
                          )}
                        </span>
                      </td>
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
                      <td>
                        <Advice advice={a} item={item} />
                      </td>
                      <td className="num">
                        {a.total > 0 ? (
                          formatRub(a.total)
                        ) : a.keep > 0 && a.each > 0 ? (
                          <span className="muted" title="What the ones you keep would sell for">
                            {formatRub(a.each * a.keep)}
                          </span>
                        ) : (
                          '—'
                        )}
                        {a.sell > 1 && a.each > 0 && <small>{formatRub(a.each)} each</small>}
                      </td>
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
                Add an item it missed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
