import type { WikiExit } from './questTypes'

/** An extract's name for matching tarkov.dev's with the wiki's: letters and digits, lower case. */
function key(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** The same without bracketed asides: "Railroad Passage (Flare)" is "Railroad Passage". */
function bare(name: string): string {
  return key(name.replace(/\([^)]*\)/g, ''))
}

/** What the wiki says about an extract or transit, by its name (exactly, then without asides). */
export function matchExit(name: string, rows: readonly WikiExit[]): WikiExit | null {
  return (
    rows.find((r) => key(r.name) === key(name)) ??
    rows.find((r) => bare(r.name) === bare(name) && bare(name) !== '') ??
    null
  )
}
