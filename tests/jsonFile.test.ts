import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readJsonFile, writeJsonFileAtomic } from '../src/main/jsonFile'

let dir: string | null = null
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = null
})

describe('writeJsonFileAtomic', () => {
  it('keeps the last of many writes made at once, and leaves no temp files', async () => {
    dir = await mkdtemp(join(tmpdir(), 'json-'))
    const file = join(dir, 'player.json')
    // Setting every trader's loyalty at once writes the player's file this many times in a millisecond.
    await Promise.all(Array.from({ length: 20 }, (_, i) => writeJsonFileAtomic(file, { n: i })))
    expect(await readJsonFile(file)).toEqual({ n: 19 })
    expect(await readdir(dir)).toEqual(['player.json'])
  })
})
