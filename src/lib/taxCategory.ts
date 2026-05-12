import type { ProductTaxCategory } from '../types/pos'

export const defaultProductTaxCategory: ProductTaxCategory = 'taxable'

export const productTaxCategories: ProductTaxCategory[] = ['taxable', 'zero', 'exempt']

export const productTaxCategoryLabels: Record<ProductTaxCategory, string> = {
  taxable: '應稅 TX 5%',
  zero: '零稅',
  exempt: '免稅',
}

export const isProductTaxCategory = (value: unknown): value is ProductTaxCategory =>
  typeof value === 'string' && productTaxCategories.includes(value as ProductTaxCategory)

export const normalizeProductTaxCategory = (value: unknown): ProductTaxCategory =>
  isProductTaxCategory(value) ? value : defaultProductTaxCategory

export const productTaxCategoryLabel = (value: ProductTaxCategory): string =>
  productTaxCategoryLabels[value]
