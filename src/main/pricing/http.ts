import { TARKOV_DEV_ENDPOINT } from '../../shared/constants'

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
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
    const res = await fetchFn(url, { ...init, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`)
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
