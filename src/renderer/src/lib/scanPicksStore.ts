import { create } from 'zustand'
import { pickKey, withPick, type RememberedPick, type ScanPicks } from './scanPicks'

// The items picked for labels (scanPicks), kept in the browser storage (since 1.73.0). Storage can be
// missing or full: then they're only kept while the app runs.

const KEY = 'scanPicks:v1'

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
