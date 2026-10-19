import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { readJsonFileChecked } from './jsonFile'

// The player's progress (player.json: quests, hideout, keys, loyalty, objectives, pins, favourites) and
// settings, copied once a day into backups/ (the newest 7 days kept), and put back from there when a
// file turns out damaged, instead of starting empty and saving over it. Since 1.47.0. The encrypted
// API key (secrets.json) is never copied.

export type BackedUpFile = 'player' | 'settings'

const FILES: Record<BackedUpFile, { name: string; valid: (data: unknown) => boolean }> = {
  player: {
    name: 'player.json',
    valid: (d) => typeof d === 'object' && d !== null && (d as { version?: unknown }).version === 1
  },
  settings: {
    name: 'settings.json',
    valid: (d) => typeof d === 'object' && d !== null && !Array.isArray(d)
  }
}

/** Days of daily backups kept, and backups kept from before an import. */
export const KEEP_DAILY = 7
export const KEEP_BEFORE_IMPORT = 3

/** A damaged file found at startup and what was done about it. */
export interface Recovery {
  file: BackedUpFile
  /** When the backup put in its place was made, or null when there was none (it started fresh). */
  restoredFrom: number | null
  /** Where the damaged file was kept. */
  keptAs: string
}

const day = (at: number): string => new Date(at).toISOString().slice(0, 10)
const DAILY = (file: BackedUpFile): RegExp => new RegExp(`^${file}-\\d{4}-\\d{2}-\\d{2}\\.json$`)
const BEFORE_IMPORT = (file: BackedUpFile): RegExp =>
  new RegExp(`^${file}-\\d{4}-\\d{2}-\\d{2}-\\d+-before-import\\.json$`)

export function createBackups(opts: { dir: string; now?: () => number }) {
  const now = opts.now ?? Date.now
  const backupsDir = join(opts.dir, 'backups')

  /** Backups of a file, newest first (by when they were made). */
  async function backupsOf(file: BackedUpFile): Promise<{ path: string; at: number }[]> {
    const names = await readdir(backupsDir).catch(() => [] as string[])
    const found = await Promise.all(
      names
        .filter((n) => DAILY(file).test(n) || BEFORE_IMPORT(file).test(n))
        .map(async (n) => {
          const path = join(backupsDir, n)
          return { path, at: (await stat(path).catch(() => null))?.mtimeMs ?? 0 }
        })
    )
    return found.sort((a, b) => b.at - a.at)
  }

  async function prune(file: BackedUpFile, pattern: RegExp, keep: number): Promise<void> {
    const all = (await backupsOf(file)).filter((b) => pattern.test(b.path.split(/[\\/]/).pop() ?? ''))
    await Promise.all(all.slice(keep).map((b) => rm(b.path, { force: true })))
  }

  /** Copy a file into backups/ under `name`, if it's there and reads as valid. */
  async function copyIfValid(file: BackedUpFile, name: string): Promise<boolean> {
    const source = join(opts.dir, FILES[file].name)
    const read = await readJsonFileChecked(source)
    if (read.state !== 'ok' || !FILES[file].valid(read.data)) return false
    await mkdir(backupsDir, { recursive: true })
    await copyFile(source, join(backupsDir, name))
    return true
  }

  return {
    dir: backupsDir,

    /**
     * Before the files are loaded: each one that's there but damaged is kept aside (as
     * `<name>.damaged-<time>.json`) and the newest valid backup put in its place.
     */
    async recover(): Promise<Recovery[]> {
      const recoveries: Recovery[] = []
      for (const file of Object.keys(FILES) as BackedUpFile[]) {
        const path = join(opts.dir, FILES[file].name)
        const read = await readJsonFileChecked(path)
        if (read.state === 'missing' || (read.state === 'ok' && FILES[file].valid(read.data))) continue
        const keptAs = join(opts.dir, `${file}.damaged-${now()}.json`)
        await rename(path, keptAs)
        let restoredFrom: number | null = null
        for (const backup of await backupsOf(file)) {
          const candidate = await readJsonFileChecked(backup.path)
          if (candidate.state !== 'ok' || !FILES[file].valid(candidate.data)) continue
          await copyFile(backup.path, path)
          restoredFrom = backup.at
          break
        }
        recoveries.push({ file, restoredFrom, keptAs })
      }
      return recoveries
    },

    /** Today's backup of each file, once a day; older ones beyond the newest 7 days go. */
    async daily(): Promise<void> {
      for (const file of Object.keys(FILES) as BackedUpFile[]) {
        const name = `${file}-${day(now())}.json`
        const existing = await stat(join(backupsDir, name)).catch(() => null)
        if (!existing && (await copyIfValid(file, name))) await prune(file, DAILY(file), KEEP_DAILY)
      }
    },

    /** A backup of each file just before an import replaces them. */
    async beforeImport(): Promise<void> {
      for (const file of Object.keys(FILES) as BackedUpFile[]) {
        if (await copyIfValid(file, `${file}-${day(now())}-${now()}-before-import.json`))
          await prune(file, BEFORE_IMPORT(file), KEEP_BEFORE_IMPORT)
      }
    },

    /** When the newest backup of the progress was made, or null when there's none yet. */
    async lastBackupAt(): Promise<number | null> {
      return (await backupsOf('player'))[0]?.at ?? null
    }
  }
}

export type Backups = ReturnType<typeof createBackups>
