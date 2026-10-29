import { describe, expect, it } from 'vitest'
import { sharedMemo } from '../src/renderer/src/lib/sharedMemo'

describe('work shared by every caller (since 1.71.0)', () => {
  it('works a step out once for the same inputs, keeping the last few', () => {
    let made = 0
    const make = () => ({ n: ++made })
    const a = {}
    const b = {}
    const first = sharedMemo('test', [a, 1], make)
    expect(sharedMemo('test', [a, 1], make)).toBe(first)
    expect(made).toBe(1)
    // Other inputs, by identity: worked out again.
    const other = sharedMemo('test', [b, 1], make)
    expect(other).not.toBe(first)
    expect(sharedMemo('test', [{}, 1], make).n).toBe(3)
    // Still kept: the last three.
    expect(sharedMemo('test', [a, 1], make)).toBe(first)
    sharedMemo('test', [{}, 2], make)
    sharedMemo('test', [{}, 3], make)
    // b was the least lately used.
    expect(sharedMemo('test', [b, 1], make)).not.toBe(other)
    // Each step has its own.
    expect(sharedMemo('another', [a, 1], () => 'x')).toBe('x')
  })
})
