import { describe, expect, it } from 'vitest'
import { friendlyError } from '../src/renderer/src/lib/errors'

describe('friendlyError', () => {
  it('says "no internet connection" for network failures, once for every source', () => {
    expect(
      friendlyError(
        'json.tarkov.dev: net::ERR_TUNNEL_CONNECTION_FAILED · api.tarkov.dev: net::ERR_INTERNET_DISCONNECTED'
      )
    ).toBe('no internet connection')
    expect(friendlyError('fetch failed')).toBe('no internet connection')
    expect(friendlyError('getaddrinfo ENOTFOUND api.tarkov.dev')).toBe('no internet connection')
  })

  it('names timeouts and server problems, and keeps other messages', () => {
    expect(friendlyError('net::ERR_TIMED_OUT')).toBe('the connection timed out')
    expect(friendlyError('https://json.tarkov.dev/x: HTTP 503')).toBe('the server had a problem (HTTP 503)')
    expect(friendlyError('json.tarkov.dev: HTTP 502 · api.tarkov.dev: net::ERR_INTERNET_DISCONNECTED')).toBe(
      'json.tarkov.dev: the server had a problem (HTTP 502) · api.tarkov.dev: no internet connection'
    )
    expect(friendlyError('Unexpected token < in JSON')).toBe('Unexpected token < in JSON')
  })
})
