import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import type { FetchFn } from '../pricing/http'

/** The app's scheme for map images: `tarkov-map://assets/maps/…` mirrors `https://assets.tarkov.dev/maps/…`. */
export const MAP_SCHEME = 'tarkov-map'
const ORIGIN = 'https://assets.tarkov.dev'
const ALLOWED = /^\/maps\/[\w./-]+\.(png|jpg|jpeg|webp|svg)$/i
const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml'
}

/**
 * Serves map images from a disk cache, downloading each from assets.tarkov.dev the first time it's
 * needed, so maps opened once also work offline. Only map image paths are allowed.
 */
export function createMapAssetHandler(deps: { cacheDir: string; fetchFn: FetchFn }) {
  const inFlight = new Map<string, Promise<Buffer | null>>()

  async function download(path: string, file: string): Promise<Buffer | null> {
    const res = await deps.fetchFn(`${ORIGIN}${path}`)
    if (!res.ok) return null
    const body = Buffer.from(await res.arrayBuffer())
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, body)
    await rename(tmp, file).catch(() => writeFile(file, body))
    return body
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname)
    if (url.host !== 'assets' || !ALLOWED.test(path) || path.includes('..')) {
      return new Response('Not found', { status: 404 })
    }
    const file = normalize(join(deps.cacheDir, path))
    if (!file.startsWith(normalize(deps.cacheDir) + sep)) return new Response('Not found', { status: 404 })
    const type = TYPES[path.split('.').pop()!.toLowerCase()]
    let body: Buffer | null = await readFile(file).catch(() => null)
    if (!body) {
      let pending = inFlight.get(file)
      if (!pending) {
        pending = download(path, file)
          .catch(() => null)
          .finally(() => inFlight.delete(file))
        inFlight.set(file, pending)
      }
      body = await pending
    }
    if (!body) return new Response('Not found', { status: 404 })
    return new Response(new Uint8Array(body), {
      headers: { 'Content-Type': type, 'Cache-Control': 'max-age=31536000, immutable' }
    })
  }
}

/** `https://assets.tarkov.dev/maps/x.png` → `tarkov-map://assets/maps/x.png`. */
export function toMapAssetUrl(url: string): string {
  return url.replace(/^https:\/\/assets\.tarkov\.dev\//, `${MAP_SCHEME}://assets/`)
}
