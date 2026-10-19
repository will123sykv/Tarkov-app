import { readdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBackups, KEEP_DAILY } from '../src/main/backups'
import { createPlayerStore } from '../src/main/quests/playerStore'
import { PROGRESS_APP, progressFile, readProgressFile } from '../src/main/progressFile'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { tempDir } from './helpers'

const DAY = 86_400_000
const START = Date.UTC(2026, 9, 1, 12)

const player = (marker: string): unknown => ({
  version: 1,
  progress: { pvp: { [marker]: { status: 'completed' } } }
})

/** Backups made in a test all have this moment's time: give each its day's, as if made then. */
async function datedByName(dir: string): Promise<void> {
  for (const n of await backupNames(dir)) {
    const day = Date.parse(n.match(/\d{4}-\d\d-\d\d/)![0])
    await utimes(join(dir, 'backups', n), new Date(day), new Date(day))
  }
}

async function backupNames(dir: string): Promise<string[]> {
  return (await readdir(join(dir, 'backups')).catch(() => [])).sort()
}

describe('daily backups', () => {
  it('copies the progress and settings once a day, keeping the newest 7 days', async () => {
    const dir = await tempDir()
    let now = START
    const backups = createBackups({ dir, now: () => now })
    await writeFile(join(dir, 'player.json'), JSON.stringify(player('a')))
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ gameMode: 'pvp' }))
    await writeFile(join(dir, 'secrets.json'), JSON.stringify({ key: 'secret' }))

    await backups.daily()
    await backups.daily()
    expect(await backupNames(dir)).toEqual(['player-2026-10-01.json', 'settings-2026-10-01.json'])

    for (let i = 1; i <= 9; i++) {
      now = START + i * DAY
      await backups.daily()
      await datedByName(dir)
    }
    const names = await backupNames(dir)
    expect(names.filter((n) => n.startsWith('player-'))).toHaveLength(KEEP_DAILY)
    expect(names).toContain('player-2026-10-10.json')
    expect(names).not.toContain('player-2026-10-01.json')
    expect(names.some((n) => n.startsWith('secrets'))).toBe(false)
    expect(await backups.lastBackupAt()).toBe(Date.parse('2026-10-10'))
  })

  it('doesn’t back up a damaged file', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'player.json'), '{"version":1, "progr')
    await createBackups({ dir, now: () => START }).daily()
    expect(await backupNames(dir)).toEqual([])
  })
})

describe('putting back a damaged file', () => {
  it('keeps the damaged file and restores the newest good backup', async () => {
    const dir = await tempDir()
    let now = START
    const backups = createBackups({ dir, now: () => now })
    await writeFile(join(dir, 'player.json'), JSON.stringify(player('old')))
    await backups.daily()
    await utimes(join(dir, 'backups', 'player-2026-10-01.json'), new Date(), new Date(START))
    now += DAY
    await writeFile(join(dir, 'player.json'), JSON.stringify(player('newer')))
    await backups.daily()
    await utimes(join(dir, 'backups', 'player-2026-10-02.json'), new Date(), new Date(START + DAY))
    // A newer backup that's itself damaged is passed over.
    await writeFile(join(dir, 'backups', 'player-2026-10-03.json'), 'not json')

    await writeFile(join(dir, 'player.json'), '\u0000\u0000\u0000')
    now += DAY
    const recoveries = await backups.recover()
    expect(recoveries).toHaveLength(1)
    expect(recoveries[0]).toMatchObject({ file: 'player', restoredFrom: START + DAY })
    expect(JSON.parse(await readFile(join(dir, 'player.json'), 'utf8'))).toEqual(player('newer'))
    expect(await readFile(recoveries[0].keptAs, 'utf8')).toBe('\u0000\u0000\u0000')

    // The progress store reads the restored file.
    expect(await createPlayerStore({ file: join(dir, 'player.json') }).progress('pvp')).toEqual({
      newer: { status: 'completed' }
    })
  })

  it('treats saved data of an unknown version as damaged', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'player.json'), JSON.stringify({ version: 7 }))
    const [recovery] = await createBackups({ dir, now: () => START }).recover()
    expect(recovery).toMatchObject({ file: 'player', restoredFrom: null })
  })

  it('without a backup, keeps the damaged file aside and starts fresh rather than saving over it', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'player.json'), '{"version":1,')
    const [recovery] = await createBackups({ dir, now: () => START }).recover()
    expect(recovery).toEqual({ file: 'player', restoredFrom: null, keptAs: recovery.keptAs })
    expect(await readFile(recovery.keptAs, 'utf8')).toBe('{"version":1,')
    expect(await readdir(dir)).not.toContain('player.json')
  })

  it('leaves missing and good files alone', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'player.json'), JSON.stringify(player('a')))
    expect(await createBackups({ dir, now: () => START }).recover()).toEqual([])
    expect(JSON.parse(await readFile(join(dir, 'player.json'), 'utf8'))).toEqual(player('a'))
  })
})

describe('exporting and importing progress', () => {
  it('round-trips everything the progress store keeps', async () => {
    const dir = await tempDir()
    const from = createPlayerStore({ file: join(dir, 'a.json') })
    await from.setStatus('pvp', '5936d90786f7742b1420ba5b', 'completed')
    await from.setKey('pve', '5780cf7f2459777de4559322', 'owned', true)
    await from.setTraderLevel('pvp', '54cb50c76803fa8b248b4571', 3)
    const file = JSON.parse(
      JSON.stringify(progressFile(await from.saved(), DEFAULT_SETTINGS, '1.47.0', START))
    )

    const imported = readProgressFile(file)
    const to = createPlayerStore({ file: join(dir, 'b.json') })
    await to.replace(imported.player)
    expect(await to.saved()).toEqual(await from.saved())
    expect(await createPlayerStore({ file: join(dir, 'b.json') }).keys('pve')).toEqual({
      owned: ['5780cf7f2459777de4559322'],
      toDo: []
    })
  })

  it('keeps this PC’s game logs folder and tray settings', () => {
    const file = progressFile(
      { version: 1 },
      { ...DEFAULT_SETTINGS, gameLogsDir: 'D:\\\\Games\\\\Logs', backgroundRecording: true, gameMode: 'pve' },
      '1.47.0',
      START
    )
    const { settings } = readProgressFile(file)
    expect(settings).not.toHaveProperty('gameLogsDir')
    expect(settings).not.toHaveProperty('backgroundRecording')
    expect(settings).not.toHaveProperty('startWithWindows')
    expect(settings.gameMode).toBe('pve')
  })

  it('refuses files that aren’t this app’s progress', () => {
    expect(() => readProgressFile({ hello: 1 })).toThrow(/isn’t a progress file/)
    expect(() => readProgressFile(null)).toThrow(/isn’t a progress file/)
    expect(() => readProgressFile({ app: PROGRESS_APP, format: 2, player: { version: 1 } })).toThrow(
      /newer version/
    )
    expect(() => readProgressFile({ app: PROGRESS_APP, format: 1, player: { version: 3 } })).toThrow(
      /damaged/
    )
  })
})
