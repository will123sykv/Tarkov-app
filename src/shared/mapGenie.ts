// Map Genie's interactive Lab map, shown as its own page in the Maps tab (since 1.45.0). The app only
// opens it: none of its pins go on it, and none of Map Genie's images are used on the app's maps.

export const MAP_GENIE_LAB = 'https://mapgenie.io/tarkov/maps/lab'
/** Its own session, kept between runs, so a Map Genie sign-in and saved marks stay. */
export const MAP_GENIE_PARTITION = 'persist:mapgenie'

/** Whether a page is on Map Genie's site (where its page may go without leaving the app). */
export function isMapGenieUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && (hostname === 'mapgenie.io' || hostname.endsWith('.mapgenie.io'))
  } catch {
    return false
  }
}
