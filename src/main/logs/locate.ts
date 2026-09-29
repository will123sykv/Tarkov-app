import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const STEAM_APP_ID = '3932890'
const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\EscapeFromTarkov',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\EscapeFromTarkov',
  `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ${STEAM_APP_ID}`,
  `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ${STEAM_APP_ID}`
]
const STEAM_KEYS = ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'HKCU\\SOFTWARE\\Valve\\Steam']
const DEFAULT_INSTALLS = ['C:\\Battlestate Games\\EFT', 'C:\\Battlestate Games\\Escape from Tarkov']

export const LOG_FOLDER = /^log_(\d{4})\.(\d{2})\.(\d{2})_(\d{1,2})-(\d{2})-(\d{2})/

export interface LocateDeps {
  /** A registry value, or null when the key or value doesn't exist. */
  readRegistry: (key: string, value: string) => Promise<string | null>
  isDir: (path: string) => Promise<boolean>
  readText: (path: string) => Promise<string | null>
}

/** `reg query` output → the value's data. */
export function parseRegQuery(output: string, value: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(.+?)\s+REG_(?:EXPAND_)?SZ\s+(.*)$/.exec(line)
    if (match && match[1].toLowerCase() === value.toLowerCase()) return match[2].trim() || null
  }
  return null
}

/** Library folders listed in Steam's `libraryfolders.vdf`. */
export function steamLibraries(vdf: string): string[] {
  return [...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\'))
}

export const nodeLocateDeps: LocateDeps = {
  readRegistry: (key, value) =>
    process.platform !== 'win32'
      ? Promise.resolve(null)
      : new Promise((resolve) =>
          execFile('reg', ['query', key, '/v', value], { windowsHide: true }, (err, stdout) =>
            resolve(err ? null : parseRegQuery(stdout, value))
          )
        ),
  isDir: (path) =>
    stat(path).then(
      (s) => s.isDirectory(),
      () => false
    ),
  readText: (path) => readFile(path, 'utf8').catch(() => null)
}

/** Places the game may be installed, most likely first. */
export async function installCandidates(deps: LocateDeps): Promise<string[]> {
  const found: string[] = []
  for (const key of UNINSTALL_KEYS) {
    const path = await deps.readRegistry(key, 'InstallLocation')
    if (path) found.push(path)
  }
  for (const key of STEAM_KEYS) {
    const steam = (await deps.readRegistry(key, 'InstallPath')) ?? (await deps.readRegistry(key, 'SteamPath'))
    if (!steam) continue
    const libraries = [
      steam,
      ...steamLibraries((await deps.readText(join(steam, 'steamapps', 'libraryfolders.vdf'))) ?? '')
    ]
    for (const library of libraries) found.push(join(library, 'steamapps', 'common', 'Escape from Tarkov'))
  }
  found.push(...DEFAULT_INSTALLS)
  return [...new Set(found)]
}

/**
 * The game's Logs folder: the one chosen in Settings if set, else the first `Logs` or `build\Logs`
 * folder under a known install location. Null when none exists.
 */
export async function locateLogsDir(
  chosen: string | null,
  deps: LocateDeps = nodeLocateDeps
): Promise<string | null> {
  if (chosen) return (await deps.isDir(chosen)) ? chosen : null
  for (const install of await installCandidates(deps)) {
    for (const logs of [join(install, 'Logs'), join(install, 'build', 'Logs')]) {
      if (await deps.isDir(logs)) return logs
    }
  }
  return null
}

/** The session folders in a Logs folder, oldest first. */
export async function listLogFolders(logsDir: string): Promise<string[]> {
  const names = await readdir(logsDir).catch(() => [] as string[])
  return names
    .map((name) => ({ name, m: LOG_FOLDER.exec(name) }))
    .filter((f): f is { name: string; m: RegExpExecArray } => f.m !== null)
    .map(({ name, m }) => ({
      name,
      key: `${m[1]}${m[2]}${m[3]}${m[4].padStart(2, '0')}${m[5]}${m[6]}`
    }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.name.localeCompare(b.name))
    .map((f) => f.name)
}
