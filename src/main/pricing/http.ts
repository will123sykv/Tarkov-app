import { TARKOV_DEV_ENDPOINT } from '../../shared/constants'

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Pull a readable reason out of an error response (GraphQL errors, {error|message}, or text). */
export function describeErrorBody(body: string): string {
  const text = body.trim()
  if (!text) return ''
  try {
    const json = JSON.parse(text) as {
      errors?: { message?: string }[]
      error?: unknown
      message?: unknown
    }
    const graphqlMessages = json.errors?.map((e) => e.message).filter(Boolean)
    if (graphqlMessages?.length) return graphqlMessages.join('; ')
    if (typeof json.error === 'string') return json.error
    if (typeof json.message === 'string') return json.message
    return ''
  } catch {
    return text.length > 200 ? `${text.slice(0, 200)}…` : text
  }
}

export async function fetchJson(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Always the current copy: Electron's net.fetch would otherwise reuse a cached response that
    // the server allows to be cached, and the app would keep showing (and recording) old prices.
    const res = await fetchFn(url, { cache: 'no-store', ...init, signal: controller.signal })
    if (!res.ok) {
      const status = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
      const detail = describeErrorBody(await res.text().catch(() => ''))
      throw new Error(detail ? `${status}: ${detail}` : status)
    }
    return await res.json()
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

interface GraphqlResponse<T> {
  data?: T | null
  errors?: { message: string }[]
}

/** POST a query to tarkov.dev. Partial data with field-level errors is accepted. */
export async function tarkovDevQuery<T>(
  fetchFn: FetchFn,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs: number
): Promise<T> {
  const body = (await fetchJson(
    fetchFn,
    TARKOV_DEV_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables })
    },
    timeoutMs
  )) as GraphqlResponse<T>
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? 'empty GraphQL response')
  return body.data
}
