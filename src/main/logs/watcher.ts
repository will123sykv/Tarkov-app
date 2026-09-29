import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { LogWatcherStatus } from '../../shared/logTypes'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { INITIAL_STATE, interpretEntries, type InterpreterState, type LogEvent } from './interpret'
import { listLogFolders } from './locate'
import { parseLogText, type LogEntry } from './parseLog'

/** The log files with events worth reading; the game may rotate them (`application_000.log`). */
const WATCHED_FILE = /(application|notifications)(_\d+)?\.log$/i

interface SavedState {
  version: 1
  logsDir: string | null
  /** Bytes read so far, per `folder/file`. */
  offsets: Record<string, number>
  /** Interpreter state at the end of what was read, per folder. */
  folders: Record<string, InterpreterState>
  /** Folders read to the end after a newer session started; never read again. */
  done: string[]
  lastEventAt: number | null
  events: LogWatcherStatus['events']
}

const EMPTY: SavedState = {
  version: 1,
  logsDir: null,
  offsets: {},
  folders: {},
  done: [],
  lastEventAt: null,
  events: { quests: 0, flea: 0, raids: 0 }
}

export interface LogWatcherDeps {
  stateFile: string
  /** The Logs folder to read, or null when it can't be found. */
  locate: () => Promise<string | null>
  /** New events, oldest first. `reset` is true after a rescan cleared everything read before. */
  onEvents: (events: LogEvent[], reset: boolean) => void | Promise<void>
  onStatus?: (status: LogWatcherStatus) => void
  now?: () => number
  intervalMs?: number
}

async function readRange(path: string, from: number, to: number): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(to - from)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, from)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Reads the game's logs: on the first run every session folder the game kept (oldest first), then
 * every few seconds whatever was added to the newest one. What was read is remembered, so events
 * are never reported twice, including across restarts.
 */
export function createLogWatcher(deps: LogWatcherDeps) {
  const now = deps.now ?? Date.now
  let saved: SavedState | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null
  let stopped = true
  /** File sizes at the previous poll: a file that stopped growing is read to its end. */
  const lastSize = new Map<string, number>()
  let status: LogWatcherStatus = {
    state: 'idle',
    logsDir: null,
    folders: 0,
    foldersRead: 0,
    lastEventAt: null,
    lastReadAt: null,
    events: { ...EMPTY.events },
    error: null
  }

  function setStatus(patch: Partial<LogWatcherStatus>): void {
    status = { ...status, ...patch }
    deps.onStatus?.(status)
  }

  async function load(): Promise<SavedState> {
    if (saved) return saved
    const raw = (await readJsonFile(deps.stateFile)) as Partial<SavedState> | undefined
    saved = raw?.version === 1 ? { ...EMPTY, ...raw } : { ...EMPTY, offsets: {}, folders: {}, done: [] }
    return saved
  }

  async function readFolder(logsDir: string, folder: string, finished: boolean): Promise<LogEvent[]> {
    const state = saved!
    const dir = join(logsDir, folder)
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => WATCHED_FILE.test(f)).sort()
    // Each growing file holds back its last entry. Events from different files are only interpreted
    // up to the earliest held-back entry, so they're always taken in time order (a raid's end in
    // notifications.log never before its start in application.log).
    const reads: { key: string; offset: number; text: string; parsed: ReturnType<typeof parseLogText> }[] = []
    let cutoff = Infinity
    for (const file of files) {
      const key = `${folder}/${file}`
      const path = join(dir, file)
      const size = (await stat(path).catch(() => null))?.size ?? 0
      let offset = state.offsets[key] ?? 0
      if (size < offset) offset = 0 // Replaced or truncated.
      if (size === offset) {
        lastSize.set(key, size)
        continue
      }
      const settled = finished || lastSize.get(key) === size
      lastSize.set(key, size)
      const text = (await readRange(path, offset, size)).toString('utf8')
      const parsed = parseLogText(text, settled)
      const held =
        parsed.consumed < text.length ? parseLogText(text.slice(parsed.consumed)).entries[0] : undefined
      if (held) cutoff = Math.min(cutoff, held.t)
      reads.push({ key, offset, text, parsed })
    }
    const entries: LogEntry[] = []
    for (const { key, offset, text, parsed } of reads) {
      const stop = parsed.entries.findIndex((e) => e.t >= cutoff)
      const taken = stop === -1 ? parsed.entries : parsed.entries.slice(0, stop)
      const consumed = stop === -1 ? parsed.consumed : parsed.starts[stop]
      entries.push(...taken)
      state.offsets[key] = offset + Buffer.byteLength(text.slice(0, consumed), 'utf8')
    }
    if (!entries.length) return []
    entries.sort((a, b) => a.t - b.t)
    const { events, state: next } = interpretEntries(entries, state.folders[folder] ?? INITIAL_STATE)
    state.folders[folder] = next
    return events
  }

  async function poll(reset = false): Promise<void> {
    const state = await load()
    const logsDir = await deps.locate()
    if (!logsDir) {
      setStatus({ state: 'not-found', logsDir: null, error: null })
      return
    }
    if (reset || state.logsDir !== logsDir) {
      saved = { ...EMPTY, logsDir, offsets: {}, folders: {}, done: [], events: { ...EMPTY.events } }
      lastSize.clear()
      reset = true
    }
    const current = saved!
    const folders = await listLogFolders(logsDir)
    const done = new Set(current.done)
    const pending = folders.filter((f) => !done.has(f))
    const firstRun = pending.length > 1
    setStatus({
      state: firstRun ? 'scanning' : 'watching',
      logsDir,
      folders: folders.length,
      foldersRead: folders.length - pending.length,
      error: null
    })
    let resetSent = false
    for (const folder of pending) {
      const newest = folder === folders.at(-1)
      const events = await readFolder(logsDir, folder, !newest)
      if (!newest) {
        done.add(folder)
        delete current.folders[folder]
      }
      if (events.length || (reset && !resetSent)) {
        for (const e of events) {
          if (e.kind === 'quest') current.events.quests++
          else if (e.kind === 'raid') current.events.raids++
          else current.events.flea++
          const t = e.kind === 'raid' ? (e.raid.endedAt ?? e.raid.foundAt) : e.t
          current.lastEventAt = Math.max(current.lastEventAt ?? 0, t)
        }
        await deps.onEvents(events, reset && !resetSent)
        resetSent = true
      }
      if (firstRun) setStatus({ foldersRead: done.size, events: { ...current.events } })
    }
    if (reset && !resetSent) await deps.onEvents([], true)
    current.done = folders.filter((f) => done.has(f))
    // Forget offsets of folders the game has since deleted.
    const live = new Set(folders)
    for (const key of Object.keys(current.offsets))
      if (!live.has(key.split('/')[0])) delete current.offsets[key]
    await writeJsonFileAtomic(deps.stateFile, current)
    setStatus({
      state: 'watching',
      foldersRead: folders.length,
      lastEventAt: current.lastEventAt,
      lastReadAt: now(),
      events: { ...current.events }
    })
  }

  function run(reset = false): Promise<void> {
    if (running) return running.then(() => run(reset))
    running = poll(reset)
      .catch((err) => setStatus({ state: 'error', error: err instanceof Error ? err.message : String(err) }))
      .finally(() => {
        running = null
      })
    return running
  }

  function schedule(): void {
    if (stopped) return
    timer = setTimeout(() => {
      void run().finally(schedule)
    }, deps.intervalMs ?? 5000)
  }

  return {
    start(): void {
      if (!stopped) return
      stopped = false
      void run().finally(schedule)
    },
    stop(): void {
      stopped = true
      if (timer) clearTimeout(timer)
    },
    /** Read now (e.g. after the Logs folder setting changed). */
    poll: () => run(),
    /** Forget everything read and read every folder again. */
    rescan: () => run(true),
    status: () => status
  }
}

export type LogWatcher = ReturnType<typeof createLogWatcher>
