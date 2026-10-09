// Errors from fetching data, in words: "no internet connection" rather than
// "net::ERR_INTERNET_DISCONNECTED". Messages naming several sources ("json.tarkov.dev: … · api.tarkov.dev:
// …") read as one phrase when they all failed the same way.

const OFFLINE =
  /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED|ERR_CONNECTION_(REFUSED|RESET|CLOSED|FAILED)|ERR_ADDRESS_UNREACHABLE|ERR_NETWORK_CHANGED|ERR_NETWORK_ACCESS_DENIED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|fetch failed|Failed to fetch/i
const TIMEOUT = /ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|timed? ?out|AbortError/i
const SERVER = /HTTP (5\d\d)/

function phrase(message: string): string {
  if (OFFLINE.test(message)) return 'no internet connection'
  if (TIMEOUT.test(message)) return 'the connection timed out'
  const server = SERVER.exec(message)
  if (server) return `the server had a problem (HTTP ${server[1]})`
  return message.trim()
}

/** An error message as words a player can act on. */
export function friendlyError(message: string): string {
  const parts = message.split(' · ').map((part) => {
    const source = /^([\w.-]+\.\w+): (.*)$/.exec(part)
    return source ? { source: source[1], text: phrase(source[2]) } : { source: null, text: phrase(part) }
  })
  const texts = [...new Set(parts.map((p) => p.text))]
  if (texts.length === 1) return texts[0]
  return parts.map((p) => (p.source ? `${p.source}: ${p.text}` : p.text)).join(' · ')
}
