/**
 * Maps from the Escape from Tarkov Wiki (escapefromtarkov.fandom.com, CC BY-SA 3.0): the image behind
 * its interactive map, by tarkov.dev's map key. `version` is the upload the calibration in
 * src/renderer/src/data/posterMaps.json was fitted to (it names the cached copy).
 */
export const WIKI_MAPS: Readonly<Record<string, { url: string; version: string }>> = {
  'the-lab': {
    url: 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/f/fd/The_Lab_Interactive_Map_Base.png/revision/latest?cb=20251128153047',
    version: '20251128153047'
  }
}
