import { mkdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { INITIAL_STATE, interpretEntries, sessionMode, type LogEvent } from '../src/main/logs/interpret'
import {
  listLogFolders,
  locateLogsDir,
  parseRegQuery,
  steamLibraries,
  type LocateDeps
} from '../src/main/logs/locate'
import { parseLogText } from '../src/main/logs/parseLog'
import { createLogWatcher } from '../src/main/logs/watcher'
import { tempDir } from './helpers'

const V = '1.0.1.0.41234'
const line = (time: string, category: string, message: string): string =>
  `2026-09-20 ${time}.123 +01:00|${V}|Info|${category}|${message}`

const questStarted = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const questDone = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const PMC = '6600000000000000000000aa'

function notification(time: string, body: object): string {
  return `${line(time, 'push-notifications', 'Got notification | ChatMessageReceived')}\n${JSON.stringify(body, null, 2)}`
}

const chat = (type: number, templateId: string, extra: object = {}) => ({
  type: 'new_message',
  eventId: 'e',
  message: { _id: 'm', type, templateId, dt: 1, ...extra }
})

const APPLICATION = [
  line('18:00:00', 'application', 'Session mode: Pve'),
  line('18:00:01', 'application', `SelectProfile ProfileId:${PMC} AccountId:1234567`),
  line('18:05:00', 'application', 'MatchingCompleted:4.2 real:95,5'),
  line(
    '18:05:01',
    'application',
    `TRACE-NetworkGameCreate profileStatus: 'Profileid: ${PMC}, Status: Busy, RaidMode: Online, Ip: 1.2.3.4, Port: 17000, Location: bigmap, Sid: x, GameMode: deathmatch, shortId: ABC123'`
  ),
  line('18:05:40', 'application', 'LocationLoaded:12.1 real:38.25'),
  line('18:06:00', 'application', 'GameStarted:1.0 real:1.0'),
  line('18:40:00', 'application', 'Something unrelated')
].join('\n')

const NOTIFICATIONS = [
  notification('18:02:00', chat(10, `${questStarted} description 5935c25fb3acc3127c3d8cd9 0`)),
  notification('18:03:00', chat(12, `${questDone} successMessageText 5935c25fb3acc3127c3d8cd9 0`)),
  notification(
    '18:04:00',
    chat(4, '5bdabfb886f7743e152e867e 0', {
      systemData: { buyerNickname: 'Buyer', soldItem: '5c0e531286f7747fa54205c2', itemCount: 2 },
      items: {
        stash: 's',
        data: [{ _id: 'r', _tpl: '5449016a4bdc2d6f028b456f', upd: { StackObjectsCount: 90000 } }]
      }
    })
  ),
  notification('18:04:30', chat(10, 'daily_task description 5935c25fb3acc3127c3d8cd9 0')),
  `${line('18:41:00', 'push-notifications', 'Got notification | UserMatchOver')}\n{\n  "location": "bigmap",\n  "shortId": "ABC123"\n}`
].join('\n')

describe('parseLogText', () => {
  it('splits entries and parses the JSON block under a notification', () => {
    const { entries, consumed } = parseLogText(NOTIFICATIONS)
    expect(entries).toHaveLength(5)
    expect(entries[0]).toMatchObject({
      t: Date.parse('2026-09-20T18:02:00.123+01:00'),
      message: `${V}|Info|push-notifications|Got notification | ChatMessageReceived`,
      json: { message: { type: 10 } }
    })
    expect(consumed).toBe(NOTIFICATIONS.length)
  })

  it('holds back the last entry of a file that may still be growing', () => {
    const text = `${APPLICATION}\n${line('18:50:00', 'application', 'half writ')}`
    const partial = parseLogText(text, false)
    expect(partial.entries).toHaveLength(7)
    expect(text.slice(partial.consumed)).toBe(line('18:50:00', 'application', 'half writ'))
    expect(parseLogText('no header yet', false)).toEqual({ entries: [], consumed: 0, starts: [] })
  })

  it('handles Windows line endings, times without an offset and broken JSON', () => {
    const text = '2026-09-20 10:00:00.000|v|Info|push|Got notification | ChatMessageReceived\r\n{ broken\r\n'
    const [entry] = parseLogText(text).entries
    expect(entry.t).toBe(new Date('2026-09-20T10:00:00.000').getTime())
    expect(entry.json).toBeNull()
  })
})

describe('interpretEntries', () => {
  const entries = [...parseLogText(APPLICATION).entries, ...parseLogText(NOTIFICATIONS).entries].sort(
    (a, b) => a.t - b.t
  )
  const { events, state } = interpretEntries(entries)

  it('reads quest starts and completions in the session’s game mode, skipping unknown ids', () => {
    expect(events.filter((e) => e.kind === 'quest')).toEqual([
      {
        kind: 'quest',
        t: Date.parse('2026-09-20T18:02:00.123+01:00'),
        mode: 'pve',
        questId: questStarted,
        status: 'started'
      },
      {
        kind: 'quest',
        t: Date.parse('2026-09-20T18:03:00.123+01:00'),
        mode: 'pve',
        questId: questDone,
        status: 'completed'
      }
    ])
  })

  it('reads flea sales with the buyer and the money received', () => {
    expect(events.find((e) => e.kind === 'fleaSold')).toMatchObject({
      mode: 'pve',
      itemId: '5c0e531286f7747fa54205c2',
      count: 2,
      buyer: 'Buyer',
      payment: { currency: 'RUB', amount: 90_000 }
    })
  })

  it('follows a raid from queue to end', () => {
    const raid = events.find((e): e is Extract<LogEvent, { kind: 'raid' }> => e.kind === 'raid')
    expect(raid?.raid).toEqual({
      map: 'bigmap',
      raidId: 'ABC123',
      side: 'pmc',
      online: true,
      queueSeconds: 95.5,
      loadSeconds: 38.25,
      foundAt: Date.parse('2026-09-20T18:05:01.123+01:00'),
      startedAt: Date.parse('2026-09-20T18:06:00.123+01:00'),
      endedAt: Date.parse('2026-09-20T18:41:00.123+01:00')
    })
    expect(state).toMatchObject({ mode: 'pve', pmcProfileId: PMC, raid: null })
  })

  it('carries state across batches and marks other profiles as scav raids', () => {
    const first = interpretEntries(parseLogText(APPLICATION.split('\n').slice(0, 2).join('\n')).entries)
    const scavRaid = [
      line(
        '19:00:00',
        'application',
        "TRACE-NetworkGameCreate profileStatus: 'Profileid: 77aa, Status: Busy, Location: Woods, shortId: XYZ789'"
      ),
      line('19:30:00', 'push-notifications', 'Got notification | UserMatchOver')
    ].join('\n')
    const second = interpretEntries(parseLogText(scavRaid).entries, first.state)
    expect(second.events).toMatchObject([
      { kind: 'raid', mode: 'pve', raid: { map: 'Woods', side: 'scav', online: false } }
    ])
  })

  it('drops a match that was abandoned before it started', () => {
    const text = [
      line(
        '19:00:00',
        'application',
        "TRACE-NetworkGameCreate profileStatus: 'Location: Woods, shortId: XYZ789'"
      ),
      line('19:00:30', 'application', 'Network game matching aborted')
    ].join('\n')
    expect(interpretEntries(parseLogText(text).entries, INITIAL_STATE)).toMatchObject({
      events: [],
      state: { raid: null }
    })
  })

  it('maps session modes', () => {
    expect([
      sessionMode('Pve'),
      sessionMode('Regular'),
      sessionMode('PvpSeason'),
      sessionMode('Arena')
    ]).toEqual(['pve', 'pvp', 'season', null])
  })
})

describe('locating the logs', () => {
  const deps = (
    registry: Record<string, string>,
    dirs: string[],
    files: Record<string, string> = {}
  ): LocateDeps => ({
    readRegistry: async (key, value) => registry[`${key}|${value}`] ?? null,
    isDir: async (path) => dirs.includes(path),
    readText: async (path) => files[path] ?? null
  })
  const uninstall =
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\EscapeFromTarkov'

  it('reads reg query output', () => {
    const out = `\r\n${uninstall}\r\n    InstallLocation    REG_SZ    D:\\Games\\EFT\r\n\r\n`
    expect(parseRegQuery(out, 'InstallLocation')).toBe('D:\\Games\\EFT')
    expect(parseRegQuery(out, 'Other')).toBeNull()
  })

  it('finds Logs under the launcher install, then under a Steam library', async () => {
    expect(
      await locateLogsDir(null, deps({ [`${uninstall}|InstallLocation`]: '/eft' }, [join('/eft', 'Logs')]))
    ).toBe(join('/eft', 'Logs'))
    const steam = deps(
      { 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam|InstallPath': '/steam' },
      [join('/lib2', 'steamapps', 'common', 'Escape from Tarkov', 'build', 'Logs')],
      {
        [join('/steam', 'steamapps', 'libraryfolders.vdf')]: '"0" { "path" "/steam" }\n"1" { "path" "/lib2" }'
      }
    )
    expect(await locateLogsDir(null, steam)).toBe(
      join('/lib2', 'steamapps', 'common', 'Escape from Tarkov', 'build', 'Logs')
    )
    expect(steamLibraries('"path"\t\t"D:\\\\SteamLibrary"')).toEqual(['D:\\SteamLibrary'])
  })

  it('prefers the folder chosen in Settings, and reports none when nothing exists', async () => {
    expect(await locateLogsDir('/mine', deps({}, ['/mine', join('/eft', 'Logs')]))).toBe('/mine')
    expect(await locateLogsDir('/gone', deps({}, []))).toBeNull()
    expect(await locateLogsDir(null, deps({}, []))).toBeNull()
  })

  it('lists session folders oldest first', async () => {
    const dir = await tempDir()
    for (const name of [
      'log_2026.09.20_9-05-00_1.0',
      'log_2026.09.20_18-00-00_1.0',
      'log_2026.01.02_10-00-00_1.0',
      'other'
    ])
      await mkdir(join(dir, name))
    expect(await listLogFolders(dir)).toEqual([
      'log_2026.01.02_10-00-00_1.0',
      'log_2026.09.20_9-05-00_1.0',
      'log_2026.09.20_18-00-00_1.0'
    ])
  })
})

describe('createLogWatcher', () => {
  async function setup() {
    const root = await tempDir()
    const logs = join(root, 'Logs')
    const old = join(logs, 'log_2026.09.19_10-00-00_1.0')
    const current = join(logs, 'log_2026.09.20_18-00-00_1.0')
    await mkdir(old, { recursive: true })
    await mkdir(current, { recursive: true })
    await writeFile(
      join(old, '2026.09.19_10-00-00_1.0 application.log'),
      line('10:00:00', 'application', 'Session mode: Regular')
    )
    await writeFile(
      join(old, '2026.09.19_10-00-00_1.0 notifications.log'),
      notification('10:05:00', chat(12, `${questDone} successMessageText t 0`))
    )
    await writeFile(join(current, '2026.09.20_18-00-00_1.0 application.log'), `${APPLICATION}\n`)
    await writeFile(join(current, '2026.09.20_18-00-00_1.0 notifications.log'), `${NOTIFICATIONS}\n`)
    await writeFile(join(current, '2026.09.20_18-00-00_1.0 traces.log'), line('18:00:00', 'x', 'ignored'))
    const batches: { events: LogEvent[]; reset: boolean }[] = []
    let dir: string | null = logs
    const watcher = createLogWatcher({
      stateFile: join(root, 'state.json'),
      locate: async () => dir,
      onEvents: (events, reset) => void batches.push({ events, reset })
    })
    return { root, logs, current, watcher, batches, setDir: (d: string | null) => (dir = d) }
  }
  const kinds = (events: LogEvent[]) =>
    events.map((e) =>
      e.kind === 'quest' ? `${e.mode}:${e.status}` : e.kind === 'raid' ? `raid:${e.raid.map}` : e.kind
    )

  it('reads every session folder on the first run, in order, each in its own game mode', async () => {
    const { watcher, batches } = await setup()
    await watcher.poll()
    expect(batches.map((b) => kinds(b.events))).toEqual([
      ['pvp:completed'],
      ['pve:started', 'pve:completed', 'fleaSold']
    ])
    expect(batches[0].reset).toBe(true)
    // The newest file may still be growing: its last entry (UserMatchOver) waits for the next poll.
    await watcher.poll()
    expect(kinds(batches[2].events)).toEqual(['raid:bigmap'])
    expect(watcher.status()).toMatchObject({
      state: 'watching',
      folders: 2,
      foldersRead: 2,
      events: { quests: 3, flea: 1, raids: 1 }
    })
  })

  it('takes events from both files in time order while they are still being written', async () => {
    const { current, watcher, batches } = await setup()
    // The raid's start is the last line of application.log, held back while the file may grow;
    // its end, later on, is already in notifications.log.
    await writeFile(
      join(current, '2026.09.20_18-00-00_1.0 application.log'),
      `${APPLICATION.split('\n').slice(0, 6).join('\n')}\n`
    )
    await appendFile(
      join(current, '2026.09.20_18-00-00_1.0 notifications.log'),
      `${notification('18:50:00', chat(10, `${questStarted} description t 0`))}\n`
    )
    await watcher.poll()
    expect(batches.flatMap((b) => kinds(b.events))).not.toContain('raid:bigmap')
    await watcher.poll()
    const raid = batches.flatMap((b) => b.events).find((e) => e.kind === 'raid')
    expect(raid?.kind === 'raid' && raid.raid.startedAt).toBe(Date.parse('2026-09-20T18:06:00.123+01:00'))
  })

  it('only reads what was added, and remembers where it was across restarts', async () => {
    const { root, current, watcher, batches } = await setup()
    await watcher.poll()
    await watcher.poll()
    const count = batches.length
    await watcher.poll()
    expect(batches).toHaveLength(count)
    await appendFile(
      join(current, '2026.09.20_18-00-00_1.0 notifications.log'),
      `${notification('18:50:00', chat(11, `${questStarted} failMessageText t 0`))}\n`
    )
    const restarted = createLogWatcher({
      stateFile: join(root, 'state.json'),
      locate: async () => join(root, 'Logs'),
      onEvents: (events, reset) => void batches.push({ events, reset })
    })
    await restarted.poll()
    await restarted.poll()
    expect(batches.slice(count).flatMap((b) => kinds(b.events))).toEqual(['pve:failed'])
    expect(JSON.parse(await readFile(join(root, 'state.json'), 'utf8')).done).toEqual([
      'log_2026.09.19_10-00-00_1.0'
    ])
  })

  it('rescans from scratch and reports a missing folder', async () => {
    const { watcher, batches, setDir } = await setup()
    await watcher.poll()
    await watcher.poll()
    batches.length = 0
    await watcher.rescan()
    expect(batches[0].reset).toBe(true)
    expect(batches.flatMap((b) => kinds(b.events))).toContain('pvp:completed')
    setDir(null)
    await watcher.poll()
    expect(watcher.status().state).toBe('not-found')
  })

  it('starts over when the Logs folder changes, and tells the stores to clear', async () => {
    const { root, watcher, batches, setDir } = await setup()
    await watcher.poll()
    const empty = join(root, 'Empty')
    await mkdir(empty)
    setDir(empty)
    batches.length = 0
    await watcher.poll()
    expect(batches).toEqual([{ events: [], reset: true }])
    await rm(empty, { recursive: true })
  })

  it('polls on a timer once started', async () => {
    vi.useFakeTimers()
    try {
      const { watcher, batches } = await setup()
      watcher.start()
      await vi.waitFor(() => expect(batches.length).toBeGreaterThan(0))
      watcher.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
