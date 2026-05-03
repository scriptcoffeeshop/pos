import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { menuItems } from '../data/menu'
import { initialOrders } from '../data/orders'
import { formatDateKey } from '../lib/formatters'
import { isNativeLanPrinterAvailable, lanPrinterModeLabel, sendLanPrintPayload } from '../lib/lanPrinter'
import {
  createOrder,
  createPrintJob,
  closeRegisterSession,
  createProduct,
  defaultOnlineOrderingSettings,
  deleteProduct,
  deletePrintJob,
  fetchAdminProducts,
  fetchCurrentRegisterSession,
  fetchOrders,
  fetchProducts,
  fetchRuntimeSettings,
  openRegisterSession,
  claimOrder,
  currentStationId,
  currentStationLabel,
  isPosApiConfigured,
  releaseOrderClaim,
  refundOrder,
  sendStationHeartbeat,
  updateProduct,
  updatePrintJobStatus,
  updateOrderPaymentStatus as persistOrderPaymentStatus,
  updateOrderStatus as persistOrderStatus,
  voidOrder,
} from '../lib/posApi'
import type { ProductUpdateInput } from '../lib/posApi'
import {
  buildOrderPrintPlan,
  buildPrinterHealthcheckPayload,
  buildPrinterHealthcheckPreview,
} from '../lib/printing'
import type {
  CartLine,
  CustomerDraft,
  MenuCategory,
  MenuItem,
  OrderSource,
  OrderStatus,
  OnlineOrderingSettings,
  PaymentMethod,
  PaymentStatus,
  PosOrder,
  ProductSupplyStatus,
  PrintJob,
  PrinterSettings,
  PrintStation,
  PrintStatus,
  RegisterSession,
  ServiceMode,
} from '../types/pos'

type CategoryFilter = 'all' | MenuCategory
type BackendMode = 'syncing' | 'connected' | 'fallback'
type RuntimeSettings = Awaited<ReturnType<typeof fetchRuntimeSettings>>
type WebAudioGlobal = typeof globalThis & { webkitAudioContext?: typeof AudioContext }

const queueSyncIntervalMs = 20_000
const stationHeartbeatIntervalMs = 30_000
const onlineReminderClockIntervalMs = 30_000
const maxCartLineQuantity = 999
const counterDraftStorageKey = 'script-coffee-pos-counter-draft'
const recentItemsStorageKey = 'script-coffee-pos-recent-items'
const pendingLocalOrdersStorageKey = 'script-coffee-pos-pending-orders'
const localCounterOrdersStorageKey = 'script-coffee-pos-local-counter-orders'
const localProductsStorageKey = 'script-coffee-pos-local-products'

interface UsePosSessionOptions {
  autoLoad?: boolean
}

interface BackendStatus {
  mode: BackendMode
  label: string
  detail: string
}

interface CounterDraftState {
  cartLines: CartLine[]
  customer: CustomerDraft
  draftOrderId: string | null
  draftStartedAt: string | null
  paymentMethod: PaymentMethod
  serviceMode: ServiceMode
}

const serviceModes: ServiceMode[] = ['dine-in', 'takeout', 'delivery']
const paymentMethods: PaymentMethod[] = ['cash', 'card', 'line-pay', 'jkopay', 'transfer']
const orderSources: OrderSource[] = ['counter', 'qr', 'online']
const orderStatuses: OrderStatus[] = ['new', 'preparing', 'ready', 'served', 'failed', 'voided']
const paymentStatuses: PaymentStatus[] = ['pending', 'authorized', 'paid', 'expired', 'failed', 'refunded']
const printStatuses: PrintStatus[] = ['queued', 'printed', 'skipped', 'failed']

const defaultCustomerDraft = (): CustomerDraft => ({
  name: '現場客',
  phone: '',
  deliveryAddress: '',
  requestedFulfillmentAt: '',
  note: '',
})

const isServiceMode = (value: unknown): value is ServiceMode =>
  typeof value === 'string' && serviceModes.includes(value as ServiceMode)

const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  typeof value === 'string' && paymentMethods.includes(value as PaymentMethod)

const sanitizeDraftOrderId = (value: unknown): string | null =>
  typeof value === 'string' && /^POS-\d{8}-\d{3}$/.test(value) ? value : null

const sanitizeDraftStartedAt = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? value : null
}

const isMenuCategory = (value: unknown): value is MenuCategory =>
  typeof value === 'string' && value.trim().length > 0

const isOrderSource = (value: unknown): value is OrderSource =>
  typeof value === 'string' && orderSources.includes(value as OrderSource)

const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === 'string' && orderStatuses.includes(value as OrderStatus)

const isPaymentStatus = (value: unknown): value is PaymentStatus =>
  typeof value === 'string' && paymentStatuses.includes(value as PaymentStatus)

const isPrintStatus = (value: unknown): value is PrintStatus =>
  typeof value === 'string' && printStatuses.includes(value as PrintStatus)

const sanitizeCounterDraftLine = (line: unknown): CartLine | null => {
  if (!line || typeof line !== 'object') {
    return null
  }

  const entry = line as Partial<CartLine>
  if (
    typeof entry.itemId !== 'string' ||
    typeof entry.productSku !== 'string' ||
    typeof entry.name !== 'string' ||
    typeof entry.unitPrice !== 'number' ||
    typeof entry.quantity !== 'number'
  ) {
    return null
  }

  const nextLine: CartLine = {
    itemId: entry.itemId,
    productSku: entry.productSku,
    name: entry.name,
    unitPrice: Math.max(0, Math.trunc(entry.unitPrice)),
    quantity: Math.max(1, Math.trunc(entry.quantity)),
    options: Array.isArray(entry.options)
      ? entry.options.filter((option): option is string => typeof option === 'string')
      : [],
  }

  if (typeof entry.productId === 'string') {
    nextLine.productId = entry.productId
  }

  if (isMenuCategory(entry.category)) {
    nextLine.category = entry.category
  }

  if (typeof entry.prepStation === 'string') {
    nextLine.prepStation = entry.prepStation
  }

  if (typeof entry.printLabel === 'boolean') {
    nextLine.printLabel = entry.printLabel
  }

  return nextLine
}

const sanitizeCustomerDraft = (value: unknown): CustomerDraft => {
  const fallback = defaultCustomerDraft()
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const draft = value as Partial<CustomerDraft>
  return {
    name: typeof draft.name === 'string' && draft.name.trim() ? draft.name : fallback.name,
    phone: typeof draft.phone === 'string' ? draft.phone : fallback.phone,
    deliveryAddress: typeof draft.deliveryAddress === 'string' ? draft.deliveryAddress : fallback.deliveryAddress,
    requestedFulfillmentAt: typeof draft.requestedFulfillmentAt === 'string'
      ? draft.requestedFulfillmentAt
      : fallback.requestedFulfillmentAt,
    note: typeof draft.note === 'string' ? draft.note : fallback.note,
  }
}

const readCounterDraft = (): CounterDraftState | null => {
  try {
    const rawDraft = globalThis.localStorage?.getItem(counterDraftStorageKey)
    if (!rawDraft) {
      return null
    }

    const parsed = JSON.parse(rawDraft) as Partial<CounterDraftState>
    return {
      cartLines: Array.isArray(parsed.cartLines)
        ? parsed.cartLines.map(sanitizeCounterDraftLine).filter((line): line is CartLine => Boolean(line))
        : [],
      customer: sanitizeCustomerDraft(parsed.customer),
      draftOrderId: sanitizeDraftOrderId(parsed.draftOrderId),
      draftStartedAt: sanitizeDraftStartedAt(parsed.draftStartedAt),
      paymentMethod: isPaymentMethod(parsed.paymentMethod) ? parsed.paymentMethod : 'cash',
      serviceMode: isServiceMode(parsed.serviceMode) ? parsed.serviceMode : 'takeout',
    }
  } catch {
    return null
  }
}

const writeCounterDraft = (draft: CounterDraftState): void => {
  try {
    const hasDraft =
      draft.cartLines.length > 0 ||
      draft.customer.phone.trim().length > 0 ||
      draft.customer.deliveryAddress.trim().length > 0 ||
      draft.customer.requestedFulfillmentAt.trim().length > 0 ||
      draft.customer.note.trim().length > 0 ||
      draft.customer.name.trim() !== '現場客' ||
      Boolean(draft.draftOrderId) ||
      draft.paymentMethod !== 'cash' ||
      draft.serviceMode !== 'takeout'

    if (!hasDraft) {
      globalThis.localStorage?.removeItem(counterDraftStorageKey)
      return
    }

    globalThis.localStorage?.setItem(counterDraftStorageKey, JSON.stringify(draft))
  } catch {
    return
  }
}

const readRecentItemIds = (): string[] => {
  try {
    const rawItems = globalThis.localStorage?.getItem(recentItemsStorageKey)
    if (!rawItems) {
      return []
    }

    const parsed = JSON.parse(rawItems)
    return Array.isArray(parsed)
      ? parsed.filter((itemId): itemId is string => typeof itemId === 'string' && itemId.trim().length > 0).slice(0, 6)
      : []
  } catch {
    return []
  }
}

const writeRecentItemIds = (itemIds: string[]): void => {
  try {
    if (itemIds.length === 0) {
      globalThis.localStorage?.removeItem(recentItemsStorageKey)
      return
    }

    globalThis.localStorage?.setItem(recentItemsStorageKey, JSON.stringify(itemIds.slice(0, 6)))
  } catch {
    return
  }
}

const nullableString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const sanitizeStoredOrder = (value: unknown, requireLines: boolean): PosOrder | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const order = value as Partial<PosOrder>
  const lines = Array.isArray(order.lines)
    ? order.lines.map(sanitizeCounterDraftLine).filter((line): line is CartLine => Boolean(line))
    : []

  if (
    typeof order.id !== 'string' ||
    order.id.trim().length === 0 ||
    (requireLines && lines.length === 0) ||
    typeof order.subtotal !== 'number' ||
    typeof order.customerName !== 'string' ||
    typeof order.customerPhone !== 'string' ||
    typeof order.deliveryAddress !== 'string' ||
    typeof order.note !== 'string' ||
    typeof order.createdAt !== 'string'
  ) {
    return null
  }

  return {
    id: order.id,
    source: isOrderSource(order.source) ? order.source : 'counter',
    mode: isServiceMode(order.mode) ? order.mode : 'takeout',
    customerName: order.customerName.trim() || '現場客',
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    requestedFulfillmentAt: nullableString(order.requestedFulfillmentAt),
    note: order.note,
    lines,
    subtotal: Math.max(0, Math.trunc(order.subtotal)),
    paymentMethod: isPaymentMethod(order.paymentMethod) ? order.paymentMethod : 'cash',
    paymentStatus: isPaymentStatus(order.paymentStatus) ? order.paymentStatus : 'pending',
    status: isOrderStatus(order.status) ? order.status : 'new',
    createdAt: order.createdAt,
    claimedBy: nullableString(order.claimedBy),
    claimedAt: nullableString(order.claimedAt),
    claimExpiresAt: nullableString(order.claimExpiresAt),
    printStatus: isPrintStatus(order.printStatus) ? order.printStatus : 'skipped',
    printJobs: [],
  }
}

const sanitizePendingLocalOrder = (value: unknown): PosOrder | null => sanitizeStoredOrder(value, true)

const sanitizeLocalCounterOrder = (value: unknown): PosOrder | null => sanitizeStoredOrder(value, false)

const readPendingLocalOrders = (): PosOrder[] => {
  try {
    const rawOrders = globalThis.localStorage?.getItem(pendingLocalOrdersStorageKey)
    if (!rawOrders) {
      return []
    }

    const parsed = JSON.parse(rawOrders)
    return Array.isArray(parsed)
      ? parsed.map(sanitizePendingLocalOrder).filter((order): order is PosOrder => Boolean(order)).slice(0, 50)
      : []
  } catch {
    return []
  }
}

const readLocalCounterOrders = (): PosOrder[] => {
  try {
    const rawOrders = globalThis.localStorage?.getItem(localCounterOrdersStorageKey)
    if (!rawOrders) {
      return []
    }

    const parsed = JSON.parse(rawOrders)
    return Array.isArray(parsed)
      ? parsed.map(sanitizeLocalCounterOrder).filter((order): order is PosOrder => Boolean(order)).slice(0, 50)
      : []
  } catch {
    return []
  }
}

const writePendingLocalOrders = (orders: PosOrder[]): void => {
  try {
    if (orders.length === 0) {
      globalThis.localStorage?.removeItem(pendingLocalOrdersStorageKey)
      return
    }

    globalThis.localStorage?.setItem(pendingLocalOrdersStorageKey, JSON.stringify(orders.slice(0, 50)))
  } catch {
    return
  }
}

const writeLocalCounterOrders = (orders: PosOrder[]): void => {
  try {
    const visibleOrders = orders.filter((order) => !['served', 'voided', 'failed'].includes(order.status)).slice(0, 50)
    if (visibleOrders.length === 0) {
      globalThis.localStorage?.removeItem(localCounterOrdersStorageKey)
      return
    }

    globalThis.localStorage?.setItem(localCounterOrdersStorageKey, JSON.stringify(visibleOrders))
  } catch {
    return
  }
}

const mergeLocalPendingOrders = (pendingOrders: PosOrder[], baseOrders: PosOrder[]): PosOrder[] => {
  const baseIds = new Set(baseOrders.map((order) => order.id))
  return [...pendingOrders.filter((order) => !baseIds.has(order.id)), ...baseOrders]
}

const mergeLocalCounterOrders = (localOrders: PosOrder[], baseOrders: PosOrder[]): PosOrder[] => {
  const localIds = new Set(localOrders.map((order) => order.id))
  return [...localOrders, ...baseOrders.filter((order) => !localIds.has(order.id))]
}

const paymentStatusFor = (method: PaymentMethod): PosOrder['paymentStatus'] => {
  if (method === 'cash' || method === 'transfer') {
    return 'pending'
  }
  return 'authorized'
}

const buildOrderId = (date: Date, sequence: number): string =>
  `POS-${formatDateKey(date)}-${String(sequence).padStart(3, '0')}`

const toRequestedFulfillmentIso = (value: string): string | null => {
  if (!value.trim()) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const toDatetimeLocalInputValue = (value: string | null): string => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const timestamp = date.getTime()
  if (!Number.isFinite(timestamp)) {
    return ''
  }

  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const buildDefaultPrinterSettings = (station: PrintStation): PrinterSettings => ({
  stations: [
    {
      id: station.id ?? 'counter',
      name: station.name,
      host: station.host,
      port: station.port,
      protocol: station.protocol,
      enabled: station.online,
      autoPrint: station.autoPrint,
    },
  ],
  rules: [
    {
      id: 'counter-all-labels',
      name: '櫃台全品項貼紙',
      serviceMode: 'takeout',
      stationId: station.id ?? 'counter',
      categories: ['coffee', 'tea', 'food', 'retail'],
      copies: 1,
      labelMode: 'label',
      enabled: true,
    },
    {
      id: 'counter-dine-in-receipt',
      name: '內用收據',
      serviceMode: 'dine-in',
      stationId: station.id ?? 'counter',
      categories: ['coffee', 'tea', 'food', 'retail'],
      copies: 1,
      labelMode: 'receipt',
      enabled: true,
    },
    {
      id: 'counter-delivery-receipt',
      name: '外送收據',
      serviceMode: 'delivery',
      stationId: station.id ?? 'counter',
      categories: ['coffee', 'tea', 'food', 'retail'],
      copies: 1,
      labelMode: 'both',
      enabled: true,
    },
  ],
})

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return '未知錯誤'
}

const isInventoryError = (message: string): boolean => /inventory|Product not found|quantity/i.test(message)

const nextSequenceFromOrders = (orders: PosOrder[], dateKey = formatDateKey(new Date())): number => {
  const orderIdPattern = new RegExp(`^POS-${dateKey}-(\\d{3})$`)
  const maxSequence = orders.reduce((currentMax, order) => {
    const match = order.id.match(orderIdPattern)
    const sequence = match ? Number(match[1]) : 0
    return Number.isFinite(sequence) ? Math.max(currentMax, sequence) : currentMax
  }, 0)

  return maxSequence + 1
}

const sequenceFromOrderId = (orderId: string | null): number => {
  const match = orderId?.match(/^POS-\d{8}-(\d{3})$/)
  const sequence = match ? Number(match[1]) : 0

  return Number.isFinite(sequence) ? sequence : 0
}

const sortProducts = (products: MenuItem[]): MenuItem[] =>
  [...products].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

interface ProductUpdateOverrides {
  isAvailable?: boolean
  posVisible?: boolean
  onlineVisible?: boolean
  qrVisible?: boolean
}

const productToUpdateInput = (product: MenuItem, overrides: ProductUpdateOverrides = {}): ProductUpdateInput => ({
  name: product.name,
  category: product.category,
  price: product.price,
  tags: [...product.tags],
  accent: product.accent,
  isAvailable: overrides.isAvailable ?? product.available,
  sortOrder: product.sortOrder,
  posVisible: overrides.posVisible ?? product.posVisible,
  onlineVisible: overrides.onlineVisible ?? product.onlineVisible,
  qrVisible: overrides.qrVisible ?? product.qrVisible,
  prepStation: product.prepStation,
  printLabel: product.printLabel,
  inventoryCount: product.inventoryCount,
  lowStockThreshold: product.lowStockThreshold,
  soldOutUntil: product.soldOutUntil,
})

const productSkuFromName = (name: string): string => {
  const sku = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 64)

  return sku || `product-${Date.now().toString(36)}`
}

const createLocalProductId = (): string =>
  `local-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`

const buildLocalProduct = (input: ProductUpdateInput): MenuItem => ({
  id: createLocalProductId(),
  sku: input.sku?.trim() || productSkuFromName(input.name),
  name: input.name.trim(),
  category: input.category.trim(),
  price: input.price,
  tags: [...input.tags],
  accent: input.accent,
  available: input.isAvailable,
  sortOrder: input.sortOrder,
  posVisible: input.posVisible,
  onlineVisible: input.onlineVisible,
  qrVisible: input.qrVisible,
  prepStation: input.prepStation,
  printLabel: input.printLabel,
  inventoryCount: input.inventoryCount,
  lowStockThreshold: input.lowStockThreshold,
  soldOutUntil: input.soldOutUntil,
})

const isLocalProduct = (product: MenuItem): boolean => product.id.startsWith('local-')

const sanitizeLocalProduct = (value: unknown): MenuItem | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const product = value as Partial<MenuItem>
  if (
    typeof product.id !== 'string' ||
    typeof product.sku !== 'string' ||
    typeof product.name !== 'string' ||
    typeof product.category !== 'string' ||
    typeof product.price !== 'number'
  ) {
    return null
  }

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    price: Math.max(0, Math.trunc(product.price)),
    tags: Array.isArray(product.tags) ? product.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    accent: typeof product.accent === 'string' ? product.accent : '#0b6b63',
    available: typeof product.available === 'boolean' ? product.available : true,
    sortOrder: typeof product.sortOrder === 'number' ? Math.trunc(product.sortOrder) : 0,
    posVisible: typeof product.posVisible === 'boolean' ? product.posVisible : true,
    onlineVisible: typeof product.onlineVisible === 'boolean' ? product.onlineVisible : true,
    qrVisible: typeof product.qrVisible === 'boolean' ? product.qrVisible : true,
    prepStation: typeof product.prepStation === 'string' ? product.prepStation : 'counter',
    printLabel: typeof product.printLabel === 'boolean' ? product.printLabel : true,
    inventoryCount: typeof product.inventoryCount === 'number' ? Math.trunc(product.inventoryCount) : null,
    lowStockThreshold: typeof product.lowStockThreshold === 'number' ? Math.trunc(product.lowStockThreshold) : null,
    soldOutUntil: typeof product.soldOutUntil === 'string' ? product.soldOutUntil : null,
  }
}

const readLocalProducts = (): MenuItem[] => {
  try {
    const rawProducts = globalThis.localStorage?.getItem(localProductsStorageKey)
    if (!rawProducts) {
      return []
    }

    const parsed = JSON.parse(rawProducts)
    return Array.isArray(parsed)
      ? parsed.map(sanitizeLocalProduct).filter((product): product is MenuItem => Boolean(product))
      : []
  } catch {
    return []
  }
}

const writeLocalProducts = (products: MenuItem[]): void => {
  try {
    globalThis.localStorage?.setItem(localProductsStorageKey, JSON.stringify(products.filter(isLocalProduct)))
  } catch {
    return
  }
}

const isProductTemporarilyStopped = (product: MenuItem): boolean => {
  if (!product.soldOutUntil) {
    return false
  }

  const stoppedUntil = new Date(product.soldOutUntil).getTime()
  return Number.isFinite(stoppedUntil) && stoppedUntil > Date.now()
}

const productSupplyOverrides = (status: ProductSupplyStatus): ProductUpdateOverrides => {
  if (status === 'online-stopped') {
    return {
      isAvailable: true,
      posVisible: true,
      onlineVisible: false,
      qrVisible: false,
    }
  }

  if (status === 'stopped') {
    return {
      isAvailable: false,
    }
  }

  return {
    isAvailable: true,
  }
}

const applyProductSupplyStatus = (product: MenuItem, status: ProductSupplyStatus): MenuItem => {
  const overrides = productSupplyOverrides(status)
  return {
    ...product,
    available: overrides.isAvailable ?? product.available,
    posVisible: overrides.posVisible ?? product.posVisible,
    onlineVisible: overrides.onlineVisible ?? product.onlineVisible,
    qrVisible: overrides.qrVisible ?? product.qrVisible,
  }
}

const isProductOrderable = (product: MenuItem): boolean =>
  product.available &&
  product.posVisible &&
  product.inventoryCount !== 0 &&
  !isProductTemporarilyStopped(product)

const summarizePrintStatuses = (statuses: PrintStatus[]): PrintStatus => {
  if (statuses.length === 0) {
    return 'skipped'
  }

  if (statuses.some((status) => status === 'failed')) {
    return 'failed'
  }

  if (statuses.every((status) => status === 'printed')) {
    return 'printed'
  }

  if (statuses.some((status) => status === 'queued')) {
    return 'queued'
  }

  return 'skipped'
}

const summarizePrintJobs = (printJobs: PrintJob[]): PrintStatus => {
  if (printJobs.length === 0) {
    return 'skipped'
  }

  return summarizePrintStatuses(printJobs.map((printJob) => printJob.status))
}

const claimExpiresIn = (seconds = 180): string => new Date(Date.now() + seconds * 1000).toISOString()

const isClaimExpired = (order: PosOrder, now = Date.now()): boolean => {
  if (!order.claimedBy || !order.claimExpiresAt) {
    return true
  }

  const expiresAt = new Date(order.claimExpiresAt).getTime()
  return !Number.isFinite(expiresAt) || expiresAt <= now
}

export const usePosSession = (options: UsePosSessionOptions = {}) => {
  const autoLoad = options.autoLoad ?? true
  const savedCounterDraft = readCounterDraft()
  const savedPendingLocalOrders = readPendingLocalOrders()
  const savedLocalCounterOrders = readLocalCounterOrders()
  const selectedCategory = ref<CategoryFilter>('all')
  const searchTerm = ref('')
  const serviceMode = ref<ServiceMode>(savedCounterDraft?.serviceMode ?? 'takeout')
  const paymentMethod = ref<PaymentMethod>(savedCounterDraft?.paymentMethod ?? 'cash')
  const savedLocalProducts = readLocalProducts()
  const menuCatalog = ref<MenuItem[]>(sortProducts([...menuItems, ...savedLocalProducts]))
  const productStatusCatalog = ref<MenuItem[]>(sortProducts([...menuItems, ...savedLocalProducts]))
  const cartLines = ref<CartLine[]>(savedCounterDraft?.cartLines ?? [])
  const recentItemIds = ref<string[]>(readRecentItemIds())
  const pendingLocalOrders = ref<PosOrder[]>(savedPendingLocalOrders)
  const localCounterOrders = ref<PosOrder[]>(savedLocalCounterOrders)
  const orderQueue = ref<PosOrder[]>(
    mergeLocalCounterOrders(savedLocalCounterOrders, mergeLocalPendingOrders(savedPendingLocalOrders, initialOrders)),
  )
  const lastPrintPreview = ref('尚未送出列印資料')
  const counterDraftOrderId = ref<string | null>(savedCounterDraft?.draftOrderId ?? null)
  const counterDraftStartedAt = ref<string | null>(
    counterDraftOrderId.value ? savedCounterDraft?.draftStartedAt ?? null : null,
  )
  const nextSequence = ref(
    Math.max(nextSequenceFromOrders(orderQueue.value), sequenceFromOrderId(counterDraftOrderId.value) + 1),
  )
  const isSubmitting = ref(false)
  const printingOrderId = ref<string | null>(null)
  const deletingPrintJobId = ref<string | null>(null)
  const claimingOrderId = ref<string | null>(null)
  const updatingPaymentOrderId = ref<string | null>(null)
  const voidingOrderId = ref<string | null>(null)
  const refundingOrderId = ref<string | null>(null)
  const isLoadingProductStatus = ref(false)
  const togglingProductId = ref<string | null>(null)
  const productStatusMessage = ref('輸入 PIN 後可載入完整商品清單，並在平板上暫停或恢復供應')
  const registerSession = ref<RegisterSession | null>(null)
  const registerMessage = ref('尚未載入開班資料')
  const stationHeartbeatMessage = ref('尚未回報平板在線狀態')
  const isRegisterBusy = ref(false)
  const backendStatus = reactive<BackendStatus>({
    mode: isPosApiConfigured ? 'syncing' : 'fallback',
    label: isPosApiConfigured ? 'API 同步中' : '本機模式',
    detail: isPosApiConfigured ? '正在連線 POS API' : '尚未設定 Supabase URL 或 anon key',
  })
  const customer = reactive<CustomerDraft>(savedCounterDraft?.customer ?? defaultCustomerDraft())
  const printStation = reactive<PrintStation>({
    id: 'counter',
    name: 'GODEX DT2X',
    host: import.meta.env.VITE_POS_PRINTER_HOST ?? '192.168.1.100',
    port: Number(import.meta.env.VITE_POS_PRINTER_PORT ?? 9100),
    protocol: 'EZPL over TCP',
    online: true,
    autoPrint: true,
    lastPrintAt: null,
  })
  const printerSettings = ref<PrinterSettings>(buildDefaultPrinterSettings(printStation))
  const onlineOrderingSettings = ref<OnlineOrderingSettings>(defaultOnlineOrderingSettings())
  const onlineReminderClock = ref(Date.now())
  const acknowledgedOnlineReminderIds = ref<string[]>([])
  const onlineReminderAudioMessage = ref('')
  const stationClaimId = currentStationId()
  const stationClaimLabel = currentStationLabel()
  let queueSyncTimer: number | null = null
  let stationHeartbeatTimer: number | null = null
  let onlineReminderClockTimer: number | null = null
  let lastPlayedOnlineReminderSignature = ''

  const currentPrinterSettings = (): PrinterSettings => ({
    stations: printerSettings.value.stations.map((station) => {
      if (station.id !== printStation.id) {
        return { ...station }
      }

      return {
        ...station,
        enabled: printStation.online,
        autoPrint: printStation.autoPrint,
        host: printStation.host,
        port: printStation.port,
        protocol: printStation.protocol,
        name: printStation.name,
      }
    }),
    rules: printerSettings.value.rules.map((rule) => ({ ...rule, categories: [...rule.categories] })),
  })

  const applyRuntimeSettings = (runtimeSettings: RuntimeSettings): void => {
    onlineOrderingSettings.value = runtimeSettings.onlineOrdering
    printerSettings.value = runtimeSettings.printerSettings.stations.length > 0
      ? runtimeSettings.printerSettings
      : buildDefaultPrinterSettings(printStation)
    const primaryStation = printerSettings.value.stations.find((station) => station.enabled)
    if (!primaryStation) {
      return
    }

    printStation.id = primaryStation.id
    printStation.name = primaryStation.name
    printStation.host = primaryStation.host
    printStation.port = primaryStation.port
    printStation.protocol = primaryStation.protocol
    printStation.autoPrint = primaryStation.autoPrint
    printStation.online = primaryStation.enabled
  }

  const onlineReminderMinutes = computed(() =>
    Math.max(0, onlineOrderingSettings.value.unconfirmedReminderMinutes),
  )

  const unconfirmedOnlineOrders = computed(() =>
    orderQueue.value.filter((order) =>
      (order.source === 'online' || order.source === 'qr') &&
      order.status === 'new' &&
      ['pending', 'authorized', 'paid'].includes(order.paymentStatus),
    ),
  )

  const overdueUnconfirmedOnlineOrders = computed(() => {
    const thresholdMs = onlineReminderMinutes.value * 60_000
    const now = onlineReminderClock.value

    return unconfirmedOnlineOrders.value.filter((order) => {
      const createdAt = new Date(order.createdAt).getTime()
      if (!Number.isFinite(createdAt)) {
        return false
      }

      return now - createdAt >= thresholdMs
    })
  })

  const activeOnlineReminderOrders = computed(() => {
    const acknowledgedIds = new Set(acknowledgedOnlineReminderIds.value)
    return overdueUnconfirmedOnlineOrders.value.filter((order) => !acknowledgedIds.has(order.id))
  })

  const onlineReminderSignature = computed(() =>
    activeOnlineReminderOrders.value.map((order) => order.id).sort().join('|'),
  )

  const onlineOrderReminder = computed(() => ({
    soundEnabled: onlineOrderingSettings.value.soundEnabled,
    reminderMinutes: onlineReminderMinutes.value,
    unconfirmedCount: unconfirmedOnlineOrders.value.length,
    overdueCount: overdueUnconfirmedOnlineOrders.value.length,
    activeOverdueCount: activeOnlineReminderOrders.value.length,
    audioMessage: onlineReminderAudioMessage.value,
  }))

  const playOnlineOrderTone = async (): Promise<void> => {
    const AudioContextCtor = globalThis.AudioContext ?? (globalThis as WebAudioGlobal).webkitAudioContext
    if (!AudioContextCtor) {
      onlineReminderAudioMessage.value = '此裝置不支援提示音'
      return
    }

    try {
      const audioContext = new AudioContextCtor()
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const now = audioContext.currentTime
      const gain = audioContext.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
      gain.connect(audioContext.destination)

      for (const [index, frequency] of [880, 1175].entries()) {
        const oscillator = audioContext.createOscillator()
        const startAt = now + index * 0.18
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, startAt)
        oscillator.connect(gain)
        oscillator.start(startAt)
        oscillator.stop(startAt + 0.12)
      }

      globalThis.setTimeout(() => {
        void audioContext.close()
      }, 560)
      onlineReminderAudioMessage.value = ''
    } catch {
      onlineReminderAudioMessage.value = '提示音被瀏覽器阻擋，點一下頁面後會恢復'
    }
  }

  const maybePlayOnlineOrderReminder = (): void => {
    const signature = onlineReminderSignature.value
    if (!signature) {
      lastPlayedOnlineReminderSignature = ''
      return
    }

    if (!onlineOrderingSettings.value.soundEnabled || signature === lastPlayedOnlineReminderSignature) {
      return
    }

    if (globalThis.document?.visibilityState && globalThis.document.visibilityState !== 'visible') {
      return
    }

    lastPlayedOnlineReminderSignature = signature
    void playOnlineOrderTone()
  }

  const acknowledgeOnlineOrderReminders = (): void => {
    const nextAcknowledgedIds = new Set(acknowledgedOnlineReminderIds.value)
    for (const order of overdueUnconfirmedOnlineOrders.value) {
      nextAcknowledgedIds.add(order.id)
    }

    acknowledgedOnlineReminderIds.value = [...nextAcknowledgedIds]
  }

  watch(
    overdueUnconfirmedOnlineOrders,
    (orders) => {
      const overdueIds = new Set(orders.map((order) => order.id))
      acknowledgedOnlineReminderIds.value = acknowledgedOnlineReminderIds.value.filter((orderId) =>
        overdueIds.has(orderId),
      )
    },
  )

  watch(
    [onlineReminderSignature, () => onlineOrderingSettings.value.soundEnabled],
    () => {
      maybePlayOnlineOrderReminder()
    },
  )

  const filteredMenu = computed(() => {
    const keyword = searchTerm.value.trim().toLowerCase()
    return menuCatalog.value.filter((item) => {
      const matchesCategory = selectedCategory.value === 'all' || item.category === selectedCategory.value
      const matchesKeyword =
        keyword.length === 0 ||
        item.name.toLowerCase().includes(keyword) ||
        item.tags.some((tag) => tag.toLowerCase().includes(keyword))
      return isProductOrderable(item) && matchesCategory && matchesKeyword
    })
  })

  const quickAddItems = computed(() => {
    const availableItems = menuCatalog.value.filter(isProductOrderable)
    const recentItems = recentItemIds.value
      .map((itemId) => availableItems.find((item) => item.id === itemId))
      .filter((item): item is MenuItem => Boolean(item))
    const priorityItems = availableItems.filter((item) =>
      item.tags.some((tag) => ['熱賣', '可加購', '限量'].includes(tag)),
    )
    const seenItemIds = new Set<string>()

    return [...recentItems, ...priorityItems, ...availableItems]
      .filter((item) => {
        if (seenItemIds.has(item.id)) {
          return false
        }

        seenItemIds.add(item.id)
        return true
      })
      .slice(0, 6)
  })

  const cartTotal = computed(() =>
    cartLines.value.reduce((total, line) => total + line.unitPrice * line.quantity, 0),
  )

  const cartQuantity = computed(() => cartLines.value.reduce((total, line) => total + line.quantity, 0))
  const pendingOrders = computed(() => orderQueue.value.filter((order) => order.status !== 'served' && order.status !== 'voided'))

  const setBackendStatus = (mode: BackendMode, label: string, detail: string): void => {
    backendStatus.mode = mode
    backendStatus.label = label
    backendStatus.detail = detail
  }

  const applyRegisterSession = (session: RegisterSession | null): void => {
    registerSession.value = session
    registerMessage.value = session
      ? `目前班別：${session.status === 'open' ? '營業中' : '已關班'}`
      : '尚未開班'
  }

  const rememberRecentItem = (itemId: string): void => {
    recentItemIds.value = [itemId, ...recentItemIds.value.filter((entry) => entry !== itemId)].slice(0, 6)
    writeRecentItemIds(recentItemIds.value)
  }

  const resetCustomerDraft = (): void => {
    const nextDraft = defaultCustomerDraft()
    customer.name = nextDraft.name
    customer.phone = nextDraft.phone
    customer.deliveryAddress = nextDraft.deliveryAddress
    customer.requestedFulfillmentAt = nextDraft.requestedFulfillmentAt
    customer.note = nextDraft.note
  }

  const syncNextSequenceFromQueue = (): void => {
    nextSequence.value = Math.max(
      nextSequenceFromOrders(orderQueue.value),
      sequenceFromOrderId(counterDraftOrderId.value) + 1,
    )
  }

  const clearCounterDraftIdentity = (): void => {
    counterDraftOrderId.value = null
    counterDraftStartedAt.value = null
    syncNextSequenceFromQueue()
  }

  const startCounterDraft = (mode: ServiceMode = 'takeout'): void => {
    const startedAt = new Date()
    const sequence = Math.max(nextSequence.value, nextSequenceFromOrders(orderQueue.value, formatDateKey(startedAt)))
    const orderId = buildOrderId(startedAt, sequence)
    const startedAtIso = startedAt.toISOString()
    const order: PosOrder = {
      id: orderId,
      source: 'counter',
      mode,
      customerName: '現場客',
      customerPhone: '',
      deliveryAddress: '',
      requestedFulfillmentAt: null,
      note: '',
      lines: [],
      subtotal: 0,
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      status: 'new',
      createdAt: startedAtIso,
      claimedBy: stationClaimId,
      claimedAt: startedAtIso,
      claimExpiresAt: claimExpiresIn(),
      printStatus: 'skipped',
      printJobs: [],
    }

    clearCart()
    resetCustomerDraft()
    paymentMethod.value = 'cash'
    serviceMode.value = mode
    counterDraftOrderId.value = orderId
    counterDraftStartedAt.value = startedAtIso
    nextSequence.value = sequence + 1
    rememberLocalCounterOrder(order)
  }

  const appendCustomerNote = (note: string): void => {
    const nextNote = note.trim()
    if (!nextNote) {
      return
    }

    const currentNote = customer.note.trim()
    if (!currentNote) {
      customer.note = nextNote
      return
    }

    const existingNotes = currentNote
      .split(/[、，,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)

    if (existingNotes.includes(nextNote)) {
      return
    }

    customer.note = `${currentNote}、${nextNote}`
  }

  const mergePrintJobs = (order: PosOrder, printJobs: PrintJob[]): PrintJob[] => {
    const mergedPrintJobs = new Map<string, PrintJob>()
    for (const printJob of order.printJobs) {
      mergedPrintJobs.set(printJob.id, printJob)
    }

    for (const printJob of printJobs) {
      mergedPrintJobs.set(printJob.id, printJob)
    }

    return [...mergedPrintJobs.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }

  const replaceOrder = (orderId: string, nextOrder: PosOrder): void => {
    orderQueue.value = orderQueue.value.map((order) => (order.id === orderId ? nextOrder : order))

    if (pendingLocalOrders.value.some((order) => order.id === orderId)) {
      pendingLocalOrders.value = pendingLocalOrders.value.map((order) => (order.id === orderId ? nextOrder : order))
      writePendingLocalOrders(pendingLocalOrders.value)
    }

    if (localCounterOrders.value.some((order) => order.id === orderId)) {
      localCounterOrders.value = localCounterOrders.value.map((order) => (order.id === orderId ? nextOrder : order))
      writeLocalCounterOrders(localCounterOrders.value)
    }
  }

  const removeLocalCounterOrder = (orderId: string): void => {
    localCounterOrders.value = localCounterOrders.value.filter((order) => order.id !== orderId)
    writeLocalCounterOrders(localCounterOrders.value)
  }

  const rememberLocalCounterOrder = (order: PosOrder): void => {
    if (order.remoteId) {
      removeLocalCounterOrder(order.id)
      return
    }

    localCounterOrders.value = [
      order,
      ...localCounterOrders.value.filter((entry) => entry.id !== order.id),
    ].slice(0, 50)
    writeLocalCounterOrders(localCounterOrders.value)
    orderQueue.value = [order, ...orderQueue.value.filter((entry) => entry.id !== order.id)]
  }

  const clearCounterOrderFromLocalStores = (orderId: string): void => {
    pendingLocalOrders.value = pendingLocalOrders.value.filter((order) => order.id !== orderId)
    localCounterOrders.value = localCounterOrders.value.filter((order) => order.id !== orderId)
    writePendingLocalOrders(pendingLocalOrders.value)
    writeLocalCounterOrders(localCounterOrders.value)
  }

  const rememberPendingLocalOrder = (order: PosOrder): void => {
    if (order.remoteId) {
      return
    }

    removeLocalCounterOrder(order.id)
    pendingLocalOrders.value = [
      order,
      ...pendingLocalOrders.value.filter((entry) => entry.id !== order.id),
    ].slice(0, 50)
    writePendingLocalOrders(pendingLocalOrders.value)
    orderQueue.value = mergeLocalPendingOrders(pendingLocalOrders.value, orderQueue.value)
  }

  const syncActiveCounterOrderSnapshot = (): void => {
    const orderId = counterDraftOrderId.value
    if (!orderId) {
      return
    }

    const currentOrder = orderQueue.value.find((order) => order.id === orderId)
    if (!currentOrder || ['served', 'voided', 'failed'].includes(currentOrder.status)) {
      return
    }

    const now = new Date().toISOString()
    const nextPaymentStatus = ['pending', 'authorized'].includes(currentOrder.paymentStatus)
      ? paymentStatusFor(paymentMethod.value)
      : currentOrder.paymentStatus
    const nextOrder: PosOrder = {
      ...currentOrder,
      mode: serviceMode.value,
      customerName: customer.name.trim() || '現場客',
      customerPhone: customer.phone.trim(),
      deliveryAddress: serviceMode.value === 'delivery' ? customer.deliveryAddress.trim() : '',
      requestedFulfillmentAt: toRequestedFulfillmentIso(customer.requestedFulfillmentAt),
      note: customer.note.trim(),
      lines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
      subtotal: cartTotal.value,
      paymentMethod: paymentMethod.value,
      paymentStatus: nextPaymentStatus,
      claimedBy: currentOrder.claimedBy ?? stationClaimId,
      claimedAt: currentOrder.claimedAt ?? now,
      claimExpiresAt: currentOrder.claimExpiresAt ?? claimExpiresIn(),
    }

    replaceOrder(orderId, nextOrder)
    if (!nextOrder.remoteId) {
      rememberLocalCounterOrder(nextOrder)
    }
  }

  watch(
    [cartLines, serviceMode, paymentMethod, customer, counterDraftOrderId, counterDraftStartedAt],
    () => {
      writeCounterDraft({
        cartLines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
        customer: { ...customer },
        draftOrderId: counterDraftOrderId.value,
        draftStartedAt: counterDraftOrderId.value ? counterDraftStartedAt.value : null,
        paymentMethod: paymentMethod.value,
        serviceMode: serviceMode.value,
      })
      syncActiveCounterOrderSnapshot()
    },
    { deep: true, immediate: true },
  )

  const applyRemoteOrders = (remoteOrders: PosOrder[]): void => {
    const remoteOrderIds = new Set(remoteOrders.map((order) => order.id))
    const nextPendingOrders = pendingLocalOrders.value.filter((order) => !remoteOrderIds.has(order.id))
    const nextLocalCounterOrders = localCounterOrders.value.filter((order) =>
      !remoteOrderIds.has(order.id) && !['served', 'voided', 'failed'].includes(order.status),
    )

    if (nextPendingOrders.length !== pendingLocalOrders.value.length) {
      pendingLocalOrders.value = nextPendingOrders
      writePendingLocalOrders(pendingLocalOrders.value)
    }

    if (nextLocalCounterOrders.length !== localCounterOrders.value.length) {
      localCounterOrders.value = nextLocalCounterOrders
      writeLocalCounterOrders(localCounterOrders.value)
    }

    orderQueue.value = mergeLocalCounterOrders(localCounterOrders.value, mergeLocalPendingOrders(pendingLocalOrders.value, remoteOrders))
  }

  const syncPendingLocalOrders = async (): Promise<number> => {
    if (!isPosApiConfigured || pendingLocalOrders.value.length === 0) {
      return 0
    }

    const stillPendingOrders: PosOrder[] = []
    let syncedCount = 0

    for (const order of pendingLocalOrders.value) {
      if (order.status === 'voided') {
        stillPendingOrders.push(order)
        continue
      }

      try {
        const persistedOrder = await createOrder(order)
        if (order.status !== 'new') {
          await persistOrderStatus(persistedOrder, order.status)
        }
        syncedCount += 1
      } catch {
        stillPendingOrders.push(order)
      }
    }

    if (syncedCount > 0 || stillPendingOrders.length !== pendingLocalOrders.value.length) {
      pendingLocalOrders.value = stillPendingOrders
      writePendingLocalOrders(pendingLocalOrders.value)
    }

    return syncedCount
  }

  const pendingLocalOrderDetail = (): string =>
    pendingLocalOrders.value.length > 0 ? `，另有 ${pendingLocalOrders.value.length} 張本機待同步` : ''

  const syncedLocalOrderDetail = (count: number): string => (count > 0 ? `，已補同步 ${count} 張本機訂單` : '')

  const orderClaimedByCurrentStation = (order: PosOrder): boolean =>
    Boolean(order.claimedBy) && order.claimedBy === stationClaimId && !isClaimExpired(order)

  const orderClaimedByOtherStation = (order: PosOrder): boolean =>
    Boolean(order.claimedBy) && order.claimedBy !== stationClaimId && !isClaimExpired(order)

  const orderPendingSync = (order: PosOrder): boolean =>
    pendingLocalOrders.value.some((entry) => entry.id === order.id)

  const claimLabelFor = (order: PosOrder): string => {
    if (!order.claimedBy) {
      return ''
    }

    if (isClaimExpired(order)) {
      return '鎖定逾時'
    }

    if (order.claimedBy === stationClaimId) {
      return '本機處理中'
    }

    return '其他平板處理中'
  }

  const claimOrderForStation = async (orderId: string, force = false): Promise<boolean> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return false
    }

    if (orderClaimedByCurrentStation(order) && !force) {
      return true
    }

    claimingOrderId.value = orderId

    if (!isPosApiConfigured || !order.remoteId) {
      replaceOrder(order.id, {
        ...order,
        claimedBy: stationClaimId,
        claimedAt: new Date().toISOString(),
        claimExpiresAt: claimExpiresIn(),
      })
      claimingOrderId.value = null
      return true
    }

    try {
      const claimedOrder = await claimOrder(order, force)
      replaceOrder(order.id, {
        ...claimedOrder,
        lines: claimedOrder.lines.length > 0 ? claimedOrder.lines : order.lines,
        printStatus: claimedOrder.printStatus === 'skipped' ? order.printStatus : claimedOrder.printStatus,
      })
      setBackendStatus('connected', '訂單已鎖定', `${order.id} 由 ${stationClaimLabel} 處理`)
      return true
    } catch (error) {
      setBackendStatus('fallback', '鎖定失敗', `${order.id} 無法鎖定：${getErrorMessage(error)}`)
      return false
    } finally {
      claimingOrderId.value = null
    }
  }

  const releaseOrderClaimForStation = async (orderId: string): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order || !orderClaimedByCurrentStation(order)) {
      return
    }

    claimingOrderId.value = orderId

    if (!isPosApiConfigured || !order.remoteId) {
      replaceOrder(order.id, { ...order, claimedBy: null, claimedAt: null, claimExpiresAt: null })
      claimingOrderId.value = null
      return
    }

    try {
      const releasedOrder = await releaseOrderClaim(order)
      replaceOrder(order.id, {
        ...releasedOrder,
        lines: releasedOrder.lines.length > 0 ? releasedOrder.lines : order.lines,
        printStatus: releasedOrder.printStatus === 'skipped' ? order.printStatus : releasedOrder.printStatus,
      })
      setBackendStatus('connected', '訂單已釋放', `${order.id} 已解除平板鎖定`)
    } catch (error) {
      setBackendStatus('fallback', '釋放失敗', `${order.id} 釋放失敗：${getErrorMessage(error)}`)
    } finally {
      claimingOrderId.value = null
    }
  }

  const applySavedProduct = (product: MenuItem): void => {
    if (isLocalProduct(product)) {
      const savedProducts = readLocalProducts()
      writeLocalProducts(
        savedProducts.some((entry) => entry.id === product.id)
          ? savedProducts.map((entry) => (entry.id === product.id ? product : entry))
          : [...savedProducts, product],
      )
    }

    productStatusCatalog.value = sortProducts(
      productStatusCatalog.value.some((entry) => entry.id === product.id)
        ? productStatusCatalog.value.map((entry) => (entry.id === product.id ? product : entry))
        : [...productStatusCatalog.value, product],
    )

    const shouldShowInPos = isProductOrderable(product)
    if (!shouldShowInPos) {
      menuCatalog.value = menuCatalog.value.filter((entry) => entry.id !== product.id)
      cartLines.value = cartLines.value.filter((line) => line.itemId !== product.id && line.productId !== product.id)
      return
    }

    menuCatalog.value = sortProducts(
      menuCatalog.value.some((entry) => entry.id === product.id)
        ? menuCatalog.value.map((entry) => (entry.id === product.id ? product : entry))
        : [...menuCatalog.value, product],
    )
  }

  const removeSavedProduct = (productId: string): void => {
    writeLocalProducts(readLocalProducts().filter((product) => product.id !== productId))
    productStatusCatalog.value = productStatusCatalog.value.filter((entry) => entry.id !== productId)
    menuCatalog.value = menuCatalog.value.filter((entry) => entry.id !== productId)
    cartLines.value = cartLines.value.filter((line) => line.itemId !== productId && line.productId !== productId)
  }

  const restoreSupplyProductSnapshot = (products: MenuItem[]): void => {
    const restoredProducts = sortProducts(products.map((product) => ({ ...product, tags: [...product.tags] })))
    productStatusCatalog.value = restoredProducts
    menuCatalog.value = sortProducts(restoredProducts.filter(isProductOrderable))
    writeLocalProducts(restoredProducts.filter(isLocalProduct))
    cartLines.value = cartLines.value.filter((line) =>
      restoredProducts.some((product) => product.id === line.itemId || product.id === line.productId),
    )
  }

  const appendPrintPreviewStatus = (message: string): void => {
    lastPrintPreview.value = `${lastPrintPreview.value}\n${message}`
  }

  const tryNativeLanPrint = async (
    payload: string,
    station: PrintStation = printStation,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!isNativeLanPrinterAvailable()) {
      appendPrintPreviewStatus(`STATUS ${lanPrinterModeLabel()}，尚未送出 TCP payload`)
      return { ok: false, error: 'native LAN printer is not available' }
    }

    try {
      const result = await sendLanPrintPayload(station, payload)
      appendPrintPreviewStatus(`STATUS ${station.name} 已送出 ${result.bytesWritten} bytes，耗時 ${result.elapsedMs}ms`)
      return { ok: true }
    } catch (error) {
      const message = getErrorMessage(error)
      if (station.id === printStation.id) {
        printStation.online = false
      }
      appendPrintPreviewStatus(`STATUS ${station.name} TCP 列印失敗：${message}`)
      return { ok: false, error: message }
    }
  }

  const refreshBackendData = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      setBackendStatus('fallback', '本機模式', '尚未設定 Supabase URL 或 anon key')
      return
    }

    setBackendStatus('syncing', 'API 同步中', '正在載入商品與訂單')

    try {
      const syncedLocalCount = await syncPendingLocalOrders()
      const [remoteProducts, remoteOrders, currentRegisterSession, runtimeSettings] = await Promise.all([
        fetchProducts(),
        fetchOrders(),
        fetchCurrentRegisterSession(),
        fetchRuntimeSettings(),
      ])
      applyRuntimeSettings(runtimeSettings)
      const localProducts = readLocalProducts()
      const allProducts = [...remoteProducts, ...localProducts]
      menuCatalog.value = sortProducts(allProducts)
      productStatusCatalog.value = sortProducts(allProducts)
      applyRemoteOrders(remoteOrders)
      applyRegisterSession(currentRegisterSession)
      syncNextSequenceFromQueue()
      setBackendStatus(
        'connected',
        'API 已同步',
        `已載入 ${remoteProducts.length} 個商品、${remoteOrders.length} 張遠端訂單${syncedLocalOrderDetail(syncedLocalCount)}${pendingLocalOrderDetail()}`,
      )
    } catch (error) {
      setBackendStatus('fallback', '本機模式', `POS API 載入失敗：${getErrorMessage(error)}`)
    }
  }

  const refreshProductCatalog = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      return
    }

    try {
      const remoteProducts = await fetchProducts()
      const localProducts = readLocalProducts()
      const allProducts = [...remoteProducts, ...localProducts]
      menuCatalog.value = sortProducts(allProducts)
      productStatusCatalog.value = sortProducts(allProducts)
    } catch {
      return
    }
  }

  const refreshQueueState = async (quiet = false): Promise<void> => {
    if (!isPosApiConfigured) {
      if (!quiet) {
        setBackendStatus('fallback', '本機模式', '尚未設定 Supabase URL 或 anon key')
      }
      return
    }

    if (
      isSubmitting.value ||
      printingOrderId.value ||
      claimingOrderId.value ||
      updatingPaymentOrderId.value ||
      voidingOrderId.value ||
      refundingOrderId.value
    ) {
      return
    }

    if (!quiet) {
      setBackendStatus('syncing', 'API 同步中', '正在更新訂單佇列')
    }

    try {
      const syncedLocalCount = await syncPendingLocalOrders()
      const [remoteOrders, currentRegisterSession, runtimeSettings] = await Promise.all([
        fetchOrders(),
        fetchCurrentRegisterSession(),
        fetchRuntimeSettings().catch(() => null),
      ])
      if (runtimeSettings) {
        applyRuntimeSettings(runtimeSettings)
      }
      applyRemoteOrders(remoteOrders)
      applyRegisterSession(currentRegisterSession)
      syncNextSequenceFromQueue()
      setBackendStatus(
        'connected',
        quiet ? '自動同步完成' : 'API 已同步',
        `已更新 ${remoteOrders.length} 張遠端訂單${syncedLocalOrderDetail(syncedLocalCount)}${pendingLocalOrderDetail()}`,
      )
    } catch (error) {
      setBackendStatus('fallback', '同步失敗', `訂單佇列同步失敗：${getErrorMessage(error)}`)
    }
  }

  const createCartLine = (
    item: MenuItem,
    quantity: number,
    options: string[] = item.tags.slice(0, 1),
    unitPrice = item.price,
    itemId = item.id,
  ): CartLine => {
    const nextLine: CartLine = {
      itemId,
      productSku: item.sku,
      category: item.category,
      name: item.name,
      unitPrice,
      quantity,
      options,
      prepStation: item.prepStation,
      printLabel: item.printLabel,
    }

    if (item.id !== item.sku || itemId !== item.id) {
      nextLine.productId = item.id
    }

    return nextLine
  }

  const normalizeCartQuantity = (quantity: number): number => {
    if (!Number.isFinite(quantity)) {
      return 0
    }

    return Math.min(maxCartLineQuantity, Math.max(0, Math.trunc(quantity)))
  }

  const setItemQuantity = (item: MenuItem, quantity: number): void => {
    const nextQuantity = normalizeCartQuantity(quantity)
    const existing = cartLines.value.find((line) => line.itemId === item.id)

    if (nextQuantity === 0) {
      cartLines.value = cartLines.value.filter((line) => line.itemId !== item.id)
      return
    }

    rememberRecentItem(item.id)

    if (existing) {
      existing.quantity = nextQuantity
      return
    }

    cartLines.value.push(createCartLine(item, nextQuantity))
  }

  const setLineQuantity = (itemId: string, quantity: number): void => {
    const nextQuantity = normalizeCartQuantity(quantity)
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (!line) {
      return
    }

    if (nextQuantity === 0) {
      cartLines.value = cartLines.value.filter((entry) => entry.itemId !== itemId)
      return
    }

    line.quantity = nextQuantity
  }

  const addItem = (item: MenuItem): void => {
    setItemQuantity(item, (cartLines.value.find((line) => line.itemId === item.id)?.quantity ?? 0) + 1)
  }

  const addConfiguredItem = (item: MenuItem, options: string[], priceAdjustment = 0): void => {
    const normalizedOptions = options.filter((option) => option.trim().length > 0)
    const variantKey = [item.id, ...normalizedOptions].join('::')
    const unitPrice = Math.max(0, item.price + priceAdjustment)
    const existing = cartLines.value.find((line) => line.itemId === variantKey)

    rememberRecentItem(item.id)

    if (existing) {
      existing.quantity = normalizeCartQuantity(existing.quantity + 1)
      return
    }

    cartLines.value.push(createCartLine(item, 1, normalizedOptions, unitPrice, variantKey))
  }

  const updateConfiguredLine = (lineItemId: string, item: MenuItem, options: string[], priceAdjustment = 0): void => {
    const currentLine = cartLines.value.find((line) => line.itemId === lineItemId)
    if (!currentLine) {
      return
    }

    const normalizedOptions = options.filter((option) => option.trim().length > 0)
    const variantKey = [item.id, ...normalizedOptions].join('::')
    const unitPrice = Math.max(0, item.price + priceAdjustment)
    const existing = cartLines.value.find((line) => line.itemId === variantKey && line.itemId !== lineItemId)

    rememberRecentItem(item.id)

    if (existing) {
      existing.quantity = normalizeCartQuantity(existing.quantity + currentLine.quantity)
      cartLines.value = cartLines.value.filter((line) => line.itemId !== lineItemId)
      return
    }

    cartLines.value = cartLines.value.map((line) =>
      line.itemId === lineItemId
        ? createCartLine(item, currentLine.quantity, normalizedOptions, unitPrice, variantKey)
        : line,
    )
  }

  const increaseLine = (itemId: string): void => {
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (line) {
      setLineQuantity(itemId, line.quantity + 1)
    }
  }

  const decreaseLine = (itemId: string): void => {
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (!line) {
      return
    }

    setLineQuantity(itemId, line.quantity - 1)
  }

  const clearCart = (): void => {
    cartLines.value = []
  }

  const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }
    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }
    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }
    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    const previousStatus = claimedOrder.status
    claimedOrder.status = status

    if (!isPosApiConfigured || !claimedOrder.remoteId) {
      return
    }

    try {
      const persistedOrder = await persistOrderStatus(claimedOrder, status)
      replaceOrder(orderId, {
        ...persistedOrder,
        lines: persistedOrder.lines.length > 0 ? persistedOrder.lines : claimedOrder.lines,
        printStatus: persistedOrder.printStatus === 'skipped' ? claimedOrder.printStatus : persistedOrder.printStatus,
      })
      setBackendStatus('connected', 'API 已同步', `${orderId} 已更新為 ${status}`)
    } catch (error) {
      claimedOrder.status = previousStatus
      setBackendStatus('fallback', '本機模式', `訂單狀態同步失敗：${getErrorMessage(error)}`)
    }
  }

  const updatePaymentStatus = async (orderId: string, paymentStatus: PaymentStatus): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }
    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }
    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    const previousPaymentStatus = claimedOrder.paymentStatus
    claimedOrder.paymentStatus = paymentStatus
    updatingPaymentOrderId.value = orderId

    if (!isPosApiConfigured || !claimedOrder.remoteId) {
      updatingPaymentOrderId.value = null
      return
    }

    try {
      const persistedOrder = await persistOrderPaymentStatus(claimedOrder, paymentStatus)
      replaceOrder(orderId, {
        ...persistedOrder,
        lines: persistedOrder.lines.length > 0 ? persistedOrder.lines : claimedOrder.lines,
        printStatus: persistedOrder.printStatus === 'skipped' ? claimedOrder.printStatus : persistedOrder.printStatus,
      })
      setBackendStatus('connected', '收款已同步', `${orderId} 已更新為 ${paymentStatus}`)
      void loadRegisterSession()
    } catch (error) {
      claimedOrder.paymentStatus = previousPaymentStatus
      setBackendStatus('fallback', '收款失敗', `付款狀態同步失敗：${getErrorMessage(error)}`)
    } finally {
      updatingPaymentOrderId.value = null
    }
  }

  const voidOrderForStation = async (adminPin: string, orderId: string, note = ''): Promise<void> => {
    if (!adminPin) {
      setBackendStatus('fallback', '需要管理 PIN', '請先在前台操作區輸入管理 PIN')
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (order.paymentStatus !== 'pending') {
      setBackendStatus('fallback', '不可作廢', `${order.id} 已收款，需先接退款流程`)
      return
    }

    if (order.status === 'served' || order.status === 'voided') {
      setBackendStatus('fallback', '不可作廢', `${order.id} 已交付或已作廢`)
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    voidingOrderId.value = orderId

    try {
      const voidedOrder = await voidOrder(adminPin, claimedOrder, note)
      replaceOrder(orderId, {
        ...voidedOrder,
        lines: voidedOrder.lines.length > 0 ? voidedOrder.lines : claimedOrder.lines,
        printStatus: voidedOrder.printStatus === 'skipped' ? claimedOrder.printStatus : voidedOrder.printStatus,
      })
      setBackendStatus('connected', '訂單已作廢', `${orderId} 已排除關帳統計`)
      void loadRegisterSession()
    } catch (error) {
      setBackendStatus('fallback', '作廢失敗', `${orderId} 作廢失敗：${getErrorMessage(error)}`)
    } finally {
      voidingOrderId.value = null
    }
  }

  const refundOrderForStation = async (adminPin: string, orderId: string, note = ''): Promise<void> => {
    if (!adminPin) {
      setBackendStatus('fallback', '需要管理 PIN', '請先在前台操作區輸入管理 PIN')
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (!['authorized', 'paid'].includes(order.paymentStatus)) {
      setBackendStatus('fallback', '不可退款', `${order.id} 尚未收款或已處理退款`)
      return
    }

    if (order.status === 'failed' || order.status === 'voided') {
      setBackendStatus('fallback', '不可退款', `${order.id} 已異常或已作廢`)
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    refundingOrderId.value = orderId

    try {
      const refundedOrder = await refundOrder(adminPin, claimedOrder, note)
      replaceOrder(orderId, {
        ...refundedOrder,
        lines: refundedOrder.lines.length > 0 ? refundedOrder.lines : claimedOrder.lines,
        printStatus: refundedOrder.printStatus === 'skipped' ? claimedOrder.printStatus : refundedOrder.printStatus,
      })
      setBackendStatus('connected', '訂單已退款', `${orderId} 已建立退款流水並排除銷售`)
      void loadRegisterSession()
    } catch (error) {
      setBackendStatus('fallback', '退款失敗', `${orderId} 退款失敗：${getErrorMessage(error)}`)
    } finally {
      refundingOrderId.value = null
    }
  }

  const printOrder = async (orderId: string): Promise<void> => {
    if (printingOrderId.value) {
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }
    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }
    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    printingOrderId.value = orderId
    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    const printPlan = buildOrderPrintPlan(claimedOrder, currentPrinterSettings())
    lastPrintPreview.value = printPlan.preview

    if (printPlan.jobs.length === 0) {
      const nextOrder = { ...claimedOrder, printStatus: 'skipped' as const }
      replaceOrder(order.id, nextOrder)
      setBackendStatus('connected', '出單略過', printPlan.skippedReason ?? '沒有建立列印任務')
      printingOrderId.value = null
      return
    }

    printStation.lastPrintAt = new Date().toISOString()
    const printStatuses: PrintStatus[] = []
    const createdPrintJobs: PrintJob[] = []

    try {
      for (const job of printPlan.jobs) {
        let jobStatus: PrintStatus = 'queued'
        let printJobId: string | null = null

        if (isPosApiConfigured && order.remoteId) {
          const printJob = await createPrintJob(claimedOrder, job.payload, job.station)
          jobStatus = printJob.status
          printJobId = printJob.id
          createdPrintJobs.push(printJob)
        }

        if (isNativeLanPrinterAvailable()) {
          const printResult = await tryNativeLanPrint(job.payload, job.station)
          jobStatus = printResult.ok ? 'printed' : 'failed'

          if (printJobId) {
            const updatedPrintJob = await updatePrintJobStatus(
              printJobId,
              printResult.ok ? 'printed' : 'failed',
              printResult.ok ? undefined : printResult.error,
            )
            jobStatus = updatedPrintJob.status
            createdPrintJobs.push(updatedPrintJob)
          }
        }

        printStatuses.push(jobStatus)
      }

      const nextPrintStatus = summarizePrintStatuses(printStatuses)
      replaceOrder(order.id, {
        ...claimedOrder,
        printStatus: nextPrintStatus,
        printJobs: mergePrintJobs(claimedOrder, createdPrintJobs),
      })

      if (!isNativeLanPrinterAvailable()) {
        appendPrintPreviewStatus(`STATUS ${lanPrinterModeLabel()}，已準備 ${printPlan.jobs.length} 筆出單資料`)
      }

      setBackendStatus(
        'connected',
        '出單完成',
        nextPrintStatus === 'printed'
          ? `${order.id} 已完成 ${printPlan.jobs.length} 筆列印`
          : `${order.id} 出單狀態：${nextPrintStatus}`,
      )
    } catch (error) {
      replaceOrder(order.id, {
        ...claimedOrder,
        printStatus: 'failed',
        printJobs: mergePrintJobs(claimedOrder, createdPrintJobs),
      })
      setBackendStatus('fallback', '出單失敗', `${order.id} 出單失敗：${getErrorMessage(error)}`)
    } finally {
      printingOrderId.value = null
    }
  }

  const deletePrintJobForOrder = async (orderId: string, printJobId: string): Promise<void> => {
    if (deletingPrintJobId.value) {
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    deletingPrintJobId.value = printJobId

    try {
      if (isPosApiConfigured && order.remoteId) {
        await deletePrintJob(printJobId)
      }

      const currentOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
      const nextPrintJobs = currentOrder.printJobs.filter((printJob) => printJob.id !== printJobId)
      replaceOrder(order.id, {
        ...currentOrder,
        printJobs: nextPrintJobs,
        printStatus: summarizePrintJobs(nextPrintJobs),
      })
      setBackendStatus('connected', '列印單已刪除', `${order.id} 已移除 1 筆列印單`)
    } catch (error) {
      setBackendStatus('fallback', '列印單刪除失敗', `${order.id} 刪除失敗：${getErrorMessage(error)}`)
    } finally {
      deletingPrintJobId.value = null
    }
  }

  const loadProductStatusCatalog = async (adminPin: string): Promise<void> => {
    if (!adminPin) {
      productStatusMessage.value = '請先輸入管理 PIN'
      return
    }

    isLoadingProductStatus.value = true
    productStatusMessage.value = '載入完整商品狀態中'

    try {
      const products = await fetchAdminProducts(adminPin)
      productStatusCatalog.value = sortProducts([...products, ...readLocalProducts()].filter((product) => product.posVisible))
      productStatusMessage.value = `已載入 ${productStatusCatalog.value.length} 個 POS 商品，可直接暫停或恢復供應`
    } catch (error) {
      productStatusMessage.value = `商品狀態載入失敗：${getErrorMessage(error)}`
    } finally {
      isLoadingProductStatus.value = false
    }
  }

  const updateProductAvailability = async (
    adminPin: string,
    productId: string,
    isAvailable: boolean,
  ): Promise<void> => {
    if (!adminPin) {
      productStatusMessage.value = '請先輸入管理 PIN'
      return
    }

    const product = productStatusCatalog.value.find((entry) => entry.id === productId)
      ?? menuCatalog.value.find((entry) => entry.id === productId)
    if (!product) {
      productStatusMessage.value = '找不到商品資料，請重新載入'
      return
    }

    togglingProductId.value = productId
    const optimisticProduct = { ...product, available: isAvailable }
    applySavedProduct(optimisticProduct)
    productStatusMessage.value = `${product.name} ${isAvailable ? '恢復供應中' : '暫停供應中'}`

    try {
      const savedProduct = await updateProduct(adminPin, productId, productToUpdateInput(product, { isAvailable }))
      applySavedProduct(savedProduct)
      productStatusMessage.value = `${savedProduct.name} 已${savedProduct.available ? '恢復供應' : '暫停供應'}`
      setBackendStatus('connected', 'API 已同步', productStatusMessage.value)
    } catch (error) {
      applySavedProduct(product)
      productStatusMessage.value = `商品狀態更新失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '本機模式', productStatusMessage.value)
    } finally {
      togglingProductId.value = null
    }
  }

  const updateProductSupplyStatus = async (
    adminPin: string,
    productId: string,
    status: ProductSupplyStatus,
  ): Promise<void> => {
    const product = productStatusCatalog.value.find((entry) => entry.id === productId)
      ?? menuCatalog.value.find((entry) => entry.id === productId)
    if (!product) {
      productStatusMessage.value = '找不到商品資料，請重新載入'
      return
    }

    const statusLabel = status === 'normal' ? '正常供應' : status === 'online-stopped' ? '線上停售' : '全部停售'
    togglingProductId.value = productId
    applySavedProduct(applyProductSupplyStatus(product, status))
    productStatusMessage.value = `${product.name} 已在本機標記為${statusLabel}`

    if (!adminPin) {
      togglingProductId.value = null
      setBackendStatus('fallback', '本機供應狀態', '輸入管理 PIN 後可同步雲端商品狀態')
      return
    }

    try {
      const savedProduct = await updateProduct(adminPin, productId, productToUpdateInput(product, productSupplyOverrides(status)))
      applySavedProduct(savedProduct)
      productStatusMessage.value = `${savedProduct.name} 已更新為${statusLabel}`
      setBackendStatus('connected', 'API 已同步', productStatusMessage.value)
    } catch (error) {
      applySavedProduct(product)
      productStatusMessage.value = `商品狀態更新失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '本機模式', productStatusMessage.value)
    } finally {
      togglingProductId.value = null
    }
  }

  const createProductForStation = async (
    adminPin: string,
    input: ProductUpdateInput,
  ): Promise<MenuItem | null> => {
    const fallbackProduct = buildLocalProduct(input)
    productStatusMessage.value = `${fallbackProduct.name} 建立中`

    if (!adminPin || !isPosApiConfigured) {
      applySavedProduct(fallbackProduct)
      productStatusMessage.value = `${fallbackProduct.name} 已新增至本機商品清單`
      setBackendStatus('fallback', '本機新增商品', '輸入管理 PIN 後可同步雲端商品資料')
      return fallbackProduct
    }

    try {
      const savedProduct = await createProduct(adminPin, input)
      applySavedProduct(savedProduct)
      productStatusMessage.value = `${savedProduct.name} 已新增`
      setBackendStatus('connected', 'API 已同步', productStatusMessage.value)
      return savedProduct
    } catch (error) {
      applySavedProduct(fallbackProduct)
      productStatusMessage.value = `商品新增失敗，已先保留本機資料：${getErrorMessage(error)}`
      setBackendStatus('fallback', '本機新增商品', productStatusMessage.value)
      return fallbackProduct
    }
  }

  const deleteProductForStation = async (adminPin: string, productId: string): Promise<boolean> => {
    const product = productStatusCatalog.value.find((entry) => entry.id === productId)
      ?? menuCatalog.value.find((entry) => entry.id === productId)
    if (!product) {
      productStatusMessage.value = '找不到商品資料，請重新載入'
      return false
    }

    togglingProductId.value = productId
    productStatusMessage.value = `${product.name} 刪除中`

    if (!adminPin || !isPosApiConfigured || product.id.startsWith('local-')) {
      removeSavedProduct(productId)
      togglingProductId.value = null
      productStatusMessage.value = `${product.name} 已從本機清單刪除`
      setBackendStatus('fallback', '本機刪除商品', '輸入管理 PIN 後可同步雲端商品資料')
      return true
    }

    try {
      await deleteProduct(adminPin, productId)
      removeSavedProduct(productId)
      productStatusMessage.value = `${product.name} 已刪除`
      setBackendStatus('connected', 'API 已同步', productStatusMessage.value)
      return true
    } catch (error) {
      productStatusMessage.value = `商品刪除失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '本機模式', productStatusMessage.value)
      return false
    } finally {
      togglingProductId.value = null
    }
  }

  const readRegisterCashAmount = (value: number): number | null => {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return null
    }

    return value
  }

  const loadRegisterSession = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      registerMessage.value = '本機模式未啟用雲端開班資料'
      return
    }

    try {
      applyRegisterSession(await fetchCurrentRegisterSession())
      registerMessage.value = registerSession.value
        ? `已載入${registerSession.value.status === 'open' ? '營業中' : '已關班'}班別`
        : '尚未開班'
    } catch (error) {
      registerMessage.value = `開班資料載入失敗：${getErrorMessage(error)}`
    }
  }

  const openRegisterSessionForStation = async (
    adminPin: string,
    openingCashValue: number,
    note: string,
  ): Promise<void> => {
    if (!adminPin) {
      registerMessage.value = '請先輸入管理 PIN'
      return
    }

    const openingCash = readRegisterCashAmount(openingCashValue)
    if (openingCash === null) {
      registerMessage.value = '開班現金需為 0 以上整數'
      return
    }

    if (!isPosApiConfigured) {
      registerMessage.value = '本機模式無法建立雲端班別'
      return
    }

    isRegisterBusy.value = true
    registerMessage.value = '開班中'

    try {
      const session = await openRegisterSession(adminPin, openingCash, note)
      applyRegisterSession(session)
      registerMessage.value = `已開班，預期現金 ${session.expectedCash}`
      setBackendStatus('connected', '班別已開啟', `${stationClaimLabel} 已開班`)
    } catch (error) {
      registerMessage.value = `開班失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '開班失敗', registerMessage.value)
    } finally {
      isRegisterBusy.value = false
    }
  }

  const closeRegisterSessionForStation = async (
    adminPin: string,
    closingCashValue: number,
    note: string,
    force = false,
  ): Promise<void> => {
    if (!adminPin) {
      registerMessage.value = '請先輸入管理 PIN'
      return
    }

    const closingCash = readRegisterCashAmount(closingCashValue)
    if (closingCash === null) {
      registerMessage.value = '關班現金需為 0 以上整數'
      return
    }

    if (!isPosApiConfigured) {
      registerMessage.value = '本機模式無法關閉雲端班別'
      return
    }

    isRegisterBusy.value = true
    registerMessage.value = '關班結算中'

    try {
      const session = await closeRegisterSession(adminPin, closingCash, note, force)
      applyRegisterSession(session)
      const variance = closingCash - session.expectedCash
      registerMessage.value = `已關班，現金差額 ${variance}`
      setBackendStatus('connected', '班別已關閉', `${stationClaimLabel} 已完成關班`)
    } catch (error) {
      registerMessage.value = `關班失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '關班失敗', registerMessage.value)
    } finally {
      isRegisterBusy.value = false
    }
  }

  const buildCounterOrderFromDraft = (now: Date): PosOrder => {
    const existingOrder = counterDraftOrderId.value
      ? orderQueue.value.find((order) => order.id === counterDraftOrderId.value)
      : null
    const draftOrderId = counterDraftOrderId.value
    const orderId = existingOrder?.id ?? draftOrderId ?? buildOrderId(now, nextSequence.value)
    const createdAt = existingOrder?.createdAt ?? counterDraftStartedAt.value ?? now.toISOString()
    const paymentStatus = existingOrder && !['pending', 'authorized'].includes(existingOrder.paymentStatus)
      ? existingOrder.paymentStatus
      : paymentStatusFor(paymentMethod.value)

    return {
      ...(existingOrder ?? {}),
      id: orderId,
      source: 'counter',
      mode: serviceMode.value,
      customerName: customer.name.trim() || '現場客',
      customerPhone: customer.phone.trim(),
      deliveryAddress: serviceMode.value === 'delivery' ? customer.deliveryAddress.trim() : '',
      requestedFulfillmentAt: toRequestedFulfillmentIso(customer.requestedFulfillmentAt),
      note: customer.note.trim(),
      lines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
      subtotal: cartTotal.value,
      paymentMethod: paymentMethod.value,
      paymentStatus,
      status: existingOrder?.status ?? 'new',
      createdAt,
      claimedBy: existingOrder?.claimedBy ?? stationClaimId,
      claimedAt: existingOrder?.claimedAt ?? now.toISOString(),
      claimExpiresAt: existingOrder?.claimExpiresAt ?? claimExpiresIn(),
      printStatus: existingOrder?.printStatus ?? 'skipped',
      printJobs: existingOrder?.printJobs ?? [],
    }
  }

  const finishCounterDraft = (): void => {
    clearCart()
    resetCustomerDraft()
    clearCounterDraftIdentity()
  }

  const saveCounterOrder = async (finish = true): Promise<PosOrder | null> => {
    if (cartLines.value.length === 0 || isSubmitting.value) {
      return null
    }

    if (serviceMode.value === 'delivery' && !customer.deliveryAddress.trim()) {
      setBackendStatus('fallback', '外送地址未填', '外送訂單需要地址，避免交付資訊只留在備註')
      return null
    }

    isSubmitting.value = true
    const now = new Date()
    const draftOrderId = counterDraftOrderId.value
    const draftSequence = sequenceFromOrderId(draftOrderId)
    const existingOrder = draftOrderId ? orderQueue.value.find((entry) => entry.id === draftOrderId) : null
    const order = buildCounterOrderFromDraft(now)
    const printPlan = buildOrderPrintPlan(order, currentPrinterSettings())
    order.printStatus = printPlan.jobs.length > 0 ? 'queued' : 'skipped'

    if (draftOrderId || existingOrder) {
      nextSequence.value = Math.max(nextSequence.value, draftSequence + 1)
    } else {
      nextSequence.value += 1
    }
    if (existingOrder) {
      replaceOrder(existingOrder.id, order)
    } else {
      orderQueue.value.unshift(order)
    }
    lastPrintPreview.value = printPlan.preview

    if (!isPosApiConfigured) {
      rememberPendingLocalOrder(order)
      if (printPlan.jobs.length > 0) {
        appendPrintPreviewStatus('STATUS 本機模式已產生列印 payload，尚未建立雲端 print_jobs')
      }
      setBackendStatus('fallback', '本機待同步', `${order.id} 已保留在平板，待 POS API 恢復後補同步`)
      if (finish) {
        finishCounterDraft()
      }
      isSubmitting.value = false
      return order
    }

    if (order.remoteId) {
      replaceOrder(order.id, order)
      setBackendStatus('connected', '訂單已更新', `${order.id} 已更新購物車內容`)
      if (finish) {
        finishCounterDraft()
      }
      isSubmitting.value = false
      return order
    }

    try {
      const persistedOrder = await createOrder(order)
      let nextOrder: PosOrder = {
        ...order,
        createdAt: persistedOrder.createdAt,
        lines: persistedOrder.lines.length > 0 ? persistedOrder.lines : order.lines,
      }

      if (persistedOrder.remoteId) {
        nextOrder.remoteId = persistedOrder.remoteId
      }

      let backendDetail = `${order.id} 已建立，${printPlan.jobs.length > 0 ? '可立即出單' : printPlan.skippedReason ?? '未建立列印任務'}`
      let claimSucceeded = true

      try {
        const claimedOrder = await claimOrder(nextOrder)
        nextOrder = {
          ...claimedOrder,
          lines: claimedOrder.lines.length > 0 ? claimedOrder.lines : nextOrder.lines,
          printStatus: claimedOrder.printStatus === 'skipped' ? nextOrder.printStatus : claimedOrder.printStatus,
        }
      } catch (error) {
        claimSucceeded = false
        backendDetail = `${order.id} 已建立，但平板鎖定失敗：${getErrorMessage(error)}`
      }

      replaceOrder(order.id, nextOrder)
      pendingLocalOrders.value = pendingLocalOrders.value.filter((entry) => entry.id !== order.id)
      writePendingLocalOrders(pendingLocalOrders.value)
      removeLocalCounterOrder(order.id)

      if (!claimSucceeded) {
        backendDetail = `${backendDetail}，但尚未取得平板鎖定`
      }

      setBackendStatus('connected', 'API 已同步', `${backendDetail}${pendingLocalOrderDetail()}`)
      void loadRegisterSession()
      void refreshProductCatalog()
      if (finish) {
        finishCounterDraft()
      }
      return nextOrder
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      if (isInventoryError(errorMessage)) {
        if (!existingOrder) {
          orderQueue.value = orderQueue.value.filter((entry) => entry.id !== order.id)
          if (!draftOrderId) {
            nextSequence.value = Math.max(1, nextSequence.value - 1)
          }
        }
        setBackendStatus('fallback', '庫存不足', `訂單未建立：${errorMessage}`)
        void refreshProductCatalog()
        return null
      }

      rememberPendingLocalOrder(order)
      setBackendStatus('fallback', '本機模式', `訂單保留在本機，雲端同步失敗：${errorMessage}`)
      if (finish) {
        finishCounterDraft()
      }
      return order
    } finally {
      isSubmitting.value = false
    }
  }

  const submitCounterOrder = async (): Promise<PosOrder | null> => {
    const order = await saveCounterOrder()
    if (!order) {
      return null
    }

    await printOrder(order.id)
    return orderQueue.value.find((entry) => entry.id === order.id) ?? order
  }

  const loadCounterOrderForEditing = async (orderId: string): Promise<boolean> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (
      !order ||
      order.source !== 'counter' ||
      !['pending', 'authorized'].includes(order.paymentStatus) ||
      ['served', 'voided', 'failed'].includes(order.status)
    ) {
      return false
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return false
    }

    const claimed = await claimOrderForStation(order.id)
    if (!claimed) {
      return false
    }

    const editableOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    serviceMode.value = editableOrder.mode
    paymentMethod.value = editableOrder.paymentMethod
    customer.name = editableOrder.customerName || '現場客'
    customer.phone = editableOrder.customerPhone
    customer.deliveryAddress = editableOrder.deliveryAddress
    customer.requestedFulfillmentAt = toDatetimeLocalInputValue(editableOrder.requestedFulfillmentAt)
    customer.note = editableOrder.note
    cartLines.value = editableOrder.lines.map((line) => ({ ...line, options: [...line.options] }))
    counterDraftOrderId.value = editableOrder.id
    counterDraftStartedAt.value = editableOrder.createdAt

    if (!editableOrder.remoteId) {
      rememberLocalCounterOrder(editableOrder)
    }

    setBackendStatus('connected', '訂單編輯中', `${editableOrder.id} 已載入購物車`)
    return true
  }

  const removeOrderFromQueue = (orderId: string): void => {
    orderQueue.value = orderQueue.value.filter((order) => order.id !== orderId)
    clearCounterOrderFromLocalStores(orderId)

    if (counterDraftOrderId.value === orderId) {
      clearCart()
      resetCustomerDraft()
      clearCounterDraftIdentity()
    }
  }

  const deleteOrderFromQueue = async (orderId: string): Promise<void> => {
    if (voidingOrderId.value) {
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    voidingOrderId.value = orderId

    try {
      if (isPosApiConfigured && order.remoteId) {
        await persistOrderStatus(order, 'voided')
      }

      removeOrderFromQueue(orderId)
      setBackendStatus('connected', '訂單已刪除', `${order.id} 已從桌況頁移除`)
      void loadRegisterSession()
    } catch (error) {
      removeOrderFromQueue(orderId)
      setBackendStatus('fallback', '本機刪除訂單', `${order.id} 已先從本機移除：${getErrorMessage(error)}`)
    } finally {
      voidingOrderId.value = null
    }
  }

  const sendPrinterHealthcheck = async (): Promise<void> => {
    const now = new Date()
    const payload = buildPrinterHealthcheckPayload(printStation, now)
    lastPrintPreview.value = buildPrinterHealthcheckPreview(printStation, payload)
    const result = await tryNativeLanPrint(payload, printStation)
    if (result.ok) {
      printStation.online = true
      printStation.lastPrintAt = now.toISOString()
    }
  }

  const syncStationHeartbeat = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      stationHeartbeatMessage.value = '本機模式未回報平板在線狀態'
      return
    }

    try {
      const station = await sendStationHeartbeat()
      stationHeartbeatMessage.value = `${station.stationLabel} 在線`
    } catch (error) {
      stationHeartbeatMessage.value = `平板心跳失敗：${getErrorMessage(error)}`
    }
  }

  const handleVisibilitySync = (): void => {
    if (globalThis.document?.visibilityState === 'visible') {
      onlineReminderClock.value = Date.now()
      maybePlayOnlineOrderReminder()
      void refreshQueueState(true)
      void syncStationHeartbeat()
    }
  }

  onMounted(() => {
    if (autoLoad) {
      void refreshBackendData()
      void syncStationHeartbeat()
      queueSyncTimer = globalThis.setInterval(() => {
        void refreshQueueState(true)
      }, queueSyncIntervalMs)
      stationHeartbeatTimer = globalThis.setInterval(() => {
        void syncStationHeartbeat()
      }, stationHeartbeatIntervalMs)
      onlineReminderClockTimer = globalThis.setInterval(() => {
        onlineReminderClock.value = Date.now()
      }, onlineReminderClockIntervalMs)
      globalThis.document?.addEventListener('visibilitychange', handleVisibilitySync)
    }
  })

  onBeforeUnmount(() => {
    if (queueSyncTimer !== null) {
      globalThis.clearInterval(queueSyncTimer)
    }

    if (stationHeartbeatTimer !== null) {
      globalThis.clearInterval(stationHeartbeatTimer)
    }

    if (onlineReminderClockTimer !== null) {
      globalThis.clearInterval(onlineReminderClockTimer)
    }

    globalThis.document?.removeEventListener('visibilitychange', handleVisibilitySync)
  })

  const refreshPosData = async (): Promise<void> => {
    await refreshBackendData()
  }

  return {
    appendCustomerNote,
    acknowledgeOnlineOrderReminders,
    activeOnlineReminderOrders,
    backendStatus,
    cartLines,
    cartQuantity,
    cartTotal,
    clearCart,
    closeRegisterSessionForStation,
    counterDraftOrderId,
    counterDraftStartedAt,
    customer,
    deletingPrintJobId,
    createProductForStation,
    decreaseLine,
    deleteOrderFromQueue,
    deleteProductForStation,
    deletePrintJobForOrder,
    filteredMenu,
    increaseLine,
    isSubmitting,
    isLoadingProductStatus,
    isRegisterBusy,
    lastPrintPreview,
    menuCatalog,
    claimLabelFor,
    claimOrderForStation,
    claimingOrderId,
    loadProductStatusCatalog,
    loadCounterOrderForEditing,
    loadRegisterSession,
    orderQueue,
    orderPendingSync,
    orderClaimExpired: isClaimExpired,
    orderClaimedByCurrentStation,
    orderClaimedByOtherStation,
    onlineOrderReminder,
    onlineOrderingSettings,
    paymentMethod,
    pendingOrders,
    printOrder,
    printingOrderId,
    printStation,
    productStatusCatalog,
    productStatusMessage,
    quickAddItems,
    registerMessage,
    registerSession,
    refundingOrderId,
    refundOrderForStation,
    releaseOrderClaimForStation,
    restoreSupplyProductSnapshot,
    searchTerm,
    selectedCategory,
    serviceMode,
    saveCounterOrder,
    setItemQuantity,
    setLineQuantity,
    startCounterDraft,
    stationClaimId,
    stationClaimLabel,
    stationHeartbeatMessage,
    togglingProductId,
    unconfirmedOnlineOrders,
    updatingPaymentOrderId,
    addConfiguredItem,
    addItem,
    updateConfiguredLine,
    openRegisterSessionForStation,
    refreshBackendData: refreshPosData,
    refreshQueueState,
    sendPrinterHealthcheck,
    submitCounterOrder,
    updateOrderStatus,
    updatePaymentStatus,
    updateProductAvailability,
    updateProductSupplyStatus,
    voidingOrderId,
    voidOrderForStation,
  }
}
