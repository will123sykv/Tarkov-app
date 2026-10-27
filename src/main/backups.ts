import { copyFile, mkdir, readdir, rename, rm, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { readJsonFileChecked } from './jsonFile'

// The player's progress (player.json: quests, hideout, keys, loyalty, objectives, pins, favourites) and
// settings, copied into backups/ each day, week and month (the newest 7 days, 4 weeks and 6 months
// kept, since 1.66.0) and just before an import, a rescan of the logs or a restore replaces them, and
// put back from there when a file turns out damaged, instead of starting empty and saving over it.
// Since 1.47.0. The encrypted API key (secrets.json) is never copied.

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

/** Backups kept of each kind (since 1.66.0 weekly and monthly ones too, and before a rescan or restore). */
export const KEEP_DAILY = 7
export const KEEP_WEEKLY = 4
export const KEEP_MONTHLY = 6
export const KEEP_BEFORE = 3
/** @deprecated The same as KEEP_BEFORE. */
export const KEEP_BEFORE_IMPORT = KEEP_BEFORE

/** A damaged file found at startup and what was done about it. */
export interface Recovery {
  file: BackedUpFile
  /** When the backup put in its place was made, or null when there was none (it started fresh). */
  restoredFrom: number | null
  /** Where the damaged file was kept. */
  keptAs: string
}

/** What a backup was made for: on a schedule, or just before something replaced the files. */
export type BackupKind = 'daily' | 'weekly' | 'monthly' | 'before-import' | 'before-rescan' | 'before-restore'
export type BeforeReason = 'import' | 'rescan' | 'restore'

/** A backup of the progress that can be put back (with the settings backed up with it, if any). */
export interface BackupEntry {
  name: string
  kind: BackupKind
  at: number
}

const day = (at: number): string => new Date(at).toISOString().slice(0, 10)
/** The Monday of the week (UTC) a time falls in. */
const monday = (at: number): string => {
  const d = new Date(at)
  return day(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
}
const month = (at: number): string => new Date(at).toISOString().slice(0, 7)

const PATTERNS: Record<BackupKind, (file: BackedUpFile) => RegExp> = {
  daily: (f) => new RegExp(`^${f}-\\d{4}-\\d{2}-\\d{2}\\.json$`),
  weekly: (f) => new RegExp(`^${f}-weekly-\\d{4}-\\d{2}-\\d{2}\\.json$`),
  monthly: (f) => new RegExp(`^${f}-monthly-\\d{4}-\\d{2}\\.json$`),
  'before-import': (f) => new RegExp(`^${f}-\\d{4}-\\d{2}-\\d{2}-\\d+-before-import\\.json$`),
  'before-rescan': (f) => new RegExp(`^${f}-\\d{4}-\\d{2}-\\d{2}-\\d+-before-rescan\\.json$`),
  'before-restore': (f) => new RegExp(`^${f}-\\d{4}-\\d{2}-\\d{2}-\\d+-before-restore\\.json$`)
}
const KEEP: Record<BackupKind, number> = {
  daily: KEEP_DAILY,
  weekly: KEEP_WEEKLY,
  monthly: KEEP_MONTHLY,
  'before-import': KEEP_BEFORE,
  'before-rescan': KEEP_BEFORE,
  'before-restore': KEEP_BEFORE
}
const KINDS = Object.keys(PATTERNS) as BackupKind[]
const kindOf = (file: BackedUpFile, name: string): BackupKind | null =>
  KINDS.find((k) => PATTERNS[k](file).test(name)) ?? null

/** The scheduled backups' names for a moment. */
const SCHEDULED: Record<'daily' | 'weekly' | 'monthly', (file: BackedUpFile, at: number) => string> = {
  daily: (f, at) => `${f}-${day(at)}.json`,
  weekly: (f, at) => `${f}-weekly-${monday(at)}.json`,
  monthly: (f, at) => `${f}-monthly-${month(at)}.json`
}

export function createBackups(opts: { dir: string; now?: () => number }) {
  const now = opts.now ?? Date.now
  const backupsDir = join(opts.dir, 'backups')

  /** Backups of a file (of every kind, or one), newest first (by when they were made). */
  async function backupsOf(
    file: BackedUpFile,
    kind?: BackupKind
  ): Promise<{ path: string; name: string; kind: BackupKind; at: number }[]> {
    const names = await readdir(backupsDir).catch(() => [] as string[])
    const found = await Promise.all(
      names.flatMap((name) => {
        const k = kindOf(file, name)
        if (!k || (kind && k !== kind)) return []
        const path = join(backupsDir, name)
        return [
          stat(path).then(
            (s) => ({ path, name, kind: k, at: s.mtimeMs }),
            () => ({ path, name, kind: k, at: 0 })
          )
        ]
      })
    )
    return found.sort((a, b) => b.at - a.at)
  }

  async function prune(file: BackedUpFile, kind: BackupKind): Promise<void> {
    const all = await backupsOf(file, kind)
    await Promise.all(all.slice(KEEP[kind]).map((b) => rm(b.path, { force: true })))
  }

  /** Copy a file into backups/ under `name`, if it's there and reads as valid. */
  async function copyIfValid(file: BackedUpFile, name: string): Promise<boolean> {
    const source = join(opts.dir, FILES[file].name)
    const read = await readJsonFileChecked(source)
    if (read.state !== 'ok' || !FILES[file].valid(read.data)) return false
    await mkdir(backupsDir, { recursive: true })
    const target = join(backupsDir, name)
    await copyFile(source, target)
    // Dated now (a copy can keep the original's time), so "last backup" and the order are right.
    const at = new Date(now())
    await utimes(target, at, at).catch(() => {})
    return true
  }

  /** The scheduled backups that are due (today's, this week's, this month's), each kind pruned. */
  async function scheduled(): Promise<void> {
    for (const file of Object.keys(FILES) as BackedUpFile[])
      for (const kind of ['daily', 'weekly', 'monthly'] as const) {
        const name = SCHEDULED[kind](file, now())
        const existing = await stat(join(backupsDir, name)).catch(() => null)
        if (!existing && (await copyIfValid(file, name))) await prune(file, kind)
      }
  }

  /** A backup of each file just before something replaces them. */
  async function before(reason: BeforeReason): Promise<void> {
    for (const file of Object.keys(FILES) as BackedUpFile[]) {
      if (await copyIfValid(file, `${file}-${day(now())}-${now()}-before-${reason}.json`))
        await prune(file, `before-${reason}`)
    }
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
        // Kept aside by copying when it can't be moved (another program holding it): never lost.
        await rename(path, keptAs).catch(() => copyFile(path, keptAs))
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

    scheduled,
    /** Today's (and this week's and month's) backups: the same as `scheduled`. */
    daily: scheduled,
    before,
    /** A backup of each file just before an import replaces them. */
    beforeImport: () => before('import'),

    /** When the newest backup of the progress was made, or null when there's none yet. */
    async lastBackupAt(): Promise<number | null> {
      return (await backupsOf('player'))[0]?.at ?? null
    },

    /** The progress backups there are, newest first. */
    async list(): Promise<BackupEntry[]> {
      return (await backupsOf('player')).map(({ name, kind, at }) => ({ name, kind, at }))
    },

    /**
     * Read a progress backup (and the settings backed up with it) to put back: only a backup's own
     * name, and only one that reads as valid. Null when it can't be.
     */
    async read(name: string): Promise<{ player: unknown; settings: unknown | null } | null> {
      if (typeof name !== 'string' || !kindOf('player', name)) return null
      const read = await readJsonFileChecked(join(backupsDir, name))
      if (read.state !== 'ok' || !FILES.player.valid(read.data)) return null
      const settingsName = `settings${name.slice('player'.length)}`
      const settings = await readJsonFileChecked(join(backupsDir, settingsName))
      return {
        player: read.data,
        settings: settings.state === 'ok' && FILES.settings.valid(settings.data) ? settings.data : null
      }
    }
  }
}

export type Backups = ReturnType<typeof createBackups>
