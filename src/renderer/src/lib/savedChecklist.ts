import { create } from 'zustand'
import { sanitizeSavedChecklist, type SavedChecklist } from '../../../shared/scavAdvice'

// The last sell checklist, kept in the browser storage so it's still there after the app closes (since
// 1.71.0). Storage can be missing or full: then it's only kept while the app runs.

const KEY = 'sellChecklist:v1'

function read(): SavedChecklist | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? sanitizeSavedChecklist(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function write(saved: SavedChecklist | null): void {
  try {
    if (saved) window.localStorage.setItem(KEY, JSON.stringify(saved))
    else window.localStorage.removeItem(KEY)
  } catch {
    // Kept while the app runs.
  }
}

export const useSavedChecklist = create<{ saved: SavedChecklist | null }>(() => ({ saved: read() }))

/** Keep a checklist, or forget it (null). */
export function saveChecklist(saved: SavedChecklist | null): void {
  write(saved)
  useSavedChecklist.setState({ saved })
}
