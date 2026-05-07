<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  Filter,
  GripVertical,
  LayoutDashboard,
  LockKeyhole,
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
  X,
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
import { isPosApiConfigured, updateAdminSetting } from './lib/posApi'
import type {
  CartLine,
  MenuCategory,
  MenuItem,
  OnlineOrderingSettings,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PosAppearanceSettings,
  PosOrder,
  PrinterSettings,
  ProductSupplyStatus,
  PrintLabelMode,
  PrintJob,
  PrintRuleSetting,
  PrintStationSetting,
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
type ToolboxAction = 'order' | 'queue' | 'supply' | 'printing' | 'closeout' | 'admin' | 'online' | 'sync' | 'appearance'
type ToolboxPanel = 'home' | 'appearance'
type KnowledgeCategoryFilter = 'all' | PosKnowledgeCategory
type CloseoutPreflightStatus = 'ready' | 'warning' | 'danger'
type CloseoutPreflightAction = 'active-orders' | 'pending-payments' | 'payment-issues' | 'print-issues' | 'voided-orders'
type MenuOptionGroupId = string
type QueueAdminActionKind = 'void' | 'refund'
type SupplyCategoryFilter = MenuCategory | 'notes' | 'note-groups'
type SupplyStatusFilter = 'all' | ProductSupplyStatus
type TicketAction = 'checkout-print' | 'print' | 'checkout-only'
type CategoryMoveDirection = -1 | 1
type MenuCategoryOptionValue = 'all' | MenuCategory

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

interface PosUiPreferences extends PosAppearanceSettings {
  schemaVersion: 3
  interfaceScale: number
  densityScale: number
  textSize: number
  darkMode: boolean
  toolboxOpacity: number
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
  pointerId: number
  startX: number
  startY: number
  currentX: number
  hasPointerCapture: boolean
}

interface ToolboxPosition {
  x: number
  y: number
}

interface ToolboxDragState {
  pointerId: number
  startX: number
  startY: number
  startPosition: ToolboxPosition
  moved: boolean
}

interface ProductSortDragState {
  pointerId: number
  itemId: string
  startX: number
  startY: number
  dragging: boolean
  overItemId: string | null
  longPressTimer: number | null
}

interface CategorySortDragState {
  pointerId: number
  category: MenuCategoryOptionValue
  startX: number
  startY: number
  dragging: boolean
  overCategory: MenuCategory | null
  longPressTimer: number | null
}

interface MenuOptionChoice {
  id: string
  label: string
  priceDelta?: number
}

interface MenuOptionGroup {
  id: MenuOptionGroupId
  label: string
  requirement: string
  required: boolean
  min: number
  max: number
  choices: MenuOptionChoice[]
}

interface SupplyNoteItem {
  id: string
  choiceId: string
  name: string
  group: string
  groupIds: string[]
}

interface MenuCategoryDefinition {
  id: MenuCategory
  label: string
}

interface SupplyStatusRow {
  id: string
  kind: 'product' | 'note'
  name: string
  categoryLabel: string
  detail: string
  status: ProductSupplyStatus
  product?: MenuItem
  note?: SupplyNoteItem
}

interface SupplyStateSnapshot {
  label: string
  menuCategories: MenuCategoryDefinition[]
  availableNotes: MenuOptionChoice[]
  optionGroups: MenuOptionGroup[]
  productAssignments: Record<string, string[]>
  productStatuses: Record<string, ProductSupplyStatus>
  noteStatuses: Record<string, ProductSupplyStatus>
  products: MenuItem[]
  selectedCategory: SupplyCategoryFilter
}

const queueFilterStorageKey = 'script-coffee-pos-queue-view'
const posUiPreferenceStorageKey = 'script-coffee-pos-ui-preferences'
const backendEditModeStorageKey = 'script-coffee-pos-backend-edit-mode'
const toolboxPositionStorageKey = 'script-coffee-pos-toolbox-position'
const supplyProductStatusStorageKey = 'script-coffee-pos-supply-product-statuses'
const supplyNoteStatusStorageKey = 'script-coffee-pos-supply-note-statuses'
const menuCategoryStorageKey = 'script-coffee-pos-menu-categories'
const availableNoteStorageKey = 'script-coffee-pos-available-notes'
const optionGroupStorageKey = 'script-coffee-pos-option-groups'
const productOptionAssignmentStorageKey = 'script-coffee-pos-product-option-assignments'
const supplyNotesFilterValue = '__notes__'
const supplyNoteGroupsFilterValue = '__note_groups__'
const queueFilterValues: QueueFilter[] = ['active', 'ready', 'all']
const queuePaymentFilterValues: QueuePaymentFilter[] = ['all', 'pending', 'authorized', 'paid', 'issue']
const queueDateFilterValues: QueueDateFilter[] = ['today', 'older', 'all']
const queueFulfillmentFilterValues: QueueFulfillmentFilter[] = ['all', 'overdue', 'due-soon', 'scheduled']
const queueSortModeValues: QueueSortMode[] = ['fulfillment-asc', 'created-desc', 'amount-desc']
const serviceModeValues: ServiceMode[] = ['dine-in', 'takeout', 'delivery']
const orderSourceValues: OrderSource[] = ['counter', 'qr', 'online']
const productSupplyStatusValues: ProductSupplyStatus[] = ['normal', 'online-stopped', 'stopped']
const orderSwipeActionWidth = 208
const defaultSwipeActionWidth = 104
const swipeActionThreshold = 72
const fulfillmentAlertWindowMinutes = 15
const backendEditTapTarget = 6
const backendEditTapWindowMs = 3000
const toolboxDragThreshold = 6
const toolboxBackendEditLongPressMs = 2000
const interfaceScaleBaselineOffset = -20
const defaultToolboxPosition: ToolboxPosition = { x: 94, y: 86 }
const defaultPosUiPreferences: PosUiPreferences = {
  schemaVersion: 3,
  interfaceScale: 0,
  densityScale: 0,
  textSize: 0,
  darkMode: false,
  toolboxOpacity: 100,
}
const preferenceOffsetMin = -200
const preferenceOffsetMax = 200
const toolboxOpacityMin = 35
const toolboxOpacityMax = 100
const defaultConfigurableCategoryIds: MenuCategory[] = ['coffee', 'tea']
const defaultMenuCategoryDefinitions: MenuCategoryDefinition[] = [
  { id: 'coffee', label: '咖啡' },
  { id: 'tea', label: '茶飲' },
  { id: 'food', label: '輕食' },
  { id: 'retail', label: '零售' },
]

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

const isProductSupplyStatus = (value: unknown): value is ProductSupplyStatus =>
  typeof value === 'string' && productSupplyStatusValues.includes(value as ProductSupplyStatus)

const readSupplyStatusMap = (storageKey: string): Record<string, ProductSupplyStatus> => {
  try {
    const rawStatuses = globalThis.localStorage?.getItem(storageKey)
    if (!rawStatuses) {
      return {}
    }

    const parsed = JSON.parse(rawStatuses) as Record<string, unknown>
    return Object.entries(parsed).reduce<Record<string, ProductSupplyStatus>>((statuses, [key, value]) => {
      if (isProductSupplyStatus(value)) {
        statuses[key] = value
      }
      return statuses
    }, {})
  } catch {
    return {}
  }
}

const writeSupplyStatusMap = (storageKey: string, statuses: Record<string, ProductSupplyStatus>): void => {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(statuses))
  } catch {
    return
  }
}

const readStorageValue = <T,>(storageKey: string, fallback: T): T => {
  try {
    const rawValue = globalThis.localStorage?.getItem(storageKey)
    return rawValue ? JSON.parse(rawValue) as T : fallback
  } catch {
    return fallback
  }
}

const writeStorageValue = (storageKey: string, value: unknown): void => {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(value))
  } catch {
    return
  }
}

const clampPercent = (value: unknown, fallback: number, min = 4, max = 96): number => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, numericValue))
}

const normalizeToolboxPosition = (value: unknown): ToolboxPosition => {
  if (!value || typeof value !== 'object') {
    return { ...defaultToolboxPosition }
  }

  const source = value as Partial<ToolboxPosition>
  return {
    x: clampPercent(source.x, defaultToolboxPosition.x),
    y: clampPercent(source.y, defaultToolboxPosition.y),
  }
}

const readToolboxPosition = (): ToolboxPosition =>
  normalizeToolboxPosition(readStorageValue<unknown>(toolboxPositionStorageKey, defaultToolboxPosition))

const writeToolboxPosition = (position: ToolboxPosition): void => {
  writeStorageValue(toolboxPositionStorageKey, normalizeToolboxPosition(position))
}

const normalizeSpace = (value: string): string => value.trim().replace(/\s+/g, ' ')

const slugFromText = (value: string, fallbackPrefix: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 44)

  return slug || `${fallbackPrefix}-${Date.now().toString(36)}`
}

const uniqueId = (baseId: string, existingIds: Set<string>): string => {
  let nextId = baseId
  let index = 2
  while (existingIds.has(nextId)) {
    nextId = `${baseId}-${index}`
    index += 1
  }
  return nextId
}

const withoutRecordKey = <T,>(record: Record<string, T>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key))

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

const clampPreference = (value: unknown, fallback: number, min = preferenceOffsetMin, max = preferenceOffsetMax): number => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)))
}

const clampToolboxOpacityPreference = (value: unknown, fallback = defaultPosUiPreferences.toolboxOpacity): number =>
  clampPreference(value, fallback, toolboxOpacityMin, toolboxOpacityMax)

const migrateScalePercentToOffset = (value: unknown, fallback: number): number => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  return clampPreference(Math.round((numberValue - 100) * 10), fallback)
}

const normalizeSavedInterfaceScale = (value: unknown, fallback: number): number => {
  const offset = clampPreference(value, fallback)
  return offset === interfaceScaleBaselineOffset ? 0 : offset
}

const readPosUiPreferences = (): PosUiPreferences => {
  try {
    const rawPreferences = globalThis.localStorage?.getItem(posUiPreferenceStorageKey)
    if (!rawPreferences) {
      return { ...defaultPosUiPreferences }
    }

    const parsed = JSON.parse(rawPreferences) as Partial<PosUiPreferences> & Record<string, unknown>
    const parsedSchemaVersion = Number(parsed.schemaVersion)
    const isCurrentPreferenceSchema = parsedSchemaVersion === 2 || parsedSchemaVersion === 3
    const legacyDensityScale = parsed.density === 'compact' ? -80 : defaultPosUiPreferences.densityScale
    const legacyTextSize = parsed.textScale === 'large' ? 80 : defaultPosUiPreferences.textSize

    return {
      schemaVersion: 3,
      interfaceScale: normalizeSavedInterfaceScale(
        parsed.interfaceScale,
        migrateScalePercentToOffset(parsed.appearanceScale, defaultPosUiPreferences.interfaceScale),
      ),
      densityScale: isCurrentPreferenceSchema
        ? clampPreference(parsed.densityScale, defaultPosUiPreferences.densityScale)
        : migrateScalePercentToOffset(parsed.densityScale, legacyDensityScale),
      textSize: isCurrentPreferenceSchema
        ? clampPreference(parsed.textSize, defaultPosUiPreferences.textSize)
        : migrateScalePercentToOffset(parsed.textSize, legacyTextSize),
      darkMode: parsed.darkMode === true,
      toolboxOpacity: clampToolboxOpacityPreference(parsed.toolboxOpacity),
    }
  } catch {
    return { ...defaultPosUiPreferences }
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
  addConfiguredItem,
  addItem,
  acceptOnlineOrderForStation,
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
  counterDraftOrderId,
  counterDraftStartedAt,
  createProductForStation,
  customer,
  customerHasNote,
  deletingPrintJobId,
  decreaseLine,
  deleteOrderFromQueue,
  deleteProductForStation,
  deletePrintJobForOrder,
  filteredMenu,
  increaseLine,
  isSubmitting,
  isRegisterBusy,
  lastPrintPreview,
  menuCatalog,
  loadCounterOrderForEditing,
  loadRegisterSession,
  orderClaimExpired,
  orderClaimedByCurrentStation,
  orderClaimedByOtherStation,
  orderPendingSync,
  orderQueue,
  onlineOrderRequiresAcceptance,
  onlineOrderReminder,
  onlineOrderingSettings,
  paymentMethod,
  pendingOrders,
  posAppearanceSettings,
  printOrder,
  printingOrderId,
  printStation,
  printerSettings,
  productStatusCatalog,
  quickAddItems,
  refreshBackendData,
  registerMessage,
  registerSession,
  rejectOnlineOrderForStation,
  refundingOrderId,
  refundOrderForStation,
  releaseOrderClaimForStation,
  reorderProductsForStation,
  restoreSupplyProductSnapshot,
  searchTerm,
  selectedCategory,
  sendPrinterHealthcheck,
  serviceMode,
  saveCounterOrder,
  setItemQuantity,
  setLineQuantity,
  startCounterDraft,
  stationClaimLabel,
  stationHeartbeatMessage,
  togglingProductId,
  toggleCustomerNote,
  updateConfiguredLine,
  openRegisterSessionForStation,
  updateOrderStatus,
  updatePaymentStatus,
  updateProductSupplyStatus,
  updatingPaymentOrderId,
  voidingOrderId,
  voidOrderForStation,
} = usePosSession({ autoLoad: !isConsumerDomain })

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

const printLabelModeLabels: Record<PrintLabelMode, string> = {
  receipt: '收據',
  label: '貼紙',
  both: '收據 + 貼紙',
}

const printLabelModeOptions: Array<{ value: PrintLabelMode; label: string }> = [
  { value: 'label', label: '貼紙' },
  { value: 'receipt', label: '收據' },
  { value: 'both', label: '收據 + 貼紙' },
]

const noteSnippets = ['需要袋子']
const ticketNoteSnippets = ['需要袋子']
const beverageOptionGroups: MenuOptionGroup[] = [
  {
    id: 'temperature',
    label: '飲品溫度',
    requirement: '必選 1 個',
    required: true,
    min: 1,
    max: 1,
    choices: [
      { id: 'hot', label: '熱' },
      { id: 'regular-ice', label: '正常冰' },
      { id: 'less-ice', label: '少冰' },
      { id: 'light-ice', label: '微冰' },
      { id: 'no-ice', label: '去冰' },
      { id: 'fully-no-ice', label: '完全去冰' },
    ],
  },
  {
    id: 'beans',
    label: '選擇豆子(預設中焙)',
    requirement: '選填最多 1 個',
    required: false,
    min: 0,
    max: 1,
    choices: [
      { id: 'dark-roast', label: '換成深焙豆' },
      { id: 'single-origin', label: '換成單品豆', priceDelta: 20 },
    ],
  },
  {
    id: 'extras',
    label: '其他註記',
    requirement: '選填',
    required: false,
    min: 0,
    max: 3,
    choices: [
      { id: 'oat-milk', label: '換成燕麥奶', priceDelta: 20 },
      { id: 'no-sugar', label: '無糖' },
      { id: 'separate-bag', label: '分開裝' },
    ],
  },
]

const optionGroupRequirement = (group: Pick<MenuOptionGroup, 'required' | 'min' | 'max'>): string => {
  if (group.required) {
    return `必選 ${Math.max(1, group.min)} 個`
  }

  return group.max === 1 ? '選填最多 1 個' : `選填最多 ${Math.max(1, group.max)} 個`
}

const normalizeCategoryDefinitions = (value: unknown): MenuCategoryDefinition[] => {
  if (!Array.isArray(value)) {
    return [...defaultMenuCategoryDefinitions]
  }

  const seenIds = new Set<string>()
  const definitions = value.flatMap((entry): MenuCategoryDefinition[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const source = entry as Partial<MenuCategoryDefinition>
    const id = typeof source.id === 'string' ? normalizeSpace(source.id).slice(0, 40) : ''
    const label = typeof source.label === 'string' ? normalizeSpace(source.label).slice(0, 40) : id
    if (!id || seenIds.has(id)) {
      return []
    }

    seenIds.add(id)
    return [{ id, label: label || id }]
  })

  return definitions.length > 0 ? definitions : [...defaultMenuCategoryDefinitions]
}

const readMenuCategoryDefinitions = (): MenuCategoryDefinition[] =>
  normalizeCategoryDefinitions(readStorageValue<unknown>(menuCategoryStorageKey, null))

const writeMenuCategoryDefinitions = (definitions: MenuCategoryDefinition[]): void => {
  writeStorageValue(menuCategoryStorageKey, definitions)
}

const normalizeOptionGroups = (value: unknown): MenuOptionGroup[] => {
  if (!Array.isArray(value)) {
    return beverageOptionGroups.map((group) => ({ ...group, choices: group.choices.map((choice) => ({ ...choice })) }))
  }

  const seenGroupIds = new Set<string>()
  const groups = value.flatMap((entry): MenuOptionGroup[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const source = entry as Partial<MenuOptionGroup>
    const id = typeof source.id === 'string' ? normalizeSpace(source.id).slice(0, 64) : ''
    const label = typeof source.label === 'string' ? normalizeSpace(source.label).slice(0, 40) : ''
    const choices = Array.isArray(source.choices) ? source.choices : []
    if (!id || !label || seenGroupIds.has(id)) {
      return []
    }

    const seenChoiceIds = new Set<string>()
    const normalizedChoices = choices.flatMap((choice): MenuOptionChoice[] => {
      if (!choice || typeof choice !== 'object') {
        return []
      }

      const choiceSource = choice as Partial<MenuOptionChoice>
      const choiceId = typeof choiceSource.id === 'string' ? normalizeSpace(choiceSource.id).slice(0, 64) : ''
      const choiceLabel = typeof choiceSource.label === 'string' ? normalizeSpace(choiceSource.label).slice(0, 40) : ''
      if (!choiceId || !choiceLabel || seenChoiceIds.has(choiceId)) {
        return []
      }

      seenChoiceIds.add(choiceId)
      const normalizedChoice: MenuOptionChoice = {
        id: choiceId,
        label: choiceLabel,
      }
      if (typeof choiceSource.priceDelta === 'number' && Number.isFinite(choiceSource.priceDelta)) {
        normalizedChoice.priceDelta = Math.trunc(choiceSource.priceDelta)
      }
      return [normalizedChoice]
    })

    const max = Math.max(1, Math.trunc(Number(source.max) || 1))
    const required = Boolean(source.required)
    const min = required ? Math.max(1, Math.min(max, Math.trunc(Number(source.min) || 1))) : 0

    seenGroupIds.add(id)
    const requirement = typeof source.requirement === 'string' ? normalizeSpace(source.requirement).slice(0, 40) : ''

    return [{
      id,
      label,
      required,
      min,
      max,
      requirement: requirement || optionGroupRequirement({ required, min, max }),
      choices: normalizedChoices,
    }]
  })

  return groups.length > 0 ? groups : []
}

const readOptionGroups = (): MenuOptionGroup[] =>
  normalizeOptionGroups(readStorageValue<unknown>(optionGroupStorageKey, null))

const writeOptionGroups = (groups: MenuOptionGroup[]): void => {
  writeStorageValue(optionGroupStorageKey, groups)
}

const mergeOptionChoices = (choices: MenuOptionChoice[]): MenuOptionChoice[] => {
  const seenChoiceIds = new Set<string>()
  return choices.flatMap((choice): MenuOptionChoice[] => {
    const id = normalizeSpace(choice.id).slice(0, 64)
    const label = normalizeSpace(choice.label).slice(0, 40)
    if (!id || !label || seenChoiceIds.has(id)) {
      return []
    }

    seenChoiceIds.add(id)
    const normalizedChoice: MenuOptionChoice = { id, label }
    if (typeof choice.priceDelta === 'number' && Number.isFinite(choice.priceDelta)) {
      normalizedChoice.priceDelta = Math.trunc(choice.priceDelta)
    }
    return [normalizedChoice]
  })
}

const normalizeAvailableNotes = (value: unknown, groups: MenuOptionGroup[]): MenuOptionChoice[] => {
  const groupChoices = groups.flatMap((group) => group.choices)
  const storedChoices = Array.isArray(value) ? value.flatMap((entry): MenuOptionChoice[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const source = entry as Partial<MenuOptionChoice>
    const choice: MenuOptionChoice = {
      id: typeof source.id === 'string' ? source.id : '',
      label: typeof source.label === 'string' ? source.label : '',
    }
    if (typeof source.priceDelta === 'number') {
      choice.priceDelta = source.priceDelta
    }
    return [choice]
  }) : []

  return mergeOptionChoices([...storedChoices, ...groupChoices])
}

const readAvailableNotes = (groups: MenuOptionGroup[]): MenuOptionChoice[] =>
  normalizeAvailableNotes(readStorageValue<unknown>(availableNoteStorageKey, null), groups)

const writeAvailableNotes = (choices: MenuOptionChoice[]): void => {
  writeStorageValue(availableNoteStorageKey, choices)
}

const readProductOptionAssignments = (): Record<string, string[]> => {
  const parsed = readStorageValue<unknown>(productOptionAssignmentStorageKey, {})
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string[]>>((assignments, [productId, groupIds]) => {
    if (!Array.isArray(groupIds)) {
      return assignments
    }

    const uniqueIds = [
      ...new Set(groupIds.filter((groupId): groupId is string => typeof groupId === 'string' && groupId.trim().length > 0)),
    ]
    assignments[productId] = uniqueIds
    return assignments
  }, {})
}

const writeProductOptionAssignments = (assignments: Record<string, string[]>): void => {
  writeStorageValue(productOptionAssignmentStorageKey, assignments)
}

const supplyStatusOptions: Array<{ value: ProductSupplyStatus; label: string; detail: string }> = [
  { value: 'normal', label: '正常供應', detail: '現場 POS、線上與掃碼維持可販售' },
  { value: 'online-stopped', label: '線上停售', detail: '現場 POS 仍可販售，線上入口先隱藏' },
  { value: 'stopped', label: '全部停售', detail: '現場 POS 與線上入口都停止販售' },
]
const supplyStatusFilterOptions: Array<{ value: SupplyStatusFilter; label: string }> = [
  { value: 'all', label: '全部狀態' },
  ...supplyStatusOptions.map((status) => ({ value: status.value, label: status.label })),
]

const menuCategoryDefinitions = ref<MenuCategoryDefinition[]>(readMenuCategoryDefinitions())
const optionGroupCatalog = ref<MenuOptionGroup[]>(readOptionGroups())
const availableNoteCatalog = ref<MenuOptionChoice[]>(readAvailableNotes(optionGroupCatalog.value))
const productOptionAssignments = ref<Record<string, string[]>>(readProductOptionAssignments())
const newCategoryName = ref('')
const newProductName = ref('')
const newProductPrice = ref(0)
const newProductSku = ref('')
const newAvailableNoteName = ref('')
const newAvailableNotePriceDelta = ref(0)
const newOptionGroupName = ref('')
const newOptionGroupRequired = ref(false)
const newOptionGroupMax = ref(1)
const supplyActionMessage = ref('')
const supplyUndoStack = ref<SupplyStateSnapshot[]>([])
const supplyHasUnsavedChanges = ref(false)
const supplyUndoAvailable = computed(() => supplyUndoStack.value.length > 0)
const maxSupplyUndoSnapshots = 20

const cloneMenuCategories = (categories: MenuCategoryDefinition[]): MenuCategoryDefinition[] =>
  categories.map((category) => ({ ...category }))

const cloneOptionGroups = (groups: MenuOptionGroup[]): MenuOptionGroup[] =>
  groups.map((group) => ({
    ...group,
    choices: group.choices.map((choice) => ({ ...choice })),
  }))

const cloneOptionChoices = (choices: MenuOptionChoice[]): MenuOptionChoice[] =>
  choices.map((choice) => ({ ...choice }))

const cloneProducts = (products: MenuItem[]): MenuItem[] =>
  products.map((product) => ({ ...product, tags: [...product.tags] }))

const cloneProductAssignments = (assignments: Record<string, string[]>): Record<string, string[]> =>
  Object.entries(assignments).reduce<Record<string, string[]>>((copy, [productId, groupIds]) => {
    copy[productId] = [...groupIds]
    return copy
  }, {})

const currentSupplyProducts = (): MenuItem[] =>
  cloneProducts([
    ...new Map([...productStatusCatalog.value, ...menuCatalog.value].map((product) => [product.id, product])).values(),
  ])

const captureSupplySnapshot = (label: string): SupplyStateSnapshot => ({
  label,
  menuCategories: cloneMenuCategories(menuCategoryDefinitions.value),
  availableNotes: cloneOptionChoices(availableNoteCatalog.value),
  optionGroups: cloneOptionGroups(optionGroupCatalog.value),
  productAssignments: cloneProductAssignments(productOptionAssignments.value),
  productStatuses: { ...productSupplyStatuses.value },
  noteStatuses: { ...noteSupplyStatuses.value },
  products: currentSupplyProducts(),
  selectedCategory: supplyCategoryFilter.value,
})

const commitSupplyUndoSnapshot = (snapshot: SupplyStateSnapshot): void => {
  supplyUndoStack.value = [...supplyUndoStack.value, snapshot].slice(-maxSupplyUndoSnapshots)
  supplyHasUnsavedChanges.value = true
}

const pushSupplyUndo = (label: string): void => {
  commitSupplyUndoSnapshot(captureSupplySnapshot(label))
}

const restoreSupplySnapshot = (snapshot: SupplyStateSnapshot): void => {
  menuCategoryDefinitions.value = cloneMenuCategories(snapshot.menuCategories)
  availableNoteCatalog.value = cloneOptionChoices(snapshot.availableNotes)
  optionGroupCatalog.value = cloneOptionGroups(snapshot.optionGroups)
  productOptionAssignments.value = cloneProductAssignments(snapshot.productAssignments)
  productSupplyStatuses.value = { ...snapshot.productStatuses }
  noteSupplyStatuses.value = { ...snapshot.noteStatuses }
  restoreSupplyProductSnapshot(snapshot.products)
  supplyCategoryFilter.value = snapshot.selectedCategory
}

const undoLastSupplyAction = (): void => {
  const snapshot = supplyUndoStack.value.at(-1)
  if (!snapshot) {
    return
  }

  restoreSupplySnapshot(snapshot)
  supplyUndoStack.value = supplyUndoStack.value.slice(0, -1)
  supplyHasUnsavedChanges.value = true
  supplyActionMessage.value = `已回復：${snapshot.label}`
}

const onlineOptionGroupsForSync = (): OnlineOrderingSettings['menuOptionGroups'] =>
  cloneOptionGroups(optionGroupCatalog.value)

const onlineAvailableNotesForSync = (): OnlineOrderingSettings['availableOptionChoices'] =>
  cloneOptionChoices(availableNoteCatalog.value)

const onlineMenuCategoriesForSync = (): OnlineOrderingSettings['menuCategories'] =>
  cloneMenuCategories(menuCategoryDefinitions.value)

const onlineProductAssignmentsForSync = (): OnlineOrderingSettings['productOptionAssignments'] =>
  cloneProductAssignments(productOptionAssignments.value)

const runtimeSupplyConfigHasData = (settings: OnlineOrderingSettings): boolean =>
  settings.menuCategories.length > 0 ||
  settings.availableOptionChoices.length > 0 ||
  settings.menuOptionGroups.length > 0 ||
  Object.keys(settings.productOptionAssignments).length > 0 ||
  Object.keys(settings.noteSupplyStatuses).length > 0

const applyRuntimeSupplyConfig = (settings: OnlineOrderingSettings): void => {
  if (supplyHasUnsavedChanges.value || !runtimeSupplyConfigHasData(settings)) {
    return
  }

  const runtimeOptionGroups = normalizeOptionGroups(settings.menuOptionGroups)
  menuCategoryDefinitions.value = normalizeCategoryDefinitions(settings.menuCategories)
  optionGroupCatalog.value = runtimeOptionGroups
  availableNoteCatalog.value = normalizeAvailableNotes(settings.availableOptionChoices, runtimeOptionGroups)
  productOptionAssignments.value = cloneProductAssignments(settings.productOptionAssignments)
  noteSupplyStatuses.value = { ...settings.noteSupplyStatuses }
}

const saveSupplyChanges = async (): Promise<void> => {
  writeSupplyStatusMap(supplyProductStatusStorageKey, productSupplyStatuses.value)
  writeSupplyStatusMap(supplyNoteStatusStorageKey, noteSupplyStatuses.value)
  writeMenuCategoryDefinitions(menuCategoryDefinitions.value)
  writeAvailableNotes(availableNoteCatalog.value)
  writeOptionGroups(optionGroupCatalog.value)
  writeProductOptionAssignments(productOptionAssignments.value)

  if (!isPosApiConfigured) {
    supplyHasUnsavedChanges.value = true
    supplyActionMessage.value = '已暫存本機；需連線 POS API 後才會寫入資料庫'
    return
  }

  try {
    const syncedSettings = await updateAdminSetting<OnlineOrderingSettings>(
      'online_ordering',
      {
        ...onlineOrderingSettings.value,
        menuCategories: onlineMenuCategoriesForSync(),
        availableOptionChoices: onlineAvailableNotesForSync(),
        menuOptionGroups: onlineOptionGroupsForSync(),
        productOptionAssignments: onlineProductAssignmentsForSync(),
        noteSupplyStatuses: { ...noteSupplyStatuses.value },
      },
    )
    onlineOrderingSettings.value = syncedSettings
    supplyHasUnsavedChanges.value = false
    supplyActionMessage.value = '供應狀態、分類與註記已寫入資料庫'
  } catch (error) {
    const message = error instanceof Error ? error.message : '線上同步失敗'
    supplyHasUnsavedChanges.value = true
    supplyActionMessage.value = `已暫存本機；資料庫同步失敗：${message}`
  }
}

const persistMenuCategoryOrder = async (message: string): Promise<boolean> => {
  writeMenuCategoryDefinitions(menuCategoryDefinitions.value)
  supplyHasUnsavedChanges.value = true
  supplyActionMessage.value = message

  if (!isPosApiConfigured) {
    supplyActionMessage.value = `${message}，已暫存本機`
    return false
  }

  try {
    const syncedSettings = await updateAdminSetting<OnlineOrderingSettings>(
      'online_ordering',
      {
        ...onlineOrderingSettings.value,
        menuCategories: onlineMenuCategoriesForSync(),
        availableOptionChoices: onlineAvailableNotesForSync(),
        menuOptionGroups: onlineOptionGroupsForSync(),
        productOptionAssignments: onlineProductAssignmentsForSync(),
        noteSupplyStatuses: { ...noteSupplyStatuses.value },
      },
    )
    onlineOrderingSettings.value = syncedSettings
    supplyHasUnsavedChanges.value = false
    supplyActionMessage.value = `${message}，已寫入資料庫`
    return true
  } catch (error) {
    const failedReason = error instanceof Error ? error.message : '線上同步失敗'
    supplyHasUnsavedChanges.value = true
    supplyActionMessage.value = `${message}，資料庫同步失敗：${failedReason}`
    return false
  }
}

const categoryLabelFor = (category: MenuCategory): string =>
  menuCategoryDefinitions.value.find((definition) => definition.id === category)?.label ??
  categoryLabels[category] ??
  category

const menuCategoryOptions = computed<MenuCategoryDefinition[]>(() => {
  const definitions = new Map(menuCategoryDefinitions.value.map((definition) => [definition.id, definition]))

  for (const product of [...productStatusCatalog.value, ...menuCatalog.value]) {
    if (!definitions.has(product.category)) {
      definitions.set(product.category, {
        id: product.category,
        label: categoryLabels[product.category] ?? product.category,
      })
    }
  }

  return [...definitions.values()]
})

const categoryOptions = computed<Array<{ value: MenuCategoryOptionValue; label: string }>>(() => [
  { value: 'all', label: '全部' },
  ...menuCategoryOptions.value.map((category) => ({
    value: category.id,
    label: category.label,
  })),
])
const selectedCategoryLabel = computed(
  () => categoryOptions.value.find((category) => category.value === selectedCategory.value)?.label ?? '全部',
)
const selectedCategoryIndex = computed(() =>
  categoryOptions.value.findIndex((category) => category.value === selectedCategory.value),
)

const selectCategory = (category: MenuCategoryOptionValue): void => {
  selectedCategory.value = category
}

const productSortDragState = ref<ProductSortDragState | null>(null)
const categorySortDragState = ref<CategorySortDragState | null>(null)
const suppressProductTileClick = ref(false)
const suppressCategoryClick = ref(false)
const isProductSortPersisting = ref(false)
const isCategorySortPersisting = ref(false)
const sortDragLongPressMs = 420
const sortDragMoveTolerance = 10
let productSortSuppressTimer: number | null = null
let categorySortSuppressTimer: number | null = null

const isEditableMenuCategory = (category: MenuCategoryOptionValue): category is MenuCategory =>
  category !== 'all'

const categorySortEnabled = (category: MenuCategoryOptionValue): boolean =>
  backendEditModeEnabled.value && !isCategorySortPersisting.value && isEditableMenuCategory(category)

const suppressProductClickAfterSortGesture = (duration = 320): void => {
  if (productSortSuppressTimer !== null) {
    globalThis.clearTimeout(productSortSuppressTimer)
  }
  suppressProductTileClick.value = true
  productSortSuppressTimer = globalThis.setTimeout(() => {
    suppressProductTileClick.value = false
    productSortSuppressTimer = null
  }, duration)
}

const suppressCategoryClickAfterSortGesture = (duration = 320): void => {
  if (categorySortSuppressTimer !== null) {
    globalThis.clearTimeout(categorySortSuppressTimer)
  }
  suppressCategoryClick.value = true
  categorySortSuppressTimer = globalThis.setTimeout(() => {
    suppressCategoryClick.value = false
    categorySortSuppressTimer = null
  }, duration)
}

const clearCategorySortTimer = (state: CategorySortDragState | null = categorySortDragState.value): void => {
  if (state?.longPressTimer != null) {
    globalThis.clearTimeout(state.longPressTimer)
  }
}

const categoryFromPoint = (event: PointerEvent): MenuCategory | null => {
  const element = globalThis.document?.elementFromPoint(event.clientX, event.clientY)
  const target = element?.closest<HTMLElement>('[data-category-id]')
  const category = target?.dataset.categoryId

  return category && category !== 'all' ? (category as MenuCategory) : null
}

const swapMenuCategories = async (sourceId: MenuCategory, targetId: MenuCategory): Promise<void> => {
  if (sourceId === targetId || isCategorySortPersisting.value) {
    return
  }

  const currentIndex = menuCategoryDefinitions.value.findIndex((category) => category.id === sourceId)
  const targetIndex = menuCategoryDefinitions.value.findIndex((category) => category.id === targetId)
  if (currentIndex < 0 || targetIndex < 0) {
    return
  }

  pushSupplyUndo('調整分類順序')
  const nextDefinitions = cloneMenuCategories(menuCategoryDefinitions.value)
  const sourceCategory = nextDefinitions[currentIndex]
  const targetCategory = nextDefinitions[targetIndex]
  if (!sourceCategory || !targetCategory) {
    return
  }

  nextDefinitions[currentIndex] = targetCategory
  nextDefinitions[targetIndex] = sourceCategory
  menuCategoryDefinitions.value = nextDefinitions
  selectCategory(sourceId)

  isCategorySortPersisting.value = true
  try {
    const synced = await persistMenuCategoryOrder(`${sourceCategory.label} 已與 ${targetCategory.label} 交換位置`)
    if (synced) {
      await refreshBackendData()
    }
  } finally {
    isCategorySortPersisting.value = false
  }
}

const startCategorySortDrag = (category: MenuCategoryOptionValue, event: PointerEvent): void => {
  if (!categorySortEnabled(category) || event.button !== 0) {
    return
  }

  event.stopPropagation()
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const nextState: CategorySortDragState = {
    pointerId: event.pointerId,
    category,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    overCategory: null,
    longPressTimer: null,
  }
  nextState.longPressTimer = globalThis.setTimeout(() => {
    const current = categorySortDragState.value
    if (!current || current.pointerId !== event.pointerId) {
      return
    }

    categorySortDragState.value = {
      ...current,
      dragging: true,
      overCategory: null,
      longPressTimer: null,
    }
    suppressCategoryClickAfterSortGesture()
  }, sortDragLongPressMs)
  categorySortDragState.value = nextState
}

const moveCategorySortDrag = (event: PointerEvent): void => {
  const dragState = categorySortDragState.value
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return
  }

  const moved = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)
  if (!dragState.dragging && moved > sortDragMoveTolerance) {
    clearCategorySortTimer(dragState)
    categorySortDragState.value = null
    suppressCategoryClickAfterSortGesture()
    return
  }

  if (!dragState.dragging) {
    return
  }

  event.preventDefault()
  const overCategory = categoryFromPoint(event)
  categorySortDragState.value = {
    ...dragState,
    overCategory: overCategory && overCategory !== dragState.category ? overCategory : null,
  }
}

const finishCategorySortDrag = (event: PointerEvent): void => {
  const dragState = categorySortDragState.value
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return
  }

  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  clearCategorySortTimer(dragState)
  categorySortDragState.value = null
  if (dragState.dragging && dragState.overCategory && isEditableMenuCategory(dragState.category)) {
    event.preventDefault()
    void swapMenuCategories(dragState.category, dragState.overCategory)
  }

  if (dragState.dragging) {
    suppressCategoryClickAfterSortGesture()
  }
}

const cancelCategorySortDrag = (): void => {
  const wasDragging = categorySortDragState.value?.dragging ?? false
  clearCategorySortTimer()
  categorySortDragState.value = null
  if (wasDragging) {
    suppressCategoryClickAfterSortGesture()
  }
}

const handleCategoryClick = (category: MenuCategoryOptionValue): void => {
  if (suppressCategoryClick.value) {
    suppressCategoryClick.value = false
    return
  }

  selectCategory(category)
}

const switchCategoryByOffset = (offset: CategoryMoveDirection): void => {
  const currentIndex = selectedCategoryIndex.value
  if (currentIndex < 0) {
    selectCategory(categoryOptions.value[0]?.value ?? 'all')
    return
  }

  const nextCategory = categoryOptions.value[currentIndex + offset]
  if (nextCategory) {
    selectCategory(nextCategory.value)
  }
}

const categorySwipeState = ref<{
  pointerId: number
  startX: number
  startY: number
  horizontalIntent: boolean
} | null>(null)
const categorySwipeThreshold = 72
const suppressNextProductSelect = ref(false)

const startCategorySwipe = (event: PointerEvent): void => {
  if (
    event.target instanceof HTMLElement &&
    event.target.closest('.product-quantity-control, input, textarea, select, a')
  ) {
    return
  }

  categorySwipeState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    horizontalIntent: false,
  }
}

const moveCategorySwipe = (event: PointerEvent): void => {
  const swipe = categorySwipeState.value
  if (!swipe || swipe.pointerId !== event.pointerId) {
    return
  }

  const deltaX = event.clientX - swipe.startX
  const deltaY = event.clientY - swipe.startY
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)

  if (!swipe.horizontalIntent && absY > absX && absY > 14) {
    categorySwipeState.value = null
    return
  }

  if (absX > 16 && absX > absY * 1.25) {
    swipe.horizontalIntent = true
    event.preventDefault()
  }
}

const finishCategorySwipe = (event: PointerEvent): void => {
  const swipe = categorySwipeState.value
  if (!swipe || swipe.pointerId !== event.pointerId) {
    return
  }

  categorySwipeState.value = null
  const deltaX = event.clientX - swipe.startX
  const deltaY = event.clientY - swipe.startY

  if (Math.abs(deltaX) < categorySwipeThreshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) {
    return
  }

  suppressNextProductSelect.value = true
  globalThis.setTimeout(() => {
    suppressNextProductSelect.value = false
  }, 250)
  switchCategoryByOffset(deltaX < 0 ? 1 : -1)
}

const cancelCategorySwipe = (): void => {
  categorySwipeState.value = null
}

const productSortEnabled = (item: MenuItem): boolean =>
  backendEditModeEnabled.value &&
  !isProductSortPersisting.value &&
  selectedCategory.value !== 'all' &&
  searchTerm.value.trim().length === 0 &&
  item.category === selectedCategory.value

const clearProductSortTimer = (state: ProductSortDragState | null = productSortDragState.value): void => {
  if (state?.longPressTimer != null) {
    globalThis.clearTimeout(state.longPressTimer)
  }
}

const productIdFromPoint = (event: PointerEvent): string | null => {
  const element = globalThis.document?.elementFromPoint(event.clientX, event.clientY)
  const target = element?.closest<HTMLElement>('[data-product-id]')

  return target?.dataset.productId ?? null
}

const swapVisibleProducts = async (sourceId: string, targetId: string): Promise<void> => {
  if (sourceId === targetId || selectedCategory.value === 'all' || isProductSortPersisting.value) {
    return
  }

  const visibleProducts = filteredMenu.value.filter((item) => item.category === selectedCategory.value)
  const sourceIndex = visibleProducts.findIndex((item) => item.id === sourceId)
  const targetIndex = visibleProducts.findIndex((item) => item.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0) {
    return
  }

  const nextProducts = [...visibleProducts]
  const sourceProduct = nextProducts[sourceIndex]
  const targetProduct = nextProducts[targetIndex]
  if (!sourceProduct || !targetProduct) {
    return
  }

  nextProducts[sourceIndex] = targetProduct
  nextProducts[targetIndex] = sourceProduct
  isProductSortPersisting.value = true
  try {
    const synced = await reorderProductsForStation(nextProducts.map((item) => item.id))
    if (synced && isPosApiConfigured) {
      await refreshBackendData()
    }
  } finally {
    isProductSortPersisting.value = false
  }
}

const startProductSortDrag = (item: MenuItem, event: PointerEvent): void => {
  if (!productSortEnabled(item) || event.button !== 0) {
    return
  }

  if (
    event.target instanceof HTMLElement &&
    event.target.closest('.product-quantity-control, input, textarea, select, a')
  ) {
    return
  }

  event.stopPropagation()
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const nextState: ProductSortDragState = {
    pointerId: event.pointerId,
    itemId: item.id,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    overItemId: null,
    longPressTimer: null,
  }
  nextState.longPressTimer = globalThis.setTimeout(() => {
    const current = productSortDragState.value
    if (!current || current.pointerId !== event.pointerId) {
      return
    }

    productSortDragState.value = {
      ...current,
      dragging: true,
      overItemId: null,
      longPressTimer: null,
    }
    suppressProductClickAfterSortGesture()
  }, sortDragLongPressMs)
  productSortDragState.value = nextState
}

const moveProductSortDrag = (event: PointerEvent): void => {
  const dragState = productSortDragState.value
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return
  }

  const moved = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)
  if (!dragState.dragging && moved > sortDragMoveTolerance) {
    clearProductSortTimer(dragState)
    productSortDragState.value = null
    suppressProductClickAfterSortGesture()
    return
  }

  if (!dragState.dragging) {
    return
  }

  event.preventDefault()
  const overItemId = productIdFromPoint(event)
  productSortDragState.value = {
    ...dragState,
    overItemId: overItemId && overItemId !== dragState.itemId ? overItemId : null,
  }
}

const finishProductSortDrag = (event: PointerEvent): void => {
  const dragState = productSortDragState.value
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return
  }

  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  clearProductSortTimer(dragState)
  productSortDragState.value = null
  if (dragState.dragging && dragState.overItemId) {
    event.preventDefault()
    void swapVisibleProducts(dragState.itemId, dragState.overItemId)
  }

  if (dragState.dragging) {
    suppressProductClickAfterSortGesture()
  }
}

const cancelProductSortDrag = (): void => {
  const wasDragging = productSortDragState.value?.dragging ?? false
  clearProductSortTimer()
  productSortDragState.value = null
  if (wasDragging) {
    suppressProductClickAfterSortGesture()
  }
}

const handleProductTileClick = (item: MenuItem): void => {
  if (suppressProductTileClick.value) {
    suppressProductTileClick.value = false
    return
  }

  if (productOrderingDisabled(item)) {
    return
  }

  selectMenuItem(item)
}

const compactOrderId = (orderId: string): string => {
  const parts = orderId.split('-').filter(Boolean)
  const prefix = parts[0] ?? 'POS'
  const suffix = parts.at(-1) ?? orderId
  const compactSuffix = suffix.length > 6 ? suffix.slice(-6) : suffix

  return `${prefix}-${compactSuffix}`
}

const orderSequenceLabel = (orderId: string | null): string => {
  const match = orderId?.match(/^POS-\d{8}-(\d{3})$/)
  return match?.[1] ?? '新單'
}

const currentTime = ref(Date.now())
const workspaceTabLabels: Record<WorkspaceTab, string> = {
  order: '外帶 / 外送點餐',
  details: '顧客與備註',
  payment: '付款確認',
  queue: '桌況頁',
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
    !onlineOrderRequiresAcceptance(order) &&
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
const printerStationRows = computed<PrintStationSetting[]>(() => {
  if (printerSettings.value.stations.length > 0) {
    return printerSettings.value.stations
  }

  return [
    {
      id: printStation.id ?? 'counter',
      name: printStation.name,
      host: printStation.host,
      port: printStation.port,
      protocol: printStation.protocol,
      enabled: printStation.online,
      autoPrint: printStation.autoPrint,
    },
  ]
})
const activePrinterStations = computed(() => printerStationRows.value.filter((station) => station.enabled))
const printerRuleRows = computed<PrintRuleSetting[]>(() =>
  printerSettings.value.rules.length > 0 ? printerSettings.value.rules : [],
)
const enabledPrintRules = computed(() => printerRuleRows.value.filter((rule) => rule.enabled))
const printerRuleSummary = computed(() =>
  `${enabledPrintRules.value.length} 條啟用 · ${printerRuleRows.value.length} 條全部`,
)
const printerSettingsSaving = ref(false)
const printerSettingsActionMessage = ref('')
const printRuleMenuItems = computed<MenuItem[]>(() =>
  [
    ...new Map([...productStatusCatalog.value, ...menuCatalog.value].map((product) => [product.id, product])).values(),
  ].sort((a, b) => {
    if (a.category !== b.category) {
      return categoryLabelFor(a.category).localeCompare(categoryLabelFor(b.category), 'zh-Hant')
    }

    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'zh-Hant')
  }),
)
const printerStationName = (stationId: string): string =>
  printerStationRows.value.find((station) => station.id === stationId)?.name ?? printStation.name
const printerConnectionLabel = (station: PrintStationSetting): string => `${station.host}:${station.port}`
const printerRuleCategoriesLabel = (rule: PrintRuleSetting): string =>
  rule.categories.length === 0 ? '未選分類' : rule.categories.map(categoryLabelFor).join('、')
const printerRuleItemsLabel = (rule: PrintRuleSetting): string => {
  const itemIds = new Set(rule.itemIds ?? [])
  if (itemIds.size === 0) {
    return '未指定品項'
  }

  const names = printRuleMenuItems.value.filter((item) => itemIds.has(item.id)).map((item) => item.name)
  const missingCount = itemIds.size - names.length
  return [...names.slice(0, 3), ...(missingCount > 0 ? [`另 ${missingCount} 項`] : [])].join('、')
}
const printerRuleScopeLabel = (rule: PrintRuleSetting): string => {
  const categoryCount = rule.categories.length
  const itemCount = (rule.itemIds ?? []).length
  if (categoryCount === 0 && itemCount === 0) {
    return '未加入品項，出單時不列印'
  }

  return `${categoryCount} 類 · ${itemCount} 個指定品項`
}
const printerRuleModeLabel = (rule: PrintRuleSetting): string =>
  `${serviceModeLabels[rule.serviceMode]} · ${printLabelModeLabels[rule.labelMode]}`
const printerRuleProductOptions = (rule: PrintRuleSetting): MenuItem[] => {
  const categorySet = new Set(rule.categories)
  const selectedItemIds = new Set(rule.itemIds ?? [])
  if (categorySet.size === 0) {
    return printRuleMenuItems.value
  }

  return printRuleMenuItems.value.filter((item) => categorySet.has(item.category) || selectedItemIds.has(item.id))
}
const togglePrinterRuleCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  if (rule.categories.includes(category)) {
    rule.categories = rule.categories.filter((entry) => entry !== category)
    return
  }

  rule.categories = [...rule.categories, category]
}
const togglePrinterRuleItem = (rule: PrintRuleSetting, itemId: string): void => {
  const itemIds = rule.itemIds ?? []
  if (itemIds.includes(itemId)) {
    rule.itemIds = itemIds.filter((entry) => entry !== itemId)
    return
  }

  rule.itemIds = [...itemIds, itemId]
}
const clonePrinterSettingsForSave = (): PrinterSettings => ({
  stations: printerSettings.value.stations.map((station) => ({ ...station })),
  rules: printerSettings.value.rules.map((rule) => ({
    ...rule,
    categories: [...new Set(rule.categories)],
    itemIds: [...new Set(rule.itemIds ?? [])],
    copies: Math.min(5, Math.max(1, Number(rule.copies) || 1)),
  })),
})
const savePrinterSettingsFromWorkstation = async (): Promise<void> => {
  printerSettingsSaving.value = true
  printerSettingsActionMessage.value = '正在儲存印單規則'

  try {
    const savedSettings = await updateAdminSetting<PrinterSettings>('printer_settings', clonePrinterSettingsForSave())
    printerSettings.value = {
      stations: savedSettings.stations.map((station) => ({ ...station })),
      rules: savedSettings.rules.map((rule) => ({
        ...rule,
        categories: [...rule.categories],
        itemIds: [...(rule.itemIds ?? [])],
      })),
    }
    printerSettingsActionMessage.value = '印單規則已儲存'
  } catch (error) {
    printerSettingsActionMessage.value = `印單規則儲存失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    printerSettingsSaving.value = false
  }
}
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
const primaryOnlineReminderOrder = computed(() => activeOnlineReminderOrders.value[0] ?? null)
const activeOnlineReminderDetailId = ref<string | null>(null)
const onlineReminderDetailOrder = computed(() =>
  activeOnlineReminderOrders.value.find((order) => order.id === activeOnlineReminderDetailId.value) ?? null,
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
const supplyStatusDetail = (status: ProductSupplyStatus): string =>
  supplyStatusOptions.find((option) => option.value === status)?.detail ?? ''

const supplyStatusLabel = (status: ProductSupplyStatus): string =>
  supplyStatusOptions.find((option) => option.value === status)?.label ?? '正常供應'

const eventSupplyStatus = (event: Event): ProductSupplyStatus => {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : ''
  return isProductSupplyStatus(value) ? value : 'normal'
}

const eventChecked = (event: Event): boolean =>
  event.target instanceof HTMLInputElement ? event.target.checked : false

const productSupplyStatusFromProduct = (product: MenuItem): ProductSupplyStatus => {
  if (!product.available || product.inventoryCount === 0 || isProductTemporarilyStopped(product)) {
    return 'stopped'
  }

  if (!product.onlineVisible && !product.qrVisible) {
    return 'online-stopped'
  }

  return 'normal'
}

const productCurrentSupplyStatus = (product: MenuItem): ProductSupplyStatus =>
  productSupplyStatusFromProduct(product)

const noteCurrentSupplyStatus = (note: SupplyNoteItem): ProductSupplyStatus => {
  const directStatus = noteSupplyStatuses.value[note.id]
  if (directStatus) {
    return directStatus
  }

  for (const groupId of note.groupIds) {
    const legacyStatus = noteSupplyStatuses.value[`${groupId}-${note.choiceId}`]
    if (legacyStatus) {
      return legacyStatus
    }
  }

  return 'normal'
}

const optionChoiceSupplyStatus = (group: MenuOptionGroup, choice: MenuOptionChoice): ProductSupplyStatus =>
  noteSupplyStatuses.value[choice.id] ?? noteSupplyStatuses.value[`${group.id}-${choice.id}`] ?? 'normal'

const supplyCategoryLabel = (category: SupplyCategoryFilter): string => {
  const optionLabel = supplyCategoryOptions.value.find((option) => option.value === category)?.label
  if (optionLabel) {
    return optionLabel
  }
  return category === supplyNotesFilterValue || category === supplyNoteGroupsFilterValue ? '註記' : categoryLabelFor(category)
}

const supplyProductRows = computed<SupplyStatusRow[]>(() => {
  const category = selectedSupplyMenuCategory.value
  if (!category) {
    return []
  }

  return stationProducts.value
    .filter((product) => product.posVisible && product.category === category)
    .map((product) => ({
      id: product.id,
      kind: 'product',
      name: product.name,
      categoryLabel: supplyCategoryLabel(product.category),
      detail: `${categoryLabelFor(product.category)} · ${formatCurrency(product.price)}${
        productStockLabel(product) ? ` · ${productStockLabel(product)}` : ''
      }`,
      status: productCurrentSupplyStatus(product),
      product,
    }))
})
const supplyNoteRows = computed<SupplyStatusRow[]>(() =>
  supplyNoteItems.value.map((note) => ({
    id: note.id,
    kind: 'note',
    name: note.name,
    categoryLabel: '可用註記',
    detail: `${note.group} · 已上架雲端餐廳`,
    status: noteCurrentSupplyStatus(note),
    note,
  })),
)
const visibleSupplyRows = computed<SupplyStatusRow[]>(() => {
  const keyword = supplySearchTerm.value.trim().toLowerCase()
  const baseRows = selectedSupplyCategoryIsNotes.value
    ? supplyNoteRows.value
    : selectedSupplyCategoryIsNoteGroups.value
      ? []
      : supplyProductRows.value

  return baseRows.filter((row) => {
    const matchesKeyword =
      keyword.length === 0 ||
      row.name.toLowerCase().includes(keyword) ||
      row.detail.toLowerCase().includes(keyword) ||
      row.categoryLabel.toLowerCase().includes(keyword)
    const matchesStatus = supplyStatusFilter.value === 'all' || row.status === supplyStatusFilter.value

    return matchesKeyword && matchesStatus
  })
})
const supplyStatusSummary = computed(() => {
  const normalCount = visibleSupplyRows.value.filter((row) => row.status === 'normal').length
  const onlineStoppedCount = visibleSupplyRows.value.filter((row) => row.status === 'online-stopped').length
  const stoppedCount = visibleSupplyRows.value.filter((row) => row.status === 'stopped').length
  return `顯示 ${visibleSupplyRows.value.length} 個 · 正常 ${normalCount} · 線上停售 ${onlineStoppedCount} · 全部停售 ${stoppedCount}`
})
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
const backendEditModeEnabled = ref(readStorageValue<boolean>(backendEditModeStorageKey, false))
const initialView = readInitialView()
const activeView = ref<AppView>(initialView === 'admin' && !backendEditModeEnabled.value ? 'pos' : initialView)
const activeWorkspaceTab = ref<WorkspaceTab>('queue')
const savedQueueView = readSavedQueueView()
const posUiPreferences = ref<PosUiPreferences>(readPosUiPreferences())
const activeToolboxPanel = ref<ToolboxPanel>('home')
const posStableViewportHeight = ref(0)
const isApplyingRemoteAppearanceSettings = ref(false)
const preferenceOffsetLabel = (value: number): string => `${value > 0 ? '+' : ''}${Math.round(value)}%`
const scaleFactorFromOffset = (offset: number): number => {
  const calibratedOffset = offset + interfaceScaleBaselineOffset
  return calibratedOffset >= 0
    ? 1 + calibratedOffset / 100
    : Math.max(0.33, 1 + calibratedOffset / 300)
}
const densityFactorFromOffset = (offset: number): number =>
  offset >= 0
    ? 1 + offset / 220
    : Math.max(0.46, 1 + offset / 370)
const textFactorFromOffset = (offset: number): number =>
  offset >= 0
    ? 1 + offset / 130
    : Math.max(0.5, 1 + offset / 400)
const appearancePreferenceSummary = computed(
  () =>
    `縮放 ${preferenceOffsetLabel(posUiPreferences.value.interfaceScale)} · 文字 ${preferenceOffsetLabel(posUiPreferences.value.textSize)} · 工具箱 ${Math.round(posUiPreferences.value.toolboxOpacity)}% · ${posUiPreferences.value.darkMode ? 'Dark' : 'Light'}`,
)
const readLayoutViewportHeight = (): number => {
  const documentHeight = document.documentElement?.clientHeight ?? 0
  const visualHeight = globalThis.visualViewport?.height ?? 0
  return Math.round(Math.max(globalThis.innerHeight || 0, documentHeight, visualHeight))
}
const updatePosStableViewportHeight = (force = false): void => {
  const nextHeight = readLayoutViewportHeight()
  if (nextHeight <= 0) {
    return
  }

  const currentHeight = posStableViewportHeight.value
  const keyboardLikeResize = currentHeight > 0 && nextHeight < currentHeight * 0.82
  if (!force && keyboardLikeResize) {
    return
  }

  if (force || currentHeight === 0 || nextHeight > currentHeight || Math.abs(nextHeight - currentHeight) > 160) {
    posStableViewportHeight.value = Math.max(360, nextHeight)
  }
}
const scheduleForcedViewportRefresh = (): void => {
  globalThis.setTimeout(() => updatePosStableViewportHeight(true), 220)
}
const handleViewportResize = (): void => {
  updatePosStableViewportHeight()
}
const posWorkbenchPreferenceStyle = computed<Record<string, string>>(() => {
  const interfaceScale = scaleFactorFromOffset(posUiPreferences.value.interfaceScale)
  const densityFactor = densityFactorFromOffset(posUiPreferences.value.densityScale)
  const textFactor = textFactorFromOffset(posUiPreferences.value.textSize)
  const orderTicketWidth = Math.max(156, Math.min(420, 420 / interfaceScale))
  const stableViewportHeight = posStableViewportHeight.value
  const viewportHeight = stableViewportHeight > 0 ? `${stableViewportHeight}px` : '100lvh'
  const stageHeight = stableViewportHeight > 0
    ? `${stableViewportHeight / interfaceScale}px`
    : `${100 / interfaceScale}lvh`

  return {
    '--pos-interface-scale': interfaceScale.toFixed(4),
    '--pos-stage-width': `${100 / interfaceScale}vw`,
    '--pos-viewport-height': viewportHeight,
    '--pos-stage-height': stageHeight,
    '--pos-density-scale': densityFactor.toFixed(4),
    '--pos-text-scale': textFactor.toFixed(4),
    '--pos-font-size': `${16 * textFactor}px`,
    '--pos-command-min-height': '74px',
    '--pos-command-padding-y': `${12 * densityFactor}px`,
    '--pos-command-padding-x': `${14 * densityFactor}px`,
    '--pos-queue-padding-y': `${28 * densityFactor}px`,
    '--pos-queue-padding-x': `${32 * densityFactor}px`,
    '--pos-order-row-height': '112px',
    '--pos-order-row-padding': `${16 * densityFactor}px`,
    '--pos-order-ticket-width': `${orderTicketWidth}px`,
    '--pos-catalog-padding-y': `${20 * densityFactor}px`,
    '--pos-catalog-padding-x': `${28 * densityFactor}px`,
    '--pos-catalog-padding-bottom': `${40 * densityFactor}px`,
    '--pos-product-grid-gap': `${22 * densityFactor}px`,
    '--pos-product-tile-width': '156px',
    '--pos-product-tile-height': '166px',
    '--pos-product-tile-padding': `${14 * densityFactor}px`,
  }
})
const floatingToolboxStyle = computed<Record<string, string>>(() => ({
  left: `${toolboxPosition.value.x}%`,
  top: `${toolboxPosition.value.y}%`,
  opacity: (posUiPreferences.value.toolboxOpacity / 100).toFixed(2),
}))
const resetPosUiPreferences = (): void => {
  posUiPreferences.value = { ...defaultPosUiPreferences }
}

const posAppearancePayloadFromPreferences = (preferences: PosUiPreferences): PosAppearanceSettings => ({
  interfaceScale: clampPreference(preferences.interfaceScale, defaultPosUiPreferences.interfaceScale),
  densityScale: clampPreference(preferences.densityScale, defaultPosUiPreferences.densityScale),
  textSize: clampPreference(preferences.textSize, defaultPosUiPreferences.textSize),
  darkMode: preferences.darkMode === true,
  toolboxOpacity: clampToolboxOpacityPreference(preferences.toolboxOpacity),
})

const uiPreferencesFromRuntimeAppearance = (settings: PosAppearanceSettings): PosUiPreferences => ({
  schemaVersion: 3,
  ...posAppearancePayloadFromPreferences({ ...defaultPosUiPreferences, ...settings, schemaVersion: 3 }),
})

const appearanceSettingsEqual = (left: PosUiPreferences, right: PosUiPreferences): boolean =>
  left.interfaceScale === right.interfaceScale &&
  left.densityScale === right.densityScale &&
  left.textSize === right.textSize &&
  left.darkMode === right.darkMode &&
  left.toolboxOpacity === right.toolboxOpacity

const clearAppearancePersistTimer = (): void => {
  if (appearancePersistTimer !== null) {
    globalThis.clearTimeout(appearancePersistTimer)
    appearancePersistTimer = null
  }
}

const persistPosAppearancePreferences = (preferences: PosUiPreferences): void => {
  if (!isPosApiConfigured) {
    return
  }

  clearAppearancePersistTimer()
  const payload = posAppearancePayloadFromPreferences(preferences)
  appearancePersistTimer = globalThis.setTimeout(() => {
    appearancePersistTimer = null
    void updateAdminSetting<PosAppearanceSettings>('pos_appearance', payload)
      .then((settings) => {
        posAppearanceSettings.value = settings
      })
      .catch(() => {
        return
      })
  }, 650)
}
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
const openSwipeKey = ref<string | null>(null)
const activeCartQuickEditor = ref<CartQuickEditor>(null)
const activeOptionItem = ref<MenuItem | null>(null)
const activeOptionLineId = ref<string | null>(null)
const optionSelections = ref<Record<MenuOptionGroupId, string[]>>({})
const optionWarning = ref('')
const queueActionMessage = ref('')
const isToolboxOpen = ref(false)
const toolboxPosition = ref<ToolboxPosition>(readToolboxPosition())
const toolboxDragState = ref<ToolboxDragState | null>(null)
const suppressFloatingToolboxClick = ref(false)
const backendEditTapCount = ref(0)
const backendEditMessage = ref(
  backendEditModeEnabled.value ? '後台編輯模式已啟用' : '連點工具箱 6 下進入後台編輯模式',
)
const isSupplyStatusOpen = ref(false)
const isKnowledgeOpen = ref(false)
const knowledgeSearchTerm = ref('')
const knowledgeCategoryFilter = ref<KnowledgeCategoryFilter>('all')
const activeKnowledgeArticleId = ref(posKnowledgeArticles[0]?.id ?? '')
const stationBatchProductIds = ref<string[]>([])
const supplySearchTerm = ref('')
const supplyCategoryFilter = ref<SupplyCategoryFilter>('coffee')
const supplyStatusFilter = ref<SupplyStatusFilter>('all')
const productSupplyStatuses = ref<Record<string, ProductSupplyStatus>>(readSupplyStatusMap(supplyProductStatusStorageKey))
const noteSupplyStatuses = ref<Record<string, ProductSupplyStatus>>(readSupplyStatusMap(supplyNoteStatusStorageKey))
const supplyCategoryOptions = computed<Array<{ value: SupplyCategoryFilter; label: string }>>(() => [
  ...menuCategoryOptions.value.map((category) => ({
    value: category.id,
    label: category.label,
  })),
  { value: supplyNotesFilterValue, label: '可用註記' },
  { value: supplyNoteGroupsFilterValue, label: '註記群組' },
])
const noteGroupLabelsForChoice = (choiceId: string): string[] =>
  optionGroupCatalog.value
    .filter((group) => group.choices.some((choice) => choice.id === choiceId))
    .map((group) => group.label)

const noteGroupIdsForChoice = (choiceId: string): string[] =>
  optionGroupCatalog.value
    .filter((group) => group.choices.some((choice) => choice.id === choiceId))
    .map((group) => group.id)

const supplyNoteItems = computed<SupplyNoteItem[]>(() =>
  availableNoteCatalog.value.map((choice) => {
    const groupLabels = noteGroupLabelsForChoice(choice.id)
    return {
      id: choice.id,
      choiceId: choice.id,
      name: choice.priceDelta ? `${choice.label} +${formatCurrency(choice.priceDelta)}` : choice.label,
      group: groupLabels.length > 0 ? groupLabels.join('、') : '尚未加入群組',
      groupIds: noteGroupIdsForChoice(choice.id),
    }
  }),
)
const availableNoteSupplyStatus = (choiceId: string): ProductSupplyStatus => {
  const note = supplyNoteItems.value.find((item) => item.choiceId === choiceId)
  return note ? noteCurrentSupplyStatus(note) : 'normal'
}
const searchInput = ref<HTMLInputElement | null>(null)
const customerNameInput = ref<HTMLInputElement | null>(null)
const registerOpeningCash = ref(0)
const registerClosingCash = ref(0)
const registerNote = ref('')
const forceCloseRegister = ref(false)
let claimClockTimer: number | null = null
let backendEditTapTimer: number | null = null
let toolboxBackendEditLongPressTimer: number | null = null
let appearancePersistTimer: number | null = null
const currentClockLabel = computed(() => formatOrderTime(new Date(currentTime.value).toISOString()))
const ticketOrderNumber = computed(() => orderSequenceLabel(counterDraftOrderId.value))
const ticketStartedLabel = computed(() =>
  counterDraftStartedAt.value ? formatOrderTime(counterDraftStartedAt.value) : currentClockLabel.value,
)
const supplyNoteStatusForName = (name: string): ProductSupplyStatus => {
  const note = supplyNoteItems.value.find((item) => item.name === name)
  return note ? noteCurrentSupplyStatus(note) : 'normal'
}
const visibleNoteSnippets = computed(() => noteSnippets.filter((note) => supplyNoteStatusForName(note) !== 'stopped'))
const visibleTicketNoteSnippets = computed(() =>
  ticketNoteSnippets.filter((note) => supplyNoteStatusForName(note) !== 'stopped'),
)
const assignedOptionGroupIdsForProduct = (product: MenuItem): string[] => {
  const assignedIds = productOptionAssignments.value[product.id]
  if (assignedIds) {
    return assignedIds.filter((groupId) => optionGroupCatalog.value.some((group) => group.id === groupId))
  }

  if (defaultConfigurableCategoryIds.includes(product.category)) {
    const defaultGroupIds = new Set(beverageOptionGroups.map((group) => group.id))
    return optionGroupCatalog.value.filter((group) => defaultGroupIds.has(group.id)).map((group) => group.id)
  }

  return []
}
const optionGroupsForProduct = (product: MenuItem): MenuOptionGroup[] => {
  const groupIds = new Set(assignedOptionGroupIdsForProduct(product))
  return optionGroupCatalog.value
    .filter((group) => groupIds.has(group.id))
    .map((group) => ({
      ...group,
      choices: group.choices.filter((choice) => optionChoiceSupplyStatus(group, choice) !== 'stopped'),
    }))
    .filter((group) => group.choices.length > 0)
}
const activeOptionGroups = computed(() => activeOptionItem.value ? optionGroupsForProduct(activeOptionItem.value) : [])
const optionChoiceLabel = (choice: MenuOptionChoice): string =>
  choice.priceDelta ? `${choice.label} +${formatCurrency(choice.priceDelta)}` : choice.label

const selectedOptionDetails = computed(() => {
  const selectedChoices = activeOptionGroups.value.flatMap((group) =>
    group.choices.filter((choice) => optionSelections.value[group.id]?.includes(choice.id)),
  )

  return {
    labels: selectedChoices.map(optionChoiceLabel),
    priceDelta: selectedChoices.reduce((total, choice) => total + (choice.priceDelta ?? 0), 0),
  }
})
const activeOptionLine = computed(() =>
  activeOptionLineId.value ? cartLines.value.find((line) => line.itemId === activeOptionLineId.value) ?? null : null,
)
const pendingOptionUnitPrice = computed(() =>
  activeOptionItem.value ? activeOptionItem.value.price + selectedOptionDetails.value.priceDelta : 0,
)
const pendingOptionLineTotal = computed(() => pendingOptionUnitPrice.value * (activeOptionLine.value?.quantity ?? 1))
const ticketDisplayQuantity = computed(() =>
  cartQuantity.value + (activeOptionItem.value && !activeOptionLineId.value ? 1 : 0),
)
const ticketDisplayTotal = computed(() => {
  if (activeOptionItem.value && activeOptionLine.value) {
    return cartTotal.value - (activeOptionLine.value.unitPrice * activeOptionLine.value.quantity) + pendingOptionLineTotal.value
  }

  return cartTotal.value + (activeOptionItem.value ? pendingOptionLineTotal.value : 0)
})
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
  cartLines.value
    .filter((line) => line.itemId === itemId || line.productId === itemId)
    .reduce((total, line) => total + line.quantity, 0)

const productRequiresOptions = (item: MenuItem): boolean => optionGroupsForProduct(item).length > 0
const productOrderingDisabled = (item: MenuItem): boolean => productCurrentSupplyStatus(item) === 'stopped'
const productTileActionLabel = (item: MenuItem): string => {
  if (productOrderingDisabled(item)) {
    return '停售'
  }

  const quantity = lineQuantityByItem(item.id)
  return quantity > 0 ? `已加 ${quantity}` : '點選加入'
}

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

const resetOptionSelections = (): void => {
  optionSelections.value = {}
  optionWarning.value = ''
}

const selectMenuItem = (item: MenuItem): void => {
  if (suppressNextProductSelect.value) {
    suppressNextProductSelect.value = false
    return
  }

  if (productOrderingDisabled(item)) {
    return
  }

  activeCartQuickEditor.value = null
  activeOptionLineId.value = null

  if (!productRequiresOptions(item)) {
    addItem(item)
    return
  }

  activeOptionItem.value = item
  resetOptionSelections()
}

const closeOptionPanel = (): void => {
  activeOptionItem.value = null
  activeOptionLineId.value = null
  resetOptionSelections()
}

const clearTicketDraft = (): void => {
  clearCart()
  closeOptionPanel()
}

const activeTicketAction = ref<TicketAction | null>(null)

const ticketActionDisabled = (): boolean =>
  (cartLines.value.length === 0 && !activeOptionItem.value) ||
  Boolean(activeTicketAction.value) ||
  isSubmitting.value

const optionSelectionsFromLine = (line: CartLine): Record<MenuOptionGroupId, string[]> => {
  const lineOptions = new Set(line.options)

  return Object.fromEntries(optionGroupCatalog.value.map((group) => [
    group.id,
    group.choices
      .filter((choice) => lineOptions.has(optionChoiceLabel(choice)) || lineOptions.has(choice.label))
      .map((choice) => choice.id),
  ])) as Record<MenuOptionGroupId, string[]>
}

const menuItemForLine = (line: CartLine): MenuItem | null =>
  menuCatalog.value.find((item) => item.id === line.productId || item.id === line.itemId || item.sku === line.productSku) ?? null

const lineRequiresOptions = (line: CartLine): boolean => {
  const item = menuItemForLine(line)
  return Boolean(item && productRequiresOptions(item))
}

const editCartLineOptions = (line: CartLine): void => {
  const item = menuItemForLine(line)
  if (!item || !productRequiresOptions(item)) {
    return
  }

  activeCartQuickEditor.value = null
  activeOptionItem.value = item
  activeOptionLineId.value = line.itemId
  optionSelections.value = optionSelectionsFromLine(line)
  optionWarning.value = ''
}

const optionChoiceSelected = (group: MenuOptionGroup, choice: MenuOptionChoice): boolean =>
  optionSelections.value[group.id]?.includes(choice.id) ?? false

const toggleOptionChoice = (group: MenuOptionGroup, choice: MenuOptionChoice): void => {
  optionWarning.value = ''
  const currentSelections = optionSelections.value[group.id] ?? []
  const isSelected = currentSelections.includes(choice.id)
  let nextSelections: string[]

  if (group.max === 1) {
    nextSelections = isSelected ? [] : [choice.id]
  } else if (isSelected) {
    nextSelections = currentSelections.filter((selectedId) => selectedId !== choice.id)
  } else {
    nextSelections = [...currentSelections, choice.id].slice(0, group.max)
  }

  optionSelections.value = {
    ...optionSelections.value,
    [group.id]: nextSelections,
  }
}

const missingRequiredOptionGroup = (): MenuOptionGroup | null =>
  activeOptionGroups.value.find((group) => {
    const selectedCount = optionSelections.value[group.id]?.length ?? 0
    return group.required && selectedCount < group.min
  }) ?? null

const confirmMenuOptions = (): boolean => {
  const item = activeOptionItem.value
  if (!item) {
    return true
  }

  const missingGroup = missingRequiredOptionGroup()
  if (missingGroup) {
    optionWarning.value = `「${missingGroup.label}」尚未選擇完成`
    return false
  }

  if (activeOptionLineId.value) {
    updateConfiguredLine(activeOptionLineId.value, item, selectedOptionDetails.value.labels, selectedOptionDetails.value.priceDelta)
  } else {
    addConfiguredItem(item, selectedOptionDetails.value.labels, selectedOptionDetails.value.priceDelta)
  }
  closeOptionPanel()
  return true
}

const handleTicketAction = async (action: TicketAction): Promise<void> => {
  if (ticketActionDisabled()) {
    return
  }

  if (activeOptionItem.value && !confirmMenuOptions()) {
    return
  }

  activeTicketAction.value = action
  const order = await saveCounterOrder()
  if (!order) {
    activeTicketAction.value = null
    return
  }

  try {
    if (action === 'checkout-print' || action === 'checkout-only') {
      await updatePaymentStatus(order.id, 'paid')
    }

    if (action === 'checkout-print' || action === 'print') {
      await printOrder(order.id)
    }

    expandedOrderId.value = order.id
    setWorkspaceTab('queue')
  } finally {
    activeTicketAction.value = null
  }
}

const handleSubmitCounterOrder = async (): Promise<void> => {
  await handleTicketAction('print')
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

  if (productOrderingDisabled(product)) {
    return '停售'
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
  if (productOrderingDisabled(product) || product.inventoryCount === 0 || isProductTemporarilyStopped(product)) {
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

const queueAdminActionLabel = (kind: QueueAdminActionKind): string => (kind === 'void' ? '作廢' : '退款')

const voidActionLabel = (order: PosOrder): string => (
  voidingOrderId.value === order.id ? '作廢中' : '作廢'
)

const refundActionLabel = (order: PosOrder): string => (
  refundingOrderId.value === order.id ? '退款中' : '退款'
)

const voidOrderAction = async (order: PosOrder): Promise<void> => {
  await voidOrderForStation(order.id)
}

const refundOrderAction = async (order: PosOrder): Promise<void> => {
  await refundOrderForStation(order.id)
}

const orderSwipeKey = (order: PosOrder): string => `order:${order.id}`

const orderCanBeDeletedFromQueue = (order: PosOrder): boolean =>
  !['served', 'failed', 'voided'].includes(order.status) && !orderClaimedByOtherStation(order)

const orderSwipeDeleteLabel = (order: PosOrder): string => {
  const isOnlineOrder = order.source === 'online' || order.source === 'qr'
  if (voidingOrderId.value === order.id) {
    return isOnlineOrder ? '取消中' : '刪除中'
  }

  if (orderClaimedByOtherStation(order)) {
    return '先接手'
  }

  if (isOnlineOrder) {
    return orderCanBeDeletedFromQueue(order) ? '取消訂單' : '不可取消'
  }

  return orderCanBeDeletedFromQueue(order) ? '刪除' : '不可刪除'
}

const orderSwipeDeleteDisabled = (order: PosOrder): boolean =>
  !orderCanBeDeletedFromQueue(order) || voidingOrderId.value === order.id

const orderSwipeDeleteAction = (order: PosOrder): void => {
  if (orderSwipeDeleteDisabled(order)) {
    return
  }

  void deleteOrderFromQueue(order.id)
  openSwipeKey.value = null
}

const executeQueueAdminAction = async (kind: QueueAdminActionKind, order: PosOrder): Promise<void> => {
  const label = queueAdminActionLabel(kind)
  queueActionMessage.value = `${order.id} ${label}處理中`
  openSwipeKey.value = null

  if (kind === 'void') {
    await voidOrderAction(order)
  } else {
    await refundOrderAction(order)
  }

  const latestOrder = orderQueue.value.find((entry) => entry.id === order.id)
  const actionSucceeded =
    kind === 'void'
      ? latestOrder?.status === 'voided'
      : latestOrder?.paymentStatus === 'refunded'

  queueActionMessage.value = backendStatus.detail || backendStatus.label

  if (!actionSucceeded) {
    queueActionMessage.value = `${order.id} ${label}未完成：${queueActionMessage.value}`
    return
  }
}

const requestQueueAdminAction = (kind: QueueAdminActionKind, order: PosOrder): void => {
  const label = queueAdminActionLabel(kind)

  if (!requireBackendEditMode(label)) {
    queueActionMessage.value = `${order.id} ${label}需先進入後台編輯模式`
    return
  }

  void executeQueueAdminAction(kind, order)
}

const orderSwipeCompleteLabel = (order: PosOrder): string => {
  if (order.mode === 'delivery' || order.source !== 'counter') {
    return order.status === 'served' ? '已完成' : '已取餐'
  }

  if (order.status === 'ready') {
    return '已取餐'
  }

  if (order.status === 'served') {
    return '已完成'
  }

  return '已完成'
}

const orderSwipeCompleteDisabled = (order: PosOrder): boolean =>
  ['served', 'failed', 'voided'].includes(order.status) || orderClaimedByOtherStation(order)

const orderSwipeCompleteAction = (order: PosOrder): void => {
  if (orderSwipeCompleteDisabled(order)) {
    return
  }

  const nextStatus: OrderStatus =
    order.mode === 'delivery' || order.source !== 'counter'
      ? 'served'
      : order.status === 'ready' ? 'served' : 'ready'
  void updateOrderStatus(order.id, nextStatus)
  openSwipeKey.value = null
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

const swipeMaxOffsetFor = (key: string): number =>
  key.startsWith('order:') ? orderSwipeActionWidth : defaultSwipeActionWidth

const swipeOffsetFor = (key: string): number => {
  if (swipeState.value?.key !== key) {
    return openSwipeKey.value === key ? -swipeMaxOffsetFor(key) : 0
  }

  const deltaX = swipeState.value.currentX - swipeState.value.startX
  return Math.max(-swipeMaxOffsetFor(key), Math.min(0, deltaX))
}

const swipeCardStyle = (key: string): { transform: string } => ({
  transform: `translateX(${swipeOffsetFor(key)}px)`,
})

const swipeRowClass = (key: string): Record<string, boolean> => ({
  'swipe-row--dragging': swipeState.value?.key === key,
  'swipe-row--open': openSwipeKey.value === key,
})

const startSwipe = (key: string, event: PointerEvent): void => {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return
  }

  if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select, a')) {
    return
  }

  if (openSwipeKey.value && openSwipeKey.value !== key) {
    openSwipeKey.value = null
  }

  swipeState.value = {
    key,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    hasPointerCapture: false,
  }
}

const moveSwipe = (key: string, event: PointerEvent): void => {
  if (swipeState.value?.key !== key || swipeState.value.pointerId !== event.pointerId) {
    return
  }

  const deltaX = event.clientX - swipeState.value.startX
  const deltaY = event.clientY - swipeState.value.startY

  if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 12) {
    swipeState.value = null
    return
  }

  if (Math.abs(deltaX) > 14 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
    event.preventDefault()
    if (!swipeState.value.hasPointerCapture && event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId)
      swipeState.value.hasPointerCapture = true
    }
  }

  swipeState.value.currentX = event.clientX
}

const endSwipe = (key: string, action: () => void): void => {
  const offset = swipeOffsetFor(key)
  swipeState.value = null
  openSwipeKey.value = null

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
  const key = orderSwipeKey(order)
  const offset = swipeOffsetFor(key)
  swipeState.value = null
  openSwipeKey.value = offset <= -swipeActionThreshold ? key : null
}

const endPrintJobSwipe = (row: PrintJobRow): void => {
  endSwipe(row.key, () => printJobDeleteAction(row))
}

const toggleOrderDetail = (order: PosOrder): void => {
  expandedOrderId.value = expandedOrderId.value === order.id ? null : order.id
}

const orderCanBeEdited = (order: PosOrder): boolean =>
  order.source === 'counter' &&
  ['pending', 'authorized'].includes(order.paymentStatus) &&
  !['served', 'failed', 'voided'].includes(order.status) &&
  !orderClaimedByOtherStation(order)

const editOrderFromQueue = async (order: PosOrder): Promise<void> => {
  if (!orderCanBeEdited(order)) {
    return
  }

  const loaded = await loadCounterOrderForEditing(order.id)
  if (!loaded) {
    return
  }

  expandedOrderId.value = null
  openSwipeKey.value = null
  activeCartQuickEditor.value = null
  closeOptionPanel()
  setWorkspaceTab('order')
}

const handleOrderRowClick = (order: PosOrder, event: MouseEvent): void => {
  if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select, a')) {
    return
  }

  const key = orderSwipeKey(order)
  if (openSwipeKey.value) {
    if (openSwipeKey.value !== key) {
      openSwipeKey.value = null
    }
    return
  }

  if (orderCanBeEdited(order)) {
    void editOrderFromQueue(order)
    return
  }

  toggleOrderDetail(order)
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
  activeToolboxPanel.value = 'home'
  isToolboxOpen.value = true
}

const closeToolbox = (): void => {
  isToolboxOpen.value = false
  activeToolboxPanel.value = 'home'
}

const clearBackendEditTapTimer = (): void => {
  if (backendEditTapTimer !== null) {
    globalThis.clearTimeout(backendEditTapTimer)
    backendEditTapTimer = null
  }
}

const clearToolboxBackendEditLongPressTimer = (): void => {
  if (toolboxBackendEditLongPressTimer !== null) {
    globalThis.clearTimeout(toolboxBackendEditLongPressTimer)
    toolboxBackendEditLongPressTimer = null
  }
}

const resetBackendEditTapProgress = (): void => {
  backendEditTapCount.value = 0
  clearBackendEditTapTimer()
}

const enableBackendEditMode = (): void => {
  backendEditModeEnabled.value = true
  writeStorageValue(backendEditModeStorageKey, true)
  resetBackendEditTapProgress()
  backendEditMessage.value = '後台編輯模式已啟用'
}

const disableBackendEditMode = (): void => {
  backendEditModeEnabled.value = false
  writeStorageValue(backendEditModeStorageKey, false)
  resetBackendEditTapProgress()
  backendEditMessage.value = '後台編輯模式已關閉'
}

const handleToolboxTap = (): void => {
  openToolbox()

  if (backendEditModeEnabled.value) {
    backendEditMessage.value = '後台編輯模式已啟用'
    return
  }

  backendEditTapCount.value += 1
  const remainingTaps = Math.max(backendEditTapTarget - backendEditTapCount.value, 0)

  if (remainingTaps === 0) {
    enableBackendEditMode()
    return
  }

  backendEditMessage.value = `再點 ${remainingTaps} 下進入後台編輯模式`
  clearBackendEditTapTimer()
  backendEditTapTimer = globalThis.setTimeout(() => {
    resetBackendEditTapProgress()
    backendEditMessage.value = '連點工具箱 6 下進入後台編輯模式'
  }, backendEditTapWindowMs)
}

const positionFromPointerEvent = (event: PointerEvent, fallback: ToolboxPosition): ToolboxPosition => {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const reference = target?.closest('.pos-scale-stage') ?? document.documentElement
  const rect = reference.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return fallback
  }

  return {
    x: clampPercent(((event.clientX - rect.left) / rect.width) * 100, fallback.x),
    y: clampPercent(((event.clientY - rect.top) / rect.height) * 100, fallback.y),
  }
}

const handleFloatingToolboxPointerDown = (event: PointerEvent): void => {
  if (event.button !== 0) {
    return
  }

  toolboxDragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startPosition: { ...toolboxPosition.value },
    moved: false,
  }

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  clearToolboxBackendEditLongPressTimer()
  if (backendEditModeEnabled.value) {
    const pointerId = event.pointerId
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    toolboxBackendEditLongPressTimer = globalThis.setTimeout(() => {
      const dragState = toolboxDragState.value
      if (!dragState || dragState.pointerId !== pointerId || dragState.moved) {
        return
      }

      toolboxDragState.value = null
      if (target?.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId)
      }
      suppressFloatingToolboxClick.value = true
      closeToolbox()
      disableBackendEditMode()
      globalThis.setTimeout(() => {
        suppressFloatingToolboxClick.value = false
      }, 300)
    }, toolboxBackendEditLongPressMs)
  }
}

const handleFloatingToolboxPointerMove = (event: PointerEvent): void => {
  const dragState = toolboxDragState.value
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return
  }

  const deltaX = event.clientX - dragState.startX
  const deltaY = event.clientY - dragState.startY
  if (!dragState.moved && Math.hypot(deltaX, deltaY) < toolboxDragThreshold) {
    return
  }

  dragState.moved = true
  clearToolboxBackendEditLongPressTimer()
  toolboxPosition.value = positionFromPointerEvent(event, dragState.startPosition)
  event.preventDefault()
}

const finishFloatingToolboxDrag = (event: PointerEvent): void => {
  const dragState = toolboxDragState.value
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return
  }

  toolboxDragState.value = null
  clearToolboxBackendEditLongPressTimer()
  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  if (!dragState.moved) {
    return
  }

  writeToolboxPosition(toolboxPosition.value)
  suppressFloatingToolboxClick.value = true
  globalThis.setTimeout(() => {
    suppressFloatingToolboxClick.value = false
  }, 250)
}

const cancelFloatingToolboxDrag = (event: PointerEvent): void => {
  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  clearToolboxBackendEditLongPressTimer()
  toolboxDragState.value = null
}

const handleFloatingToolboxClick = (): void => {
  if (suppressFloatingToolboxClick.value) {
    return
  }

  handleToolboxTap()
}

const requireBackendEditMode = (actionLabel = '後台編輯'): boolean => {
  if (backendEditModeEnabled.value) {
    return true
  }

  backendEditMessage.value = `${actionLabel}需先連點工具箱 6 下`
  openToolbox()
  return false
}

const showToolboxHome = (): void => {
  activeToolboxPanel.value = 'home'
}

const closeKnowledge = (): void => {
  isKnowledgeOpen.value = false
}

const knowledgeTargetLabels: Record<PosKnowledgeArticle['target'], string> = {
  order: '點餐',
  queue: '桌況',
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

  if (action === 'supply') {
    openSupplyStatus()
    return
  }

  if (action === 'printing') {
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

  if (action === 'appearance') {
    activeToolboxPanel.value = 'appearance'
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

  if (event.key === 'Escape' && isSupplyStatusOpen.value) {
    event.preventDefault()
    closeSupplyStatus()
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
    void handleSubmitCounterOrder()
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
      selectMenuItem(item)
    }
  }
}

const setWorkspaceTab = (tab: WorkspaceTab): void => {
  activeCartQuickEditor.value = null
  if (tab !== 'order') {
    closeOptionPanel()
  }
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

const onlineReminderLineOptions = (line: CartLine): string => line.options.join(' / ') || '標準'

const onlineReminderOrderLineSummary = (order: PosOrder): string => {
  if (order.lines.length === 0) {
    return '尚無品項明細'
  }

  const visibleLines = order.lines
    .slice(0, 2)
    .map((line) => `${line.name} x${line.quantity}`)
    .join('、')
  const hiddenCount = order.lines.length - 2
  return hiddenCount > 0 ? `${visibleLines}，另 ${hiddenCount} 項` : visibleLines
}

const onlineReminderOrderMeta = (order: PosOrder): string =>
  `${order.customerName || '線上顧客'} · ${serviceModeLabels[order.mode]} · ${formatCurrency(order.subtotal)}`

const openOnlineReminderDetail = (order: PosOrder): void => {
  activeOnlineReminderDetailId.value = order.id
}

const closeOnlineReminderDetail = (): void => {
  activeOnlineReminderDetailId.value = null
}

const snoozeOnlineReminderFromDetail = (): void => {
  acknowledgeOnlineOrderReminders()
  closeOnlineReminderDetail()
}

const acceptOnlineReminderOrder = async (order: PosOrder): Promise<void> => {
  const accepted = await acceptOnlineOrderForStation(order.id)
  if (accepted) {
    if (activeOnlineReminderDetailId.value === order.id) {
      closeOnlineReminderDetail()
    }
    queueActionMessage.value = `${compactOrderId(order.id)} 已接單並排入桌況頁`
    setWorkspaceTab('queue')
    return
  }

  queueActionMessage.value = `${compactOrderId(order.id)} 接單失敗，請稍後重試`
}

const rejectOnlineReminderOrder = async (order: PosOrder): Promise<void> => {
  const rejected = await rejectOnlineOrderForStation(order.id)
  if (rejected) {
    if (activeOnlineReminderDetailId.value === order.id) {
      closeOnlineReminderDetail()
    }
    queueActionMessage.value = `${compactOrderId(order.id)} 已拒絕接單`
    setWorkspaceTab('queue')
    return
  }

  queueActionMessage.value = `${compactOrderId(order.id)} 拒絕失敗，請查看訂單狀態`
}

watch(onlineReminderDetailOrder, (order) => {
  if (!order && activeOnlineReminderDetailId.value) {
    closeOnlineReminderDetail()
  }
})

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
  void startCounterDraft('takeout')
  activeCartQuickEditor.value = null
  closeOptionPanel()
  setWorkspaceTab('order')
}

const setActiveView = (view: AppView): void => {
  if (view === 'admin' && !requireBackendEditMode('進入後台')) {
    return
  }

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

const stationBatchProductIdSet = computed(() => new Set(stationBatchProductIds.value))
const isStationBatchBusy = computed(() => stationBatchProductIds.value.length > 0)

const setProductSupplyStatus = (productId: string, status: ProductSupplyStatus): void => {
  productSupplyStatuses.value = {
    ...productSupplyStatuses.value,
    [productId]: status,
  }
}

const setNoteSupplyStatus = (noteId: string, status: ProductSupplyStatus): void => {
  noteSupplyStatuses.value = {
    ...noteSupplyStatuses.value,
    [noteId]: status,
  }
}

const openSupplyStatus = (): void => {
  if (!requireBackendEditMode('供應狀態編輯')) {
    return
  }

  isToolboxOpen.value = false
  isSupplyStatusOpen.value = true
}

const closeSupplyStatus = (): void => {
  isSupplyStatusOpen.value = false
}

const selectSupplyCategory = (category: SupplyCategoryFilter): void => {
  supplyCategoryFilter.value = category
}

const selectedSupplyCategoryIsNotes = computed(() => supplyCategoryFilter.value === supplyNotesFilterValue)
const selectedSupplyCategoryIsNoteGroups = computed(() => supplyCategoryFilter.value === supplyNoteGroupsFilterValue)
const selectedSupplyMenuCategory = computed<MenuCategory | null>(() => {
  const category = supplyCategoryFilter.value
  return category === supplyNotesFilterValue || category === supplyNoteGroupsFilterValue ? null : category
})

const addMenuCategory = (): void => {
  const label = normalizeSpace(newCategoryName.value).slice(0, 40)
  if (!label) {
    supplyActionMessage.value = '請輸入分類名稱'
    return
  }

  const existingIds = new Set(menuCategoryDefinitions.value.map((category) => category.id))
  const id = uniqueId(label, existingIds)
  pushSupplyUndo('新增分類')
  menuCategoryDefinitions.value = [...menuCategoryDefinitions.value, { id, label }]
  newCategoryName.value = ''
  supplyCategoryFilter.value = id
  supplyActionMessage.value = `${label} 已新增`
}

const fallbackSupplyCategory = (): SupplyCategoryFilter =>
  menuCategoryOptions.value.find((category) => category.id !== supplyCategoryFilter.value)?.id ?? supplyNotesFilterValue

const deleteSelectedMenuCategory = async (): Promise<void> => {
  const categoryId = selectedSupplyMenuCategory.value
  if (!categoryId) {
    return
  }

  const products = [
    ...new Map(
      [...productStatusCatalog.value, ...menuCatalog.value]
        .filter((product) => product.category === categoryId)
        .map((product) => [product.id, product]),
    ).values(),
  ]
  const undoSnapshot = captureSupplySnapshot('刪除分類')
  let deletedCount = 0

  for (const product of products) {
    const deleted = await deleteProductForStation(product.id)
    if (deleted) {
      deletedCount += 1
      productOptionAssignments.value = withoutRecordKey(productOptionAssignments.value, product.id)
      productSupplyStatuses.value = withoutRecordKey(productSupplyStatuses.value, product.id)
    }
  }

  if (deletedCount !== products.length) {
    if (deletedCount > 0) {
      commitSupplyUndoSnapshot(undoSnapshot)
    }
    supplyActionMessage.value = `${categoryLabelFor(categoryId)} 刪除未完成，仍有商品無法移除`
    return
  }

  commitSupplyUndoSnapshot(undoSnapshot)
  menuCategoryDefinitions.value = menuCategoryDefinitions.value.filter((category) => category.id !== categoryId)
  supplyCategoryFilter.value = fallbackSupplyCategory()
  supplyActionMessage.value = `${categoryLabelFor(categoryId)} 已刪除，連同 ${deletedCount} 個商品移除`
}

const assignedOptionGroupIdsForCategory = (categoryId: MenuCategory): string[] => {
  const categoryProducts = [
    ...new Map(
      [...productStatusCatalog.value, ...menuCatalog.value]
        .filter((product) => product.category === categoryId)
        .map((product) => [product.id, product]),
    ).values(),
  ]
  const inheritedIds = categoryProducts
    .map((product) => assignedOptionGroupIdsForProduct(product))
    .find((groupIds) => groupIds.length > 0)

  if (inheritedIds) {
    return inheritedIds
  }

  if (defaultConfigurableCategoryIds.includes(categoryId)) {
    const defaultIds = new Set(beverageOptionGroups.map((group) => group.id))
    return optionGroupCatalog.value.filter((group) => defaultIds.has(group.id)).map((group) => group.id)
  }

  return []
}

const nextProductSortOrder = (categoryId: MenuCategory): number => {
  const categoryProducts = [
    ...new Map(
      [...productStatusCatalog.value, ...menuCatalog.value]
        .filter((product) => product.category === categoryId)
        .map((product) => [product.id, product]),
    ).values(),
  ]
  const currentMax = categoryProducts.reduce((max, product) => Math.max(max, product.sortOrder), 0)
  return currentMax + 10
}

const addProductToSupplyCategory = async (): Promise<void> => {
  const categoryId = selectedSupplyMenuCategory.value
  const name = normalizeSpace(newProductName.value).slice(0, 60)
  const price = Math.max(0, Math.trunc(Number(newProductPrice.value) || 0))

  if (!categoryId) {
    supplyActionMessage.value = '請先選擇商品分類'
    return
  }

  if (!name) {
    supplyActionMessage.value = '請輸入商品名稱'
    return
  }

  const undoSnapshot = captureSupplySnapshot('新增商品')
  const product = await createProductForStation({
    sku: newProductSku.value.trim() || slugFromText(name, 'product'),
    name,
    category: categoryId,
    price,
    tags: [],
    accent: '#0b6b63',
    isAvailable: true,
    sortOrder: nextProductSortOrder(categoryId),
    posVisible: true,
    onlineVisible: true,
    qrVisible: true,
    prepStation: defaultConfigurableCategoryIds.includes(categoryId) ? 'bar' : 'counter',
    printLabel: true,
    inventoryCount: null,
    lowStockThreshold: null,
    soldOutUntil: null,
  })

  if (!product) {
    supplyActionMessage.value = `${name} 新增失敗`
    return
  }

  commitSupplyUndoSnapshot(undoSnapshot)
  const inheritedGroupIds = assignedOptionGroupIdsForCategory(categoryId)
  productOptionAssignments.value = {
    ...productOptionAssignments.value,
    [product.id]: inheritedGroupIds,
  }
  newProductName.value = ''
  newProductPrice.value = 0
  newProductSku.value = ''
  supplyActionMessage.value = `${product.name} 已加入 ${categoryLabelFor(categoryId)}`
}

const deleteSupplyProduct = async (product: MenuItem): Promise<void> => {
  const undoSnapshot = captureSupplySnapshot('刪除商品')
  const deleted = await deleteProductForStation(product.id)
  if (!deleted) {
    supplyActionMessage.value = `${product.name} 刪除失敗`
    return
  }

  commitSupplyUndoSnapshot(undoSnapshot)
  productOptionAssignments.value = withoutRecordKey(productOptionAssignments.value, product.id)
  productSupplyStatuses.value = withoutRecordKey(productSupplyStatuses.value, product.id)
  supplyActionMessage.value = `${product.name} 已刪除`
}

const addOptionGroup = (): void => {
  const label = normalizeSpace(newOptionGroupName.value).slice(0, 40)
  if (!label) {
    supplyActionMessage.value = '請輸入註記群組名稱'
    return
  }

  const existingIds = new Set(optionGroupCatalog.value.map((group) => group.id))
  const id = uniqueId(slugFromText(label, 'note'), existingIds)
  const max = Math.max(1, Math.trunc(Number(newOptionGroupMax.value) || 1))
  const required = newOptionGroupRequired.value
  const min = required ? 1 : 0
  pushSupplyUndo('新增註記群組')
  const group: MenuOptionGroup = {
    id,
    label,
    required,
    min,
    max,
    requirement: optionGroupRequirement({ required, min, max }),
    choices: [],
  }

  optionGroupCatalog.value = [...optionGroupCatalog.value, group]
  newOptionGroupName.value = ''
  newOptionGroupRequired.value = false
  newOptionGroupMax.value = 1
  supplyActionMessage.value = `${label} 已新增`
}

const deleteOptionGroup = (groupId: string): void => {
  const group = optionGroupCatalog.value.find((entry) => entry.id === groupId)
  pushSupplyUndo('刪除註記群組')
  optionGroupCatalog.value = optionGroupCatalog.value.filter((entry) => entry.id !== groupId)
  productOptionAssignments.value = Object.fromEntries(
    Object.entries(productOptionAssignments.value).map(([productId, groupIds]) => [
      productId,
      groupIds.filter((id) => id !== groupId),
    ]),
  )
  noteSupplyStatuses.value = Object.fromEntries(
    Object.entries(noteSupplyStatuses.value).filter(([noteId]) => !noteId.startsWith(`${groupId}-`)),
  )
  supplyActionMessage.value = `${group?.label ?? '註記群組'} 已刪除`
}

const updateOptionGroupRequired = (groupId: string, required: boolean): void => {
  const group = optionGroupCatalog.value.find((entry) => entry.id === groupId)
  if (!group || group.required === required) {
    return
  }

  pushSupplyUndo('更新註記群組必選狀態')
  optionGroupCatalog.value = optionGroupCatalog.value.map((entry) => {
    if (entry.id !== groupId) {
      return entry
    }

    const max = Math.max(1, entry.max)
    const min = required ? Math.max(1, Math.min(max, entry.min || 1)) : 0
    return {
      ...entry,
      required,
      min,
      max,
      requirement: optionGroupRequirement({ required, min, max }),
    }
  })
  supplyActionMessage.value = `${group.label} 已改為${required ? '必選' : '選填'}`
}

const addAvailableNote = (): void => {
  const label = normalizeSpace(newAvailableNoteName.value).slice(0, 40)
  if (!label) {
    supplyActionMessage.value = '請輸入註記名稱'
    return
  }

  const priceDelta = Math.trunc(Number(newAvailableNotePriceDelta.value) || 0)
  const existingIds = new Set(availableNoteCatalog.value.map((choice) => choice.id))
  const id = uniqueId(slugFromText(label, 'choice'), existingIds)
  const choice: MenuOptionChoice = { id, label }
  if (priceDelta > 0) {
    choice.priceDelta = priceDelta
  }

  pushSupplyUndo('新增可用註記')
  availableNoteCatalog.value = [...availableNoteCatalog.value, choice]
  newAvailableNoteName.value = ''
  newAvailableNotePriceDelta.value = 0
  supplyActionMessage.value = `${label} 已新增至可用註記`
}

const deleteAvailableNote = (choiceId: string): void => {
  const note = availableNoteCatalog.value.find((choice) => choice.id === choiceId)
  pushSupplyUndo('刪除可用註記')
  availableNoteCatalog.value = availableNoteCatalog.value.filter((choice) => choice.id !== choiceId)
  optionGroupCatalog.value = optionGroupCatalog.value.map((group) => ({
    ...group,
    choices: group.choices.filter((choice) => choice.id !== choiceId),
  }))
  noteSupplyStatuses.value = Object.fromEntries(
    Object.entries(noteSupplyStatuses.value).filter(([noteId]) => noteId !== choiceId && !noteId.endsWith(`-${choiceId}`)),
  )
  supplyActionMessage.value = `${note?.label ?? '註記'} 已刪除`
}

const updateAvailableNoteSupplyStatus = (choice: MenuOptionChoice, status: ProductSupplyStatus): void => {
  if (availableNoteSupplyStatus(choice.id) === status) {
    return
  }

  pushSupplyUndo('變更註記供應狀態')
  setNoteSupplyStatus(choice.id, status)
  supplyActionMessage.value = `${choice.label} 已更新為${supplyStatusLabel(status)}`
}

const groupHasAvailableNote = (groupId: string, choiceId: string): boolean =>
  optionGroupCatalog.value
    .find((group) => group.id === groupId)
    ?.choices.some((choice) => choice.id === choiceId) ?? false

const toggleGroupAvailableNote = (groupId: string, choiceId: string): void => {
  const choice = availableNoteCatalog.value.find((entry) => entry.id === choiceId)
  const group = optionGroupCatalog.value.find((entry) => entry.id === groupId)
  if (!choice || !group) {
    return
  }

  pushSupplyUndo('更新註記群組')
  const exists = group.choices.some((entry) => entry.id === choiceId)
  optionGroupCatalog.value = optionGroupCatalog.value.map((entry) =>
    entry.id === groupId
      ? {
          ...entry,
          choices: exists
            ? entry.choices.filter((entryChoice) => entryChoice.id !== choiceId)
            : mergeOptionChoices([...entry.choices, choice]),
        }
      : entry,
  )
  supplyActionMessage.value = `${group.label} 已更新`
}

const productHasOptionGroup = (product: MenuItem, groupId: string): boolean =>
  assignedOptionGroupIdsForProduct(product).includes(groupId)

const toggleProductOptionGroup = (product: MenuItem, groupId: string): void => {
  const currentIds = assignedOptionGroupIdsForProduct(product)
  const nextIds = currentIds.includes(groupId)
    ? currentIds.filter((id) => id !== groupId)
    : [...currentIds, groupId]

  pushSupplyUndo('更新商品註記')
  productOptionAssignments.value = {
    ...productOptionAssignments.value,
    [product.id]: nextIds,
  }
  supplyActionMessage.value = `${product.name} 註記已更新`
}

const supplyRowIsBusy = (row: SupplyStatusRow): boolean =>
  row.kind === 'product' && (togglingProductId.value === row.id || stationBatchProductIdSet.value.has(row.id))

const updateSupplyRowStatus = async (
  row: SupplyStatusRow,
  status: ProductSupplyStatus,
  options: { recordUndo?: boolean } = {},
): Promise<void> => {
  if (row.status === status) {
    return
  }

  if (options.recordUndo !== false) {
    pushSupplyUndo('變更供應狀態')
  }

  if (row.kind === 'product') {
    const updated = await updateProductSupplyStatus(row.id, status)
    if (updated) {
      setProductSupplyStatus(row.id, status)
    }
    return
  }

  setNoteSupplyStatus(row.id, status)
}

const updateVisibleSupplyRows = async (status: ProductSupplyStatus): Promise<void> => {
  if (isStationBatchBusy.value) {
    return
  }

  const targetRows = visibleSupplyRows.value.filter((row) => row.status !== status)
  if (targetRows.length === 0) {
    return
  }

  pushSupplyUndo('批次變更供應狀態')
  stationBatchProductIds.value = targetRows.filter((row) => row.kind === 'product').map((row) => row.id)
  for (const row of targetRows) {
    await updateSupplyRowStatus(row, status, { recordUndo: false })
  }
  stationBatchProductIds.value = []
}

const openRegisterSessionAction = (): void => {
  if (!requireBackendEditMode('開班')) {
    return
  }

  void openRegisterSessionForStation(registerOpeningCash.value, registerNote.value.trim())
}

const closeRegisterSessionAction = (): void => {
  if (!requireBackendEditMode('關班')) {
    return
  }

  void closeRegisterSessionForStation(
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

watch(posAppearanceSettings, (settings) => {
  const nextPreferences = uiPreferencesFromRuntimeAppearance(settings)
  if (appearanceSettingsEqual(posUiPreferences.value, nextPreferences)) {
    return
  }

  isApplyingRemoteAppearanceSettings.value = true
  posUiPreferences.value = nextPreferences
  writePosUiPreferences(nextPreferences)
  void nextTick(() => {
    isApplyingRemoteAppearanceSettings.value = false
  })
}, { deep: true })

watch(posUiPreferences, (preferences) => {
  const normalizedPreferences: PosUiPreferences = {
    schemaVersion: 3,
    ...posAppearancePayloadFromPreferences(preferences),
  }
  writePosUiPreferences(normalizedPreferences)
  if (!isApplyingRemoteAppearanceSettings.value) {
    persistPosAppearancePreferences(normalizedPreferences)
  }
}, { deep: true })

watch(productSupplyStatuses, (statuses) => {
  writeSupplyStatusMap(supplyProductStatusStorageKey, statuses)
}, { deep: true })

watch(noteSupplyStatuses, (statuses) => {
  writeSupplyStatusMap(supplyNoteStatusStorageKey, statuses)
}, { deep: true })

watch(menuCategoryDefinitions, (definitions) => {
  writeMenuCategoryDefinitions(definitions)
}, { deep: true })

watch(availableNoteCatalog, (choices) => {
  writeAvailableNotes(choices)
}, { deep: true })

watch(optionGroupCatalog, (groups) => {
  writeOptionGroups(groups)
  const mergedChoices = mergeOptionChoices([...availableNoteCatalog.value, ...groups.flatMap((group) => group.choices)])
  if (mergedChoices.length !== availableNoteCatalog.value.length) {
    availableNoteCatalog.value = mergedChoices
  }
}, { deep: true })

watch(productOptionAssignments, (assignments) => {
  writeProductOptionAssignments(assignments)
}, { deep: true })

watch(onlineOrderingSettings, (settings) => {
  applyRuntimeSupplyConfig(settings)
}, { immediate: true, deep: true })

watch(supplyCategoryOptions, (options) => {
  if (!options.some((option) => option.value === supplyCategoryFilter.value)) {
    supplyCategoryFilter.value = options[0]?.value ?? supplyNotesFilterValue
  }
}, { immediate: true })

onMounted(() => {
  updatePosStableViewportHeight(true)
  globalThis.addEventListener('keydown', handlePosShortcut)
  globalThis.addEventListener('resize', handleViewportResize)
  globalThis.addEventListener('orientationchange', scheduleForcedViewportRefresh)
  globalThis.visualViewport?.addEventListener('resize', handleViewportResize)
  claimClockTimer = globalThis.setInterval(() => {
    currentTime.value = Date.now()
  }, 15_000)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', handlePosShortcut)
  globalThis.removeEventListener('resize', handleViewportResize)
  globalThis.removeEventListener('orientationchange', scheduleForcedViewportRefresh)
  globalThis.visualViewport?.removeEventListener('resize', handleViewportResize)
  if (claimClockTimer !== null) {
    globalThis.clearInterval(claimClockTimer)
  }
  clearBackendEditTapTimer()
  clearToolboxBackendEditLongPressTimer()
  clearAppearancePersistTimer()
  clearCategorySortTimer()
  clearProductSortTimer()
  if (categorySortSuppressTimer !== null) {
    globalThis.clearTimeout(categorySortSuppressTimer)
  }
  if (productSortSuppressTimer !== null) {
    globalThis.clearTimeout(productSortSuppressTimer)
  }
})
</script>

<template>
  <main
    class="pos-shell"
    :class="{
      'pos-shell--consumer': activeView === 'online',
      'pos-shell--workspace': activeView === 'pos',
      'pos-shell--dark': activeView === 'pos' && posUiPreferences.darkMode,
    }"
    :style="activeView === 'pos' ? posWorkbenchPreferenceStyle : undefined"
  >
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

    <div
      v-else-if="activeView === 'pos'"
      class="pos-scale-viewport"
      :style="posWorkbenchPreferenceStyle"
    >
      <div class="pos-scale-stage">
        <section
          class="pos-workbench"
          :class="{ 'pos-workbench--ordering': activeWorkspaceTab === 'order' }"
          aria-label="門市 POS 工作站"
        >
          <section
            class="pos-main-surface"
            :class="{
              'pos-main-surface--ordering': activeWorkspaceTab === 'order',
              'pos-main-surface--queue': activeWorkspaceTab === 'queue',
            }"
          >
            <header
              v-if="activeWorkspaceTab !== 'order'"
              class="pos-command-bar"
              :class="{ 'pos-command-bar--queue': activeWorkspaceTab === 'queue' }"
            >
              <div>
                <template v-if="activeWorkspaceTab === 'queue'">
                  <h1>{{ activeWorkspaceTitle }}</h1>
                </template>
                <template v-else>
                  <p class="eyebrow">Workspace</p>
                  <h1>{{ activeWorkspaceTitle }}</h1>
                  <span>{{ registerStatusLabel }} · {{ currentClockLabel }}</span>
                </template>
              </div>
              <div v-if="activeWorkspaceTab === 'queue'" class="queue-command-actions">
                <span>{{ pendingOrders.length }} 張待處理</span>
                <span>顯示 {{ visibleQueueOrders.length }} 張 · 全部 {{ queueBaseOrders.length }} 張</span>
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
                    <button class="ticket-back-button" type="button" title="返回桌況頁" @click="setWorkspaceTab('queue')">
                      <ChevronLeft :size="38" aria-hidden="true" />
                    </button>
                    <div class="ticket-title-block">
                      <h2 id="cart-title">{{ serviceModeLabels[serviceMode] }}</h2>
                      <span>新單 · 今天 {{ ticketStartedLabel }}</span>
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
                      <strong :title="counterDraftOrderId ?? '新單'">No. {{ ticketOrderNumber }}</strong>
                    </div>
                    <div>
                      <strong>{{ formatCurrency(ticketDisplayTotal) }}</strong>
                      <button class="icon-button ticket-clear-button" type="button" title="清空購物車" @click="clearTicketDraft">
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

                  <div class="ticket-compact-controls" aria-label="付款與常用備註">
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
                    </div>

                    <div class="ticket-note-chips" aria-label="常用備註">
                      <button
                        v-for="note in visibleTicketNoteSnippets"
                        :key="`ticket-${note}`"
                        type="button"
                        :class="{ 'ticket-note-chip--active': customerHasNote(note) }"
                        :aria-pressed="customerHasNote(note)"
                        @click="toggleCustomerNote(note)"
                      >
                        <Check v-if="customerHasNote(note)" :size="14" aria-hidden="true" />
                        {{ note }}
                      </button>
                    </div>
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
                      <button
                        v-if="lineRequiresOptions(line)"
                        class="cart-line-summary"
                        type="button"
                        @click="editCartLineOptions(line)"
                      >
                        <h3>{{ line.name }}</h3>
                        <p class="cart-line-options" :title="line.options.join(' / ') || '標準'">
                          <span
                            v-for="(option, optionIndex) in line.options.length > 0 ? line.options : ['標準']"
                            :key="`${line.itemId}-${optionIndex}-${option}`"
                          >
                            {{ option }}
                          </span>
                        </p>
                      </button>
                      <div v-else class="cart-line-summary">
                        <h3>{{ line.name }}</h3>
                        <p class="cart-line-options" :title="line.options.join(' / ') || '標準'">
                          <span
                            v-for="(option, optionIndex) in line.options.length > 0 ? line.options : ['標準']"
                            :key="`${line.itemId}-${optionIndex}-${option}`"
                          >
                            {{ option }}
                          </span>
                        </p>
                      </div>
                      <div class="quantity-stepper" :aria-label="`${line.name} 數量`">
                        <button type="button" title="減少" @click.stop="decreaseLine(line.itemId)">
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
                          @click.stop
                          @input="updateCartQuantityInput(line.itemId, $event)"
                          @change="commitCartQuantityInput(line.itemId, $event)"
                          @keydown.enter.stop="blurQuantityInput"
                          @keydown.escape.stop="blurQuantityInput"
                        />
                        <button type="button" title="增加" @click.stop="increaseLine(line.itemId)">
                          <Plus :size="16" aria-hidden="true" />
                        </button>
                      </div>
                      <strong>{{ formatCurrency(line.unitPrice * line.quantity) }}</strong>
                    </article>

                    <article v-if="activeOptionItem && !activeOptionLineId" class="cart-line cart-line--pending">
                      <div>
                        <h3>{{ activeOptionItem.name }}</h3>
                        <p v-if="optionWarning" class="cart-line-warning">
                          <CircleAlert :size="16" aria-hidden="true" />
                          {{ optionWarning }}
                        </p>
                        <p v-else>{{ selectedOptionDetails.labels.join(' / ') || '尚未完成選項' }}</p>
                      </div>
                      <div class="quantity-stepper quantity-stepper--readonly" aria-label="待選品項數量">
                        <span>1</span>
                      </div>
                      <strong>{{ formatCurrency(pendingOptionLineTotal) }}</strong>
                    </article>

                    <div v-if="cartLines.length === 0 && !activeOptionItem" class="empty-state">
                      <ShoppingCart :size="24" aria-hidden="true" />
                      <span>尚未加入品項</span>
                    </div>
                  </div>

                  <footer class="checkout-bar checkout-bar--ticket">
                    <div class="ticket-footer-summary-row">
                      <div class="ticket-total-summary">
                        <span>{{ ticketDisplayQuantity }} 件</span>
                        <strong>{{ formatCurrency(ticketDisplayTotal) }}</strong>
                      </div>
                      <button
                        class="icon-button ticket-more-button"
                        type="button"
                        title="開啟工具箱"
                        aria-controls="pos-toolbox-modal"
                        :aria-expanded="isToolboxOpen"
                        @click="handleToolboxTap"
                      >
                        <MoreHorizontal :size="24" aria-hidden="true" />
                      </button>
                    </div>
                    <div class="ticket-action-group" aria-label="訂單操作">
                      <button
                        class="primary-button ticket-submit-button"
                        type="button"
                        :disabled="ticketActionDisabled()"
                        @click="handleTicketAction('checkout-print')"
                      >
                        <span class="ticket-action-icon">
                          <ReceiptText :size="24" aria-hidden="true" />
                        </span>
                        <span class="ticket-action-label">{{ activeTicketAction === 'checkout-print' ? '處理中' : '結帳' }}</span>
                      </button>
                      <button
                        class="ticket-submit-button ticket-submit-button--secondary"
                        type="button"
                        :disabled="ticketActionDisabled()"
                        @click="handleTicketAction('print')"
                      >
                        <span class="ticket-action-icon">
                          <Printer :size="24" aria-hidden="true" />
                        </span>
                        <span class="ticket-action-label">{{ activeTicketAction === 'print' ? '出單中' : '出單' }}</span>
                      </button>
                      <button
                        class="ticket-submit-button ticket-submit-button--secondary ticket-submit-button--wide"
                        type="button"
                        :disabled="ticketActionDisabled()"
                        @click="handleTicketAction('checkout-only')"
                      >
                        <span class="ticket-action-icon">
                          <CreditCard :size="24" aria-hidden="true" />
                        </span>
                        <span class="ticket-action-label">{{ activeTicketAction === 'checkout-only' ? '結帳中' : '結帳不出單' }}</span>
                      </button>
                    </div>
                  </footer>
                </section>

                <section class="menu-panel" aria-labelledby="menu-title">
                  <div class="menu-panel-heading">
                    <div>
                      <p class="eyebrow">Menu</p>
                      <h2 id="menu-title">商品菜單</h2>
                      <span class="panel-note">顯示 {{ filteredMenu.length }} 個品項</span>
                    </div>
                    <label class="search-box menu-search-box">
                      <Search :size="18" aria-hidden="true" />
                      <input ref="searchInput" v-model="searchTerm" type="search" placeholder="搜尋品項或標籤" />
                    </label>
                  </div>

                  <div
                    class="menu-workarea"
                  >
                    <aside class="category-rail" aria-label="品項分類">
                      <button
                        v-for="category in categoryOptions"
                        :key="category.value"
                        class="category-rail-button"
                        :class="{
                          'category-rail-button--active': selectedCategory === category.value,
                          'category-rail-button--sortable': categorySortEnabled(category.value),
                          'category-rail-button--dragging':
                            categorySortDragState?.category === category.value && categorySortDragState.dragging,
                          'category-rail-button--drop-target': categorySortDragState?.overCategory === category.value,
                        }"
                        type="button"
                        :data-category-id="category.value"
                        @pointerdown="startCategorySortDrag(category.value, $event)"
                        @pointermove="moveCategorySortDrag"
                        @pointerup="finishCategorySortDrag"
                        @pointercancel="cancelCategorySortDrag"
                        @click="handleCategoryClick(category.value)"
                      >
                        <span>{{ category.label }}</span>
                        <GripVertical
                          v-if="categorySortEnabled(category.value)"
                          class="category-drag-grip"
                          :size="18"
                          aria-hidden="true"
                        />
                      </button>
                    </aside>

                    <div
                      class="catalog-panel"
                      @pointerdown="startCategorySwipe"
                      @pointermove="moveCategorySwipe"
                      @pointerup="finishCategorySwipe"
                      @pointercancel="cancelCategorySwipe"
                      @pointerleave="cancelCategorySwipe"
                    >
                      <div class="catalog-meta">
                        <span>{{ selectedCategoryLabel }} · 點選商品加入訂單</span>
                        <strong>{{ filteredMenu.length }} 項</strong>
                      </div>

                      <div class="product-grid">
                        <article
                          v-for="item in filteredMenu"
                          :key="item.id"
                          class="product-tile"
                          :class="{
                            'product-tile--in-cart': lineQuantityByItem(item.id) > 0,
                            'product-tile--quantity-control': lineQuantityByItem(item.id) > 0 && !productRequiresOptions(item),
                            'product-tile--stopped': productOrderingDisabled(item),
                            'product-tile--sort-enabled': productSortEnabled(item),
                            'product-tile--dragging':
                              productSortDragState?.itemId === item.id && productSortDragState.dragging,
                            'product-tile--drop-target': productSortDragState?.overItemId === item.id,
                          }"
                          :data-product-id="item.id"
                          @pointerdown="startProductSortDrag(item, $event)"
                          @pointermove="moveProductSortDrag"
                          @pointerup="finishProductSortDrag"
                          @pointercancel="cancelProductSortDrag"
                        >
                          <button
                            class="product-tile-main"
                            type="button"
                            :disabled="productOrderingDisabled(item)"
                            @click="handleProductTileClick(item)"
                          >
                            <span class="product-tile-top">
                              <span v-if="productSortEnabled(item)" class="product-drag-handle">
                                <GripVertical :size="18" aria-hidden="true" />
                              </span>
                              <span class="product-swatch" :style="{ backgroundColor: item.accent }" aria-hidden="true"></span>
                              <span class="product-category">{{ categoryLabelFor(item.category) }}</span>
                            </span>
                            <span class="product-name">{{ item.name }}</span>
                            <span class="product-meta">
                              <strong>{{ formatCurrency(item.price) }}</strong>
                              <span>{{ productTileActionLabel(item) }}</span>
                            </span>
                            <span v-if="productStockLabel(item)" class="product-stock-badge" :class="productStockClass(item)">
                              {{ productStockLabel(item) }}
                            </span>
                            <span class="product-tags">{{ item.tags.join(' / ') }}</span>
                          </button>
                          <div
                            v-if="lineQuantityByItem(item.id) > 0 && !productRequiresOptions(item) && !productOrderingDisabled(item)"
                            class="product-quantity-control"
                            :aria-label="`${item.name} 數量`"
                          >
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

                  <section
                    v-if="activeOptionItem"
                    class="menu-option-panel"
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby="menu-option-title"
                  >
                    <header class="menu-option-header">
                      <button class="icon-button option-back-button" type="button" title="返回菜單" @click="closeOptionPanel">
                        <ChevronLeft :size="28" aria-hidden="true" />
                      </button>
                      <h3 id="menu-option-title">{{ activeOptionItem.name }}</h3>
                      <strong>1</strong>
                    </header>

                    <div class="menu-option-body">
                      <p v-if="optionWarning" class="menu-option-warning" aria-live="assertive">
                        <CircleAlert :size="20" aria-hidden="true" />
                        {{ optionWarning }}
                      </p>

                      <section v-for="group in activeOptionGroups" :key="group.id" class="menu-option-group">
                        <div class="menu-option-group-title">
                          <h4>{{ group.label }}</h4>
                          <span>{{ group.requirement }}</span>
                        </div>
                        <div class="menu-option-grid">
                          <button
                            v-for="choice in group.choices"
                            :key="choice.id"
                            class="menu-option-choice"
                            :class="{ 'menu-option-choice--active': optionChoiceSelected(group, choice) }"
                            type="button"
                            @click="toggleOptionChoice(group, choice)"
                          >
                            <span>{{ choice.label }}</span>
                            <small v-if="choice.priceDelta">+{{ formatCurrency(choice.priceDelta) }}</small>
                          </button>
                        </div>
                      </section>
                    </div>

                    <footer class="menu-option-footer">
                      <button class="icon-button option-trash-button" type="button" title="取消品項" @click="closeOptionPanel">
                        <Trash2 :size="22" aria-hidden="true" />
                      </button>
                      <button class="primary-button option-confirm-button" type="button" @click="confirmMenuOptions">
                        <CheckCircle2 :size="20" aria-hidden="true" />
                        {{ activeOptionLineId ? '更新品項' : '加入訂單' }}
                      </button>
                    </footer>
                  </section>
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
                    <button
                      v-for="note in visibleNoteSnippets"
                      :key="note"
                      type="button"
                      :class="{ 'note-shortcut--active': customerHasNote(note) }"
                      :aria-pressed="customerHasNote(note)"
                      @click="toggleCustomerNote(note)"
                    >
                      <Check v-if="customerHasNote(note)" :size="14" aria-hidden="true" />
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
                      :disabled="ticketActionDisabled()"
                      @click="handleTicketAction('checkout-print')"
                    >
                      <ReceiptText :size="20" aria-hidden="true" />
                      {{ activeTicketAction === 'checkout-print' ? '處理中' : '結帳' }}
                    </button>
                  </footer>
                </section>

                <section v-if="activeWorkspaceTab === 'queue'" class="queue-section">
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
                    v-if="activeOnlineReminderOrders.length > 0"
                    class="online-reminder-banner"
                    aria-live="assertive"
                  >
                    <div class="online-reminder-summary">
                      <CircleAlert :size="22" aria-hidden="true" />
                      <div>
                        <p class="eyebrow">Online Order</p>
                        <h3>{{ activeOnlineReminderOrders.length }} 張線上/掃碼新單待接單</h3>
                        <span>
                          {{ onlineReminderThresholdLabel }} · {{ onlineReminderToneLabel }} ·
                          目前 {{ onlineOrderReminder.unconfirmedCount }} 張等待確認
                        </span>
                        <small v-if="onlineOrderReminder.audioMessage">{{ onlineOrderReminder.audioMessage }}</small>
                        <div class="online-reminder-list">
                          <article v-for="order in activeOnlineReminderOrders.slice(0, 3)" :key="order.id">
                            <div class="online-reminder-item-copy">
                              <strong>{{ compactOrderId(order.id) }}</strong>
                              <span class="online-reminder-item-meta">{{ onlineReminderOrderMeta(order) }}</span>
                              <span class="online-reminder-item-lines">{{ onlineReminderOrderLineSummary(order) }}</span>
                            </div>
                            <div class="online-reminder-item-actions">
                              <button
                                type="button"
                                class="online-reminder-detail-button"
                                @click.stop="openOnlineReminderDetail(order)"
                              >
                                查看訂單內容
                              </button>
                              <button
                                type="button"
                                class="online-reminder-reject-button"
                                :disabled="voidingOrderId === order.id"
                                @click.stop="rejectOnlineReminderOrder(order)"
                              >
                                {{ voidingOrderId === order.id ? '拒絕中' : '拒絕接單' }}
                              </button>
                              <button
                                type="button"
                                class="online-reminder-accept-button"
                                :disabled="claimingOrderId === order.id"
                                @click.stop="acceptOnlineReminderOrder(order)"
                              >
                                {{ claimingOrderId === order.id ? '接單中' : '接單' }}
                              </button>
                            </div>
                          </article>
                          <small v-if="activeOnlineReminderOrders.length > 3" class="online-reminder-more-count">
                            另 {{ activeOnlineReminderOrders.length - 3 }} 張待確認
                          </small>
                        </div>
                      </div>
                    </div>
                    <div class="online-reminder-actions">
                      <button type="button" @click="acknowledgeOnlineOrderReminders">稍後提醒</button>
                      <button
                        class="primary-button"
                        type="button"
                        :disabled="!primaryOnlineReminderOrder"
                        @click="primaryOnlineReminderOrder && openOnlineReminderDetail(primaryOnlineReminderOrder)"
                      >
                        <ReceiptText :size="18" aria-hidden="true" />
                        查看訂單內容
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
                    <button class="queue-reset-button queue-reset-button--inline" type="button" @click="resetQueueFilters">
                      重設篩選
                    </button>
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

                  <section v-if="queueActionMessage" class="queue-admin-card" aria-live="polite">
                    <div class="queue-admin-card-copy">
                      <CircleAlert :size="20" aria-hidden="true" />
                      <div>
                        <strong>操作狀態</strong>
                        <span>{{ queueActionMessage }}</span>
                      </div>
                    </div>
                    <button type="button" @click="queueActionMessage = ''">關閉</button>
                  </section>

                  <div class="queue-list-scroll" aria-label="桌況訂單列表">
                    <div v-if="visibleQueueOrders.length > 0" class="queue-list-card">
                      <div
                        v-for="order in visibleQueueOrders"
                        :key="order.id"
                        class="swipe-row order-swipe-row"
                        :class="swipeRowClass(orderSwipeKey(order))"
                      >
                        <div class="swipe-action-stack" aria-label="訂單滑動動作">
                          <button
                            class="swipe-action swipe-action--complete"
                            type="button"
                            :disabled="orderSwipeCompleteDisabled(order)"
                            @click.stop="orderSwipeCompleteAction(order)"
                          >
                            <CheckCircle2 :size="18" aria-hidden="true" />
                            {{ orderSwipeCompleteLabel(order) }}
                          </button>
                          <button
                            class="swipe-action"
                            :class="order.source === 'counter' ? 'swipe-action--danger' : 'swipe-action--cancel'"
                            type="button"
                            :disabled="orderSwipeDeleteDisabled(order)"
                            @click.stop="orderSwipeDeleteAction(order)"
                          >
                            <Trash2 :size="18" aria-hidden="true" />
                            {{ orderSwipeDeleteLabel(order) }}
                          </button>
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
                          @click="handleOrderRowClick(order, $event)"
                        >
                          <div class="order-row-main">
                            <div class="order-row-title">
                              <span class="order-id" :title="order.id">{{ compactOrderId(order.id) }}</span>
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
                          <div class="order-row-badges order-row-title-chips" aria-label="訂單狀態">
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
                              @click="requestQueueAdminAction('void', order)"
                            >
                              <Trash2 :size="16" aria-hidden="true" />
                              {{ voidActionLabel(order) }}
                            </button>
                            <button
                              v-if="orderCanBeRefunded(order)"
                              class="order-action--refund"
                              type="button"
                              :disabled="refundingOrderId === order.id"
                              @click="requestQueueAdminAction('refund', order)"
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
                    </div>

                    <div v-if="visibleQueueOrders.length === 0" class="empty-state queue-empty-state">
                      <ReceiptText :size="24" aria-hidden="true" />
                      <span>目前沒有符合條件的訂單</span>
                    </div>
                  </div>
                </section>

                <section v-if="activeWorkspaceTab === 'printing'" class="printer-settings-section" aria-labelledby="printer-settings-title">
                  <div class="panel-heading">
                    <div>
                      <p class="eyebrow">Printer Settings</p>
                      <h2 id="printer-settings-title">出單機設定</h2>
                      <span class="panel-note">先選出單機，再用印單規則決定服務方式、品項與單據</span>
                    </div>
                    <button class="icon-button" type="button" title="送出測試列印" @click="sendPrinterHealthcheck">
                      <Printer :size="20" aria-hidden="true" />
                    </button>
                  </div>

                  <div class="printer-settings-grid">
                    <div class="printer-config-panel" aria-label="出單機">
                      <div class="printer-config-heading">
                        <strong>出單機</strong>
                        <span>{{ activePrinterStations.length }} 台啟用</span>
                      </div>
                      <div class="printer-station-list">
                        <article
                          v-for="station in printerStationRows"
                          :key="station.id"
                          class="printer-station-card"
                          :class="{ 'printer-station-card--active': station.id === printStation.id }"
                        >
                          <div class="printer-station-card-main">
                            <CheckCircle2 v-if="station.enabled" :size="20" aria-hidden="true" />
                            <CircleAlert v-else :size="20" aria-hidden="true" />
                            <div>
                              <strong>{{ station.name }}</strong>
                              <span>{{ station.enabled ? '已啟用出單機' : '未啟用出單機' }}</span>
                            </div>
                            <small>{{ station.autoPrint ? '自動出單' : '手動出單' }}</small>
                          </div>
                          <dl class="printer-station-details">
                            <div>
                              <dt>連線</dt>
                              <dd>{{ printerConnectionLabel(station) }}</dd>
                            </div>
                            <div>
                              <dt>格式</dt>
                              <dd>{{ station.protocol }}</dd>
                            </div>
                          </dl>
                        </article>
                      </div>
                    </div>

                    <div class="printer-rule-overview" aria-label="印單規則">
                      <div class="printer-config-heading">
                        <strong>印單規則</strong>
                        <div class="printer-rule-heading-actions">
                          <span>{{ printerRuleSummary }}</span>
                          <button
                            type="button"
                            class="printer-rule-save-button"
                            :disabled="printerSettingsSaving"
                            @click="savePrinterSettingsFromWorkstation"
                          >
                            <Check :size="16" aria-hidden="true" />
                            {{ printerSettingsSaving ? '儲存中' : '儲存規則' }}
                          </button>
                        </div>
                      </div>
                      <p v-if="printerSettingsActionMessage" class="printer-settings-message">
                        {{ printerSettingsActionMessage }}
                      </p>
                      <div v-if="printerRuleRows.length > 0" class="printer-rule-list">
                        <article
                          v-for="rule in printerRuleRows"
                          :key="rule.id"
                          class="printer-rule-card"
                          :class="{ 'printer-rule-card--disabled': !rule.enabled }"
                        >
                          <div class="printer-rule-main">
                            <div class="printer-rule-title-row">
                              <label class="printer-rule-name-field">
                                規則名稱
                                <input v-model="rule.name" type="text" />
                              </label>
                              <label class="printer-rule-enable-toggle">
                                <input v-model="rule.enabled" type="checkbox" />
                                啟用
                              </label>
                            </div>
                            <div class="printer-rule-control-grid">
                              <label>
                                服務方式
                                <select v-model="rule.serviceMode">
                                  <option v-for="mode in serviceModeOptions" :key="mode.value" :value="mode.value">
                                    {{ mode.label }}
                                  </option>
                                </select>
                              </label>
                              <label>
                                單據
                                <select v-model="rule.labelMode">
                                  <option v-for="mode in printLabelModeOptions" :key="mode.value" :value="mode.value">
                                    {{ mode.label }}
                                  </option>
                                </select>
                              </label>
                              <label>
                                份數
                                <input v-model.number="rule.copies" type="number" min="1" max="5" />
                              </label>
                            </div>
                            <small>{{ printerStationName(rule.stationId) }} · {{ printerRuleModeLabel(rule) }}</small>
                          </div>
                          <div class="printer-rule-scope">
                            <div class="printer-rule-scope-heading">
                              <strong>列印範圍</strong>
                              <span>{{ printerRuleScopeLabel(rule) }}</span>
                            </div>
                            <div class="printer-rule-picker-section">
                              <div class="printer-rule-picker-title">
                                <strong>分類</strong>
                                <span>{{ printerRuleCategoriesLabel(rule) }}</span>
                              </div>
                              <div class="printer-rule-chip-grid" aria-label="印單規則分類">
                                <label
                                  v-for="category in menuCategoryOptions"
                                  :key="category.id"
                                  class="printer-rule-chip"
                                  :class="{ 'printer-rule-chip--active': rule.categories.includes(category.id) }"
                                >
                                  <input
                                    type="checkbox"
                                    :checked="rule.categories.includes(category.id)"
                                    @change="togglePrinterRuleCategory(rule, category.id)"
                                  />
                                  <span>{{ category.label }}</span>
                                </label>
                              </div>
                            </div>
                            <div class="printer-rule-picker-section">
                              <div class="printer-rule-picker-title">
                                <strong>指定品項</strong>
                                <span>{{ printerRuleItemsLabel(rule) }}</span>
                              </div>
                              <div class="printer-rule-product-grid" aria-label="印單規則指定品項">
                                <label
                                  v-for="item in printerRuleProductOptions(rule)"
                                  :key="item.id"
                                  class="printer-rule-product-chip"
                                  :class="{ 'printer-rule-chip--active': (rule.itemIds ?? []).includes(item.id) }"
                                >
                                  <input
                                    type="checkbox"
                                    :checked="(rule.itemIds ?? []).includes(item.id)"
                                    @change="togglePrinterRuleItem(rule, item.id)"
                                  />
                                  <span>{{ item.name }}</span>
                                  <small>{{ categoryLabelFor(item.category) }}</small>
                                </label>
                              </div>
                            </div>
                          </div>
                        </article>
                      </div>
                      <div v-else class="empty-state printer-rule-empty-state">
                        <Printer :size="22" aria-hidden="true" />
                        <span>尚未建立印單規則</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section v-if="activeWorkspaceTab === 'printing'" class="printer-section printer-jobs-section">
                  <div class="panel-heading">
                    <div>
                      <p class="eyebrow">Print Queue</p>
                      <h2>列印佇列</h2>
                      <span class="panel-note">{{ printJobRows.length }} 筆 · 最後列印：{{ lastPrintTime }}</span>
                    </div>
                  </div>

                  <div class="printer-control-strip">
                    <div class="printer-health">
                      <CheckCircle2 v-if="printStation.online" :size="20" aria-hidden="true" />
                      <CircleAlert v-else :size="20" aria-hidden="true" />
                      <div>
                        <strong>{{ printStation.name }}</strong>
                        <span>{{ printStation.protocol }} · {{ printStation.host }}:{{ printStation.port }}</span>
                      </div>
                    </div>

                    <label class="toggle-row printer-auto-print-toggle">
                      <input v-model="printStation.autoPrint" type="checkbox" />
                      自動列印新訂單
                    </label>
                  </div>

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
                  <div class="panel-heading closeout-heading">
                    <div>
                      <p class="eyebrow">Closeout</p>
                      <h2 id="closeout-title">關帳摘要</h2>
                      <span class="panel-note">
                        {{ todayOrders.length }} 張單 · 待收 {{ closeoutSummary.pendingCount }} 張
                      </span>
                    </div>
                    <WalletCards :size="22" aria-hidden="true" />
                  </div>

                  <div class="closeout-grid closeout-grid--summary">
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

                  <div class="closeout-body-grid">
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

                    <aside class="closeout-side-stack" aria-label="班別對帳與關帳">
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
                    </aside>
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
                    @click="requestQueueAdminAction('void', activeOrder)"
                  >
                    <Trash2 :size="16" aria-hidden="true" />
                    {{ voidActionLabel(activeOrder) }}
                  </button>
                  <button
                    v-if="orderCanBeRefunded(activeOrder)"
                    class="active-order-refund-button"
                    type="button"
                    :disabled="refundingOrderId === activeOrder.id"
                    @click="requestQueueAdminAction('refund', activeOrder)"
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

        <div
          v-if="onlineReminderDetailOrder"
          class="utility-modal-backdrop online-order-detail-backdrop"
          @click.self="closeOnlineReminderDetail"
        >
          <section
            class="utility-modal online-order-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="online-order-detail-title"
          >
            <header class="utility-modal-header online-order-detail-header">
              <button class="icon-button" type="button" title="返回" @click="closeOnlineReminderDetail">
                <ChevronLeft :size="24" aria-hidden="true" />
              </button>
              <div>
                <p class="eyebrow">Online Order</p>
                <h2 id="online-order-detail-title">查看訂單內容</h2>
              </div>
              <strong class="online-order-detail-total">{{ formatCurrency(onlineReminderDetailOrder.subtotal) }}</strong>
            </header>

            <div class="online-order-detail-summary" aria-label="線上訂單摘要">
              <article>
                <span>單號</span>
                <strong>{{ compactOrderId(onlineReminderDetailOrder.id) }}</strong>
              </article>
              <article>
                <span>顧客</span>
                <strong>{{ onlineReminderDetailOrder.customerName || '線上顧客' }}</strong>
              </article>
              <article>
                <span>電話</span>
                <strong>{{ onlineReminderDetailOrder.customerPhone || '未留' }}</strong>
              </article>
              <article>
                <span>方式</span>
                <strong>{{ serviceModeLabels[onlineReminderDetailOrder.mode] }}</strong>
              </article>
              <article>
                <span>來源</span>
                <strong>{{ sourceLabels[onlineReminderDetailOrder.source] }}</strong>
              </article>
              <article>
                <span>付款</span>
                <strong>
                  {{ paymentLabels[onlineReminderDetailOrder.paymentMethod] }} /
                  {{ paymentStatusLabels[onlineReminderDetailOrder.paymentStatus] }}
                </strong>
              </article>
              <article>
                <span>下單時間</span>
                <strong>{{ formatOrderTime(onlineReminderDetailOrder.createdAt) }}</strong>
              </article>
              <article v-if="onlineReminderDetailOrder.requestedFulfillmentAt">
                <span>取餐時間</span>
                <strong>{{ formatOrderTime(onlineReminderDetailOrder.requestedFulfillmentAt) }}</strong>
              </article>
              <article v-if="onlineReminderDetailOrder.deliveryAddress" class="online-order-detail-address">
                <span>地址</span>
                <strong>{{ onlineReminderDetailOrder.deliveryAddress }}</strong>
              </article>
            </div>

            <section class="online-order-detail-lines" aria-label="點餐明細">
              <div class="online-order-detail-section-title">
                <h3>點餐內容</h3>
                <span>{{ onlineReminderDetailOrder.lines.length }} 項</span>
              </div>
              <article v-for="line in onlineReminderDetailOrder.lines" :key="`${onlineReminderDetailOrder.id}-${line.itemId}`">
                <div>
                  <strong>{{ line.name }}</strong>
                  <span>{{ onlineReminderLineOptions(line) }}</span>
                </div>
                <span>x{{ line.quantity }}</span>
                <strong>{{ formatCurrency(line.unitPrice * line.quantity) }}</strong>
              </article>
              <div v-if="onlineReminderDetailOrder.lines.length === 0" class="empty-state online-order-detail-empty">
                <ShoppingCart :size="24" aria-hidden="true" />
                <span>尚無品項明細</span>
              </div>
            </section>

            <section v-if="onlineReminderDetailOrder.note" class="online-order-detail-note">
              <span>備註</span>
              <strong>{{ onlineReminderDetailOrder.note }}</strong>
            </section>

            <footer class="online-order-detail-actions">
              <button type="button" @click="snoozeOnlineReminderFromDetail">稍後提醒</button>
              <button
                type="button"
                class="online-order-reject-button"
                :disabled="voidingOrderId === onlineReminderDetailOrder.id"
                @click="rejectOnlineReminderOrder(onlineReminderDetailOrder)"
              >
                <X :size="18" aria-hidden="true" />
                {{ voidingOrderId === onlineReminderDetailOrder.id ? '拒絕中' : '拒絕接單' }}
              </button>
              <button
                type="button"
                class="primary-button"
                :disabled="claimingOrderId === onlineReminderDetailOrder.id"
                @click="acceptOnlineReminderOrder(onlineReminderDetailOrder)"
              >
                <Check :size="18" aria-hidden="true" />
                {{ claimingOrderId === onlineReminderDetailOrder.id ? '接單中' : '接單' }}
              </button>
            </footer>
          </section>
        </div>

        <section
          v-if="primaryOnlineReminderOrder && activeWorkspaceTab !== 'queue' && !onlineReminderDetailOrder"
          class="online-order-notification"
          role="alertdialog"
          aria-live="assertive"
          aria-label="線上訂單待接單"
        >
          <div class="online-order-notification-copy">
            <p class="eyebrow">Online Order</p>
            <h3>{{ compactOrderId(primaryOnlineReminderOrder.id) }} 待接單</h3>
            <span>
              {{ onlineReminderOrderMeta(primaryOnlineReminderOrder) }}
            </span>
            <small>{{ onlineReminderOrderLineSummary(primaryOnlineReminderOrder) }}</small>
          </div>
          <button type="button" @click="acknowledgeOnlineOrderReminders">稍後</button>
          <button type="button" @click="openOnlineReminderDetail(primaryOnlineReminderOrder)">查看內容</button>
          <button
            type="button"
            class="online-order-reject-button"
            :disabled="voidingOrderId === primaryOnlineReminderOrder.id"
            @click="rejectOnlineReminderOrder(primaryOnlineReminderOrder)"
          >
            {{ voidingOrderId === primaryOnlineReminderOrder.id ? '拒絕中' : '拒絕' }}
          </button>
          <button
            class="primary-button"
            type="button"
            :disabled="claimingOrderId === primaryOnlineReminderOrder.id"
            @click="acceptOnlineReminderOrder(primaryOnlineReminderOrder)"
          >
            {{ claimingOrderId === primaryOnlineReminderOrder.id ? '接單中' : '接單' }}
          </button>
        </section>

        <section
          v-if="isSupplyStatusOpen"
          id="pos-supply-modal"
          class="supply-fullscreen supply-modal"
          aria-labelledby="supply-title"
        >
          <header class="supply-modal-header">
            <button class="icon-button" type="button" title="返回" @click="closeSupplyStatus">
              <ChevronLeft :size="28" aria-hidden="true" />
            </button>
            <div class="supply-modal-title">
              <p class="eyebrow">Supply</p>
              <h2 id="supply-title">供應狀態</h2>
              <span>先調整販售狀態，需要時再展開管理功能</span>
            </div>
            <div class="supply-modal-actions">
              <button
                class="supply-undo-button"
                type="button"
                :disabled="!supplyUndoAvailable"
                @click="undoLastSupplyAction"
              >
                <RefreshCw :size="18" aria-hidden="true" />
                回復上一步
              </button>
              <button
                class="supply-save-button"
                type="button"
                :disabled="!supplyHasUnsavedChanges"
                @click="saveSupplyChanges"
              >
                <Check :size="20" aria-hidden="true" />
                儲存
              </button>
            </div>
          </header>

          <div class="supply-toolbar">
            <label class="supply-search">
              <Search :size="24" aria-hidden="true" />
              <input v-model="supplySearchTerm" type="search" placeholder="輸入商品或註記名稱，範例：雞塊" />
            </label>
            <label class="supply-filter-summary">
              <span>篩選狀態</span>
              <select v-model="supplyStatusFilter">
                <option v-for="filter in supplyStatusFilterOptions" :key="filter.value" :value="filter.value">
                  {{ filter.label }}
                </option>
              </select>
              <Filter :size="24" aria-hidden="true" />
            </label>
          </div>

          <div class="supply-layout">
            <nav class="supply-category-rail" aria-label="供應狀態分類">
              <button
                v-for="category in supplyCategoryOptions"
                :key="category.value"
                type="button"
                :class="{ 'supply-category-button--active': supplyCategoryFilter === category.value }"
                @click="selectSupplyCategory(category.value)"
              >
                {{ category.label }}
              </button>
            </nav>

            <section class="supply-content" aria-label="供應狀態清單">
              <header class="supply-content-header">
                <div>
                  <h3>{{ supplyCategoryLabel(supplyCategoryFilter) }}</h3>
                  <span>{{ supplyStatusSummary }}</span>
                </div>
                <label class="supply-batch-select">
                  <span>批次變更狀態</span>
                  <select
                    :disabled="visibleSupplyRows.length === 0 || isStationBatchBusy"
                    @change="updateVisibleSupplyRows(eventSupplyStatus($event))"
                  >
                    <option value="normal">正常供應</option>
                    <option value="online-stopped">線上停售</option>
                    <option value="stopped">全部停售</option>
                  </select>
                  <ChevronDown :size="22" aria-hidden="true" />
                </label>
              </header>

              <p v-if="supplyActionMessage" class="supply-action-message">{{ supplyActionMessage }}</p>

              <details v-if="selectedSupplyMenuCategory" class="supply-management-panel" aria-label="分類與商品管理">
                <summary>
                  <span>
                    <strong>管理商品與分類</strong>
                    <small>新增商品、建立分類、刪除目前分類</small>
                  </span>
                  <ChevronDown :size="22" aria-hidden="true" />
                </summary>
                <div class="supply-management-body">
                  <form class="supply-product-form" @submit.prevent="addProductToSupplyCategory">
                    <input v-model="newProductName" type="text" placeholder="新增商品，例如：髒髒咖啡" />
                    <input v-model.number="newProductPrice" type="number" inputmode="numeric" min="0" placeholder="價格" />
                    <input v-model="newProductSku" type="text" placeholder="SKU 可留空" />
                    <button type="submit">
                      <Plus :size="18" aria-hidden="true" />
                      新增商品
                    </button>
                  </form>
                  <form class="supply-category-form" @submit.prevent="addMenuCategory">
                    <input v-model="newCategoryName" type="text" placeholder="新增分類，例如：甜點" />
                    <button type="submit">
                      <Plus :size="18" aria-hidden="true" />
                      新增分類
                    </button>
                  </form>
                  <button type="button" class="ghost-danger-button supply-delete-category-button" @click="deleteSelectedMenuCategory">
                    <Trash2 :size="18" aria-hidden="true" />
                    刪除目前分類
                  </button>
                </div>
              </details>

              <section v-else-if="selectedSupplyCategoryIsNotes" class="supply-management-panel supply-management-panel--notes" aria-label="可用註記管理">
                <div class="supply-management-title">
                  <strong>可用註記</strong>
                  <span>{{ availableNoteCatalog.length }} 個註記</span>
                </div>
                <form class="supply-note-form supply-note-form--available" @submit.prevent="addAvailableNote">
                  <input v-model="newAvailableNoteName" type="text" placeholder="新增註記，例如：半糖" />
                  <input v-model.number="newAvailableNotePriceDelta" type="number" inputmode="numeric" min="0" placeholder="加價" />
                  <button type="submit">
                    <Plus :size="18" aria-hidden="true" />
                    新增註記
                  </button>
                </form>
                <div class="supply-note-catalog">
                  <article v-for="choice in availableNoteCatalog" :key="choice.id" class="supply-note-catalog-card">
                    <header>
                      <div>
                        <strong>{{ optionChoiceLabel(choice) }}</strong>
                        <span>{{ noteGroupLabelsForChoice(choice.id).join('、') || '尚未加入群組' }}</span>
                      </div>
                      <button type="button" class="ghost-danger-button" @click="deleteAvailableNote(choice.id)">
                        <Trash2 :size="16" aria-hidden="true" />
                        刪除
                      </button>
                    </header>
                    <div class="supply-note-card-status">
                      <label
                        class="supply-row-status supply-note-card-status-control"
                        :class="`supply-row-status--${availableNoteSupplyStatus(choice.id)}`"
                      >
                        <CheckCircle2 v-if="availableNoteSupplyStatus(choice.id) === 'normal'" :size="20" aria-hidden="true" />
                        <CircleAlert v-else-if="availableNoteSupplyStatus(choice.id) === 'online-stopped'" :size="20" aria-hidden="true" />
                        <X v-else :size="20" aria-hidden="true" />
                        <select
                          :value="availableNoteSupplyStatus(choice.id)"
                          :aria-label="`${choice.label} 供應狀態`"
                          @change="updateAvailableNoteSupplyStatus(choice, eventSupplyStatus($event))"
                        >
                          <option v-for="status in supplyStatusOptions" :key="status.value" :value="status.value">
                            {{ status.label }}
                          </option>
                        </select>
                        <ChevronDown :size="18" aria-hidden="true" />
                      </label>
                      <small class="supply-note-card-hint">{{ supplyStatusDetail(availableNoteSupplyStatus(choice.id)) }}</small>
                    </div>
                  </article>
                  <span v-if="availableNoteCatalog.length === 0" class="supply-note-empty">尚未建立可用註記</span>
                </div>
              </section>

              <section v-else-if="selectedSupplyCategoryIsNoteGroups" class="supply-management-panel supply-management-panel--notes" aria-label="註記群組管理">
                <div class="supply-management-title">
                  <strong>註記群組</strong>
                  <span>{{ optionGroupCatalog.length }} 個群組</span>
                </div>
                <form class="supply-note-form" @submit.prevent="addOptionGroup">
                  <input v-model="newOptionGroupName" type="text" placeholder="新增群組，例如：冰量選擇" />
                  <label class="supply-inline-check">
                    <input v-model="newOptionGroupRequired" type="checkbox" />
                    必選
                  </label>
                  <input v-model.number="newOptionGroupMax" type="number" inputmode="numeric" min="1" max="6" aria-label="最多可選數" />
                  <button type="submit">
                    <Plus :size="18" aria-hidden="true" />
                    新增群組
                  </button>
                </form>
                <div class="supply-note-groups">
                  <article v-for="group in optionGroupCatalog" :key="group.id" class="supply-note-group">
                    <header>
                      <div>
                        <strong>{{ group.label }}</strong>
                        <span>{{ group.requirement }} · {{ group.choices.length }} 個註記</span>
                      </div>
                      <button type="button" class="ghost-danger-button" @click="deleteOptionGroup(group.id)">
                        <Trash2 :size="16" aria-hidden="true" />
                        刪除
                      </button>
                    </header>
                    <div class="supply-note-group-controls" aria-label="註記群組規則">
                      <label class="supply-requirement-toggle">
                        <input
                          type="checkbox"
                          :checked="group.required"
                          @change="updateOptionGroupRequired(group.id, eventChecked($event))"
                        />
                        <span>{{ group.required ? '必選' : '非必選' }}</span>
                      </label>
                      <small>{{ group.required ? `顧客至少需選 ${Math.max(1, group.min)} 個` : '顧客可以不選此群組' }}</small>
                    </div>
                    <div class="supply-note-checkbox-list">
                      <label v-for="choice in availableNoteCatalog" :key="`${group.id}-${choice.id}`" class="supply-note-checkbox">
                        <input
                          type="checkbox"
                          :checked="groupHasAvailableNote(group.id, choice.id)"
                          @change="toggleGroupAvailableNote(group.id, choice.id)"
                        />
                        {{ optionChoiceLabel(choice) }}
                      </label>
                      <span v-if="availableNoteCatalog.length === 0" class="supply-note-empty">先到可用註記新增選項</span>
                    </div>
                  </article>
                  <span v-if="optionGroupCatalog.length === 0" class="supply-note-empty">尚未建立註記群組</span>
                </div>
              </section>

              <div v-if="!selectedSupplyCategoryIsNotes && !selectedSupplyCategoryIsNoteGroups" class="supply-row-list">
                <article v-for="row in visibleSupplyRows" :key="`${row.kind}-${row.id}`" class="supply-row">
                  <div class="supply-row-top">
                    <button class="supply-row-disclosure" type="button" disabled aria-hidden="true">
                      <ChevronLeft :size="18" aria-hidden="true" />
                    </button>
                    <div class="supply-row-main">
                      <strong>{{ row.name }}</strong>
                      <span>{{ row.kind === 'product' ? '單點' : '註記' }} · {{ row.detail }}</span>
                    </div>
                    <button
                      v-if="row.kind === 'product' && row.product"
                      class="supply-row-delete"
                      type="button"
                      :disabled="supplyRowIsBusy(row)"
                      @click="deleteSupplyProduct(row.product)"
                    >
                      <Trash2 :size="18" aria-hidden="true" />
                    </button>
                    <span v-else class="supply-row-delete-spacer" aria-hidden="true" />
                    <label class="supply-row-status" :class="`supply-row-status--${row.status}`">
                      <CheckCircle2 v-if="row.status === 'normal'" :size="22" aria-hidden="true" />
                      <CircleAlert v-else-if="row.status === 'online-stopped'" :size="22" aria-hidden="true" />
                      <X v-else :size="22" aria-hidden="true" />
                      <select
                        :value="row.status"
                        :disabled="supplyRowIsBusy(row)"
                        :aria-label="`${row.name} 供應狀態`"
                        @change="updateSupplyRowStatus(row, eventSupplyStatus($event))"
                      >
                        <option v-for="status in supplyStatusOptions" :key="status.value" :value="status.value">
                          {{ status.label }}
                        </option>
                      </select>
                      <ChevronDown :size="20" aria-hidden="true" />
                    </label>
                  </div>
                  <small class="supply-row-hint">{{ supplyStatusDetail(row.status) }}</small>
                  <details v-if="row.kind === 'product' && row.product" class="supply-row-options">
                    <summary>
                      <span>註記群組</span>
                      <small>{{ assignedOptionGroupIdsForProduct(row.product).length }}/{{ optionGroupCatalog.length }}</small>
                      <ChevronDown :size="16" aria-hidden="true" />
                    </summary>
                    <div class="supply-row-option-list">
                      <label v-for="group in optionGroupCatalog" :key="`${row.id}-${group.id}`">
                        <input
                          type="checkbox"
                          :checked="productHasOptionGroup(row.product, group.id)"
                          @change="toggleProductOptionGroup(row.product, group.id)"
                        />
                        {{ group.label }}
                      </label>
                      <span v-if="optionGroupCatalog.length === 0" class="supply-row-option-empty">尚未建立註記群組</span>
                    </div>
                  </details>
                </article>

                <div v-if="visibleSupplyRows.length === 0" class="empty-state supply-empty-state">
                  <EyeOff :size="22" aria-hidden="true" />
                  <span>沒有符合條件的供應項目</span>
                </div>
              </div>
            </section>
          </div>
        </section>

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
              <button class="icon-button" type="button" title="開啟工具箱" @click="handleToolboxTap">
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
      </div>
    </div>

    <AdminPanel v-else @refresh-pos="refreshBackendData" />

    <button
      class="floating-toolbox-button"
      :class="{ 'floating-toolbox-button--dragging': toolboxDragState?.moved }"
      type="button"
      title="拖曳工具箱；點按開啟"
      aria-controls="pos-toolbox-modal"
      :aria-expanded="isToolboxOpen"
      :style="floatingToolboxStyle"
      @pointerdown="handleFloatingToolboxPointerDown"
      @pointermove="handleFloatingToolboxPointerMove"
      @pointerup="finishFloatingToolboxDrag"
      @pointercancel="cancelFloatingToolboxDrag"
      @click="handleFloatingToolboxClick"
    >
      <Settings2 :size="22" aria-hidden="true" />
      <span>工具箱</span>
    </button>

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
          <button
            class="icon-button"
            type="button"
            :title="activeToolboxPanel === 'appearance' ? '返回工具箱' : '關閉工具箱'"
            @click="activeToolboxPanel === 'appearance' ? showToolboxHome() : closeToolbox()"
          >
            <ChevronLeft :size="20" aria-hidden="true" />
          </button>
          <div>
            <p class="eyebrow">{{ activeToolboxPanel === 'appearance' ? 'Display' : 'Toolbox' }}</p>
            <h2 id="toolbox-title">{{ activeToolboxPanel === 'appearance' ? '外觀設定' : '工具箱' }}</h2>
          </div>
          <button
            v-if="activeToolboxPanel === 'home'"
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

        <div v-if="activeToolboxPanel === 'home'" class="toolbox-grid" aria-label="常用工具">
          <button
            type="button"
            class="toolbox-card toolbox-card--status"
            aria-live="polite"
            @click="handleToolboxTap"
          >
            <Settings2 :size="24" aria-hidden="true" />
            <strong>{{ backendEditModeEnabled ? '後台編輯已啟用' : '後台編輯未啟用' }}</strong>
            <span>{{ backendEditMessage }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('order')">
            <ShoppingCart :size="24" aria-hidden="true" />
            <strong>新增外帶</strong>
            <span>{{ workspaceTabSummaries.order }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('queue')">
            <ReceiptText :size="24" aria-hidden="true" />
            <strong>桌況頁</strong>
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
          <button type="button" class="toolbox-card" @click="runToolboxAction('appearance')">
            <Settings2 :size="20" aria-hidden="true" />
            <strong>外觀設定</strong>
            <span>{{ appearancePreferenceSummary }}</span>
          </button>
        </div>

        <section v-else class="toolbox-detail-panel" aria-labelledby="toolbox-title">
          <div class="preference-slider-list">
            <label class="preference-toggle">
              <input v-model="posUiPreferences.darkMode" type="checkbox" />
              <span>
                <strong>深色模式</strong>
                <small>{{ posUiPreferences.darkMode ? 'Dark' : 'Light' }}</small>
              </span>
            </label>
            <label class="preference-slider">
              <span>
                <strong>整體縮放</strong>
                <small>{{ preferenceOffsetLabel(posUiPreferences.interfaceScale) }}</small>
              </span>
              <input
                v-model.number="posUiPreferences.interfaceScale"
                type="range"
                :min="preferenceOffsetMin"
                :max="preferenceOffsetMax"
                step="1"
                aria-label="整體縮放"
              />
            </label>
            <label class="preference-slider">
              <span>
                <strong>畫面密度</strong>
                <small>{{ preferenceOffsetLabel(posUiPreferences.densityScale) }}</small>
              </span>
              <input
                v-model.number="posUiPreferences.densityScale"
                type="range"
                :min="preferenceOffsetMin"
                :max="preferenceOffsetMax"
                step="1"
                aria-label="畫面密度"
              />
            </label>
            <label class="preference-slider">
              <span>
                <strong>文字大小</strong>
                <small>{{ preferenceOffsetLabel(posUiPreferences.textSize) }}</small>
              </span>
              <input
                v-model.number="posUiPreferences.textSize"
                type="range"
                :min="preferenceOffsetMin"
                :max="preferenceOffsetMax"
                step="1"
                aria-label="文字大小"
              />
            </label>
            <label class="preference-slider">
              <span>
                <strong>工具箱透明度</strong>
                <small>{{ Math.round(posUiPreferences.toolboxOpacity) }}%</small>
              </span>
              <input
                v-model.number="posUiPreferences.toolboxOpacity"
                type="range"
                :min="toolboxOpacityMin"
                :max="toolboxOpacityMax"
                step="1"
                aria-label="工具箱透明度"
              />
            </label>
          </div>
          <button class="secondary-button preference-reset-button" type="button" @click="resetPosUiPreferences">
            <RefreshCw :size="18" aria-hidden="true" />
            重設
          </button>
        </section>
      </section>
    </div>
  </main>
</template>
