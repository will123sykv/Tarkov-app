import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { FetchFn } from '../src/main/pricing/http'
import { createMapAssetHandler, toMapAssetUrl } from '../src/main/maps/mapAssets'
import { RE3MR_COMMIT } from '../src/shared/re3mr'
import { tempDir } from './helpers'

const request = (url: string) => new Request(url)

describe('createMapAssetHandler', () => {
  it('downloads a map image once, then serves it from the cache (also offline)', async () => {
    const cacheDir = await tempDir()
    const fetchFn = vi.fn<FetchFn>(async () => new Response(new Uint8Array([1, 2, 3])))
    const handle = createMapAssetHandler({ cacheDir, fetchFn })
    const url = 'tarkov-map://assets/maps/customs_0.16/main/3/4/3.png'
    const [a, b] = await Promise.all([handle(request(url)), handle(request(url))])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith('https://assets.tarkov.dev/maps/customs_0.16/main/3/4/3.png')
    expect(a.headers.get('content-type')).toBe('image/png')
    expect([...new Uint8Array(await b.arrayBuffer())]).toEqual([1, 2, 3])
    expect([...(await readFile(join(cacheDir, 'maps/customs_0.16/main/3/4/3.png')))]).toEqual([1, 2, 3])

    const offline = createMapAssetHandler({
      cacheDir,
      fetchFn: async () => Promise.reject(new Error('offline'))
    })
    expect((await offline(request(url))).status).toBe(200)
  })

  it('serves SVGs with their type and reports missing images', async () => {
    const handle = createMapAssetHandler({
      cacheDir: await tempDir(),
      fetchFn: async (url) =>
        url.endsWith('.svg') ? new Response('<svg/>') : new Response('no', { status: 404 })
    })
    const svg = await handle(request('tarkov-map://assets/maps/svg/Customs.svg'))
    expect(svg.headers.get('content-type')).toBe('image/svg+xml')
    expect((await handle(request('tarkov-map://assets/maps/missing/1/1/1.png'))).status).toBe(404)
  })

  it('refuses anything but map images', async () => {
    const fetchFn = vi.fn<FetchFn>()
    const handle = createMapAssetHandler({ cacheDir: await tempDir(), fetchFn })
    for (const url of [
      'tarkov-map://assets/maps/../../secret.png',
      'tarkov-map://assets/maps/%2e%2e/%2e%2e/secret.png',
      'tarkov-map://assets/other/file.png',
      'tarkov-map://evil/maps/x.png',
      'tarkov-map://assets/maps/x.exe'
    ]) {
      expect((await handle(request(url))).status, url).toBe(404)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('maps tarkov.dev asset URLs onto the scheme', () => {
    expect(toMapAssetUrl('https://assets.tarkov.dev/maps/svg/Woods.svg')).toBe(
      'tarkov-map://assets/maps/svg/Woods.svg'
    )
  })
})

describe('Re3MR images', () => {
  it('fetches them from tarkov.dev’s repository at the pinned commit and caches them by commit', async () => {
    const cacheDir = await tempDir()
    const fetchFn = vi.fn<FetchFn>(async () => new Response(new Uint8Array([9, 9])))
    const handle = createMapAssetHandler({ cacheDir, fetchFn })
    const res = await handle(request('tarkov-map://re3mr/factory-2d.jpg'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(fetchFn).toHaveBeenCalledWith(
      `https://raw.githubusercontent.com/the-hideout/tarkov-dev/${RE3MR_COMMIT}/public/maps/factory-2d.jpg`
    )
    expect([...(await readFile(join(cacheDir, 're3mr', RE3MR_COMMIT, 'factory-2d.jpg')))]).toEqual([9, 9])
  })

  it('refuses any other file', async () => {
    const fetchFn = vi.fn<FetchFn>()
    const handle = createMapAssetHandler({ cacheDir: await tempDir(), fetchFn })
    for (const url of [
      'tarkov-map://re3mr/customs-2d.jpg',
      'tarkov-map://re3mr/..%2F..%2Fsecret.jpg',
      'tarkov-map://re3mr/factory-2d.jpg.exe',
      'tarkov-map://re3mr/maps/factory-2d.jpg'
    ]) {
      expect((await handle(request(url))).status, url).toBe(404)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
