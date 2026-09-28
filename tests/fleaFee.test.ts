import { describe, expect, it } from 'vitest'
import { fleaMarketFee } from '../src/shared/fleaFee'

describe('fleaMarketFee', () => {
  it('charges both rates in full when listing at the base price', () => {
    expect(fleaMarketFee(100_000, 100_000)).toBe(6_000)
    expect(fleaMarketFee(100_000, 100_000, { sellOfferFeeRate: 0.05, sellRequirementFeeRate: 0.1 })).toBe(
      15_000
    )
  })

  it('grows faster than the price when listing above the base price', () => {
    const fee = fleaMarketFee(331_200, 1_100_000)!
    expect(fee).toBeGreaterThan(0.06 * 1_100_000)
    expect(fee).toBeLessThan(1_100_000)
    expect(fleaMarketFee(331_200, 1_200_000)!).toBeGreaterThan(fee)
  })

  it('is small when listing below the base price', () => {
    expect(fleaMarketFee(100_000, 50_000)!).toBeLessThan(6_000)
  })

  it('returns null without a positive base or sell price', () => {
    expect(fleaMarketFee(0, 50_000)).toBeNull()
    expect(fleaMarketFee(50_000, 0)).toBeNull()
  })
})
