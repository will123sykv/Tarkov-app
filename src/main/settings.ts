import { join } from 'node:path'
import { DEFAULT_SETTINGS, mergeSettings, sanitizeSettings } from '../shared/settings'
import type { PublicSettings, Settings, SettingsPatch } from '../shared/types'
import { readJsonFile, writeJsonFileAtomic } from './jsonFile'

/** Encrypts secrets at rest; in the app this is Electron's safeStorage (DPAPI on Windows). */
export interface SecretCodec {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

interface SecretsFile {
  tarkovMarketApiKey?: { encrypted: boolean; data: string }
}

export interface SettingsStoreOptions {
  dir: string
  codec?: SecretCodec
  log?: (message: string) => void
}

export function createSettingsStore({ dir, codec, log = () => {} }: SettingsStoreOptions) {
  const settingsPath = join(dir, 'settings.json')
  const secretsPath = join(dir, 'secrets.json')
  let settings: Settings = DEFAULT_SETTINGS
  let apiKey: string | null = null
  let writes: Promise<void> = Promise.resolve()

  function queueWrite(path: string, data: unknown): Promise<void> {
    writes = writes
      .then(() => writeJsonFileAtomic(path, data))
      .catch((err) => log(`Failed to save ${path}: ${String(err)}`))
    return writes
  }

  function decodeKey(file: SecretsFile | undefined): string | null {
    const entry = file?.tarkovMarketApiKey
    if (!entry?.data) return null
    try {
      const bytes = Buffer.from(entry.data, 'base64')
      if (!entry.encrypted) return bytes.toString('utf8')
      return codec?.isAvailable() ? codec.decrypt(bytes) : null
    } catch {
      return null
    }
  }

  function encodeKey(key: string): SecretsFile {
    const encrypted = codec?.isAvailable() ?? false
    const bytes = encrypted ? codec!.encrypt(key) : Buffer.from(key, 'utf8')
    return { tarkovMarketApiKey: { encrypted, data: bytes.toString('base64') } }
  }

  function toPublic(): PublicSettings {
    return { ...settings, hasTarkovMarketKey: apiKey !== null }
  }

  return {
    async load(): Promise<PublicSettings> {
      settings = sanitizeSettings(await readJsonFile(settingsPath))
      apiKey = decodeKey((await readJsonFile(secretsPath)) as SecretsFile | undefined)
      return toPublic()
    },

    get: (): Settings => settings,
    getPublic: toPublic,
    getTarkovMarketKey: (): string | null => apiKey,

    async update(patch: SettingsPatch): Promise<{ previous: Settings; current: PublicSettings }> {
      const previous = settings
      const { tarkovMarketApiKey, ...rest } = patch
      settings = mergeSettings(settings, rest)
      const pending = [queueWrite(settingsPath, settings)]
      if (tarkovMarketApiKey !== undefined) {
        const trimmed = tarkovMarketApiKey?.trim() || null
        apiKey = trimmed
        pending.push(queueWrite(secretsPath, trimmed ? encodeKey(trimmed) : {}))
      }
      await Promise.all(pending)
      return { previous, current: toPublic() }
    },

    /** Resolves once every queued write has hit the disk. */
    flush: (): Promise<void> => writes
  }
}

export type SettingsStore = ReturnType<typeof createSettingsStore>
