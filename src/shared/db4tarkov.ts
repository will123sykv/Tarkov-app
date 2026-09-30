/**
 * db4tarkov.com's clean versions of the community 2D maps, served by its CDN as pyramids of 512 px
 * WebP tiles: at a map's top zoom a tile pixel is an image pixel, and each zoom below halves that.
 * The calibration in src/renderer/src/data/posterMaps.json is for the images as they were on
 * 2026-09-30; tiles are cached under the version they were calibrated for.
 */
export const DB4TARKOV_MAPS: Readonly<Record<string, { version: string; maxZoom: number }>> = {
  customs: { version: 'v2-0.12.7', maxZoom: 4 },
  ground_zero: { version: '2024', maxZoom: 5 },
  woods: { version: 'v6.5.1', maxZoom: 5 },
  shoreline: { version: 'v3.3', maxZoom: 5 }
}

export const db4tarkovTileUrl = (slug: string, z: number, x: number, y: number): string =>
  `https://cdn.db4tarkov.com/webp/map/${slug}/${slug}-${z}-${x}-${y}.webp`
