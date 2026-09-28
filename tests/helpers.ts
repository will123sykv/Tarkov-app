import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'
import type { FetchFn } from '../src/main/pricing/http'

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'))
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'tarkov-loot-test-'))
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>

/** A fetch mock that answers tarkov.dev and tarkov-market requests with the given handlers. */
export function mockFetch(routes: { tarkovDev?: Route; tarkovMarket?: Route }) {
  return vi.fn<FetchFn>(async (url, init) => {
    if (url.startsWith('https://api.tarkov.dev/') && routes.tarkovDev) return routes.tarkovDev(url, init)
    if (url.startsWith('https://api.tarkov-market.app/') && routes.tarkovMarket)
      return routes.tarkovMarket(url, init)
    throw new Error(`unexpected request to ${url}`)
  })
}

export function requestBody(init: RequestInit | undefined): {
  query: string
  variables: Record<string, unknown>
} {
  return JSON.parse(String(init?.body))
}
