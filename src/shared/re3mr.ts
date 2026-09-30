/**
 * Re3MR's 2D maps, as published unchanged in tarkov.dev's repository. The images are fetched at
 * this commit so they always match the calibration in src/renderer/src/data/re3mrMaps.json.
 */
export const RE3MR_COMMIT = '0d774352b5b28777d30cf734640cd1e9bf1b4b39'

export const RE3MR_FILES = [
  'factory-2d.jpg',
  'icebreaker-2d.jpg',
  'labyrinth-2d.jpg',
  'terminal-2d.jpg'
] as const

export const re3mrImageUrl = (file: string): string =>
  `https://raw.githubusercontent.com/the-hideout/tarkov-dev/${RE3MR_COMMIT}/public/maps/${file}`
