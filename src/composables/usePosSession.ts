import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { menuItems } from '../data/menu'
import { initialOrders } from '../data/orders'
import { formatDateKey } from '../lib/formatters'
import { isNativeLanPrinterAvailable, lanPrinterModeLabel, sendLanPrintPayload } from '../lib/lanPrinter'
import {
  createOrder,
  createPrintJob,
  closeRegisterSession,
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
  PaymentMethod,
  PaymentStatus,
  PosOrder,
  PrintJob,
  PrinterSettings,
  PrintStation,
  PrintStatus,
  RegisterSession,
  ServiceMode,
} from '../types/pos'

type CategoryFilter = 'all' | MenuCategory
type BackendMode = 'syncing' | 'connected' | 'fallback'

const queueSyncIntervalMs = 20_000
const stationHeartbeatIntervalMs = 30_000
const counterDraftStorageKey = 'script-coffee-pos-counter-draft'
const recentItemsStorageKey = 'script-coffee-pos-recent-items'
const pendingLocalOrdersStorageKey = 'script-coffee-pos-pending-orders'

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
  paymentMethod: PaymentMethod
  serviceMode: ServiceMode
}

const serviceModes: ServiceMode[] = ['dine-in', 'takeout', 'delivery']
const paymentMethods: PaymentMethod[] = ['cash', 'card', 'line-pay', 'jkopay', 'transfer']
const menuCategories: MenuCategory[] = ['coffee', 'tea', 'food', 'retail']
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

const isMenuCategory = (value: unknown): value is MenuCategory =>
  typeof value === 'string' && menuCategories.includes(value as MenuCategory)

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

const sanitizePendingLocalOrder = (value: unknown): PosOrder | null => {
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
    lines.length === 0 ||
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

const mergeLocalPendingOrders = (pendingOrders: PosOrder[], baseOrders: PosOrder[]): PosOrder[] => {
  const baseIds = new Set(baseOrders.map((order) => order.id))
  return [...pendingOrders.filter((order) => !baseIds.has(order.id)), ...baseOrders]
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

const nextSequenceFromOrders = (orders: PosOrder[]): number => {
  const maxSequence = orders.reduce((currentMax, order) => {
    const match = order.id.match(/-(\d{3,})$/)
    const sequence = match ? Number(match[1]) : 0
    return Number.isFinite(sequence) ? Math.max(currentMax, sequence) : currentMax
  }, 0)

  return maxSequence + 1
}

const sortProducts = (products: MenuItem[]): MenuItem[] =>
  [...products].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

const productToUpdateInput = (product: MenuItem, isAvailable = product.available): ProductUpdateInput => ({
  name: product.name,
  category: product.category,
  price: product.price,
  tags: [...product.tags],
  accent: product.accent,
  isAvailable,
  sortOrder: product.sortOrder,
  posVisible: product.posVisible,
  onlineVisible: product.onlineVisible,
  qrVisible: product.qrVisible,
  prepStation: product.prepStation,
  printLabel: product.printLabel,
  inventoryCount: product.inventoryCount,
  lowStockThreshold: product.lowStockThreshold,
  soldOutUntil: product.soldOutUntil,
})

const isProductTemporarilyStopped = (product: MenuItem): boolean => {
  if (!product.soldOutUntil) {
    return false
  }

  const stoppedUntil = new Date(product.soldOutUntil).getTime()
  return Number.isFinite(stoppedUntil) && stoppedUntil > Date.now()
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

  return 'queued'
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
  const selectedCategory = ref<CategoryFilter>('all')
  const searchTerm = ref('')
  const serviceMode = ref<ServiceMode>(savedCounterDraft?.serviceMode ?? 'takeout')
  const paymentMethod = ref<PaymentMethod>(savedCounterDraft?.paymentMethod ?? 'cash')
  const menuCatalog = ref<MenuItem[]>([...menuItems])
  const productStatusCatalog = ref<MenuItem[]>([...menuItems])
  const cartLines = ref<CartLine[]>(savedCounterDraft?.cartLines ?? [])
  const recentItemIds = ref<string[]>(readRecentItemIds())
  const pendingLocalOrders = ref<PosOrder[]>(savedPendingLocalOrders)
  const orderQueue = ref<PosOrder[]>(mergeLocalPendingOrders(savedPendingLocalOrders, initialOrders))
  const lastPrintPreview = ref('尚未送出列印資料')
  const nextSequence = ref(nextSequenceFromOrders(orderQueue.value))
  const isSubmitting = ref(false)
  const printingOrderId = ref<string | null>(null)
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
  const stationClaimId = currentStationId()
  const stationClaimLabel = currentStationLabel()
  let queueSyncTimer: number | null = null
  let stationHeartbeatTimer: number | null = null

  watch(
    [cartLines, serviceMode, paymentMethod, customer],
    () => {
      writeCounterDraft({
        cartLines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
        customer: { ...customer },
        paymentMethod: paymentMethod.value,
        serviceMode: serviceMode.value,
      })
    },
    { deep: true, immediate: true },
  )

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

  const applyRuntimePrinterSettings = async (): Promise<void> => {
    const runtimeSettings = await fetchRuntimeSettings()
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
  }

  const rememberPendingLocalOrder = (order: PosOrder): void => {
    if (order.remoteId) {
      return
    }

    pendingLocalOrders.value = [
      order,
      ...pendingLocalOrders.value.filter((entry) => entry.id !== order.id),
    ].slice(0, 50)
    writePendingLocalOrders(pendingLocalOrders.value)
    orderQueue.value = mergeLocalPendingOrders(pendingLocalOrders.value, orderQueue.value)
  }

  const applyRemoteOrders = (remoteOrders: PosOrder[]): void => {
    const remoteOrderIds = new Set(remoteOrders.map((order) => order.id))
    const nextPendingOrders = pendingLocalOrders.value.filter((order) => !remoteOrderIds.has(order.id))

    if (nextPendingOrders.length !== pendingLocalOrders.value.length) {
      pendingLocalOrders.value = nextPendingOrders
      writePendingLocalOrders(pendingLocalOrders.value)
    }

    orderQueue.value = mergeLocalPendingOrders(pendingLocalOrders.value, remoteOrders)
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

  const claimLabelFor = (order: PosOrder): string => {
    if (!order.claimedBy) {
      return ''
    }

    if (isClaimExpired(order)) {
      return `鎖定逾時：${order.claimedBy}`
    }

    if (order.claimedBy === stationClaimId) {
      return `本機處理中 · ${stationClaimLabel}`
    }

    return `${order.claimedBy} 處理中`
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
    productStatusCatalog.value = sortProducts(
      productStatusCatalog.value.some((entry) => entry.id === product.id)
        ? productStatusCatalog.value.map((entry) => (entry.id === product.id ? product : entry))
        : [...productStatusCatalog.value, product],
    )

    const shouldShowInPos = isProductOrderable(product)
    if (!shouldShowInPos) {
      menuCatalog.value = menuCatalog.value.filter((entry) => entry.id !== product.id)
      cartLines.value = cartLines.value.filter((line) => line.itemId !== product.id)
      return
    }

    menuCatalog.value = sortProducts(
      menuCatalog.value.some((entry) => entry.id === product.id)
        ? menuCatalog.value.map((entry) => (entry.id === product.id ? product : entry))
        : [...menuCatalog.value, product],
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
      const [remoteProducts, remoteOrders, currentRegisterSession] = await Promise.all([
        fetchProducts(),
        fetchOrders(),
        fetchCurrentRegisterSession(),
      ])
      await applyRuntimePrinterSettings()
      menuCatalog.value = sortProducts(remoteProducts)
      productStatusCatalog.value = sortProducts(remoteProducts)
      applyRemoteOrders(remoteOrders)
      applyRegisterSession(currentRegisterSession)
      nextSequence.value = nextSequenceFromOrders(orderQueue.value)
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
      menuCatalog.value = sortProducts(remoteProducts)
      productStatusCatalog.value = sortProducts(remoteProducts)
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
      const [remoteOrders, currentRegisterSession] = await Promise.all([
        fetchOrders(),
        fetchCurrentRegisterSession(),
      ])
      applyRemoteOrders(remoteOrders)
      applyRegisterSession(currentRegisterSession)
      nextSequence.value = nextSequenceFromOrders(orderQueue.value)
      setBackendStatus(
        'connected',
        quiet ? '自動同步完成' : 'API 已同步',
        `已更新 ${remoteOrders.length} 張遠端訂單${syncedLocalOrderDetail(syncedLocalCount)}${pendingLocalOrderDetail()}`,
      )
    } catch (error) {
      setBackendStatus('fallback', '同步失敗', `訂單佇列同步失敗：${getErrorMessage(error)}`)
    }
  }

  const addItem = (item: MenuItem): void => {
    const existing = cartLines.value.find((line) => line.itemId === item.id)
    rememberRecentItem(item.id)

    if (existing) {
      existing.quantity += 1
      return
    }

    const nextLine: CartLine = {
      itemId: item.id,
      productSku: item.sku,
      category: item.category,
      name: item.name,
      unitPrice: item.price,
      quantity: 1,
      options: item.tags.slice(0, 1),
      prepStation: item.prepStation,
      printLabel: item.printLabel,
    }

    if (item.id !== item.sku) {
      nextLine.productId = item.id
    }

    cartLines.value.push(nextLine)
  }

  const increaseLine = (itemId: string): void => {
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (line) {
      line.quantity += 1
    }
  }

  const decreaseLine = (itemId: string): void => {
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (!line) {
      return
    }

    if (line.quantity === 1) {
      cartLines.value = cartLines.value.filter((entry) => entry.itemId !== itemId)
      return
    }

    line.quantity -= 1
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

  const loadProductStatusCatalog = async (adminPin: string): Promise<void> => {
    if (!adminPin) {
      productStatusMessage.value = '請先輸入管理 PIN'
      return
    }

    isLoadingProductStatus.value = true
    productStatusMessage.value = '載入完整商品狀態中'

    try {
      const products = await fetchAdminProducts(adminPin)
      productStatusCatalog.value = sortProducts(products.filter((product) => product.posVisible))
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
      const savedProduct = await updateProduct(adminPin, productId, productToUpdateInput(product, isAvailable))
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

  const submitCounterOrder = async (): Promise<PosOrder | null> => {
    if (cartLines.value.length === 0 || isSubmitting.value) {
      return null
    }

    if (serviceMode.value === 'delivery' && !customer.deliveryAddress.trim()) {
      setBackendStatus('fallback', '外送地址未填', '外送訂單需要地址，避免交付資訊只留在備註')
      return null
    }

    isSubmitting.value = true
    const now = new Date()
    const order: PosOrder = {
      id: buildOrderId(now, nextSequence.value),
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
      paymentStatus: paymentStatusFor(paymentMethod.value),
      status: 'new',
      createdAt: now.toISOString(),
      claimedBy: stationClaimId,
      claimedAt: now.toISOString(),
      claimExpiresAt: claimExpiresIn(),
      printStatus: 'skipped',
      printJobs: [],
    }
    const printPlan = buildOrderPrintPlan(order, currentPrinterSettings())
    order.printStatus = printPlan.jobs.length > 0 ? 'queued' : 'skipped'

    nextSequence.value += 1
    orderQueue.value.unshift(order)
    lastPrintPreview.value = printPlan.preview
    if (printPlan.jobs.length > 0) {
      printStation.lastPrintAt = now.toISOString()
    }
    clearCart()
    resetCustomerDraft()

    if (!isPosApiConfigured) {
      rememberPendingLocalOrder(order)
      if (printPlan.jobs.length > 0) {
        appendPrintPreviewStatus('STATUS 本機模式已產生列印 payload，尚未建立雲端 print_jobs')
      }
      setBackendStatus('fallback', '本機待同步', `${order.id} 已保留在平板，待 POS API 恢復後補同步`)
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

      let backendDetail = printPlan.jobs.length > 0
        ? `${order.id} 已建立，待處理 ${printPlan.jobs.length} 筆列印任務`
        : `${order.id} 已建立，${printPlan.skippedReason ?? '未建立列印任務'}`
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

      if (printPlan.jobs.length > 0 && claimSucceeded) {
        const printStatuses: PrintStatus[] = []
        const createdPrintJobs: PrintJob[] = []

        try {
          for (const job of printPlan.jobs) {
            const printJob = await createPrintJob(nextOrder, job.payload, job.station)
            let jobStatus: PrintStatus = printJob.status
            createdPrintJobs.push(printJob)

            if (isNativeLanPrinterAvailable()) {
              const printResult = await tryNativeLanPrint(job.payload, job.station)
              const updatedPrintJob = await updatePrintJobStatus(
                printJob.id,
                printResult.ok ? 'printed' : 'failed',
                printResult.ok ? undefined : printResult.error,
              )
              jobStatus = updatedPrintJob.status
              createdPrintJobs.push(updatedPrintJob)
            }

            printStatuses.push(jobStatus)
          }

          nextOrder.printStatus = summarizePrintStatuses(printStatuses)
          nextOrder.printJobs = mergePrintJobs(nextOrder, createdPrintJobs)
          if (!isNativeLanPrinterAvailable()) {
            appendPrintPreviewStatus(`STATUS ${lanPrinterModeLabel()}，已建立 ${printPlan.jobs.length} 筆 print_jobs`)
          }
          backendDetail = nextOrder.printStatus === 'printed'
            ? `${order.id} 已建立並完成 ${printPlan.jobs.length} 筆列印`
            : `${order.id} 已建立，列印狀態：${nextOrder.printStatus}`
          replaceOrder(order.id, nextOrder)
        } catch (error) {
          nextOrder.printStatus = 'failed'
          nextOrder.printJobs = mergePrintJobs(nextOrder, createdPrintJobs)
          replaceOrder(order.id, nextOrder)
          backendDetail = `${order.id} 已建立，列印工作建立失敗：${getErrorMessage(error)}`
        }
      }

      setBackendStatus('connected', 'API 已同步', `${backendDetail}${pendingLocalOrderDetail()}`)
      void loadRegisterSession()
      void refreshProductCatalog()
      return nextOrder
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      if (isInventoryError(errorMessage)) {
        orderQueue.value = orderQueue.value.filter((entry) => entry.id !== order.id)
        cartLines.value = order.lines.map((line) => ({ ...line, options: [...line.options] }))
        nextSequence.value = Math.max(1, nextSequence.value - 1)
        setBackendStatus('fallback', '庫存不足', `訂單未建立：${errorMessage}`)
        void refreshProductCatalog()
        return null
      }

      rememberPendingLocalOrder(order)
      setBackendStatus('fallback', '本機模式', `訂單保留在本機，雲端同步失敗：${errorMessage}`)
      return order
    } finally {
      isSubmitting.value = false
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

    globalThis.document?.removeEventListener('visibilitychange', handleVisibilitySync)
  })

  const refreshPosData = async (): Promise<void> => {
    await refreshBackendData()
  }

  return {
    appendCustomerNote,
    backendStatus,
    cartLines,
    cartQuantity,
    cartTotal,
    clearCart,
    closeRegisterSessionForStation,
    customer,
    decreaseLine,
    filteredMenu,
    increaseLine,
    isSubmitting,
    isLoadingProductStatus,
    isRegisterBusy,
    lastPrintPreview,
    claimLabelFor,
    claimOrderForStation,
    claimingOrderId,
    loadProductStatusCatalog,
    loadRegisterSession,
    orderQueue,
    orderClaimExpired: isClaimExpired,
    orderClaimedByCurrentStation,
    orderClaimedByOtherStation,
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
    searchTerm,
    selectedCategory,
    serviceMode,
    stationClaimId,
    stationClaimLabel,
    stationHeartbeatMessage,
    togglingProductId,
    updatingPaymentOrderId,
    addItem,
    openRegisterSessionForStation,
    refreshBackendData: refreshPosData,
    refreshQueueState,
    sendPrinterHealthcheck,
    submitCounterOrder,
    updateOrderStatus,
    updatePaymentStatus,
    updateProductAvailability,
    voidingOrderId,
    voidOrderForStation,
  }
}
