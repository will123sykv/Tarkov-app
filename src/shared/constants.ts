export const MIN_PLAYER_LEVEL = 1
export const MAX_PLAYER_LEVEL = 62

/** Global flea market unlock level, used when the API doesn't report one. */
export const DEFAULT_FLEA_MIN_LEVEL = 15

export const DEFAULT_REFRESH_INTERVAL_MIN = 5
export const MIN_REFRESH_INTERVAL_MIN = 1
export const MAX_REFRESH_INTERVAL_MIN = 120

/** Map loot spawns change rarely and the payload is large, so refetch at most daily. */
export const MAP_POOL_TTL_MS = 24 * 60 * 60 * 1000

/** Static JSON dumps tarkov.dev's own website loads; the primary price source. */
export const TARKOV_DEV_JSON_BASE = 'https://json.tarkov.dev'
export const TARKOV_DEV_ENDPOINT = 'https://api.tarkov.dev/graphql'
export const TARKOV_MARKET_BASE = 'https://api.tarkov-market.app/api/v1'

export const PRICE_REQUEST_TIMEOUT_MS = 30_000
/** Full JSON dumps and map loot are large, so allow longer than a GraphQL query. */
export const LARGE_REQUEST_TIMEOUT_MS = 60_000
