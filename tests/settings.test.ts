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

  it('defaults to flea trend filters that still list items', () => {
    expect(DEFAULT_SETTINGS.trends).toMatchObject({
      minOffers: 25,
      minPrice: 10_000,
      minProfit: 2_000,
      minConsistency: 0.6,
      minSwing: 0.15
    })
    expect(sanitizeSettings({ trends: { minSwing: 5 } }).trends.minSwing).toBe(2)
    expect(sanitizeSettings({ trends: { minSwing: -1 } }).trends.minSwing).toBe(0)
    expect(sanitizeSettings({ trends: { minSwing: 0 } }).trends.minSwing).toBe(0)
  })

  it('splits the day into 3-hour parts unless told otherwise, and shows every time of day', () => {
    // Settings from before 1.13.0 have neither.
    expect(sanitizeSettings({ trends: { days: 14 } }).trends).toMatchObject({
      intervalHours: 3,
      nowOnly: false
    })
    expect(sanitizeSettings({ trends: { intervalHours: 6, nowOnly: true } }).trends).toMatchObject({
      intervalHours: 6,
      nowOnly: true
    })
    expect(sanitizeSettings({ trends: { intervalHours: 5, nowOnly: 'yes' } }).trends).toMatchObject({
      intervalHours: 3,
      nowOnly: false
    })
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
      minPrice: 10_000,
      minProfit: 2_000,
      minConsistency: 0.5,
      minSwing: 0.15
    })
    // Saved by a later version: the values are the player's, even when they match 1.3.0's.
    expect(sanitizeSettings({ trends: { ...saved130, minSwing: 0.1 } }).trends).toMatchObject({
      minOffers: 25,
      minPrice: 5_000,
      minSwing: 0.1
    })
  })

  it("moves filters left at 1.3.1's tight defaults (which emptied the list) to the new ones, once", () => {
    const saved131 = {
      days: 7,
      minOffers: 50,
      minPrice: 20_000,
      minProfit: 5_000,
      minConsistency: 0.7,
      minSwing: 0.3,
      sort: 'profit',
      tradableOnly: true
    }
    const migrated = sanitizeSettings({ trends: saved131 })
    expect(migrated.trends).toEqual(DEFAULT_SETTINGS.trends)
    expect(migrated.settingsVersion).toBe(3)
    expect(sanitizeSettings({ trends: { ...saved131, minOffers: 80 } }).trends).toMatchObject({
      minOffers: 80,
      minSwing: 0.15
    })
    // Chosen again after the update: kept.
    expect(sanitizeSettings({ settingsVersion: 2, trends: saved131 }).trends.minSwing).toBe(0.3)
    expect(mergeSettings(migrated, { trends: { ...migrated.trends, minSwing: 0.3 } }).trends.minSwing).toBe(
      0.3
    )
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
        maps: {
          mapKey: 'streets-of-tarkov',
          questScope: 'available',
          showSpawns: true,
          showLabels: false,
          showSnipers: false,
          faction: 'scav'
        }
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
        showTransits: true,
        showLabels: false,
        showBosses: true,
        showSnipers: false,
        faction: 'scav',
        favouritesOpen: true,
        highlighted: []
      }
    })
    // Event quests from the wiki (since 1.22.0): titles, once each, trimmed.
    expect(DEFAULT_SETTINGS.quests.wikiQuests).toEqual([])
    expect(
      sanitizeSettings({
        quests: { wikiQuests: [' Fog of War', 'Fog of War', '', 3, 'x'.repeat(201), 'Duck Hunt'] }
      }).quests.wikiQuests
    ).toEqual(['Fog of War', 'Duck Hunt'])
    expect(sanitizeSettings({ quests: { wikiQuests: 'Fog of War' } }).quests.wikiQuests).toEqual([])
    // The 2D maps are the only ones since 1.27.0: an old style setting is dropped. The favourites panel
    // over the map is open unless closed.
    expect(sanitizeSettings({ maps: { style: 'tarkov-dev' } }).maps).not.toHaveProperty('style')
    expect(sanitizeSettings({ maps: {} }).maps.favouritesOpen).toBe(true)
    expect(sanitizeSettings({ maps: { favouritesOpen: false } }).maps.favouritesOpen).toBe(false)
    // Items shown on the map: ids only, each once, at most 20.
    expect(
      sanitizeSettings({
        maps: { highlighted: ['a1', 'a1', 'bad id!', 7, ...Array.from({ length: 30 }, (_, i) => `i${i}`)] }
      }).maps.highlighted
    ).toEqual(['a1', ...Array.from({ length: 19 }, (_, i) => `i${i}`)])
    expect(sanitizeSettings({ maps: { highlighted: 'x' } }).maps.highlighted).toEqual([])
    expect(
      sanitizeSettings({
        view: 'nope',
        gameLogsDir: 5,
        quests: { faction: 'Scav' },
        maps: { mapKey: '../x', questScope: 'x', style: 'satellite', faction: 'bear', showLabels: 1 }
      })
    ).toMatchObject({
      view: 'loot',
      gameLogsDir: null,
      quests: DEFAULT_SETTINGS.quests,
      maps: { mapKey: 'customs', questScope: 'active', faction: 'pmc', showLabels: true }
    })
  })

  it('validates the hideout view and its options', () => {
    expect(DEFAULT_SETTINGS.hideout).toEqual({
      scope: 'all',
      questScope: 'active',
      source: 'all',
      hideDone: false,
      firOnly: false,
      keepOnly: false,
      sellOnly: false,
      scanSellBuyable: true,
      tab: 'items'
    })
    const chosen = { scope: 'next', hideDone: true, firOnly: true, keepOnly: true, tab: 'upgrades' } as const
    expect(sanitizeSettings({ view: 'hideout', hideout: chosen })).toMatchObject({
      view: 'hideout',
      hideout: chosen
    })
    expect(sanitizeSettings({ hideout: { ...chosen, tab: 'scav' } }).hideout.tab).toBe('scav')
    expect(
      sanitizeSettings({ hideout: { scope: 'some', hideDone: 'yes', firOnly: 1, keepOnly: 'on', tab: 'x' } })
        .hideout
    ).toEqual(DEFAULT_SETTINGS.hideout)
    // Settings saved by 1.8.0 have neither filter.
    expect(
      sanitizeSettings({ hideout: { scope: 'next', hideDone: true, tab: 'items' } }).hideout
    ).toMatchObject({
      firOnly: false,
      keepOnly: false
    })
    expect(
      mergeSettings(DEFAULT_SETTINGS, { hideout: { ...DEFAULT_SETTINGS.hideout, scope: 'next' } }).hideout
    ).toEqual({ ...DEFAULT_SETTINGS.hideout, scope: 'next' })
  })

  it('keeps the tracker’s quest scope and sell filter, and never both "only" filters', () => {
    const hideout = (raw: Record<string, unknown>) => sanitizeSettings({ hideout: raw }).hideout
    // Settings saved before 1.14.0: active quests, no sell filter.
    expect(hideout({ scope: 'next', keepOnly: true })).toMatchObject({
      questScope: 'active',
      sellOnly: false
    })
    expect(hideout({ questScope: 'all', sellOnly: true })).toMatchObject({
      questScope: 'all',
      sellOnly: true
    })
    expect(hideout({ questScope: 'none', sellOnly: 'yes' })).toMatchObject({
      questScope: 'active',
      sellOnly: false
    })
    expect(hideout({ keepOnly: true, sellOnly: true })).toMatchObject({ keepOnly: true, sellOnly: false })
    // The screenshot scanner's "sell what I can buy or craft later" is on by default since 1.25.0, and
    // turned on for settings saved before then; after that, switching it off sticks.
    expect(hideout({}).scanSellBuyable).toBe(true)
    expect(hideout({ scanSellBuyable: false }).scanSellBuyable).toBe(true)
    const saved = (version: number, raw: Record<string, unknown>) =>
      sanitizeSettings({ settingsVersion: version, hideout: raw }).hideout.scanSellBuyable
    expect(saved(2, { scanSellBuyable: false })).toBe(true)
    expect(saved(3, { scanSellBuyable: false })).toBe(false)
    expect(saved(3, {})).toBe(true)
  })

  it('keeps each tab’s hidden sidebar sections and whether it’s collapsed (since 1.26.0)', () => {
    expect(DEFAULT_SETTINGS.sidebars).toEqual({})
    expect(sanitizeSettings({}).sidebars).toEqual({})
    expect(
      sanitizeSettings({
        sidebars: {
          todo: { hidden: ['Keys to get', 'Keys to get', 7, '', 'x'.repeat(61)], collapsed: 'yes' },
          maps: { collapsed: true },
          nowhere: { hidden: ['Map'] },
          keys: { hidden: [], collapsed: false },
          raids: 'hidden'
        }
      }).sidebars
    ).toEqual({
      todo: { hidden: ['Keys to get'], collapsed: false },
      maps: { hidden: [], collapsed: true }
    })
    // One tab's change leaves the others.
    const before = sanitizeSettings({ sidebars: { maps: { hidden: ['Map layers'], collapsed: false } } })
    expect(mergeSettings(before, { sidebars: { todo: { hidden: [], collapsed: true } } }).sidebars).toEqual({
      maps: { hidden: ['Map layers'], collapsed: false },
      todo: { hidden: [], collapsed: true }
    })
  })

  it('keeps whose items the list shows, and the To do view (since 1.16.0)', () => {
    const hideout = (raw: Record<string, unknown>) => sanitizeSettings({ hideout: raw }).hideout
    // Settings saved before 1.16.0 list both.
    expect(hideout({ scope: 'next' }).source).toBe('all')
    expect(hideout({ source: 'hideout' }).source).toBe('hideout')
    expect(hideout({ source: 'quests' }).source).toBe('quests')
    expect(hideout({ source: 'stash' }).source).toBe('all')
    expect(sanitizeSettings({ view: 'todo' }).view).toBe('todo')
  })

  it('keeps the key options (since 1.17.0)', () => {
    // Settings saved before 1.17.0: every quest's keys listed, no map layer.
    const old = sanitizeSettings({ view: 'keys', maps: { mapKey: 'woods' } })
    expect(old.view).toBe('keys')
    expect(old.keys).toEqual({ scope: 'all', list: 'needed', tab: 'list', map: null })
    expect(old.maps.showKeys).toBe(false)
    const chosen = sanitizeSettings({
      keys: { scope: 'available', list: 'all', tab: 'scan', map: 'customs' },
      maps: { showKeys: true }
    })
    expect(chosen.keys).toEqual({ scope: 'available', list: 'all', tab: 'scan', map: 'customs' })
    expect(chosen.maps.showKeys).toBe(true)
    expect(
      sanitizeSettings({ keys: { scope: 'some', list: 'x', tab: 'y', map: 'No Such Map!' } }).keys
    ).toEqual({
      scope: 'all',
      list: 'needed',
      tab: 'list',
      map: null
    })
    expect(
      mergeSettings(DEFAULT_SETTINGS, { keys: { ...DEFAULT_SETTINGS.keys, scope: 'active' } }).keys.scope
    ).toBe('active')
  })

  it('keeps the To do filters and view (since 1.19.0), and the map overview or list (since 1.20.0)', () => {
    expect(DEFAULT_SETTINGS.todo).toEqual({ show: 'all', kinds: 'all', view: 'summary', layout: 'maps' })
    // 1.17–1.18's key switch gives way to the filters' defaults.
    expect(sanitizeSettings({ todo: { keys: true } }).todo).toEqual(DEFAULT_SETTINGS.todo)
    const chosen = { show: 'doable', kinds: 'kill', view: 'full', layout: 'list' } as const
    expect(sanitizeSettings({ todo: chosen }).todo).toEqual(chosen)
    expect(sanitizeSettings({ todo: { kinds: 'locate' } }).todo.kinds).toBe('locate')
    // 1.19 had no overview: it opens on it.
    expect(sanitizeSettings({ todo: { show: 'doable', kinds: 'kill', view: 'full' } }).todo.layout).toBe(
      'maps'
    )
    expect(sanitizeSettings({ todo: { show: 'some', kinds: 'loot', view: 1, layout: 'grid' } }).todo).toEqual(
      DEFAULT_SETTINGS.todo
    )
    expect(
      mergeSettings(DEFAULT_SETTINGS, { todo: { ...DEFAULT_SETTINGS.todo, show: 'doable' } }).todo.show
    ).toBe('doable')
  })

  it('keeps the Loot tab’s "only items to save" filter', () => {
    expect(DEFAULT_SETTINGS.keepOnly).toBe(false)
    expect(sanitizeSettings({ keepOnly: true }).keepOnly).toBe(true)
    expect(sanitizeSettings({ keepOnly: 'yes' }).keepOnly).toBe(false)
    expect(mergeSettings(DEFAULT_SETTINGS, { keepOnly: true }).keepOnly).toBe(true)
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
