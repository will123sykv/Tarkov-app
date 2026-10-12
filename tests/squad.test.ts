import { describe, expect, it } from 'vitest'
import { squadShared } from '../src/shared/squad'

describe('objectives a squad can help with', () => {
  it('counts kills, quest-item pickups and marking', () => {
    const quest = { name: 'Debut' }
    expect(squadShared(quest, { type: 'shoot' })).toBe(true)
    expect(squadShared(quest, { type: 'findQuestItem' })).toBe(true)
    expect(squadShared(quest, { type: 'mark' })).toBe(true)
  })

  it('leaves out hand-overs, found-in-raid items, visits and extracts', () => {
    const quest = { name: 'Supply Plans' }
    for (const type of ['giveItem', 'giveQuestItem', 'findItem', 'visit', 'extract', 'plantItem', 'skill'])
      expect(squadShared(quest, { type })).toBe(false)
  })

  it('keeps the solo chains solo', () => {
    expect(squadShared({ name: 'The Punisher - Part 1' }, { type: 'shoot' })).toBe(false)
    expect(squadShared({ name: 'The Tarkov Shooter - Part 3' }, { type: 'shoot' })).toBe(false)
  })
})
