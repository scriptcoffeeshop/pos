import type { ProductTaxCategory } from '../types/pos'

export const defaultProductTaxCategory: ProductTaxCategory = 'taxable'

export const productTaxCategories: ProductTaxCategory[] = ['taxable', 'zero', 'exempt']

export const productTaxCategoryLabels: Record<ProductTaxCategory, string> = {
  taxable: '應稅 TX 5%',
  zero: '零稅',
  exempt: '免稅',
}

export const zeroTaxSalesReasonOptions: Array<{ value: string; label: string }> = [
  { value: '外銷貨物', label: '外銷貨物' },
  { value: '與外銷有關之勞務', label: '與外銷有關之勞務' },
  { value: '依法設立免稅商店銷售', label: '依法設立免稅商店銷售' },
  { value: '保稅區營業人供營運貨物或勞務', label: '保稅區營業人供營運貨物或勞務' },
  { value: '其他零稅銷售', label: '其他零稅銷售' },
]

export const isProductTaxCategory = (value: unknown): value is ProductTaxCategory =>
  typeof value === 'string' && productTaxCategories.includes(value as ProductTaxCategory)

export const normalizeProductTaxCategory = (value: unknown): ProductTaxCategory =>
  isProductTaxCategory(value) ? value : defaultProductTaxCategory

export const normalizeZeroTaxSalesReason = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, 120) : ''

export const productTaxCategoryLabel = (value: ProductTaxCategory): string =>
  productTaxCategoryLabels[value]
