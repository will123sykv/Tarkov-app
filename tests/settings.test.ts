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
      pool: { category: 'keys', containerId: 42, mapId: '' },
      containerSort: 'price',
      hideLocked: 'yes'
    })
    expect(s.gameMode).toBe('pvp')
    expect(s.playerLevels).toEqual({ pvp: 1, pve: 62, season: 20 })
    expect(s.refreshIntervalMin).toBe(1)
    expect(s.sort).toEqual({ key: 'valuePerSlot', dir: 'asc' })
    expect(s.pool).toEqual({ containerId: null, mapId: null })
    expect(s.containerSort).toBe('value')
    expect(s.hideLocked).toBe(false)
  })

  it('keeps a valid container and map selection', () => {
    expect(
      sanitizeSettings({ pool: { containerId: 'jacket', mapId: 'bigmap' }, containerSort: 'name' })
    ).toMatchObject({ pool: { containerId: 'jacket', mapId: 'bigmap' }, containerSort: 'name' })
  })

  it('merges nested patches', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      playerLevels: { ...DEFAULT_SETTINGS.playerLevels, pve: 42 }
    })
    expect(merged.playerLevels).toEqual({ pvp: 15, pve: 42, season: 1 })
    expect(
      mergeSettings(DEFAULT_SETTINGS, { trends: { ...DEFAULT_SETTINGS.trends, days: 30 } }).trends
    ).toEqual({ ...DEFAULT_SETTINGS.trends, days: 30 })
  })

  it('defaults to tight flea trend filters', () => {
    expect(DEFAULT_SETTINGS.trends).toMatchObject({
      minOffers: 50,
      minPrice: 20_000,
      minProfit: 5_000,
      minConsistency: 0.7,
      minSwing: 0.3
    })
    expect(sanitizeSettings({ trends: { minSwing: 5 } }).trends.minSwing).toBe(2)
    expect(sanitizeSettings({ trends: { minSwing: -1 } }).trends.minSwing).toBe(0)
    expect(sanitizeSettings({ trends: { minSwing: 0 } }).trends.minSwing).toBe(0)
  })

  it("moves filters left at 1.3.0's defaults to the new ones, keeping the player's own", () => {
    const saved130 = {
      days: 14,
      minOffers: 25,
      minPrice: 5_000,
      minProfit: 1_000,
      minConsistency: 0.6,
      sort: 'swing',
      tradableOnly: true
    }
    expect(sanitizeSettings({ trends: saved130 }).trends).toEqual({
      ...DEFAULT_SETTINGS.trends,
      days: 14,
      sort: 'swing'
    })
    expect(
      sanitizeSettings({ trends: { ...saved130, minOffers: 80, minConsistency: 0.5 } }).trends
    ).toMatchObject({
      minOffers: 80,
      minPrice: 20_000,
      minProfit: 5_000,
      minConsistency: 0.5,
      minSwing: 0.3
    })
    // Saved by this version: the values are the player's, even when they match 1.3.0's.
    expect(sanitizeSettings({ trends: { ...saved130, minSwing: 0.1 } }).trends).toMatchObject({
      minOffers: 25,
      minPrice: 5_000,
      minSwing: 0.1
    })
  })

  it('validates the quests, maps and raids settings', () => {
    expect(
      sanitizeSettings({
        view: 'maps',
        gameLogsDir: 'D:\\Games\\EFT\\Logs',
        quests: {
          statuses: ['active', 'bogus', 'completed'],
          traderId: 't',
          mapId: '',
          kappaOnly: true,
          faction: 'BEAR'
        },
        maps: { mapKey: 'streets-of-tarkov', questScope: 'available', showSpawns: true }
      })
    ).toMatchObject({
      view: 'maps',
      gameLogsDir: 'D:\\Games\\EFT\\Logs',
      quests: {
        statuses: ['active', 'completed'],
        traderId: 't',
        mapId: null,
        kappaOnly: true,
        lightkeeperOnly: false,
        faction: 'BEAR'
      },
      maps: {
        mapKey: 'streets-of-tarkov',
        questScope: 'available',
        showExtracts: true,
        showSpawns: true,
        showTransits: true
      }
    })
    expect(
      sanitizeSettings({
        view: 'nope',
        gameLogsDir: 5,
        quests: { faction: 'Scav' },
        maps: { mapKey: '../x', questScope: 'x' }
      })
    ).toMatchObject({
      view: 'loot',
      gameLogsDir: null,
      quests: DEFAULT_SETTINGS.quests,
      maps: { mapKey: 'customs', questScope: 'active' }
    })
  })

  it('validates the flea trends view and background options', () => {
    expect(
      sanitizeSettings({
        view: 'trends',
        backgroundRecording: true,
        startWithWindows: true,
        trends: {
          days: 14,
          minOffers: 50.4,
          minPrice: -5,
          minProfit: -2_000,
          minConsistency: 1.5,
          sort: 'swing',
          tradableOnly: false
        }
      })
    ).toMatchObject({
      view: 'trends',
      backgroundRecording: true,
      startWithWindows: true,
      trends: {
        days: 14,
        minOffers: 50,
        minPrice: 0,
        minProfit: -2_000,
        minConsistency: 1,
        sort: 'swing',
        tradableOnly: false
      }
    })
    expect(
      sanitizeSettings({
        view: 'charts',
        backgroundRecording: 'yes',
        trends: { days: 10, sort: 'random', minConsistency: 'most' }
      })
    ).toMatchObject({ view: 'loot', backgroundRecording: false, trends: DEFAULT_SETTINGS.trends })
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
