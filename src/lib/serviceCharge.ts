import type { CartLine, MenuCategory, ServiceChargeSettings, ServiceMode } from '../types/pos'

const sanitizeInteger = (value: unknown, fallback = 0): number => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback
}

export const serviceChargeRateForMode = (
  settings: ServiceChargeSettings,
  mode: ServiceMode,
): number => {
  if (!settings.enabled) {
    return 0
  }

  const rate = mode === 'dine-in'
    ? settings.dineInRate
    : mode === 'delivery'
      ? settings.deliveryRate
      : settings.takeoutRate

  return Math.min(Math.max(sanitizeInteger(rate), 0), 30)
}

export const serviceChargeLabel = (settings: ServiceChargeSettings): string =>
  settings.label.trim() || '服務費'

export const lineCountsForServiceCharge = (
  line: CartLine,
  settings: Pick<ServiceChargeSettings, 'excludedCategories' | 'excludedItemIds'>,
): boolean => {
  const excludedCategories = new Set<MenuCategory>(settings.excludedCategories)
  const excludedItemIds = new Set(settings.excludedItemIds)

  return !(
    (line.category && excludedCategories.has(line.category)) ||
    excludedItemIds.has(line.itemId) ||
    Boolean(line.productId && excludedItemIds.has(line.productId)) ||
    excludedItemIds.has(line.productSku)
  )
}

export const serviceChargeableSubtotal = (
  lines: CartLine[],
  settings: ServiceChargeSettings,
): number =>
  lines.reduce((total, line) => {
    if (!lineCountsForServiceCharge(line, settings)) {
      return total
    }

    return total + Math.max(0, sanitizeInteger(line.unitPrice)) * Math.max(0, sanitizeInteger(line.quantity))
  }, 0)

export const calculateServiceChargeAmount = (
  settings: ServiceChargeSettings,
  lines: CartLine[],
  serviceMode: ServiceMode,
  discountAmount = 0,
): number => {
  const rate = serviceChargeRateForMode(settings, serviceMode)
  if (rate <= 0) {
    return 0
  }

  const subtotal = serviceChargeableSubtotal(lines, settings)
  const discountOffset = settings.discountBasis === 'after-discount'
    ? Math.min(Math.max(0, sanitizeInteger(discountAmount)), subtotal)
    : 0
  const chargeableAmount = Math.max(0, subtotal - discountOffset)
  return Math.max(0, Math.round(chargeableAmount * rate / 100))
}
