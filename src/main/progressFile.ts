import { sanitizeSettings } from '../shared/settings'
import type { Settings, SettingsPatch } from '../shared/types'

// An exported copy of the player's progress and settings, to keep or to move to another PC (since
// 1.47.0). The API key isn't in settings (it's kept apart, encrypted), so it never leaves the PC.

export const PROGRESS_APP = 'tarkov-loot-optimiser'
export const PROGRESS_FORMAT = 1

export interface ProgressFile {
  app: typeof PROGRESS_APP
  format: typeof PROGRESS_FORMAT
  exportedAt: string
  appVersion: string
  player: unknown
  settings: Settings
}

export function progressFile(
  player: unknown,
  settings: Settings,
  appVersion: string,
  at: number
): ProgressFile {
  return {
    app: PROGRESS_APP,
    format: PROGRESS_FORMAT,
    exportedAt: new Date(at).toISOString(),
    appVersion,
    player,
    settings
  }
}

/** The PC's own settings an import leaves as they are: where its game logs are, and tray startup. */
const MACHINE_SETTINGS = ['gameLogsDir', 'backgroundRecording', 'startWithWindows'] as const

/** An imported file's progress and the settings to apply, or an error saying what's wrong with it. */
export function readProgressFile(raw: unknown): { player: unknown; settings: SettingsPatch } {
  const file = raw as Partial<ProgressFile> | null
  if (typeof file !== 'object' || file === null || file.app !== PROGRESS_APP)
    throw new Error('This isn’t a progress file exported from this app.')
  if (file.format !== PROGRESS_FORMAT)
    throw new Error('This progress file is from a newer version of the app: update the app first.')
  if ((file.player as { version?: unknown } | null)?.version !== 1)
    throw new Error('This progress file is damaged: its progress can’t be read.')
  const settings: Record<string, unknown> = { ...sanitizeSettings(file.settings) }
  for (const key of MACHINE_SETTINGS) delete settings[key]
  return { player: file.player, settings: settings as SettingsPatch }
}
