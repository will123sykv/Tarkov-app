import { create } from 'zustand'
import { normaliseName } from './scavScan'

// The items picked for labels the scanner wasn't sure of, remembered for later scans (since 1.73.0):
// the same label, on a tile the same size, is that item again. Kept in the browser storage; storage can
// be missing or full, and then they're only kept while the app runs.

export interface RememberedPick {
  itemId: string
  at: number
}

export type ScanPicks = Readonly<Record<string, RememberedPick>>

const KEY = 'scanPicks:v1'
/** The most picks kept: the latest. */
export const MAX_PICKS = 1000

/**
 * Which label a pick is for: the label as read (case, punctuation and look-alike characters aside) and
 * the tile's size either way up; null when nothing was read.
 */
export function pickKey(read: string, w: number, h: number): string | null {
  const name = normaliseName(read)
  return name ? `${name}|${Math.min(w, h)}x${Math.max(w, h)}` : null
}

/** The picks with one added (or changed), keeping the latest `MAX_PICKS`. */
export function withPick(picks: ScanPicks, key: string, itemId: string, at: number): ScanPicks {
  const next = { ...picks, [key]: { itemId, at } }
  const keys = Object.keys(next)
  if (keys.length <= MAX_PICKS) return next
  const keep = new Set(keys.sort((a, b) => next[b].at - next[a].at || a.localeCompare(b)).slice(0, MAX_PICKS))
  return Object.fromEntries(Object.entries(next).filter(([k]) => keep.has(k)))
}

function sanitize(raw: unknown): ScanPicks {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, RememberedPick> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
    if (p && typeof p.itemId === 'string' && typeof p.at === 'number' && Number.isFinite(p.at))
      out[k] = { itemId: p.itemId, at: p.at }
  }
  return out
}

function read(): ScanPicks {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? sanitize(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

function write(picks: ScanPicks): void {
  try {
    if (Object.keys(picks).length) window.localStorage.setItem(KEY, JSON.stringify(picks))
    else window.localStorage.removeItem(KEY)
  } catch {
    // Kept while the app runs.
  }
}

export const useScanPicks = create<{ picks: ScanPicks }>(() => ({ picks: read() }))

/** Remember the item picked for a label. */
export function rememberPick(read: string, w: number, h: number, itemId: string): void {
  const key = pickKey(read, w, h)
  if (!key) return
  const picks = withPick(useScanPicks.getState().picks, key, itemId, Date.now())
  write(picks)
  useScanPicks.setState({ picks })
}

/** The item picked for this label before, if any. */
export function rememberedPick(read: string, w: number, h: number): string | null {
  const key = pickKey(read, w, h)
  return key ? (useScanPicks.getState().picks[key]?.itemId ?? null) : null
}

export function forgetPicks(): void {
  write({})
  useScanPicks.setState({ picks: {} })
}

/** A row read off a screenshot, as far as picking an item for it goes. */
interface PickRow {
  key: number
  tile: { w: number; h: number } | null
  read: string
  itemId: string | null
}

/**
 * The rows that take an item picked for `row` (since 1.73.0): it, and every other one read the same way
 * on a tile the same size.
 */
export function rowsLike<R extends PickRow>(rows: readonly R[], row: R): R[] {
  const key = row.tile ? pickKey(row.read, row.tile.w, row.tile.h) : null
  if (!key) return rows.filter((r) => r.key === row.key)
  return rows.filter((r) => r.key === row.key || (r.tile && pickKey(r.read, r.tile.w, r.tile.h) === key))
}
