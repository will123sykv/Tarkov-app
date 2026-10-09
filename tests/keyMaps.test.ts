import { describe, expect, it } from 'vitest'
import { keyMapsUsed, keyUsedOn } from '../src/renderer/src/lib/keyMaps'

const group = (key: string, name: string, mapIds: string[]) => ({ key, name, mapIds })
const factory = group('factory', 'Factory', ['factory-day', 'factory-night'])
const customs = group('customs', 'Customs', ['customs-id'])
const lab = group('the-lab', 'The Lab', ['lab-id'])
const groupOf = new Map<string, { key: string; name: string }>(
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

describe('keyMapsUsed', () => {
  it('lists each map a key is used on once, by name, with its locks, entry and quests', () => {
    expect(
      keyMapsUsed(
        { locks: [{ group: customs, count: 2 }], access: [lab] },
        [{ mapIds: ['factory-night', 'customs-id'] }, { mapIds: ['factory-day'] }],
        groupOf
      )
    ).toEqual([
      { key: 'customs', name: 'Customs', locks: 2, access: false, quest: true },
      { key: 'factory', name: 'Factory', locks: 0, access: false, quest: true },
      { key: 'the-lab', name: 'The Lab', locks: 0, access: true, quest: false }
    ])
    expect(keyMapsUsed(none, [{ mapIds: ['unknown-map'] }], groupOf)).toEqual([])
  })
})
