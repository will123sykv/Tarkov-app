import { describe, expect, it } from 'vitest'
import { keyUsedOn } from '../src/renderer/src/lib/keyMaps'

const group = (key: string, mapIds: string[]) => ({ key, mapIds })
const factory = group('factory', ['factory-day', 'factory-night'])
const customs = group('customs', ['customs-id'])
const lab = group('the-lab', ['lab-id'])
const groupOf = new Map<string, { key: string }>(
  [factory, customs, lab].flatMap((g) => g.mapIds.map((id) => [id, g] as const))
)
const none = { locks: [], access: [] }

describe('keyUsedOn', () => {
  it('keeps keys with a lock there, a quest needing them there, or that get you onto it', () => {
    expect(keyUsedOn({ locks: [{ group: customs }], access: [] }, [], groupOf, 'customs')).toBe(true)
    expect(keyUsedOn(none, [{ mapIds: ['customs-id'] }], groupOf, 'customs')).toBe(true)
    expect(keyUsedOn({ locks: [], access: [lab] }, [], groupOf, 'the-lab')).toBe(true)
  })

  it('leaves out keys used elsewhere, or that only spawn there', () => {
    expect(keyUsedOn({ locks: [{ group: customs }], access: [] }, [], groupOf, 'factory')).toBe(false)
    // Spawns aren't part of what's checked: a key with nothing else is used nowhere.
    expect(keyUsedOn(none, [], groupOf, 'customs')).toBe(false)
  })

  it('counts Night Factory as Factory, and every map when none is picked', () => {
    expect(keyUsedOn(none, [{ mapIds: ['factory-night'] }], groupOf, 'factory')).toBe(true)
    expect(keyUsedOn(none, [], groupOf, null)).toBe(true)
  })
})
