import { readdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import type { Worker } from 'tesseract.js'
import {
  MAX_SCREENSHOT_BYTES,
  type OcrJob,
  type OcrResult,
  type ScreenshotFile
} from '../../shared/scanTypes'

// Reads item labels cut out of a screenshot (by the renderer) with Tesseract, offline: the English data
// ships with the app. Workers start on first use and stop after a few idle minutes.

const require = createRequire(import.meta.url)

/** Packaged, these files are unpacked from app.asar (worker threads can't run code from inside it). */
const unpacked = (path: string): string => path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

export function ocrPaths(): { workerPath: string; langPath: string } {
  return {
    workerPath: unpacked(require.resolve('tesseract.js/src/worker-script/node/index.js')),
    langPath: unpacked(
      join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int')
    )
  }
}

const IDLE_MS = 5 * 60_000
const SCREENSHOT_TYPES = new Set(['.png', '.jpg', '.jpeg', '.bmp'])

export interface ScanService {
  readText(jobs: OcrJob[]): Promise<OcrResult[]>
  /** An item's tarkov.dev grid image (cached on disk), or null when it can't be had. */
  gridImage(itemId: string): Promise<Uint8Array | null>
  /** The newest image in the game's screenshot folder, or null when there's none. */
  latestScreenshot(): Promise<ScreenshotFile | null>
  dispose(): Promise<void>
}

export function createScanService(deps: {
  /** Serves `tarkov-map://` requests from the asset cache (see maps/mapAssets.ts). */
  assets: (request: Request) => Promise<Response>
  screenshotsDir: () => string
  log?: (message: string) => void
}): ScanService {
  let workers: Promise<{ name: Worker; count: Worker }> | null = null
  let idle: ReturnType<typeof setTimeout> | null = null
  let busy = 0

  async function start(): Promise<{ name: Worker; count: Worker }> {
    const { createWorker, OEM, PSM } = require('tesseract.js') as typeof import('tesseract.js')
    const { workerPath, langPath } = ocrPaths()
    // Without an error handler, a failure inside a worker is thrown where nothing can catch it.
    const errorHandler = (err: unknown): void => deps.log?.(`OCR worker failed: ${err}`)
    const options = { workerPath, langPath, gzip: true, cacheMethod: 'none', errorHandler }
    const [name, count] = await Promise.all([
      createWorker('eng', OEM.LSTM_ONLY, options),
      createWorker('eng', OEM.LSTM_ONLY, options)
    ])
    await Promise.all([
      name.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE }),
      // One word: as a line, a lone digit often reads as nothing.
      count.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_WORD, tessedit_char_whitelist: '0123456789/' })
    ])
    return { name, count }
  }

  async function stop(): Promise<void> {
    const pending = workers
    workers = null
    if (!pending) return
    const w = await pending.catch(() => null)
    if (w) await Promise.all([w.name.terminate(), w.count.terminate()]).catch(() => undefined)
  }

  async function readText(jobs: OcrJob[]): Promise<OcrResult[]> {
    if (idle) clearTimeout(idle)
    busy++
    try {
      if (!workers) {
        workers = start()
        workers.catch(() => (workers = null))
      }
      const w = await workers
      const run = async (kind: OcrJob['kind']): Promise<Map<number, OcrResult>> => {
        const results = new Map<number, OcrResult>()
        for (let i = 0; i < jobs.length; i++) {
          if (jobs[i].kind !== kind) continue
          // An unreadable label reads as nothing rather than failing the whole scan.
          const data = await w[kind]
            .recognize(Buffer.from(jobs[i].image))
            .then((r) => r.data)
            .catch(() => null)
          results.set(i, { text: data?.text.trim() ?? '', confidence: data?.confidence ?? 0 })
        }
        return results
      }
      const [names, counts] = await Promise.all([run('name'), run('count')])
      return jobs.map((_, i) => names.get(i) ?? counts.get(i) ?? { text: '', confidence: 0 })
    } finally {
      busy--
      if (!busy) idle = setTimeout(() => void stop(), IDLE_MS)
    }
  }

  async function gridImage(itemId: string): Promise<Uint8Array | null> {
    try {
      const res = await deps.assets(new Request(`tarkov-map://assets/${itemId}-grid-image.webp`))
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
    } catch (err) {
      deps.log?.(`Grid image for ${itemId} failed: ${err}`)
      return null
    }
  }

  async function latestScreenshot(): Promise<ScreenshotFile | null> {
    const dir = deps.screenshotsDir()
    const names = await readdir(dir).catch(() => [] as string[])
    let newest: { name: string; modified: number; size: number } | null = null
    for (const name of names) {
      if (!SCREENSHOT_TYPES.has(extname(name).toLowerCase())) continue
      const info = await stat(join(dir, name)).catch(() => null)
      if (info?.isFile() && (!newest || info.mtimeMs > newest.modified))
        newest = { name, modified: info.mtimeMs, size: info.size }
    }
    if (!newest || newest.size > MAX_SCREENSHOT_BYTES) return null
    const data = await readFile(join(dir, newest.name))
    return { name: newest.name, modified: newest.modified, data: new Uint8Array(data) }
  }

  return {
    readText,
    gridImage,
    latestScreenshot,
    async dispose() {
      if (idle) clearTimeout(idle)
      await stop()
    }
  }
}
