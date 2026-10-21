import { describe, expect, it } from 'vitest'
import { ofKind, questKind } from '../src/shared/questKind'

const story = { quest: { id: 'tour', story: { description: '', howItStarts: '' } } }
const side = { quest: { id: 'debut', story: undefined } }
const event = { quest: { id: 'fog-of-war', story: undefined } }

describe('the All · Story · Side switch', () => {
  it('tells the main story’s chapters from side quests', () => {
    expect(questKind(story.quest)).toBe('story')
    expect(questKind(side.quest)).toBe('side')
  })

  it('keeps the quests of the kind chosen', () => {
    const rows = [story, side, event]
    expect(ofKind(rows, 'all')).toEqual(rows)
    expect(ofKind(rows, 'story')).toEqual([story])
    expect(ofKind(rows, 'side')).toEqual([side, event])
  })
})
