// Finds the items in a screenshot of an Escape from Tarkov item grid (a container, the scav case, the
// stash) and reads their labels, entirely offline:
//  1. the grid: thin lines that repeat every cell, so the cell size and origin are the period and phase
//     that best fit the image's line profile;
//  2. the items: occupied cells (anything but the flat empty-cell grey) joined up wherever no item
//     border runs between them, since every item has a 1 px grey border;
//  3. the labels: the short name at an item's top right and the stack count at its bottom right, cut
//     out and cleaned up for OCR (done by the main process);
//  4. the match: the OCR text against items of the same size, with the item's tarkov.dev grid image
//     (which looks just like the game's) to settle look-alikes.
// Calibrated on 1080p screenshots (63 px cells); every size is scaled by the cell size found.

import type { LootItem } from '../../../shared/types'

/** RGBA pixels, as in canvas ImageData. */
export interface RgbaImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** One channel of pixels. */
export interface GreyImage {
  width: number
  height: number
  data: Uint8Array
}

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

/** The grid: cell size in pixels and where a cell line falls. */
export interface Lattice {
  cell: number
  x0: number
  y0: number
}

/** One item's cells, and its box in pixels (the border lines on either side). */
export interface ScanTile {
  col: number
  row: number
  w: number
  h: number
  left: number
  top: number
  right: number
  bottom: number
}

export interface GridScan {
  lattice: Lattice
  tiles: ScanTile[]
}

const REFERENCE_CELL = 63
export const MIN_CELL = 30
export const MAX_CELL = 140
/** The game's item border, RGB. */
const BORDER: readonly [number, number, number] = [73, 81, 84]
const BORDER_TOLERANCE = 18
/** Share of an edge in border colour for it to count as a border. */
const BORDER_SHARE = 0.6
/** Spread above which a cell holds something (empty cells are a flat grey with a slight gradient). */
const OCCUPIED_SPREAD = 4

const clampRegion = (img: RgbaImage, region?: Region): Region => {
  if (!region) return { x: 0, y: 0, width: img.width, height: img.height }
  const x = Math.max(0, Math.min(img.width - 1, Math.round(region.x)))
  const y = Math.max(0, Math.min(img.height - 1, Math.round(region.y)))
  return {
    x,
    y,
    width: Math.max(1, Math.min(img.width - x, Math.round(region.width))),
    height: Math.max(1, Math.min(img.height - y, Math.round(region.height)))
  }
}

/** Luma of the whole image (the same weights as OpenCV, which the calibration used). */
export function luma(img: RgbaImage): Float32Array {
  const out = new Float32Array(img.width * img.height)
  const d = img.data
  for (let i = 0, p = 0; i < out.length; i++, p += 4)
    out[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]
  return out
}

/**
 * How strongly a 2 px line starts at each column (and each row) of the region, averaged along it:
 * g[i] + g[i+1] − g[i−2] − g[i+3], clipped so a few hard edges don't drown the grid out.
 */
function lineProfiles(g: Float32Array, stride: number, r: Region): { px: Float64Array; py: Float64Array } {
  const CLIP = 30
  const clip = (v: number): number => (v > CLIP ? CLIP : v < -CLIP ? -CLIP : v)
  const px = new Float64Array(r.width)
  const py = new Float64Array(r.height)
  for (let y = 0; y < r.height; y++) {
    const row = (r.y + y) * stride + r.x
    for (let x = 2; x < r.width - 3; x++) {
      const i = row + x
      px[x] += clip(g[i] + g[i + 1] - g[i - 2] - g[i + 3])
    }
  }
  for (let x = 0; x < r.width; x++) px[x] /= r.height
  for (let y = 2; y < r.height - 3; y++) {
    let sum = 0
    for (let x = 0; x < r.width; x++) {
      const i = (r.y + y) * stride + r.x + x
      sum += clip(g[i] + g[i + stride] - g[i - 2 * stride] - g[i + 3 * stride])
    }
    py[y] = sum / r.width
  }
  return { px, py }
}

function standardise(p: Float64Array): Float64Array {
  const sorted = Float64Array.from(p).sort()
  const median = sorted[sorted.length >> 1] ?? 0
  let mean = 0
  for (const v of p) mean += v
  mean /= p.length || 1
  let variance = 0
  for (const v of p) variance += (v - mean) ** 2
  const sd = Math.sqrt(variance / (p.length || 1)) || 1
  return p.map((v) => (v - median) / sd)
}

/** Running sums of a profile, so any stretch of it adds up in one step. */
function prefixSums(p: Float64Array): Float64Array {
  const sums = new Float64Array(p.length + 1)
  for (let i = 0; i < p.length; i++) sums[i + 1] = sums[i] + p[i]
  return sums
}

/** The phase whose lines (every `period`) stand out most against everything between them. */
function bestPhase(p: Float64Array, sums: Float64Array, period: number): { score: number; phase: number } {
  const NEAR = 2
  let best = { score: -Infinity, phase: 0 }
  const n = p.length
  const total = sums[n]
  for (let phase = 0; phase < Math.ceil(period); phase++) {
    let on = 0
    let onCount = 0
    let near = 0
    let nearCount = 0
    for (let pos = phase; pos < n - 1; pos += period) {
      const at = Math.round(pos)
      on += p[at]
      onCount++
      const from = Math.max(0, at - NEAR)
      const to = Math.min(n, at + NEAR + 1)
      near += sums[to] - sums[from]
      nearCount += to - from
    }
    if (onCount < 3 || n - nearCount < 1) continue
    const score = on / onCount - (total - near) / (n - nearCount)
    if (score > best.score) best = { score, phase }
  }
  return best
}

/** The grid's cell size and origin (in image coordinates), or null when nothing repeats. */
export function findLattice(img: RgbaImage, region?: Region, g: Float32Array = luma(img)): Lattice | null {
  const r = clampRegion(img, region)
  if (r.width < MIN_CELL * 3 || r.height < MIN_CELL * 3) return null
  const profiles = lineProfiles(g, img.width, r)
  const px = standardise(profiles.px)
  const py = standardise(profiles.py)
  const sx = prefixSums(px)
  const sy = prefixSums(py)
  const fit = (cell: number): { score: number; cell: number; x0: number; y0: number } => {
    const x = bestPhase(px, sx, cell)
    const y = bestPhase(py, sy, cell)
    return { score: x.score + y.score, cell, x0: r.x + x.phase, y0: r.y + y.phase }
  }
  let best: ReturnType<typeof fit> | null = null
  const maxCell = Math.min(MAX_CELL, Math.max(r.width, r.height) / 3)
  for (let cell = MIN_CELL; cell <= maxCell; cell += 0.25) {
    const candidate = fit(cell)
    if (Number.isFinite(candidate.score) && (!best || candidate.score > best.score)) best = candidate
  }
  if (!best || best.score <= 1) return null
  // Every other line fits as well as every line, so prefer the smallest cell that fits nearly as well.
  for (const divisor of [3, 2]) {
    const cell = Math.round((best.cell / divisor) * 4) / 4
    if (cell < MIN_CELL) continue
    let finer: ReturnType<typeof fit> | null = null
    for (const c of [cell - 0.25, cell, cell + 0.25]) {
      const candidate = fit(c)
      if (!finer || candidate.score > finer.score) finer = candidate
    }
    if (finer && finer.score >= best.score * 0.8) {
      best = finer
      break
    }
  }
  return { cell: best.cell, x0: best.x0, y0: best.y0 }
}

/** Grid line positions inside the region. */
function lines(origin: number, cell: number, from: number, to: number, limit: number): number[] {
  const result: number[] = []
  const first = Math.ceil((from + 1 - origin) / cell)
  for (let k = first; ; k++) {
    const v = Math.round(origin + k * cell)
    if (v >= to - 3 || v >= limit - 3) break
    if (v >= 1) result.push(v)
  }
  return result
}

const isBorder = (d: Uint8ClampedArray, p: number): boolean =>
  Math.abs(d[p] - BORDER[0]) <= BORDER_TOLERANCE &&
  Math.abs(d[p + 1] - BORDER[1]) <= BORDER_TOLERANCE &&
  Math.abs(d[p + 2] - BORDER[2]) <= BORDER_TOLERANCE

/** Every item in the grid, each with its size in cells. */
export function findItems(
  img: RgbaImage,
  lattice: Lattice,
  region?: Region,
  g: Float32Array = luma(img)
): ScanTile[] {
  const r = clampRegion(img, region)
  const { cell } = lattice
  const xs = lines(lattice.x0, cell, r.x, r.x + r.width, img.width)
  const ys = lines(lattice.y0, cell, r.y, r.y + r.height, img.height)
  const cols = xs.length - 1
  const rows = ys.length - 1
  if (cols < 1 || rows < 1) return []
  const W = img.width
  const d = img.data
  const s = cell / REFERENCE_CELL
  const pad = Math.max(2, Math.round(3 * s))

  // A cell holds something when its pixels vary more than the empty cell's top-to-bottom shading.
  const occupied = new Uint8Array(cols * rows)
  for (let j = 0; j < rows; j++)
    for (let k = 0; k < cols; k++) {
      let sumSq = 0
      let count = 0
      for (let y = ys[j] + pad; y < ys[j + 1] - 1; y++) {
        let sum = 0
        const x0 = xs[k] + pad
        const x1 = xs[k + 1] - 1
        for (let x = x0; x < x1; x++) sum += g[y * W + x]
        const mean = sum / Math.max(1, x1 - x0)
        for (let x = x0; x < x1; x++) sumSq += (g[y * W + x] - mean) ** 2
        count += Math.max(0, x1 - x0)
      }
      occupied[j * cols + k] = count && Math.sqrt(sumSq / count) > OCCUPIED_SPREAD ? 1 : 0
    }

  // Share of an edge in border colour, taking the best of the line and the pixels next to it.
  const inset = Math.max(4, Math.round(5 * s))
  const vertical = (k: number, j: number): number => {
    let best = 0
    const y0 = ys[j] + inset
    const y1 = ys[j + 1] - inset + 1
    for (let dx = -1; dx <= 2; dx++) {
      const x = xs[k] + dx
      if (x < 0 || x >= W) continue
      let hits = 0
      for (let y = y0; y < y1; y++) if (isBorder(d, (y * W + x) * 4)) hits++
      best = Math.max(best, hits / Math.max(1, y1 - y0))
    }
    return best
  }
  const horizontal = (j: number, k: number): number => {
    let best = 0
    const x0 = xs[k] + inset
    const x1 = xs[k + 1] - inset + 1
    for (let dy = -1; dy <= 2; dy++) {
      const y = ys[j] + dy
      if (y < 0 || y >= img.height) continue
      let hits = 0
      for (let x = x0; x < x1; x++) if (isBorder(d, (y * W + x) * 4)) hits++
      best = Math.max(best, hits / Math.max(1, x1 - x0))
    }
    return best
  }

  // Join occupied neighbours with no border between them.
  const parent = Int32Array.from({ length: cols * rows }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  for (let j = 0; j < rows; j++)
    for (let k = 0; k < cols; k++) {
      const i = j * cols + k
      if (!occupied[i]) continue
      if (k + 1 < cols && occupied[i + 1] && vertical(k + 1, j) < BORDER_SHARE) parent[find(i + 1)] = find(i)
      if (j + 1 < rows && occupied[i + cols] && horizontal(j + 1, k) < BORDER_SHARE)
        parent[find(i + cols)] = find(i)
    }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < cols * rows; i++) {
    if (!occupied[i]) continue
    const root = find(i)
    const list = groups.get(root)
    if (list) list.push(i)
    else groups.set(root, [i])
  }

  // Keep rectangles that are bordered all round: anything else isn't an item in a grid.
  const tiles: ScanTile[] = []
  for (const cells of groups.values()) {
    const ks = cells.map((i) => i % cols)
    const js = cells.map((i) => Math.floor(i / cols))
    const col = Math.min(...ks)
    const row = Math.min(...js)
    const w = Math.max(...ks) - col + 1
    const h = Math.max(...js) - row + 1
    if (cells.length !== w * h) continue
    const edges: number[] = []
    for (let j = row; j < row + h; j++) edges.push(vertical(col, j), vertical(col + w, j))
    for (let k = col; k < col + w; k++) edges.push(horizontal(row, k), horizontal(row + h, k))
    if (edges.filter((e) => e >= BORDER_SHARE).length / edges.length < 0.5) continue
    tiles.push({ col, row, w, h, left: xs[col], top: ys[row], right: xs[col + w], bottom: ys[row + h] })
  }
  return tiles.sort((a, b) => a.row - b.row || a.col - b.col)
}

/** The grid and its items, or null when there's no grid. */
export function scanGrid(img: RgbaImage, region?: Region): GridScan | null {
  return scanGrids(img, region, 1)[0] ?? null
}

/**
 * Every item grid in the picture (say the stash and an open container), most prominent first: after
 * each one is found, its items are blanked out and the picture searched again.
 */
export function scanGrids(img: RgbaImage, region?: Region, max = 3): GridScan[] {
  const g = luma(img)
  const pixels: RgbaImage = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  const grids: GridScan[] = []
  for (let pass = 0; pass < max; pass++) {
    // A small region may hold too few lines to go on: then use the whole picture's grid.
    const lattice =
      findLattice(pixels, region, g) ?? (pass === 0 && region ? findLattice(pixels, undefined, g) : null)
    if (!lattice) break
    const tiles = findItems(pixels, lattice, region, g)
    if (!tiles.length) break
    grids.push({ lattice, tiles })
    const pad = Math.round(lattice.cell)
    const x0 = Math.max(0, Math.min(...tiles.map((t) => t.left)) - pad)
    const y0 = Math.max(0, Math.min(...tiles.map((t) => t.top)) - pad)
    const x1 = Math.min(img.width, Math.max(...tiles.map((t) => t.right)) + pad + 1)
    const y1 = Math.min(img.height, Math.max(...tiles.map((t) => t.bottom)) + pad + 1)
    for (let y = y0; y < y1; y++) {
      g.fill(0, y * img.width + x0, y * img.width + x1)
      pixels.data.fill(0, (y * img.width + x0) * 4, (y * img.width + x1) * 4)
    }
  }
  return grids
}

// ——— Labels ———

/** Light, unsaturated pixels (the game's label text), as their darkest channel; everything else 0. */
function textChannel(img: RgbaImage, x0: number, y0: number, x1: number, y1: number): GreyImage {
  const width = Math.max(0, x1 - x0)
  const height = Math.max(0, y1 - y0)
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = ((y0 + y) * img.width + x0 + x) * 4
      const r = img.data[p]
      const g = img.data[p + 1]
      const b = img.data[p + 2]
      const lo = Math.min(r, g, b)
      data[y * width + x] = Math.max(r, g, b) - lo <= 70 ? lo : 0
    }
  return { width, height, data }
}

interface Component {
  x: number
  y: number
  w: number
  h: number
  area: number
  pixels: number[]
}

function components(mask: Uint8Array, width: number, height: number): Component[] {
  const seen = new Uint8Array(mask.length)
  const result: Component[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    const pixels: number[] = []
    const stack = [start]
    seen[start] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    while (stack.length) {
      const i = stack.pop()!
      pixels.push(i)
      const x = i % width
      const y = (i - x) / width
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const n = ny * width + nx
          if (mask[n] && !seen[n]) {
            seen[n] = 1
            stack.push(n)
          }
        }
    }
    result.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area: pixels.length, pixels })
  }
  return result
}

/**
 * The text made of the kept glyphs: walking left from the rightmost glyph (labels are right-aligned)
 * until a gap wider than `maxGap`, then cropped, with the glyphs' anti-aliased edges kept.
 */
function rightAlignedText(
  v: GreyImage,
  keep: Component[],
  maxGap: number,
  maxIndent: number
): GreyImage | null {
  const { width, height } = v
  const kept = new Uint8Array(width * height)
  for (const c of keep) for (const i of c.pixels) kept[i] = 1
  const column = (x: number): boolean => {
    for (let y = 0; y < height; y++) if (kept[y * width + x]) return true
    return false
  }
  let x = width - 1
  while (x >= 0 && !column(x)) x--
  // Labels end at the right edge; anything further in is part of the icon.
  if (x < 0 || x < width - 1 - maxIndent) return null
  const end = x
  let start = x
  let gap = 0
  for (; x >= 0; x--) {
    if (column(x)) {
      start = x
      gap = 0
    } else if (++gap > maxGap) break
  }
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++)
    for (let xx = start; xx <= end; xx++)
      if (kept[y * width + xx]) {
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
  const x0 = Math.max(0, start - 1)
  const x1 = Math.min(width, end + 2)
  const y0 = Math.max(0, top - 1)
  const y1 = Math.min(height, bottom + 2)
  const out: GreyImage = { width: x1 - x0, height: y1 - y0, data: new Uint8Array((x1 - x0) * (y1 - y0)) }
  for (let y = y0; y < y1; y++)
    for (let xx = x0; xx < x1; xx++) {
      // Within a pixel of a kept glyph pixel.
      let near = false
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1 && !near; dx++) {
          const ny = y + dy
          const nx = xx + dx
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && kept[ny * width + nx]) near = true
        }
      if (near) out.data[(y - y0) * out.width + xx - x0] = v.data[y * width + xx]
    }
  return out
}

/** Text brighter than this (on the darkest channel) is a glyph. */
const GLYPH_LEVEL = 80

/** The item's short name, cut out of its top right corner, or null when there's no text there. */
export function nameLabel(img: RgbaImage, tile: ScanTile, cell: number): GreyImage | null {
  const s = cell / REFERENCE_CELL
  // Below the border (and a highlight line), down to under the descenders; clear of the right border.
  const y0 = tile.top + 1 + Math.max(1, Math.round(cell * 0.03))
  const y1 = tile.top + 1 + Math.round(cell * 0.19)
  const v = textChannel(img, tile.left + 1, y0, tile.right - 1, Math.min(img.height, y1))
  const offset = y0 - (tile.top + 1)
  const mask = v.data.map((p) => (p >= GLYPH_LEVEL ? 1 : 0))
  const keep = components(mask, v.width, v.height).filter((c) => {
    const solid = c.area / (c.w * c.h)
    if (c.h <= 2 && c.w >= 5) return false // a border or highlight line
    if ((c.w >= cell * 0.3 && solid >= 0.5) || (solid >= 0.85 && c.w * c.h >= 40 * s * s)) return false // icon
    const top = c.y + offset
    // Glyphs start in the cap band; a full stop sits on the baseline.
    return (
      (top <= cell * 0.12 && c.area >= 2) || (top <= cell * 0.15 && c.h <= cell * 0.05 && c.w <= cell * 0.05)
    )
  })
  return rightAlignedText(v, keep, Math.max(3, Math.round(cell * 0.1)), cell * 0.15)
}

/** The stack count (or "100/100" resource) at the item's bottom right, or null when there's none. */
export function countLabel(img: RgbaImage, tile: ScanTile, cell: number): GreyImage | null {
  const y0 = tile.bottom - Math.round(cell * 0.2)
  const v = textChannel(img, tile.left + 2, Math.max(0, y0), tile.right - 2, tile.bottom - 1)
  const mask = v.data.map((p) => (p >= GLYPH_LEVEL ? 1 : 0))
  // Digits sit on the bottom line; the found-in-raid tick above or beside them is taller.
  const keep = components(mask, v.width, v.height).filter(
    (c) => c.h >= cell * 0.1 && c.h <= cell * 0.145 && c.w <= cell * 0.2 && c.y + c.h >= v.height - cell * 0.1
  )
  return rightAlignedText(v, keep, Math.max(3, Math.round(cell * 0.08)), cell * 0.12)
}

/**
 * A label made ready for OCR: scaled up 4× (bilinear), dark text on white, with a margin, as a binary
 * PGM file that Tesseract reads directly.
 */
export function ocrImage(label: GreyImage, scale = 4): Uint8Array {
  const MARGIN = 16
  const LEVEL = 90
  const w = label.width * scale
  const h = label.height * scale
  const W = w + MARGIN * 2
  const H = h + MARGIN * 2
  const header = new TextEncoder().encode(`P5\n${W} ${H}\n255\n`)
  const out = new Uint8Array(header.length + W * H).fill(255)
  out.set(header)
  const at = (x: number, y: number): number =>
    label.data[
      Math.min(label.height - 1, Math.max(0, y)) * label.width + Math.min(label.width - 1, Math.max(0, x))
    ]
  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) / scale - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    for (let x = 0; x < w; x++) {
      const sx = (x + 0.5) / scale - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      const value =
        (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
        (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
      out[header.length + (y + MARGIN) * W + x + MARGIN] = value >= LEVEL ? 0 : 255
    }
  }
  return out
}

/** A stack count from OCR: "60" → 60; a resource ("100/100"), nothing or noise → 1. */
export function parseCount(text: string, confidence: number): number {
  const t = text.replace(/\s+/g, '')
  if (confidence < 50 || !/^\d{1,5}$/.test(t)) return 1
  const n = Number(t)
  return n >= 1 ? n : 1
}

// ——— Matching ———

/** Characters the game's font makes hard to tell apart, mapped to one of each. */
const LOOK_ALIKES: Record<string, string> = { i: 'l', '1': 'l', '|': 'l', '!': 'l', j: 'l', '0': 'o' }

export function normaliseName(text: string): string {
  return [...text.toLowerCase()]
    .map((c) => LOOK_ALIKES[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * The cost of reading `short` as `ocr`: edits, but stray characters before the text (bits of the icon)
 * cost half, and the end of a long name the game cut off a little more.
 */
function readCost(ocr: string, short: string): number {
  const LEAD = 0.5
  const CUT = 0.6
  const n = ocr.length
  const m = short.length
  let prev = new Float64Array(m + 1)
  let cur = new Float64Array(m + 1)
  for (let j = 0; j <= m; j++) prev[j] = j
  for (let i = 1; i <= n; i++) {
    cur[0] = i * LEAD
    for (let j = 1; j <= m; j++)
      cur[j] = Math.min(prev[j - 1] + (ocr[i - 1] === short[j - 1] ? 0 : 1), prev[j] + 1, cur[j - 1] + 1)
    ;[prev, cur] = [cur, prev]
  }
  let best = Infinity
  for (let j = 0; j <= m; j++) best = Math.min(best, prev[j] + (m - j) * CUT)
  return best
}

/** How well OCR text matches a short name, 0–1. */
export function nameScore(ocr: string, short: string): number {
  const a = normaliseName(ocr)
  const b = normaliseName(short)
  if (!a || !b) return 0
  return Math.max(0, 1 - readCost(a, b) / b.length)
}

/** Below this a name is no match at all. */
const MIN_NAME_SCORE = 0.3

export interface NameMatch {
  item: LootItem
  score: number
}

/** Items of this size (or turned on their side) by how well their short name fits the text. */
export function matchName(
  text: string,
  w: number,
  h: number,
  items: Iterable<LootItem>,
  limit = 6
): NameMatch[] {
  const result: NameMatch[] = []
  for (const item of items) {
    if (!item.width || !item.height) continue
    const upright = item.width === w && item.height === h
    const turned = item.width === h && item.height === w && w !== h
    if (!upright && !turned) continue
    const score = nameScore(text, item.shortName) - (upright ? 0 : 0.05)
    if (score >= MIN_NAME_SCORE) result.push({ item, score })
  }
  return result.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).slice(0, limit)
}

// ——— Pictures ———

const FEATURE_CELL = 16

/** The picture turned a quarter turn (clockwise, or anticlockwise), as the game shows a turned item. */
export function rotate(img: RgbaImage, clockwise: boolean): RgbaImage {
  const { width, height } = img
  const data = new Uint8ClampedArray(img.data.length)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const nx = clockwise ? height - 1 - y : y
      const ny = clockwise ? x : width - 1 - x
      const from = (y * width + x) * 4
      data.set(img.data.subarray(from, from + 4), (ny * height + nx) * 4)
    }
  return { width: height, height: width, data }
}

/**
 * A small copy of a w×h-cell picture (16 px per cell, RGB), without its outer 2 px. For a screenshot
 * tile pass its box; for a tarkov.dev grid image (64 px per cell) the whole image.
 */
export function pictureFeature(img: RgbaImage, box: Region, w: number, h: number): Float32Array {
  const x0 = box.x + 2
  const y0 = box.y + 2
  const bw = Math.max(1, box.width - 4)
  const bh = Math.max(1, box.height - 4)
  const ow = w * FEATURE_CELL
  const oh = h * FEATURE_CELL
  const out = new Float32Array(ow * oh * 3)
  for (let oy = 0; oy < oh; oy++) {
    const sy0 = y0 + Math.floor((oy * bh) / oh)
    const sy1 = Math.max(sy0 + 1, y0 + Math.floor(((oy + 1) * bh) / oh))
    for (let ox = 0; ox < ow; ox++) {
      const sx0 = x0 + Math.floor((ox * bw) / ow)
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((ox + 1) * bw) / ow))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let y = sy0; y < sy1 && y < img.height; y++)
        for (let x = sx0; x < sx1 && x < img.width; x++) {
          const p = (y * img.width + x) * 4
          r += img.data[p]
          g += img.data[p + 1]
          b += img.data[p + 2]
          n++
        }
      const o = (oy * ow + ox) * 3
      out[o] = r / (n || 1)
      out[o + 1] = g / (n || 1)
      out[o + 2] = b / (n || 1)
    }
  }
  return out
}

/** A tile's box, for `pictureFeature`. */
export const tileRegion = (t: ScanTile): Region => ({
  x: t.left,
  y: t.top,
  width: t.right - t.left + 1,
  height: t.bottom - t.top + 1
})

/**
 * How unlike an item's grid picture a tile looks (the picture turned either way when the item lies on its
 * side), or null when the item doesn't fit the tile.
 */
export function tileDistance(
  img: RgbaImage,
  tile: ScanTile,
  item: LootItem,
  picture: RgbaImage
): number | null {
  const { w, h } = tile
  const feature = pictureFeature(img, tileRegion(tile), w, h)
  const compare = (p: RgbaImage): number =>
    pictureDistance(feature, pictureFeature(p, { x: 0, y: 0, width: p.width, height: p.height }, w, h))
  if (item.width === w && item.height === h) return compare(picture)
  if (item.width === h && item.height === w)
    return Math.min(compare(rotate(picture, true)), compare(rotate(picture, false)))
  return null
}

/** Mean difference per channel (0–255) between two features of the same size. */
export function pictureDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}

export type Confidence = 'high' | 'medium' | 'low'

export interface Pick {
  item: LootItem | null
  confidence: Confidence
}

/** Name scores at least this good, with no close second, need no picture check. */
export const SURE_NAME = 0.8

/** Whether the name match is clear enough on its own. */
export function nameIsSure(matches: readonly NameMatch[]): boolean {
  const [first, second] = matches
  return !!first && first.score >= SURE_NAME && (!second || second.score < first.score - 0.15)
}

/** The name candidates worth comparing pictures for. */
export function shortlist(matches: readonly NameMatch[]): NameMatch[] {
  const best = matches[0]?.score ?? 0
  return matches.filter((m) => m.score >= Math.max(0.45, best - 0.2))
}

/**
 * The best item given name scores and, where known, picture distances (same order; null when the
 * picture couldn't be loaded): each picture-distance point weighs about as much as 0.03 of name score.
 */
export function pickItem(matches: readonly NameMatch[], distances: readonly (number | null)[] = []): Pick {
  if (!matches.length) return { item: null, confidence: 'low' }
  if (nameIsSure(matches)) return { item: matches[0].item, confidence: 'high' }
  // A picture that couldn't be loaded counts as an average one.
  const known = distances.filter((d): d is number => d !== null && Number.isFinite(d))
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 30
  const scored = matches
    .map((m, i) => ({ m, d: distances[i] ?? null }))
    .map(({ m, d }) => ({ m, d, total: m.score - (d ?? average) / 33 }))
    .sort((a, b) => b.total - a.total)
  const [first, second] = scored
  const clear = !second || first.total - second.total >= 0.12
  // tarkov.dev's pictures are sometimes older renders of the icon, so a well-read name whose picture is
  // the closest counts even when it isn't close.
  const closest = first.d !== null && known.every((d) => first.d! <= d)
  let confidence: Confidence = 'low'
  if (
    clear &&
    first.m.score >= 0.6 &&
    first.d !== null &&
    (first.d <= 15 || (closest && first.m.score >= 0.9))
  )
    confidence = 'high'
  else if (clear && (first.d !== null ? first.d <= 25 || closest : first.m.score >= 0.6))
    confidence = 'medium'
  return { item: first.m.item, confidence }
}
