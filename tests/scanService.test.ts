import { existsSync } from 'node:fs'
import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createScanService, ocrPaths } from '../src/main/scan/scanService'
import { tempDir } from './helpers'

const fixture = (name: string): Promise<Buffer> => readFile(join(__dirname, 'fixtures', name))

describe('the scan service', () => {
  const requests: string[] = []
  const service = createScanService({
    assets: async (request) => {
      requests.push(request.url)
      return request.url.includes('aaaaaaaaaaaaaaaaaaaaaaaa')
        ? new Response(new Uint8Array([1, 2, 3]))
        : new Response('Not found', { status: 404 })
    },
    screenshotsDir: () => screenshots
  })
  let screenshots = ''
  afterAll(() => service.dispose())

  it('finds the OCR worker and the bundled English model', () => {
    const { workerPath, langPath } = ocrPaths()
    expect(existsSync(workerPath)).toBe(true)
    expect(existsSync(join(langPath, 'eng.traineddata.gz'))).toBe(true)
  })

  it('reads item names and stack counts cut out of a screenshot', async () => {
    const [name, count] = await service.readText([
      { kind: 'name', image: await fixture('label-nippers.pgm') },
      { kind: 'count', image: await fixture('label-count-2.pgm') }
    ])
    expect(name.text).toBe('Nippers')
    expect(count.text).toBe('2')
    expect(count.confidence).toBeGreaterThan(50)
  }, 30_000)

  it('reads an unreadable label as nothing', async () => {
    const [result] = await service.readText([{ kind: 'name', image: new Uint8Array([1, 2, 3]) }])
    expect(result).toEqual({ text: '', confidence: 0 })
  }, 30_000)

  it('gets item grid pictures from the asset cache', async () => {
    expect(await service.gridImage('a'.repeat(24))).toEqual(new Uint8Array([1, 2, 3]))
    expect(await service.gridImage('b'.repeat(24))).toBeNull()
    expect(requests[0]).toBe(`tarkov-map://assets/${'a'.repeat(24)}-grid-image.webp`)
  })

  it('picks the newest screenshot', async () => {
    screenshots = join(await tempDir(), 'Screenshots')
    expect(await service.latestScreenshot()).toBeNull()
    await mkdir(screenshots)
    const old = join(screenshots, 'old.png')
    await writeFile(old, 'old')
    await utimes(old, new Date(2026, 0, 1), new Date(2026, 0, 1))
    await writeFile(join(screenshots, 'new.jpg'), 'new')
    await writeFile(join(screenshots, 'notes.txt'), 'not a picture')
    const latest = await service.latestScreenshot()
    expect(latest?.name).toBe('new.jpg')
    expect(new TextDecoder().decode(latest?.data)).toBe('new')
  })
})
