import { describe, expect, it } from 'vitest'
import { decodeKeys, encodeKeys } from '../src/shared/keyShare'

const ids = [
  '5780cf7f2459777de4559322',
  '5d80c60f86f77440373c4ece',
  '5c94bbff86f7747ee735c08f',
  '5913915886f774123603c392'
]

describe('key share codes', () => {
  it('round-trips the name, game mode and keys (each valid id once, sorted)', async () => {
    const code = await encodeKeys({ name: ' Alex ', gameMode: 'pve', keyIds: [...ids, ids[0], 'not-a-key'] })
    expect(code).toMatch(/^TLOK1\.[A-Za-z0-9_-]+$/)
    expect(await decodeKeys(code)).toEqual({ name: 'Alex', gameMode: 'pve', keyIds: [...ids].sort() })
  })

  it('finds the code in a longer message, and reads an empty list', async () => {
    const code = await encodeKeys({ name: 'Sam ☺', gameMode: 'season', keyIds: [] })
    expect(await decodeKeys(`my keys:\n${code}\ncheers`)).toEqual({
      name: 'Sam ☺',
      gameMode: 'season',
      keyIds: []
    })
  })

  it('stays short: a hundred keys fit in one chat message', async () => {
    const many = Array.from(
      { length: 100 },
      (_, i) => `5c94bbff86f7747ee735${i.toString(16).padStart(4, '0')}`
    )
    const code = await encodeKeys({ name: 'Alex', gameMode: 'pvp', keyIds: many })
    expect(code.length).toBeLessThan(2000)
    expect((await decodeKeys(code)) as { keyIds: string[] }).toMatchObject({ keyIds: many })
  })

  it('says why a code can’t be read', async () => {
    expect(await decodeKeys('hello')).toEqual({ error: expect.stringContaining('isn’t a key code') })
    expect(await decodeKeys('TLOK2.abcd')).toEqual({ error: expect.stringContaining('newer version') })
    expect(await decodeKeys('TLOK1.abcd')).toEqual({ error: expect.stringContaining('damaged') })
    const code = await encodeKeys({ name: 'Alex', gameMode: 'pvp', keyIds: ids })
    expect(await decodeKeys(code.slice(0, -6))).toEqual({ error: expect.stringContaining('damaged') })
  })
})
