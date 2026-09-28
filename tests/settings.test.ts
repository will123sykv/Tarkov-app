import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSettingsStore, type SecretCodec } from '../src/main/settings'
import { DEFAULT_SETTINGS, mergeSettings, sanitizeSettings } from '../src/shared/settings'
import { tempDir } from './helpers'

// A reversible stand-in for safeStorage so tests can check the key isn't stored in plain text.
const codec: SecretCodec = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${[...plain].reverse().join('')}`),
  decrypt: (data) => [...data.toString().slice(4)].reverse().join('')
}

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps and validates every field', () => {
    const s = sanitizeSettings({
      gameMode: 'arena',
      playerLevels: { pvp: 0, pve: 99, season: '20' },
      refreshIntervalMin: 0,
      sort: { key: 'bogus', dir: 'asc' },
      pool: { category: 'nonsense', mapId: '' },
      hideLocked: 'yes'
    })
    expect(s.gameMode).toBe('pvp')
    expect(s.playerLevels).toEqual({ pvp: 1, pve: 62, season: 20 })
    expect(s.refreshIntervalMin).toBe(1)
    expect(s.sort).toEqual({ key: 'valuePerSlot', dir: 'asc' })
    expect(s.pool).toEqual({ category: 'all', mapId: null })
    expect(s.hideLocked).toBe(false)
  })

  it('merges nested patches', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      playerLevels: { ...DEFAULT_SETTINGS.playerLevels, pve: 42 }
    })
    expect(merged.playerLevels).toEqual({ pvp: 15, pve: 42, season: 1 })
  })
})

describe('settings store', () => {
  it('persists settings between sessions', async () => {
    const dir = await tempDir()
    const store = createSettingsStore({ dir, codec })
    await store.load()
    const { previous, current } = await store.update({
      gameMode: 'pve',
      playerLevels: { pvp: 15, pve: 33, season: 1 },
      hideLocked: true
    })
    expect(previous.gameMode).toBe('pvp')
    expect(current).toMatchObject({ gameMode: 'pve', hideLocked: true, hasTarkovMarketKey: false })

    const reopened = createSettingsStore({ dir, codec })
    expect(await reopened.load()).toMatchObject({
      gameMode: 'pve',
      playerLevels: { pve: 33 },
      hideLocked: true
    })
  })

  it('stores the tarkov-market key encrypted and can clear it', async () => {
    const dir = await tempDir()
    const store = createSettingsStore({ dir, codec })
    await store.load()
    const { current } = await store.update({ tarkovMarketApiKey: '  my-secret-key  ' })
    expect(current.hasTarkovMarketKey).toBe(true)
    expect(JSON.stringify(current)).not.toContain('my-secret-key')
    expect(await readFile(join(dir, 'secrets.json'), 'utf8')).not.toContain('my-secret-key')

    const reopened = createSettingsStore({ dir, codec })
    await reopened.load()
    expect(reopened.getTarkovMarketKey()).toBe('my-secret-key')

    await reopened.update({ tarkovMarketApiKey: null })
    const cleared = createSettingsStore({ dir, codec })
    expect((await cleared.load()).hasTarkovMarketKey).toBe(false)
  })

  it('recovers from a corrupt settings file', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'settings.json'), '{"gameMode": "pve", ')
    const store = createSettingsStore({ dir })
    expect(await store.load()).toMatchObject({ ...DEFAULT_SETTINGS, hasTarkovMarketKey: false })
  })
})
