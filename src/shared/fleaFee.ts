export interface FleaFeeRates {
  sellOfferFeeRate: number
  sellRequirementFeeRate: number
}

export const DEFAULT_FLEA_FEE_RATES: FleaFeeRates = { sellOfferFeeRate: 0.03, sellRequirementFeeRate: 0.03 }

/**
 * Flea market listing fee for one unit, using the formula tarkov.dev uses
 * (https://escapefromtarkov.fandom.com/wiki/Trading#Flea_Market), without the Intelligence Center discount.
 */
export function fleaMarketFee(
  basePrice: number,
  sellPrice: number,
  rates: FleaFeeRates = DEFAULT_FLEA_FEE_RATES
): number | null {
  if (!(basePrice > 0) || !(sellPrice > 0)) return null
  let offerPower = Math.log10(basePrice / sellPrice)
  let requirementPower = Math.log10(sellPrice / basePrice)
  if (sellPrice < basePrice) offerPower = Math.pow(offerPower, 1.08)
  else requirementPower = Math.pow(requirementPower, 1.08)
  return Math.ceil(
    basePrice * rates.sellOfferFeeRate * Math.pow(4, offerPower) +
      sellPrice * rates.sellRequirementFeeRate * Math.pow(4, requirementPower)
  )
}
