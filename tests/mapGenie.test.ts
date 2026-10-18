import { describe, expect, it } from 'vitest'
import { isMapGenieUrl, MAP_GENIE_LAB } from '../src/shared/mapGenie'

describe('Map Genie pages', () => {
  it('allows Map Genie’s site over https', () => {
    expect(isMapGenieUrl(MAP_GENIE_LAB)).toBe(true)
    expect(isMapGenieUrl('https://mapgenie.io/tarkov/maps/customs')).toBe(true)
    expect(isMapGenieUrl('https://tiles.mapgenie.io/x.png')).toBe(true)
  })

  it('leaves out other sites, look-alikes and plain http', () => {
    expect(isMapGenieUrl('http://mapgenie.io/tarkov/maps/lab')).toBe(false)
    expect(isMapGenieUrl('https://mapgenie.io.example.com/')).toBe(false)
    expect(isMapGenieUrl('https://evilmapgenie.io/')).toBe(false)
    expect(isMapGenieUrl('https://accounts.google.com/')).toBe(false)
    expect(isMapGenieUrl('not a url')).toBe(false)
  })
})
