<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  LayoutDashboard,
  LockKeyhole,
  Menu as MenuIcon,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  WalletCards,
  Trash2,
  UserRound,
  Wifi,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminPanel from './components/AdminPanel.vue'
import ConsumerOrderPage from './components/ConsumerOrderPage.vue'
import { usePosSession } from './composables/usePosSession'
import { categoryLabels } from './data/menu'
import {
  posKnowledgeArticles,
  posKnowledgeCategories,
  type PosKnowledgeArticle,
  type PosKnowledgeCategory,
} from './data/posKnowledge'
import { formatCurrency, formatDateKey, formatOrderTime, formatRelativeMinutes } from './lib/formatters'
import type {
  MenuCategory,
  MenuItem,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PosOrder,
  PrintJob,
  ServiceMode,
} from './types/pos'

type AppView = 'pos' | 'admin' | 'online'
type WorkspaceTab = 'order' | 'details' | 'payment' | 'queue' | 'printing' | 'closeout'
type CartQuickEditor = 'customer' | 'service' | 'payment' | null
type QueueFilter = 'active' | 'ready' | 'all'
type QueuePaymentFilter = 'all' | 'pending' | 'authorized' | 'paid' | 'issue'
type QueueDateFilter = 'today' | 'older' | 'all'
type QueueServiceFilter = 'all' | ServiceMode
type QueueSourceFilter = 'all' | OrderSource
type QueueFulfillmentFilter = 'all' | 'overdue' | 'due-soon' | 'scheduled'
type QueueSortMode = 'fulfillment-asc' | 'created-desc' | 'amount-desc'
type FulfillmentUrgency = 'none' | 'scheduled' | 'soon' | 'overdue'
type QueueTaskActionId = 'fulfillment-alerts' | 'pending-payments' | 'ready-orders' | 'online-unconfirmed' | 'print-issues'
type QueueTaskTone = 'primary' | 'success' | 'warning' | 'danger'
type PosTextScale = 'standard' | 'large'
type PosWorkspaceDensity = 'comfortable' | 'compact'
type ToolboxAction = 'order' | 'queue' | 'supply' | 'printing' | 'closeout' | 'admin' | 'online' | 'knowledge' | 'sync'
type StationAvailabilityFilter = 'all' | 'available' | 'stopped' | 'low-stock'
type KnowledgeCategoryFilter = 'all' | PosKnowledgeCategory
type CloseoutPreflightStatus = 'ready' | 'warning' | 'danger'
type CloseoutPreflightAction = 'active-orders' | 'pending-payments' | 'payment-issues' | 'print-issues' | 'voided-orders'

interface SavedQueueView {
  filter: QueueFilter
  paymentFilter: QueuePaymentFilter
  dateFilter: QueueDateFilter
  serviceFilter: QueueServiceFilter
  sourceFilter: QueueSourceFilter
  fulfillmentFilter: QueueFulfillmentFilter
  sortMode: QueueSortMode
  searchTerm: string
}

interface PosUiPreferences {
  textScale: PosTextScale
  density: PosWorkspaceDensity
}

interface PrintJobRow {
  key: string
  order: PosOrder
  job: PrintJob
}

interface CloseoutPreflightItem {
  id: CloseoutPreflightAction
  label: string
  detail: string
  count: number
  status: CloseoutPreflightStatus
  actionLabel: string
}

interface QueueTaskAction {
  id: QueueTaskActionId
  label: string
  detail: string
  count: number
  actionLabel: string
  tone: QueueTaskTone
}

interface SwipeState {
  key: string
  startX: number
  startY: number
  currentX: number
}

const queueFilterStorageKey = 'script-coffee-pos-queue-view'
const posUiPreferenceStorageKey = 'script-coffee-pos-ui-preferences'
const queueFilterValues: QueueFilter[] = ['active', 'ready', 'all']
const queuePaymentFilterValues: QueuePaymentFilter[] = ['all', 'pending', 'authorized', 'paid', 'issue']
const queueDateFilterValues: QueueDateFilter[] = ['today', 'older', 'all']
const queueFulfillmentFilterValues: QueueFulfillmentFilter[] = ['all', 'overdue', 'due-soon', 'scheduled']
const queueSortModeValues: QueueSortMode[] = ['fulfillment-asc', 'created-desc', 'amount-desc']
const posTextScaleValues: PosTextScale[] = ['standard', 'large']
const posWorkspaceDensityValues: PosWorkspaceDensity[] = ['comfortable', 'compact']
const serviceModeValues: ServiceMode[] = ['dine-in', 'takeout', 'delivery']
const orderSourceValues: OrderSource[] = ['counter', 'qr', 'online']
const maxSwipeOffset = 104
const swipeActionThreshold = 72
const fulfillmentAlertWindowMinutes = 15

const isConsumerDomain =
  globalThis.location?.hostname === 'order.scriptcoffee.com.tw' ||
  globalThis.location?.hostname === 'online.scriptcoffee.com.tw'
const isNativeApp = Capacitor.getPlatform() !== 'web'
const brandLogoSrc = `${import.meta.env.BASE_URL}assets/script-coffee-logo.png`

const readInitialView = (): AppView => {
  if (isNativeApp) {
    return 'pos'
  }

  if (isConsumerDomain) {
    return 'online'
  }

  const params = new URLSearchParams(globalThis.location?.search ?? '')
  const view = params.get('view') ?? params.get('mode')
  const hash = globalThis.location?.hash.replace(/^#\/?/, '')

  if (view === 'admin' || hash === 'admin') {
    return 'admin'
  }

  if (view === 'order' || view === 'online' || hash === 'order' || hash === 'online') {
    return 'online'
  }

  return 'pos'
}

const isQueueFilter = (value: unknown): value is QueueFilter =>
  typeof value === 'string' && queueFilterValues.includes(value as QueueFilter)

const isQueuePaymentFilter = (value: unknown): value is QueuePaymentFilter =>
  typeof value === 'string' && queuePaymentFilterValues.includes(value as QueuePaymentFilter)

const isQueueDateFilter = (value: unknown): value is QueueDateFilter =>
  typeof value === 'string' && queueDateFilterValues.includes(value as QueueDateFilter)

const isQueueServiceFilter = (value: unknown): value is QueueServiceFilter =>
  value === 'all' || (typeof value === 'string' && serviceModeValues.includes(value as ServiceMode))

const isQueueSourceFilter = (value: unknown): value is QueueSourceFilter =>
  value === 'all' || (typeof value === 'string' && orderSourceValues.includes(value as OrderSource))

const isQueueFulfillmentFilter = (value: unknown): value is QueueFulfillmentFilter =>
  typeof value === 'string' && queueFulfillmentFilterValues.includes(value as QueueFulfillmentFilter)

const isQueueSortMode = (value: unknown): value is QueueSortMode =>
  typeof value === 'string' && queueSortModeValues.includes(value as QueueSortMode)

const isPosTextScale = (value: unknown): value is PosTextScale =>
  typeof value === 'string' && posTextScaleValues.includes(value as PosTextScale)

const isPosWorkspaceDensity = (value: unknown): value is PosWorkspaceDensity =>
  typeof value === 'string' && posWorkspaceDensityValues.includes(value as PosWorkspaceDensity)

const readSavedQueueView = (): SavedQueueView => {
  try {
    const rawView = globalThis.localStorage?.getItem(queueFilterStorageKey)
    if (!rawView) {
      return {
        filter: 'active',
        paymentFilter: 'all',
        dateFilter: 'all',
        serviceFilter: 'all',
        sourceFilter: 'all',
        fulfillmentFilter: 'all',
        sortMode: 'fulfillment-asc',
        searchTerm: '',
      }
    }

    const parsed = JSON.parse(rawView) as Partial<SavedQueueView>
    return {
      filter: isQueueFilter(parsed.filter) ? parsed.filter : 'active',
      paymentFilter: isQueuePaymentFilter(parsed.paymentFilter) ? parsed.paymentFilter : 'all',
      dateFilter: isQueueDateFilter(parsed.dateFilter) ? parsed.dateFilter : 'all',
      serviceFilter: isQueueServiceFilter(parsed.serviceFilter) ? parsed.serviceFilter : 'all',
      sourceFilter: isQueueSourceFilter(parsed.sourceFilter) ? parsed.sourceFilter : 'all',
      fulfillmentFilter: isQueueFulfillmentFilter(parsed.fulfillmentFilter) ? parsed.fulfillmentFilter : 'all',
      sortMode: isQueueSortMode(parsed.sortMode) ? parsed.sortMode : 'fulfillment-asc',
      searchTerm: typeof parsed.searchTerm === 'string' ? parsed.searchTerm.slice(0, 80) : '',
    }
  } catch {
    return {
      filter: 'active',
      paymentFilter: 'all',
      dateFilter: 'all',
      serviceFilter: 'all',
      sourceFilter: 'all',
      fulfillmentFilter: 'all',
      sortMode: 'fulfillment-asc',
      searchTerm: '',
    }
  }
}

const writeSavedQueueView = (view: SavedQueueView): void => {
  try {
    globalThis.localStorage?.setItem(queueFilterStorageKey, JSON.stringify(view))
  } catch {
    return
  }
}

const readPosUiPreferences = (): PosUiPreferences => {
  try {
    const rawPreferences = globalThis.localStorage?.getItem(posUiPreferenceStorageKey)
    if (!rawPreferences) {
      return { textScale: 'standard', density: 'comfortable' }
    }

    const parsed = JSON.parse(rawPreferences) as Partial<PosUiPreferences>
    return {
      textScale: isPosTextScale(parsed.textScale) ? parsed.textScale : 'standard',
      density: isPosWorkspaceDensity(parsed.density) ? parsed.density : 'comfortable',
    }
  } catch {
    return { textScale: 'standard', density: 'comfortable' }
  }
}

const writePosUiPreferences = (preferences: PosUiPreferences): void => {
  try {
    globalThis.localStorage?.setItem(posUiPreferenceStorageKey, JSON.stringify(preferences))
  } catch {
    return
  }
}

const {
  addItem,
  appendCustomerNote,
  acknowledgeOnlineOrderReminders,
  activeOnlineReminderOrders,
  backendStatus,
  cartLines,
  cartQuantity,
  cartTotal,
  clearCart,
  claimLabelFor,
  claimOrderForStation,
  claimingOrderId,
  closeRegisterSessionForStation,
  customer,
  deletingPrintJobId,
  decreaseLine,
  deletePrintJobForOrder,
  filteredMenu,
  increaseLine,
  isSubmitting,
  isLoadingProductStatus,
  isRegisterBusy,
  lastPrintPreview,
  loadProductStatusCatalog,
  loadRegisterSession,
  orderClaimExpired,
  orderClaimedByCurrentStation,
  orderClaimedByOtherStation,
  orderPendingSync,
  orderQueue,
  onlineOrderReminder,
  paymentMethod,
  pendingOrders,
  printOrder,
  printingOrderId,
  printStation,
  productStatusCatalog,
  productStatusMessage,
  quickAddItems,
  refreshBackendData,
  registerMessage,
  registerSession,
  refundingOrderId,
  refundOrderForStation,
  releaseOrderClaimForStation,
  searchTerm,
  selectedCategory,
  sendPrinterHealthcheck,
  serviceMode,
  setItemQuantity,
  setLineQuantity,
  stationClaimLabel,
  stationHeartbeatMessage,
  submitCounterOrder,
  togglingProductId,
  openRegisterSessionForStation,
  updateOrderStatus,
  updatePaymentStatus,
  updateProductAvailability,
  updatingPaymentOrderId,
  voidingOrderId,
  voidOrderForStation,
} = usePosSession({ autoLoad: !isConsumerDomain })

const categoryOptions: Array<{ value: 'all' | MenuCategory; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: categoryLabels.coffee },
  { value: 'tea', label: categoryLabels.tea },
  { value: 'food', label: categoryLabels.food },
  { value: 'retail', label: categoryLabels.retail },
]
const selectedCategoryLabel = computed(
  () => categoryOptions.find((category) => category.value === selectedCategory.value)?.label ?? '全部',
)

const serviceModeOptions: Array<{ value: ServiceMode; label: string }> = [
  { value: 'takeout', label: '外帶' },
  { value: 'dine-in', label: '內用' },
  { value: 'delivery', label: '外送' },
]

const paymentOptions: Array<{ value: PaymentMethod; label: string; visible: boolean }> = [
  { value: 'cash', label: '現金', visible: true },
  { value: 'card', label: '刷卡', visible: false },
  { value: 'line-pay', label: 'LINE Pay', visible: true },
  { value: 'jkopay', label: '街口', visible: true },
  { value: 'transfer', label: '轉帳', visible: false },
]

const visiblePaymentOptions = computed(() => paymentOptions.filter((payment) => payment.visible))

const statusActions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'preparing', label: '製作' },
  { value: 'ready', label: '完成' },
  { value: 'served', label: '交付' },
]

const serviceModeLabels: Record<ServiceMode, string> = {
  'dine-in': '內用',
  takeout: '外帶',
  delivery: '外送',
}

const paymentLabels: Record<PaymentMethod, string> = {
  cash: '現金',
  card: '刷卡',
  'line-pay': 'LINE Pay',
  jkopay: '街口',
  transfer: '轉帳',
}

const sourceLabels = {
  counter: '櫃台',
  qr: '掃碼',
  online: '線上',
} as const

const paymentStatusLabels = {
  pending: '待收款',
  authorized: '已授權',
  paid: '已付款',
  expired: '逾期',
  failed: '失敗',
  refunded: '已退款',
} as const

const statusLabels: Record<OrderStatus, string> = {
  new: '新單',
  preparing: '製作中',
  ready: '可交付',
  served: '已交付',
  failed: '異常',
  voided: '已作廢',
}

const printStatusLabels = {
  queued: '待列印',
  printed: '已列印',
  skipped: '略過',
  failed: '失敗',
} as const

const noteSnippets = ['少冰', '去冰', '無糖', '熱飲', '分開裝', '需要袋子']
const currentTime = ref(Date.now())
const workspaceTabLabels: Record<WorkspaceTab, string> = {
  order: '外帶 / 外送點餐',
  details: '顧客與備註',
  payment: '付款確認',
  queue: '外帶 / 外送',
  printing: '列印站',
  closeout: '班別關帳',
}

const activeOrder = computed(() =>
  pendingOrders.value.find((order) => !orderClaimedByOtherStation(order) || orderClaimExpired(order, currentTime.value)) ??
  pendingOrders.value[0] ??
  orderQueue.value[0] ??
  null,
)
const queueHealth = computed(() => `${pendingOrders.value.length} 張待處理`)
const readyOrders = computed(() => pendingOrders.value.filter((order) => order.status === 'ready').length)
const todayOrders = computed(() => {
  const todayKey = formatDateKey(new Date())

  return orderQueue.value.filter((order) => {
    const orderDate = new Date(order.createdAt)
    return Number.isFinite(orderDate.getTime()) && formatDateKey(orderDate) === todayKey
  })
})
const salesCloseoutOrders = computed(() =>
  todayOrders.value.filter((order) => order.status !== 'failed' && order.status !== 'voided'),
)
const queueFilterOptions = computed(() => [
  { value: 'active' as const, label: '待處理', count: pendingOrders.value.length },
  { value: 'ready' as const, label: '可交付', count: readyOrders.value },
  { value: 'all' as const, label: '全部', count: orderQueue.value.length },
])
const queueBaseOrders = computed(() => {
  if (queueFilter.value === 'ready') {
    return pendingOrders.value.filter((order) => order.status === 'ready')
  }

  if (queueFilter.value === 'active') {
    return pendingOrders.value
  }

  return orderQueue.value
})
const queuePaymentFilterOptions = computed(() => {
  const baseOrders = queueBaseOrders.value
  return [
    { value: 'all' as const, label: '全部付款', count: baseOrders.length },
    { value: 'pending' as const, label: '待收', count: baseOrders.filter((order) => order.paymentStatus === 'pending').length },
    { value: 'authorized' as const, label: '已授權', count: baseOrders.filter((order) => order.paymentStatus === 'authorized').length },
    { value: 'paid' as const, label: '已付款', count: baseOrders.filter((order) => order.paymentStatus === 'paid').length },
    {
      value: 'issue' as const,
      label: '異常',
      count: baseOrders.filter((order) => order.paymentStatus === 'failed' || order.paymentStatus === 'expired').length,
    },
  ]
})
const queueDateFilterOptions: Array<{ value: QueueDateFilter; label: string }> = [
  { value: 'all', label: '全部日期' },
  { value: 'today', label: '今日' },
  { value: 'older', label: '較舊' },
]
const queueServiceFilterOptions: Array<{ value: QueueServiceFilter; label: string }> = [
  { value: 'all', label: '全部取餐方式' },
  { value: 'takeout', label: '外帶' },
  { value: 'dine-in', label: '內用' },
  { value: 'delivery', label: '外送' },
]
const queueSourceFilterOptions: Array<{ value: QueueSourceFilter; label: string }> = [
  { value: 'all', label: '全部來源' },
  { value: 'counter', label: '櫃台' },
  { value: 'online', label: '線上' },
  { value: 'qr', label: '掃碼' },
]
const queueFulfillmentFilterLabels: Record<QueueFulfillmentFilter, string> = {
  all: '全部時段',
  overdue: '已逾時',
  'due-soon': `${fulfillmentAlertWindowMinutes} 分內`,
  scheduled: '已排程',
}
const queueSortOptions: Array<{ value: QueueSortMode; label: string }> = [
  { value: 'fulfillment-asc', label: '取餐/送達時間' },
  { value: 'created-desc', label: '建立時間新到舊' },
  { value: 'amount-desc', label: '金額高到低' },
]
const stationAvailabilityFilterOptions: Array<{ value: StationAvailabilityFilter; label: string }> = [
  { value: 'all', label: '全部狀態' },
  { value: 'available', label: '正常供應' },
  { value: 'stopped', label: '暫停/售完' },
  { value: 'low-stock', label: '低庫存' },
]
const orderDateKey = (order: PosOrder): string | null => {
  const orderDate = new Date(order.createdAt)
  return Number.isFinite(orderDate.getTime()) ? formatDateKey(orderDate) : null
}
const orderFulfillmentTimestamp = (order: PosOrder): number | null => {
  if (!order.requestedFulfillmentAt) {
    return null
  }

  const timestamp = new Date(order.requestedFulfillmentAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}
const orderIsOpenForFulfillment = (order: PosOrder): boolean =>
  order.status !== 'served' && order.status !== 'failed' && order.status !== 'voided'

const orderFulfillmentUrgency = (order: PosOrder): FulfillmentUrgency => {
  const timestamp = orderFulfillmentTimestamp(order)
  if (timestamp === null || !orderIsOpenForFulfillment(order)) {
    return 'none'
  }

  const now = currentTime.value
  if (timestamp < now) {
    return 'overdue'
  }

  const dueSoonThreshold = now + fulfillmentAlertWindowMinutes * 60 * 1000
  return timestamp <= dueSoonThreshold ? 'soon' : 'scheduled'
}
const orderMatchesQueueDate = (order: PosOrder): boolean => {
  if (queueDateFilter.value === 'all') {
    return true
  }

  const todayKey = formatDateKey(new Date(currentTime.value))
  const dateKey = orderDateKey(order)
  if (!dateKey) {
    return queueDateFilter.value === 'older'
  }

  return queueDateFilter.value === 'today' ? dateKey === todayKey : dateKey !== todayKey
}
const orderMatchesQueueService = (order: PosOrder): boolean =>
  queueServiceFilter.value === 'all' || order.mode === queueServiceFilter.value

const orderMatchesQueueSource = (order: PosOrder): boolean =>
  queueSourceFilter.value === 'all' || order.source === queueSourceFilter.value

const orderMatchesQueueFulfillment = (order: PosOrder): boolean => {
  if (queueFulfillmentFilter.value === 'all') {
    return true
  }

  const urgency = orderFulfillmentUrgency(order)
  if (queueFulfillmentFilter.value === 'due-soon') {
    return urgency === 'soon'
  }

  if (queueFulfillmentFilter.value === 'scheduled') {
    return urgency === 'overdue' || urgency === 'soon' || urgency === 'scheduled'
  }

  return urgency === queueFulfillmentFilter.value
}

const orderMatchesQueueSearch = (order: PosOrder, keyword: string): boolean => {
  if (!keyword) {
    return true
  }

  const searchable = [
    order.id,
    order.customerName,
    order.customerPhone,
    order.note,
    serviceModeLabels[order.mode],
    paymentLabels[order.paymentMethod],
    paymentStatusLabels[order.paymentStatus],
    statusLabels[order.status],
    `列印${printStatusLabels[order.printStatus]}`,
    orderNeedsOnlineReminder(order) ? '未確認 線上未確認 掃碼未確認' : '',
    fulfillmentLabel(order),
    ...order.lines.map((line) => line.name),
    ...order.printJobs.flatMap((job) => [
      printStatusLabels[job.status],
      `列印${printStatusLabels[job.status]}`,
      job.lastError ?? '',
    ]),
  ]

  return searchable.some((value) => value.toLowerCase().includes(keyword))
}
const orderMatchesQueuePayment = (order: PosOrder): boolean => {
  if (queuePaymentFilter.value === 'issue') {
    return order.paymentStatus === 'failed' || order.paymentStatus === 'expired'
  }

  if (queuePaymentFilter.value === 'all') {
    return true
  }

  return order.paymentStatus === queuePaymentFilter.value
}
const orderFulfillmentTime = (order: PosOrder): number => {
  if (order.requestedFulfillmentAt) {
    const fulfillmentAt = new Date(order.requestedFulfillmentAt).getTime()
    if (Number.isFinite(fulfillmentAt)) {
      return fulfillmentAt
    }
  }

  const createdAt = new Date(order.createdAt).getTime()
  return Number.isFinite(createdAt) ? createdAt : Number.MAX_SAFE_INTEGER
}
const orderCreatedTime = (order: PosOrder): number => {
  const createdAt = new Date(order.createdAt).getTime()
  return Number.isFinite(createdAt) ? createdAt : 0
}
const sortQueueOrders = (orders: PosOrder[]): PosOrder[] =>
  [...orders].sort((a, b) => {
    if (queueSortMode.value === 'created-desc') {
      return orderCreatedTime(b) - orderCreatedTime(a)
    }

    if (queueSortMode.value === 'amount-desc') {
      return b.subtotal - a.subtotal || orderCreatedTime(b) - orderCreatedTime(a)
    }

    return orderFulfillmentTime(a) - orderFulfillmentTime(b) || orderCreatedTime(a) - orderCreatedTime(b)
  })
const visibleQueueOrders = computed(() => {
  const keyword = queueSearchTerm.value.trim().toLowerCase()
  return sortQueueOrders(queueBaseOrders.value.filter((order) =>
    orderMatchesQueueSearch(order, keyword) &&
    orderMatchesQueuePayment(order) &&
    orderMatchesQueueDate(order) &&
    orderMatchesQueueService(order) &&
    orderMatchesQueueSource(order) &&
    orderMatchesQueueFulfillment(order),
  ))
})
const queueFulfillmentFilterOptions = computed(() => {
  const baseOrders = queueBaseOrders.value
  return queueFulfillmentFilterValues.map((value) => ({
    value,
    label: queueFulfillmentFilterLabels[value],
    count: value === 'all'
      ? baseOrders.length
      : baseOrders.filter((order) => {
        const urgency = orderFulfillmentUrgency(order)
        if (value === 'due-soon') {
          return urgency === 'soon'
        }

        if (value === 'scheduled') {
          return urgency !== 'none'
        }

        return urgency === value
      }).length,
  }))
})
const queueFulfillmentAlert = computed(() => {
  const alertOrders = pendingOrders.value.filter((order) => {
    const urgency = orderFulfillmentUrgency(order)
    return urgency === 'overdue' || urgency === 'soon'
  })
  const overdueCount = alertOrders.filter((order) => orderFulfillmentUrgency(order) === 'overdue').length
  const dueSoonCount = alertOrders.length - overdueCount

  return {
    count: alertOrders.length,
    overdueCount,
    dueSoonCount,
    isOverdue: overdueCount > 0,
  }
})
const queueFulfillmentAlertTitle = computed(() => {
  if (queueFulfillmentAlert.value.overdueCount > 0) {
    return `${queueFulfillmentAlert.value.overdueCount} 張訂單已超過取餐/送達時間`
  }

  return `${queueFulfillmentAlert.value.dueSoonCount} 張訂單 ${fulfillmentAlertWindowMinutes} 分鐘內到點`
})
const queuePendingPaymentOrders = computed(() =>
  pendingOrders.value.filter((order) => order.paymentStatus === 'pending'),
)
const queueReadyOrders = computed(() =>
  pendingOrders.value.filter((order) => order.status === 'ready'),
)
const queuePrintIssueOrders = computed(() =>
  pendingOrders.value.filter((order) => order.printStatus === 'failed'),
)
const queueTaskActions = computed<QueueTaskAction[]>(() => [
  {
    id: 'fulfillment-alerts',
    label: '到點/逾時',
    detail: queueFulfillmentAlert.value.count > 0
      ? `逾時 ${queueFulfillmentAlert.value.overdueCount} · ${fulfillmentAlertWindowMinutes} 分內 ${queueFulfillmentAlert.value.dueSoonCount}`
      : '目前無到點訂單',
    count: queueFulfillmentAlert.value.count,
    actionLabel: queueFulfillmentAlert.value.count > 0 ? '處理' : '查看',
    tone: queueFulfillmentAlert.value.isOverdue ? 'danger' : 'warning',
  },
  {
    id: 'pending-payments',
    label: '待收款',
    detail: queuePendingPaymentOrders.value.length > 0
      ? `合計 ${formatCurrency(queuePendingPaymentOrders.value.reduce((sum, order) => sum + order.subtotal, 0))}`
      : '目前沒有待收款',
    count: queuePendingPaymentOrders.value.length,
    actionLabel: queuePendingPaymentOrders.value.length > 0 ? '收款' : '查看',
    tone: 'warning',
  },
  {
    id: 'ready-orders',
    label: '可交付',
    detail: queueReadyOrders.value.length > 0 ? '優先確認顧客取餐' : '暫無可交付訂單',
    count: queueReadyOrders.value.length,
    actionLabel: queueReadyOrders.value.length > 0 ? '交付' : '查看',
    tone: 'success',
  },
  {
    id: 'online-unconfirmed',
    label: '線上未確認',
    detail: onlineOrderReminder.value.activeOverdueCount > 0
      ? onlineReminderThresholdLabel.value
      : '沒有逾時未確認新單',
    count: onlineOrderReminder.value.activeOverdueCount,
    actionLabel: onlineOrderReminder.value.activeOverdueCount > 0 ? '接手' : '查看',
    tone: 'warning',
  },
  {
    id: 'print-issues',
    label: '列印失敗',
    detail: queuePrintIssueOrders.value.length > 0 ? '重印或檢查出單機' : '目前無列印失敗',
    count: queuePrintIssueOrders.value.length,
    actionLabel: queuePrintIssueOrders.value.length > 0 ? '重印' : '查看',
    tone: queuePrintIssueOrders.value.length > 0 ? 'danger' : 'primary',
  },
])
const printJobRows = computed<PrintJobRow[]>(() =>
  orderQueue.value
    .flatMap((order) => order.printJobs.map((job) => ({
      key: `print:${order.id}:${job.id}`,
      order,
      job,
    })))
    .sort((a, b) => new Date(b.job.createdAt).getTime() - new Date(a.job.createdAt).getTime()),
)
const queueFilterNote = computed(() => {
  const filtersApplied =
    queueSearchTerm.value.trim().length > 0 ||
    queuePaymentFilter.value !== 'all' ||
    queueDateFilter.value !== 'all' ||
    queueServiceFilter.value !== 'all' ||
    queueSourceFilter.value !== 'all' ||
    queueFulfillmentFilter.value !== 'all' ||
    queueSortMode.value !== 'fulfillment-asc'
  if (filtersApplied) {
    return `顯示 ${visibleQueueOrders.value.length} 張符合條件訂單`
  }

  if (queueFilter.value === 'ready') {
    return '只顯示可交付訂單'
  }

  if (queueFilter.value === 'active') {
    return '隱藏已交付訂單'
  }

  return '顯示全部訂單'
})
const activeOnlineReminderIds = computed(() =>
  new Set(activeOnlineReminderOrders.value.map((order) => order.id)),
)
const onlineReminderToneLabel = computed(() =>
  onlineOrderReminder.value.soundEnabled ? '提示音已開啟' : '提示音已關閉',
)
const onlineReminderThresholdLabel = computed(() =>
  onlineOrderReminder.value.reminderMinutes === 0
    ? '新單立即提醒'
    : `超過 ${onlineOrderReminder.value.reminderMinutes} 分鐘未確認`,
)
const knowledgeCategoryLabels = Object.fromEntries(
  posKnowledgeCategories.map((category) => [category.value, category.label]),
) as Record<PosKnowledgeCategory, string>
const knowledgeCategoryOptions = computed(() => [
  { value: 'all' as const, label: '全部', count: posKnowledgeArticles.length },
  ...posKnowledgeCategories.map((category) => ({
    value: category.value,
    label: category.label,
    count: posKnowledgeArticles.filter((article) => article.category === category.value).length,
  })),
])
const filteredKnowledgeArticles = computed(() => {
  const keyword = knowledgeSearchTerm.value.trim().toLowerCase()

  return posKnowledgeArticles.filter((article) => {
    const matchesCategory = knowledgeCategoryFilter.value === 'all' || article.category === knowledgeCategoryFilter.value
    const searchable = [
      article.title,
      article.summary,
      knowledgeCategoryLabels[article.category],
      ...article.steps,
      ...article.keywords,
    ].join(' ').toLowerCase()

    return matchesCategory && (keyword.length === 0 || searchable.includes(keyword))
  })
})
const activeKnowledgeArticle = computed<PosKnowledgeArticle | null>(() =>
  posKnowledgeArticles.find((article) => article.id === activeKnowledgeArticleId.value) ??
  filteredKnowledgeArticles.value[0] ??
  null,
)
const activeOrderItemCount = computed(
  () => activeOrder.value?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0,
)
const stationProducts = computed(() =>
  [...productStatusCatalog.value]
    .filter((product: MenuItem) => product.posVisible)
    .sort((a: MenuItem, b: MenuItem) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
)
const availableStationProducts = computed(() => stationProducts.value.filter((product) => product.available).length)
const stoppedStationProducts = computed(() => stationProducts.value.length - availableStationProducts.value)
const lowStockStationProducts = computed(() =>
  stationProducts.value.filter((product) =>
    product.inventoryCount !== null &&
    product.lowStockThreshold !== null &&
    product.inventoryCount > 0 &&
    product.inventoryCount <= product.lowStockThreshold,
  ),
)
const stationProductMatchesStatus = (product: MenuItem): boolean => {
  if (stationAvailabilityFilter.value === 'available') {
    return product.available && product.inventoryCount !== 0 && !isProductTemporarilyStopped(product)
  }

  if (stationAvailabilityFilter.value === 'stopped') {
    return !product.available || product.inventoryCount === 0 || isProductTemporarilyStopped(product)
  }

  if (stationAvailabilityFilter.value === 'low-stock') {
    return lowStockStationProducts.value.some((entry) => entry.id === product.id)
  }

  return true
}
const visibleStationProducts = computed(() => {
  const keyword = stationSearchTerm.value.trim().toLowerCase()
  return stationProducts.value.filter((product) => {
    const matchesCategory = stationCategoryFilter.value === 'all' || product.category === stationCategoryFilter.value
    const matchesKeyword =
      keyword.length === 0 ||
      product.name.toLowerCase().includes(keyword) ||
      product.sku.toLowerCase().includes(keyword) ||
      product.tags.some((tag) => tag.toLowerCase().includes(keyword))

    return matchesCategory && matchesKeyword && stationProductMatchesStatus(product)
  })
})
const stationFilteredAvailableProducts = computed(() =>
  visibleStationProducts.value.filter((product) => product.available),
)
const stationFilteredStoppedProducts = computed(() =>
  visibleStationProducts.value.filter((product) => !product.available),
)
const stationFilterSummary = computed(() =>
  `顯示 ${visibleStationProducts.value.length} 個 · 可售 ${stationFilteredAvailableProducts.value.length} 個 · 暫停 ${stationFilteredStoppedProducts.value.length} 個`,
)
const closeoutSummary = computed(() => {
  const collectedStatuses = new Set(['authorized', 'paid'])

  return todayOrders.value.reduce(
    (summary, order) => {
      const isSaleOrder = order.status !== 'failed' && order.status !== 'voided'

      if (isSaleOrder && collectedStatuses.has(order.paymentStatus)) {
        summary.collectedTotal += order.subtotal
      }

      if (isSaleOrder && order.paymentStatus === 'pending') {
        summary.pendingTotal += order.subtotal
        summary.pendingCount += 1
      }

      if (order.status !== 'voided' && (order.paymentStatus === 'failed' || order.paymentStatus === 'expired')) {
        summary.failedPaymentCount += 1
      }

      if (order.status !== 'voided' && order.printStatus === 'failed') {
        summary.failedPrintCount += 1
      }

      if (order.status === 'voided') {
        summary.voidedCount += 1
      }

      return summary
    },
    {
      collectedTotal: 0,
      pendingTotal: 0,
      pendingCount: 0,
      failedPaymentCount: 0,
      failedPrintCount: 0,
      voidedCount: 0,
    },
  )
})
const closeoutOpenOrders = computed(() =>
  todayOrders.value.filter((order) => order.status !== 'served' && order.status !== 'failed' && order.status !== 'voided'),
)
const closeoutPendingPaymentOrders = computed(() =>
  salesCloseoutOrders.value.filter((order) => order.paymentStatus === 'pending'),
)
const closeoutPaymentIssueOrders = computed(() =>
  todayOrders.value.filter((order) => order.status !== 'voided' && (order.paymentStatus === 'failed' || order.paymentStatus === 'expired')),
)
const closeoutPrintIssueOrders = computed(() =>
  todayOrders.value.filter((order) => order.status !== 'voided' && order.printStatus === 'failed'),
)
const closeoutVoidedOrders = computed(() =>
  todayOrders.value.filter((order) => order.status === 'voided'),
)
const closeoutPreflightItems = computed<CloseoutPreflightItem[]>(() => [
  {
    id: 'active-orders',
    label: '未交付訂單',
    detail: closeoutOpenOrders.value.length > 0 ? '先完成、交付或作廢，避免班別交接漏單。' : '今日進行中訂單已清空。',
    count: closeoutOpenOrders.value.length,
    status: closeoutOpenOrders.value.length > 0 ? 'danger' : 'ready',
    actionLabel: closeoutOpenOrders.value.length > 0 ? '處理' : '查看',
  },
  {
    id: 'pending-payments',
    label: '待收款',
    detail: closeoutPendingPaymentOrders.value.length > 0 ? '關班前先完成收款或作廢。' : '沒有待收款訂單。',
    count: closeoutPendingPaymentOrders.value.length,
    status: closeoutPendingPaymentOrders.value.length > 0 ? 'danger' : 'ready',
    actionLabel: closeoutPendingPaymentOrders.value.length > 0 ? '收款' : '查看',
  },
  {
    id: 'payment-issues',
    label: '付款異常',
    detail: closeoutPaymentIssueOrders.value.length > 0 ? '確認逾期或失敗付款是否需要重建訂單。' : '付款異常已清空。',
    count: closeoutPaymentIssueOrders.value.length,
    status: closeoutPaymentIssueOrders.value.length > 0 ? 'danger' : 'ready',
    actionLabel: closeoutPaymentIssueOrders.value.length > 0 ? '追查' : '查看',
  },
  {
    id: 'print-issues',
    label: '列印失敗',
    detail: closeoutPrintIssueOrders.value.length > 0 ? '重新出單或確認 GODEX / 網路狀態。' : '沒有列印失敗記錄。',
    count: closeoutPrintIssueOrders.value.length,
    status: closeoutPrintIssueOrders.value.length > 0 ? 'warning' : 'ready',
    actionLabel: closeoutPrintIssueOrders.value.length > 0 ? '重印' : '查看',
  },
  {
    id: 'voided-orders',
    label: '作廢記錄',
    detail: closeoutVoidedOrders.value.length > 0 ? '交班時確認作廢原因與稽核記錄。' : '今日沒有作廢訂單。',
    count: closeoutVoidedOrders.value.length,
    status: closeoutVoidedOrders.value.length > 0 ? 'warning' : 'ready',
    actionLabel: closeoutVoidedOrders.value.length > 0 ? '核對' : '查看',
  },
])
const closeoutPreflightBlockingCount = computed(() =>
  closeoutOpenOrders.value.length +
  closeoutPendingPaymentOrders.value.length +
  closeoutPaymentIssueOrders.value.length +
  closeoutPrintIssueOrders.value.length,
)
const closeoutPreflightReady = computed(() => closeoutPreflightBlockingCount.value === 0)
const closeoutPreflightSummary = computed(() => {
  if (closeoutPreflightReady.value) {
    return closeoutVoidedOrders.value.length > 0
      ? `可關班 · 作廢 ${closeoutVoidedOrders.value.length} 張需交接`
      : '可關班 · 今日預檢完成'
  }

  return `需處理 ${closeoutPreflightBlockingCount.value} 張/項異常`
})
const paymentCloseoutRows = computed(() =>
  paymentOptions
    .map((payment) => {
      const matchingOrders = salesCloseoutOrders.value.filter((order) => order.paymentMethod === payment.value)
      return {
        ...payment,
        count: matchingOrders.length,
        total: matchingOrders.reduce((sum, order) => sum + order.subtotal, 0),
        pending: matchingOrders.filter((order) => order.paymentStatus === 'pending').length,
      }
    })
    .filter((payment) => payment.count > 0 || payment.visible),
)
const lastPrintTime = computed(() => (printStation.lastPrintAt ? formatOrderTime(printStation.lastPrintAt) : '尚未列印'))
const activeView = ref<AppView>(readInitialView())
const activeWorkspaceTab = ref<WorkspaceTab>('queue')
const savedQueueView = readSavedQueueView()
const posUiPreferences = ref<PosUiPreferences>(readPosUiPreferences())
const queueFilter = ref<QueueFilter>(savedQueueView.filter)
const queuePaymentFilter = ref<QueuePaymentFilter>(savedQueueView.paymentFilter)
const queueDateFilter = ref<QueueDateFilter>(savedQueueView.dateFilter)
const queueServiceFilter = ref<QueueServiceFilter>(savedQueueView.serviceFilter)
const queueSourceFilter = ref<QueueSourceFilter>(savedQueueView.sourceFilter)
const queueFulfillmentFilter = ref<QueueFulfillmentFilter>(savedQueueView.fulfillmentFilter)
const queueSortMode = ref<QueueSortMode>(savedQueueView.sortMode)
const queueSearchTerm = ref(savedQueueView.searchTerm)
const expandedOrderId = ref<string | null>(null)
const swipeState = ref<SwipeState | null>(null)
const activeCartQuickEditor = ref<CartQuickEditor>(null)
const isToolboxOpen = ref(false)
const isKnowledgeOpen = ref(false)
const knowledgeSearchTerm = ref('')
const knowledgeCategoryFilter = ref<KnowledgeCategoryFilter>('all')
const activeKnowledgeArticleId = ref(posKnowledgeArticles[0]?.id ?? '')
const stationSearchTerm = ref('')
const stationCategoryFilter = ref<'all' | MenuCategory>('all')
const stationAvailabilityFilter = ref<StationAvailabilityFilter>('all')
const stationBatchProductIds = ref<string[]>([])
const searchInput = ref<HTMLInputElement | null>(null)
const customerNameInput = ref<HTMLInputElement | null>(null)
const stationPin = ref('')
const registerPin = ref('')
const registerOpeningCash = ref(0)
const registerClosingCash = ref(0)
const registerNote = ref('')
const forceCloseRegister = ref(false)
let claimClockTimer: number | null = null
const currentClockLabel = computed(() => formatOrderTime(new Date(currentTime.value).toISOString()))
const activeWorkspaceTitle = computed(() => workspaceTabLabels[activeWorkspaceTab.value])
const showInternalHeaderControls = computed(() => !isConsumerDomain && activeView.value !== 'online')
const canSwitchWorkspace = computed(() => showInternalHeaderControls.value && !isNativeApp)
const pageTitle = computed(() => {
  if (activeView.value === 'online') {
    return '線上點餐'
  }

  return isNativeApp ? '平板工作站' : '門市 POS'
})
const pageSubtitle = computed(() => {
  if (activeView.value === 'online') {
    return '線上菜單 · 自取訂單 · 門市接單'
  }

  return isNativeApp ? '櫃台點餐 · 線上接單 · 商品暫停 · LAN 出單' : '櫃台點餐 · 線上訂單 · LAN 列印'
})
const registerIsOpen = computed(() => registerSession.value?.status === 'open')
const registerHasCloseoutExceptions = computed(() =>
  registerIsOpen.value &&
  (
    (registerSession.value?.openOrderCount ?? 0) > 0 ||
    (registerSession.value?.failedPaymentCount ?? 0) > 0 ||
    (registerSession.value?.failedPrintCount ?? 0) > 0
  ),
)
const registerStatusLabel = computed(() => {
  if (!registerSession.value) {
    return '未開班'
  }

  if (registerSession.value.status === 'open') {
    return `營業中 · ${formatOrderTime(registerSession.value.openedAt)}`
  }

  return `已關班 · ${formatOrderTime(registerSession.value.closedAt ?? registerSession.value.openedAt)}`
})
const workspaceTabSummaries = computed<Record<WorkspaceTab, string>>(() => ({
  order: cartQuantity.value > 0 ? `${cartQuantity.value} 件` : '菜單與購物車',
  details: `${serviceModeLabels[serviceMode.value]} · ${customer.name || '現場客'}`,
  payment: paymentLabels[paymentMethod.value],
  queue: queueFulfillmentAlert.value.count > 0 ? `${queueFulfillmentAlert.value.count} 張到點` : `${pendingOrders.value.length} 待處理`,
  printing: printStation.online ? '列印在線' : '列印離線',
  closeout: closeoutPreflightBlockingCount.value > 0 ? `${closeoutPreflightBlockingCount.value} 項待處理` : registerStatusLabel.value,
}))
const registerVariance = computed(() => {
  if (!registerSession.value) {
    return 0
  }

  const countedCash = registerSession.value.status === 'closed'
    ? registerSession.value.closingCash ?? 0
    : registerClosingCash.value

  return countedCash - registerSession.value.expectedCash
})
const registerVarianceClass = computed(() => {
  if (registerVariance.value === 0) {
    return 'register-variance--balanced'
  }

  return registerVariance.value > 0 ? 'register-variance--over' : 'register-variance--short'
})

const statusClass = (status: OrderStatus): string => `status-chip--${status}`

const lineQuantityByItem = (itemId: string): number =>
  cartLines.value.find((line) => line.itemId === itemId)?.quantity ?? 0

const quantityFromInput = (event: Event): number | null => {
  if (!(event.target instanceof HTMLInputElement)) {
    return null
  }

  const value = event.target.value.trim()
  if (!value) {
    return null
  }

  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity : null
}

const committedQuantityFromInput = (event: Event): number => {
  const quantity = quantityFromInput(event)
  return quantity ?? 0
}

const updateProductQuantityInput = (item: MenuItem, event: Event): void => {
  const quantity = quantityFromInput(event)
  if (quantity === null) {
    return
  }

  setItemQuantity(item, quantity)
}

const commitProductQuantityInput = (item: MenuItem, event: Event): void => {
  setItemQuantity(item, committedQuantityFromInput(event))
}

const updateCartQuantityInput = (itemId: string, event: Event): void => {
  const quantity = quantityFromInput(event)
  if (quantity === null) {
    return
  }

  setLineQuantity(itemId, quantity)
}

const commitCartQuantityInput = (itemId: string, event: Event): void => {
  setLineQuantity(itemId, committedQuantityFromInput(event))
}

const blurQuantityInput = (event: KeyboardEvent): void => {
  if (event.target instanceof HTMLInputElement) {
    event.target.blur()
  }
}

const isProductTemporarilyStopped = (product: MenuItem): boolean => {
  if (!product.soldOutUntil) {
    return false
  }

  const stoppedUntil = new Date(product.soldOutUntil).getTime()
  return Number.isFinite(stoppedUntil) && stoppedUntil > Date.now()
}

const productStockLabel = (product: MenuItem): string => {
  if (isProductTemporarilyStopped(product)) {
    return `暫停至 ${formatOrderTime(product.soldOutUntil ?? '')}`
  }

  if (product.inventoryCount === 0) {
    return '售完'
  }

  if (product.inventoryCount === null) {
    return ''
  }

  if (product.lowStockThreshold !== null && product.inventoryCount <= product.lowStockThreshold) {
    return `低庫存 ${product.inventoryCount}`
  }

  return `剩 ${product.inventoryCount}`
}

const productStockClass = (product: MenuItem): string => {
  if (product.inventoryCount === 0 || isProductTemporarilyStopped(product)) {
    return 'product-stock-badge--stopped'
  }

  if (
    product.inventoryCount !== null &&
    product.lowStockThreshold !== null &&
    product.inventoryCount <= product.lowStockThreshold
  ) {
    return 'product-stock-badge--low'
  }

  return 'product-stock-badge--ok'
}

const printAttemptCount = (order: PosOrder): number =>
  order.printJobs.reduce((total, printJob) => total + printJob.attempts, 0)

const latestPrintJob = (order: PosOrder): PrintJob | null =>
  [...order.printJobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null

const printSummary = (order: PosOrder): string => {
  const latestJob = latestPrintJob(order)
  const attempts = printAttemptCount(order)

  if (!latestJob) {
    return printStatusLabels[order.printStatus]
  }

  const attemptText = attempts > 0 ? ` · ${attempts} 次` : ''
  if (latestJob.lastError) {
    return `${printStatusLabels[order.printStatus]}${attemptText} · ${latestJob.lastError}`
  }

  return `${printStatusLabels[order.printStatus]}${attemptText}`
}

const fulfillmentUrgencyLabel = (order: PosOrder): string => {
  const urgency = orderFulfillmentUrgency(order)
  if (urgency === 'overdue') {
    return '已逾時'
  }

  if (urgency === 'soon') {
    return `${fulfillmentAlertWindowMinutes} 分內`
  }

  if (urgency === 'scheduled') {
    return '已排程'
  }

  return ''
}

const fulfillmentUrgencyClass = (order: PosOrder): string => {
  const urgency = orderFulfillmentUrgency(order)
  return urgency === 'none' ? '' : `order-fulfillment--${urgency}`
}

const fulfillmentRowClass = (order: PosOrder): string => {
  const urgency = orderFulfillmentUrgency(order)
  return urgency === 'overdue' || urgency === 'soon' ? `order-row--fulfillment-${urgency}` : ''
}

const fulfillmentLabel = (order: PosOrder): string => {
  const parts: string[] = []

  if (order.requestedFulfillmentAt) {
    const action = order.mode === 'delivery' ? '送達' : '取餐'
    parts.push(`${action} ${formatOrderTime(order.requestedFulfillmentAt)}`)
  }

  if (order.deliveryAddress) {
    parts.push(order.deliveryAddress)
  }

  return parts.join(' · ')
}

const printActionLabel = (order: PosOrder): string => {
  if (printingOrderId.value === order.id) {
    return '出單中'
  }

  return order.printJobs.length > 0 ? '重印' : '出單'
}

const claimableStatuses: OrderStatus[] = ['new', 'preparing', 'ready']
const orderCanBeClaimed = (order: PosOrder): boolean => claimableStatuses.includes(order.status)

const claimActionLabel = (order: PosOrder): string => {
  if (claimingOrderId.value === order.id) {
    return '鎖定中'
  }

  if (!orderCanBeClaimed(order)) {
    return '已結束'
  }

  if (orderClaimedByCurrentStation(order)) {
    return '釋放'
  }

  if (order.claimedBy && orderClaimExpired(order, currentTime.value)) {
    return '接手'
  }

  if (orderClaimedByOtherStation(order)) {
    return '鎖定中'
  }

  return '鎖定'
}

const claimChipClass = (order: PosOrder): string => {
  if (orderClaimedByCurrentStation(order)) {
    return 'claim-chip--mine'
  }

  if (orderClaimedByOtherStation(order)) {
    return 'claim-chip--locked'
  }

  if (order.claimedBy) {
    return 'claim-chip--expired'
  }

  return ''
}

const claimOrderAction = (order: PosOrder): void => {
  if (!orderCanBeClaimed(order)) {
    return
  }

  if (orderClaimedByCurrentStation(order)) {
    void releaseOrderClaimForStation(order.id)
    return
  }

  void claimOrderForStation(order.id, Boolean(order.claimedBy && orderClaimExpired(order, currentTime.value)))
}

const claimActionDisabled = (order: PosOrder): boolean =>
  claimingOrderId.value === order.id ||
  !orderCanBeClaimed(order) ||
  (orderClaimedByOtherStation(order) && !orderClaimExpired(order, currentTime.value))

const payableStatuses: PaymentStatus[] = ['pending', 'authorized']

const paymentActionLabel = (order: PosOrder): string => {
  if (updatingPaymentOrderId.value === order.id) {
    return '收款中'
  }

  if (order.paymentStatus === 'pending') {
    return '收款'
  }

  if (order.paymentStatus === 'authorized') {
    return '入帳'
  }

  return ''
}

const paymentActionDisabled = (order: PosOrder): boolean =>
  updatingPaymentOrderId.value === order.id ||
  orderClaimedByOtherStation(order) ||
  !payableStatuses.includes(order.paymentStatus)

const confirmPaymentAction = (order: PosOrder): void => {
  void updatePaymentStatus(order.id, 'paid')
}

const orderCanBeVoided = (order: PosOrder): boolean =>
  order.paymentStatus === 'pending' &&
  !['served', 'failed', 'voided'].includes(order.status) &&
  !orderClaimedByOtherStation(order)

const orderCanBeRefunded = (order: PosOrder): boolean =>
  ['authorized', 'paid'].includes(order.paymentStatus) &&
  !['failed', 'voided'].includes(order.status) &&
  !orderClaimedByOtherStation(order)

const voidActionLabel = (order: PosOrder): string => (
  voidingOrderId.value === order.id ? '作廢中' : '作廢'
)

const refundActionLabel = (order: PosOrder): string => (
  refundingOrderId.value === order.id ? '退款中' : '退款'
)

const voidOrderAction = (order: PosOrder): void => {
  void voidOrderForStation(stationPin.value.trim(), order.id)
}

const refundOrderAction = (order: PosOrder): void => {
  void refundOrderForStation(stationPin.value.trim(), order.id)
}

const orderSwipeKey = (order: PosOrder): string => `order:${order.id}`

const orderSwipeDeleteLabel = (order: PosOrder): string => {
  if (orderCanBeVoided(order)) {
    return voidActionLabel(order)
  }

  if (orderCanBeRefunded(order)) {
    return refundActionLabel(order)
  }

  if (orderClaimedByOtherStation(order)) {
    return '先接手'
  }

  if (order.paymentStatus === 'refunded') {
    return '已退款'
  }

  if (order.status === 'voided') {
    return '已作廢'
  }

  if (order.status === 'served') {
    return '已交付'
  }

  if (order.paymentStatus === 'expired') {
    return '付款逾期'
  }

  if (order.paymentStatus === 'failed' || order.status === 'failed') {
    return '已異常'
  }

  return '不可作廢'
}

const orderSwipeDeleteDisabled = (order: PosOrder): boolean =>
  (!orderCanBeVoided(order) && !orderCanBeRefunded(order)) ||
  voidingOrderId.value === order.id ||
  refundingOrderId.value === order.id

const orderSwipeDeleteAction = (order: PosOrder): void => {
  if (orderSwipeDeleteDisabled(order)) {
    return
  }

  if (orderCanBeVoided(order)) {
    voidOrderAction(order)
    return
  }

  refundOrderAction(order)
}

const printJobDeleteDisabled = (row: PrintJobRow): boolean =>
  deletingPrintJobId.value === row.job.id || orderClaimedByOtherStation(row.order)

const printJobDeleteLabel = (row: PrintJobRow): string =>
  deletingPrintJobId.value === row.job.id ? '刪除中' : '刪除'

const printJobDeleteAction = (row: PrintJobRow): void => {
  if (printJobDeleteDisabled(row)) {
    return
  }

  void deletePrintJobForOrder(row.order.id, row.job.id)
}

const swipeOffsetFor = (key: string): number => {
  if (swipeState.value?.key !== key) {
    return 0
  }

  const deltaX = swipeState.value.currentX - swipeState.value.startX
  return Math.max(-maxSwipeOffset, Math.min(0, deltaX))
}

const swipeCardStyle = (key: string): { transform: string } => ({
  transform: `translateX(${swipeOffsetFor(key)}px)`,
})

const swipeRowClass = (key: string): Record<string, boolean> => ({
  'swipe-row--dragging': swipeState.value?.key === key,
})

const startSwipe = (key: string, event: PointerEvent): void => {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return
  }

  if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select, a')) {
    return
  }

  swipeState.value = {
    key,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
  }

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
}

const moveSwipe = (key: string, event: PointerEvent): void => {
  if (swipeState.value?.key !== key) {
    return
  }

  const deltaX = event.clientX - swipeState.value.startX
  const deltaY = event.clientY - swipeState.value.startY

  if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 12) {
    swipeState.value = null
    return
  }

  if (deltaX < 0) {
    event.preventDefault()
  }

  swipeState.value.currentX = event.clientX
}

const endSwipe = (key: string, action: () => void): void => {
  const offset = swipeOffsetFor(key)
  swipeState.value = null

  if (offset <= -swipeActionThreshold) {
    action()
  }
}

const cancelSwipe = (key: string): void => {
  if (swipeState.value?.key === key) {
    swipeState.value = null
  }
}

const endOrderSwipe = (order: PosOrder): void => {
  endSwipe(orderSwipeKey(order), () => orderSwipeDeleteAction(order))
}

const endPrintJobSwipe = (row: PrintJobRow): void => {
  endSwipe(row.key, () => printJobDeleteAction(row))
}

const toggleOrderDetail = (order: PosOrder): void => {
  expandedOrderId.value = expandedOrderId.value === order.id ? null : order.id
}

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
}

const focusMenuSearch = (): void => {
  void nextTick(() => {
    searchInput.value?.focus()
  })
}

const openToolbox = (): void => {
  activeCartQuickEditor.value = null
  isKnowledgeOpen.value = false
  isToolboxOpen.value = true
}

const closeToolbox = (): void => {
  isToolboxOpen.value = false
}

const openKnowledge = (articleId?: string): void => {
  activeCartQuickEditor.value = null
  isToolboxOpen.value = false
  if (articleId) {
    activeKnowledgeArticleId.value = articleId
  } else {
    knowledgeSearchTerm.value = ''
    knowledgeCategoryFilter.value = 'all'
    activeKnowledgeArticleId.value = posKnowledgeArticles[0]?.id ?? ''
  }
  isKnowledgeOpen.value = true
}

const closeKnowledge = (): void => {
  isKnowledgeOpen.value = false
}

const knowledgeTargetLabels: Record<PosKnowledgeArticle['target'], string> = {
  order: '點餐',
  queue: '訂單',
  printing: '列印/供應',
  closeout: '班別',
  admin: '後台',
  online: '線上入口',
}

const jumpToKnowledgeTarget = (article: PosKnowledgeArticle): void => {
  if (article.target === 'admin') {
    setActiveView('admin')
  } else if (article.target === 'online') {
    setActiveView('online')
  } else {
    setActiveView('pos')
    setWorkspaceTab(article.target)
  }

  closeKnowledge()
}

const resetQueueViewForCloseoutPreflight = (): void => {
  queueFilter.value = 'all'
  queuePaymentFilter.value = 'all'
  queueDateFilter.value = 'today'
  queueServiceFilter.value = 'all'
  queueSourceFilter.value = 'all'
  queueFulfillmentFilter.value = 'all'
  queueSortMode.value = 'fulfillment-asc'
  queueSearchTerm.value = ''
  expandedOrderId.value = null
}

const runCloseoutPreflightAction = (item: CloseoutPreflightItem): void => {
  resetQueueViewForCloseoutPreflight()

  if (item.id === 'active-orders') {
    queueFilter.value = 'active'
  }

  if (item.id === 'pending-payments') {
    queuePaymentFilter.value = 'pending'
  }

  if (item.id === 'payment-issues') {
    queuePaymentFilter.value = 'issue'
  }

  if (item.id === 'print-issues') {
    queueSearchTerm.value = '列印失敗'
  }

  if (item.id === 'voided-orders') {
    queueSearchTerm.value = statusLabels.voided
  }

  setWorkspaceTab('queue')
}

const runToolboxAction = (action: ToolboxAction): void => {
  if (action === 'order') {
    startTakeoutOrder()
  }

  if (action === 'queue') {
    setWorkspaceTab('queue')
  }

  if (action === 'supply' || action === 'printing') {
    setWorkspaceTab('printing')
  }

  if (action === 'closeout') {
    setWorkspaceTab('closeout')
  }

  if (action === 'admin') {
    setActiveView('admin')
  }

  if (action === 'online') {
    setActiveView('online')
  }

  if (action === 'knowledge') {
    openKnowledge()
    return
  }

  if (action === 'sync') {
    void refreshBackendData()
  }

  closeToolbox()
}

const toggleCartQuickEditor = (editor: Exclude<CartQuickEditor, null>): void => {
  activeCartQuickEditor.value = activeCartQuickEditor.value === editor ? null : editor

  if (activeCartQuickEditor.value === 'customer') {
    void nextTick(() => {
      customerNameInput.value?.focus()
      customerNameInput.value?.select()
    })
  }
}

const closeCartQuickEditor = (): void => {
  activeCartQuickEditor.value = null
}

const selectCartServiceMode = (mode: ServiceMode): void => {
  serviceMode.value = mode
  activeCartQuickEditor.value = null
}

const selectCartPaymentMethod = (method: PaymentMethod): void => {
  paymentMethod.value = method
  activeCartQuickEditor.value = null
}

const handlePosShortcut = (event: KeyboardEvent): void => {
  if (activeView.value !== 'pos') {
    return
  }

  if (event.key === 'Escape' && isKnowledgeOpen.value) {
    event.preventDefault()
    closeKnowledge()
    return
  }

  if (event.key === 'Escape' && isToolboxOpen.value) {
    event.preventDefault()
    closeToolbox()
    return
  }

  const isEditing = isEditableKeyboardTarget(event.target)

  if (!isEditing && event.key === 'F1') {
    event.preventDefault()
    openToolbox()
    return
  }

  if (activeWorkspaceTab.value !== 'order') {
    return
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    void submitCounterOrder()
    return
  }

  if (isEditing) {
    if (event.key === 'Escape' && event.target === searchInput.value && searchTerm.value) {
      event.preventDefault()
      searchTerm.value = ''
    }

    return
  }

  if (event.key === '/') {
    event.preventDefault()
    focusMenuSearch()
    return
  }

  if (event.key === 'Escape' && searchTerm.value) {
    event.preventDefault()
    searchTerm.value = ''
    return
  }

  if (/^[1-6]$/.test(event.key) && !event.altKey && !event.metaKey && !event.ctrlKey) {
    const item = quickAddItems.value[Number(event.key) - 1]
    if (item) {
      event.preventDefault()
      addItem(item)
    }
  }
}

const setWorkspaceTab = (tab: WorkspaceTab): void => {
  activeCartQuickEditor.value = null
  activeWorkspaceTab.value = tab
}

const resetQueueFilters = (): void => {
  queueFilter.value = 'active'
  queuePaymentFilter.value = 'all'
  queueDateFilter.value = 'all'
  queueServiceFilter.value = 'all'
  queueSourceFilter.value = 'all'
  queueFulfillmentFilter.value = 'all'
  queueSortMode.value = 'fulfillment-asc'
  queueSearchTerm.value = ''
}

const showOnlineReminderOrders = (): void => {
  queueFilter.value = 'active'
  queuePaymentFilter.value = 'all'
  queueDateFilter.value = 'all'
  queueServiceFilter.value = 'all'
  queueSourceFilter.value = 'all'
  queueFulfillmentFilter.value = 'all'
  queueSortMode.value = 'fulfillment-asc'
  queueSearchTerm.value = '未確認'
  setWorkspaceTab('queue')
}

const orderNeedsOnlineReminder = (order: PosOrder): boolean => activeOnlineReminderIds.value.has(order.id)

const applyQueueFulfillmentFilter = (filter: QueueFulfillmentFilter): void => {
  queueFulfillmentFilter.value = filter
  if (filter === 'all') {
    return
  }

  queueFilter.value = 'active'
  queueDateFilter.value = 'today'
  queueSortMode.value = 'fulfillment-asc'
  queueSearchTerm.value = ''
}

const showFulfillmentAlertOrders = (filter: QueueFulfillmentFilter): void => {
  queueFilter.value = 'active'
  queuePaymentFilter.value = 'all'
  queueDateFilter.value = 'today'
  queueServiceFilter.value = 'all'
  queueSourceFilter.value = 'all'
  queueFulfillmentFilter.value = filter
  queueSortMode.value = 'fulfillment-asc'
  queueSearchTerm.value = ''
  setWorkspaceTab('queue')
}

const runQueueTaskAction = (action: QueueTaskAction): void => {
  queueFilter.value = 'active'
  queuePaymentFilter.value = 'all'
  queueDateFilter.value = 'all'
  queueServiceFilter.value = 'all'
  queueSourceFilter.value = 'all'
  queueFulfillmentFilter.value = 'all'
  queueSortMode.value = 'fulfillment-asc'
  queueSearchTerm.value = ''
  expandedOrderId.value = null

  if (action.id === 'fulfillment-alerts') {
    queueDateFilter.value = 'today'
    queueFulfillmentFilter.value = queueFulfillmentAlert.value.count === 0
      ? 'scheduled'
      : queueFulfillmentAlert.value.overdueCount > 0 ? 'overdue' : 'due-soon'
  }

  if (action.id === 'pending-payments') {
    queuePaymentFilter.value = 'pending'
  }

  if (action.id === 'ready-orders') {
    queueFilter.value = 'ready'
  }

  if (action.id === 'online-unconfirmed') {
    queueSearchTerm.value = '未確認'
  }

  if (action.id === 'print-issues') {
    queueFilter.value = 'all'
    queueDateFilter.value = 'today'
    queueSearchTerm.value = '列印失敗'
  }

  setWorkspaceTab('queue')
}

const startTakeoutOrder = (): void => {
  serviceMode.value = 'takeout'
  setWorkspaceTab('order')
}

const setActiveView = (view: AppView): void => {
  if (isNativeApp) {
    activeView.value = 'pos'
    activeWorkspaceTab.value = 'queue'
    globalThis.history.replaceState(null, '', globalThis.location.pathname)
    return
  }

  activeView.value = view
  if (view === 'pos') {
    activeWorkspaceTab.value = 'queue'
  }

  if (isConsumerDomain) {
    return
  }

  const params = new URLSearchParams(globalThis.location.search)
  params.set('view', view === 'online' ? 'order' : view)
  globalThis.history.replaceState(null, '', `${globalThis.location.pathname}?${params.toString()}`)
}

const loadStationProducts = (): void => {
  void loadProductStatusCatalog(stationPin.value.trim())
}

const toggleStationProduct = (product: MenuItem): void => {
  void updateProductAvailability(stationPin.value.trim(), product.id, !product.available)
}

const stationBatchProductIdSet = computed(() => new Set(stationBatchProductIds.value))
const isStationBatchBusy = computed(() => stationBatchProductIds.value.length > 0)
const stationProductIsBusy = (product: MenuItem): boolean =>
  togglingProductId.value === product.id || stationBatchProductIdSet.value.has(product.id)

const updateVisibleStationProducts = async (isAvailable: boolean): Promise<void> => {
  if (isStationBatchBusy.value) {
    return
  }

  const targetProducts = visibleStationProducts.value.filter((product) => product.available !== isAvailable)
  if (targetProducts.length === 0) {
    return
  }

  stationBatchProductIds.value = targetProducts.map((product) => product.id)
  for (const product of targetProducts) {
    await updateProductAvailability(stationPin.value.trim(), product.id, isAvailable)
  }
  stationBatchProductIds.value = []
}

const openRegisterSessionAction = (): void => {
  void openRegisterSessionForStation(registerPin.value.trim(), registerOpeningCash.value, registerNote.value.trim())
}

const closeRegisterSessionAction = (): void => {
  void closeRegisterSessionForStation(
    registerPin.value.trim(),
    registerClosingCash.value,
    registerNote.value.trim(),
    forceCloseRegister.value,
  )
}

watch(
  registerSession,
  (session) => {
    if (session?.status === 'open') {
      registerClosingCash.value = session.expectedCash
      forceCloseRegister.value = false
    }
  },
  { immediate: true },
)

watch(
  [
    queueFilter,
    queuePaymentFilter,
    queueDateFilter,
    queueServiceFilter,
    queueSourceFilter,
    queueFulfillmentFilter,
    queueSortMode,
    queueSearchTerm,
  ],
  ([filter, paymentFilter, dateFilter, serviceFilter, sourceFilter, fulfillmentFilter, sortMode, searchTerm]) => {
    writeSavedQueueView({
      filter,
      paymentFilter,
      dateFilter,
      serviceFilter,
      sourceFilter,
      fulfillmentFilter,
      sortMode,
      searchTerm: searchTerm.trim().slice(0, 80),
    })
  },
)

watch(
  filteredKnowledgeArticles,
  (articles) => {
    if (!articles.some((article) => article.id === activeKnowledgeArticleId.value)) {
      activeKnowledgeArticleId.value = articles[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(posUiPreferences, (preferences) => {
  writePosUiPreferences(preferences)
}, { deep: true })

onMounted(() => {
  globalThis.addEventListener('keydown', handlePosShortcut)
  claimClockTimer = globalThis.setInterval(() => {
    currentTime.value = Date.now()
  }, 15_000)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', handlePosShortcut)
  if (claimClockTimer !== null) {
    globalThis.clearInterval(claimClockTimer)
  }
})
</script>

<template>
  <main class="pos-shell" :class="{ 'pos-shell--consumer': activeView === 'online' }">
    <header v-if="activeView !== 'pos'" class="topbar">
      <div class="brand">
        <img :src="brandLogoSrc" alt="Script Coffee" class="brand-logo" />
        <div>
          <p class="eyebrow">Script Coffee</p>
          <h1>{{ pageTitle }}</h1>
          <span class="brand-subtitle">{{ pageSubtitle }}</span>
        </div>
      </div>

      <div v-if="showInternalHeaderControls" class="topbar-actions">
        <div v-if="canSwitchWorkspace" class="view-switch" aria-label="工作區切換">
          <button
            class="view-switch-button"
            type="button"
            @click="setActiveView('pos')"
          >
            <LayoutDashboard :size="18" aria-hidden="true" />
            POS
          </button>
          <button
            class="view-switch-button"
            :class="{ 'view-switch-button--active': activeView === 'online' }"
            type="button"
            @click="setActiveView('online')"
          >
            <ShoppingBag :size="18" aria-hidden="true" />
            線上
          </button>
          <button
            class="view-switch-button"
            :class="{ 'view-switch-button--active': activeView === 'admin' }"
            type="button"
            @click="setActiveView('admin')"
          >
            <Settings2 :size="18" aria-hidden="true" />
            後台
          </button>
        </div>
        <span v-else-if="isNativeApp" class="status-pill status-pill--success">
          <LockKeyhole :size="18" aria-hidden="true" />
          APK 工作站
        </span>

        <div v-if="activeView !== 'online'" class="topbar-status" aria-label="POS 狀態">
          <span class="status-pill status-pill--neutral" :title="stationHeartbeatMessage">
            <LockKeyhole :size="18" aria-hidden="true" />
            {{ stationClaimLabel }}
          </span>
          <span
            class="status-pill"
            :class="backendStatus.mode === 'fallback' ? 'status-pill--danger' : 'status-pill--success'"
            :title="backendStatus.detail"
          >
            <Wifi :size="18" aria-hidden="true" />
            {{ backendStatus.label }}
          </span>
          <span class="status-pill" :class="printStation.online ? 'status-pill--success' : 'status-pill--danger'">
            <Printer :size="18" aria-hidden="true" />
            {{ printStation.host }}:{{ printStation.port }}
          </span>
          <span class="status-pill">
            <Clock3 :size="18" aria-hidden="true" />
            {{ queueHealth }}
          </span>
          <button
            class="icon-button sync-button"
            :class="{ 'sync-button--active': backendStatus.mode === 'syncing' }"
            type="button"
            title="重新同步 POS API"
            :disabled="backendStatus.mode === 'syncing'"
            @click="refreshBackendData"
          >
            <RefreshCw :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

    <ConsumerOrderPage v-if="activeView === 'online'" />

    <template v-else-if="activeView === 'pos'">
      <section
        class="pos-workbench"
        :class="[
          {
            'pos-workbench--ordering': activeWorkspaceTab === 'order',
            'pos-workbench--compact': posUiPreferences.density === 'compact',
            'pos-workbench--text-large': posUiPreferences.textScale === 'large',
          },
        ]"
        aria-label="門市 POS 工作站"
      >
        <aside v-show="activeWorkspaceTab !== 'order'" class="pos-side-rail" aria-label="POS 主選單">
          <div class="side-brand">
            <img :src="brandLogoSrc" alt="Script Coffee" class="side-brand-logo" />
            <div>
              <span>Script Coffee</span>
              <strong>門市 POS</strong>
            </div>
          </div>

          <div v-if="canSwitchWorkspace" class="side-mode-switch" aria-label="系統模式">
            <button
              class="side-mode-button side-mode-button--active"
              type="button"
              aria-current="page"
              @click="setActiveView('pos')"
            >
              <LayoutDashboard :size="18" aria-hidden="true" />
              POS
            </button>
            <button class="side-mode-button" type="button" @click="setActiveView('online')">
              <ShoppingBag :size="18" aria-hidden="true" />
              線上
            </button>
            <button class="side-mode-button" type="button" @click="setActiveView('admin')">
              <Settings2 :size="18" aria-hidden="true" />
              後台
            </button>
          </div>

          <span v-else-if="isNativeApp" class="side-station-pill">
            <LockKeyhole :size="18" aria-hidden="true" />
            APK 工作站
          </span>

          <nav class="workstation-tabs quick-nav-bar" aria-label="快速導航列">
            <button
              class="workstation-tab quick-nav-button"
              :class="{ 'workstation-tab--active': activeWorkspaceTab === 'order' }"
              type="button"
              :aria-current="activeWorkspaceTab === 'order' ? 'page' : undefined"
              @click="setWorkspaceTab('order')"
            >
              <ShoppingCart :size="20" aria-hidden="true" />
              <span>
                <strong>點餐</strong>
                <small>{{ workspaceTabSummaries.order }}</small>
              </span>
            </button>
            <button
              class="workstation-tab quick-nav-button"
              :class="{ 'workstation-tab--active': activeWorkspaceTab === 'details' }"
              type="button"
              :aria-current="activeWorkspaceTab === 'details' ? 'page' : undefined"
              @click="setWorkspaceTab('details')"
            >
              <Settings2 :size="20" aria-hidden="true" />
              <span>
                <strong>資訊</strong>
                <small>{{ workspaceTabSummaries.details }}</small>
              </span>
            </button>
            <button
              class="workstation-tab quick-nav-button"
              :class="{ 'workstation-tab--active': activeWorkspaceTab === 'payment' }"
              type="button"
              :aria-current="activeWorkspaceTab === 'payment' ? 'page' : undefined"
              @click="setWorkspaceTab('payment')"
            >
              <CreditCard :size="20" aria-hidden="true" />
              <span>
                <strong>付款</strong>
                <small>{{ workspaceTabSummaries.payment }}</small>
              </span>
            </button>
            <button
              class="workstation-tab quick-nav-button"
              :class="{ 'workstation-tab--active': activeWorkspaceTab === 'queue' }"
              type="button"
              :aria-current="activeWorkspaceTab === 'queue' ? 'page' : undefined"
              @click="setWorkspaceTab('queue')"
            >
              <ReceiptText :size="20" aria-hidden="true" />
              <span>
                <strong>訂單</strong>
                <small>{{ workspaceTabSummaries.queue }}</small>
              </span>
            </button>
            <button
              class="workstation-tab quick-nav-button"
              :class="{ 'workstation-tab--active': activeWorkspaceTab === 'printing' }"
              type="button"
              :aria-current="activeWorkspaceTab === 'printing' ? 'page' : undefined"
              @click="setWorkspaceTab('printing')"
            >
              <Printer :size="20" aria-hidden="true" />
              <span>
                <strong>列印</strong>
                <small>{{ workspaceTabSummaries.printing }}</small>
              </span>
            </button>
            <button
              class="workstation-tab quick-nav-button"
              :class="{ 'workstation-tab--active': activeWorkspaceTab === 'closeout' }"
              type="button"
              :aria-current="activeWorkspaceTab === 'closeout' ? 'page' : undefined"
              @click="setWorkspaceTab('closeout')"
            >
              <WalletCards :size="20" aria-hidden="true" />
              <span>
                <strong>班別</strong>
                <small>{{ workspaceTabSummaries.closeout }}</small>
              </span>
            </button>
          </nav>

          <div class="side-rail-footer">
            <span>{{ currentClockLabel }}</span>
            <button
              class="icon-button side-toolbox-button"
              type="button"
              title="開啟工具箱"
              aria-controls="pos-toolbox-modal"
              :aria-expanded="isToolboxOpen"
              @click="openToolbox"
            >
              <MoreHorizontal :size="18" aria-hidden="true" />
            </button>
            <button
              class="icon-button sync-button"
              :class="{ 'sync-button--active': backendStatus.mode === 'syncing' }"
              type="button"
              title="重新同步 POS API"
              :disabled="backendStatus.mode === 'syncing'"
              @click="refreshBackendData"
            >
              <RefreshCw :size="18" aria-hidden="true" />
            </button>
          </div>
        </aside>

        <section
          class="pos-main-surface"
          :class="{ 'pos-main-surface--ordering': activeWorkspaceTab === 'order' }"
        >
          <header
            v-if="activeWorkspaceTab !== 'order'"
            class="pos-command-bar"
            :class="{ 'pos-command-bar--queue': activeWorkspaceTab === 'queue' }"
          >
            <div>
              <p class="eyebrow">{{ activeWorkspaceTab === 'queue' ? 'Orders' : 'Workspace' }}</p>
              <h1>{{ activeWorkspaceTitle }}</h1>
              <span v-if="activeWorkspaceTab === 'queue'">
                查詢訂單 · {{ queueFilterNote }}
              </span>
              <span v-else>{{ registerStatusLabel }} · {{ currentClockLabel }}</span>
            </div>
            <div v-if="activeWorkspaceTab === 'queue'" class="queue-command-actions">
              <span>{{ pendingOrders.length }} 張待處理</span>
              <button class="primary-button queue-new-order-button" type="button" @click="startTakeoutOrder">
                <ShoppingBag :size="22" aria-hidden="true" />
                新增外帶
              </button>
            </div>
            <div v-else class="pos-command-status" aria-label="POS 狀態">
              <span class="status-pill status-pill--neutral" :title="stationHeartbeatMessage">
                <LockKeyhole :size="18" aria-hidden="true" />
                {{ stationClaimLabel }}
              </span>
              <span
                class="status-pill"
                :class="backendStatus.mode === 'fallback' ? 'status-pill--danger' : 'status-pill--success'"
                :title="backendStatus.detail"
              >
                <Wifi :size="18" aria-hidden="true" />
                {{ backendStatus.label }}
              </span>
              <span class="status-pill" :class="printStation.online ? 'status-pill--success' : 'status-pill--danger'">
                <Printer :size="18" aria-hidden="true" />
                {{ printStation.host }}:{{ printStation.port }}
              </span>
              <span class="status-pill">
                <Clock3 :size="18" aria-hidden="true" />
                {{ queueHealth }}
              </span>
            </div>
          </header>

          <section class="workspace" :class="`workspace--${activeWorkspaceTab}`" aria-label="POS 工作台">
            <template v-if="activeWorkspaceTab === 'order'">
              <section class="cart-panel" aria-labelledby="cart-title">
                <div class="ticket-topline">
                  <button class="ticket-back-button" type="button" title="返回訂單查詢" @click="setWorkspaceTab('queue')">
                    <ChevronLeft :size="38" aria-hidden="true" />
                  </button>
                  <div class="ticket-title-block">
                    <h2 id="cart-title">{{ serviceModeLabels[serviceMode] }}</h2>
                    <span>新單 · 今天 {{ currentClockLabel }}</span>
                  </div>
                  <button
                    class="icon-button ticket-calendar-button"
                    type="button"
                    title="設定顧客與取餐時間"
                    aria-controls="cart-customer-editor"
                    :aria-expanded="activeCartQuickEditor === 'customer'"
                    @click="toggleCartQuickEditor('customer')"
                  >
                    <CalendarDays :size="24" aria-hidden="true" />
                  </button>
                </div>

                <div class="ticket-order-strip">
                  <div>
                    <ReceiptText :size="22" aria-hidden="true" />
                    <strong>No. 新單</strong>
                  </div>
                  <div>
                    <strong>{{ formatCurrency(cartTotal) }}</strong>
                    <button class="icon-button ticket-clear-button" type="button" title="清空購物車" @click="clearCart">
                      <Trash2 :size="19" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <button
                  class="ticket-customer-row"
                  :class="{ 'ticket-customer-row--active': activeCartQuickEditor === 'customer' }"
                  type="button"
                  aria-controls="cart-customer-editor"
                  :aria-expanded="activeCartQuickEditor === 'customer'"
                  @click="toggleCartQuickEditor('customer')"
                >
                  <UserRound :size="28" aria-hidden="true" />
                  <span>
                    <strong>{{ customer.name || '未輸入顧客資訊' }}</strong>
                    <small>{{ customer.phone || customer.note || '點一下加入姓名、電話或備註' }}</small>
                  </span>
                </button>

                <div class="ticket-service-mode" aria-label="服務方式">
                  <button
                    v-for="mode in serviceModeOptions"
                    :key="`ticket-${mode.value}`"
                    :class="{ 'ticket-service-mode-button--active': serviceMode === mode.value }"
                    type="button"
                    @click="serviceMode = mode.value"
                  >
                    {{ mode.label }}
                  </button>
                </div>

                <div class="ticket-config-grid" aria-label="訂單設定">
                  <button
                    class="order-essential-action"
                    :class="{ 'order-essential-action--active': activeCartQuickEditor === 'payment' }"
                    type="button"
                    aria-controls="cart-payment-editor"
                    :aria-expanded="activeCartQuickEditor === 'payment'"
                    @click="toggleCartQuickEditor('payment')"
                  >
                    <span class="order-essential-label">
                      <CreditCard :size="15" aria-hidden="true" />
                      付款
                    </span>
                    <strong>{{ paymentLabels[paymentMethod] }}</strong>
                  </button>
                  <button
                    class="order-essential-action"
                    :class="{ 'order-essential-action--active': activeCartQuickEditor === 'service' }"
                    type="button"
                    aria-controls="cart-service-editor"
                    :aria-expanded="activeCartQuickEditor === 'service'"
                    @click="toggleCartQuickEditor('service')"
                  >
                    <span class="order-essential-label">
                      <ShoppingBag :size="15" aria-hidden="true" />
                      方式
                    </span>
                    <strong>{{ serviceModeLabels[serviceMode] }}</strong>
                  </button>
                </div>

                <div class="ticket-note-chips" aria-label="常用備註">
                  <button v-for="note in noteSnippets" :key="`ticket-${note}`" type="button" @click="appendCustomerNote(note)">
                    {{ note }}
                  </button>
                </div>

                <div v-if="activeCartQuickEditor" class="cart-inline-editor" aria-live="polite">
                  <div
                    v-if="activeCartQuickEditor === 'customer'"
                    id="cart-customer-editor"
                    class="cart-inline-panel cart-inline-panel--customer"
                  >
                    <label>
                      姓名
                      <input
                        ref="customerNameInput"
                        v-model="customer.name"
                        type="text"
                        autocomplete="name"
                        @keydown.enter="closeCartQuickEditor"
                        @keydown.escape="closeCartQuickEditor"
                      />
                    </label>
                    <label>
                      電話
                      <input
                        v-model="customer.phone"
                        type="tel"
                        autocomplete="tel"
                        @keydown.enter="closeCartQuickEditor"
                        @keydown.escape="closeCartQuickEditor"
                      />
                    </label>
                    <button class="cart-inline-done" type="button" @click="closeCartQuickEditor">
                      <CheckCircle2 :size="18" aria-hidden="true" />
                      完成
                    </button>
                  </div>

                  <div
                    v-else-if="activeCartQuickEditor === 'service'"
                    id="cart-service-editor"
                    class="cart-inline-panel cart-inline-options"
                    aria-label="直接修改服務方式"
                  >
                    <button
                      v-for="mode in serviceModeOptions"
                      :key="`cart-${mode.value}`"
                      class="segment-button"
                      :class="{ 'segment-button--active': serviceMode === mode.value }"
                      type="button"
                      @click="selectCartServiceMode(mode.value)"
                    >
                      {{ mode.label }}
                    </button>
                  </div>

                  <div
                    v-else-if="activeCartQuickEditor === 'payment'"
                    id="cart-payment-editor"
                    class="cart-inline-panel cart-inline-options cart-inline-options--payment"
                    aria-label="直接修改付款方式"
                  >
                    <button
                      v-for="payment in visiblePaymentOptions"
                      :key="`cart-${payment.value}`"
                      class="payment-button"
                      :class="{ 'payment-button--active': paymentMethod === payment.value }"
                      type="button"
                      @click="selectCartPaymentMethod(payment.value)"
                    >
                      <CreditCard :size="18" aria-hidden="true" />
                      {{ payment.label }}
                    </button>
                  </div>
                </div>

                <div class="cart-lines" aria-live="polite">
                  <article v-for="line in cartLines" :key="line.itemId" class="cart-line">
                    <div>
                      <h3>{{ line.name }}</h3>
                      <p>{{ line.options.join(' / ') || '標準' }}</p>
                    </div>
                    <div class="quantity-stepper" :aria-label="`${line.name} 數量`">
                      <button type="button" title="減少" @click="decreaseLine(line.itemId)">
                        <Minus :size="16" aria-hidden="true" />
                      </button>
                      <input
                        class="quantity-input"
                        type="number"
                        min="0"
                        max="999"
                        inputmode="numeric"
                        :aria-label="`${line.name} 數量`"
                        :value="line.quantity"
                        @input="updateCartQuantityInput(line.itemId, $event)"
                        @change="commitCartQuantityInput(line.itemId, $event)"
                        @keydown.enter.stop="blurQuantityInput"
                        @keydown.escape.stop="blurQuantityInput"
                      />
                      <button type="button" title="增加" @click="increaseLine(line.itemId)">
                        <Plus :size="16" aria-hidden="true" />
                      </button>
                    </div>
                    <strong>{{ formatCurrency(line.unitPrice * line.quantity) }}</strong>
                  </article>

                  <div v-if="cartLines.length === 0" class="empty-state">
                    <ShoppingCart :size="24" aria-hidden="true" />
                    <span>尚未加入品項</span>
                  </div>
                </div>

                <footer class="checkout-bar checkout-bar--ticket">
                  <button
                    class="primary-button ticket-submit-button"
                    type="button"
                    :disabled="cartLines.length === 0 || isSubmitting"
                    @click="submitCounterOrder"
                  >
                    <Printer :size="22" aria-hidden="true" />
                    {{ isSubmitting ? '建立中' : '出單' }}
                  </button>
                  <div class="ticket-total-summary">
                    <span>{{ cartQuantity }} 件</span>
                    <strong>{{ formatCurrency(cartTotal) }}</strong>
                  </div>
                  <button
                    class="icon-button ticket-more-button"
                    type="button"
                    title="開啟工具箱"
                    aria-controls="pos-toolbox-modal"
                    :aria-expanded="isToolboxOpen"
                    @click="openToolbox"
                  >
                    <MoreHorizontal :size="24" aria-hidden="true" />
                  </button>
                </footer>
              </section>

              <section class="menu-panel" aria-labelledby="menu-title">
                <div class="menu-panel-heading">
                  <div>
                    <p class="eyebrow">Menu</p>
                    <h2 id="menu-title">商品菜單</h2>
                    <span class="panel-note">顯示 {{ filteredMenu.length }} 個可售品項</span>
                  </div>
                  <label class="search-box menu-search-box">
                    <Search :size="18" aria-hidden="true" />
                    <input ref="searchInput" v-model="searchTerm" type="search" placeholder="搜尋品項或標籤" />
                  </label>
                </div>

                <div class="menu-workarea">
                  <aside class="category-rail" aria-label="品項分類">
                    <span class="category-rail-icon">
                      <MenuIcon :size="26" aria-hidden="true" />
                    </span>
                    <button
                      v-for="category in categoryOptions"
                      :key="category.value"
                      class="category-rail-button"
                      :class="{ 'category-rail-button--active': selectedCategory === category.value }"
                      type="button"
                      @click="selectedCategory = category.value"
                    >
                      {{ category.label }}
                    </button>
                  </aside>

                  <div class="catalog-panel">
                    <div class="catalog-meta">
                      <span>{{ selectedCategoryLabel }} · 點選商品加入訂單</span>
                      <strong>{{ filteredMenu.length }} 項</strong>
                    </div>

                    <div v-if="quickAddItems.length > 0" class="quick-add-strip" aria-label="快速加購">
                      <button
                        v-for="(item, index) in quickAddItems"
                        :key="item.id"
                        class="quick-add-button"
                        type="button"
                        @click="addItem(item)"
                      >
                        <span class="quick-add-rank">{{ index + 1 }}</span>
                        <span class="quick-add-name">{{ item.name }}</span>
                        <strong>{{ formatCurrency(item.price) }}</strong>
                        <span v-if="lineQuantityByItem(item.id) > 0" class="quick-add-count">
                          x{{ lineQuantityByItem(item.id) }}
                        </span>
                      </button>
                    </div>

                    <div class="product-grid">
                      <article
                        v-for="item in filteredMenu"
                        :key="item.id"
                        class="product-tile"
                        :class="{ 'product-tile--in-cart': lineQuantityByItem(item.id) > 0 }"
                      >
                        <button class="product-tile-main" type="button" @click="addItem(item)">
                          <span class="product-tile-top">
                            <span class="product-swatch" :style="{ backgroundColor: item.accent }" aria-hidden="true"></span>
                            <span class="product-category">{{ categoryLabels[item.category] }}</span>
                          </span>
                          <span class="product-name">{{ item.name }}</span>
                          <span class="product-meta">
                            <strong>{{ formatCurrency(item.price) }}</strong>
                            <span>{{ lineQuantityByItem(item.id) > 0 ? `已加 ${lineQuantityByItem(item.id)}` : '點選加入' }}</span>
                          </span>
                          <span v-if="productStockLabel(item)" class="product-stock-badge" :class="productStockClass(item)">
                            {{ productStockLabel(item) }}
                          </span>
                          <span class="product-tags">{{ item.tags.join(' / ') }}</span>
                        </button>
                        <div v-if="lineQuantityByItem(item.id) > 0" class="product-quantity-control" :aria-label="`${item.name} 數量`">
                          <button
                            type="button"
                            title="減少數量"
                            :disabled="lineQuantityByItem(item.id) === 0"
                            @click="decreaseLine(item.id)"
                          >
                            <Minus :size="15" aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="999"
                            inputmode="numeric"
                            :aria-label="`${item.name} 數量`"
                            :value="lineQuantityByItem(item.id) || ''"
                            placeholder="0"
                            @input="updateProductQuantityInput(item, $event)"
                            @change="commitProductQuantityInput(item, $event)"
                            @keydown.enter.stop="blurQuantityInput"
                            @keydown.escape.stop="blurQuantityInput"
                          />
                          <button type="button" title="增加數量" @click="addItem(item)">
                            <Plus :size="15" aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    </div>
                  </div>
                </div>
              </section>
            </template>

            <aside v-else class="queue-panel workstation-panel-stack" aria-label="工作站內容">
              <section v-if="activeWorkspaceTab === 'details'" class="order-info-section" aria-labelledby="order-info-title">
                <div class="panel-heading">
                  <div>
                    <p class="eyebrow">Order Info</p>
                    <h2 id="order-info-title">訂單資訊</h2>
                    <span class="panel-note">顧客、履約與備註集中在這裡設定</span>
                  </div>
                  <Settings2 :size="22" aria-hidden="true" />
                </div>

                <div class="segmented-control" aria-label="服務方式">
                  <button
                    v-for="mode in serviceModeOptions"
                    :key="mode.value"
                    class="segment-button"
                    :class="{ 'segment-button--active': serviceMode === mode.value }"
                    type="button"
                    @click="serviceMode = mode.value"
                  >
                    {{ mode.label }}
                  </button>
                </div>

                <div class="customer-grid order-info-grid">
                  <label>
                    姓名
                    <input v-model="customer.name" type="text" autocomplete="name" />
                  </label>
                  <label>
                    電話
                    <input v-model="customer.phone" type="tel" autocomplete="tel" />
                  </label>
                  <label>
                    預計時間
                    <input v-model="customer.requestedFulfillmentAt" type="datetime-local" />
                  </label>
                  <label v-if="serviceMode === 'delivery'" class="wide-field">
                    外送地址
                    <input v-model="customer.deliveryAddress" type="text" autocomplete="street-address" />
                  </label>
                  <label class="wide-field">
                    備註
                    <textarea v-model="customer.note" rows="4" />
                  </label>
                </div>

                <div class="note-shortcuts" aria-label="常用備註">
                  <button v-for="note in noteSnippets" :key="note" type="button" @click="appendCustomerNote(note)">
                    {{ note }}
                  </button>
                </div>
              </section>

              <section v-if="activeWorkspaceTab === 'payment'" class="payment-section" aria-labelledby="payment-title">
                <div class="panel-heading">
                  <div>
                    <p class="eyebrow">Payment</p>
                    <h2 id="payment-title">付款</h2>
                    <span class="panel-note">確認付款方式後送出目前訂單</span>
                  </div>
                  <CreditCard :size="22" aria-hidden="true" />
                </div>

                <div class="payment-list payment-list--focused" aria-label="付款方式">
                  <button
                    v-for="payment in visiblePaymentOptions"
                    :key="payment.value"
                    class="payment-button"
                    :class="{ 'payment-button--active': paymentMethod === payment.value }"
                    type="button"
                    @click="paymentMethod = payment.value"
                  >
                    <CreditCard :size="18" aria-hidden="true" />
                    {{ payment.label }}
                  </button>
                </div>

                <div class="payment-summary-grid" aria-label="付款摘要">
                  <article>
                    <span>品項</span>
                    <strong>{{ cartQuantity }} 件</strong>
                  </article>
                  <article>
                    <span>顧客</span>
                    <strong>{{ customer.name || '現場客' }}</strong>
                  </article>
                  <article>
                    <span>方式</span>
                    <strong>{{ serviceModeLabels[serviceMode] }}</strong>
                  </article>
                  <article>
                    <span>合計</span>
                    <strong>{{ formatCurrency(cartTotal) }}</strong>
                  </article>
                </div>

                <div class="payment-order-lines">
                  <article v-for="line in cartLines" :key="`payment-${line.itemId}`">
                    <span>{{ line.name }}</span>
                    <strong>x{{ line.quantity }}</strong>
                    <strong>{{ formatCurrency(line.unitPrice * line.quantity) }}</strong>
                  </article>
                  <div v-if="cartLines.length === 0" class="empty-state payment-empty-state">
                    <ShoppingCart :size="24" aria-hidden="true" />
                    <span>尚未加入品項</span>
                  </div>
                </div>

                <footer class="checkout-bar checkout-bar--panel">
                  <div>
                    <span>{{ paymentLabels[paymentMethod] }}</span>
                    <strong>{{ formatCurrency(cartTotal) }}</strong>
                  </div>
                  <button
                    class="primary-button"
                    type="button"
                    :disabled="cartLines.length === 0 || isSubmitting"
                    @click="submitCounterOrder"
                  >
                    <ReceiptText :size="20" aria-hidden="true" />
                    {{ isSubmitting ? '建立中' : '建立訂單' }}
                  </button>
                </footer>
              </section>

              <section v-if="activeWorkspaceTab === 'queue'" class="queue-section">
                <div class="panel-heading">
                  <div>
                    <p class="eyebrow">Orders</p>
                    <h2 id="queue-title">
                      查詢訂單（有 {{ visibleQueueOrders.length }} 筆符合條件，總共 {{ queueBaseOrders.length }} 筆）
                    </h2>
                    <span class="panel-note">依狀態、付款與關鍵字快速查詢</span>
                  </div>
                  <button class="queue-reset-button" type="button" @click="resetQueueFilters">
                    重設篩選條件
                  </button>
                </div>

                <div class="segmented-control queue-filter" aria-label="訂單篩選">
                  <button
                    v-for="filter in queueFilterOptions"
                    :key="filter.value"
                    class="segment-button queue-filter-button"
                    :class="{ 'segment-button--active': queueFilter === filter.value }"
                    type="button"
                    @click="queueFilter = filter.value"
                  >
                    <span>{{ filter.label }}</span>
                    <strong>{{ filter.count }}</strong>
                  </button>
                </div>

                <section
                  v-if="onlineOrderReminder.activeOverdueCount > 0"
                  class="online-reminder-banner"
                  aria-live="assertive"
                >
                  <div class="online-reminder-summary">
                    <CircleAlert :size="22" aria-hidden="true" />
                    <div>
                      <p class="eyebrow">Online Alert</p>
                      <h3>{{ onlineOrderReminder.activeOverdueCount }} 張線上/掃碼新單未確認</h3>
                      <span>
                        {{ onlineReminderThresholdLabel }} · {{ onlineReminderToneLabel }} ·
                        目前 {{ onlineOrderReminder.unconfirmedCount }} 張等待接手
                      </span>
                      <small v-if="onlineOrderReminder.audioMessage">{{ onlineOrderReminder.audioMessage }}</small>
                    </div>
                  </div>
                  <div class="online-reminder-actions">
                    <button type="button" @click="acknowledgeOnlineOrderReminders">已讀提醒</button>
                    <button class="primary-button" type="button" @click="showOnlineReminderOrders">
                      <ReceiptText :size="18" aria-hidden="true" />
                      查看訂單
                    </button>
                  </div>
                </section>

                <section
                  v-if="queueFulfillmentAlert.count > 0"
                  class="fulfillment-alert-banner"
                  :class="queueFulfillmentAlert.isOverdue ? 'fulfillment-alert-banner--overdue' : 'fulfillment-alert-banner--soon'"
                  aria-live="polite"
                >
                  <div class="fulfillment-alert-summary">
                    <Clock3 :size="22" aria-hidden="true" />
                    <div>
                      <p class="eyebrow">Pickup Time</p>
                      <h3>{{ queueFulfillmentAlertTitle }}</h3>
                      <span>
                        已逾時 {{ queueFulfillmentAlert.overdueCount }} 張 ·
                        {{ fulfillmentAlertWindowMinutes }} 分鐘內 {{ queueFulfillmentAlert.dueSoonCount }} 張
                      </span>
                    </div>
                  </div>
                  <div class="fulfillment-alert-actions">
                    <button
                      type="button"
                      :disabled="queueFulfillmentAlert.overdueCount === 0"
                      @click="showFulfillmentAlertOrders('overdue')"
                    >
                      已逾時
                    </button>
                    <button
                      type="button"
                      :disabled="queueFulfillmentAlert.dueSoonCount === 0"
                      @click="showFulfillmentAlertOrders('due-soon')"
                    >
                      {{ fulfillmentAlertWindowMinutes }} 分內
                    </button>
                    <button class="primary-button" type="button" @click="showFulfillmentAlertOrders('scheduled')">
                      <CalendarDays :size="18" aria-hidden="true" />
                      已排程
                    </button>
                  </div>
                </section>

                <section class="queue-task-strip" aria-label="訂單任務快篩">
                  <button
                    v-for="action in queueTaskActions"
                    :key="action.id"
                    class="queue-task-card"
                    :class="`queue-task-card--${action.tone}`"
                    type="button"
                    :aria-label="`${action.label}${action.count}張，${action.actionLabel}`"
                    @click="runQueueTaskAction(action)"
                  >
                    <span>{{ action.label }}</span>
                    <strong>{{ action.count }}</strong>
                    <small>{{ action.detail }}</small>
                    <em>{{ action.actionLabel }}</em>
                  </button>
                </section>

                <div class="queue-tools">
                  <label class="search-box queue-search">
                    <Search :size="18" aria-hidden="true" />
                    <input v-model="queueSearchTerm" type="search" placeholder="搜尋單號、客名、電話或品項" />
                  </label>
                  <div class="segmented-control queue-payment-filter" aria-label="付款狀態篩選">
                    <button
                      v-for="filter in queuePaymentFilterOptions"
                      :key="filter.value"
                      class="segment-button queue-filter-button"
                      :class="{ 'segment-button--active': queuePaymentFilter === filter.value }"
                      type="button"
                      @click="queuePaymentFilter = filter.value"
                    >
                      <span>{{ filter.label }}</span>
                      <strong>{{ filter.count }}</strong>
                    </button>
                  </div>
                  <div class="queue-advanced-filters" aria-label="訂單進階篩選">
                    <label>
                      <span>日期</span>
                      <select v-model="queueDateFilter">
                        <option v-for="filter in queueDateFilterOptions" :key="filter.value" :value="filter.value">
                          {{ filter.label }}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>方式</span>
                      <select v-model="queueServiceFilter">
                        <option v-for="filter in queueServiceFilterOptions" :key="filter.value" :value="filter.value">
                          {{ filter.label }}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>來源</span>
                      <select v-model="queueSourceFilter">
                        <option v-for="filter in queueSourceFilterOptions" :key="filter.value" :value="filter.value">
                          {{ filter.label }}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>排序</span>
                      <select v-model="queueSortMode">
                        <option v-for="sort in queueSortOptions" :key="sort.value" :value="sort.value">
                          {{ sort.label }}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div class="segmented-control queue-fulfillment-filter" aria-label="履約時段篩選">
                    <button
                      v-for="filter in queueFulfillmentFilterOptions"
                      :key="filter.value"
                      class="segment-button queue-fulfillment-button"
                      :class="{ 'segment-button--active': queueFulfillmentFilter === filter.value }"
                      type="button"
                      @click="applyQueueFulfillmentFilter(filter.value)"
                    >
                      <span>{{ filter.label }}</span>
                      <strong>{{ filter.count }}</strong>
                    </button>
                  </div>
                </div>

                <div
                  v-for="order in visibleQueueOrders"
                  :key="order.id"
                  class="swipe-row order-swipe-row"
                  :class="swipeRowClass(orderSwipeKey(order))"
                >
                  <div
                    class="swipe-action swipe-action--danger"
                    aria-hidden="true"
                    inert
                    :class="{ 'swipe-action--disabled': orderSwipeDeleteDisabled(order) }"
                  >
                    <Trash2 :size="18" aria-hidden="true" />
                    {{ orderSwipeDeleteLabel(order) }}
                  </div>
                  <article
                    class="order-row swipe-card"
                    :class="[
                      `order-row--${order.status}`,
                      fulfillmentRowClass(order),
                      {
                        'order-row--claimed-other': orderClaimedByOtherStation(order),
                        'order-row--online-reminder': orderNeedsOnlineReminder(order),
                      },
                    ]"
                    :style="swipeCardStyle(orderSwipeKey(order))"
                    @pointerdown="startSwipe(orderSwipeKey(order), $event)"
                    @pointermove="moveSwipe(orderSwipeKey(order), $event)"
                    @pointerup="endOrderSwipe(order)"
                    @pointercancel="cancelSwipe(orderSwipeKey(order))"
                  >
                    <div class="order-row-main">
                      <div class="order-row-title">
                        <span class="order-id">{{ order.id }}</span>
                        <span class="order-row-title-chips">
                          <span v-if="claimLabelFor(order)" class="claim-chip" :class="claimChipClass(order)">
                            <LockKeyhole :size="13" aria-hidden="true" />
                            {{ claimLabelFor(order) }}
                          </span>
                          <span v-if="orderPendingSync(order)" class="sync-chip">
                            <Clock3 :size="13" aria-hidden="true" />
                            本機待同步
                          </span>
                          <span v-if="orderNeedsOnlineReminder(order)" class="online-reminder-chip">
                            <CircleAlert :size="13" aria-hidden="true" />
                            未確認
                          </span>
                          <span
                            v-if="fulfillmentUrgencyLabel(order)"
                            class="fulfillment-chip"
                            :class="fulfillmentUrgencyClass(order)"
                          >
                            <Clock3 :size="13" aria-hidden="true" />
                            {{ fulfillmentUrgencyLabel(order) }}
                          </span>
                          <span class="status-chip" :class="statusClass(order.status)">{{ statusLabels[order.status] }}</span>
                        </span>
                      </div>
                      <strong>{{ order.customerName }}</strong>
                      <span>
                        {{ serviceModeLabels[order.mode] }} · {{ order.lines.length }} 項 ·
                        {{ formatOrderTime(order.createdAt) }} · {{ formatRelativeMinutes(order.createdAt) }}
                      </span>
                      <small v-if="fulfillmentLabel(order)" class="order-fulfillment" :class="fulfillmentUrgencyClass(order)">
                        {{ fulfillmentLabel(order) }}
                      </small>
                    </div>
                    <div class="order-row-meta">
                      <span>{{ formatCurrency(order.subtotal) }}</span>
                      <span>{{ paymentLabels[order.paymentMethod] }} / {{ paymentStatusLabels[order.paymentStatus] }}</span>
                      <span :class="{ 'order-print-summary--failed': order.printStatus === 'failed' }">
                        {{ printSummary(order) }}
                      </span>
                    </div>
                    <div class="order-actions">
                      <button
                        v-if="paymentActionLabel(order)"
                        class="order-action--payment"
                        type="button"
                        :disabled="paymentActionDisabled(order)"
                        @click="confirmPaymentAction(order)"
                      >
                        <CreditCard :size="16" aria-hidden="true" />
                        {{ paymentActionLabel(order) }}
                      </button>
                      <button
                        class="order-action--print"
                        type="button"
                        :disabled="printingOrderId === order.id || orderClaimedByOtherStation(order)"
                        @click="printOrder(order.id)"
                      >
                        <Printer :size="16" aria-hidden="true" />
                        {{ printActionLabel(order) }}
                      </button>
                      <button
                        class="order-action--claim"
                        type="button"
                        :class="{ 'order-action--active': orderClaimedByCurrentStation(order) }"
                        :disabled="claimActionDisabled(order)"
                        @click="claimOrderAction(order)"
                      >
                        <LockKeyhole :size="16" aria-hidden="true" />
                        {{ claimActionLabel(order) }}
                      </button>
                      <button
                        v-if="orderCanBeVoided(order)"
                        class="order-action--void"
                        type="button"
                        :disabled="voidingOrderId === order.id"
                        @click="voidOrderAction(order)"
                      >
                        <Trash2 :size="16" aria-hidden="true" />
                        {{ voidActionLabel(order) }}
                      </button>
                      <button
                        v-if="orderCanBeRefunded(order)"
                        class="order-action--refund"
                        type="button"
                        :disabled="refundingOrderId === order.id"
                        @click="refundOrderAction(order)"
                      >
                        <WalletCards :size="16" aria-hidden="true" />
                        {{ refundActionLabel(order) }}
                      </button>
                      <button
                        class="order-action--detail"
                        type="button"
                        :class="{ 'order-action--active': expandedOrderId === order.id }"
                        @click="toggleOrderDetail(order)"
                      >
                        <ReceiptText :size="16" aria-hidden="true" />
                        明細
                      </button>
                      <button
                        v-for="action in statusActions"
                        :key="action.value"
                        :class="{ 'order-action--active': order.status === action.value }"
                        type="button"
                        :disabled="order.status === action.value || orderClaimedByOtherStation(order)"
                        @click="updateOrderStatus(order.id, action.value)"
                      >
                        {{ action.label }}
                      </button>
                    </div>
                    <div v-if="expandedOrderId === order.id" class="order-detail-panel">
                      <div class="order-detail-grid">
                        <span>來源</span>
                        <strong>{{ sourceLabels[order.source] }}</strong>
                        <span>電話</span>
                        <strong>{{ order.customerPhone || '未留' }}</strong>
                        <span>付款</span>
                        <strong>{{ paymentLabels[order.paymentMethod] }} / {{ paymentStatusLabels[order.paymentStatus] }}</strong>
                        <span>履約</span>
                        <strong>{{ fulfillmentLabel(order) || serviceModeLabels[order.mode] }}</strong>
                        <span>備註</span>
                        <strong>{{ order.note || '無' }}</strong>
                      </div>
                      <div class="order-detail-lines">
                        <article v-for="line in order.lines" :key="`${order.id}-${line.itemId}`">
                          <div>
                            <strong>{{ line.name }}</strong>
                            <span>{{ line.options.join(' / ') || '標準' }}</span>
                          </div>
                          <span>x{{ line.quantity }}</span>
                          <strong>{{ formatCurrency(line.unitPrice * line.quantity) }}</strong>
                        </article>
                      </div>
                    </div>
                  </article>
                </div>

                <div v-if="visibleQueueOrders.length === 0" class="empty-state queue-empty-state">
                  <ReceiptText :size="24" aria-hidden="true" />
                  <span>目前沒有符合條件的訂單</span>
                </div>
              </section>

              <section v-if="activeWorkspaceTab === 'printing'" class="station-section" aria-labelledby="station-title">
                <div class="panel-heading">
                  <div>
                    <p class="eyebrow">Station</p>
                    <h2 id="station-title">前台操作</h2>
                    <span class="panel-note">
                      {{ availableStationProducts }} 個可售 · {{ stoppedStationProducts }} 個暫停 ·
                      {{ lowStockStationProducts.length }} 個低庫存
                    </span>
                  </div>
                </div>

                <div class="station-pin-row">
                  <label>
                    PIN
                    <input v-model="stationPin" type="password" inputmode="numeric" autocomplete="off" placeholder="管理 PIN" />
                  </label>
                  <button type="button" :disabled="isLoadingProductStatus" @click="loadStationProducts">
                    <RefreshCw :size="16" aria-hidden="true" />
                    {{ isLoadingProductStatus ? '載入中' : '載入' }}
                  </button>
                </div>

                <p class="station-message">{{ productStatusMessage }}</p>

                <div class="station-filter-panel" aria-label="供應狀態篩選與批次操作">
                  <label class="search-box station-search">
                    <Search :size="18" aria-hidden="true" />
                    <input v-model="stationSearchTerm" type="search" placeholder="搜尋商品、SKU 或標籤" />
                  </label>
                  <div class="station-filter-grid">
                    <label>
                      <span>分類</span>
                      <select v-model="stationCategoryFilter">
                        <option v-for="category in categoryOptions" :key="`station-${category.value}`" :value="category.value">
                          {{ category.label }}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>狀態</span>
                      <select v-model="stationAvailabilityFilter">
                        <option
                          v-for="filter in stationAvailabilityFilterOptions"
                          :key="filter.value"
                          :value="filter.value"
                        >
                          {{ filter.label }}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div class="station-batch-actions">
                    <span>{{ stationFilterSummary }}</span>
                    <button
                      type="button"
                      :disabled="isStationBatchBusy || stationFilteredAvailableProducts.length === 0"
                      @click="updateVisibleStationProducts(false)"
                    >
                      <EyeOff :size="16" aria-hidden="true" />
                      暫停篩選結果
                    </button>
                    <button
                      type="button"
                      :disabled="isStationBatchBusy || stationFilteredStoppedProducts.length === 0"
                      @click="updateVisibleStationProducts(true)"
                    >
                      <Eye :size="16" aria-hidden="true" />
                      恢復篩選結果
                    </button>
                  </div>
                </div>

                <div class="station-product-list" aria-label="前台商品狀態">
                  <article v-for="product in visibleStationProducts" :key="product.id" class="station-product-row">
                    <span class="product-swatch" :style="{ backgroundColor: product.accent }" aria-hidden="true"></span>
                    <span>
                      <strong>{{ product.name }}</strong>
                      <small>
                        {{ categoryLabels[product.category] }} · {{ formatCurrency(product.price) }}
                        <template v-if="productStockLabel(product)"> · {{ productStockLabel(product) }}</template>
                      </small>
                    </span>
                    <button
                      type="button"
                      :class="{ 'station-product-toggle--stopped': !product.available }"
                      :disabled="stationProductIsBusy(product)"
                      @click="toggleStationProduct(product)"
                    >
                      <RefreshCw v-if="stationProductIsBusy(product)" :size="16" aria-hidden="true" />
                      <EyeOff v-else-if="product.available" :size="16" aria-hidden="true" />
                      <Eye v-else :size="16" aria-hidden="true" />
                      {{ stationProductIsBusy(product) ? '更新中' : product.available ? '暫停' : '恢復' }}
                    </button>
                  </article>
                  <div v-if="visibleStationProducts.length === 0" class="empty-state station-empty-state">
                    <EyeOff :size="22" aria-hidden="true" />
                    <span>沒有符合條件的商品</span>
                  </div>
                </div>
              </section>

              <section v-if="activeWorkspaceTab === 'printing'" class="printer-section">
                <div class="panel-heading">
                  <div>
                    <p class="eyebrow">LAN Printing</p>
                    <h2>列印站</h2>
                    <span class="panel-note">最後列印：{{ lastPrintTime }}</span>
                  </div>
                  <button class="icon-button" type="button" title="送出測試列印" @click="sendPrinterHealthcheck">
                    <Printer :size="20" aria-hidden="true" />
                  </button>
                </div>

                <div class="printer-health">
                  <CheckCircle2 v-if="printStation.online" :size="20" aria-hidden="true" />
                  <CircleAlert v-else :size="20" aria-hidden="true" />
                  <div>
                    <strong>{{ printStation.name }}</strong>
                    <span>{{ printStation.protocol }}</span>
                  </div>
                </div>

                <label class="toggle-row">
                  <input v-model="printStation.autoPrint" type="checkbox" />
                  自動列印新訂單
                </label>

                <div class="print-job-panel" aria-label="列印單列表">
                  <div class="print-job-heading">
                    <strong>列印單</strong>
                    <span>{{ printJobRows.length }} 筆</span>
                  </div>

                  <div v-if="printJobRows.length > 0" class="print-job-list">
                    <div
                      v-for="row in printJobRows"
                      :key="row.key"
                      class="swipe-row print-job-swipe-row"
                      :class="swipeRowClass(row.key)"
                    >
                      <div
                        class="swipe-action swipe-action--danger"
                        aria-hidden="true"
                        inert
                        :class="{ 'swipe-action--disabled': printJobDeleteDisabled(row) }"
                      >
                        <Trash2 :size="18" aria-hidden="true" />
                        {{ printJobDeleteLabel(row) }}
                      </div>
                      <article
                        class="print-job-row swipe-card"
                        :style="swipeCardStyle(row.key)"
                        @pointerdown="startSwipe(row.key, $event)"
                        @pointermove="moveSwipe(row.key, $event)"
                        @pointerup="endPrintJobSwipe(row)"
                        @pointercancel="cancelSwipe(row.key)"
                      >
                        <div class="print-job-main">
                          <strong>{{ row.order.id }}</strong>
                          <span>{{ row.order.customerName }} · {{ formatOrderTime(row.job.createdAt) }}</span>
                          <small v-if="row.job.lastError">{{ row.job.lastError }}</small>
                        </div>
                        <span class="print-job-status" :class="`print-job-status--${row.job.status}`">
                          {{ printStatusLabels[row.job.status] }}
                        </span>
                        <span class="print-job-attempts">{{ row.job.attempts }}</span>
                        <button
                          class="print-job-delete-button"
                          type="button"
                          title="刪除列印單"
                          :disabled="printJobDeleteDisabled(row)"
                          @click="printJobDeleteAction(row)"
                        >
                          <Trash2 :size="16" aria-hidden="true" />
                        </button>
                      </article>
                    </div>
                  </div>

                  <div v-else class="empty-state print-job-empty-state">
                    <Printer :size="22" aria-hidden="true" />
                    <span>尚無列印單</span>
                  </div>
                </div>

                <pre class="print-preview">{{ lastPrintPreview }}</pre>
              </section>

              <section v-if="activeWorkspaceTab === 'closeout'" class="closeout-section" aria-labelledby="closeout-title">
                <div class="panel-heading">
                  <div>
                    <p class="eyebrow">Closeout</p>
                    <h2 id="closeout-title">關帳摘要</h2>
                    <span class="panel-note">
                      {{ todayOrders.length }} 張單 · 待收 {{ closeoutSummary.pendingCount }} 張
                    </span>
                  </div>
                  <WalletCards :size="22" aria-hidden="true" />
                </div>

                <div class="closeout-grid">
                  <article>
                    <span>已收</span>
                    <strong>{{ formatCurrency(closeoutSummary.collectedTotal) }}</strong>
                  </article>
                  <article>
                    <span>待收</span>
                    <strong>{{ formatCurrency(closeoutSummary.pendingTotal) }}</strong>
                  </article>
                  <article>
                    <span>付款異常</span>
                    <strong>{{ closeoutSummary.failedPaymentCount }}</strong>
                  </article>
                  <article>
                    <span>列印異常</span>
                    <strong>{{ closeoutSummary.failedPrintCount }}</strong>
                  </article>
                  <article>
                    <span>作廢</span>
                    <strong>{{ closeoutSummary.voidedCount }}</strong>
                  </article>
                </div>

                <section class="closeout-preflight" aria-labelledby="closeout-preflight-title">
                  <div class="closeout-preflight-heading">
                    <div>
                      <p class="eyebrow">Preflight</p>
                      <h3 id="closeout-preflight-title">交班預檢</h3>
                      <span>{{ closeoutPreflightSummary }}</span>
                    </div>
                    <span
                      class="closeout-preflight-status"
                      :class="closeoutPreflightReady ? 'closeout-preflight-status--ready' : 'closeout-preflight-status--danger'"
                    >
                      <CheckCircle2 v-if="closeoutPreflightReady" :size="16" aria-hidden="true" />
                      <CircleAlert v-else :size="16" aria-hidden="true" />
                      {{ closeoutPreflightReady ? '可關班' : '需處理' }}
                    </span>
                  </div>

                  <div class="closeout-preflight-list">
                    <article
                      v-for="item in closeoutPreflightItems"
                      :key="item.id"
                      class="closeout-preflight-item"
                      :class="`closeout-preflight-item--${item.status}`"
                    >
                      <span class="closeout-preflight-icon">
                        <CheckCircle2 v-if="item.status === 'ready'" :size="17" aria-hidden="true" />
                        <CircleAlert v-else :size="17" aria-hidden="true" />
                      </span>
                      <div>
                        <strong>{{ item.label }}</strong>
                        <small>{{ item.detail }}</small>
                      </div>
                      <button
                        type="button"
                        class="closeout-preflight-button"
                        :aria-label="`${item.label}${item.count}筆，${item.actionLabel}`"
                        @click="runCloseoutPreflightAction(item)"
                      >
                        <span>{{ item.count }}</span>
                        {{ item.actionLabel }}
                      </button>
                    </article>
                  </div>
                </section>

                <div class="payment-closeout-list" aria-label="付款方式對帳">
                  <article v-for="payment in paymentCloseoutRows" :key="payment.value">
                    <span>{{ payment.label }}</span>
                    <strong>{{ formatCurrency(payment.total) }}</strong>
                    <small>{{ payment.count }} 張<span v-if="payment.pending"> · 待收 {{ payment.pending }}</span></small>
                  </article>
                </div>

                <div class="register-session-panel" aria-label="班別開關帳">
                  <div class="register-session-heading">
                    <div>
                      <span>班別</span>
                      <strong>{{ registerStatusLabel }}</strong>
                      <small>{{ registerMessage }}</small>
                    </div>
                    <button
                      class="icon-button"
                      type="button"
                      title="重新載入班別"
                      :disabled="isRegisterBusy"
                      @click="loadRegisterSession"
                    >
                      <RefreshCw :size="18" aria-hidden="true" />
                    </button>
                  </div>

                  <div v-if="registerSession" class="register-metrics">
                    <article>
                      <span>預期現金</span>
                      <strong>{{ formatCurrency(registerSession.expectedCash) }}</strong>
                    </article>
                    <article>
                      <span>現金銷售</span>
                      <strong>{{ formatCurrency(registerSession.cashSales) }}</strong>
                    </article>
                    <article>
                      <span>非現金</span>
                      <strong>{{ formatCurrency(registerSession.nonCashSales) }}</strong>
                    </article>
                    <article>
                      <span>待收</span>
                      <strong>{{ formatCurrency(registerSession.pendingTotal) }}</strong>
                    </article>
                    <article>
                      <span>單數</span>
                      <strong>{{ registerSession.orderCount }}</strong>
                    </article>
                    <article>
                      <span>未交付</span>
                      <strong>{{ registerSession.openOrderCount }}</strong>
                    </article>
                    <article>
                      <span>付款異常</span>
                      <strong>{{ registerSession.failedPaymentCount }}</strong>
                    </article>
                    <article>
                      <span>列印失敗</span>
                      <strong>{{ registerSession.failedPrintCount }}</strong>
                    </article>
                    <article>
                      <span>作廢</span>
                      <strong>{{ registerSession.voidedOrderCount }}</strong>
                    </article>
                    <article :class="registerVarianceClass">
                      <span>現金差額</span>
                      <strong>{{ formatCurrency(registerVariance) }}</strong>
                    </article>
                  </div>

                  <div class="register-form-grid">
                    <label>
                      管理 PIN
                      <input v-model="registerPin" type="password" inputmode="numeric" autocomplete="off" />
                    </label>
                    <label v-if="!registerIsOpen">
                      開班現金
                      <input v-model.number="registerOpeningCash" type="number" min="0" step="1" inputmode="numeric" />
                    </label>
                    <label v-else>
                      實點現金
                      <input v-model.number="registerClosingCash" type="number" min="0" step="1" inputmode="numeric" />
                    </label>
                    <label class="wide-field">
                      備註
                      <input v-model="registerNote" type="text" placeholder="交接、差額或補充說明" />
                    </label>
                  </div>

                  <label v-if="registerHasCloseoutExceptions" class="toggle-row register-force-close">
                    <input v-model="forceCloseRegister" type="checkbox" />
                    異常仍要關班
                  </label>

                  <button
                    v-if="registerIsOpen"
                    class="register-action-button register-action-button--close"
                    type="button"
                    :disabled="isRegisterBusy"
                    @click="closeRegisterSessionAction"
                  >
                    <WalletCards :size="18" aria-hidden="true" />
                    {{ isRegisterBusy ? '關班中' : forceCloseRegister ? '強制關班' : '關班' }}
                  </button>
                  <button
                    v-else
                    class="register-action-button"
                    type="button"
                    :disabled="isRegisterBusy"
                    @click="openRegisterSessionAction"
                  >
                    <WalletCards :size="18" aria-hidden="true" />
                    {{ isRegisterBusy ? '開班中' : '開班' }}
                  </button>
                </div>
              </section>

              <section v-if="activeWorkspaceTab === 'queue' && activeOrder" class="active-order">
                <p class="eyebrow">Next</p>
                <div class="next-order-title">
                  <h2>{{ activeOrder.id }}</h2>
                  <span class="order-row-title-chips">
                    <span v-if="claimLabelFor(activeOrder)" class="claim-chip" :class="claimChipClass(activeOrder)">
                      <LockKeyhole :size="13" aria-hidden="true" />
                      {{ claimLabelFor(activeOrder) }}
                    </span>
                    <span v-if="orderPendingSync(activeOrder)" class="sync-chip">
                      <Clock3 :size="13" aria-hidden="true" />
                      本機待同步
                    </span>
                    <span class="status-chip" :class="statusClass(activeOrder.status)">
                      {{ statusLabels[activeOrder.status] }}
                    </span>
                  </span>
                </div>
                <p>{{ activeOrder.customerName }} · {{ activeOrderItemCount }} 件 · {{ activeOrder.note || '無備註' }}</p>
                <p v-if="fulfillmentLabel(activeOrder)" class="order-fulfillment">
                  {{ fulfillmentLabel(activeOrder) }}
                </p>
                <button
                  v-if="paymentActionLabel(activeOrder)"
                  class="active-order-payment-button"
                  type="button"
                  :disabled="paymentActionDisabled(activeOrder)"
                  @click="confirmPaymentAction(activeOrder)"
                >
                  <CreditCard :size="16" aria-hidden="true" />
                  {{ paymentActionLabel(activeOrder) }}
                </button>
                <button
                  v-if="orderCanBeVoided(activeOrder)"
                  class="active-order-void-button"
                  type="button"
                  :disabled="voidingOrderId === activeOrder.id"
                  @click="voidOrderAction(activeOrder)"
                >
                  <Trash2 :size="16" aria-hidden="true" />
                  {{ voidActionLabel(activeOrder) }}
                </button>
                <button
                  v-if="orderCanBeRefunded(activeOrder)"
                  class="active-order-refund-button"
                  type="button"
                  :disabled="refundingOrderId === activeOrder.id"
                  @click="refundOrderAction(activeOrder)"
                >
                  <WalletCards :size="16" aria-hidden="true" />
                  {{ refundActionLabel(activeOrder) }}
                </button>
                <button
                  class="active-order-print-button"
                  type="button"
                  :disabled="printingOrderId === activeOrder.id || orderClaimedByOtherStation(activeOrder)"
                  @click="printOrder(activeOrder.id)"
                >
                  <Printer :size="16" aria-hidden="true" />
                  {{ printingOrderId === activeOrder.id ? '出單中' : '立即出單' }}
                </button>
              </section>
            </aside>
          </section>
        </section>
      </section>
    </template>

    <AdminPanel v-else @refresh-pos="refreshBackendData" />

    <div
      v-if="isToolboxOpen"
      class="utility-modal-backdrop"
      @click.self="closeToolbox"
    >
      <section
        id="pos-toolbox-modal"
        class="utility-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="toolbox-title"
      >
        <header class="utility-modal-header">
          <button class="icon-button" type="button" title="關閉工具箱" @click="closeToolbox">
            <ChevronLeft :size="20" aria-hidden="true" />
          </button>
          <div>
            <p class="eyebrow">Toolbox</p>
            <h2 id="toolbox-title">工具箱</h2>
          </div>
          <button
            class="icon-button sync-button"
            :class="{ 'sync-button--active': backendStatus.mode === 'syncing' }"
            type="button"
            title="重新同步 POS API"
            :disabled="backendStatus.mode === 'syncing'"
            @click="runToolboxAction('sync')"
          >
            <RefreshCw :size="18" aria-hidden="true" />
          </button>
        </header>

        <div class="toolbox-grid" aria-label="常用工具">
          <button type="button" class="toolbox-card" @click="runToolboxAction('order')">
            <ShoppingCart :size="24" aria-hidden="true" />
            <strong>新增外帶</strong>
            <span>{{ workspaceTabSummaries.order }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('queue')">
            <ReceiptText :size="24" aria-hidden="true" />
            <strong>訂單查詢</strong>
            <span>{{ queueFilterNote }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('supply')">
            <Eye :size="24" aria-hidden="true" />
            <strong>供應狀態</strong>
            <span>{{ availableStationProducts }} 可售 · {{ stoppedStationProducts }} 暫停</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('printing')">
            <Printer :size="24" aria-hidden="true" />
            <strong>列印站</strong>
            <span>{{ printStation.online ? '在線' : '離線' }} · {{ printStation.host }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('closeout')">
            <WalletCards :size="24" aria-hidden="true" />
            <strong>班別關帳</strong>
            <span>{{ workspaceTabSummaries.closeout }}</span>
          </button>
          <button v-if="canSwitchWorkspace" type="button" class="toolbox-card" @click="runToolboxAction('admin')">
            <Settings2 :size="24" aria-hidden="true" />
            <strong>後台</strong>
            <span>商品 · 報表 · 權限</span>
          </button>
          <button v-if="canSwitchWorkspace" type="button" class="toolbox-card" @click="runToolboxAction('online')">
            <ShoppingBag :size="24" aria-hidden="true" />
            <strong>線上點餐</strong>
            <span>顧客入口預覽</span>
          </button>
          <button
            type="button"
            class="toolbox-card"
            aria-controls="pos-knowledge-modal"
            @click="runToolboxAction('knowledge')"
          >
            <BookOpenCheck :size="24" aria-hidden="true" />
            <strong>門市助手</strong>
            <span>搜尋 SOP 與操作流程</span>
          </button>
        </div>

        <section class="preference-panel" aria-labelledby="toolbox-preferences-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Display</p>
              <h2 id="toolbox-preferences-title">外觀</h2>
            </div>
            <Settings2 :size="20" aria-hidden="true" />
          </div>
          <div class="preference-grid">
            <div class="preference-group">
              <span>文字</span>
              <div class="segmented-control preference-segment" aria-label="文字大小">
                <button
                  type="button"
                  class="segment-button"
                  :class="{ 'segment-button--active': posUiPreferences.textScale === 'standard' }"
                  @click="posUiPreferences.textScale = 'standard'"
                >
                  標準
                </button>
                <button
                  type="button"
                  class="segment-button"
                  :class="{ 'segment-button--active': posUiPreferences.textScale === 'large' }"
                  @click="posUiPreferences.textScale = 'large'"
                >
                  放大
                </button>
              </div>
            </div>
            <div class="preference-group">
              <span>密度</span>
              <div class="segmented-control preference-segment" aria-label="畫面密度">
                <button
                  type="button"
                  class="segment-button"
                  :class="{ 'segment-button--active': posUiPreferences.density === 'comfortable' }"
                  @click="posUiPreferences.density = 'comfortable'"
                >
                  標準
                </button>
                <button
                  type="button"
                  class="segment-button"
                  :class="{ 'segment-button--active': posUiPreferences.density === 'compact' }"
                  @click="posUiPreferences.density = 'compact'"
                >
                  緊湊
                </button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>

    <div
      v-if="isKnowledgeOpen"
      class="utility-modal-backdrop"
      @click.self="closeKnowledge"
    >
      <section
        id="pos-knowledge-modal"
        class="utility-modal knowledge-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-title"
      >
        <header class="utility-modal-header">
          <button class="icon-button" type="button" title="關閉門市助手" @click="closeKnowledge">
            <ChevronLeft :size="20" aria-hidden="true" />
          </button>
          <div>
            <p class="eyebrow">SOP</p>
            <h2 id="knowledge-title">門市助手</h2>
          </div>
          <button class="icon-button" type="button" title="開啟工具箱" @click="openToolbox">
            <MoreHorizontal :size="18" aria-hidden="true" />
          </button>
        </header>

        <div class="knowledge-layout">
          <aside class="knowledge-index" aria-label="SOP 搜尋與清單">
            <label class="search-box knowledge-search">
              <Search :size="18" aria-hidden="true" />
              <input v-model="knowledgeSearchTerm" type="search" placeholder="搜尋 SOP、關鍵字或狀態" />
            </label>

            <div class="knowledge-category-row" aria-label="SOP 類別">
              <button
                v-for="category in knowledgeCategoryOptions"
                :key="category.value"
                type="button"
                :class="{ 'knowledge-category-button--active': knowledgeCategoryFilter === category.value }"
                class="knowledge-category-button"
                @click="knowledgeCategoryFilter = category.value"
              >
                <span>{{ category.label }}</span>
                <strong>{{ category.count }}</strong>
              </button>
            </div>

            <div class="knowledge-list">
              <button
                v-for="article in filteredKnowledgeArticles"
                :key="article.id"
                type="button"
                class="knowledge-list-button"
                :class="{ 'knowledge-list-button--active': activeKnowledgeArticle?.id === article.id }"
                @click="activeKnowledgeArticleId = article.id"
              >
                <span>{{ knowledgeCategoryLabels[article.category] }}</span>
                <strong>{{ article.title }}</strong>
                <small>{{ article.summary }}</small>
              </button>
              <div v-if="filteredKnowledgeArticles.length === 0" class="empty-state knowledge-empty-state">
                <BookOpenCheck :size="24" aria-hidden="true" />
                <span>沒有符合條件的 SOP</span>
              </div>
            </div>
          </aside>

          <article v-if="activeKnowledgeArticle" class="knowledge-article">
            <header class="knowledge-article-header">
              <p class="eyebrow">{{ knowledgeCategoryLabels[activeKnowledgeArticle.category] }}</p>
              <h3>{{ activeKnowledgeArticle.title }}</h3>
              <span>{{ activeKnowledgeArticle.summary }}</span>
            </header>

            <ol class="knowledge-steps">
              <li v-for="step in activeKnowledgeArticle.steps" :key="step">
                {{ step }}
              </li>
            </ol>

            <div class="knowledge-keywords" aria-label="SOP 關鍵字">
              <span v-for="keyword in activeKnowledgeArticle.keywords" :key="keyword">
                {{ keyword }}
              </span>
            </div>

            <button class="primary-button knowledge-target-button" type="button" @click="jumpToKnowledgeTarget(activeKnowledgeArticle)">
              前往{{ knowledgeTargetLabels[activeKnowledgeArticle.target] }}
            </button>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>
