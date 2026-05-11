<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  PackageOpen,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Tags,
  WalletCards,
  Trash2,
  UsersRound,
  UserRound,
  Wifi,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminPanel from './components/AdminPanel.vue'
import ConsumerOrderPage from './components/ConsumerOrderPage.vue'
import ConsumerReservationPage from './components/ConsumerReservationPage.vue'
import { usePosSession } from './composables/usePosSession'
import { categoryLabels } from './data/menu'
import {
  posKnowledgeArticles,
  posKnowledgeCategories,
  type PosKnowledgeArticle,
  type PosKnowledgeCategory,
} from './data/posKnowledge'
import { formatCurrency, formatDateKey, formatOrderTime, formatRelativeMinutes } from './lib/formatters'
import { serviceChargeRateForMode } from './lib/serviceCharge'
import {
  createAdminReservation,
  createAdminMember,
  createInventoryCategory,
  createInventoryItem,
  createInventoryRecord,
  createStaffTimeClockEntry,
  defaultFloorPlanSettings,
  fetchAdminInventory,
  fetchAdminMembers,
  fetchAdminReservations,
  isPosApiConfigured,
  normalizeFloorPlanSettings,
  searchPosMembers,
  updateAdminReservation,
  updateAdminSetting,
  updateInventoryItem,
  verifyAccessPermission,
} from './lib/posApi'
import type {
  AdminPermission,
  CartLine,
  ComboProductGroup,
  DiscountCampaign,
  FloorDisplayPreferences,
  FloorLevelSetting,
  FloorPlanSettings,
  FloorTableSetting,
  InventoryCategory,
  InventoryItem,
  InventoryRecord,
  InventoryRecordAction,
  MenuCategory,
  MenuItem,
  OnlineOrderingSettings,
  OrderSource,
  OrderStatus,
  PaymentAllocation,
  PaymentMethod,
  PaymentSplit,
  PaymentStatus,
  CustomerEngagementSettings,
  OrderLabelSetting,
  PosAppearanceSettings,
  PosMember,
  PosOrder,
  PosReservation,
  PrinterSettings,
  ProductSupplyStatus,
  PrintLabelMode,
  PrintJob,
  PrintRuleSetting,
  PrintRuleTiming,
  PrintStationSetting,
  RegisterCashAdjustmentKind,
  ReservationStatus,
  ServiceMode,
  StaffTimeClockEntry,
  WaitlineEntry,
} from './types/pos'

type AppView = 'pos' | 'admin' | 'online' | 'reservation'
type WorkspaceTab = 'floor' | 'order' | 'details' | 'payment' | 'queue' | 'reservations' | 'printing' | 'closeout'
type CartQuickEditor = 'customer' | 'service' | 'payment' | null
type FloorServiceView = 'dine-in' | 'takeout-delivery'
type QueueFilter = 'active' | 'ready' | 'all'
type QueuePaymentFilter = 'all' | 'pending' | 'authorized' | 'paid' | 'issue'
type QueueDateFilter = 'today' | 'future' | 'older' | 'all'
type QueueServiceFilter = 'all' | ServiceMode
type QueueSourceFilter = 'all' | OrderSource
type QueueFulfillmentFilter = 'all' | 'overdue' | 'due-soon' | 'scheduled'
type QueueSortMode = 'fulfillment-asc' | 'fulfillment-desc' | 'created-desc' | 'amount-desc'
type FulfillmentUrgency = 'none' | 'scheduled' | 'soon' | 'overdue'
type QueueTaskActionId = 'fulfillment-alerts' | 'pending-payments' | 'ready-orders' | 'online-unconfirmed' | 'print-issues'
type QueueTaskTone = 'primary' | 'success' | 'warning' | 'danger'
type ToolboxAction = 'floor' | 'order' | 'queue' | 'reservations' | 'supply' | 'printing' | 'closeout' | 'admin' | 'online' | 'sync' | 'appearance' | 'time-clock' | 'current-sales' | 'system-info' | 'transactions' | 'cash-drawer' | 'label-management' | 'device-management' | 'customer-management' | 'inventory-management'
type ToolboxPanel = 'home' | 'appearance' | 'time-clock' | 'current-sales' | 'system-info' | 'transactions' | 'cash-drawer' | 'label-management' | 'device-management' | 'customer-management' | 'inventory-management'
type KnowledgeCategoryFilter = 'all' | PosKnowledgeCategory
type CloseoutPreflightStatus = 'ready' | 'warning' | 'danger'
type CloseoutPreflightAction = 'active-orders' | 'pending-payments' | 'payment-issues' | 'print-issues' | 'voided-orders'
type MenuOptionGroupId = string
type QueueAdminActionKind = 'void' | 'refund'
type TransactionSearchCriterion = 'receipt' | 'carrier' | 'table' | 'order'
type CustomerManagementSortMode = 'consumed' | 'created'
type InventoryOperationDraftMode = InventoryRecordAction
type SupplyCategoryFilter = MenuCategory | 'notes' | 'note-groups'
type SupplyStatusFilter = 'all' | ProductSupplyStatus
type TicketAction = 'checkout-print' | 'print' | 'checkout-only'
type CategoryMoveDirection = -1 | 1
type MenuCategoryOptionValue = 'all' | MenuCategory
type ReservationViewMode = 'day' | 'week' | 'month'
type ReservationStatusFilter = 'all' | ReservationStatus

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

interface ReservationDraft {
  customerName: string
  customerPhone: string
  partySize: number
  reservedAt: string
  importantLabel: string
  note: string
  assignedTableIds: string[]
}

interface ReservationEditDraft extends ReservationDraft {
  status: ReservationStatus
}

interface PosUiPreferences extends PosAppearanceSettings {
  schemaVersion: 3
  interfaceScale: number
  densityScale: number
  textSize: number
  darkMode: boolean
  toolboxOpacity: number
}

type DiningTableDefinition = FloorTableSetting

interface FloorTableState {
  table: DiningTableDefinition
  order: PosOrder | null
  partySize: number
  status: 'empty' | 'active' | 'ready' | 'locked'
  amountLabel: string
  orderLabel: string
  peopleLabel: string
  waitLabel: string
  stayLabel: string
}

interface PosNotificationItem {
  id: string
  title: string
  summary: string
  dateLabel: string
  target: WorkspaceTab | 'supply' | 'knowledge'
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

interface ProtectedPermissionStep {
  permission: AdminPermission
  title: string
  detail: string
}

interface AccessVerificationPrompt extends ProtectedPermissionStep {
  resolve: (verified: boolean) => void
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

interface FloorTableDragState {
  pointerId: number
  tableId: string
  startX: number
  startY: number
  originalX: number
  originalY: number
  dragging: boolean
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

type ComboSelectionMap = Record<string, Record<string, number>>
type ComboOptionSelectionMap = Record<string, Record<string, Record<MenuOptionGroupId, string[]>>>

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
  comboAssignments: OnlineOrderingSettings['comboProductAssignments']
  productStatuses: Record<string, ProductSupplyStatus>
  noteStatuses: Record<string, ProductSupplyStatus>
  products: MenuItem[]
  selectedCategory: SupplyCategoryFilter
}

interface CurrentSalesMetric {
  label: string
  value: string
  detail: string
  tone: 'neutral' | 'success' | 'warning'
}

interface SystemInfoItem {
  label: string
  value: string
  detail: string
}

const queueFilterStorageKey = 'script-coffee-pos-queue-view'
const posUiPreferenceStorageKey = 'script-coffee-pos-ui-preferences'
const floorTablesStorageKey = 'script-coffee-pos-floor-tables'
const floorLevelsStorageKey = 'script-coffee-pos-floor-levels'
const activeFloorStorageKey = 'script-coffee-pos-active-floor'
const floorDisplayStorageKey = 'script-coffee-pos-floor-display'
const floorPartyStorageKey = 'script-coffee-pos-floor-parties'
const waitlineStorageKey = 'script-coffee-pos-waitline'
const backendEditModeStorageKey = 'script-coffee-pos-backend-edit-mode'
const toolboxPositionStorageKey = 'script-coffee-pos-toolbox-position'
const supplyProductStatusStorageKey = 'script-coffee-pos-supply-product-statuses'
const supplyNoteStatusStorageKey = 'script-coffee-pos-supply-note-statuses'
const menuCategoryStorageKey = 'script-coffee-pos-menu-categories'
const availableNoteStorageKey = 'script-coffee-pos-available-notes'
const optionGroupStorageKey = 'script-coffee-pos-option-groups'
const productOptionAssignmentStorageKey = 'script-coffee-pos-product-option-assignments'
const comboProductAssignmentStorageKey = 'script-coffee-pos-combo-product-assignments'
const supplyNotesFilterValue = '__notes__'
const supplyNoteGroupsFilterValue = '__note_groups__'
const queueFilterValues: QueueFilter[] = ['active', 'ready', 'all']
const queuePaymentFilterValues: QueuePaymentFilter[] = ['all', 'pending', 'authorized', 'paid', 'issue']
const queueDateFilterValues: QueueDateFilter[] = ['today', 'future', 'older', 'all']
const queueFulfillmentFilterValues: QueueFulfillmentFilter[] = ['all', 'overdue', 'due-soon', 'scheduled']
const queueSortModeValues: QueueSortMode[] = ['fulfillment-asc', 'fulfillment-desc', 'created-desc', 'amount-desc']
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
const defaultFloorPlanSettingsValue = defaultFloorPlanSettings()
const defaultDiningTables: DiningTableDefinition[] = defaultFloorPlanSettingsValue.tables
const defaultFloorDisplayPreferences: FloorDisplayPreferences = defaultFloorPlanSettingsValue.display

const isConsumerDomain =
  globalThis.location?.hostname === 'order.scriptcoffee.com.tw' ||
  globalThis.location?.hostname === 'online.scriptcoffee.com.tw'
const isNativeApp = Capacitor.getPlatform() !== 'web'
const brandLogoSrc = `${import.meta.env.BASE_URL}assets/script-coffee-logo.png`

const readInitialView = (): AppView => {
  if (isNativeApp) {
    return 'pos'
  }

  const params = new URLSearchParams(globalThis.location?.search ?? '')
  const view = params.get('view') ?? params.get('mode')
  const hash = globalThis.location?.hash.replace(/^#\/?/, '')

  if (isConsumerDomain) {
    return view === 'reservation' || hash === 'reservation' ? 'reservation' : 'online'
  }

  if (view === 'admin' || hash === 'admin') {
    return 'admin'
  }

  if (view === 'order' || view === 'online' || hash === 'order' || hash === 'online') {
    return 'online'
  }

  if (view === 'reservation' || hash === 'reservation') {
    return 'reservation'
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

const normalizeFloorDisplayPreferences = (value: unknown): FloorDisplayPreferences => {
  return normalizeFloorPlanSettings({ ...defaultFloorPlanSettingsValue, display: value }).display
}

const readFloorDisplayPreferences = (): FloorDisplayPreferences =>
  normalizeFloorDisplayPreferences(readStorageValue<unknown>(floorDisplayStorageKey, defaultFloorDisplayPreferences))

const normalizeFloorLevels = (value: unknown): FloorLevelSetting[] =>
  normalizeFloorPlanSettings({ ...defaultFloorPlanSettingsValue, floors: value }).floors

const readFloorLevels = (): FloorLevelSetting[] =>
  normalizeFloorLevels(readStorageValue<unknown>(floorLevelsStorageKey, defaultFloorPlanSettingsValue.floors))

const readActiveFloorId = (floors: FloorLevelSetting[]): string => {
  const savedFloorId = readStorageValue<unknown>(activeFloorStorageKey, defaultFloorPlanSettingsValue.activeFloorId)
  const normalized = normalizeFloorPlanSettings({
    ...defaultFloorPlanSettingsValue,
    floors,
    activeFloorId: savedFloorId,
  })
  return normalized.activeFloorId
}

const normalizeFloorTables = (value: unknown): DiningTableDefinition[] =>
  normalizeFloorPlanSettings({
    ...defaultFloorPlanSettingsValue,
    floors: readFloorLevels(),
    tables: value,
  }).tables

const readFloorTables = (): DiningTableDefinition[] =>
  normalizeFloorTables(readStorageValue<unknown>(floorTablesStorageKey, defaultDiningTables))

const normalizeFloorPartySizes = (
  value: unknown,
  tables: DiningTableDefinition[] = defaultDiningTables,
): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const tableCapacities = new Map(tables.map((table) => [table.id, table.capacity]))
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((sizes, [rawTableId, rawSize]) => {
    const tableId = rawTableId.trim().toUpperCase()
    const capacity = tableCapacities.get(tableId)
    const size = Number(rawSize)
    if (!capacity || !Number.isFinite(size)) {
      return sizes
    }

    sizes[tableId] = Math.min(capacity, Math.max(0, Math.trunc(size)))
    return sizes
  }, {})
}

const normalizeWaitlineEntries = (value: unknown): WaitlineEntry[] => {
  return normalizeFloorPlanSettings({ ...defaultFloorPlanSettingsValue, waitline: value }).waitline
}

const readWaitlineEntries = (): WaitlineEntry[] =>
  normalizeWaitlineEntries(readStorageValue<unknown>(waitlineStorageKey, []))

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
  accessPolicy,
  backendStatus,
  availableDiscountCampaigns,
  automaticDiscountAmount,
  applyCustomerMember,
  cashDrawerEvents,
  cartItemSubtotal,
  cartLines,
  cartQuantity,
  cartProductTotalQuantity,
  cartTotal,
  clearCart,
  clearCustomerMember,
  claimLabelFor,
  claimOrderForStation,
  claimingOrderId,
  closeRegisterSessionForStation,
  counterDraftOrderId,
  counterDraftStartedAt,
  createProductForStation,
  createRegisterCashAdjustmentForStation,
  couponCode,
  customer,
  customerHasNote,
  deletingPrintJobId,
  deleteOrderFromQueue,
  deleteProductForStation,
  deletePrintJobForOrder,
  discountAmount,
  discountCampaignApplications,
  disabledAutomaticDiscountCampaignIds,
  engagementSettings,
  extraFeeAmount,
  filteredMenu,
  floorPlanSettings,
  increaseLine,
  isSubmitting,
  isRegisterBusy,
  lastPrintPreview,
  menuCatalog,
  loadCashDrawerEvents,
  loadCounterOrderForEditing,
  loadRegisterSession,
  markOnlineOrderRemindersSeen,
  orderClaimExpired,
  orderClaimedByCurrentStation,
  orderClaimedByOtherStation,
  orderPendingSync,
  orderQueue,
  onlineOrderRequiresAcceptance,
  onlineOrderReminder,
  onlineOrderingSettings,
  orderLabels,
  openCashDrawerForStation,
  paymentBreakdown,
  paymentMethod,
  paymentSplits,
  pendingOrders,
  posAppearanceSettings,
  pointsRedeemed,
  printCustomerReceipt,
  printTransactionDetail,
  printOrder,
  printOrderQrCode,
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
  serviceFeeAmount,
  serviceFeeLabel,
  serviceFeeRate,
  selectedDiscountCampaignIds,
  saveCounterOrder,
  setItemQuantity,
  setLineQuantity,
  startCounterDraft,
  stationClaimLabel,
  stationHeartbeatMessage,
  transactionReceiptCount,
  togglingProductId,
  toggleCustomerNote,
  toggleDiscountCampaign,
  toggleLinePrintPaused,
  toggleOrderLabel,
  totalDiscountAmount,
  updateConfiguredLine,
  openRegisterSessionForStation,
  updateOrderFloorAssignmentForStation,
  updateOrderStatus,
  updatePaymentStatus,
  updateProductSupplyStatus,
  updatingPaymentOrderId,
  voidingOrderId,
  voidOrderForStation,
} = usePosSession({ autoLoad: !isConsumerDomain })

const accessVerificationPrompt = ref<AccessVerificationPrompt | null>(null)
const accessVerificationCode = ref('')
const accessVerificationError = ref('')
const isAccessVerifying = ref(false)

const crmSearchTerm = ref('')
const crmMatches = ref<PosMember[]>([])
const isCrmSearching = ref(false)
const crmMessage = ref('輸入電話或姓名可查會員')

const selectedOrderLabelSettings = computed(() =>
  engagementSettings.value.orderLabels.filter((label) => orderLabels.value.includes(label.id)),
)
const selectedDiscountCampaignIdSet = computed(() => new Set(selectedDiscountCampaignIds.value))
const disabledAutomaticDiscountCampaignIdSet = computed(() => new Set(disabledAutomaticDiscountCampaignIds.value))
const discountCampaignActiveOnTicket = (campaign: DiscountCampaign): boolean =>
  campaign.kind === 'automatic' && campaign.usage.posAutoApply
    ? !disabledAutomaticDiscountCampaignIdSet.value.has(campaign.id)
    : selectedDiscountCampaignIdSet.value.has(campaign.id)
const protectedDiscountCampaignAdjusted = computed(() =>
  availableDiscountCampaigns.value.some((campaign) => {
    if (!campaign.usage.requiresVerification) {
      return false
    }

    if (campaign.kind === 'automatic' && campaign.usage.posAutoApply) {
      return disabledAutomaticDiscountCampaignIdSet.value.has(campaign.id)
    }

    return selectedDiscountCampaignIdSet.value.has(campaign.id)
  }),
)
const labelManagementSummary = computed(() =>
  `${engagementSettings.value.orderLabels.length} 個訂單標籤`,
)
const labelManagementHasChanges = computed(() =>
  JSON.stringify(labelManagementDrafts.value) !== JSON.stringify(engagementSettings.value.orderLabels),
)
const customerManagementTypes = computed(() => {
  const configuredTypes = engagementSettings.value.customerTypes.length > 0
    ? engagementSettings.value.customerTypes
    : ['一般顧客']
  return [...new Set([
    ...configuredTypes,
    ...customerManagementMembers.value.map((member) => member.customerType).filter(Boolean),
  ])]
})
const filteredCustomerManagementMembers = computed(() => {
  const keyword = customerManagementSearchTerm.value.trim().toLowerCase()
  const typeFilter = customerManagementTypeFilter.value
  const latestLedgerTime = (member: PosMember): number =>
    member.ledger.reduce((latest, entry) => Math.max(latest, new Date(entry.createdAt).getTime()), 0)
      || new Date(member.updatedAt).getTime()

  return customerManagementMembers.value
    .filter((member) => {
      if (typeFilter !== 'all' && member.customerType !== typeFilter) {
        return false
      }

      if (!keyword) {
        return true
      }

      return [
        member.displayName,
        member.phone,
        member.lineUserId ?? '',
        member.customerType,
      ].some((value) => value.toLowerCase().includes(keyword))
    })
    .sort((left, right) => {
      if (customerManagementSortMode.value === 'created') {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      }

      return latestLedgerTime(right) - latestLedgerTime(left)
    })
})
const customerManagementSummary = computed(() =>
  `${customerManagementMembers.value.length} 位顧客 · ${customerManagementTypes.value.length} 類型`,
)

const accessPermissionLabels: Record<AdminPermission, string> = {
  openOrders: '開單',
  sendOrdersToKitchen: '出單至廚房',
  transferOrders: '轉單',
  deleteOrders: '刪單',
  deleteOrderItems: '刪品項',
  useVariablePriceNotes: '使用變價註記',
  checkoutOrders: '結帳',
  adjustServiceCharges: '服務費與其他費用',
  applyManualDiscounts: '手動折扣',
  sendDailyReports: '日結報表寄送',
  manageProducts: '商品管理',
  managePrinting: '列印設定',
  managePayments: '支付設定',
  manageReports: '報表',
  manageCustomers: '顧客資訊',
  manageAccess: '權限設定',
  manageOnlineOrders: '線上接單',
  cancelOnlineOrders: '取消線上訂單',
  manageOnlineAvailability: '線上點餐營業狀態',
  manageReservations: '訂位管理',
  manageCashDrawer: '錢櫃管理',
  voidOrders: '作廢訂單',
  refundOrders: '退款',
  closeRegister: '關帳',
}

const protectedPermissionIds = computed(() => new Set(accessPolicy.value.protectedPermissions))

const permissionRequiresVerification = (permission: AdminPermission): boolean =>
  protectedPermissionIds.value.has(permission)

const requestAccessVerification = (step: ProtectedPermissionStep): Promise<boolean> => {
  if (!isPosApiConfigured) {
    accessVerificationError.value = '權限驗證需要連線到 POS API'
    return Promise.resolve(false)
  }

  if (accessVerificationPrompt.value) {
    return Promise.resolve(false)
  }

  accessVerificationCode.value = ''
  accessVerificationError.value = ''

  return new Promise((resolve) => {
    accessVerificationPrompt.value = { ...step, resolve }
  })
}

const cancelAccessVerification = (): void => {
  if (isAccessVerifying.value) {
    return
  }

  const prompt = accessVerificationPrompt.value
  accessVerificationPrompt.value = null
  accessVerificationCode.value = ''
  accessVerificationError.value = ''
  prompt?.resolve(false)
}

const submitAccessVerification = async (): Promise<void> => {
  const prompt = accessVerificationPrompt.value
  if (!prompt || isAccessVerifying.value) {
    return
  }

  const staffCode = accessVerificationCode.value.trim().replace(/\s+/g, '')
  if (!staffCode) {
    accessVerificationError.value = '請輸入員工識別碼'
    return
  }

  isAccessVerifying.value = true
  accessVerificationError.value = ''
  try {
    await verifyAccessPermission(prompt.permission, staffCode)
    accessVerificationPrompt.value = null
    accessVerificationCode.value = ''
    prompt.resolve(true)
  } catch (error) {
    accessVerificationError.value = error instanceof Error ? error.message : '權限驗證失敗'
  } finally {
    isAccessVerifying.value = false
  }
}

const verifyProtectedPermissions = async (steps: ProtectedPermissionStep[]): Promise<boolean> => {
  const requested = new Set<AdminPermission>()
  for (const step of steps) {
    if (requested.has(step.permission) || !permissionRequiresVerification(step.permission)) {
      continue
    }

    requested.add(step.permission)
    const verified = await requestAccessVerification(step)
    if (!verified) {
      return false
    }
  }

  return true
}

const openOrderPermissionStep = (detail: string): ProtectedPermissionStep => ({
  permission: 'openOrders',
  title: accessPermissionLabels.openOrders,
  detail,
})

const inventoryActionLabels: Record<InventoryRecordAction, string> = {
  purchase: '進貨',
  return: '退貨',
  consumption: '消耗',
  scrapped: '報廢',
  count: '盤點',
}

const activeInventoryCategories = computed(() =>
  inventoryCategories.value.filter((category) => category.isActive),
)

const selectedInventoryItem = computed(() =>
  inventoryItems.value.find((item) => item.id === inventorySelectedItemId.value) ?? null,
)

const filteredInventoryItems = computed(() => {
  const keyword = inventorySearchTerm.value.trim().toLowerCase()
  const categoryFilter = inventoryCategoryFilter.value

  return inventoryItems.value
    .filter((item) => item.isActive)
    .filter((item) => categoryFilter === 'all' || item.categoryId === categoryFilter)
    .filter((item) => {
      if (!keyword) {
        return true
      }
      return [item.name, item.unit, item.note].some((value) => value.toLowerCase().includes(keyword))
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
})

const lowStockInventoryItems = computed(() =>
  inventoryItems.value.filter((item) =>
    item.isActive &&
    item.lowStockQuantity !== null &&
    item.stockQuantity <= item.lowStockQuantity,
  ),
)

const selectedInventoryRecords = computed(() =>
  inventoryRecords.value.filter((record) => record.itemId === inventorySelectedItemId.value).slice(0, 8),
)

const inventoryManagementSummary = computed(() =>
  `${inventoryItems.value.filter((item) => item.isActive).length} 品項 · ${lowStockInventoryItems.value.length} 低庫存`,
)

const activeCoupon = computed(() =>
  customer.availableCoupons.find((coupon) => coupon.code === couponCode.value && coupon.status === 'active') ?? null,
)

const paymentSplitLineKey = (line: CartLine): string => line.itemId

const paymentSplitAmounts = (total: number, count: number): number[] => {
  if (count <= 0) {
    return []
  }

  const baseAmount = Math.floor(total / count)
  const remainder = total - baseAmount * count
  return Array.from({ length: count }, (_, index) => baseAmount + (index < remainder ? 1 : 0))
}

const makePaymentSplit = (index: number, amount: number, lineKeys: string[] = []): PaymentSplit => ({
  id: `split-${Date.now()}-${index + 1}`,
  label: `子單 ${index + 1}`,
  amount,
  lineKeys,
  paymentMethod: paymentMethod.value,
  status: 'open',
  paidAt: null,
})

const lineTotalByKey = computed(() =>
  new Map(cartLines.value.map((line) => [paymentSplitLineKey(line), line.unitPrice * line.quantity])),
)

const assignedPaymentSplitLineKeys = computed(() =>
  new Set(paymentSplits.value.flatMap((split) => split.lineKeys)),
)

const unassignedPaymentSplitTotal = computed(() =>
  cartLines.value.reduce((total, line) =>
    assignedPaymentSplitLineKeys.value.has(paymentSplitLineKey(line))
      ? total
      : total + line.unitPrice * line.quantity,
  0),
)

const paymentSplitTotal = computed(() =>
  paymentSplits.value.reduce((total, split) => total + Math.max(0, Math.trunc(split.amount || 0)), 0),
)

const paymentSplitPaidTotal = computed(() =>
  paymentSplits.value.reduce((total, split) => split.status === 'paid' ? total + split.amount : total, 0),
)

const paymentSplitOpenCount = computed(() =>
  paymentSplits.value.filter((split) => split.status !== 'paid').length,
)

const paymentSplitSummary = computed(() => {
  if (paymentSplits.value.length === 0) {
    return '尚未拆單'
  }

  return `${paymentSplits.value.length} 張子單 · 未結 ${paymentSplitOpenCount.value} 張 · 已結 ${formatCurrency(paymentSplitPaidTotal.value)}`
})

const orderPaymentSplitSummary = (order: PosOrder): string => {
  if (order.paymentSplits.length === 0) {
    return ''
  }

  const paidTotal = order.paymentSplits.reduce((total, split) => split.status === 'paid' ? total + split.amount : total, 0)
  const openCount = order.paymentSplits.filter((split) => split.status !== 'paid').length
  return `拆單 ${order.paymentSplits.length} 張 · 未結 ${openCount} 張 · 已結 ${formatCurrency(paidTotal)}`
}

const onlineMixedPaymentMethods = new Set<PaymentMethod>(['card', 'line-pay', 'jkopay'])

const makePaymentAllocation = (index: number, amount: number, method: PaymentMethod = paymentMethod.value): PaymentAllocation => ({
  id: `payment-${Date.now()}-${index + 1}`,
  paymentMethod: method,
  amount,
  status: 'open',
  paidAt: null,
})

const paymentBreakdownTotal = computed(() =>
  paymentBreakdown.value.reduce((total, payment) => total + Math.max(0, Math.trunc(payment.amount || 0)), 0),
)

const paymentBreakdownRemaining = computed(() => Math.max(0, cartTotal.value - paymentBreakdownTotal.value))

const paymentBreakdownOnlineMethodCount = computed(() => {
  const methods = new Set(paymentBreakdown.value
    .filter((payment) => payment.amount > 0 && onlineMixedPaymentMethods.has(payment.paymentMethod))
    .map((payment) => payment.paymentMethod))
  return methods.size
})

const paymentBreakdownBalanced = computed(() =>
  paymentBreakdown.value.length === 0 || paymentBreakdownTotal.value === cartTotal.value,
)

const paymentBreakdownValid = computed(() =>
  paymentBreakdownBalanced.value && paymentBreakdownOnlineMethodCount.value <= 1,
)

const paymentBreakdownSummary = computed(() => {
  if (paymentBreakdown.value.length === 0) {
    return '單一付款'
  }

  return `混合支付 ${paymentBreakdown.value.length} 筆 · 已分配 ${formatCurrency(paymentBreakdownTotal.value)}`
})

const orderPaymentBreakdownSummary = (order: PosOrder): string => {
  if (order.paymentBreakdown.length === 0) {
    return ''
  }

  const paidTotal = order.paymentBreakdown.reduce((total, payment) => payment.status === 'paid' ? total + payment.amount : total, 0)
  return `混合支付 ${order.paymentBreakdown.length} 筆 · 已結 ${formatCurrency(paidTotal)}`
}

const paymentAmountForOrder = (order: PosOrder, method: PaymentMethod): number => {
  if (order.paymentBreakdown.length > 0) {
    return order.paymentBreakdown
      .filter((payment) => payment.paymentMethod === method)
      .reduce((total, payment) => total + payment.amount, 0)
  }

  return order.paymentMethod === method ? order.subtotal : 0
}

const enableMixedPayments = (): void => {
  if (paymentBreakdown.value.length > 0) {
    return
  }

  paymentBreakdown.value = [makePaymentAllocation(0, cartTotal.value)]
}

const addPaymentAllocation = (): void => {
  if (paymentBreakdown.value.length === 0) {
    enableMixedPayments()
    return
  }

  paymentBreakdown.value = [
    ...paymentBreakdown.value,
    makePaymentAllocation(paymentBreakdown.value.length, paymentBreakdownRemaining.value, 'cash'),
  ].slice(0, 8)
}

const resetPaymentBreakdown = (): void => {
  paymentBreakdown.value = []
}

const updatePaymentAllocationMethod = (paymentId: string, event: Event): void => {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : 'cash'
  const method: PaymentMethod = value === 'card' || value === 'line-pay' || value === 'jkopay' || value === 'transfer'
    ? value
    : 'cash'
  paymentBreakdown.value = paymentBreakdown.value.map((payment) =>
    payment.id === paymentId ? { ...payment, paymentMethod: method } : payment,
  )
}

const updatePaymentAllocationAmount = (paymentId: string, event: Event): void => {
  const value = event.target instanceof HTMLInputElement ? event.target.value : '0'
  const amount = Math.max(0, Math.trunc(Number(value) || 0))
  paymentBreakdown.value = paymentBreakdown.value.map((payment) =>
    payment.id === paymentId ? { ...payment, amount } : payment,
  )
}

const togglePaymentAllocationPaid = (paymentId: string): void => {
  const paidAt = new Date().toISOString()
  paymentBreakdown.value = paymentBreakdown.value.map((payment) =>
    payment.id === paymentId
      ? {
          ...payment,
          status: payment.status === 'paid' ? 'open' : 'paid',
          paidAt: payment.status === 'paid' ? null : paidAt,
        }
      : payment,
  )
}

const paymentSplitBalanced = computed(() =>
  paymentSplits.value.length === 0 || paymentSplitTotal.value === cartTotal.value,
)

const recalculatePaymentSplitAmounts = (): void => {
  const count = paymentSplits.value.length
  if (count === 0) {
    return
  }

  const hasAssignedLines = paymentSplits.value.some((split) => split.lineKeys.length > 0)
  if (!hasAssignedLines) {
    const amounts = paymentSplitAmounts(cartTotal.value, count)
    paymentSplits.value = paymentSplits.value.map((split, index) => ({ ...split, amount: amounts[index] ?? 0 }))
    return
  }

  const baseAmounts = paymentSplits.value.map((split, index) => {
    const lineTotal = split.lineKeys.reduce((total, lineKey) => total + (lineTotalByKey.value.get(lineKey) ?? 0), 0)
    return index === 0 ? lineTotal + unassignedPaymentSplitTotal.value : lineTotal
  })
  const baseTotal = baseAmounts.reduce((total, amount) => total + amount, 0)
  if (baseTotal <= 0) {
    const amounts = paymentSplitAmounts(cartTotal.value, count)
    paymentSplits.value = paymentSplits.value.map((split, index) => ({ ...split, amount: amounts[index] ?? 0 }))
    return
  }

  const rawAmounts = baseAmounts.map((amount) => Math.floor(cartTotal.value * amount / baseTotal))
  let remainder = cartTotal.value - rawAmounts.reduce((total, amount) => total + amount, 0)
  paymentSplits.value = paymentSplits.value.map((split, index) => {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    return { ...split, amount: (rawAmounts[index] ?? 0) + extra }
  })
}

const createEqualPaymentSplits = (count = 2): void => {
  const splitCount = Math.min(Math.max(count, 2), 12)
  const amounts = paymentSplitAmounts(cartTotal.value, splitCount)
  paymentSplits.value = amounts.map((amount, index) => makePaymentSplit(index, amount))
}

const addPaymentSplit = (): void => {
  const nextCount = Math.min(paymentSplits.value.length + 1, 12)
  if (paymentSplits.value.length === 0) {
    createEqualPaymentSplits(2)
    return
  }

  paymentSplits.value = [
    ...paymentSplits.value,
    makePaymentSplit(nextCount - 1, 0),
  ]
  recalculatePaymentSplitAmounts()
}

const resetPaymentSplits = (): void => {
  paymentSplits.value = []
}

const updatePaymentSplitMethod = (splitId: string, event: Event): void => {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : 'cash'
  const method: PaymentMethod = value === 'card' || value === 'line-pay' || value === 'jkopay' || value === 'transfer'
    ? value
    : 'cash'
  paymentSplits.value = paymentSplits.value.map((split) =>
    split.id === splitId ? { ...split, paymentMethod: method } : split,
  )
}

const togglePaymentSplitPaid = (splitId: string): void => {
  const paidAt = new Date().toISOString()
  paymentSplits.value = paymentSplits.value.map((split) =>
    split.id === splitId
      ? {
          ...split,
          status: split.status === 'paid' ? 'open' : 'paid',
          paidAt: split.status === 'paid' ? null : paidAt,
        }
      : split,
  )
}

const assignLineToPaymentSplit = (line: CartLine, splitId: string): void => {
  if (paymentSplits.value.length === 0) {
    createEqualPaymentSplits(2)
  }

  const lineKey = paymentSplitLineKey(line)
  paymentSplits.value = paymentSplits.value.map((split) => {
    const lineKeys = split.lineKeys.filter((key) => key !== lineKey)
    return split.id === splitId ? { ...split, lineKeys: [...lineKeys, lineKey] } : { ...split, lineKeys }
  })
  recalculatePaymentSplitAmounts()
}

const unassignLineFromPaymentSplits = (line: CartLine): void => {
  const lineKey = paymentSplitLineKey(line)
  paymentSplits.value = paymentSplits.value.map((split) => ({
    ...split,
    lineKeys: split.lineKeys.filter((key) => key !== lineKey),
  }))
  recalculatePaymentSplitAmounts()
}

const lineAssignedToSplit = (line: CartLine, splitId: string): boolean => {
  const split = paymentSplits.value.find((entry) => entry.id === splitId)
  return Boolean(split?.lineKeys.includes(paymentSplitLineKey(line)))
}

watch([cartTotal, cartLines], () => {
  recalculatePaymentSplitAmounts()
}, { deep: true })

const recommendedItems = computed(() => {
  const cartCategories = new Set(cartLines.value.map((line) => line.category).filter(Boolean))
  const cartItemIds = new Set(cartLines.value.map((line) => line.productId ?? line.itemId))
  const ruleProductIds = engagementSettings.value.recommendations
    .filter((rule) =>
      rule.enabled &&
      (
        rule.trigger === 'any' ||
        cartCategories.has(rule.trigger as MenuCategory) ||
        (rule.trigger === 'morning' && new Date().getHours() < 12)
      ),
    )
    .flatMap((rule) => rule.productIds)
  const candidateIds = new Set(ruleProductIds)
  const taggedCandidates = menuCatalog.value.filter((item) =>
    item.tags.some((tag) => ['可加購', '熱賣', '限量'].includes(tag)),
  )

  return [...menuCatalog.value, ...taggedCandidates]
    .filter((item) =>
      item.available &&
      item.posVisible &&
      !cartItemIds.has(item.id) &&
      (candidateIds.size === 0 || candidateIds.has(item.id) || item.tags.includes('可加購')),
    )
    .slice(0, 4)
})

const supplyCheckSummary = computed(() => {
  const unavailableOnlineItems = menuCatalog.value.filter((item) =>
    item.onlineVisible && (!item.available || item.inventoryCount === 0),
  )
  if (!engagementSettings.value.supplyRules.preOpenCheckEnabled) {
    return '線上營業前檢查未啟用'
  }

  return unavailableOnlineItems.length > 0
    ? `${unavailableOnlineItems.length} 個線上商品目前無供應`
    : '線上供應檢查正常'
})

const runCrmSearch = async (): Promise<void> => {
  const keyword = (crmSearchTerm.value || customer.phone || customer.name).trim()
  if (!keyword) {
    crmMessage.value = '請輸入電話或姓名'
    return
  }

  isCrmSearching.value = true
  crmMessage.value = '查詢會員中'
  try {
    crmMatches.value = await searchPosMembers(keyword)
    crmMessage.value = crmMatches.value.length > 0 ? `找到 ${crmMatches.value.length} 位顧客` : '查無顧客'
  } catch (error) {
    crmMessage.value = error instanceof Error ? error.message : '會員查詢失敗'
  } finally {
    isCrmSearching.value = false
  }
}

const applyCrmMember = (member: PosMember): void => {
  applyCustomerMember(member)
  crmSearchTerm.value = member.phone || member.displayName
  crmMessage.value = `${member.displayName} 已套用`
}

watch(activeCoupon, (coupon) => {
  if (!coupon) {
    return
  }

  discountAmount.value = coupon.discountAmount > 0
    ? coupon.discountAmount
    : Math.round(cartItemSubtotal.value * coupon.discountPercent / 100)
})

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

const transactionSearchOptions: Array<{ value: TransactionSearchCriterion; label: string; placeholder: string }> = [
  { value: 'receipt', label: '發票/收據號碼', placeholder: '範例：#-00001234 或 POS-000123' },
  { value: 'carrier', label: '載具/捐贈碼', placeholder: '輸入載具、統編或捐贈碼' },
  { value: 'table', label: '桌號', placeholder: '範例：A1 或 1F A1' },
  { value: 'order', label: '訂單號碼', placeholder: '輸入 POS / WEB / 短單號' },
]

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

const printRuleTimingOptions: Array<{ value: PrintRuleTiming; label: string }> = [
  { value: 'order', label: '出單' },
  { value: 'reprint', label: '重印' },
]

const defaultPrintRuleTimings: PrintRuleTiming[] = printRuleTimingOptions.map((option) => option.value)

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

const comboRequirement = (required: boolean, min: number, max: number, allowRepeat: boolean): string => {
  if (required) {
    return min === max ? `必選 ${min} 份` : `必選 ${min}-${max} 份`
  }

  return allowRepeat ? `選填最多 ${max} 份，可重複` : `選填最多 ${max} 份`
}

const normalizeComboProductAssignments = (value: unknown): OnlineOrderingSettings['comboProductAssignments'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.entries(value as Record<string, unknown>).reduce<OnlineOrderingSettings['comboProductAssignments']>(
    (assignments, [productId, rawGroups]) => {
      const normalizedProductId = normalizeSpace(productId).slice(0, 80)
      if (!normalizedProductId || !Array.isArray(rawGroups)) {
        return assignments
      }

      const seenGroupIds = new Set<string>()
      const groups = rawGroups.flatMap((entry, groupIndex): ComboProductGroup[] => {
        if (!entry || typeof entry !== 'object') {
          return []
        }

        const source = entry as Partial<ComboProductGroup>
        const id = typeof source.id === 'string' ? normalizeSpace(source.id).slice(0, 64) : `combo-${groupIndex + 1}`
        const label = typeof source.label === 'string' ? normalizeSpace(source.label).slice(0, 40) : `套餐子項目 ${groupIndex + 1}`
        if (!id || !label || seenGroupIds.has(id) || !Array.isArray(source.choices)) {
          return []
        }

        const seenChoiceProductIds = new Set<string>()
        const choices = source.choices.flatMap((choice): ComboProductGroup['choices'] => {
          if (!choice || typeof choice !== 'object') {
            return []
          }

          const choiceSource = choice as Partial<ComboProductGroup['choices'][number]>
          const choiceProductId = typeof choiceSource.productId === 'string' ? normalizeSpace(choiceSource.productId).slice(0, 80) : ''
          if (!choiceProductId || choiceProductId === normalizedProductId || seenChoiceProductIds.has(choiceProductId)) {
            return []
          }

          seenChoiceProductIds.add(choiceProductId)
          return [{
            productId: choiceProductId,
            priceDelta: Number.isFinite(choiceSource.priceDelta) ? Math.trunc(Number(choiceSource.priceDelta)) : 0,
          }]
        }).slice(0, 40)

        if (choices.length === 0) {
          return []
        }

        const max = Math.max(1, Math.min(12, Math.trunc(Number(source.max) || 1)))
        const required = source.required !== false
        const min = required ? Math.max(1, Math.min(max, Math.trunc(Number(source.min) || 1))) : 0
        const allowRepeat = source.allowRepeat === true
        seenGroupIds.add(id)
        const requirement = typeof source.requirement === 'string' ? normalizeSpace(source.requirement).slice(0, 40) : ''

        return [{
          id,
          label,
          requirement: requirement || comboRequirement(required, min, max, allowRepeat),
          required,
          min,
          max,
          allowRepeat,
          choices,
        }]
      }).slice(0, 20)

      if (groups.length > 0) {
        assignments[normalizedProductId] = groups
      }
      return assignments
    },
    {},
  )
}

const readComboProductAssignments = (): OnlineOrderingSettings['comboProductAssignments'] =>
  normalizeComboProductAssignments(readStorageValue<unknown>(comboProductAssignmentStorageKey, {}))

const writeComboProductAssignments = (assignments: OnlineOrderingSettings['comboProductAssignments']): void => {
  writeStorageValue(comboProductAssignmentStorageKey, assignments)
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
const comboProductAssignments = ref<OnlineOrderingSettings['comboProductAssignments']>(readComboProductAssignments())
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

const cloneComboAssignments = (
  assignments: OnlineOrderingSettings['comboProductAssignments'],
): OnlineOrderingSettings['comboProductAssignments'] =>
  Object.entries(assignments).reduce<OnlineOrderingSettings['comboProductAssignments']>((copy, [productId, groups]) => {
    copy[productId] = groups.map((group) => ({
      ...group,
      choices: group.choices.map((choice) => ({ ...choice })),
    }))
    return copy
  }, {})

const currentSupplyProducts = (): MenuItem[] =>
  cloneProducts([
    ...new Map([...productStatusCatalog.value, ...menuCatalog.value].map((product) => [product.id, product])).values(),
  ])

const knownMenuProducts = computed<MenuItem[]>(() => [
  ...new Map([...productStatusCatalog.value, ...menuCatalog.value].map((product) => [product.id, product])).values(),
])

const knownMenuProductById = computed(() =>
  new Map(knownMenuProducts.value.map((product) => [product.id, product])),
)

const captureSupplySnapshot = (label: string): SupplyStateSnapshot => ({
  label,
  menuCategories: cloneMenuCategories(menuCategoryDefinitions.value),
  availableNotes: cloneOptionChoices(availableNoteCatalog.value),
  optionGroups: cloneOptionGroups(optionGroupCatalog.value),
  productAssignments: cloneProductAssignments(productOptionAssignments.value),
  comboAssignments: cloneComboAssignments(comboProductAssignments.value),
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
  comboProductAssignments.value = cloneComboAssignments(snapshot.comboAssignments)
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

const onlineComboAssignmentsForSync = (): OnlineOrderingSettings['comboProductAssignments'] =>
  cloneComboAssignments(comboProductAssignments.value)

const runtimeSupplyConfigHasData = (settings: OnlineOrderingSettings): boolean =>
  settings.menuCategories.length > 0 ||
  settings.availableOptionChoices.length > 0 ||
  settings.menuOptionGroups.length > 0 ||
  Object.keys(settings.productOptionAssignments).length > 0 ||
  Object.keys(settings.comboProductAssignments).length > 0 ||
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
  comboProductAssignments.value = cloneComboAssignments(settings.comboProductAssignments)
  noteSupplyStatuses.value = { ...settings.noteSupplyStatuses }
}

const saveSupplyChanges = async (): Promise<void> => {
  writeSupplyStatusMap(supplyProductStatusStorageKey, productSupplyStatuses.value)
  writeSupplyStatusMap(supplyNoteStatusStorageKey, noteSupplyStatuses.value)
  writeMenuCategoryDefinitions(menuCategoryDefinitions.value)
  writeAvailableNotes(availableNoteCatalog.value)
  writeOptionGroups(optionGroupCatalog.value)
  writeProductOptionAssignments(productOptionAssignments.value)
  writeComboProductAssignments(comboProductAssignments.value)

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
        comboProductAssignments: onlineComboAssignmentsForSync(),
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
        comboProductAssignments: onlineComboAssignmentsForSync(),
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
  floor: '桌位地圖',
  order: '點餐',
  details: '顧客與備註',
  payment: '付款確認',
  queue: '外帶 / 外送',
  reservations: '訂位管理',
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
  { value: 'future', label: '今日之後' },
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
  { value: 'fulfillment-asc', label: '取餐/送達時間早到晚' },
  { value: 'fulfillment-desc', label: '取餐/送達時間晚到早' },
  { value: 'created-desc', label: '建立時間新到舊' },
  { value: 'amount-desc', label: '金額高到低' },
]
const reservationViewModeOptions: Array<{ value: ReservationViewMode; label: string }> = [
  { value: 'day', label: '日' },
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
]
const reservationStatusOptions: Array<{ value: ReservationStatusFilter; label: string }> = [
  { value: 'all', label: '全部狀態' },
  { value: 'booked', label: '已預訂' },
  { value: 'reminded', label: '已發送提醒' },
  { value: 'confirmed', label: '已保留訂位' },
  { value: 'seated', label: '已帶位' },
  { value: 'cancelled', label: '已取消' },
  { value: 'no_show', label: '未出席' },
]
const reservationEditableStatusOptions: Array<{ value: ReservationStatus; label: string }> = [
  { value: 'booked', label: '已預訂' },
  { value: 'reminded', label: '已發送提醒' },
  { value: 'confirmed', label: '已保留訂位' },
  { value: 'seated', label: '已帶位' },
  { value: 'cancelled', label: '已取消' },
  { value: 'no_show', label: '未出席' },
]
const reservationStatusLabels: Record<ReservationStatus, string> = {
  booked: '已預訂',
  reminded: '已發送提醒',
  confirmed: '已保留訂位',
  seated: '已帶位',
  cancelled: '已取消',
  no_show: '未出席',
}
const reservationAwaitingGuestStatuses: ReservationStatus[] = ['booked', 'reminded', 'confirmed']
const reservationCapacityStatuses: ReservationStatus[] = [...reservationAwaitingGuestStatuses, 'seated']
const reservationCheckInLeadMs = 2 * 60 * 60 * 1000
const localDateInputValue = (date: Date): string => formatDateKey(date)
const localDateFromKey = (dateKey: string): Date => {
  const date = new Date(`${dateKey}T00:00:00`)
  return Number.isFinite(date.getTime()) ? date : new Date()
}
const localDateTimeInputValue = (date: Date): string => {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16)
}
const fromDateTimeInputValue = (value: string): string | null => {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
const addLocalDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
const nextReservationSlotInput = (): string => {
  const now = new Date()
  const slotMinutes = Math.max(15, engagementSettings.value.reservationWebsite.slotMinutes || 30)
  const next = new Date(now.getTime() + slotMinutes * 60 * 1000)
  next.setMinutes(Math.ceil(next.getMinutes() / slotMinutes) * slotMinutes, 0, 0)
  return localDateTimeInputValue(next)
}
const defaultReservationDraft = (): ReservationDraft => ({
  customerName: '',
  customerPhone: '',
  partySize: Math.max(1, engagementSettings.value.reservationWebsite.minPartySize || 1),
  reservedAt: nextReservationSlotInput(),
  importantLabel: '',
  note: '',
  assignedTableIds: [],
})
const orderDateKey = (order: PosOrder): string | null => {
  const orderDate = new Date(order.requestedFulfillmentAt ?? order.createdAt)
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

  if (queueDateFilter.value === 'today') {
    return dateKey === todayKey
  }

  if (queueDateFilter.value === 'future') {
    return dateKey > todayKey
  }

  return dateKey < todayKey
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
    orderPaymentSplitSummary(order),
    orderPaymentBreakdownSummary(order),
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

    if (queueSortMode.value === 'fulfillment-desc') {
      return orderFulfillmentTime(b) - orderFulfillmentTime(a) || orderCreatedTime(b) - orderCreatedTime(a)
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
const quickDispatchCutoffTimestamp = computed(() => {
  const timestamp = new Date(quickDispatchCutoffInput.value).getTime()
  return Number.isFinite(timestamp) ? timestamp : currentTime.value
})
const quickDispatchEligibleOrders = computed(() =>
  orderQueue.value.filter((order) =>
    (order.mode === 'takeout' || order.mode === 'delivery') &&
    orderIsOpenForFulfillment(order) &&
    !onlineOrderRequiresAcceptance(order) &&
    order.paymentStatus === 'paid' &&
    (quickDispatchSourceFilter.value === 'all' || order.source === quickDispatchSourceFilter.value) &&
    orderFulfillmentTime(order) <= quickDispatchCutoffTimestamp.value,
  ),
)
const quickDispatchBlockedCount = computed(() =>
  quickDispatchEligibleOrders.value.filter((order) => orderClaimedByOtherStation(order)).length,
)
const quickDispatchAvailableOrders = computed(() =>
  quickDispatchEligibleOrders.value.filter((order) => !orderClaimedByOtherStation(order)),
)
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
const activePrinterRuleCategoryIds = ref<Record<string, MenuCategory>>({})
const activePrinterRuleCountCategoryIds = ref<Record<string, MenuCategory>>({})
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
const printerRuleCountExcludedLabel = (rule: PrintRuleSetting): string => {
  const categories = rule.countExcludedCategories ?? []
  const itemIds = new Set(rule.countExcludedItemIds ?? [])
  if (categories.length === 0 && itemIds.size === 0) {
    return '未設定不計算品項'
  }

  const categoryNames = categories.map(categoryLabelFor)
  const itemNames = printRuleMenuItems.value.filter((item) => itemIds.has(item.id)).map((item) => item.name)
  const missingCount = itemIds.size - itemNames.length
  return [...categoryNames, ...itemNames.slice(0, 3), ...(missingCount > 0 ? [`另 ${missingCount} 項`] : [])].join('、')
}
const printerRuleScopeLabel = (rule: PrintRuleSetting): string => {
  const categoryCount = rule.categories.length
  const itemCount = (rule.itemIds ?? []).length
  if (categoryCount === 0 && itemCount === 0) {
    return '未加入品項，出單時不列印'
  }

  return `${categoryCount} 類 · ${itemCount} 個指定品項`
}
const printerRuleTimingSelected = (rule: PrintRuleSetting, timing: PrintRuleTiming): boolean =>
  (rule.timings ?? defaultPrintRuleTimings).includes(timing)
const printerRuleTimingLabel = (rule: PrintRuleSetting): string =>
  printRuleTimingOptions
    .filter((option) => printerRuleTimingSelected(rule, option.value))
    .map((option) => option.label)
    .join('、') || '未選時機'
const printerRuleModeLabel = (rule: PrintRuleSetting): string =>
  `${serviceModeLabels[rule.serviceMode]} · ${printerRuleTimingLabel(rule)} · ${printLabelModeLabels[rule.labelMode]}`
const printerRuleProductIdsForCategory = (category: MenuCategory): string[] =>
  printRuleMenuItems.value.filter((item) => item.category === category).map((item) => item.id)
const activePrinterRuleCategoryId = (rule: PrintRuleSetting): MenuCategory | '' => {
  const activeCategory = activePrinterRuleCategoryIds.value[rule.id]
  if (activeCategory && menuCategoryOptions.value.some((category) => category.id === activeCategory)) {
    return activeCategory
  }

  const firstRuleCategory = rule.categories.find((category) =>
    menuCategoryOptions.value.some((option) => option.id === category),
  )
  return firstRuleCategory ?? menuCategoryOptions.value[0]?.id ?? ''
}
const selectPrinterRuleCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  activePrinterRuleCategoryIds.value = {
    ...activePrinterRuleCategoryIds.value,
    [rule.id]: category,
  }
}
const activePrinterRuleCountCategoryId = (rule: PrintRuleSetting): MenuCategory | '' => {
  const activeCategory = activePrinterRuleCountCategoryIds.value[rule.id]
  if (activeCategory && menuCategoryOptions.value.some((category) => category.id === activeCategory)) {
    return activeCategory
  }

  const firstRuleCategory = (rule.countExcludedCategories ?? []).find((category) =>
    menuCategoryOptions.value.some((option) => option.id === category),
  )
  return firstRuleCategory ?? menuCategoryOptions.value[0]?.id ?? ''
}
const selectPrinterRuleCountCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  activePrinterRuleCountCategoryIds.value = {
    ...activePrinterRuleCountCategoryIds.value,
    [rule.id]: category,
  }
}
const printerRuleProductOptions = (rule: PrintRuleSetting): MenuItem[] => {
  const activeCategory = activePrinterRuleCategoryId(rule)
  return activeCategory
    ? printRuleMenuItems.value.filter((item) => item.category === activeCategory)
    : printRuleMenuItems.value
}
const printerRuleCountProductOptions = (rule: PrintRuleSetting): MenuItem[] => {
  const activeCategory = activePrinterRuleCountCategoryId(rule)
  return activeCategory
    ? printRuleMenuItems.value.filter((item) => item.category === activeCategory)
    : printRuleMenuItems.value
}
const printerRuleCategoryFullySelected = (rule: PrintRuleSetting, category: MenuCategory): boolean => {
  const categoryProductIds = printerRuleProductIdsForCategory(category)
  if (categoryProductIds.length === 0) {
    return rule.categories.includes(category)
  }

  const selectedItemIds = new Set(rule.itemIds ?? [])
  return rule.categories.includes(category) || categoryProductIds.every((itemId) => selectedItemIds.has(itemId))
}
const printerRuleItemSelected = (rule: PrintRuleSetting, item: MenuItem): boolean =>
  rule.categories.includes(item.category) || (rule.itemIds ?? []).includes(item.id)
const printerRuleCountCategoryFullySelected = (rule: PrintRuleSetting, category: MenuCategory): boolean => {
  const categoryProductIds = printerRuleProductIdsForCategory(category)
  const categories = rule.countExcludedCategories ?? []
  if (categoryProductIds.length === 0) {
    return categories.includes(category)
  }

  const selectedItemIds = new Set(rule.countExcludedItemIds ?? [])
  return categories.includes(category) || categoryProductIds.every((itemId) => selectedItemIds.has(itemId))
}
const printerRuleCountItemSelected = (rule: PrintRuleSetting, item: MenuItem): boolean =>
  (rule.countExcludedCategories ?? []).includes(item.category) || (rule.countExcludedItemIds ?? []).includes(item.id)
const normalizePrinterRuleFullCategories = (rule: PrintRuleSetting): void => {
  const itemIds = new Set(rule.itemIds ?? [])
  const categories = new Set(rule.categories)
  for (const category of menuCategoryOptions.value.map((option) => option.id)) {
    const categoryProductIds = printerRuleProductIdsForCategory(category)
    if (categoryProductIds.length === 0 || !categoryProductIds.every((itemId) => itemIds.has(itemId))) {
      continue
    }

    categories.add(category)
    for (const itemId of categoryProductIds) {
      itemIds.delete(itemId)
    }
  }

  rule.categories = [...categories]
  rule.itemIds = [...itemIds]
}
const normalizePrinterRuleCountFullCategories = (rule: PrintRuleSetting): void => {
  const itemIds = new Set(rule.countExcludedItemIds ?? [])
  const categories = new Set(rule.countExcludedCategories ?? [])
  for (const category of menuCategoryOptions.value.map((option) => option.id)) {
    const categoryProductIds = printerRuleProductIdsForCategory(category)
    if (categoryProductIds.length === 0 || !categoryProductIds.every((itemId) => itemIds.has(itemId))) {
      continue
    }

    categories.add(category)
    for (const itemId of categoryProductIds) {
      itemIds.delete(itemId)
    }
  }

  rule.countExcludedCategories = [...categories]
  rule.countExcludedItemIds = [...itemIds]
}
const togglePrinterRuleCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  selectPrinterRuleCategory(rule, category)
  const categoryProductIds = printerRuleProductIdsForCategory(category)
  const itemIds = new Set(rule.itemIds ?? [])
  if (printerRuleCategoryFullySelected(rule, category)) {
    rule.categories = rule.categories.filter((entry) => entry !== category)
    for (const itemId of categoryProductIds) {
      itemIds.delete(itemId)
    }
    rule.itemIds = [...itemIds]
    return
  }

  rule.categories = [...rule.categories, category]
  for (const itemId of categoryProductIds) {
    itemIds.delete(itemId)
  }
  rule.itemIds = [...itemIds]
}
const togglePrinterRuleItem = (rule: PrintRuleSetting, itemId: string): void => {
  const item = printRuleMenuItems.value.find((entry) => entry.id === itemId)
  if (!item) {
    return
  }

  const itemIds = new Set(rule.itemIds ?? [])
  if (printerRuleItemSelected(rule, item)) {
    if (rule.categories.includes(item.category)) {
      rule.categories = rule.categories.filter((entry) => entry !== item.category)
      for (const categoryItemId of printerRuleProductIdsForCategory(item.category)) {
        if (categoryItemId !== item.id) {
          itemIds.add(categoryItemId)
        }
      }
    }
    itemIds.delete(item.id)
    rule.itemIds = [...itemIds]
    return
  }

  itemIds.add(item.id)
  rule.itemIds = [...itemIds]
  normalizePrinterRuleFullCategories(rule)
}
const togglePrinterRuleTiming = (rule: PrintRuleSetting, timing: PrintRuleTiming): void => {
  const timings = new Set(rule.timings ?? defaultPrintRuleTimings)
  if (timings.has(timing)) {
    timings.delete(timing)
  } else {
    timings.add(timing)
  }
  rule.timings = timings.size > 0 ? [...timings] : [timing]
}
const togglePrinterRuleCountCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  selectPrinterRuleCountCategory(rule, category)
  const categoryProductIds = printerRuleProductIdsForCategory(category)
  const itemIds = new Set(rule.countExcludedItemIds ?? [])
  if (printerRuleCountCategoryFullySelected(rule, category)) {
    rule.countExcludedCategories = (rule.countExcludedCategories ?? []).filter((entry) => entry !== category)
    for (const itemId of categoryProductIds) {
      itemIds.delete(itemId)
    }
    rule.countExcludedItemIds = [...itemIds]
    return
  }

  rule.countExcludedCategories = [...(rule.countExcludedCategories ?? []), category]
  for (const itemId of categoryProductIds) {
    itemIds.delete(itemId)
  }
  rule.countExcludedItemIds = [...itemIds]
}
const togglePrinterRuleCountItem = (rule: PrintRuleSetting, itemId: string): void => {
  const item = printRuleMenuItems.value.find((entry) => entry.id === itemId)
  if (!item) {
    return
  }

  const itemIds = new Set(rule.countExcludedItemIds ?? [])
  if (printerRuleCountItemSelected(rule, item)) {
    if ((rule.countExcludedCategories ?? []).includes(item.category)) {
      rule.countExcludedCategories = (rule.countExcludedCategories ?? []).filter((entry) => entry !== item.category)
      for (const categoryItemId of printerRuleProductIdsForCategory(item.category)) {
        if (categoryItemId !== item.id) {
          itemIds.add(categoryItemId)
        }
      }
    }
    itemIds.delete(item.id)
    rule.countExcludedItemIds = [...itemIds]
    return
  }

  itemIds.add(item.id)
  rule.countExcludedItemIds = [...itemIds]
  normalizePrinterRuleCountFullCategories(rule)
}
const clonePrinterSettingsForSave = (): PrinterSettings => ({
  stations: printerSettings.value.stations.map((station) => ({ ...station })),
  rules: printerSettings.value.rules.map((rule) => ({
    ...rule,
    timings: [...new Set(rule.timings ?? defaultPrintRuleTimings)],
    categories: [...new Set(rule.categories)],
    itemIds: [...new Set(rule.itemIds ?? [])],
    countExcludedCategories: [...new Set(rule.countExcludedCategories ?? [])],
    countExcludedItemIds: [...new Set(rule.countExcludedItemIds ?? [])],
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
        timings: [...(rule.timings ?? defaultPrintRuleTimings)],
        categories: [...rule.categories],
        itemIds: [...(rule.itemIds ?? [])],
        countExcludedCategories: [...(rule.countExcludedCategories ?? [])],
        countExcludedItemIds: [...(rule.countExcludedItemIds ?? [])],
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
const productTotalDisplayEnabled = computed(() => engagementSettings.value.productTotalDisplay.enabled)
const lineCountsForProductTotalDisplay = (line: CartLine): boolean => {
  const settings = engagementSettings.value.productTotalDisplay
  if (!settings.enabled) {
    return true
  }

  const excludedCategorySet = new Set(settings.excludedCategories)
  const excludedItemIdSet = new Set(settings.excludedItemIds)
  return !(
    (line.category && excludedCategorySet.has(line.category)) ||
    excludedItemIdSet.has(line.itemId) ||
    (line.productId ? excludedItemIdSet.has(line.productId) : false)
  )
}
const menuItemCountsForProductTotalDisplay = (item: MenuItem): boolean => {
  const settings = engagementSettings.value.productTotalDisplay
  if (!settings.enabled) {
    return true
  }

  return !settings.excludedCategories.includes(item.category) && !settings.excludedItemIds.includes(item.id)
}
const orderProductTotalQuantity = (lines: CartLine[]): number =>
  lines.reduce((total, line) => total + (lineCountsForProductTotalDisplay(line) ? line.quantity : 0), 0)
const activeOrderItemCount = computed(
  () => activeOrder.value ? orderProductTotalQuantity(activeOrder.value.lines) : 0,
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
      const matchingOrders = salesCloseoutOrders.value.filter((order) => paymentAmountForOrder(order, payment.value) > 0)
      return {
        ...payment,
        count: matchingOrders.length,
        total: matchingOrders.reduce((sum, order) => sum + paymentAmountForOrder(order, payment.value), 0),
        pending: matchingOrders.filter((order) => order.paymentStatus === 'pending').length,
      }
    })
    .filter((payment) => payment.count > 0 || payment.visible),
)
const lastPrintTime = computed(() => (printStation.lastPrintAt ? formatOrderTime(printStation.lastPrintAt) : '尚未列印'))
const backendEditModeEnabled = ref(readStorageValue<boolean>(backendEditModeStorageKey, false))
const initialView = readInitialView()
const activeView = ref<AppView>(initialView === 'admin' && !backendEditModeEnabled.value ? 'pos' : initialView)
const activeWorkspaceTab = ref<WorkspaceTab>('floor')
const posReservations = ref<PosReservation[]>([])
const reservationViewMode = ref<ReservationViewMode>('day')
const reservationStatusFilter = ref<ReservationStatusFilter>('all')
const reservationSelectedDate = ref(localDateInputValue(new Date()))
const reservationMessage = ref('訂位尚未同步')
const reservationActionId = ref('')
const isReservationLoading = ref(false)
const reservationDraft = ref<ReservationDraft>(defaultReservationDraft())
const selectedReservationEditId = ref<string | null>(null)
const reservationEditDraft = ref<ReservationEditDraft | null>(null)
const savedQueueView = readSavedQueueView()
const posUiPreferences = ref<PosUiPreferences>(readPosUiPreferences())
const floorLevels = ref<FloorLevelSetting[]>(readFloorLevels())
const activeFloorId = ref(readActiveFloorId(floorLevels.value))
const floorTables = ref<DiningTableDefinition[]>(readFloorTables())
const floorDisplayPreferences = ref<FloorDisplayPreferences>(readFloorDisplayPreferences())
const floorPartySizes = ref<Record<string, number>>(normalizeFloorPartySizes(readStorageValue<unknown>(floorPartyStorageKey, {}), floorTables.value))
const waitlineEntries = ref<WaitlineEntry[]>(readWaitlineEntries())
const waitlineDraft = ref({
  name: '',
  phone: '',
  customerType: 'walk-in',
  partySize: 2,
  note: '',
})
const activeFloorServiceView = ref<FloorServiceView>('dine-in')
const selectedFloorTableId = ref<string | null>(null)
const activeToolboxPanel = ref<ToolboxPanel>('home')
const timeClockStaffCode = ref('')
const timeClockNote = ref('')
const timeClockMessage = ref('輸入員工識別碼打卡')
const isTimeClockSubmitting = ref(false)
const latestTimeClockEntry = ref<StaffTimeClockEntry | null>(null)
const labelManagementDrafts = ref<OrderLabelSetting[]>([])
const labelManagementMessage = ref('訂單標籤會同步到點餐頁與後台紀錄')
const isLabelManagementSaving = ref(false)
const deviceManagementMessage = ref('裝置狀態會由列印站、外設與 print jobs 重建')
const isDeviceManagementRefreshing = ref(false)
const isDeviceManagementCancelling = ref(false)
const customerManagementMembers = ref<PosMember[]>([])
const customerManagementSearchTerm = ref('')
const customerManagementTypeFilter = ref('all')
const customerManagementSortMode = ref<CustomerManagementSortMode>('consumed')
const customerManagementMessage = ref('進入後台編輯模式後可讀取與新增顧客資訊')
const isCustomerManagementLoading = ref(false)
const isCustomerManagementCreating = ref(false)
const customerManagementDraft = ref({
  displayName: '',
  phone: '',
  customerType: '一般顧客',
  pointsBalance: 0,
  openingBalance: 0,
})
const inventoryCategories = ref<InventoryCategory[]>([])
const inventoryItems = ref<InventoryItem[]>([])
const inventoryRecords = ref<InventoryRecord[]>([])
const inventorySearchTerm = ref('')
const inventoryCategoryFilter = ref('all')
const inventorySelectedItemId = ref('')
const inventoryMessage = ref('庫存品項與操作紀錄會儲存在資料庫')
const isInventoryLoading = ref(false)
const isInventorySaving = ref(false)
const inventoryCategoryDraft = ref({
  name: '',
})
const inventoryItemDraft = ref({
  categoryId: '',
  name: '',
  unit: '份',
  defaultUnitCost: 0,
  stockQuantity: 0,
  lowStockQuantity: 0,
  note: '',
})
const inventoryOperationDraft = ref({
  action: 'purchase' as InventoryOperationDraftMode,
  quantity: 0,
  unitCost: 0,
  totalCost: 0,
  countedQuantity: 0,
  note: '',
})
const transactionSearchCriterion = ref<TransactionSearchCriterion>('receipt')
const transactionSearchTerm = ref('')
const selectedTransactionOrderId = ref<string | null>(null)
const transactionLookupMessage = ref('可用收據、載具、桌號或訂單號碼查詢交易')
const cashDrawerReason = ref('手動開啟錢櫃')
const cashDrawerActionMessage = ref('可瀏覽錢櫃開啟紀錄或打開錢櫃')
const isCashDrawerOpening = ref(false)
const floorMapRef = ref<HTMLElement | null>(null)
const posStableViewportHeight = ref(0)
const isApplyingRemoteAppearanceSettings = ref(false)
const isApplyingRemoteFloorPlanSettings = ref(false)
const floorPlanSyncMessage = ref('桌位、候位與顯示設定會寫入資料庫')
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
const toolboxPanelTitle = computed(() => {
  if (activeToolboxPanel.value === 'appearance') {
    return '外觀設定'
  }

  if (activeToolboxPanel.value === 'time-clock') {
    return '員工打卡'
  }

  if (activeToolboxPanel.value === 'current-sales') {
    return '目前營業概況'
  }

  if (activeToolboxPanel.value === 'system-info') {
    return '系統資訊'
  }

  if (activeToolboxPanel.value === 'transactions') {
    return '交易查詢與作廢'
  }

  if (activeToolboxPanel.value === 'cash-drawer') {
    return '錢櫃管理'
  }

  if (activeToolboxPanel.value === 'label-management') {
    return '標籤管理'
  }

  if (activeToolboxPanel.value === 'device-management') {
    return '裝置管理'
  }

  if (activeToolboxPanel.value === 'customer-management') {
    return '顧客資訊'
  }

  if (activeToolboxPanel.value === 'inventory-management') {
    return '庫存管理'
  }

  return '工具箱'
})
const toolboxPanelEyebrow = computed(() => {
  if (activeToolboxPanel.value === 'appearance') {
    return 'Display'
  }

  if (activeToolboxPanel.value === 'time-clock') {
    return 'Time Clock'
  }

  if (activeToolboxPanel.value === 'current-sales') {
    return 'Current Sales'
  }

  if (activeToolboxPanel.value === 'system-info') {
    return 'System'
  }

  if (activeToolboxPanel.value === 'transactions') {
    return 'Transactions'
  }

  if (activeToolboxPanel.value === 'cash-drawer') {
    return 'Cash Drawer'
  }

  if (activeToolboxPanel.value === 'label-management') {
    return 'Order Labels'
  }

  if (activeToolboxPanel.value === 'device-management') {
    return 'Devices'
  }

  if (activeToolboxPanel.value === 'customer-management') {
    return 'Customers'
  }

  if (activeToolboxPanel.value === 'inventory-management') {
    return 'Inventory'
  }

  return 'Toolbox'
})
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

const floorPlanPayload = (): FloorPlanSettings =>
  normalizeFloorPlanSettings({
    floors: floorLevels.value,
    activeFloorId: activeFloorId.value,
    tables: floorTables.value,
    display: floorDisplayPreferences.value,
    partySizes: floorPartySizes.value,
    waitline: waitlineEntries.value,
  })

const writeFloorPlanCache = (settings: FloorPlanSettings): void => {
  writeStorageValue(floorLevelsStorageKey, settings.floors)
  writeStorageValue(activeFloorStorageKey, settings.activeFloorId)
  writeStorageValue(floorTablesStorageKey, settings.tables)
  writeStorageValue(floorDisplayStorageKey, settings.display)
  writeStorageValue(floorPartyStorageKey, settings.partySizes)
  writeStorageValue(waitlineStorageKey, settings.waitline)
}

const clearFloorPlanPersistTimer = (): void => {
  if (floorPlanPersistTimer !== null) {
    globalThis.clearTimeout(floorPlanPersistTimer)
    floorPlanPersistTimer = null
  }
}

const applyFloorPlanSettings = (settings: FloorPlanSettings): void => {
  const normalizedSettings = normalizeFloorPlanSettings(settings)
  isApplyingRemoteFloorPlanSettings.value = true
  floorLevels.value = normalizedSettings.floors
  activeFloorId.value = normalizedSettings.activeFloorId
  floorTables.value = normalizedSettings.tables
  floorDisplayPreferences.value = normalizedSettings.display
  floorPartySizes.value = normalizedSettings.partySizes
  waitlineEntries.value = normalizedSettings.waitline
  writeFloorPlanCache(normalizedSettings)
  const activeFloorTableIds = new Set(
    normalizedSettings.tables
      .filter((table) => table.floorId === normalizedSettings.activeFloorId)
      .map((table) => table.id),
  )
  if (selectedFloorTableId.value && !activeFloorTableIds.has(selectedFloorTableId.value)) {
    selectedFloorTableId.value = normalizedSettings.tables.find((table) => table.floorId === normalizedSettings.activeFloorId)?.id ?? null
  }
  floorPlanSyncMessage.value = '桌位設定已由資料庫同步'
  globalThis.setTimeout(() => {
    isApplyingRemoteFloorPlanSettings.value = false
  }, 0)
}

const persistFloorPlanSettings = (): void => {
  const payload = floorPlanPayload()
  writeFloorPlanCache(payload)

  if (isApplyingRemoteFloorPlanSettings.value) {
    return
  }

  if (!isPosApiConfigured) {
    floorPlanSyncMessage.value = '已暫存本機；連上 POS API 後才會寫入資料庫'
    return
  }

  clearFloorPlanPersistTimer()
  floorPlanPersistTimer = globalThis.setTimeout(() => {
    floorPlanPersistTimer = null
    void updateAdminSetting<FloorPlanSettings>('floor_plan', payload)
      .then((settings) => {
        const normalizedSettings = normalizeFloorPlanSettings(settings)
        floorPlanSettings.value = normalizedSettings
        floorPlanSyncMessage.value = '桌位、候位與顯示設定已寫入資料庫'
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '同步失敗'
        floorPlanSyncMessage.value = `已暫存本機；資料庫同步失敗：${message}`
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
const quickDispatchSourceFilter = ref<QueueSourceFilter>('all')
const quickDispatchCutoffInput = ref(localDateTimeInputValue(new Date()))
const quickDispatching = ref(false)
const expandedOrderId = ref<string | null>(null)
const swipeState = ref<SwipeState | null>(null)
const openSwipeKey = ref<string | null>(null)
const activeCartQuickEditor = ref<CartQuickEditor>(null)
const activeOptionItem = ref<MenuItem | null>(null)
const activeOptionLineId = ref<string | null>(null)
const optionSelections = ref<Record<MenuOptionGroupId, string[]>>({})
const comboSelections = ref<ComboSelectionMap>({})
const comboOptionSelections = ref<ComboOptionSelectionMap>({})
const optionWarning = ref('')
const manualOptionNote = ref('')
const manualOptionIncrease = ref(0)
const manualOptionDecrease = ref(0)
const optionBaseLabels = ref<string[]>([])
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
const supplyBatchStatusSelection = ref<ProductSupplyStatus | ''>('')
const isSupplyBatchRunning = ref(false)
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
const registerStaffCode = ref('')
const forceCloseRegister = ref(false)
const registerCashAdjustmentKind = ref<RegisterCashAdjustmentKind>('expense')
const registerCashAdjustmentAmount = ref(0)
const registerCashAdjustmentReason = ref('')
const registerCashAdjustmentNote = ref('')
const registerCashAdjustmentReasonPresets = ['備用金', '找零補入', '零用金支出', '食材採買', '外送平台現金', '其他']
let claimClockTimer: number | null = null
let backendEditTapTimer: number | null = null
let toolboxBackendEditLongPressTimer: number | null = null
let appearancePersistTimer: number | null = null
let floorPlanPersistTimer: number | null = null
const floorTableDragState = ref<FloorTableDragState | null>(null)
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

const comboGroupsForProduct = (product: MenuItem): ComboProductGroup[] =>
  (comboProductAssignments.value[product.id] ?? [])
    .map((group) => ({
      ...group,
      choices: group.choices.filter((choice) => {
        const choiceProduct = knownMenuProductById.value.get(choice.productId)
        return Boolean(choiceProduct && productCurrentSupplyStatus(choiceProduct) !== 'stopped')
      }),
    }))
    .filter((group) => group.choices.length > 0)

const activeOptionGroups = computed(() => activeOptionItem.value ? optionGroupsForProduct(activeOptionItem.value) : [])
const activeComboGroups = computed(() => activeOptionItem.value ? comboGroupsForProduct(activeOptionItem.value) : [])
const optionChoiceLabel = (choice: MenuOptionChoice): string =>
  choice.priceDelta ? `${choice.label} +${formatCurrency(choice.priceDelta)}` : choice.label
const manualOptionNotePrefix = '文字註記：'
const manualOptionIncreasePrefix = '手動加價 +'
const manualOptionDecreasePrefix = '手動減價 -'
const manualOptionLabelPrefixes = [manualOptionNotePrefix, manualOptionIncreasePrefix, manualOptionDecreasePrefix]
const labelIsManualOptionAdjustment = (label: string): boolean =>
  manualOptionLabelPrefixes.some((prefix) => label.startsWith(prefix))
const configuredOptionLabelSetForProduct = (product: MenuItem): Set<string> =>
  new Set(optionGroupsForProduct(product).flatMap((group) =>
    group.choices.flatMap((choice) => [choice.label, optionChoiceLabel(choice)]),
  ))
const comboLabelPrefixesForProduct = (product: MenuItem): string[] =>
  comboGroupsForProduct(product).map((group) => `${group.label}:`)
const baseOptionLabelsFromLine = (line: CartLine, product: MenuItem): string[] => {
  const configuredOptionLabels = configuredOptionLabelSetForProduct(product)
  const comboLabelPrefixes = comboLabelPrefixesForProduct(product)

  return line.options.filter((label) =>
    !labelIsManualOptionAdjustment(label) &&
    !configuredOptionLabels.has(label) &&
    !comboLabelPrefixes.some((prefix) => label.startsWith(prefix)),
  )
}
const normalizedManualOptionAmount = (value: number): number =>
  Math.max(0, Math.min(999_999, Math.trunc(Number(value) || 0)))
const normalizedManualOptionNote = computed(() =>
  manualOptionNote.value.trim().replace(/\s+/g, ' ').slice(0, 80),
)
const manualOptionPriceDelta = computed(() =>
  normalizedManualOptionAmount(manualOptionIncrease.value) - normalizedManualOptionAmount(manualOptionDecrease.value),
)
const manualOptionLabels = computed(() => [
  ...(normalizedManualOptionNote.value ? [`${manualOptionNotePrefix}${normalizedManualOptionNote.value}`] : []),
  ...(normalizedManualOptionAmount(manualOptionIncrease.value) > 0
    ? [`${manualOptionIncreasePrefix}${formatCurrency(normalizedManualOptionAmount(manualOptionIncrease.value))}`]
    : []),
  ...(normalizedManualOptionAmount(manualOptionDecrease.value) > 0
    ? [`${manualOptionDecreasePrefix}${formatCurrency(normalizedManualOptionAmount(manualOptionDecrease.value))}`]
    : []),
])
const parseManualOptionAmount = (label: string, prefix: string): number => {
  if (!label.startsWith(prefix)) {
    return 0
  }

  const value = Number(label.slice(prefix.length).replace(/[^\d]/g, ''))
  return Number.isFinite(value) ? normalizedManualOptionAmount(value) : 0
}
const resetManualOptionAdjustments = (): void => {
  manualOptionNote.value = ''
  manualOptionIncrease.value = 0
  manualOptionDecrease.value = 0
}
const setManualOptionAdjustmentsFromLine = (line: CartLine): void => {
  const noteLabel = line.options.find((option) => option.startsWith(manualOptionNotePrefix)) ?? ''
  manualOptionNote.value = noteLabel.slice(manualOptionNotePrefix.length)
  manualOptionIncrease.value = line.options.reduce(
    (total, option) => total + parseManualOptionAmount(option, manualOptionIncreasePrefix),
    0,
  )
  manualOptionDecrease.value = line.options.reduce(
    (total, option) => total + parseManualOptionAmount(option, manualOptionDecreasePrefix),
    0,
  )
}

const selectedComboDetails = computed(() => {
  const entries = activeComboGroups.value.flatMap((group) => {
    const groupSelections = comboSelections.value[group.id] ?? {}
    return Object.entries(groupSelections).flatMap(([productId, quantity]) => {
      const normalizedQuantity = Math.max(0, Math.trunc(Number(quantity) || 0))
      if (normalizedQuantity <= 0) {
        return []
      }

      const choice = group.choices.find((entry) => entry.productId === productId)
      const product = knownMenuProductById.value.get(productId)
      if (!choice || !product) {
        return []
      }
      const optionDetails = comboChoiceOptionDetails(group.id, productId)

      return [{
        item: {
          groupId: group.id,
          groupLabel: group.label,
          productId,
          productSku: product.sku,
          name: product.name,
          quantity: normalizedQuantity,
          priceDelta: choice.priceDelta + optionDetails.priceDelta,
          options: optionDetails.rawLabels,
        },
        displayOptions: optionDetails.labels,
      }]
    })
  })

  const items = entries.map((entry) => entry.item)

  return {
    items,
    labels: entries.map(({ item, displayOptions }) => {
      const quantityLabel = item.quantity > 1 ? ` x${item.quantity}` : ''
      const priceLabel = item.priceDelta ? ` +${formatCurrency(item.priceDelta * item.quantity)}` : ''
      const optionLabel = displayOptions.length > 0 ? `（${displayOptions.join(' / ')}）` : ''
      return `${item.groupLabel}: ${item.name}${optionLabel}${quantityLabel}${priceLabel}`
    }),
    priceDelta: items.reduce((total, item) => total + item.priceDelta * item.quantity, 0),
  }
})

const selectedOptionDetails = computed(() => {
  const selectedChoices = activeOptionGroups.value.flatMap((group) =>
    group.choices.filter((choice) => optionSelections.value[group.id]?.includes(choice.id)),
  )

  return {
    labels: [
      ...optionBaseLabels.value,
      ...selectedChoices.map(optionChoiceLabel),
      ...selectedComboDetails.value.labels,
      ...manualOptionLabels.value,
    ],
    priceDelta:
      selectedChoices.reduce((total, choice) => total + (choice.priceDelta ?? 0), 0) +
      selectedComboDetails.value.priceDelta +
      manualOptionPriceDelta.value,
  }
})
const activeOptionLine = computed(() =>
  activeOptionLineId.value ? cartLines.value.find((line) => line.itemId === activeOptionLineId.value) ?? null : null,
)
const rawPendingOptionUnitPrice = computed(() =>
  activeOptionItem.value ? activeOptionItem.value.price + selectedOptionDetails.value.priceDelta : 0,
)
const pendingOptionUnitPrice = computed(() => Math.max(0, rawPendingOptionUnitPrice.value))
const pendingOptionLineTotal = computed(() => pendingOptionUnitPrice.value * (activeOptionLine.value?.quantity ?? 1))
const ticketDisplayQuantity = computed(() =>
  cartProductTotalQuantity.value +
    (
      activeOptionItem.value &&
        !activeOptionLineId.value &&
        menuItemCountsForProductTotalDisplay(activeOptionItem.value)
        ? 1
        : 0
    ),
)
const ticketDisplayTotal = computed(() => {
  if (activeOptionItem.value && activeOptionLine.value) {
    return cartTotal.value - (activeOptionLine.value.unitPrice * activeOptionLine.value.quantity) + pendingOptionLineTotal.value
  }

  return cartTotal.value + (activeOptionItem.value ? pendingOptionLineTotal.value : 0)
})
const activeWorkspaceTitle = computed(() => workspaceTabLabels[activeWorkspaceTab.value])
const showInternalHeaderControls = computed(() => !isConsumerDomain && activeView.value !== 'online' && activeView.value !== 'reservation')
const canSwitchWorkspace = computed(() => showInternalHeaderControls.value && !isNativeApp)
const pageTitle = computed(() => {
  if (activeView.value === 'online') {
    return '線上點餐'
  }
  if (activeView.value === 'reservation') {
    return '線上訂位'
  }

  return isNativeApp ? '平板工作站' : '門市 POS'
})
const pageSubtitle = computed(() => {
  if (activeView.value === 'online') {
    return '線上菜單 · 自取訂單 · 門市接單'
  }
  if (activeView.value === 'reservation') {
    return '專屬訂位網站 · 訂位規則 · 門市控場'
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
const registerCashAdjustmentNet = computed(() =>
  (registerSession.value?.cashAdjustmentIncome ?? 0) - (registerSession.value?.cashAdjustmentExpense ?? 0),
)
const registerCashAdjustments = computed(() => registerSession.value?.cashAdjustments ?? [])
const cashDrawerDevices = computed(() =>
  engagementSettings.value.hardwareDevices.filter((device) => device.kind === 'cash-drawer'),
)
const activeCashDrawerDevice = computed(() =>
  cashDrawerDevices.value.find((device) => device.enabled) ?? cashDrawerDevices.value[0] ?? null,
)
const cashDrawerTargetStation = computed<PrintStationSetting | null>(() => {
  const targetStationId = activeCashDrawerDevice.value?.targetStationId ?? ''
  return printerSettings.value.stations.find((station) => station.id === targetStationId)
    ?? printerSettings.value.stations.find((station) => station.enabled)
    ?? null
})
const cashDrawerRecentEvents = computed(() => cashDrawerEvents.value.slice(0, 8))
const cashDrawerRecentAdjustments = computed(() => registerCashAdjustments.value.slice(0, 5))
const cashDrawerSummary = computed(() => {
  const latestEvent = cashDrawerEvents.value[0]
  return latestEvent
    ? `${cashDrawerEvents.value.length} 筆開啟紀錄 · 最近 ${formatOrderTime(latestEvent.createdAt)}`
    : `${cashDrawerDevices.value.length} 個錢櫃裝置 · 尚無開啟紀錄`
})
const unprintedPrintJobs = computed(() =>
  orderQueue.value.flatMap((order) =>
    order.printJobs
      .filter((printJob) => printJob.status === 'queued' || printJob.status === 'failed')
      .map((printJob) => ({ orderId: order.id, printJob })),
  ),
)
const deviceManagementSummary = computed(() =>
  `${printerSettings.value.stations.length} 出單機 · ${engagementSettings.value.hardwareDevices.length} 外設 · ${unprintedPrintJobs.value.length} 未印出`,
)
const deviceKindLabel = (kind: string): string => {
  if (kind === 'bluetooth-scanner') {
    return '掃碼裝置'
  }

  if (kind === 'payment-qr') {
    return '行動支付掃碼'
  }

  if (kind === 'cash-drawer') {
    return '錢櫃'
  }

  if (kind === 'ipad-qr-print') {
    return '指定 iPad 列印 QR code'
  }

  return kind
}
const cashDrawerDeliveryLabel = (status: 'sent' | 'preview' | 'failed'): string => {
  if (status === 'sent') {
    return '已送出'
  }

  if (status === 'failed') {
    return '硬體失敗'
  }

  return '預覽記錄'
}

const paymentMethodOpensCashDrawer = (method: PaymentMethod): boolean =>
  onlineOrderingSettings.value.paymentMethods.find((entry) => entry.id === method)?.opensCashDrawer ?? method === 'cash'

const orderOpensCashDrawerOnCheckout = (order: PosOrder): boolean => {
  if (order.paymentBreakdown.length > 0) {
    return order.paymentBreakdown.some((payment) =>
      payment.amount > 0 && paymentMethodOpensCashDrawer(payment.paymentMethod),
    )
  }

  if (order.paymentSplits.length > 0) {
    return order.paymentSplits.some((split) =>
      split.amount > 0 && paymentMethodOpensCashDrawer(split.paymentMethod),
    )
  }

  return paymentMethodOpensCashDrawer(order.paymentMethod)
}

const openCashDrawerForCheckout = async (order: PosOrder): Promise<void> => {
  if (!orderOpensCashDrawerOnCheckout(order)) {
    return
  }

  try {
    const event = await openCashDrawerForStation({
      reason: `結帳開啟 ${order.id}`,
      deviceId: activeCashDrawerDevice.value?.id ?? '',
      targetStationId: cashDrawerTargetStation.value?.id ?? activeCashDrawerDevice.value?.targetStationId ?? '',
    })
    cashDrawerActionMessage.value = `${cashDrawerDeliveryLabel(event.deliveryStatus)} · ${formatOrderTime(event.createdAt)}`
  } catch (error) {
    cashDrawerActionMessage.value = `自動開錢櫃失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  }
}

const collectOrderPaymentAction = async (
  order: PosOrder,
  options: { skipVerification?: boolean } = {},
): Promise<void> => {
  if (!options.skipVerification && !(await verifyProtectedPermissions([
    {
      permission: 'checkoutOrders',
      title: accessPermissionLabels.checkoutOrders,
      detail: `${compactOrderId(order.id)} 標記已收款前需驗證員工識別碼。`,
    },
  ]))) {
    return
  }

  await updatePaymentStatus(order.id, 'paid')
  const paidOrder = orderQueue.value.find((entry) => entry.id === order.id) ?? order
  if (paidOrder.paymentStatus === 'paid') {
    await openCashDrawerForCheckout(paidOrder)
  }
}

const workspaceTabSummaries = computed<Record<WorkspaceTab, string>>(() => ({
  floor: `${activeDineInOrders.value.length} 桌內用 · ${floorLevels.value.length} 樓層`,
  order: cartQuantity.value > 0 ? `${cartProductTotalQuantity.value} 件` : '菜單與購物車',
  details: `${serviceModeLabels[serviceMode.value]} · ${customer.name || '現場客'}`,
  payment: paymentLabels[paymentMethod.value],
  queue: queueFulfillmentAlert.value.count > 0 ? `${queueFulfillmentAlert.value.count} 張到點` : `${pendingOrders.value.length} 待處理`,
  reservations: lateReservationCount.value > 0 ? `${lateReservationCount.value} 筆遲到` : `${todayReservationCount.value} 筆今日訂位`,
  printing: printStation.online ? '列印在線' : '列印離線',
  closeout: closeoutPreflightBlockingCount.value > 0 ? `${closeoutPreflightBlockingCount.value} 項待處理` : registerStatusLabel.value,
}))
const activeFloor = computed(() =>
  floorLevels.value.find((floor) => floor.id === activeFloorId.value) ?? floorLevels.value[0] ?? defaultFloorPlanSettingsValue.floors[0],
)
const activeFloorLabel = computed(() => activeFloor.value?.label ?? '1F')
const salesPeriodStart = computed(() => {
  const openedAt = registerSession.value?.status === 'open' ? new Date(registerSession.value.openedAt) : null
  if (openedAt && Number.isFinite(openedAt.getTime())) {
    return openedAt
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return todayStart
})
const currentSalesPeriodLabel = computed(() =>
  registerSession.value?.status === 'open'
    ? `${formatOrderTime(registerSession.value.openedAt)} 起`
    : '今日 00:00 起',
)
const currentSalesOrders = computed(() => {
  const startTime = salesPeriodStart.value.getTime()

  return orderQueue.value.filter((order) => {
    if (order.status === 'failed' || order.status === 'voided') {
      return false
    }

    const createdAt = new Date(order.createdAt).getTime()
    return Number.isFinite(createdAt) && createdAt >= startTime
  })
})
const currentSalesPendingOrders = computed(() =>
  currentSalesOrders.value.filter((order) => order.paymentStatus === 'pending'),
)
const currentSalesPaidOrders = computed(() =>
  currentSalesOrders.value.filter((order) => order.paymentStatus === 'paid' || order.paymentStatus === 'authorized'),
)
const sumOrderTotals = (orders: PosOrder[]): number =>
  orders.reduce((total, order) => total + Math.max(0, Number(order.subtotal) || 0), 0)
const currentSalesPendingTotal = computed(() =>
  registerSession.value?.status === 'open'
    ? registerSession.value.pendingTotal
    : sumOrderTotals(currentSalesPendingOrders.value),
)
const currentSalesPaidTotal = computed(() =>
  registerSession.value?.status === 'open'
    ? registerSession.value.cashSales + registerSession.value.nonCashSales
    : sumOrderTotals(currentSalesPaidOrders.value),
)
const currentSalesIssueCount = computed(() =>
  currentSalesOrders.value.filter((order) => order.paymentStatus === 'expired' || order.paymentStatus === 'failed').length,
)
const currentSalesMetrics = computed<CurrentSalesMetric[]>(() => [
  {
    label: '未結帳金額',
    value: formatCurrency(currentSalesPendingTotal.value),
    detail: `${currentSalesPendingOrders.value.length} 張待收 · 服務費/折抵已含入訂單金額`,
    tone: currentSalesPendingOrders.value.length > 0 ? 'warning' : 'neutral',
  },
  {
    label: '已結帳金額',
    value: formatCurrency(currentSalesPaidTotal.value),
    detail: `${currentSalesPaidOrders.value.length} 張已付款/已授權`,
    tone: 'success',
  },
  {
    label: '餐期訂單',
    value: `${currentSalesOrders.value.length} 張`,
    detail: `${currentSalesIssueCount.value} 張付款異常 · ${closeoutVoidedOrders.value.length} 張作廢已排除`,
    tone: currentSalesIssueCount.value > 0 ? 'warning' : 'neutral',
  },
])
const currentSalesModeRows = computed(() =>
  serviceModeValues.map((mode) => {
    const matchingOrders = currentSalesOrders.value.filter((order) => order.mode === mode)
    const paidTotal = sumOrderTotals(matchingOrders.filter((order) => order.paymentStatus === 'paid' || order.paymentStatus === 'authorized'))
    const pendingTotal = sumOrderTotals(matchingOrders.filter((order) => order.paymentStatus === 'pending'))

    return {
      mode,
      label: serviceModeLabels[mode],
      count: matchingOrders.length,
      paidTotal,
      pendingTotal,
    }
  })
)
const currentSalesSummary = computed(() =>
  `餐期 ${currentSalesPeriodLabel.value} · 已結 ${formatCurrency(currentSalesPaidTotal.value)} · 未結 ${formatCurrency(currentSalesPendingTotal.value)}`,
)
const enabledPrinterRuleCount = computed(() => printerSettings.value.rules.filter((rule) => rule.enabled).length)
const enabledPrinterStationCount = computed(() => printerSettings.value.stations.filter((station) => station.enabled).length)
const systemInfoItems = computed<SystemInfoItem[]>(() => [
  {
    label: '運行平台',
    value: isNativeApp ? `Tablet APK · ${Capacitor.getPlatform()}` : 'Web 工作站',
    detail: isNativeApp ? 'Android WebView / Capacitor' : globalThis.location?.host || 'local',
  },
  {
    label: 'POS API',
    value: backendStatus.label,
    detail: backendStatus.detail || '等待下一次同步',
  },
  {
    label: '工作站',
    value: stationClaimLabel,
    detail: stationHeartbeatMessage.value,
  },
  {
    label: '線上接單',
    value: onlineOrderingSettings.value.enabled ? '開啟' : '暫停',
    detail: `${onlineOrderingSettings.value.acceptanceRequired ? '需接單確認' : '自動入單'} · 提醒 ${onlineOrderingSettings.value.soundEnabled ? '開' : '關'}`,
  },
  {
    label: '桌位圖',
    value: `${floorLevels.value.length} 樓 · ${floorTables.value.length} 桌`,
    detail: `目前 ${activeFloorLabel.value} · 候位 ${waitlineEntries.value.length} 組`,
  },
  {
    label: '列印站',
    value: `${enabledPrinterStationCount.value} 台啟用 · ${enabledPrinterRuleCount.value} 條規則`,
    detail: `${printStation.online ? '目前在線' : '目前離線'} · ${printStation.host}:${printStation.port}`,
  },
  {
    label: '商品供應',
    value: `${menuCatalog.value.length} 商品 · ${availableStationProducts.value} 可售`,
    detail: `${stoppedStationProducts.value} 項暫停 · ${productStatusCatalog.value.length} 項可遠端管理`,
  },
  {
    label: '班別',
    value: registerStatusLabel.value,
    detail: registerSession.value
      ? `預期現金 ${formatCurrency(registerSession.value.expectedCash)} · ${queueHealth.value}`
      : '尚未開班，營業概況改用今日訂單估算',
  },
])
const activeFloorTables = computed(() => floorTables.value.filter((table) => table.floorId === activeFloorId.value))
const floorLabelForTable = (table: DiningTableDefinition): string =>
  floorLevels.value.find((floor) => floor.id === table.floorId)?.label ?? activeFloorLabel.value
const floorNoteToken = (floorLabel: string): string => `樓層 ${floorLabel}`
const tableNoteToken = (tableLabel: string): string => `桌位 ${tableLabel}`
const tableIdFromOrder = (order: PosOrder): string | null => {
  const floorMatch = order.note.match(/樓層\s*([^、，,]+)/i)
  const tableMatch = order.note.match(/桌位\s*([^、，,]+)/i)
  const nameMatch = order.customerName.match(/(?:^|\s)([A-Z]\d+)\b/i)
  const tableLabel = (tableMatch?.[1] ?? nameMatch?.[1] ?? '').trim().toUpperCase()
  if (!tableLabel) {
    return null
  }

  const floorLabel = floorMatch?.[1]?.trim()
  if (floorLabel) {
    const floor = floorLevels.value.find((entry) =>
      entry.id.toUpperCase() === floorLabel.toUpperCase() ||
      entry.label.toUpperCase() === floorLabel.toUpperCase(),
    )
    const table = floorTables.value.find((entry) => entry.floorId === floor?.id && entry.label.toUpperCase() === tableLabel)
    if (table) {
      return table.id
    }
  }

  const matchingTables = floorTables.value.filter((table) => table.label.toUpperCase() === tableLabel)
  if (matchingTables.length === 1) {
    return matchingTables[0]?.id ?? null
  }

  return matchingTables.find((table) => table.floorId === activeFloorId.value)?.id ?? matchingTables[0]?.id ?? null
}
const tableLabelFromOrder = (order: PosOrder): string => {
  const tableId = tableIdFromOrder(order)
  const table = tableId ? floorTables.value.find((entry) => entry.id === tableId) : null
  if (!table) {
    return '-'
  }

  const floor = floorLevels.value.find((entry) => entry.id === table.floorId)
  return floor ? `${floor.label} ${table.label}` : table.label
}
const normalizeTransactionSearch = (value: string): string => value.trim().toLowerCase()
const transactionSearchPlaceholder = computed(() =>
  transactionSearchOptions.find((option) => option.value === transactionSearchCriterion.value)?.placeholder ?? '',
)
const transactionSearchHaystack = (order: PosOrder): string[] => {
  const compactId = compactOrderId(order.id)
  const tableLabel = tableLabelFromOrder(order)
  const common = [
    order.id,
    compactId,
    order.remoteId ?? '',
    order.customerName,
    order.customerPhone,
    order.note,
  ]

  if (transactionSearchCriterion.value === 'receipt') {
    return [...common, `#-${orderSequenceLabel(order.id).padStart(8, '0')}`]
  }

  if (transactionSearchCriterion.value === 'carrier') {
    return [order.invoiceCarrierBarcode, order.taxId, order.couponCode, order.note]
  }

  if (transactionSearchCriterion.value === 'table') {
    return [tableLabel, tableLabel.replace(/\s+/g, ''), order.note, order.customerName]
  }

  return [...common, orderSequenceLabel(order.id)]
}
const transactionSearchMatches = (order: PosOrder): boolean => {
  const keyword = normalizeTransactionSearch(transactionSearchTerm.value)
  if (!keyword) {
    return true
  }

  return transactionSearchHaystack(order).some((value) => normalizeTransactionSearch(value).includes(keyword))
}
const transactionLookupRows = computed(() =>
  [...orderQueue.value]
    .filter(transactionSearchMatches)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 80),
)
const selectedTransactionOrder = computed(() => {
  if (selectedTransactionOrderId.value) {
    const selected = transactionLookupRows.value.find((order) => order.id === selectedTransactionOrderId.value)
    if (selected) {
      return selected
    }
  }

  return transactionLookupRows.value[0] ?? null
})
const selectTransactionOrder = (order: PosOrder): void => {
  selectedTransactionOrderId.value = order.id
  transactionLookupMessage.value = `${compactOrderId(order.id)} 已載入交易預覽`
}
const transactionReceiptLabel = (order: PosOrder): string =>
  orderSequenceLabel(order.id) === '新單'
    ? compactOrderId(order.id)
    : `#-${orderSequenceLabel(order.id).padStart(8, '0')}`
const transactionLookupSummary = computed(() =>
  `${transactionLookupRows.value.length} 筆交易 · ${transactionSearchOptions.find((option) => option.value === transactionSearchCriterion.value)?.label ?? '查詢'}`,
)
const activeDineInOrders = computed(() =>
  orderQueue.value.filter((order) => order.mode === 'dine-in' && orderIsOpenForFulfillment(order)),
)
const dineInOrderForTable = (tableId: string): PosOrder | null =>
  activeDineInOrders.value.find((order) => tableIdFromOrder(order) === tableId) ?? null
const elapsedMinutesSince = (timestamp: string | null): number => {
  if (!timestamp) {
    return 0
  }

  const startedAt = new Date(timestamp).getTime()
  if (!Number.isFinite(startedAt)) {
    return 0
  }

  return Math.max(0, Math.floor((currentTime.value - startedAt) / 60_000))
}
const elapsedMinuteLabel = (timestamp: string | null): string => `${elapsedMinutesSince(timestamp)} min`
const partySizeForTable = (table: DiningTableDefinition, order: PosOrder | null): number => {
  if (!order) {
    return 0
  }

  const storedSize = floorPartySizes.value[table.id]
  return Math.min(table.capacity, Math.max(1, Math.trunc(Number(storedSize) || 1)))
}
const floorTableStates = computed<FloorTableState[]>(() =>
  activeFloorTables.value.map((table) => {
    const order = dineInOrderForTable(table.id)
    const isLocked = Boolean(order && orderClaimedByOtherStation(order))
    const status: FloorTableState['status'] = !order
      ? 'empty'
      : isLocked
        ? 'locked'
        : order.status === 'ready'
          ? 'ready'
          : 'active'

    return {
      table,
      order,
      partySize: partySizeForTable(table, order),
      status,
      amountLabel: order ? formatCurrency(order.subtotal) : formatCurrency(0),
      orderLabel: order ? orderSequenceLabel(order.id) : '',
      peopleLabel: `${partySizeForTable(table, order)}/${table.capacity}`,
      waitLabel: order ? elapsedMinuteLabel(order.createdAt) : '0 min',
      stayLabel: order ? elapsedMinuteLabel(order.createdAt) : '0 min',
    }
  }),
)
const selectedFloorTable = computed(() =>
  floorTableStates.value.find((state) => state.table.id === selectedFloorTableId.value) ?? floorTableStates.value[0] ?? null,
)
const emptyFloorTableStates = computed(() =>
  floorTableStates.value.filter((state) => state.status === 'empty'),
)
const activeFloorOrderCount = computed(() => floorTableStates.value.filter((state) => state.order).length)
const reservationRange = computed(() => {
  const selected = localDateFromKey(reservationSelectedDate.value)
  if (reservationViewMode.value === 'week') {
    const start = addLocalDays(selected, -selected.getDay())
    const end = addLocalDays(start, 7)
    return { start, end }
  }
  if (reservationViewMode.value === 'month') {
    const start = new Date(selected.getFullYear(), selected.getMonth(), 1)
    const end = new Date(selected.getFullYear(), selected.getMonth() + 1, 1)
    return { start, end }
  }

  return { start: selected, end: addLocalDays(selected, 1) }
})
const reservationRangeLabel = computed(() => {
  const start = reservationRange.value.start
  const end = addLocalDays(reservationRange.value.end, -1)
  if (reservationViewMode.value === 'day') {
    return start.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' })
  }

  return `${start.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} - ${end.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}`
})
const reservationAssignableTables = computed(() =>
  [...floorTables.value].sort((first, second) => {
    const floorCompare = floorLabelForTable(first).localeCompare(floorLabelForTable(second), 'zh-TW')
    return floorCompare || first.label.localeCompare(second.label, 'zh-TW', { numeric: true })
  }),
)
const tableByReservationId = computed(() =>
  new Map(floorTables.value.map((table) => [table.id, table])),
)
const tableLabelForReservationId = (tableId: string): string => {
  const table = tableByReservationId.value.get(tableId)
  return table ? `${floorLabelForTable(table)} ${table.label}` : tableId
}
const reservationAssignedTables = (reservation: PosReservation): DiningTableDefinition[] =>
  reservation.assignedTableIds.flatMap((tableId) => {
    const table = tableByReservationId.value.get(tableId)
    return table ? [table] : []
  })
const reservationTableLabel = (reservation: PosReservation): string =>
  reservation.assignedTableIds.length > 0
    ? reservation.assignedTableIds.map(tableLabelForReservationId).join(' / ')
    : '未排桌'
const reservationDateKey = (reservation: PosReservation): string | null => {
  const date = new Date(reservation.reservedAt)
  return Number.isFinite(date.getTime()) ? formatDateKey(date) : null
}
const compactDateKeyToDashed = (dateKey: string): string =>
  dateKey.length === 8 ? `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}` : dateKey
const reservationSpecialRulesForDateKey = (dateKey: string) => {
  const dashedDateKey = compactDateKeyToDashed(dateKey)
  return engagementSettings.value.reservationWebsite.specialDates.filter((rule) =>
    rule.startDate <= dashedDateKey && rule.endDate >= dashedDateKey,
  )
}
const reservationSpecialDateLabelForDateKey = (dateKey: string): string => {
  const rules = reservationSpecialRulesForDateKey(dateKey)
  const closedRule = rules.find((rule) => rule.mode === 'closed')
  if (closedRule) {
    return closedRule.label || '不開放訂位'
  }
  const customRule = rules.find((rule) => rule.mode === 'custom-hours')
  return customRule ? (customRule.label || '特殊訂位日') : ''
}
const reservationSpecialDateLabel = (reservation: PosReservation): string => {
  const dateKey = reservationDateKey(reservation)
  return dateKey ? reservationSpecialDateLabelForDateKey(dateKey) : ''
}
const reservationTimestamp = (reservation: PosReservation): number => {
  const timestamp = new Date(reservation.reservedAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}
const reservationWindow = (reservation: PosReservation): { start: number; end: number } => {
  const start = reservationTimestamp(reservation)
  const durationMinutes = Math.max(15, engagementSettings.value.reservationWebsite.durationMinutes || 120)
  const holdMinutes = Math.max(0, engagementSettings.value.reservationWebsite.seatHoldMinutes || 0)
  return { start, end: start + (durationMinutes + holdMinutes) * 60 * 1000 }
}
const reservationWindowsOverlap = (first: PosReservation, second: PosReservation): boolean => {
  const firstWindow = reservationWindow(first)
  const secondWindow = reservationWindow(second)
  return firstWindow.start < secondWindow.end && secondWindow.start < firstWindow.end
}
const reservationAwaitingGuest = (reservation: PosReservation): boolean =>
  reservationAwaitingGuestStatuses.includes(reservation.status)
const reservationUsesCapacity = (reservation: PosReservation): boolean =>
  reservationCapacityStatuses.includes(reservation.status)
const activeReservableReservations = computed(() =>
  posReservations.value.filter(reservationUsesCapacity),
)
const reservationWarnings = (reservation: PosReservation): string[] => {
  const warnings: string[] = []
  const tables = reservationAssignedTables(reservation)
  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0)
  if (reservationAwaitingGuest(reservation) && reservationIsLate(reservation)) {
    warnings.push('遲到')
  }
  if (!reservationUsesCapacity(reservation)) {
    return warnings
  }
  if (reservation.assignedTableIds.length === 0) {
    warnings.push('未排桌')
  } else if (totalCapacity > 0 && totalCapacity < reservation.partySize) {
    warnings.push('座位數不足')
  }
  const tableIds = new Set(reservation.assignedTableIds)
  const hasOverlap = activeReservableReservations.value.some((candidate) =>
    candidate.id !== reservation.id &&
    candidate.assignedTableIds.some((tableId) => tableIds.has(tableId)) &&
    reservationWindowsOverlap(reservation, candidate),
  )
  if (hasOverlap) {
    warnings.push('桌位重疊')
  }
  return warnings
}
const reservationTone = (reservation: PosReservation): string => {
  const warnings = reservationWarnings(reservation)
  if (reservation.status === 'cancelled' || reservation.status === 'no_show') {
    return 'muted'
  }
  if (warnings.includes('遲到') || warnings.includes('桌位重疊')) {
    return 'danger'
  }
  if (warnings.length > 0) {
    return 'warning'
  }
  if (reservation.status === 'seated' || reservation.status === 'confirmed') {
    return 'success'
  }
  return 'neutral'
}
const reservationIsLate = (reservation: PosReservation): boolean => {
  if (!reservationAwaitingGuest(reservation)) {
    return false
  }
  const holdMinutes = Math.max(0, engagementSettings.value.reservationWebsite.seatHoldMinutes || 0)
  return reservationTimestamp(reservation) + holdMinutes * 60 * 1000 < currentTime.value
}
const reservationCanCheckIn = (reservation: PosReservation): boolean =>
  reservationAwaitingGuest(reservation) &&
  reservationTimestamp(reservation) - reservationCheckInLeadMs <= currentTime.value
const visibleReservations = computed(() => {
  const start = reservationRange.value.start.getTime()
  const end = reservationRange.value.end.getTime()
  return posReservations.value
    .filter((reservation) => {
      const timestamp = reservationTimestamp(reservation)
      return timestamp >= start && timestamp < end
    })
    .filter((reservation) => reservationStatusFilter.value === 'all' || reservation.status === reservationStatusFilter.value)
    .sort((first, second) => reservationTimestamp(first) - reservationTimestamp(second))
})
const reservationSummaryRows = computed(() => {
  const buckets = new Map<string, { dateKey: string; count: number; people: number; seated: number; late: number; specialLabel: string }>()
  for (const reservation of visibleReservations.value) {
    const dateKey = reservationDateKey(reservation)
    if (!dateKey) {
      continue
    }
    const current = buckets.get(dateKey) ?? {
      dateKey,
      count: 0,
      people: 0,
      seated: 0,
      late: 0,
      specialLabel: reservationSpecialDateLabelForDateKey(dateKey),
    }
    current.count += 1
    current.people += reservation.partySize
    current.seated += reservation.status === 'seated' ? 1 : 0
    current.late += reservationIsLate(reservation) ? 1 : 0
    buckets.set(dateKey, current)
  }
  return [...buckets.values()].sort((first, second) => first.dateKey.localeCompare(second.dateKey))
})
const todayReservationCount = computed(() => {
  const todayKey = formatDateKey(new Date(currentTime.value))
  return posReservations.value.filter((reservation) => reservationDateKey(reservation) === todayKey && reservationAwaitingGuest(reservation)).length
})
const lateReservationCount = computed(() => posReservations.value.filter(reservationIsLate).length)
const nextReservationsByTableId = computed(() => {
  const nextMap = new Map<string, PosReservation>()
  const upcoming = posReservations.value
    .filter((reservation) => reservationAwaitingGuest(reservation) && reservationTimestamp(reservation) >= currentTime.value)
    .sort((first, second) => reservationTimestamp(first) - reservationTimestamp(second))
  for (const reservation of upcoming) {
    for (const tableId of reservation.assignedTableIds) {
      if (!nextMap.has(tableId)) {
        nextMap.set(tableId, reservation)
      }
    }
  }
  return nextMap
})
const nextReservationForTable = (tableId: string): PosReservation | null =>
  nextReservationsByTableId.value.get(tableId) ?? null
const selectedReservationEdit = computed(() =>
  selectedReservationEditId.value
    ? posReservations.value.find((reservation) => reservation.id === selectedReservationEditId.value) ?? null
    : null,
)
const waitlinePeopleCount = computed(() =>
  waitlineEntries.value.reduce((total, entry) => total + entry.partySize, 0),
)
const averageWaitlineMinutes = computed(() => {
  if (waitlineEntries.value.length === 0) {
    return 0
  }

  const totalMinutes = waitlineEntries.value.reduce((total, entry) => total + elapsedMinutesSince(entry.createdAt), 0)
  return Math.round(totalMinutes / waitlineEntries.value.length)
})
const floorNotificationItems = computed<PosNotificationItem[]>(() => [
  {
    id: 'display-controls',
    title: '桌位顯示設定',
    summary: '可切換人數、未出單等待、桌內滯留、候位等待與訂單標籤顯示。',
    dateLabel: 'iCHEF 對照',
    target: 'floor',
  },
  {
    id: 'takeout-flow',
    title: '外帶 / 外送訂單中心',
    summary: '外帶外送以搜尋、今日/較舊、取餐方式與取餐/送達時間排序管理，不預設人數。',
    dateLabel: 'iCHEF 對照',
    target: 'queue',
  },
  {
    id: 'supply-statuses',
    title: '正常供應 / 線上停售 / 全部停售',
    summary: '今日訂單停售會阻擋現場加入，線上停售只隱藏線上入口。',
    dateLabel: '供應狀態',
    target: 'supply',
  },
  {
    id: 'print-and-checkout',
    title: '出單與結帳分離',
    summary: '訂單可結帳出單、只出單或結帳不出單，列印異常在列印站追蹤。',
    dateLabel: '工作流',
    target: 'printing',
  },
])
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

const registerCashAdjustmentClass = (kind: RegisterCashAdjustmentKind): string =>
  kind === 'income' ? 'cash-adjustment-row--income' : 'cash-adjustment-row--expense'

const statusClass = (status: OrderStatus): string => `status-chip--${status}`

const lineQuantityByItem = (itemId: string): number =>
  cartLines.value
    .filter((line) => line.itemId === itemId || line.productId === itemId)
    .reduce((total, line) => total + line.quantity, 0)

const productRequiresOptions = (item: MenuItem): boolean =>
  optionGroupsForProduct(item).length > 0 || comboGroupsForProduct(item).length > 0
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

const deleteOrderItemPermissionStep = (detail = '刪除訂單品項前需驗證員工識別碼。'): ProtectedPermissionStep => ({
  permission: 'deleteOrderItems',
  title: accessPermissionLabels.deleteOrderItems,
  detail,
})

const setProductQuantityAction = async (item: MenuItem, quantity: number): Promise<void> => {
  const currentQuantity = cartLines.value.find((line) => line.itemId === item.id)?.quantity ?? 0
  if (currentQuantity > 0 && quantity <= 0) {
    const verified = await verifyProtectedPermissions([
      deleteOrderItemPermissionStep(`從目前票券刪除「${item.name}」前需驗證員工識別碼。`),
    ])
    if (!verified) {
      return
    }
  }

  setItemQuantity(item, quantity)
}

const decreaseProductLineAction = async (item: MenuItem): Promise<void> => {
  await setProductQuantityAction(item, Math.max(0, lineQuantityByItem(item.id) - 1))
}

const updateProductQuantityInput = (item: MenuItem, event: Event): void => {
  const quantity = quantityFromInput(event)
  if (quantity === null) {
    return
  }

  void setProductQuantityAction(item, quantity)
}

const commitProductQuantityInput = (item: MenuItem, event: Event): void => {
  void setProductQuantityAction(item, committedQuantityFromInput(event))
}

const setCartLineQuantityAction = async (itemId: string, quantity: number): Promise<void> => {
  const line = cartLines.value.find((entry) => entry.itemId === itemId)
  if (line && line.quantity > 0 && quantity <= 0) {
    const verified = await verifyProtectedPermissions([
      deleteOrderItemPermissionStep(`從目前票券刪除「${line.name}」前需驗證員工識別碼。`),
    ])
    if (!verified) {
      return
    }
  }

  setLineQuantity(itemId, quantity)
}

const decreaseCartLineAction = async (itemId: string): Promise<void> => {
  const line = cartLines.value.find((entry) => entry.itemId === itemId)
  if (!line) {
    return
  }

  await setCartLineQuantityAction(itemId, line.quantity - 1)
}

const updateCartQuantityInput = (itemId: string, event: Event): void => {
  const quantity = quantityFromInput(event)
  if (quantity === null) {
    return
  }

  void setCartLineQuantityAction(itemId, quantity)
}

const commitCartQuantityInput = (itemId: string, event: Event): void => {
  void setCartLineQuantityAction(itemId, committedQuantityFromInput(event))
}

const blurQuantityInput = (event: KeyboardEvent): void => {
  if (event.target instanceof HTMLInputElement) {
    event.target.blur()
  }
}

const resetOptionSelections = (): void => {
  optionSelections.value = {}
  comboSelections.value = {}
  comboOptionSelections.value = {}
  optionBaseLabels.value = []
  resetManualOptionAdjustments()
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

const clearTicketDraft = async (): Promise<void> => {
  if (cartLines.value.length > 0 && !(await verifyProtectedPermissions([
    deleteOrderItemPermissionStep('清空目前票券會刪除所有品項，需驗證員工識別碼。'),
  ]))) {
    return
  }

  clearCart()
  closeOptionPanel()
}

const activeTicketAction = ref<TicketAction | null>(null)

const ticketActionDisabled = (): boolean =>
  (cartLines.value.length === 0 && !activeOptionItem.value) ||
  Boolean(activeTicketAction.value) ||
  isSubmitting.value ||
  !paymentBreakdownValid.value

const optionSelectionsFromLabels = (labels: string[]): Record<MenuOptionGroupId, string[]> => {
  const lineOptions = new Set(labels)

  return Object.fromEntries(optionGroupCatalog.value.map((group) => [
    group.id,
    group.choices
      .filter((choice) => lineOptions.has(optionChoiceLabel(choice)) || lineOptions.has(choice.label))
      .map((choice) => choice.id),
  ])) as Record<MenuOptionGroupId, string[]>
}

const optionSelectionsFromLine = (line: CartLine): Record<MenuOptionGroupId, string[]> =>
  optionSelectionsFromLabels(line.options)

const comboSelectionsFromLine = (line: CartLine): ComboSelectionMap =>
  (line.comboItems ?? []).reduce<ComboSelectionMap>((selections, item) => {
    selections[item.groupId] = {
      ...(selections[item.groupId] ?? {}),
      [item.productId]: item.quantity,
    }
    return selections
  }, {})

const comboOptionSelectionsFromLine = (line: CartLine): ComboOptionSelectionMap =>
  (line.comboItems ?? []).reduce<ComboOptionSelectionMap>((selections, item) => {
    if (!item.options || item.options.length === 0) {
      return selections
    }

    selections[item.groupId] = {
      ...(selections[item.groupId] ?? {}),
      [item.productId]: optionSelectionsFromLabels(item.options),
    }
    return selections
  }, {})

const menuItemForLine = (line: CartLine): MenuItem | null =>
  menuCatalog.value.find((item) => item.id === line.productId || item.id === line.itemId || item.sku === line.productSku) ?? null

const lineRequiresOptions = (line: CartLine): boolean => {
  const item = menuItemForLine(line)
  return Boolean(item)
}

const editCartLineOptions = (line: CartLine): void => {
  const item = menuItemForLine(line)
  if (!item) {
    return
  }

  activeCartQuickEditor.value = null
  activeOptionItem.value = item
  activeOptionLineId.value = line.itemId
  optionSelections.value = optionSelectionsFromLine(line)
  comboSelections.value = comboSelectionsFromLine(line)
  comboOptionSelections.value = comboOptionSelectionsFromLine(line)
  optionBaseLabels.value = baseOptionLabelsFromLine(line, item)
  setManualOptionAdjustmentsFromLine(line)
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

const comboChoiceQuantity = (group: ComboProductGroup, productId: string): number =>
  comboSelections.value[group.id]?.[productId] ?? 0

const comboGroupSelectedCount = (group: ComboProductGroup): number =>
  Object.values(comboSelections.value[group.id] ?? {}).reduce((total, quantity) => total + Math.max(0, Math.trunc(quantity)), 0)

const comboChoiceProduct = (productId: string): MenuItem | null =>
  knownMenuProductById.value.get(productId) ?? null

const comboOptionGroupsForProduct = (productId: string): MenuOptionGroup[] => {
  const product = comboChoiceProduct(productId)
  return product ? optionGroupsForProduct(product) : []
}

const comboOptionSelected = (
  comboGroupId: string,
  productId: string,
  group: MenuOptionGroup,
  choice: MenuOptionChoice,
): boolean =>
  comboOptionSelections.value[comboGroupId]?.[productId]?.[group.id]?.includes(choice.id) ?? false

const comboChoiceOptionDetails = (comboGroupId: string, productId: string): { labels: string[]; rawLabels: string[]; priceDelta: number } => {
  const groupSelections = comboOptionSelections.value[comboGroupId]?.[productId] ?? {}
  const selectedChoices = comboOptionGroupsForProduct(productId).flatMap((group) =>
    group.choices.filter((choice) => groupSelections[group.id]?.includes(choice.id)),
  )

  return {
    labels: selectedChoices.map(optionChoiceLabel),
    rawLabels: selectedChoices.map((choice) => choice.label),
    priceDelta: selectedChoices.reduce((total, choice) => total + (choice.priceDelta ?? 0), 0),
  }
}

const removeComboOptionSelections = (comboGroupId: string, productId: string): void => {
  const currentGroupOptions = comboOptionSelections.value[comboGroupId] ?? {}
  if (!currentGroupOptions[productId]) {
    return
  }

  const nextGroupOptions = { ...currentGroupOptions }
  delete nextGroupOptions[productId]
  comboOptionSelections.value = Object.keys(nextGroupOptions).length > 0
    ? { ...comboOptionSelections.value, [comboGroupId]: nextGroupOptions }
    : withoutRecordKey(comboOptionSelections.value, comboGroupId)
}

const toggleComboOptionChoice = (
  comboGroup: ComboProductGroup,
  productId: string,
  group: MenuOptionGroup,
  choice: MenuOptionChoice,
): void => {
  if (comboChoiceQuantity(comboGroup, productId) <= 0) {
    return
  }

  optionWarning.value = ''
  const currentProductSelections = comboOptionSelections.value[comboGroup.id]?.[productId] ?? {}
  const currentSelections = currentProductSelections[group.id] ?? []
  const isSelected = currentSelections.includes(choice.id)
  let nextSelections: string[]

  if (group.max === 1) {
    nextSelections = isSelected ? [] : [choice.id]
  } else if (isSelected) {
    nextSelections = currentSelections.filter((selectedId) => selectedId !== choice.id)
  } else {
    nextSelections = [...currentSelections, choice.id].slice(0, group.max)
  }

  comboOptionSelections.value = {
    ...comboOptionSelections.value,
    [comboGroup.id]: {
      ...(comboOptionSelections.value[comboGroup.id] ?? {}),
      [productId]: {
        ...currentProductSelections,
        [group.id]: nextSelections,
      },
    },
  }
}

const setComboChoiceQuantity = (group: ComboProductGroup, productId: string, quantity: number): void => {
  optionWarning.value = ''
  const currentGroupSelections = comboSelections.value[group.id] ?? {}
  const currentQuantity = currentGroupSelections[productId] ?? 0
  const currentGroupCount = comboGroupSelectedCount(group)
  const nextQuantity = Math.max(0, Math.min(group.allowRepeat ? group.max : 1, Math.trunc(quantity)))
  const nextGroupCount = currentGroupCount - currentQuantity + nextQuantity
  if (nextGroupCount > group.max) {
    return
  }

  const nextGroupSelections = { ...currentGroupSelections }
  if (nextQuantity > 0) {
    nextGroupSelections[productId] = nextQuantity
  } else {
    delete nextGroupSelections[productId]
    removeComboOptionSelections(group.id, productId)
  }

  comboSelections.value = {
    ...comboSelections.value,
    [group.id]: nextGroupSelections,
  }
}

const toggleComboChoice = (group: ComboProductGroup, productId: string): void => {
  const currentQuantity = comboChoiceQuantity(group, productId)
  if (group.max === 1) {
    if (currentQuantity > 0) {
      removeComboOptionSelections(group.id, productId)
    } else {
      Object.keys(comboSelections.value[group.id] ?? {}).forEach((selectedProductId) => {
        removeComboOptionSelections(group.id, selectedProductId)
      })
    }
    comboSelections.value = {
      ...comboSelections.value,
      [group.id]: currentQuantity > 0 ? {} : { [productId]: 1 },
    }
    optionWarning.value = ''
    return
  }

  setComboChoiceQuantity(group, productId, currentQuantity > 0 ? 0 : 1)
}

const incrementComboChoice = (group: ComboProductGroup, productId: string): void => {
  setComboChoiceQuantity(group, productId, comboChoiceQuantity(group, productId) + 1)
}

const decrementComboChoice = (group: ComboProductGroup, productId: string): void => {
  setComboChoiceQuantity(group, productId, comboChoiceQuantity(group, productId) - 1)
}

const missingRequiredOptionGroup = (): MenuOptionGroup | null =>
  activeOptionGroups.value.find((group) => {
    const selectedCount = optionSelections.value[group.id]?.length ?? 0
    return group.required && selectedCount < group.min
  }) ?? null

const missingRequiredComboGroup = (): ComboProductGroup | null =>
  activeComboGroups.value.find((group) => group.required && comboGroupSelectedCount(group) < group.min) ?? null

const invalidComboOptionGroup = (): { product: MenuItem; group: MenuOptionGroup; reason: 'required' | 'max' } | null => {
  for (const comboGroup of activeComboGroups.value) {
    const selectedProducts = comboSelections.value[comboGroup.id] ?? {}
    for (const [productId, quantity] of Object.entries(selectedProducts)) {
      if (Math.max(0, Math.trunc(Number(quantity) || 0)) <= 0) {
        continue
      }

      const product = comboChoiceProduct(productId)
      if (!product) {
        continue
      }

      for (const group of comboOptionGroupsForProduct(productId)) {
        const selectedCount = comboOptionSelections.value[comboGroup.id]?.[productId]?.[group.id]?.length ?? 0
        if (group.required && selectedCount < group.min) {
          return { product, group, reason: 'required' }
        }
        if (selectedCount > group.max) {
          return { product, group, reason: 'max' }
        }
      }
    }
  }

  return null
}

const confirmMenuOptions = async (): Promise<boolean> => {
  const item = activeOptionItem.value
  if (!item) {
    return true
  }

  const missingGroup = missingRequiredOptionGroup()
  if (missingGroup) {
    optionWarning.value = `「${missingGroup.label}」尚未選擇完成`
    return false
  }

  const missingComboGroup = missingRequiredComboGroup()
  if (missingComboGroup) {
    optionWarning.value = `「${missingComboGroup.label}」尚未選擇完成`
    return false
  }

  const invalidChildOption = invalidComboOptionGroup()
  if (invalidChildOption) {
    optionWarning.value = invalidChildOption.reason === 'required'
      ? `「${invalidChildOption.product.name}」的「${invalidChildOption.group.label}」尚未選擇完成`
      : `「${invalidChildOption.product.name}」的「${invalidChildOption.group.label}」最多只能選 ${invalidChildOption.group.max} 個`
    return false
  }

  if (rawPendingOptionUnitPrice.value < 0) {
    optionWarning.value = '手動減價不可超過品項金額'
    return false
  }

  if (selectedOptionDetails.value.priceDelta !== 0 && !(await verifyProtectedPermissions([
    {
      permission: 'useVariablePriceNotes',
      title: accessPermissionLabels.useVariablePriceNotes,
      detail: `「${item.name}」套用會改變價格的註記前需驗證員工識別碼。`,
    },
  ]))) {
    return false
  }

  if (activeOptionLineId.value) {
    updateConfiguredLine(
      activeOptionLineId.value,
      item,
      selectedOptionDetails.value.labels,
      selectedOptionDetails.value.priceDelta,
      selectedComboDetails.value.items,
    )
  } else {
    addConfiguredItem(item, selectedOptionDetails.value.labels, selectedOptionDetails.value.priceDelta, selectedComboDetails.value.items)
  }
  closeOptionPanel()
  return true
}

const ticketActionPermissionSteps = (action: TicketAction): ProtectedPermissionStep[] => {
  const steps: ProtectedPermissionStep[] = [
    openOrderPermissionStep('建立或更新門市訂單前需驗證員工識別碼。'),
  ]

  if (action === 'checkout-print' || action === 'checkout-only') {
    steps.push({
      permission: 'checkoutOrders',
      title: accessPermissionLabels.checkoutOrders,
      detail: '執行結帳前需驗證員工識別碼。',
    })
  }

  if (action === 'print' || action === 'checkout-print') {
    steps.push({
      permission: 'sendOrdersToKitchen',
      title: accessPermissionLabels.sendOrdersToKitchen,
      detail: '送出廚房出單前需驗證員工識別碼。',
    })
  }

  const defaultServiceFeeRate = serviceChargeRateForMode(engagementSettings.value.serviceCharge, serviceMode.value)
  const currentServiceFeeRate = Math.max(0, Math.trunc(Number(serviceFeeRate.value) || 0))
  const currentExtraFeeAmount = Math.max(0, Math.trunc(Number(extraFeeAmount.value) || 0))
  if (
    (action === 'checkout-print' || action === 'checkout-only') &&
    (currentServiceFeeRate !== defaultServiceFeeRate || currentExtraFeeAmount > 0)
  ) {
    steps.push({
      permission: 'adjustServiceCharges',
      title: accessPermissionLabels.adjustServiceCharges,
      detail: '調整服務費或其他費用後結帳前需驗證員工識別碼。',
    })
  }

  const manualDiscountAmount = Math.max(0, Math.trunc(Number(discountAmount.value) || 0))
  const manualPointsRedeemed = Math.max(0, Math.trunc(Number(pointsRedeemed.value) || 0))
  if (
    (action === 'checkout-print' || action === 'checkout-only') &&
    (manualDiscountAmount > 0 || manualPointsRedeemed > 0 || Boolean(couponCode.value) || protectedDiscountCampaignAdjusted.value)
  ) {
    steps.push({
      permission: 'applyManualDiscounts',
      title: accessPermissionLabels.applyManualDiscounts,
      detail: '套用手動折扣、點數或優惠券後結帳前需驗證員工識別碼。',
    })
  }

  return steps
}

const printOrderAction = async (order: PosOrder): Promise<void> => {
  if (!(await verifyProtectedPermissions([
    {
      permission: 'sendOrdersToKitchen',
      title: accessPermissionLabels.sendOrdersToKitchen,
      detail: `${compactOrderId(order.id)} 出單至廚房前需驗證員工識別碼。`,
    },
  ]))) {
    return
  }

  await printOrder(order.id)
}

const handleTicketAction = async (action: TicketAction): Promise<void> => {
  if (ticketActionDisabled()) {
    return
  }

  if (activeOptionItem.value && !(await confirmMenuOptions())) {
    return
  }

  if (!(await verifyProtectedPermissions(ticketActionPermissionSteps(action)))) {
    return
  }

  activeTicketAction.value = action
  const transactionDetailCopies = Math.min(10, Math.max(0, Math.trunc(transactionReceiptCount.value || 0)))
  const order = await saveCounterOrder()
  if (!order) {
    activeTicketAction.value = null
    return
  }

  try {
    if (action === 'checkout-print' || action === 'checkout-only') {
      await collectOrderPaymentAction(order, { skipVerification: true })
    }

    if (action === 'checkout-print' || action === 'print') {
      await printOrder(order.id, 'order')
    }

    if (action === 'checkout-print' || action === 'checkout-only') {
      for (let copy = 0; copy < transactionDetailCopies; copy += 1) {
        await printTransactionDetail(order.id)
      }
    }

    expandedOrderId.value = order.id
    if (order.mode === 'dine-in') {
      const tableId = tableIdFromOrder(order)
      if (tableId) {
        selectedFloorTableId.value = tableId
      }
      setWorkspaceTab('floor')
    } else {
      setWorkspaceTab('queue')
    }
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

const manualPrintActionDisabled = (order: PosOrder): boolean =>
  printingOrderId.value === order.id || orderClaimedByOtherStation(order)

const customerReceiptDisabled = (order: PosOrder): boolean =>
  manualPrintActionDisabled(order) || order.lines.length === 0

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
  void collectOrderPaymentAction(order)
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

const orderSwipeDeleteAction = async (order: PosOrder): Promise<void> => {
  if (orderSwipeDeleteDisabled(order)) {
    return
  }

  const isOnlineOrder = order.source === 'online' || order.source === 'qr'
  const verified = await verifyProtectedPermissions([
    {
      permission: isOnlineOrder ? 'cancelOnlineOrders' : 'deleteOrders',
      title: isOnlineOrder ? accessPermissionLabels.cancelOnlineOrders : accessPermissionLabels.deleteOrders,
      detail: `${compactOrderId(order.id)} ${isOnlineOrder ? '取消線上訂單' : '刪除訂單'}前需驗證員工識別碼。`,
    },
  ])
  if (!verified) {
    return
  }

  void deleteOrderFromQueue(order.id)
  openSwipeKey.value = null
}

const executeQueueAdminAction = async (kind: QueueAdminActionKind, order: PosOrder): Promise<void> => {
  const label = queueAdminActionLabel(kind)
  const verified = await verifyProtectedPermissions([
    {
      permission: kind === 'void' ? 'voidOrders' : 'refundOrders',
      title: kind === 'void' ? accessPermissionLabels.voidOrders : accessPermissionLabels.refundOrders,
      detail: `${compactOrderId(order.id)} ${label}前需驗證員工識別碼。`,
    },
  ])
  if (!verified) {
    return
  }

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

const executeTransactionAdminAction = async (kind: QueueAdminActionKind, order: PosOrder): Promise<void> => {
  const label = queueAdminActionLabel(kind)
  const verified = await verifyProtectedPermissions([
    {
      permission: kind === 'void' ? 'voidOrders' : 'refundOrders',
      title: kind === 'void' ? accessPermissionLabels.voidOrders : accessPermissionLabels.refundOrders,
      detail: `${compactOrderId(order.id)} ${label}前需驗證員工識別碼。`,
    },
  ])
  if (!verified) {
    return
  }

  transactionLookupMessage.value = `${compactOrderId(order.id)} ${label}處理中`

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

  transactionLookupMessage.value = actionSucceeded
    ? `${compactOrderId(order.id)} ${label}完成`
    : `${compactOrderId(order.id)} ${label}未完成：${backendStatus.detail || backendStatus.label}`
}

const requestTransactionAdminAction = (kind: QueueAdminActionKind, order: PosOrder): void => {
  const label = queueAdminActionLabel(kind)

  if (!requireBackendEditMode(label)) {
    transactionLookupMessage.value = `${compactOrderId(order.id)} ${label}需先進入後台編輯模式`
    return
  }

  void executeTransactionAdminAction(kind, order)
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

const setQuickDispatchCutoffNow = (): void => {
  quickDispatchCutoffInput.value = localDateTimeInputValue(new Date(currentTime.value))
}

const runQuickDispatch = async (): Promise<void> => {
  if (quickDispatching.value) {
    return
  }

  if (!requireBackendEditMode('快速出店')) {
    queueActionMessage.value = '快速出店需先進入後台編輯模式'
    return
  }

  const orders = [...quickDispatchAvailableOrders.value]
  if (orders.length === 0) {
    queueActionMessage.value = quickDispatchBlockedCount.value > 0
      ? `快速出店無可處理訂單，${quickDispatchBlockedCount.value} 張由其他平板處理中`
      : '目前沒有符合快速出店條件的訂單'
    return
  }

  quickDispatching.value = true
  queueActionMessage.value = `快速出店處理中：${orders.length} 張`
  let processed = 0

  try {
    for (const order of orders) {
      await updateOrderStatus(order.id, 'served')
      processed += 1
    }

    queueFilter.value = 'active'
    queueActionMessage.value =
      `快速出店完成 ${processed} 張${quickDispatchBlockedCount.value > 0 ? `，略過鎖定 ${quickDispatchBlockedCount.value} 張` : ''}`
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    queueActionMessage.value = `快速出店已完成 ${processed} 張，後續中止：${message}`
  } finally {
    quickDispatching.value = false
    openSwipeKey.value = null
  }
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

const updateFloorPartySize = (table: DiningTableDefinition, delta: number): void => {
  const currentSize = floorPartySizes.value[table.id] ?? 0
  const nextSize = Math.min(table.capacity, Math.max(0, currentSize + delta))
  floorPartySizes.value = {
    ...floorPartySizes.value,
    [table.id]: nextSize,
  }
}

const floorHasActiveOrders = (floorId: string): boolean =>
  floorTables.value.some((table) => table.floorId === floorId && Boolean(dineInOrderForTable(table.id)))

const updateFloorTable = (tableId: string, patch: Partial<DiningTableDefinition>): void => {
  floorTables.value = floorTables.value.map((currentTable) =>
    currentTable.id === tableId ? { ...currentTable, ...patch } : currentTable,
  )
  floorPartySizes.value = normalizeFloorPartySizes(floorPartySizes.value, floorTables.value)
}

const updateFloorTableCapacity = (table: DiningTableDefinition, delta: number): void => {
  updateFloorTable(table.id, { capacity: Math.min(20, Math.max(1, table.capacity + delta)) })
}

const updateFloorTableLabel = (table: DiningTableDefinition, label: string): void => {
  if (dineInOrderForTable(table.id)) {
    floorPlanSyncMessage.value = '此桌仍有進行中訂單，請先清桌再改桌號'
    return
  }

  const normalizedLabel = label.trim().toUpperCase().slice(0, 12)
  updateFloorTable(table.id, { label: normalizedLabel || table.label })
}

const updateFloorTableNumber = (
  table: DiningTableDefinition,
  key: 'x' | 'y' | 'width',
  value: string | number,
): void => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return
  }

  const bounds = key === 'width' ? { min: 10, max: 36 } : { min: 4, max: 92 }
  updateFloorTable(table.id, { [key]: Math.min(bounds.max, Math.max(bounds.min, Math.round(numberValue))) })
}

const autoPrintedSessionQrOrderIds = new Set<string>()

const maybeAutoPrintSessionQrCode = async (orderId: string | null): Promise<void> => {
  if (!orderId || autoPrintedSessionQrOrderIds.has(orderId)) {
    return
  }

  const qrSettings = onlineOrderingSettings.value.sessionQrCode
  if (!qrSettings.autoPrint) {
    return
  }

  await nextTick()
  const order = orderQueue.value.find((entry) => entry.id === orderId)
  if (!order || order.mode !== 'dine-in') {
    return
  }

  autoPrintedSessionQrOrderIds.add(orderId)
  await printOrderQrCode(orderId, {
    stationId: qrSettings.stationId,
    logoText: qrSettings.logoText,
  })
}

const nextFloorLabel = (): string => {
  for (let index = 1; index <= 12; index += 1) {
    const label = `${index}F`
    if (!floorLevels.value.some((floor) => floor.label.toUpperCase() === label)) {
      return label
    }
  }

  return `樓層 ${floorLevels.value.length + 1}`
}

const floorIdFromLabel = (label: string): string =>
  label.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) || `F${Date.now().toString(36).toUpperCase()}`

const addFloorLevel = (): void => {
  const label = nextFloorLabel()
  let floorId = floorIdFromLabel(label)
  let suffix = 2
  while (floorLevels.value.some((floor) => floor.id === floorId)) {
    floorId = `${floorIdFromLabel(label)}-${suffix}`
    suffix += 1
  }

  floorLevels.value = [...floorLevels.value, { id: floorId, label }]
  activeFloorId.value = floorId
  selectedFloorTableId.value = null
}

const setActiveFloor = (floorId: string): void => {
  if (!floorLevels.value.some((floor) => floor.id === floorId)) {
    return
  }

  activeFloorId.value = floorId
  selectedFloorTableId.value = floorTables.value.find((table) => table.floorId === floorId)?.id ?? null
}

const updateFloorLevelLabel = (floor: FloorLevelSetting, label: string): void => {
  const normalizedLabel = label.trim().slice(0, 16)
  if (!normalizedLabel) {
    return
  }

  floorLevels.value = floorLevels.value.map((currentFloor) =>
    currentFloor.id === floor.id ? { ...currentFloor, label: normalizedLabel } : currentFloor,
  )
}

const removeFloorLevel = (floor: FloorLevelSetting): void => {
  if (floorLevels.value.length <= 1) {
    floorPlanSyncMessage.value = '至少需要保留 1 個樓層'
    return
  }

  if (floorHasActiveOrders(floor.id)) {
    floorPlanSyncMessage.value = `${floor.label} 還有進行中訂單，不能刪除`
    return
  }

  const removedTableIds = new Set(floorTables.value.filter((table) => table.floorId === floor.id).map((table) => table.id))
  floorLevels.value = floorLevels.value.filter((currentFloor) => currentFloor.id !== floor.id)
  floorTables.value = floorTables.value.filter((table) => table.floorId !== floor.id)
  floorPartySizes.value = Object.entries(floorPartySizes.value).reduce<Record<string, number>>((sizes, [tableId, size]) => {
    if (!removedTableIds.has(tableId)) {
      sizes[tableId] = size
    }
    return sizes
  }, {})
  if (activeFloorId.value === floor.id) {
    activeFloorId.value = floorLevels.value[0]?.id ?? '1F'
  }
  selectedFloorTableId.value = floorTables.value.find((table) => table.floorId === activeFloorId.value)?.id ?? null
}

const nextTableLabelForFloor = (): string => {
  const labels = new Set(activeFloorTables.value.map((table) => table.label.toUpperCase()))
  for (let index = 1; index <= 99; index += 1) {
    const label = `A${index}`
    if (!labels.has(label)) {
      return label
    }
  }

  return `T${Date.now().toString(36).toUpperCase().slice(-4)}`
}

const uniqueTableId = (floorId: string, label: string): string => {
  const base = `${floorId}-${label}`.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12) || `T${Date.now()}`
  let tableId = base
  let suffix = 2
  while (floorTables.value.some((table) => table.id === tableId)) {
    tableId = `${base.slice(0, 10)}${suffix}`
    suffix += 1
  }
  return tableId
}

const addFloorTable = (): void => {
  const floorId = activeFloorId.value || floorLevels.value[0]?.id || '1F'
  const label = nextTableLabelForFloor()
  const table: DiningTableDefinition = {
    id: uniqueTableId(floorId, label),
    floorId,
    label,
    capacity: 2,
    x: 44,
    y: 42,
    width: 14,
  }
  floorTables.value = [...floorTables.value, table]
  selectedFloorTableId.value = table.id
}

const removeFloorTable = (table: DiningTableDefinition): void => {
  if (dineInOrderForTable(table.id)) {
    floorPlanSyncMessage.value = `${table.label} 還有進行中訂單，不能刪除`
    return
  }

  floorTables.value = floorTables.value.filter((currentTable) => currentTable.id !== table.id)
  floorPartySizes.value = Object.entries(floorPartySizes.value).reduce<Record<string, number>>((sizes, [tableId, size]) => {
    if (tableId !== table.id) {
      sizes[tableId] = size
    }
    return sizes
  }, {})
  if (selectedFloorTableId.value === table.id) {
    selectedFloorTableId.value = activeFloorTables.value.find((currentTable) => currentTable.id !== table.id)?.id ?? null
  }
}

const resetFloorTablesToDefault = (): void => {
  floorLevels.value = defaultFloorPlanSettingsValue.floors.map((floor) => ({ ...floor }))
  activeFloorId.value = defaultFloorPlanSettingsValue.activeFloorId
  floorTables.value = defaultDiningTables.map((table) => ({ ...table }))
  floorPartySizes.value = normalizeFloorPartySizes(floorPartySizes.value, floorTables.value)
  selectedFloorTableId.value = floorTables.value.find((table) => table.floorId === activeFloorId.value)?.id ?? null
}

const handleFloorTablePointerDown = (event: PointerEvent, state: FloorTableState): void => {
  selectFloorTable(state)
  if (!backendEditModeEnabled.value || !floorMapRef.value) {
    return
  }

  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) {
    return
  }

  event.preventDefault()
  floorTableDragState.value = {
    pointerId: event.pointerId,
    tableId: state.table.id,
    startX: event.clientX,
    startY: event.clientY,
    originalX: state.table.x,
    originalY: state.table.y,
    dragging: false,
  }
  target.setPointerCapture(event.pointerId)
}

const handleFloorTableSettingDragStart = (event: PointerEvent, table: DiningTableDefinition): void => {
  const state = floorTableStates.value.find((entry) => entry.table.id === table.id)
  if (state) {
    handleFloorTablePointerDown(event, state)
  }
}

const handleFloorTablePointerMove = (event: PointerEvent): void => {
  const drag = floorTableDragState.value
  const map = floorMapRef.value
  if (!drag || drag.pointerId !== event.pointerId || !map) {
    return
  }

  const rect = map.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return
  }

  const deltaX = ((event.clientX - drag.startX) / rect.width) * 100
  const deltaY = ((event.clientY - drag.startY) / rect.height) * 100
  const moved = Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4
  event.preventDefault()
  floorTableDragState.value = { ...drag, dragging: drag.dragging || moved }
  if (!moved) {
    return
  }

  const table = floorTables.value.find((entry) => entry.id === drag.tableId)
  const maxX = Math.max(4, 96 - (table?.width ?? 14))
  updateFloorTable(drag.tableId, {
    x: Math.min(maxX, Math.max(4, Math.round(drag.originalX + deltaX))),
    y: Math.min(92, Math.max(4, Math.round(drag.originalY + deltaY))),
  })
}

const handleFloorTablePointerUp = (event: PointerEvent): void => {
  const drag = floorTableDragState.value
  if (drag?.pointerId === event.pointerId) {
    floorTableDragState.value = null
  }
}

const startDineInTableOrder = async (
  table: DiningTableDefinition,
  options: { partySize?: number; waitlineEntry?: WaitlineEntry } = {},
): Promise<void> => {
  if (!(await verifyProtectedPermissions([
    openOrderPermissionStep(`為 ${floorLabelForTable(table)} ${table.label} 建立內用訂單前需驗證員工識別碼。`),
  ]))) {
    return
  }

  await startCounterDraft('dine-in')
  const partySize = Math.min(table.capacity, Math.max(1, options.partySize ?? floorPartySizes.value[table.id] ?? 1))
  floorPartySizes.value = {
    ...floorPartySizes.value,
    [table.id]: partySize,
  }
  customer.name = `${floorLabelForTable(table)} ${table.label} 內用客`
  customer.note = [
    floorNoteToken(floorLabelForTable(table)),
    tableNoteToken(table.label),
    `${partySize} 人`,
    options.waitlineEntry?.name ? `候位 ${options.waitlineEntry.name}` : '',
    options.waitlineEntry?.phone ? `電話 ${options.waitlineEntry.phone}` : '',
    options.waitlineEntry?.note ?? '',
  ].filter(Boolean).join('、')
  activeCartQuickEditor.value = null
  closeOptionPanel()
  setWorkspaceTab('order')
  void maybeAutoPrintSessionQrCode(counterDraftOrderId.value)
}

const transferFloorTableOrder = async (
  state: FloorTableState,
  targetTable: DiningTableDefinition,
): Promise<void> => {
  if (!state.order || orderClaimedByOtherStation(state.order)) {
    return
  }

  if (!(await verifyProtectedPermissions([
    {
      permission: 'transferOrders',
      title: accessPermissionLabels.transferOrders,
      detail: `將 ${state.table.label} 訂單轉到 ${targetTable.label} 前需驗證員工識別碼。`,
    },
  ]))) {
    return
  }

  const partySize = Math.min(targetTable.capacity, Math.max(1, state.partySize || floorPartySizes.value[state.table.id] || 1))
  await updateOrderFloorAssignmentForStation(state.order.id, targetTable.label, partySize, floorLabelForTable(targetTable))
  floorPartySizes.value = {
    ...floorPartySizes.value,
    [state.table.id]: 0,
    [targetTable.id]: partySize,
  }
  selectedFloorTableId.value = targetTable.id
}

const selectFloorTable = (state: FloorTableState): void => {
  selectedFloorTableId.value = state.table.id
}

const openFloorTableOrder = async (state: FloorTableState): Promise<void> => {
  selectFloorTable(state)
  if (!state.order) {
    return
  }

  if (orderCanBeEdited(state.order)) {
    await editOrderFromQueue(state.order)
    if (activeWorkspaceTab.value === 'order') {
      return
    }
  }

  queueFilter.value = 'all'
  queuePaymentFilter.value = 'all'
  queueDateFilter.value = 'all'
  queueServiceFilter.value = 'dine-in'
  queueSourceFilter.value = 'all'
  queueFulfillmentFilter.value = 'all'
  queueSearchTerm.value = state.order.id
  expandedOrderId.value = state.order.id
  queueActionMessage.value = `${state.table.label} 訂單已在訂單中心展開`
  setWorkspaceTab('queue')
}

const reservationToEditDraft = (reservation: PosReservation): ReservationEditDraft => {
  const reservedAt = new Date(reservation.reservedAt)
  return {
    customerName: reservation.customerName,
    customerPhone: reservation.customerPhone,
    partySize: Math.max(1, reservation.partySize),
    reservedAt: Number.isFinite(reservedAt.getTime()) ? localDateTimeInputValue(reservedAt) : nextReservationSlotInput(),
    importantLabel: reservation.importantLabel,
    note: reservation.note,
    assignedTableIds: [...reservation.assignedTableIds],
    status: reservation.status,
  }
}

const replaceReservation = (reservation: PosReservation): void => {
  posReservations.value = [
    reservation,
    ...posReservations.value.filter((entry) => entry.id !== reservation.id),
  ].sort((first, second) => reservationTimestamp(first) - reservationTimestamp(second))
  if (selectedReservationEditId.value === reservation.id) {
    reservationEditDraft.value = reservationToEditDraft(reservation)
  }
}

const refreshReservations = async (): Promise<void> => {
  if (!isPosApiConfigured) {
    reservationMessage.value = '本機模式無法同步訂位'
    return
  }

  isReservationLoading.value = true
  const { start, end } = reservationRange.value
  try {
    const rows = await fetchAdminReservations(start.toISOString(), end.toISOString())
    const startTime = start.getTime()
    const endTime = end.getTime()
    posReservations.value = [
      ...posReservations.value.filter((reservation) => {
        const timestamp = reservationTimestamp(reservation)
        return timestamp < startTime || timestamp >= endTime
      }),
      ...rows,
    ].sort((first, second) => reservationTimestamp(first) - reservationTimestamp(second))
    reservationMessage.value = `${reservationRangeLabel.value} 已同步 ${rows.length} 筆訂位`
  } catch (error) {
    reservationMessage.value = `訂位同步失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isReservationLoading.value = false
  }
}

const resetReservationDraft = (): void => {
  reservationDraft.value = defaultReservationDraft()
}

const toggleReservationDraftTable = (tableId: string): void => {
  const currentIds = new Set(reservationDraft.value.assignedTableIds)
  if (currentIds.has(tableId)) {
    currentIds.delete(tableId)
  } else {
    currentIds.add(tableId)
  }
  reservationDraft.value = {
    ...reservationDraft.value,
    assignedTableIds: [...currentIds],
  }
}

const startEditingReservation = (reservation: PosReservation): void => {
  selectedReservationEditId.value = reservation.id
  reservationEditDraft.value = reservationToEditDraft(reservation)
  reservationMessage.value = `${reservation.customerName} 可修改時間、桌位與店內資訊`
}

const cancelReservationEdit = (): void => {
  selectedReservationEditId.value = null
  reservationEditDraft.value = null
}

const toggleReservationEditTable = (tableId: string): void => {
  if (!reservationEditDraft.value) {
    return
  }
  const currentIds = new Set(reservationEditDraft.value.assignedTableIds)
  if (currentIds.has(tableId)) {
    currentIds.delete(tableId)
  } else {
    currentIds.add(tableId)
  }
  reservationEditDraft.value = {
    ...reservationEditDraft.value,
    assignedTableIds: [...currentIds],
  }
}

const shiftReservationEditTime = (minutes: number): void => {
  if (!reservationEditDraft.value) {
    return
  }
  const current = reservationEditDraft.value.reservedAt ? new Date(reservationEditDraft.value.reservedAt) : new Date()
  const next = Number.isFinite(current.getTime()) ? current : new Date()
  next.setMinutes(next.getMinutes() + minutes, 0, 0)
  reservationEditDraft.value = {
    ...reservationEditDraft.value,
    reservedAt: localDateTimeInputValue(next),
  }
}

const saveReservationEdits = async (): Promise<void> => {
  const reservation = selectedReservationEdit.value
  const draft = reservationEditDraft.value
  if (!reservation || !draft) {
    reservationMessage.value = '請先選擇要修改的訂位'
    return
  }
  if (!isPosApiConfigured) {
    reservationMessage.value = '本機模式無法修改雲端訂位'
    return
  }

  const reservedAt = fromDateTimeInputValue(draft.reservedAt)
  if (!reservedAt) {
    reservationMessage.value = '請先選擇有效訂位時間'
    return
  }

  reservationActionId.value = `${reservation.id}-edit`
  try {
    const saved = await updateAdminReservation(reservation.id, {
      customerName: draft.customerName.trim() || '訂位客',
      customerPhone: draft.customerPhone.trim(),
      partySize: Math.max(1, Math.trunc(draft.partySize || 1)),
      reservedAt,
      status: draft.status,
      importantLabel: draft.importantLabel.trim(),
      note: draft.note.trim(),
      assignedTableIds: [...new Set(draft.assignedTableIds)],
    })
    replaceReservation(saved)
    selectedReservationEditId.value = saved.id
    reservationMessage.value = `${saved.customerName} 訂位已更新`
  } catch (error) {
    reservationMessage.value = `訂位修改失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    reservationActionId.value = ''
  }
}

const createReservationFromPos = async (): Promise<void> => {
  if (!isPosApiConfigured) {
    reservationMessage.value = '本機模式無法建立雲端訂位'
    return
  }

  const reservedAt = fromDateTimeInputValue(reservationDraft.value.reservedAt)
  if (!reservedAt) {
    reservationMessage.value = '請先選擇有效訂位時間'
    return
  }

  reservationActionId.value = 'reservation-create'
  try {
    const reservation = await createAdminReservation({
      customerName: reservationDraft.value.customerName.trim() || '訂位客',
      customerPhone: reservationDraft.value.customerPhone.trim(),
      partySize: Math.max(1, Math.trunc(reservationDraft.value.partySize || 1)),
      reservedAt,
      status: 'booked',
      importantLabel: reservationDraft.value.importantLabel.trim(),
      note: reservationDraft.value.note.trim(),
      assignedTableIds: [...reservationDraft.value.assignedTableIds],
      preOrder: [],
    })
    replaceReservation(reservation)
    resetReservationDraft()
    reservationMessage.value = `${reservation.customerName} 訂位已建立`
  } catch (error) {
    reservationMessage.value = `訂位建立失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    reservationActionId.value = ''
  }
}

const setReservationStatusFromPos = async (
  reservation: PosReservation,
  status: ReservationStatus,
): Promise<void> => {
  reservationActionId.value = `${reservation.id}-${status}`
  try {
    const saved = await updateAdminReservation(reservation.id, { status })
    replaceReservation(saved)
    reservationMessage.value = `${reservation.customerName} 已更新為${reservationStatusLabels[status]}`
  } catch (error) {
    reservationMessage.value = `訂位狀態更新失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    reservationActionId.value = ''
  }
}

const focusReservationTable = (reservation: PosReservation): void => {
  const table = reservationAssignedTables(reservation)[0]
  if (!table) {
    reservationMessage.value = '此訂位尚未安排桌位'
    return
  }
  setActiveFloor(table.floorId)
  selectedFloorTableId.value = table.id
  setWorkspaceTab('floor')
}

const checkInReservation = async (reservation: PosReservation): Promise<void> => {
  const assignedTables = reservationAssignedTables(reservation)
  const firstTable = assignedTables[0] ??
    reservationAssignableTables.value.find((table) => !dineInOrderForTable(table.id) && table.capacity >= reservation.partySize) ??
    reservationAssignableTables.value.find((table) => !dineInOrderForTable(table.id))

  if (!firstTable) {
    reservationMessage.value = '沒有可開桌的空桌'
    return
  }

  reservationActionId.value = `${reservation.id}-check-in`
  try {
    setActiveFloor(firstTable.floorId)
    selectedFloorTableId.value = firstTable.id
    await startDineInTableOrder(firstTable, { partySize: Math.min(firstTable.capacity, reservation.partySize) })
    const reservedTimeLabel = formatOrderTime(reservation.reservedAt)
    const reservedTables = assignedTables
      .filter((table) => table.id !== firstTable.id)
      .map((table) => `${floorLabelForTable(table)} ${table.label}`)
    customer.name = reservation.customerName || `${floorLabelForTable(firstTable)} ${firstTable.label} 訂位客`
    customer.phone = reservation.customerPhone
    customer.note = [
      floorNoteToken(floorLabelForTable(firstTable)),
      tableNoteToken(firstTable.label),
      `${reservation.partySize} 人`,
      `訂位 ${reservedTimeLabel}`,
      reservation.importantLabel,
      reservation.note,
      reservedTables.length > 0 ? `保留桌位 ${reservedTables.join(' / ')}` : '',
    ].filter(Boolean).join('、')
    const saved = await updateAdminReservation(reservation.id, {
      status: 'seated',
      assignedTableIds: reservation.assignedTableIds.length > 0 ? reservation.assignedTableIds : [firstTable.id],
    })
    replaceReservation(saved)
    reservationMessage.value = `${reservation.customerName} 已帶位開單`
  } catch (error) {
    reservationMessage.value = `帶位開單失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    reservationActionId.value = ''
  }
}

const returnFromOrderWorkspace = (): void => {
  setWorkspaceTab(serviceMode.value === 'dine-in' ? 'floor' : 'queue')
}

const markFloorTableServed = (state: FloorTableState): void => {
  if (!state.order || orderClaimedByOtherStation(state.order)) {
    return
  }

  void updateOrderStatus(state.order.id, 'served')
}

const waitlinePreorderOrder = (entry: WaitlineEntry): PosOrder | null =>
  entry.orderId ? orderQueue.value.find((order) => order.id === entry.orderId) ?? null : null

const waitlinePreorderSummary = (entry: WaitlineEntry): string => {
  const order = waitlinePreorderOrder(entry)
  if (!entry.orderId) {
    return '尚未提前點餐'
  }

  if (!order) {
    return `提前點餐 ${compactOrderId(entry.orderId)} 同步中`
  }

  if (order.lines.length === 0) {
    return `提前點餐 ${compactOrderId(order.id)} · 尚未加入品項`
  }

  return `提前點餐 ${compactOrderId(order.id)} · ${order.lines.length} 項 · ${formatCurrency(order.subtotal)}`
}

const updateWaitlineEntryOrder = (entryId: string, orderId: string): void => {
  waitlineEntries.value = waitlineEntries.value.map((entry) =>
    entry.id === entryId ? { ...entry, orderId } : entry,
  )
}

const startWaitlinePreorder = async (entry: WaitlineEntry): Promise<void> => {
  if (entry.orderId) {
    const order = waitlinePreorderOrder(entry)
    if (!order) {
      floorPlanSyncMessage.value = `${entry.name} 的提前點餐單尚未同步，請稍後重新整理`
      return
    }

    const loaded = await loadCounterOrderForEditing(order.id)
    if (loaded) {
      floorPlanSyncMessage.value = `${entry.name} 提前點餐已載入`
      setWorkspaceTab('order')
    }
    return
  }

  if (counterDraftOrderId.value) {
    floorPlanSyncMessage.value = '目前已有編輯中的票券，請先完成或返回該票券'
    setWorkspaceTab('order')
    return
  }

  if (!(await verifyProtectedPermissions([
    openOrderPermissionStep(`為候位 ${entry.name || entry.id} 建立提前點餐單前需驗證員工識別碼。`),
  ]))) {
    return
  }

  await startCounterDraft('dine-in')
  const orderId = counterDraftOrderId.value
  if (!orderId) {
    floorPlanSyncMessage.value = '提前點餐建立失敗，請稍後再試'
    return
  }

  customer.name = entry.name || '候位客'
  customer.phone = entry.phone
  customer.note = [
    `候位 ${entry.name || entry.id}`,
    `${entry.partySize} 人`,
    entry.note,
  ].filter(Boolean).join('、')
  updateWaitlineEntryOrder(entry.id, orderId)
  floorPlanSyncMessage.value = `${entry.name} 已建立提前點餐單 ${compactOrderId(orderId)}`
  activeCartQuickEditor.value = null
  closeOptionPanel()
  setWorkspaceTab('order')
}

const updateWaitlineDraftPartySize = (delta: number): void => {
  waitlineDraft.value = {
    ...waitlineDraft.value,
    partySize: Math.min(20, Math.max(1, waitlineDraft.value.partySize + delta)),
  }
}

const addWaitlineEntry = (): void => {
  const now = new Date()
  const draft = waitlineDraft.value
  waitlineEntries.value = [
    ...waitlineEntries.value,
    {
      id: `wait-${now.getTime()}`,
      name: draft.name.trim() || `候位 ${waitlineEntries.value.length + 1}`,
      phone: draft.phone.trim(),
      customerType: draft.customerType,
      partySize: Math.min(20, Math.max(1, Math.trunc(draft.partySize || 1))),
      createdAt: now.toISOString(),
      note: draft.note.trim(),
    },
  ]
  waitlineDraft.value = {
    name: '',
    phone: '',
    customerType: 'walk-in',
    partySize: 2,
    note: '',
  }
}

const updateWaitlinePartySize = (entry: WaitlineEntry, delta: number): void => {
  waitlineEntries.value = waitlineEntries.value.map((currentEntry) =>
    currentEntry.id === entry.id
      ? { ...currentEntry, partySize: Math.min(20, Math.max(1, currentEntry.partySize + delta)) }
      : currentEntry,
  )
}

const removeWaitlineEntry = (entryId: string): void => {
  waitlineEntries.value = waitlineEntries.value.filter((entry) => entry.id !== entryId)
}

const seatWaitlineEntryAtTable = async (entry: WaitlineEntry, table: DiningTableDefinition): Promise<void> => {
  const partySize = Math.min(table.capacity, entry.partySize)
  if (entry.orderId) {
    const order = waitlinePreorderOrder(entry)
    if (!order) {
      floorPlanSyncMessage.value = `${entry.name} 的提前點餐單尚未同步，請稍後重新整理`
      return
    }

    if (orderClaimedByOtherStation(order)) {
      floorPlanSyncMessage.value = `${entry.name} 的提前點餐單目前由其他平板處理`
      return
    }

    await updateOrderFloorAssignmentForStation(entry.orderId, table.label, partySize, floorLabelForTable(table))
    floorPartySizes.value = {
      ...floorPartySizes.value,
      [table.id]: partySize,
    }
    removeWaitlineEntry(entry.id)
    const loaded = await loadCounterOrderForEditing(entry.orderId)
    floorPlanSyncMessage.value = loaded
      ? `${entry.name} 已入座 ${table.label}，提前點餐已載入`
      : `${entry.name} 已入座 ${table.label}`
    setWorkspaceTab(loaded ? 'order' : 'floor')
    return
  }

  removeWaitlineEntry(entry.id)
  await startDineInTableOrder(table, { partySize, waitlineEntry: entry })
}

const openFloorNotificationTarget = (item: PosNotificationItem): void => {
  if (item.target === 'supply') {
    openSupplyStatus()
    return
  }

  if (item.target === 'knowledge') {
    isKnowledgeOpen.value = true
    return
  }

  setWorkspaceTab(item.target)
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
  floor: '桌位地圖',
  order: '點餐',
  payment: '付款',
  queue: '桌況',
  reservations: '訂位',
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

const labelManagementColorPalette = ['#0f766e', '#b45309', '#b91c1c', '#1d4ed8', '#6d28d9', '#475569']
const cloneOrderLabelSettings = (labels: OrderLabelSetting[]): OrderLabelSetting[] =>
  labels.map((label) => ({ ...label }))

const syncLabelManagementDrafts = (): void => {
  labelManagementDrafts.value = cloneOrderLabelSettings(engagementSettings.value.orderLabels)
  labelManagementMessage.value = '訂單標籤會同步到點餐頁與後台紀錄'
}

const createLabelManagementId = (label: string): string => {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
  const suffix = (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toLowerCase()
  return `${base || 'label'}-${suffix}`
}

const addLabelManagementDraft = (): void => {
  const nextIndex = labelManagementDrafts.value.length
  labelManagementDrafts.value = [
    ...labelManagementDrafts.value,
    {
      id: createLabelManagementId(`label-${nextIndex + 1}`),
      label: `標籤 ${nextIndex + 1}`,
      color: labelManagementColorPalette[nextIndex % labelManagementColorPalette.length] ?? '#0f766e',
    },
  ]
}

const updateLabelManagementDraft = (
  labelId: string,
  patch: Partial<Pick<OrderLabelSetting, 'label' | 'color'>>,
): void => {
  labelManagementDrafts.value = labelManagementDrafts.value.map((label) =>
    label.id === labelId ? { ...label, ...patch } : label,
  )
}

const deleteLabelManagementDraft = (labelId: string): void => {
  labelManagementDrafts.value = labelManagementDrafts.value.filter((label) => label.id !== labelId)
}

const normalizeLabelManagementDrafts = (): OrderLabelSetting[] => {
  const seenIds = new Set<string>()
  return labelManagementDrafts.value.flatMap((label, index) => {
    const text = label.label.trim().slice(0, 24)
    if (!text) {
      return []
    }

    let id = label.id.trim() || createLabelManagementId(text)
    while (seenIds.has(id)) {
      id = `${id}-${index + 1}`
    }
    seenIds.add(id)

    return [{
      id,
      label: text,
      color: /^#[0-9a-fA-F]{6}$/.test(label.color) ? label.color : '#0f766e',
    }]
  }).slice(0, 24)
}

const saveLabelManagementDrafts = async (): Promise<void> => {
  if (!requireBackendEditMode('儲存標籤管理')) {
    return
  }

  if (!isPosApiConfigured) {
    labelManagementMessage.value = '本機模式無法同步標籤管理'
    return
  }

  const orderLabels = normalizeLabelManagementDrafts()
  if (orderLabels.length === 0) {
    labelManagementMessage.value = '至少保留 1 個訂單標籤'
    return
  }

  isLabelManagementSaving.value = true
  labelManagementMessage.value = '儲存標籤中'

  try {
    const nextSettings: CustomerEngagementSettings = {
      ...engagementSettings.value,
      orderLabels,
    }
    const savedSettings = await updateAdminSetting<CustomerEngagementSettings>('engagement_settings', nextSettings)
    engagementSettings.value = savedSettings
    labelManagementDrafts.value = cloneOrderLabelSettings(savedSettings.orderLabels)
    labelManagementMessage.value = `已儲存 ${savedSettings.orderLabels.length} 個訂單標籤`
  } catch (error) {
    labelManagementMessage.value = `儲存失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isLabelManagementSaving.value = false
  }
}

const refreshDeviceManagementAction = async (): Promise<void> => {
  isDeviceManagementRefreshing.value = true
  deviceManagementMessage.value = '重新整理裝置狀態中'

  try {
    await refreshBackendData()
    deviceManagementMessage.value = `已更新 · ${formatOrderTime(new Date().toISOString())}`
  } catch (error) {
    deviceManagementMessage.value = `重新整理失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isDeviceManagementRefreshing.value = false
  }
}

const cancelAllUnprintedPrintJobsAction = async (): Promise<void> => {
  if (!requireBackendEditMode('取消未印出單據')) {
    return
  }

  const jobs = unprintedPrintJobs.value
  if (jobs.length === 0) {
    deviceManagementMessage.value = '目前沒有未印出的單據'
    return
  }

  isDeviceManagementCancelling.value = true
  deviceManagementMessage.value = `取消 ${jobs.length} 筆未印出單據中`

  try {
    for (const job of jobs) {
      await deletePrintJobForOrder(job.orderId, job.printJob.id)
    }
    await refreshBackendData()
    deviceManagementMessage.value = `已取消 ${jobs.length} 筆未印出單據`
  } catch (error) {
    deviceManagementMessage.value = `取消失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isDeviceManagementCancelling.value = false
  }
}

const latestCustomerActivityLabel = (member: PosMember): string => {
  const latestLedgerEntry = [...member.ledger].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0]
  return latestLedgerEntry ? formatOrderTime(latestLedgerEntry.createdAt) : formatOrderTime(member.updatedAt)
}

const loadCustomerManagementMembers = async (): Promise<void> => {
  if (!requireBackendEditMode('讀取顧客資訊')) {
    return
  }

  if (!isPosApiConfigured) {
    customerManagementMessage.value = '本機模式無法同步顧客資訊'
    return
  }

  isCustomerManagementLoading.value = true
  customerManagementMessage.value = '載入顧客資訊中'

  try {
    customerManagementMembers.value = await fetchAdminMembers(80, customerManagementSearchTerm.value)
    customerManagementMessage.value = `已載入 ${customerManagementMembers.value.length} 位顧客`
  } catch (error) {
    customerManagementMessage.value = `載入失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isCustomerManagementLoading.value = false
  }
}

const createCustomerManagementMember = async (): Promise<void> => {
  if (!requireBackendEditMode('新增顧客資訊')) {
    return
  }

  if (!isPosApiConfigured) {
    customerManagementMessage.value = '本機模式無法新增顧客資訊'
    return
  }

  const displayName = customerManagementDraft.value.displayName.trim()
  const phone = customerManagementDraft.value.phone.trim()
  if (!displayName && !phone) {
    customerManagementMessage.value = '請輸入姓名或電話'
    return
  }

  isCustomerManagementCreating.value = true
  customerManagementMessage.value = '新增顧客中'

  try {
    const member = await createAdminMember({
      lineUserId: '',
      displayName: displayName || phone,
      phone,
      customerType: customerManagementDraft.value.customerType.trim() || '一般顧客',
      pointsBalance: Math.max(0, Math.trunc(customerManagementDraft.value.pointsBalance || 0)),
      openingBalance: Math.max(0, Math.trunc(customerManagementDraft.value.openingBalance || 0)),
      note: 'POS 顧客資訊管理新增',
    })
    customerManagementMembers.value = [member, ...customerManagementMembers.value.filter((entry) => entry.id !== member.id)]
    customerManagementDraft.value = {
      displayName: '',
      phone: '',
      customerType: customerManagementDraft.value.customerType,
      pointsBalance: 0,
      openingBalance: 0,
    }
    customerManagementMessage.value = `已新增 ${member.displayName}`
  } catch (error) {
    customerManagementMessage.value = `新增失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isCustomerManagementCreating.value = false
  }
}

const inventoryCategoryName = (categoryId: string): string =>
  inventoryCategories.value.find((category) => category.id === categoryId)?.name ?? '未分類'

const inventoryQuantityLabel = (quantity: number, unit: string): string =>
  `${Number.isInteger(quantity) ? Math.trunc(quantity) : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} ${unit}`

const inventoryStockTone = (item: InventoryItem): 'danger' | 'warning' | 'ok' => {
  if (item.lowStockQuantity !== null && item.stockQuantity <= item.lowStockQuantity) {
    return item.stockQuantity <= 0 ? 'danger' : 'warning'
  }

  return 'ok'
}

const inventoryRecordDeltaLabel = (record: InventoryRecord, item?: InventoryItem | null): string => {
  const unit = item?.unit ?? ''
  const delta = record.quantityDelta
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${inventoryQuantityLabel(delta, unit).trim()}`
}

const syncInventoryDraftCategory = (): void => {
  const fallbackCategoryId = activeInventoryCategories.value[0]?.id ?? inventoryCategories.value[0]?.id ?? ''
  if (!inventoryItemDraft.value.categoryId || !inventoryCategories.value.some((category) => category.id === inventoryItemDraft.value.categoryId)) {
    inventoryItemDraft.value.categoryId = fallbackCategoryId
  }
  if (inventoryCategoryFilter.value !== 'all' && !inventoryCategories.value.some((category) => category.id === inventoryCategoryFilter.value)) {
    inventoryCategoryFilter.value = 'all'
  }
}

const loadInventoryManagement = async (): Promise<void> => {
  if (!requireBackendEditMode('讀取庫存管理')) {
    return
  }

  if (!isPosApiConfigured) {
    inventoryMessage.value = '本機模式無法同步庫存管理'
    return
  }

  isInventoryLoading.value = true
  inventoryMessage.value = '載入庫存管理中'

  try {
    const inventory = await fetchAdminInventory(120)
    inventoryCategories.value = inventory.categories
    inventoryItems.value = inventory.items
    inventoryRecords.value = inventory.records
    syncInventoryDraftCategory()
    if (!selectedInventoryItem.value) {
      inventorySelectedItemId.value = filteredInventoryItems.value[0]?.id ?? ''
    }
    inventoryMessage.value = `已載入 ${inventory.items.length} 個庫存品項、${inventory.records.length} 筆紀錄`
  } catch (error) {
    inventoryMessage.value = `載入失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isInventoryLoading.value = false
  }
}

const createInventoryCategoryAction = async (): Promise<void> => {
  if (!requireBackendEditMode('新增庫存類別')) {
    return
  }

  if (!isPosApiConfigured) {
    inventoryMessage.value = '本機模式無法新增庫存類別'
    return
  }

  const name = inventoryCategoryDraft.value.name.trim()
  if (!name) {
    inventoryMessage.value = '請輸入庫存類別名稱'
    return
  }

  isInventorySaving.value = true
  inventoryMessage.value = '新增庫存類別中'

  try {
    const category = await createInventoryCategory({
      name,
      sortOrder: inventoryCategories.value.length * 10 + 10,
      isActive: true,
    })
    inventoryCategories.value = [...inventoryCategories.value, category]
    inventoryCategoryDraft.value.name = ''
    inventoryItemDraft.value.categoryId = category.id
    inventoryCategoryFilter.value = category.id
    inventoryMessage.value = `已新增庫存類別 ${category.name}`
  } catch (error) {
    inventoryMessage.value = `新增類別失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isInventorySaving.value = false
  }
}

const createInventoryItemAction = async (): Promise<void> => {
  if (!requireBackendEditMode('新增庫存品項')) {
    return
  }

  if (!isPosApiConfigured) {
    inventoryMessage.value = '本機模式無法新增庫存品項'
    return
  }

  const categoryId = inventoryItemDraft.value.categoryId || activeInventoryCategories.value[0]?.id
  if (!categoryId) {
    inventoryMessage.value = '請先新增庫存類別'
    return
  }

  const name = inventoryItemDraft.value.name.trim()
  if (!name) {
    inventoryMessage.value = '請輸入庫存品項名稱'
    return
  }

  isInventorySaving.value = true
  inventoryMessage.value = '新增庫存品項中'

  try {
    const item = await createInventoryItem({
      categoryId,
      name,
      unit: inventoryItemDraft.value.unit.trim() || '份',
      defaultUnitCost: Math.max(0, Math.trunc(inventoryItemDraft.value.defaultUnitCost || 0)),
      stockQuantity: Number(inventoryItemDraft.value.stockQuantity) || 0,
      lowStockQuantity: Number.isFinite(Number(inventoryItemDraft.value.lowStockQuantity))
        ? Math.max(0, Number(inventoryItemDraft.value.lowStockQuantity))
        : null,
      note: inventoryItemDraft.value.note.trim(),
      isActive: true,
      sortOrder: inventoryItems.value.length * 10 + 10,
    })
    inventoryItems.value = [...inventoryItems.value, item]
    inventorySelectedItemId.value = item.id
    inventoryItemDraft.value = {
      categoryId,
      name: '',
      unit: inventoryItemDraft.value.unit || '份',
      defaultUnitCost: item.defaultUnitCost,
      stockQuantity: 0,
      lowStockQuantity: item.lowStockQuantity ?? 0,
      note: '',
    }
    inventoryOperationDraft.value.unitCost = item.defaultUnitCost
    inventoryMessage.value = `已新增庫存品項 ${item.name}`
  } catch (error) {
    inventoryMessage.value = `新增品項失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isInventorySaving.value = false
  }
}

const applyInventoryRecordToLocalState = (record: InventoryRecord): void => {
  inventoryRecords.value = [record, ...inventoryRecords.value.filter((entry) => entry.id !== record.id)].slice(0, 160)
  inventoryItems.value = inventoryItems.value.map((item) =>
    item.id === record.itemId ? { ...item, stockQuantity: record.quantityAfter, updatedAt: record.createdAt } : item,
  )
}

const createInventoryRecordAction = async (): Promise<void> => {
  if (!requireBackendEditMode('新增庫存操作')) {
    return
  }

  if (!isPosApiConfigured) {
    inventoryMessage.value = '本機模式無法新增庫存操作'
    return
  }

  const item = selectedInventoryItem.value
  if (!item) {
    inventoryMessage.value = '請先選擇庫存品項'
    return
  }

  const action = inventoryOperationDraft.value.action
  const quantity = Number(inventoryOperationDraft.value.quantity)
  const countedQuantity = Number(inventoryOperationDraft.value.countedQuantity)
  if (action !== 'count' && (!Number.isFinite(quantity) || quantity <= 0)) {
    inventoryMessage.value = '請輸入大於 0 的庫存操作數量'
    return
  }
  if (action === 'count' && !Number.isFinite(countedQuantity)) {
    inventoryMessage.value = '盤點需輸入目前實際存量'
    return
  }

  isInventorySaving.value = true
  inventoryMessage.value = `${inventoryActionLabels[action]}同步中`

  try {
    const unitCost = Math.max(0, Math.trunc(Number(inventoryOperationDraft.value.unitCost) || item.defaultUnitCost || 0))
    const operationQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
    const draftTotalCost = Number(inventoryOperationDraft.value.totalCost)
    const totalCost = Math.max(
      0,
      Math.trunc(Number.isFinite(draftTotalCost) && draftTotalCost > 0 ? draftTotalCost : unitCost * operationQuantity),
    )
    const recordPayload = {
      itemId: item.id,
      action,
      unitCost: ['purchase', 'return'].includes(action) ? unitCost : 0,
      totalCost: ['purchase', 'return'].includes(action) ? totalCost : 0,
      note: inventoryOperationDraft.value.note.trim(),
    }
    const record = await createInventoryRecord(
      action === 'count'
        ? { ...recordPayload, countedQuantity }
        : { ...recordPayload, quantity },
    )
    applyInventoryRecordToLocalState(record)
    inventoryOperationDraft.value = {
      action,
      quantity: 0,
      unitCost,
      totalCost: 0,
      countedQuantity: record.quantityAfter,
      note: '',
    }
    inventoryMessage.value = `${item.name} 已${inventoryActionLabels[action]}，目前 ${inventoryQuantityLabel(record.quantityAfter, item.unit)}`
  } catch (error) {
    inventoryMessage.value = `操作失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isInventorySaving.value = false
  }
}

const deactivateInventoryItemAction = async (item: InventoryItem): Promise<void> => {
  if (!requireBackendEditMode('停用庫存品項')) {
    return
  }

  isInventorySaving.value = true
  inventoryMessage.value = `停用 ${item.name} 中`

  try {
    const updated = await updateInventoryItem(item.id, {
      categoryId: item.categoryId,
      name: item.name,
      unit: item.unit,
      defaultUnitCost: item.defaultUnitCost,
      stockQuantity: item.stockQuantity,
      lowStockQuantity: item.lowStockQuantity,
      note: item.note,
      isActive: false,
      sortOrder: item.sortOrder,
    })
    inventoryItems.value = inventoryItems.value.map((entry) => entry.id === updated.id ? updated : entry)
    if (inventorySelectedItemId.value === updated.id) {
      inventorySelectedItemId.value = filteredInventoryItems.value[0]?.id ?? ''
    }
    inventoryMessage.value = `${item.name} 已停用，歷史紀錄仍保留`
  } catch (error) {
    inventoryMessage.value = `停用失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isInventorySaving.value = false
  }
}

const submitTimeClockAction = async (): Promise<void> => {
  const staffCode = timeClockStaffCode.value.trim()

  if (!staffCode) {
    timeClockMessage.value = '請輸入員工識別碼'
    return
  }

  if (!isPosApiConfigured) {
    timeClockMessage.value = '本機模式無法同步打卡'
    return
  }

  isTimeClockSubmitting.value = true
  timeClockMessage.value = '打卡同步中'

  try {
    const entry = await createStaffTimeClockEntry(staffCode, timeClockNote.value.trim())
    latestTimeClockEntry.value = entry
    timeClockStaffCode.value = ''
    timeClockNote.value = ''
    timeClockMessage.value = `${entry.staffName} 已${entry.eventType === 'clock-in' ? '上班' : '下班'}打卡 · ${formatOrderTime(entry.createdAt)}`
  } catch (error) {
    timeClockMessage.value = `打卡失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isTimeClockSubmitting.value = false
  }
}

const runToolboxAction = (action: ToolboxAction): void => {
  if (action === 'floor') {
    setWorkspaceTab('floor')
  }

  if (action === 'order') {
    void startTakeoutOrder()
  }

  if (action === 'queue') {
    setWorkspaceTab('queue')
  }

  if (action === 'reservations') {
    setWorkspaceTab('reservations')
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

  if (action === 'time-clock') {
    activeToolboxPanel.value = 'time-clock'
    return
  }

  if (action === 'current-sales') {
    activeToolboxPanel.value = 'current-sales'
    return
  }

  if (action === 'system-info') {
    activeToolboxPanel.value = 'system-info'
    return
  }

  if (action === 'transactions') {
    activeToolboxPanel.value = 'transactions'
    return
  }

  if (action === 'cash-drawer') {
    activeToolboxPanel.value = 'cash-drawer'
    void loadCashDrawerEvents()
    return
  }

  if (action === 'label-management') {
    syncLabelManagementDrafts()
    activeToolboxPanel.value = 'label-management'
    return
  }

  if (action === 'device-management') {
    activeToolboxPanel.value = 'device-management'
    return
  }

  if (action === 'customer-management') {
    activeToolboxPanel.value = 'customer-management'
    if (backendEditModeEnabled.value && customerManagementMembers.value.length === 0) {
      void loadCustomerManagementMembers()
    }
    return
  }

  if (action === 'inventory-management') {
    activeToolboxPanel.value = 'inventory-management'
    if (backendEditModeEnabled.value && inventoryCategories.value.length === 0 && inventoryItems.value.length === 0) {
      void loadInventoryManagement()
    }
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
  if (tab === 'floor') {
    activeFloorServiceView.value = 'dine-in'
  }
  if (tab === 'queue') {
    activeFloorServiceView.value = 'takeout-delivery'
  }
  activeWorkspaceTab.value = tab
  if (tab === 'reservations') {
    void refreshReservations()
  }
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

const markOnlineReminderReadFromDetail = (order: PosOrder): void => {
  markOnlineOrderRemindersSeen([order.id])
  closeOnlineReminderDetail()
}

const acceptOnlineReminderOrder = async (order: PosOrder): Promise<void> => {
  if (!(await verifyProtectedPermissions([
    {
      permission: 'manageOnlineOrders',
      title: accessPermissionLabels.manageOnlineOrders,
      detail: `${compactOrderId(order.id)} 接單並出單至廚房前需驗證員工識別碼。`,
    },
  ]))) {
    return
  }

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
  if (!(await verifyProtectedPermissions([
    {
      permission: 'cancelOnlineOrders',
      title: accessPermissionLabels.cancelOnlineOrders,
      detail: `${compactOrderId(order.id)} 拒絕接單前需驗證員工識別碼。`,
    },
  ]))) {
    return
  }

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

const startTakeoutOrder = async (): Promise<void> => {
  if (!(await verifyProtectedPermissions([
    openOrderPermissionStep('建立外帶訂單前需驗證員工識別碼。'),
  ]))) {
    return
  }

  await startCounterDraft('takeout')
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
    activeWorkspaceTab.value = 'floor'
    globalThis.history.replaceState(null, '', globalThis.location.pathname)
    return
  }

  activeView.value = view
  if (view === 'pos') {
    activeWorkspaceTab.value = 'floor'
  }

  if (isConsumerDomain) {
    return
  }

  const params = new URLSearchParams(globalThis.location.search)
  params.set('view', view === 'online' ? 'order' : view)
  globalThis.history.replaceState(null, '', `${globalThis.location.pathname}?${params.toString()}`)
}

const stationBatchProductIdSet = computed(() => new Set(stationBatchProductIds.value))
const isStationBatchBusy = computed(() => isSupplyBatchRunning.value || stationBatchProductIds.value.length > 0)

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
      comboProductAssignments.value = removeProductFromComboAssignments(product.id)
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
    supplyPeriods: [...engagementSettings.value.supplyRules.defaultPeriods],
    futureOrderAvailable: engagementSettings.value.supplyRules.allowFutureOrdersAcrossDay,
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
  comboProductAssignments.value = removeProductFromComboAssignments(product.id)
  productSupplyStatuses.value = withoutRecordKey(productSupplyStatuses.value, product.id)
  supplyActionMessage.value = `${product.name} 已刪除`
}

const managedComboGroupsForProduct = (product: MenuItem): ComboProductGroup[] =>
  comboProductAssignments.value[product.id] ?? []

const comboChoiceProductsForProduct = (product: MenuItem): MenuItem[] =>
  knownMenuProducts.value
    .filter((entry) => entry.id !== product.id)
    .sort((first, second) =>
      categoryLabelFor(first.category).localeCompare(categoryLabelFor(second.category), 'zh-Hant') ||
      first.sortOrder - second.sortOrder ||
      first.name.localeCompare(second.name, 'zh-Hant'),
    )

const replaceComboGroupsForProduct = (productId: string, groups: ComboProductGroup[]): void => {
  comboProductAssignments.value = groups.length > 0
    ? { ...comboProductAssignments.value, [productId]: groups }
    : withoutRecordKey(comboProductAssignments.value, productId)
}

const removeProductFromComboAssignments = (productId: string): OnlineOrderingSettings['comboProductAssignments'] =>
  Object.entries(comboProductAssignments.value).reduce<OnlineOrderingSettings['comboProductAssignments']>(
    (assignments, [comboProductId, groups]) => {
      if (comboProductId === productId) {
        return assignments
      }

      const nextGroups = groups
        .map((group) => ({
          ...group,
          choices: group.choices.filter((choice) => choice.productId !== productId),
        }))
        .filter((group) => group.choices.length > 0)

      if (nextGroups.length > 0) {
        assignments[comboProductId] = nextGroups
      }
      return assignments
    },
    {},
  )

const addComboGroupToProduct = (product: MenuItem): void => {
  const existingGroups = managedComboGroupsForProduct(product)
  const existingIds = new Set(existingGroups.map((group) => group.id))
  const id = uniqueId(`${product.id}-combo`, existingIds)
  const firstChoice = comboChoiceProductsForProduct(product)[0]
  if (!firstChoice) {
    supplyActionMessage.value = '至少需要另一個商品才能建立套餐子項目'
    return
  }

  pushSupplyUndo('新增套餐子項目')
  const group: ComboProductGroup = {
    id,
    label: `套餐子項目 ${existingGroups.length + 1}`,
    required: true,
    min: 1,
    max: 1,
    allowRepeat: false,
    requirement: comboRequirement(true, 1, 1, false),
    choices: [{ productId: firstChoice.id, priceDelta: 0 }],
  }
  replaceComboGroupsForProduct(product.id, [...existingGroups, group])
  supplyActionMessage.value = `${product.name} 已新增套餐子項目`
}

const deleteComboGroupFromProduct = (product: MenuItem, groupId: string): void => {
  const group = managedComboGroupsForProduct(product).find((entry) => entry.id === groupId)
  pushSupplyUndo('刪除套餐子項目')
  replaceComboGroupsForProduct(product.id, managedComboGroupsForProduct(product).filter((entry) => entry.id !== groupId))
  supplyActionMessage.value = `${group?.label ?? '套餐子項目'} 已刪除`
}

const updateComboGroup = (product: MenuItem, groupId: string, patch: Partial<ComboProductGroup>): void => {
  const groups = managedComboGroupsForProduct(product)
  replaceComboGroupsForProduct(product.id, groups.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    const required = typeof patch.required === 'boolean' ? patch.required : group.required
    const max = Math.max(1, Math.min(12, Math.trunc(Number(patch.max ?? group.max) || 1)))
    const min = required ? Math.max(1, Math.min(max, Math.trunc(Number(patch.min ?? group.min) || 1))) : 0
    const allowRepeat = typeof patch.allowRepeat === 'boolean' ? patch.allowRepeat : group.allowRepeat
    const label = typeof patch.label === 'string' && normalizeSpace(patch.label)
      ? normalizeSpace(patch.label).slice(0, 40)
      : group.label

    return {
      ...group,
      ...patch,
      label,
      required,
      min,
      max,
      allowRepeat,
      requirement: comboRequirement(required, min, max, allowRepeat),
    }
  }))
  supplyHasUnsavedChanges.value = true
}

const comboGroupHasChoice = (group: ComboProductGroup, productId: string): boolean =>
  group.choices.some((choice) => choice.productId === productId)

const toggleComboGroupChoice = (product: MenuItem, groupId: string, choiceProductId: string): void => {
  pushSupplyUndo('調整套餐品項')
  replaceComboGroupsForProduct(product.id, managedComboGroupsForProduct(product).map((group) => {
    if (group.id !== groupId) {
      return group
    }

    const exists = comboGroupHasChoice(group, choiceProductId)
    const choices = exists
      ? group.choices.filter((choice) => choice.productId !== choiceProductId)
      : [...group.choices, { productId: choiceProductId, priceDelta: 0 }]
    return choices.length > 0 ? { ...group, choices } : group
  }))
}

const updateComboGroupChoicePrice = (
  product: MenuItem,
  groupId: string,
  choiceProductId: string,
  priceDelta: number,
): void => {
  replaceComboGroupsForProduct(product.id, managedComboGroupsForProduct(product).map((group) => {
    if (group.id !== groupId) {
      return group
    }

    return {
      ...group,
      choices: group.choices.map((choice) =>
        choice.productId === choiceProductId
          ? { ...choice, priceDelta: Math.trunc(Number(priceDelta) || 0) }
          : choice,
      ),
    }
  }))
  supplyHasUnsavedChanges.value = true
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
): Promise<boolean> => {
  if (row.status === status) {
    return true
  }

  if (options.recordUndo !== false) {
    pushSupplyUndo('變更供應狀態')
  }

  if (row.kind === 'product') {
    const updated = await updateProductSupplyStatus(row.id, status)
    if (updated) {
      setProductSupplyStatus(row.id, status)
    }
    return updated
  }

  setNoteSupplyStatus(row.id, status)
  return true
}

const updateVisibleSupplyRows = async (status: ProductSupplyStatus): Promise<void> => {
  if (isStationBatchBusy.value) {
    return
  }

  const targetRows = [...visibleSupplyRows.value.filter((row) => row.status !== status)]
  if (targetRows.length === 0) {
    supplyBatchStatusSelection.value = ''
    return
  }

  pushSupplyUndo('批次變更供應狀態')
  isSupplyBatchRunning.value = true
  stationBatchProductIds.value = targetRows.filter((row) => row.kind === 'product').map((row) => row.id)
  try {
    let updatedCount = 0
    for (const row of targetRows) {
      if (await updateSupplyRowStatus(row, status, { recordUndo: false })) {
        updatedCount += 1
      }
    }
    supplyActionMessage.value = updatedCount === targetRows.length
      ? `已批次更新 ${targetRows.length} 個項目為${supplyStatusLabel(status)}`
      : `已更新 ${updatedCount}/${targetRows.length} 個項目，其餘未完成`
  } finally {
    stationBatchProductIds.value = []
    isSupplyBatchRunning.value = false
    supplyBatchStatusSelection.value = ''
  }
}

const updateVisibleSupplyRowsFromSelection = async (): Promise<void> => {
  const status = supplyBatchStatusSelection.value
  if (!isProductSupplyStatus(status)) {
    return
  }

  await updateVisibleSupplyRows(status)
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
    registerStaffCode.value,
  )
}

const createRegisterCashAdjustmentAction = async (): Promise<void> => {
  if (!requireBackendEditMode('登記現金臨時收支')) {
    return
  }

  if (!(await verifyProtectedPermissions([
    {
      permission: 'manageCashDrawer',
      title: accessPermissionLabels.manageCashDrawer,
      detail: '登記現金臨時收支前需驗證員工識別碼。',
    },
  ]))) {
    return
  }

  const created = await createRegisterCashAdjustmentForStation(
    registerCashAdjustmentKind.value,
    registerCashAdjustmentAmount.value,
    registerCashAdjustmentReason.value,
    registerCashAdjustmentNote.value,
  )

  if (created) {
    registerCashAdjustmentAmount.value = 0
    registerCashAdjustmentReason.value = ''
    registerCashAdjustmentNote.value = ''
  }
}

const openCashDrawerAction = async (): Promise<void> => {
  if (!requireBackendEditMode('開啟錢櫃')) {
    cashDrawerActionMessage.value = '開啟錢櫃需先進入後台編輯模式'
    return
  }

  if (!(await verifyProtectedPermissions([
    {
      permission: 'manageCashDrawer',
      title: accessPermissionLabels.manageCashDrawer,
      detail: '手動開啟錢櫃前需驗證員工識別碼。',
    },
  ]))) {
    return
  }

  isCashDrawerOpening.value = true
  cashDrawerActionMessage.value = '錢櫃開啟中'

  try {
    const event = await openCashDrawerForStation({
      reason: cashDrawerReason.value.trim() || '手動開啟錢櫃',
      deviceId: activeCashDrawerDevice.value?.id ?? '',
      targetStationId: cashDrawerTargetStation.value?.id ?? activeCashDrawerDevice.value?.targetStationId ?? '',
    })
    cashDrawerActionMessage.value = `${cashDrawerDeliveryLabel(event.deliveryStatus)} · ${formatOrderTime(event.createdAt)}`
  } catch (error) {
    cashDrawerActionMessage.value = `錢櫃開啟失敗：${error instanceof Error ? error.message : '未知錯誤'}`
  } finally {
    isCashDrawerOpening.value = false
  }
}

watch(
  registerSession,
  (session) => {
    if (session?.status === 'open') {
      registerClosingCash.value = session.expectedCash
      forceCloseRegister.value = false
    } else {
      registerStaffCode.value = ''
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

watch(floorPlanSettings, (settings) => {
  applyFloorPlanSettings(settings)
}, { deep: true })

watch(activeFloorId, (floorId) => {
  if (!floorLevels.value.some((floor) => floor.id === floorId)) {
    activeFloorId.value = floorLevels.value[0]?.id ?? '1F'
    return
  }

  if (!activeFloorTables.value.some((table) => table.id === selectedFloorTableId.value)) {
    selectedFloorTableId.value = activeFloorTables.value[0]?.id ?? null
  }
})

watch([floorLevels, activeFloorId, floorTables, floorDisplayPreferences, floorPartySizes, waitlineEntries], () => {
  persistFloorPlanSettings()
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

watch(comboProductAssignments, (assignments) => {
  writeComboProductAssignments(assignments)
}, { deep: true })

watch(onlineOrderingSettings, (settings) => {
  applyRuntimeSupplyConfig(settings)
}, { immediate: true, deep: true })

watch(supplyCategoryOptions, (options) => {
  if (!options.some((option) => option.value === supplyCategoryFilter.value)) {
    supplyCategoryFilter.value = options[0]?.value ?? supplyNotesFilterValue
  }
}, { immediate: true })

watch([reservationSelectedDate, reservationViewMode], () => {
  if (activeWorkspaceTab.value === 'reservations') {
    void refreshReservations()
  }
})

const handleInventoryRealtimeRefresh = (): void => {
  if (activeToolboxPanel.value === 'inventory-management' && backendEditModeEnabled.value) {
    void loadInventoryManagement()
  }
}

onMounted(() => {
  updatePosStableViewportHeight(true)
  void refreshReservations()
  globalThis.addEventListener('keydown', handlePosShortcut)
  globalThis.addEventListener('script-coffee-pos-inventory-management-changed', handleInventoryRealtimeRefresh)
  globalThis.addEventListener('resize', handleViewportResize)
  globalThis.addEventListener('orientationchange', scheduleForcedViewportRefresh)
  globalThis.visualViewport?.addEventListener('resize', handleViewportResize)
  claimClockTimer = globalThis.setInterval(() => {
    currentTime.value = Date.now()
  }, 15_000)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', handlePosShortcut)
  globalThis.removeEventListener('script-coffee-pos-inventory-management-changed', handleInventoryRealtimeRefresh)
  globalThis.removeEventListener('resize', handleViewportResize)
  globalThis.removeEventListener('orientationchange', scheduleForcedViewportRefresh)
  globalThis.visualViewport?.removeEventListener('resize', handleViewportResize)
  if (claimClockTimer !== null) {
    globalThis.clearInterval(claimClockTimer)
  }
  clearBackendEditTapTimer()
  clearToolboxBackendEditLongPressTimer()
  clearAppearancePersistTimer()
  clearFloorPlanPersistTimer()
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
      'pos-shell--consumer': activeView === 'online' || activeView === 'reservation',
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
    <ConsumerReservationPage v-else-if="activeView === 'reservation'" />

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
              'pos-main-surface--queue': activeWorkspaceTab === 'queue' || activeWorkspaceTab === 'floor' || activeWorkspaceTab === 'reservations',
            }"
          >
            <header
              v-if="activeWorkspaceTab !== 'order'"
              class="pos-command-bar"
              :class="{ 'pos-command-bar--queue': activeWorkspaceTab === 'queue' || activeWorkspaceTab === 'floor' || activeWorkspaceTab === 'reservations' }"
            >
              <div>
                <template v-if="activeWorkspaceTab === 'floor' || activeWorkspaceTab === 'queue' || activeWorkspaceTab === 'reservations'">
                  <h1>{{ activeWorkspaceTitle }}</h1>
                </template>
                <template v-else>
                  <p class="eyebrow">Workspace</p>
                  <h1>{{ activeWorkspaceTitle }}</h1>
                  <span>{{ registerStatusLabel }} · {{ currentClockLabel }}</span>
                </template>
              </div>
              <div v-if="activeWorkspaceTab === 'floor'" class="queue-command-actions floor-command-actions">
                <span>{{ activeFloorLabel }} · {{ activeFloorOrderCount }} 桌內用</span>
                <span>{{ floorLevels.length }} 樓層 · {{ activeFloorTables.length }} 桌</span>
                <span>候位 {{ waitlineEntries.length }} 組 · {{ waitlinePeopleCount }} 人</span>
                <button class="primary-button queue-new-order-button" type="button" @click="addWaitlineEntry">
                  <UsersRound :size="22" aria-hidden="true" />
                  新增候位
                </button>
              </div>
              <div v-else-if="activeWorkspaceTab === 'queue'" class="queue-command-actions">
                <span>{{ pendingOrders.length }} 張待處理</span>
                <span>顯示 {{ visibleQueueOrders.length }} 張 · 全部 {{ queueBaseOrders.length }} 張</span>
                <button class="primary-button queue-new-order-button" type="button" @click="startTakeoutOrder">
                  <ShoppingBag :size="22" aria-hidden="true" />
                  新增外帶
                </button>
              </div>
              <div v-else-if="activeWorkspaceTab === 'reservations'" class="queue-command-actions">
                <span>{{ reservationRangeLabel }}</span>
                <span>{{ visibleReservations.length }} 筆 · 遲到 {{ lateReservationCount }} 筆</span>
                <button class="primary-button queue-new-order-button" type="button" :disabled="isReservationLoading" @click="refreshReservations">
                  <RefreshCw :size="22" aria-hidden="true" />
                  同步訂位
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
                    <button class="ticket-back-button" type="button" title="返回上一個工作區" @click="returnFromOrderWorkspace">
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
                    <article
                      v-for="line in cartLines"
                      :key="line.itemId"
                      class="cart-line"
                      :class="{ 'cart-line--print-paused': line.printPaused }"
                    >
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
                        <button type="button" title="減少" @click.stop="decreaseCartLineAction(line.itemId)">
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
                      <button
                        class="cart-line-print-toggle"
                        :class="{ 'cart-line-print-toggle--paused': line.printPaused }"
                        type="button"
                        :aria-pressed="line.printPaused === true"
                        :title="line.printPaused ? '恢復出單' : '暫停出單'"
                        @click.stop="toggleLinePrintPaused(line.itemId)"
                      >
                        <Printer :size="17" aria-hidden="true" />
                        <span>{{ line.printPaused ? '暫停' : '出單' }}</span>
                      </button>
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
                        <span>{{ productTotalDisplayEnabled ? '商品總數 ' : '' }}{{ ticketDisplayQuantity }} 件</span>
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
                        class="ticket-submit-button ticket-submit-button--secondary"
                        type="button"
                        :disabled="cartLines.length === 0"
                        @click="setWorkspaceTab('payment')"
                      >
                        <span class="ticket-action-icon">
                          <CreditCard :size="24" aria-hidden="true" />
                        </span>
                        <span class="ticket-action-label">付款/拆單</span>
                      </button>
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
                              @click="decreaseProductLineAction(item)"
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

                      <section v-for="group in activeComboGroups" :key="group.id" class="menu-option-group menu-option-group--combo">
                        <div class="menu-option-group-title">
                          <h4>{{ group.label }}</h4>
                          <span>{{ group.requirement }}</span>
                        </div>
                        <div class="menu-option-grid">
                          <div
                            v-for="choice in group.choices"
                            :key="`${group.id}-${choice.productId}`"
                            class="menu-option-choice menu-option-choice--combo"
                            :class="{ 'menu-option-choice--active': comboChoiceQuantity(group, choice.productId) > 0 }"
                          >
                            <button class="menu-option-choice-main" type="button" @click="toggleComboChoice(group, choice.productId)">
                              <span>{{ comboChoiceProduct(choice.productId)?.name ?? choice.productId }}</span>
                              <small v-if="choice.priceDelta">+{{ formatCurrency(choice.priceDelta) }}</small>
                            </button>
                            <span v-if="group.allowRepeat || group.max > 1" class="menu-option-choice-stepper">
                              <button type="button" title="減少套餐子項目" @click="decrementComboChoice(group, choice.productId)">
                                <Minus :size="14" aria-hidden="true" />
                              </button>
                              <strong>{{ comboChoiceQuantity(group, choice.productId) }}</strong>
                              <button type="button" title="增加套餐子項目" @click="incrementComboChoice(group, choice.productId)">
                                <Plus :size="14" aria-hidden="true" />
                              </button>
                            </span>
                            <div
                              v-if="comboChoiceQuantity(group, choice.productId) > 0 && comboOptionGroupsForProduct(choice.productId).length > 0"
                              class="menu-option-combo-notes"
                            >
                              <section v-for="noteGroup in comboOptionGroupsForProduct(choice.productId)" :key="`${group.id}-${choice.productId}-${noteGroup.id}`">
                                <div class="menu-option-combo-note-title">
                                  <span>{{ noteGroup.label }}</span>
                                  <small>{{ noteGroup.requirement }}</small>
                                </div>
                                <div class="menu-option-combo-note-grid">
                                  <button
                                    v-for="noteChoice in noteGroup.choices"
                                    :key="noteChoice.id"
                                    type="button"
                                    class="menu-option-combo-note-choice"
                                    :class="{ 'menu-option-combo-note-choice--active': comboOptionSelected(group.id, choice.productId, noteGroup, noteChoice) }"
                                    @click="toggleComboOptionChoice(group, choice.productId, noteGroup, noteChoice)"
                                  >
                                    <span>{{ noteChoice.label }}</span>
                                    <small v-if="noteChoice.priceDelta">+{{ formatCurrency(noteChoice.priceDelta) }}</small>
                                  </button>
                                </div>
                              </section>
                            </div>
                          </div>
                        </div>
                      </section>

                      <section class="menu-option-group menu-option-group--manual">
                        <div class="menu-option-group-title">
                          <h4>文字註記與加減價</h4>
                          <span>選填</span>
                        </div>
                        <div class="menu-option-manual-grid">
                          <label class="menu-option-manual-field menu-option-manual-field--wide">
                            文字註記
                            <input v-model="manualOptionNote" type="text" maxlength="80" placeholder="少醬、加熱" />
                          </label>
                          <label class="menu-option-manual-field">
                            + 加價
                            <input v-model.number="manualOptionIncrease" type="number" min="0" step="1" inputmode="numeric" />
                          </label>
                          <label class="menu-option-manual-field">
                            - 減價
                            <input v-model.number="manualOptionDecrease" type="number" min="0" step="1" inputmode="numeric" />
                          </label>
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
                <section v-if="activeWorkspaceTab === 'floor'" class="floor-section" aria-labelledby="floor-title">
                  <div class="floor-mode-switch" aria-label="訂單區域切換">
                    <button
                      type="button"
                      :class="{ 'floor-mode-button--active': activeFloorServiceView === 'dine-in' }"
                      @click="setWorkspaceTab('floor')"
                    >
                      內用
                    </button>
                    <button
                      type="button"
                      :class="{ 'floor-mode-button--active': activeFloorServiceView === 'takeout-delivery' }"
                      @click="setWorkspaceTab('queue')"
                    >
                      外帶 / 外送
                    </button>
                  </div>

                  <div class="floor-level-switch" aria-label="樓層切換">
                    <button
                      v-for="floor in floorLevels"
                      :key="floor.id"
                      type="button"
                      :class="{ 'floor-level-button--active': activeFloorId === floor.id }"
                      @click="setActiveFloor(floor.id)"
                    >
                      <strong>{{ floor.label }}</strong>
                      <span>{{ floorTables.filter((table) => table.floorId === floor.id).length }} 桌</span>
                    </button>
                    <button
                      v-if="backendEditModeEnabled"
                      type="button"
                      class="floor-level-button floor-level-button--add"
                      @click="addFloorLevel"
                    >
                      <Plus :size="16" aria-hidden="true" />
                      新樓層
                    </button>
                  </div>

                  <div class="floor-layout">
                    <section class="floor-map-panel" aria-labelledby="floor-title">
                      <header class="floor-panel-heading">
                        <div>
                          <p class="eyebrow">Dine In</p>
                          <h2 id="floor-title">{{ activeFloorLabel }} 桌位地圖</h2>
                          <span>
                            {{ activeFloorOrderCount }} 桌進行中 ·
                            {{ activeFloorTables.length }} 桌 · 候位 {{ waitlineEntries.length }} 組
                          </span>
                        </div>
                        <button class="secondary-button" type="button" @click="addWaitlineEntry">
                          <UsersRound :size="18" aria-hidden="true" />
                          新增候位
                        </button>
                      </header>

                      <div ref="floorMapRef" class="floor-map" aria-label="內用桌位">
                        <button
                          v-for="state in floorTableStates"
                          :key="state.table.id"
                          class="floor-table-card"
                          :class="[
                            `floor-table-card--${state.status}`,
                            {
                              'floor-table-card--selected': selectedFloorTable?.table.id === state.table.id,
                              'floor-table-card--editable': backendEditModeEnabled,
                              'floor-table-card--dragging': floorTableDragState?.tableId === state.table.id,
                            },
                          ]"
                          type="button"
                          :style="{ left: `${state.table.x}%`, top: `${state.table.y}%`, width: `${state.table.width}%` }"
                          @pointerdown="handleFloorTablePointerDown($event, state)"
                          @pointermove="handleFloorTablePointerMove"
                          @pointerup="handleFloorTablePointerUp"
                          @pointercancel="handleFloorTablePointerUp"
                          @click="selectFloorTable(state)"
                        >
                          <span class="floor-table-card-top">
                            <strong>{{ state.table.label }}</strong>
                            <small v-if="floorDisplayPreferences.showPeople">{{ state.peopleLabel }}</small>
                          </span>
                          <span v-if="nextReservationForTable(state.table.id)" class="floor-table-reservation">
                            {{ formatOrderTime(nextReservationForTable(state.table.id)?.reservedAt ?? '') }} 訂位
                          </span>
                          <span v-if="state.order" class="floor-table-order">
                            <strong>{{ state.amountLabel }}</strong>
                            <small v-if="floorDisplayPreferences.showOrderLabels">No. {{ state.orderLabel }}</small>
                          </span>
                          <span v-else class="floor-table-empty">
                            <Plus :size="28" aria-hidden="true" />
                          </span>
                          <span v-if="state.order" class="floor-table-metrics">
                            <small v-if="floorDisplayPreferences.showUnsubmittedWait">{{ state.waitLabel }}</small>
                            <small v-if="floorDisplayPreferences.showTableStay">{{ state.stayLabel }}</small>
                          </span>
                        </button>
                        <div v-if="floorTableStates.length === 0" class="empty-state floor-empty-state floor-map-empty-state">
                          <LayoutDashboard :size="24" aria-hidden="true" />
                          <span>此樓層尚未建立桌位</span>
                        </div>
                      </div>
                    </section>

                    <aside class="floor-side-panel" aria-label="桌位、候位與通知">
                      <section v-if="selectedFloorTable" class="floor-control-block">
                        <div class="floor-control-heading">
                          <div>
                            <span>目前桌位</span>
                            <strong>{{ selectedFloorTable.table.label }}</strong>
                          </div>
                          <small>{{ selectedFloorTable.status === 'empty' ? '空桌' : statusLabels[selectedFloorTable.order?.status ?? 'new'] }}</small>
                        </div>
                        <div class="floor-party-stepper" aria-label="桌位人數">
                          <button type="button" @click.stop="updateFloorPartySize(selectedFloorTable.table, -1)">
                            <Minus :size="16" aria-hidden="true" />
                          </button>
                          <strong>{{ floorPartySizes[selectedFloorTable.table.id] ?? selectedFloorTable.partySize }}/{{ selectedFloorTable.table.capacity }}</strong>
                          <button type="button" @click.stop="updateFloorPartySize(selectedFloorTable.table, 1)">
                            <Plus :size="16" aria-hidden="true" />
                          </button>
                        </div>
                        <div class="floor-control-actions">
                          <button
                            v-if="selectedFloorTable.order"
                            type="button"
                            class="secondary-button"
                            @click="openFloorTableOrder(selectedFloorTable)"
                          >
                            <ReceiptText :size="18" aria-hidden="true" />
                            開啟訂單
                          </button>
                          <button
                            v-if="selectedFloorTable.order"
                            type="button"
                            class="secondary-button"
                            :disabled="orderClaimedByOtherStation(selectedFloorTable.order)"
                            @click="markFloorTableServed(selectedFloorTable)"
                          >
                            <CheckCircle2 :size="18" aria-hidden="true" />
                            清桌
                          </button>
                          <button
                            v-else
                            type="button"
                            class="primary-button"
                            @click="startDineInTableOrder(selectedFloorTable.table)"
                          >
                            <ShoppingCart :size="18" aria-hidden="true" />
                            開桌點餐
                          </button>
                        </div>
                        <div
                          v-if="selectedFloorTable.order && emptyFloorTableStates.length > 0"
                          class="floor-transfer-actions"
                          aria-label="移桌"
                        >
                          <span>移桌</span>
                          <button
                            v-for="target in emptyFloorTableStates"
                            :key="`move-${target.table.id}`"
                            type="button"
                            :disabled="orderClaimedByOtherStation(selectedFloorTable.order)"
                            @click="transferFloorTableOrder(selectedFloorTable, target.table)"
                          >
                            {{ target.table.label }}
                          </button>
                        </div>
                      </section>

                      <section class="floor-control-block floor-waitline-block">
                        <div class="floor-control-heading">
                          <div>
                            <span>候位</span>
                            <strong>{{ waitlineEntries.length }} 組</strong>
                          </div>
                          <small>
                            <template v-if="floorDisplayPreferences.showWaitlinePeople">{{ waitlinePeopleCount }} 人</template>
                            <template v-if="floorDisplayPreferences.showWaitlineTime"> · 平均 {{ averageWaitlineMinutes }} min</template>
                          </small>
                        </div>
                        <div class="waitline-form" aria-label="新增候位">
                          <input v-model="waitlineDraft.name" type="text" placeholder="姓名/稱呼" />
                          <input v-model="waitlineDraft.phone" type="tel" inputmode="tel" placeholder="電話" />
                          <div class="waitline-form-party" aria-label="候位人數">
                            <button type="button" @click="updateWaitlineDraftPartySize(-1)">
                              <Minus :size="14" aria-hidden="true" />
                            </button>
                            <strong>{{ waitlineDraft.partySize }} 人</strong>
                            <button type="button" @click="updateWaitlineDraftPartySize(1)">
                              <Plus :size="14" aria-hidden="true" />
                            </button>
                          </div>
                          <input v-model="waitlineDraft.note" type="text" placeholder="備註/標籤" />
                          <button type="button" class="primary-button waitline-form-submit" @click="addWaitlineEntry">
                            加入
                          </button>
                        </div>
                        <div class="waitline-list">
                          <article v-for="entry in waitlineEntries" :key="entry.id" class="waitline-row">
                            <div>
                              <strong>{{ entry.name }}</strong>
                              <span>
                                {{ entry.partySize }} 人 · {{ elapsedMinuteLabel(entry.createdAt) }}
                                <template v-if="entry.phone"> · {{ entry.phone }}</template>
                                <template v-if="entry.note"> · {{ entry.note }}</template>
                              </span>
                              <small class="waitline-preorder-status">{{ waitlinePreorderSummary(entry) }}</small>
                            </div>
                            <div class="waitline-actions">
                              <button
                                type="button"
                                class="waitline-preorder-button"
                                @click="startWaitlinePreorder(entry)"
                              >
                                {{ entry.orderId ? '開啟點餐' : '提前點餐' }}
                              </button>
                              <button type="button" title="減少人數" @click="updateWaitlinePartySize(entry, -1)">
                                <Minus :size="14" aria-hidden="true" />
                              </button>
                              <button type="button" title="增加人數" @click="updateWaitlinePartySize(entry, 1)">
                                <Plus :size="14" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                :disabled="!selectedFloorTable || selectedFloorTable.status !== 'empty'"
                                @click="selectedFloorTable && seatWaitlineEntryAtTable(entry, selectedFloorTable.table)"
                              >
                                入座
                              </button>
                              <button type="button" title="移除候位" @click="removeWaitlineEntry(entry.id)">
                                <X :size="14" aria-hidden="true" />
                              </button>
                            </div>
                          </article>
                          <div v-if="waitlineEntries.length === 0" class="empty-state floor-empty-state">
                            <UsersRound :size="22" aria-hidden="true" />
                            <span>目前沒有候位</span>
                          </div>
                        </div>
                      </section>

                      <section class="floor-control-block floor-display-block">
                        <div class="floor-control-heading">
                          <div>
                            <span>顯示設定</span>
                            <strong>桌況資訊</strong>
                          </div>
                        </div>
                        <div class="floor-display-options">
                          <label>
                            <input v-model="floorDisplayPreferences.showPeople" type="checkbox" />
                            顯示人數
                          </label>
                          <label>
                            <input v-model="floorDisplayPreferences.showUnsubmittedWait" type="checkbox" />
                            顯示未出單等待
                          </label>
                          <label>
                            <input v-model="floorDisplayPreferences.showTableStay" type="checkbox" />
                            顯示店內滯留
                          </label>
                          <label>
                            <input v-model="floorDisplayPreferences.showWaitlinePeople" type="checkbox" />
                            顯示候位人數
                          </label>
                          <label>
                            <input v-model="floorDisplayPreferences.showWaitlineTime" type="checkbox" />
                            顯示候位等待
                          </label>
                          <label>
                            <input v-model="floorDisplayPreferences.showOrderLabels" type="checkbox" />
                            顯示訂單標籤
                          </label>
                        </div>
                        <small class="floor-sync-message">{{ floorPlanSyncMessage }}</small>
                      </section>

                      <section v-if="backendEditModeEnabled" class="floor-control-block floor-table-settings-block">
                        <div class="floor-control-heading">
                          <div>
                            <span>後台桌位地圖管理</span>
                            <strong>{{ activeFloorLabel }} · {{ activeFloorTables.length }} 桌</strong>
                          </div>
                          <div class="floor-admin-heading-actions">
                            <button class="text-button" type="button" @click="addFloorTable">新增桌位</button>
                            <button class="text-button" type="button" @click="resetFloorTablesToDefault">還原</button>
                          </div>
                        </div>
                        <div class="floor-admin-floor-list" aria-label="樓層管理">
                          <article v-for="floor in floorLevels" :key="`floor-setting-${floor.id}`" class="floor-admin-floor-row">
                            <button type="button" :class="{ 'floor-admin-floor-row--active': activeFloorId === floor.id }" @click="setActiveFloor(floor.id)">
                              {{ floor.label }}
                            </button>
                            <input
                              type="text"
                              :value="floor.label"
                              aria-label="樓層名稱"
                              @change="updateFloorLevelLabel(floor, ($event.target as HTMLInputElement).value)"
                            />
                            <button type="button" title="刪除樓層" @click="removeFloorLevel(floor)">
                              <Trash2 :size="14" aria-hidden="true" />
                            </button>
                          </article>
                          <button type="button" class="secondary-button floor-admin-add-button" @click="addFloorLevel">
                            <Plus :size="16" aria-hidden="true" />
                            新增樓層
                          </button>
                        </div>
                        <div class="floor-table-settings-list">
                          <article v-for="table in activeFloorTables" :key="`setting-${table.id}`" class="floor-table-setting-row">
                            <div class="floor-table-setting-main">
                              <button
                                class="floor-table-drag-handle"
                                type="button"
                                :aria-label="`拖曳調整 ${table.label} 位置`"
                                title="拖曳調整桌位位置"
                                @pointerdown.stop="handleFloorTableSettingDragStart($event, table)"
                                @pointermove.stop="handleFloorTablePointerMove"
                                @pointerup.stop="handleFloorTablePointerUp"
                                @pointercancel.stop="handleFloorTablePointerUp"
                              >
                                <GripVertical :size="16" aria-hidden="true" />
                              </button>
                              <div>
                                <input
                                  type="text"
                                  :value="table.label"
                                  aria-label="桌號"
                                  :disabled="Boolean(dineInOrderForTable(table.id))"
                                  @change="updateFloorTableLabel(table, ($event.target as HTMLInputElement).value)"
                                />
                                <span>{{ table.x }}%, {{ table.y }}% · 寬 {{ table.width }}%</span>
                              </div>
                            </div>
                            <div class="floor-table-position-grid" aria-label="桌位位置與大小">
                              <label>
                                X
                                <input
                                  type="number"
                                  min="4"
                                  max="92"
                                  :value="table.x"
                                  @change="updateFloorTableNumber(table, 'x', ($event.target as HTMLInputElement).value)"
                                />
                              </label>
                              <label>
                                Y
                                <input
                                  type="number"
                                  min="4"
                                  max="92"
                                  :value="table.y"
                                  @change="updateFloorTableNumber(table, 'y', ($event.target as HTMLInputElement).value)"
                                />
                              </label>
                              <label>
                                寬
                                <input
                                  type="number"
                                  min="10"
                                  max="36"
                                  :value="table.width"
                                  @change="updateFloorTableNumber(table, 'width', ($event.target as HTMLInputElement).value)"
                                />
                              </label>
                            </div>
                            <div class="floor-table-capacity-stepper" aria-label="桌位容納人數">
                              <button type="button" @click="updateFloorTableCapacity(table, -1)">
                                <Minus :size="14" aria-hidden="true" />
                              </button>
                              <strong>{{ table.capacity }} 人</strong>
                              <button type="button" @click="updateFloorTableCapacity(table, 1)">
                                <Plus :size="14" aria-hidden="true" />
                              </button>
                            </div>
                            <button class="text-button floor-table-delete-button" type="button" @click="removeFloorTable(table)">
                              刪除
                            </button>
                          </article>
                          <div v-if="activeFloorTables.length === 0" class="empty-state floor-empty-state">
                            <LayoutDashboard :size="22" aria-hidden="true" />
                            <span>此樓層尚未建立桌位</span>
                          </div>
                        </div>
                      </section>
                      <section v-else class="floor-control-block floor-table-settings-block">
                        <div class="floor-control-heading">
                          <div>
                            <span>桌位設定</span>
                            <strong>後台編輯模式</strong>
                          </div>
                        </div>
                        <small class="floor-sync-message">連點工具箱 6 下後，可新增樓層、改桌號、拖曳桌位、調整大小與刪除桌位。</small>
                      </section>

                      <section class="floor-control-block floor-notification-block">
                        <div class="floor-control-heading">
                          <div>
                            <span>通知中心</span>
                            <strong>{{ floorNotificationItems.length }} 則</strong>
                          </div>
                          <Bell :size="18" aria-hidden="true" />
                        </div>
                        <div class="floor-notification-list">
                          <button
                            v-for="item in floorNotificationItems"
                            :key="item.id"
                            type="button"
                            @click="openFloorNotificationTarget(item)"
                          >
                            <span>{{ item.dateLabel }}</span>
                            <strong>{{ item.title }}</strong>
                            <small>{{ item.summary }}</small>
                          </button>
                        </div>
                      </section>
                    </aside>
                  </div>
                </section>

                <section v-if="activeWorkspaceTab === 'reservations'" class="reservation-section" aria-labelledby="reservation-title">
                  <div class="reservation-layout">
                    <section class="reservation-main-panel">
                      <header class="panel-heading reservation-heading">
                        <div>
                          <p class="eyebrow">Reservations</p>
                          <h2 id="reservation-title">訂位時間軸</h2>
                          <span class="panel-note">{{ reservationMessage }}</span>
                        </div>
                        <CalendarDays :size="22" aria-hidden="true" />
                      </header>

                      <div class="reservation-toolbar">
                        <div class="segmented-control" aria-label="訂位檢視模式">
                          <button
                            v-for="mode in reservationViewModeOptions"
                            :key="mode.value"
                            class="segment-button"
                            :class="{ 'segment-button--active': reservationViewMode === mode.value }"
                            type="button"
                            @click="reservationViewMode = mode.value"
                          >
                            {{ mode.label }}
                          </button>
                        </div>
                        <input v-model="reservationSelectedDate" type="date" aria-label="訂位日期" />
                        <select v-model="reservationStatusFilter" aria-label="訂位狀態篩選">
                          <option v-for="option in reservationStatusOptions" :key="option.value" :value="option.value">
                            {{ option.label }}
                          </option>
                        </select>
                        <button class="secondary-button" type="button" :disabled="isReservationLoading" @click="refreshReservations">
                          <RefreshCw :size="18" aria-hidden="true" />
                          重新整理
                        </button>
                      </div>

                      <div v-if="reservationViewMode !== 'day'" class="reservation-summary-grid" aria-label="週月訂位摘要">
                        <article v-for="row in reservationSummaryRows" :key="row.dateKey" class="reservation-summary-card">
                          <span>{{ row.dateKey }}</span>
                          <strong>{{ row.count }} 組 · {{ row.people }} 人</strong>
                          <small>
                            入座 {{ row.seated }} · 遲到 {{ row.late }}
                            <template v-if="row.specialLabel"> · {{ row.specialLabel }}</template>
                          </small>
                        </article>
                        <div v-if="reservationSummaryRows.length === 0" class="empty-state">
                          <CalendarDays :size="22" aria-hidden="true" />
                          <span>此區間沒有訂位</span>
                        </div>
                      </div>

                      <div class="reservation-list" aria-label="訂位列表">
                        <article
                          v-for="reservation in visibleReservations"
                          :key="reservation.id"
                          class="reservation-row"
                          :class="[`reservation-row--${reservationTone(reservation)}`, { 'reservation-row--selected': selectedReservationEditId === reservation.id }]"
                        >
                          <div class="reservation-row-time">
                            <strong>{{ formatOrderTime(reservation.reservedAt) }}</strong>
                            <span>{{ reservationDateKey(reservation) }}</span>
                          </div>
                          <div class="reservation-row-body">
                            <div class="reservation-row-title">
                              <strong>{{ reservation.customerName }}</strong>
                              <span>{{ reservation.partySize }} 人 · {{ reservation.customerPhone || '無電話' }}</span>
                            </div>
                            <div class="reservation-row-meta">
                              <span>{{ reservationTableLabel(reservation) }}</span>
                              <span>{{ reservationStatusLabels[reservation.status] }}</span>
                              <span v-if="reservationSpecialDateLabel(reservation)" class="reservation-warning">
                                {{ reservationSpecialDateLabel(reservation) }}
                              </span>
                              <span v-if="reservation.importantLabel">{{ reservation.importantLabel }}</span>
                              <span v-for="warning in reservationWarnings(reservation)" :key="`${reservation.id}-${warning}`" class="reservation-warning">
                                {{ warning }}
                              </span>
                            </div>
                            <small v-if="reservation.note">{{ reservation.note }}</small>
                          </div>
                          <div class="reservation-row-actions">
                            <button class="secondary-button" type="button" @click="startEditingReservation(reservation)">
                              修改
                            </button>
                            <button
                              class="primary-button"
                              type="button"
                              :disabled="!reservationCanCheckIn(reservation) || reservationActionId === `${reservation.id}-check-in`"
                              @click="checkInReservation(reservation)"
                            >
                              <ShoppingCart :size="16" aria-hidden="true" />
                              帶位開單
                            </button>
                            <button class="secondary-button" type="button" @click="focusReservationTable(reservation)">
                              桌位
                            </button>
                            <button
                              v-if="reservation.status === 'booked'"
                              class="secondary-button"
                              type="button"
                              :disabled="reservationActionId === `${reservation.id}-reminded`"
                              @click="setReservationStatusFromPos(reservation, 'reminded')"
                            >
                              發提醒
                            </button>
                            <button
                              v-if="reservation.status === 'booked' || reservation.status === 'reminded'"
                              class="secondary-button"
                              type="button"
                              :disabled="reservationActionId === `${reservation.id}-confirmed`"
                              @click="setReservationStatusFromPos(reservation, 'confirmed')"
                            >
                              保留
                            </button>
                            <button
                              v-if="reservationAwaitingGuest(reservation)"
                              class="secondary-button"
                              type="button"
                              :disabled="reservationActionId === `${reservation.id}-cancelled`"
                              @click="setReservationStatusFromPos(reservation, 'cancelled')"
                            >
                              取消
                            </button>
                            <button
                              v-if="reservationAwaitingGuest(reservation)"
                              class="secondary-button"
                              type="button"
                              :disabled="reservationActionId === `${reservation.id}-no_show`"
                              @click="setReservationStatusFromPos(reservation, 'no_show')"
                            >
                              未出席
                            </button>
                          </div>
                        </article>
                        <div v-if="visibleReservations.length === 0" class="empty-state reservation-empty-state">
                          <CalendarDays :size="24" aria-hidden="true" />
                          <span>目前沒有符合條件的訂位</span>
                        </div>
                      </div>
                    </section>

                    <aside class="reservation-side-panel">
                      <section v-if="reservationEditDraft && selectedReservationEdit" class="reservation-form-panel reservation-form-panel--edit">
                        <div class="floor-control-heading">
                          <div>
                            <span>修改訂位</span>
                            <strong>{{ selectedReservationEdit.customerName || '訂位客' }}</strong>
                          </div>
                          <button class="icon-button" type="button" aria-label="關閉修改訂位" @click="cancelReservationEdit">
                            <X :size="18" aria-hidden="true" />
                          </button>
                        </div>
                        <div class="reservation-form-grid">
                          <input v-model="reservationEditDraft.customerName" type="text" placeholder="姓名" />
                          <input v-model="reservationEditDraft.customerPhone" type="tel" inputmode="tel" placeholder="電話" />
                          <div class="floor-party-stepper reservation-party-stepper" aria-label="修改訂位人數">
                            <button type="button" @click="reservationEditDraft.partySize = Math.max(1, reservationEditDraft.partySize - 1)">
                              <Minus :size="16" aria-hidden="true" />
                            </button>
                            <strong>{{ reservationEditDraft.partySize }} 人</strong>
                            <button type="button" @click="reservationEditDraft.partySize = Math.min(50, reservationEditDraft.partySize + 1)">
                              <Plus :size="16" aria-hidden="true" />
                            </button>
                          </div>
                          <input v-model="reservationEditDraft.reservedAt" type="datetime-local" />
                          <div class="reservation-time-actions" aria-label="快速調整訂位時間">
                            <button type="button" @click="shiftReservationEditTime(-Math.max(15, engagementSettings.reservationWebsite.slotMinutes || 30))">
                              <ChevronLeft :size="15" aria-hidden="true" />
                              前一時段
                            </button>
                            <button type="button" @click="shiftReservationEditTime(Math.max(15, engagementSettings.reservationWebsite.slotMinutes || 30))">
                              後一時段
                              <ChevronRight :size="15" aria-hidden="true" />
                            </button>
                          </div>
                          <select v-model="reservationEditDraft.status" aria-label="訂位狀態">
                            <option
                              v-for="status in reservationEditableStatusOptions"
                              :key="`reservation-edit-status-${status.value}`"
                              :value="status.value"
                            >
                              {{ status.label }}
                            </option>
                          </select>
                          <input v-model="reservationEditDraft.importantLabel" type="text" placeholder="標籤 / 節日" />
                          <input v-model="reservationEditDraft.note" type="text" placeholder="店內備註 / 客人備註" />
                        </div>
                        <div class="reservation-table-picker" aria-label="修改安排桌位">
                          <button
                            v-for="table in reservationAssignableTables"
                            :key="`reservation-edit-table-${table.id}`"
                            type="button"
                            :class="{ 'reservation-table-choice--active': reservationEditDraft.assignedTableIds.includes(table.id) }"
                            @click="toggleReservationEditTable(table.id)"
                          >
                            <Check v-if="reservationEditDraft.assignedTableIds.includes(table.id)" :size="14" aria-hidden="true" />
                            {{ floorLabelForTable(table) }} {{ table.label }} · {{ table.capacity }} 人
                          </button>
                        </div>
                        <button
                          class="primary-button reservation-create-button"
                          type="button"
                          :disabled="reservationActionId === `${selectedReservationEdit.id}-edit`"
                          @click="saveReservationEdits"
                        >
                          <CalendarDays :size="18" aria-hidden="true" />
                          儲存修改
                        </button>
                      </section>

                      <section class="reservation-form-panel">
                        <div class="floor-control-heading">
                          <div>
                            <span>新增訂位</span>
                            <strong>{{ reservationDraft.partySize }} 人</strong>
                          </div>
                        </div>
                        <div class="reservation-form-grid">
                          <input v-model="reservationDraft.customerName" type="text" placeholder="姓名" />
                          <input v-model="reservationDraft.customerPhone" type="tel" inputmode="tel" placeholder="電話" />
                          <div class="floor-party-stepper reservation-party-stepper" aria-label="訂位人數">
                            <button type="button" @click="reservationDraft.partySize = Math.max(1, reservationDraft.partySize - 1)">
                              <Minus :size="16" aria-hidden="true" />
                            </button>
                            <strong>{{ reservationDraft.partySize }} 人</strong>
                            <button type="button" @click="reservationDraft.partySize = Math.min(50, reservationDraft.partySize + 1)">
                              <Plus :size="16" aria-hidden="true" />
                            </button>
                          </div>
                          <input v-model="reservationDraft.reservedAt" type="datetime-local" />
                          <input v-model="reservationDraft.importantLabel" type="text" placeholder="標籤 / 節日" />
                          <input v-model="reservationDraft.note" type="text" placeholder="店內備註 / 客人備註" />
                        </div>
                        <div class="reservation-table-picker" aria-label="安排桌位">
                          <button
                            v-for="table in reservationAssignableTables"
                            :key="`reservation-table-${table.id}`"
                            type="button"
                            :class="{ 'reservation-table-choice--active': reservationDraft.assignedTableIds.includes(table.id) }"
                            @click="toggleReservationDraftTable(table.id)"
                          >
                            <Check v-if="reservationDraft.assignedTableIds.includes(table.id)" :size="14" aria-hidden="true" />
                            {{ floorLabelForTable(table) }} {{ table.label }} · {{ table.capacity }} 人
                          </button>
                        </div>
                        <button
                          class="primary-button reservation-create-button"
                          type="button"
                          :disabled="reservationActionId === 'reservation-create'"
                          @click="createReservationFromPos"
                        >
                          <CalendarDays :size="18" aria-hidden="true" />
                          建立訂位
                        </button>
                      </section>
                    </aside>
                  </div>
                </section>

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
                    <label class="wide-field">
                      顧客查詢
                      <span class="inline-action-field">
                        <input v-model="crmSearchTerm" type="search" placeholder="電話、姓名、LINE UID" @keyup.enter="runCrmSearch" />
                        <button class="icon-button" type="button" title="搜尋顧客" :disabled="isCrmSearching" @click="runCrmSearch">
                          <Search :size="18" aria-hidden="true" />
                        </button>
                      </span>
                    </label>
                    <label>
                      姓名
                      <input v-model="customer.name" type="text" autocomplete="name" />
                    </label>
                    <label>
                      電話
                      <input v-model="customer.phone" type="tel" autocomplete="tel" />
                    </label>
                    <label v-if="onlineOrderingSettings.showTaxIdField || customer.taxId">
                      統一編號
                      <input v-model="customer.taxId" type="text" inputmode="numeric" maxlength="8" placeholder="8 碼數字" />
                    </label>
                    <label v-if="onlineOrderingSettings.showCarrierBarcodeField || customer.invoiceCarrierBarcode">
                      載具條碼
                      <input v-model="customer.invoiceCarrierBarcode" type="text" maxlength="32" placeholder="/ABC1234" />
                    </label>
                    <label>
                      顧客類型
                      <select v-model="customer.customerType">
                        <option v-for="type in engagementSettings.customerTypes" :key="type" :value="type">
                          {{ type }}
                        </option>
                      </select>
                    </label>
                    <label>
                      可用點數
                      <input v-model.number="customer.pointsBalance" type="number" min="0" step="1" />
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

                  <div class="crm-result-strip" aria-label="CRM 查詢結果">
                    <button
                      v-for="member in crmMatches"
                      :key="member.id"
                      type="button"
                      class="crm-result-chip"
                      @click="applyCrmMember(member)"
                    >
                      <UserRound :size="16" aria-hidden="true" />
                      <span>{{ member.displayName }}</span>
                      <small>{{ member.phone || member.customerType }} · {{ member.pointsBalance }} 點</small>
                    </button>
                    <button v-if="customer.memberId" type="button" class="crm-result-chip" @click="clearCustomerMember">
                      <X :size="16" aria-hidden="true" />
                      <span>取消會員</span>
                      <small>{{ customer.customerType }} · {{ customer.availableCoupons.length }} 張券</small>
                    </button>
                    <span v-if="crmMatches.length === 0 && !customer.memberId" class="panel-note">{{ crmMessage }}</span>
                  </div>

                  <div class="order-label-strip" aria-label="訂單標籤">
                    <button
                      v-for="label in engagementSettings.orderLabels"
                      :key="label.id"
                      type="button"
                      class="order-label-chip"
                      :class="{ 'order-label-chip--active': orderLabels.includes(label.id) }"
                      :style="{ '--label-color': label.color }"
                      @click="toggleOrderLabel(label.id)"
                    >
                      {{ label.label }}
                    </button>
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
                    <button type="button" class="secondary-button payment-back-button" @click="setWorkspaceTab('order')">
                      <ChevronLeft :size="18" aria-hidden="true" />
                      返回點餐
                    </button>
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

                  <section class="mixed-payment-panel" aria-label="混合支付">
                    <div class="mixed-payment-header">
                      <div>
                        <p class="eyebrow">Mixed Payment</p>
                        <h3>混合支付</h3>
                        <span>{{ paymentBreakdownSummary }}</span>
                      </div>
                      <div class="mixed-payment-actions">
                        <button type="button" @click="enableMixedPayments">開啟混合支付</button>
                        <button type="button" :disabled="paymentBreakdown.length >= 8" @click="addPaymentAllocation">新增付款方式</button>
                        <button type="button" :disabled="paymentBreakdown.length === 0" @click="resetPaymentBreakdown">重置</button>
                      </div>
                    </div>

                    <div v-if="paymentBreakdown.length > 0" class="mixed-payment-list">
                      <article
                        v-for="payment in paymentBreakdown"
                        :key="payment.id"
                        class="mixed-payment-row"
                        :class="{ 'mixed-payment-row--paid': payment.status === 'paid' }"
                      >
                        <select :value="payment.paymentMethod" @change="updatePaymentAllocationMethod(payment.id, $event)">
                          <option v-for="option in visiblePaymentOptions" :key="`mixed-${payment.id}-${option.value}`" :value="option.value">
                            {{ option.label }}
                          </option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          :value="payment.amount"
                          :aria-label="`${paymentLabels[payment.paymentMethod]} 金額`"
                          @input="updatePaymentAllocationAmount(payment.id, $event)"
                        />
                        <button type="button" @click="togglePaymentAllocationPaid(payment.id)">
                          {{ payment.status === 'paid' ? '改未結' : '標記已結' }}
                        </button>
                      </article>
                    </div>

                    <div v-if="paymentBreakdown.length > 0" class="mixed-payment-summary">
                      <span>剩餘 {{ formatCurrency(paymentBreakdownRemaining) }}</span>
                    </div>

                    <div class="transaction-receipt-row">
                      <span>結帳列印交易明細</span>
                      <div class="quantity-stepper receipt-count-stepper" aria-label="交易明細張數">
                        <button type="button" @click="transactionReceiptCount = Math.max(0, transactionReceiptCount - 1)">
                          <Minus :size="16" aria-hidden="true" />
                        </button>
                        <span>{{ transactionReceiptCount }} 張</span>
                        <button type="button" @click="transactionReceiptCount = Math.min(10, transactionReceiptCount + 1)">
                          <Plus :size="16" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <p v-if="paymentBreakdown.length > 0 && !paymentBreakdownBalanced" class="payment-split-warning">
                      混合支付合計 {{ formatCurrency(paymentBreakdownTotal) }} 與訂單合計 {{ formatCurrency(cartTotal) }} 不一致。
                    </p>
                    <p v-else-if="paymentBreakdown.length > 0 && paymentBreakdownOnlineMethodCount > 1" class="payment-split-warning">
                      同一張訂單的線上支付只能選一種，請保留一個 LINE Pay、街口或刷卡模組。
                    </p>
                  </section>

                  <section v-if="availableDiscountCampaigns.length > 0" class="payment-discount-panel" aria-label="優惠活動">
                    <div class="payment-discount-header">
                      <div>
                        <span>優惠活動</span>
                        <strong>{{ formatCurrency(automaticDiscountAmount) }}</strong>
                      </div>
                      <small>{{ discountCampaignApplications.length }} 項套用</small>
                    </div>
                    <div class="payment-discount-campaigns">
                      <label
                        v-for="campaign in availableDiscountCampaigns"
                        :key="campaign.id"
                        class="payment-discount-campaign"
                        :class="{ 'payment-discount-campaign--active': discountCampaignActiveOnTicket(campaign) }"
                      >
                        <input
                          type="checkbox"
                          :checked="discountCampaignActiveOnTicket(campaign)"
                          @change="toggleDiscountCampaign(campaign.id)"
                        />
                        <span>{{ campaign.name }}</span>
                        <small>
                          {{ campaign.kind === 'automatic' && campaign.usage.posAutoApply ? '自動' : '手動' }} ·
                          {{ campaign.valueType === 'percentage' ? `${campaign.discountValue}%` : formatCurrency(campaign.discountValue) }}
                        </small>
                      </label>
                    </div>
                    <div v-if="discountCampaignApplications.length > 0" class="payment-discount-applied">
                      <span v-for="application in discountCampaignApplications" :key="application.campaignId">
                        {{ application.campaignName }} -{{ formatCurrency(application.amount) }}
                      </span>
                    </div>
                  </section>

                  <div class="payment-adjustment-grid" aria-label="費用與折抵">
                    <label>
                      {{ serviceFeeLabel }} %
                      <input v-model.number="serviceFeeRate" type="number" min="0" max="30" step="1" />
                    </label>
                    <label>
                      其他費用
                      <input v-model.number="extraFeeAmount" type="number" min="0" step="1" />
                    </label>
                    <label>
                      手動折抵
                      <input v-model.number="discountAmount" type="number" min="0" step="1" />
                    </label>
                    <label>
                      點數折抵
                      <input v-model.number="pointsRedeemed" type="number" min="0" :max="customer.pointsBalance" step="1" />
                    </label>
                    <label class="wide-field">
                      優惠券
                      <select v-model="couponCode">
                        <option value="">未使用</option>
                        <option v-for="coupon in customer.availableCoupons" :key="coupon.id" :value="coupon.code">
                          {{ coupon.title }} · {{ coupon.discountAmount > 0 ? formatCurrency(coupon.discountAmount) : `${coupon.discountPercent}%` }}
                        </option>
                      </select>
                    </label>
                  </div>

                  <div class="payment-summary-grid" aria-label="付款摘要">
                    <article>
                      <span>品項</span>
                      <strong>{{ productTotalDisplayEnabled ? '商品總數 ' : '' }}{{ cartProductTotalQuantity }} 件</strong>
                    </article>
                    <article>
                      <span>小計</span>
                      <strong>{{ formatCurrency(cartItemSubtotal) }}</strong>
                    </article>
                    <article>
                      <span>{{ serviceFeeLabel }}</span>
                      <strong>{{ formatCurrency(serviceFeeAmount) }}</strong>
                    </article>
                    <article>
                      <span>優惠活動</span>
                      <strong>-{{ formatCurrency(automaticDiscountAmount) }}</strong>
                    </article>
                    <article>
                      <span>總折抵</span>
                      <strong>-{{ formatCurrency(totalDiscountAmount) }}</strong>
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

                  <section class="payment-split-panel" aria-label="拆單子單">
                    <div class="payment-split-header">
                      <div>
                        <p class="eyebrow">Split Bills</p>
                        <h3>拆單</h3>
                        <span>{{ paymentSplitSummary }}</span>
                      </div>
                      <div class="payment-split-actions">
                        <button type="button" @click="createEqualPaymentSplits(2)">均分 2 張</button>
                        <button type="button" :disabled="paymentSplits.length >= 12" @click="addPaymentSplit">新增子單</button>
                        <button type="button" :disabled="paymentSplits.length === 0" @click="resetPaymentSplits">重置</button>
                      </div>
                    </div>

                    <div v-if="paymentSplits.length > 0" class="payment-split-list">
                      <article
                        v-for="split in paymentSplits"
                        :key="split.id"
                        class="payment-split-card"
                        :class="{ 'payment-split-card--paid': split.status === 'paid' }"
                      >
                        <div>
                          <strong>{{ split.label }}</strong>
                          <span>{{ formatCurrency(split.amount) }}</span>
                        </div>
                        <select :value="split.paymentMethod" @change="updatePaymentSplitMethod(split.id, $event)">
                          <option v-for="payment in visiblePaymentOptions" :key="`split-${split.id}-${payment.value}`" :value="payment.value">
                            {{ payment.label }}
                          </option>
                        </select>
                        <button type="button" @click="togglePaymentSplitPaid(split.id)">
                          {{ split.status === 'paid' ? '改未結' : '標記已結' }}
                        </button>
                      </article>
                    </div>

                    <div v-if="paymentSplits.length > 0" class="payment-split-assignment" aria-label="商品各付各">
                      <article v-for="line in cartLines" :key="`split-line-${line.itemId}`">
                        <div>
                          <strong>{{ line.name }}</strong>
                          <span>x{{ line.quantity }} · {{ formatCurrency(line.unitPrice * line.quantity) }}</span>
                        </div>
                        <div class="payment-split-assignment-buttons">
                          <button
                            type="button"
                            :class="{ 'payment-split-assignment-button--active': !assignedPaymentSplitLineKeys.has(paymentSplitLineKey(line)) }"
                            @click="unassignLineFromPaymentSplits(line)"
                          >
                            未分配
                          </button>
                          <button
                            v-for="split in paymentSplits"
                            :key="`assign-${line.itemId}-${split.id}`"
                            type="button"
                            :class="{ 'payment-split-assignment-button--active': lineAssignedToSplit(line, split.id) }"
                            @click="assignLineToPaymentSplit(line, split.id)"
                          >
                            {{ split.label }}
                          </button>
                        </div>
                      </article>
                    </div>

                    <p v-if="paymentSplits.length > 0 && !paymentSplitBalanced" class="payment-split-warning">
                      子單合計 {{ formatCurrency(paymentSplitTotal) }} 與訂單合計 {{ formatCurrency(cartTotal) }} 不一致，請重新均分或調整品項指派。
                    </p>
                  </section>

                  <div v-if="selectedOrderLabelSettings.length > 0 || activeCoupon" class="payment-meta-strip">
                    <span v-for="label in selectedOrderLabelSettings" :key="label.id" class="order-label-pill" :style="{ '--label-color': label.color }">
                      {{ label.label }}
                    </span>
                    <span v-if="activeCoupon" class="order-label-pill order-label-pill--coupon">
                      {{ activeCoupon.title }}
                    </span>
                  </div>

                  <div v-if="recommendedItems.length > 0" class="recommendation-strip" aria-label="推薦加購">
                    <button
                      v-for="item in recommendedItems"
                      :key="`recommend-${item.id}`"
                      type="button"
                      class="recommendation-chip"
                      @click="addItem(item)"
                    >
                      <Plus :size="16" aria-hidden="true" />
                      <span>{{ item.name }}</span>
                      <strong>{{ formatCurrency(item.price) }}</strong>
                    </button>
                  </div>

                  <p class="supply-check-note">{{ supplyCheckSummary }}</p>

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
                      <button type="button" @click="markOnlineOrderRemindersSeen()">已讀</button>
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

                  <section class="queue-quick-dispatch-card" aria-label="外帶外送快速出店">
                    <div class="queue-quick-dispatch-copy">
                      <ShoppingBag :size="22" aria-hidden="true" />
                      <div>
                        <strong>快速出店</strong>
                        <span>已付款且到點的外帶/外送 {{ quickDispatchEligibleOrders.length }} 張</span>
                        <small v-if="quickDispatchBlockedCount > 0">
                          {{ quickDispatchBlockedCount }} 張由其他平板處理中
                        </small>
                      </div>
                    </div>
                    <div class="queue-quick-dispatch-controls">
                      <label>
                        <span>來源</span>
                        <select v-model="quickDispatchSourceFilter">
                          <option v-for="filter in queueSourceFilterOptions" :key="filter.value" :value="filter.value">
                            {{ filter.label }}
                          </option>
                        </select>
                      </label>
                      <label>
                        <span>完成時間</span>
                        <input v-model="quickDispatchCutoffInput" type="datetime-local" />
                      </label>
                      <button type="button" @click="setQuickDispatchCutoffNow">
                        現在
                      </button>
                      <button
                        class="primary-button"
                        type="button"
                        :disabled="quickDispatching || quickDispatchAvailableOrders.length === 0"
                        @click="runQuickDispatch"
                      >
                        <CheckCircle2 :size="18" aria-hidden="true" />
                        {{ quickDispatching ? '出店中' : `出店 ${quickDispatchAvailableOrders.length} 張` }}
                      </button>
                    </div>
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
                            <span v-if="orderPaymentSplitSummary(order)" class="payment-split-chip">
                              <CreditCard :size="13" aria-hidden="true" />
                              {{ orderPaymentSplitSummary(order) }}
                            </span>
                            <span v-if="orderPaymentBreakdownSummary(order)" class="mixed-payment-chip">
                              <CreditCard :size="13" aria-hidden="true" />
                              {{ orderPaymentBreakdownSummary(order) }}
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
                              @click="printOrderAction(order)"
                            >
                              <Printer :size="16" aria-hidden="true" />
                              {{ printActionLabel(order) }}
                            </button>
                            <button
                              class="order-action--print"
                              type="button"
                              :disabled="manualPrintActionDisabled(order)"
                              @click="printOrderQrCode(order.id)"
                            >
                              <QrCode :size="16" aria-hidden="true" />
                              QR
                            </button>
                            <button
                              class="order-action--print"
                              type="button"
                              :disabled="customerReceiptDisabled(order)"
                              @click="printCustomerReceipt(order.id)"
                            >
                              <ReceiptText :size="16" aria-hidden="true" />
                              顧客聯
                            </button>
                            <button
                              class="order-action--print"
                              type="button"
                              :disabled="manualPrintActionDisabled(order)"
                              @click="printTransactionDetail(order.id)"
                            >
                              <ReceiptText :size="16" aria-hidden="true" />
                              交易明細
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
                              <template v-if="order.taxId">
                                <span>統編</span>
                                <strong>{{ order.taxId }}</strong>
                              </template>
                              <template v-if="order.invoiceCarrierBarcode">
                                <span>載具</span>
                                <strong>{{ order.invoiceCarrierBarcode }}</strong>
                              </template>
                              <span>付款</span>
                              <strong>{{ paymentLabels[order.paymentMethod] }} / {{ paymentStatusLabels[order.paymentStatus] }}</strong>
                              <template v-if="orderPaymentSplitSummary(order)">
                                <span>拆單</span>
                                <strong>{{ orderPaymentSplitSummary(order) }}</strong>
                              </template>
                              <template v-if="orderPaymentBreakdownSummary(order)">
                                <span>混合支付</span>
                                <strong>{{ orderPaymentBreakdownSummary(order) }}</strong>
                              </template>
                              <template v-if="order.transactionReceiptCount > 0">
                                <span>交易明細</span>
                                <strong>{{ order.transactionReceiptCount }} 張</strong>
                              </template>
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
                            <div class="printer-rule-timing-grid" aria-label="印單時機">
                              <span>印單時機</span>
                              <label
                                v-for="timing in printRuleTimingOptions"
                                :key="`${rule.id}-${timing.value}`"
                                class="printer-rule-timing-toggle"
                                :class="{ 'printer-rule-timing-toggle--active': printerRuleTimingSelected(rule, timing.value) }"
                              >
                                <input
                                  type="checkbox"
                                  :checked="printerRuleTimingSelected(rule, timing.value)"
                                  @change="togglePrinterRuleTiming(rule, timing.value)"
                                />
                                {{ timing.label }}
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
                                <div
                                  v-for="category in menuCategoryOptions"
                                  :key="category.id"
                                  class="printer-rule-chip"
                                  :class="{
                                    'printer-rule-chip--active': printerRuleCategoryFullySelected(rule, category.id),
                                    'printer-rule-chip--focused': activePrinterRuleCategoryId(rule) === category.id,
                                  }"
                                >
                                  <input
                                    type="checkbox"
                                    :checked="printerRuleCategoryFullySelected(rule, category.id)"
                                    @click.stop
                                    @change="togglePrinterRuleCategory(rule, category.id)"
                                  />
                                  <button
                                    class="printer-rule-chip-button"
                                    type="button"
                                    @click="selectPrinterRuleCategory(rule, category.id)"
                                  >
                                    {{ category.label }}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div class="printer-rule-picker-section">
                              <div class="printer-rule-picker-title">
                                <strong>指定品項</strong>
                                <span>{{ categoryLabelFor(activePrinterRuleCategoryId(rule)) }} · {{ printerRuleItemsLabel(rule) }}</span>
                              </div>
                              <div class="printer-rule-product-grid" aria-label="印單規則指定品項">
                                <label
                                  v-for="item in printerRuleProductOptions(rule)"
                                  :key="item.id"
                                  class="printer-rule-product-chip"
                                  :class="{ 'printer-rule-chip--active': printerRuleItemSelected(rule, item) }"
                                >
                                  <input
                                    type="checkbox"
                                    :checked="printerRuleItemSelected(rule, item)"
                                    @change="togglePrinterRuleItem(rule, item.id)"
                                  />
                                  <span>{{ item.name }}</span>
                                  <small>{{ categoryLabelFor(item.category) }}</small>
                                </label>
                              </div>
                            </div>
                            <div class="printer-rule-picker-section">
                              <div class="printer-rule-picker-title">
                                <strong>不計算商品</strong>
                                <span>{{ categoryLabelFor(activePrinterRuleCountCategoryId(rule)) }} · {{ printerRuleCountExcludedLabel(rule) }}</span>
                              </div>
                              <div class="printer-rule-chip-grid" aria-label="印單規則不計算分類">
                                <div
                                  v-for="category in menuCategoryOptions"
                                  :key="`${rule.id}-count-${category.id}`"
                                  class="printer-rule-chip"
                                  :class="{
                                    'printer-rule-chip--active': printerRuleCountCategoryFullySelected(rule, category.id),
                                    'printer-rule-chip--focused': activePrinterRuleCountCategoryId(rule) === category.id,
                                  }"
                                >
                                  <input
                                    type="checkbox"
                                    :checked="printerRuleCountCategoryFullySelected(rule, category.id)"
                                    @click.stop
                                    @change="togglePrinterRuleCountCategory(rule, category.id)"
                                  />
                                  <button
                                    class="printer-rule-chip-button"
                                    type="button"
                                    @click="selectPrinterRuleCountCategory(rule, category.id)"
                                  >
                                    {{ category.label }}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div class="printer-rule-picker-section">
                              <div class="printer-rule-picker-title">
                                <strong>不計算指定品項</strong>
                                <span>貼紙總數排除，列印範圍不受影響</span>
                              </div>
                              <div class="printer-rule-product-grid" aria-label="印單規則不計算指定品項">
                                <label
                                  v-for="item in printerRuleCountProductOptions(rule)"
                                  :key="`${rule.id}-count-${item.id}`"
                                  class="printer-rule-product-chip"
                                  :class="{ 'printer-rule-chip--active': printerRuleCountItemSelected(rule, item) }"
                                >
                                  <input
                                    type="checkbox"
                                    :checked="printerRuleCountItemSelected(rule, item)"
                                    @change="togglePrinterRuleCountItem(rule, item.id)"
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
                            <span>臨時收入</span>
                            <strong>{{ formatCurrency(registerSession.cashAdjustmentIncome) }}</strong>
                          </article>
                          <article>
                            <span>臨時支出</span>
                            <strong>{{ formatCurrency(registerSession.cashAdjustmentExpense) }}</strong>
                          </article>
                          <article :class="registerCashAdjustmentNet >= 0 ? 'register-variance--over' : 'register-variance--short'">
                            <span>臨時淨額</span>
                            <strong>{{ formatCurrency(registerCashAdjustmentNet) }}</strong>
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

                        <div class="cash-adjustment-panel" aria-label="現金臨時收支">
                          <div class="cash-adjustment-heading">
                            <div>
                              <span>現金臨時收支</span>
                              <strong>{{ registerIsOpen ? '本班同步記錄' : '班別已關閉' }}</strong>
                            </div>
                            <small>最近 {{ registerCashAdjustments.length }} 筆</small>
                          </div>

                          <div class="segmented-control cash-adjustment-kind" aria-label="收支類型">
                            <button
                              class="segment-button"
                              type="button"
                              :class="{ 'segment-button--active': registerCashAdjustmentKind === 'income' }"
                              :disabled="!registerIsOpen || isRegisterBusy"
                              @click="registerCashAdjustmentKind = 'income'"
                            >
                              收入
                            </button>
                            <button
                              class="segment-button"
                              type="button"
                              :class="{ 'segment-button--active': registerCashAdjustmentKind === 'expense' }"
                              :disabled="!registerIsOpen || isRegisterBusy"
                              @click="registerCashAdjustmentKind = 'expense'"
                            >
                              支出
                            </button>
                          </div>

                          <div class="cash-adjustment-form">
                            <label>
                              金額
                              <input
                                v-model.number="registerCashAdjustmentAmount"
                                type="number"
                                min="1"
                                step="1"
                                inputmode="numeric"
                                :disabled="!registerIsOpen || isRegisterBusy"
                              />
                            </label>
                            <label>
                              原因
                              <input
                                v-model="registerCashAdjustmentReason"
                                type="text"
                                placeholder="例：零用金支出"
                                :disabled="!registerIsOpen || isRegisterBusy"
                              />
                            </label>
                            <label class="wide-field">
                              備註
                              <input
                                v-model="registerCashAdjustmentNote"
                                type="text"
                                placeholder="收據號、交接或採買明細"
                                :disabled="!registerIsOpen || isRegisterBusy"
                              />
                            </label>
                          </div>

                          <div class="cash-adjustment-presets" aria-label="常用原因">
                            <button
                              v-for="reason in registerCashAdjustmentReasonPresets"
                              :key="reason"
                              type="button"
                              :disabled="!registerIsOpen || isRegisterBusy"
                              @click="registerCashAdjustmentReason = reason"
                            >
                              {{ reason }}
                            </button>
                          </div>

                          <button
                            class="register-action-button cash-adjustment-submit"
                            type="button"
                            :disabled="!registerIsOpen || isRegisterBusy"
                            @click="createRegisterCashAdjustmentAction"
                          >
                            <WalletCards :size="18" aria-hidden="true" />
                            {{ registerCashAdjustmentKind === 'income' ? '登記收入' : '登記支出' }}
                          </button>

                          <div class="cash-adjustment-list" aria-label="現金異動紀錄">
                            <article
                              v-for="adjustment in registerCashAdjustments"
                              :key="adjustment.id"
                              :class="registerCashAdjustmentClass(adjustment.kind)"
                            >
                              <div>
                                <strong>{{ adjustment.reason }}</strong>
                                <span>{{ formatOrderTime(adjustment.createdAt) }} · {{ adjustment.stationId || 'POS' }}</span>
                                <small v-if="adjustment.note">{{ adjustment.note }}</small>
                              </div>
                              <b>{{ adjustment.kind === 'income' ? '+' : '-' }}{{ formatCurrency(adjustment.amount) }}</b>
                            </article>
                            <p v-if="registerCashAdjustments.length === 0" class="cash-adjustment-empty">
                              本班尚無現金臨時收支
                            </p>
                          </div>
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
                          <label v-if="registerIsOpen">
                            員工識別碼
                            <input
                              v-model="registerStaffCode"
                              type="password"
                              inputmode="numeric"
                              autocomplete="off"
                              placeholder="關帳操作員"
                            />
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
                  <p>{{ activeOrder.customerName }} · {{ productTotalDisplayEnabled ? '商品總數 ' : '' }}{{ activeOrderItemCount }} 件 · {{ activeOrder.note || '無備註' }}</p>
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
                    @click="printOrderAction(activeOrder)"
                  >
                    <Printer :size="16" aria-hidden="true" />
                    {{ printingOrderId === activeOrder.id ? '出單中' : '立即出單' }}
                  </button>
                  <button
                    class="active-order-print-button"
                    type="button"
                    :disabled="manualPrintActionDisabled(activeOrder)"
                    @click="printOrderQrCode(activeOrder.id)"
                  >
                    <QrCode :size="16" aria-hidden="true" />
                    列印 QR
                  </button>
                  <button
                    class="active-order-print-button"
                    type="button"
                    :disabled="customerReceiptDisabled(activeOrder)"
                    @click="printCustomerReceipt(activeOrder.id)"
                  >
                    <ReceiptText :size="16" aria-hidden="true" />
                    顧客聯
                  </button>
                  <button
                    class="active-order-print-button"
                    type="button"
                    :disabled="manualPrintActionDisabled(activeOrder)"
                    @click="printTransactionDetail(activeOrder.id)"
                  >
                    <ReceiptText :size="16" aria-hidden="true" />
                    交易明細
                  </button>
                </section>
              </aside>
            </section>
          </section>
        </section>

        <div
          v-if="accessVerificationPrompt"
          class="utility-modal-backdrop access-verification-backdrop"
          @click.self="cancelAccessVerification"
        >
          <section
            class="utility-modal access-verification-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-verification-title"
          >
            <header class="utility-modal-header">
              <div>
                <p class="eyebrow">Access</p>
                <h2 id="access-verification-title">{{ accessVerificationPrompt.title }}</h2>
              </div>
              <button class="icon-button" type="button" title="取消驗證" @click="cancelAccessVerification">
                <X :size="20" aria-hidden="true" />
              </button>
            </header>

            <div class="access-verification-body">
              <LockKeyhole :size="28" aria-hidden="true" />
              <p>{{ accessVerificationPrompt.detail }}</p>
              <label>
                員工識別碼
                <input
                  v-model="accessVerificationCode"
                  type="password"
                  inputmode="numeric"
                  autocomplete="off"
                  placeholder="請輸入識別碼"
                  @keydown.enter="submitAccessVerification"
                  @keydown.escape="cancelAccessVerification"
                />
              </label>
              <p v-if="accessVerificationError" class="access-verification-error" role="alert">
                {{ accessVerificationError }}
              </p>
            </div>

            <footer class="access-verification-actions">
              <button type="button" class="secondary-button" :disabled="isAccessVerifying" @click="cancelAccessVerification">
                取消
              </button>
              <button type="button" class="primary-button" :disabled="isAccessVerifying" @click="submitAccessVerification">
                <LockKeyhole :size="18" aria-hidden="true" />
                {{ isAccessVerifying ? '驗證中' : '確認權限' }}
              </button>
            </footer>
          </section>
        </div>

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
              <article v-if="onlineReminderDetailOrder.taxId">
                <span>統一編號</span>
                <strong>{{ onlineReminderDetailOrder.taxId }}</strong>
              </article>
              <article v-if="onlineReminderDetailOrder.invoiceCarrierBarcode">
                <span>載具條碼</span>
                <strong>{{ onlineReminderDetailOrder.invoiceCarrierBarcode }}</strong>
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
              <button type="button" @click="markOnlineReminderReadFromDetail(onlineReminderDetailOrder)">已讀</button>
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
          <button type="button" @click="markOnlineOrderRemindersSeen([primaryOnlineReminderOrder.id])">已讀</button>
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
                    v-model="supplyBatchStatusSelection"
                    :disabled="visibleSupplyRows.length === 0 || isStationBatchBusy"
                    @change="updateVisibleSupplyRowsFromSelection"
                  >
                    <option value="" disabled>選擇狀態</option>
                    <option v-for="status in supplyStatusOptions" :key="status.value" :value="status.value">
                      {{ status.label }}
                    </option>
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
                  <details v-if="row.kind === 'product' && row.product" class="supply-row-options supply-row-options--combo">
                    <summary>
                      <span>套餐子項目</span>
                      <small>{{ managedComboGroupsForProduct(row.product).length }} 組</small>
                      <ChevronDown :size="16" aria-hidden="true" />
                    </summary>
                    <div class="supply-combo-group-list">
                      <article v-for="group in managedComboGroupsForProduct(row.product)" :key="`${row.id}-${group.id}`" class="supply-combo-group">
                        <div class="supply-combo-group-header">
                          <input
                            :value="group.label"
                            type="text"
                            aria-label="套餐子項目名稱"
                            @change="updateComboGroup(row.product, group.id, { label: ($event.target as HTMLInputElement).value })"
                          />
                          <label class="supply-inline-check">
                            <input
                              type="checkbox"
                              :checked="group.required"
                              @change="updateComboGroup(row.product, group.id, { required: eventChecked($event) })"
                            />
                            必選
                          </label>
                          <label class="supply-inline-check">
                            <input
                              type="checkbox"
                              :checked="group.allowRepeat"
                              @change="updateComboGroup(row.product, group.id, { allowRepeat: eventChecked($event) })"
                            />
                            可重複
                          </label>
                          <input
                            :value="group.max"
                            type="number"
                            inputmode="numeric"
                            min="1"
                            max="12"
                            aria-label="套餐最多可選份數"
                            @change="updateComboGroup(row.product, group.id, { max: Number(($event.target as HTMLInputElement).value) })"
                          />
                          <button type="button" class="ghost-danger-button" @click="deleteComboGroupFromProduct(row.product, group.id)">
                            <Trash2 :size="15" aria-hidden="true" />
                            刪除
                          </button>
                        </div>
                        <small>{{ group.requirement }} · {{ group.choices.length }} 個可選商品</small>
                        <div class="supply-row-option-list supply-combo-choice-list">
                          <label v-for="choiceProduct in comboChoiceProductsForProduct(row.product)" :key="`${group.id}-${choiceProduct.id}`">
                            <input
                              type="checkbox"
                              :checked="comboGroupHasChoice(group, choiceProduct.id)"
                              @change="toggleComboGroupChoice(row.product, group.id, choiceProduct.id)"
                            />
                            {{ choiceProduct.name }}
                            <input
                              v-if="comboGroupHasChoice(group, choiceProduct.id)"
                              class="supply-combo-price-input"
                              type="number"
                              inputmode="numeric"
                              :value="group.choices.find((choice) => choice.productId === choiceProduct.id)?.priceDelta ?? 0"
                              aria-label="套餐子項目價差"
                              @click.stop
                              @change="updateComboGroupChoicePrice(row.product, group.id, choiceProduct.id, Number(($event.target as HTMLInputElement).value))"
                            />
                          </label>
                          <span v-if="comboChoiceProductsForProduct(row.product).length === 0" class="supply-row-option-empty">至少需要另一個商品</span>
                        </div>
                      </article>
                      <button type="button" class="secondary-button supply-combo-add-button" @click="addComboGroupToProduct(row.product)">
                        <Plus :size="16" aria-hidden="true" />
                        新增套餐子項目
                      </button>
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
            :title="activeToolboxPanel === 'home' ? '關閉工具箱' : '返回工具箱'"
            @click="activeToolboxPanel === 'home' ? closeToolbox() : showToolboxHome()"
          >
            <ChevronLeft :size="20" aria-hidden="true" />
          </button>
          <div>
            <p class="eyebrow">{{ toolboxPanelEyebrow }}</p>
            <h2 id="toolbox-title">{{ toolboxPanelTitle }}</h2>
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
          <button type="button" class="toolbox-card" @click="runToolboxAction('floor')">
            <LayoutDashboard :size="24" aria-hidden="true" />
            <strong>桌位地圖</strong>
            <span>{{ workspaceTabSummaries.floor }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('queue')">
            <ReceiptText :size="24" aria-hidden="true" />
            <strong>外帶 / 外送</strong>
            <span>{{ queueFilterNote }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('transactions')">
            <Search :size="24" aria-hidden="true" />
            <strong>交易查詢與作廢</strong>
            <span>{{ transactionLookupSummary }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('reservations')">
            <CalendarDays :size="24" aria-hidden="true" />
            <strong>訂位管理</strong>
            <span>{{ workspaceTabSummaries.reservations }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('supply')">
            <Eye :size="24" aria-hidden="true" />
            <strong>供應狀態</strong>
            <span>{{ availableStationProducts }} 可售 · {{ stoppedStationProducts }} 暫停</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('inventory-management')">
            <PackageOpen :size="24" aria-hidden="true" />
            <strong>庫存管理</strong>
            <span>{{ inventoryManagementSummary }}</span>
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
          <button type="button" class="toolbox-card" @click="runToolboxAction('cash-drawer')">
            <WalletCards :size="24" aria-hidden="true" />
            <strong>錢櫃管理</strong>
            <span>{{ cashDrawerSummary }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('device-management')">
            <Printer :size="24" aria-hidden="true" />
            <strong>裝置管理</strong>
            <span>{{ deviceManagementSummary }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('customer-management')">
            <UsersRound :size="24" aria-hidden="true" />
            <strong>顧客資訊管理</strong>
            <span>{{ customerManagementSummary }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('current-sales')">
            <LayoutDashboard :size="24" aria-hidden="true" />
            <strong>目前營業概況</strong>
            <span>{{ currentSalesSummary }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('label-management')">
            <Tags :size="24" aria-hidden="true" />
            <strong>標籤管理</strong>
            <span>{{ labelManagementSummary }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('time-clock')">
            <Clock3 :size="24" aria-hidden="true" />
            <strong>員工打卡</strong>
            <span>{{ latestTimeClockEntry ? `${latestTimeClockEntry.staffName} ${latestTimeClockEntry.eventType === 'clock-in' ? '上班' : '下班'}` : '識別碼上下班' }}</span>
          </button>
          <button type="button" class="toolbox-card" @click="runToolboxAction('system-info')">
            <Wifi :size="24" aria-hidden="true" />
            <strong>系統資訊</strong>
            <span>{{ backendStatus.label }} · {{ stationClaimLabel }}</span>
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

        <section v-else-if="activeToolboxPanel === 'appearance'" class="toolbox-detail-panel" aria-labelledby="toolbox-title">
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
        <section v-else-if="activeToolboxPanel === 'transactions'" class="toolbox-detail-panel transaction-lookup-panel" aria-labelledby="toolbox-title">
          <div class="transaction-search-grid" aria-label="交易查詢條件">
            <label>
              查詢條件
              <select v-model="transactionSearchCriterion">
                <option v-for="option in transactionSearchOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              關鍵字
              <input
                v-model="transactionSearchTerm"
                type="search"
                :placeholder="transactionSearchPlaceholder"
                autocomplete="off"
              />
            </label>
          </div>
          <p class="transaction-lookup-message" aria-live="polite">{{ transactionLookupMessage }}</p>

          <div class="transaction-lookup-grid">
            <div class="transaction-result-list" aria-label="交易清單">
              <button
                v-for="order in transactionLookupRows"
                :key="order.id"
                class="transaction-result-row"
                :class="{ 'transaction-result-row--active': selectedTransactionOrder?.id === order.id }"
                type="button"
                @click="selectTransactionOrder(order)"
              >
                <div>
                  <strong>{{ transactionReceiptLabel(order) }}</strong>
                  <span>{{ formatOrderTime(order.createdAt) }} · {{ serviceModeLabels[order.mode] }} · {{ tableLabelFromOrder(order) }}</span>
                </div>
                <span>{{ compactOrderId(order.id) }}</span>
                <strong>{{ formatCurrency(order.subtotal) }}</strong>
              </button>
              <div v-if="transactionLookupRows.length === 0" class="empty-state transaction-empty-state">
                <Search :size="24" aria-hidden="true" />
                <span>沒有符合條件的交易</span>
              </div>
            </div>

            <article v-if="selectedTransactionOrder" class="transaction-preview" aria-label="交易預覽">
              <header>
                <div>
                  <p class="eyebrow">Transaction</p>
                  <h3>{{ transactionReceiptLabel(selectedTransactionOrder) }}</h3>
                  <span>{{ sourceLabels[selectedTransactionOrder.source] }} · {{ compactOrderId(selectedTransactionOrder.id) }}</span>
                </div>
                <strong>{{ formatCurrency(selectedTransactionOrder.subtotal) }}</strong>
              </header>

              <dl class="transaction-preview-details">
                <div>
                  <dt>結帳時間</dt>
                  <dd>{{ formatOrderTime(selectedTransactionOrder.createdAt) }}</dd>
                </div>
                <div>
                  <dt>桌號</dt>
                  <dd>{{ tableLabelFromOrder(selectedTransactionOrder) }}</dd>
                </div>
                <div>
                  <dt>訂單號碼</dt>
                  <dd>{{ compactOrderId(selectedTransactionOrder.id) }}</dd>
                </div>
                <div>
                  <dt>付款</dt>
                  <dd>{{ paymentLabels[selectedTransactionOrder.paymentMethod] }} / {{ paymentStatusLabels[selectedTransactionOrder.paymentStatus] }}</dd>
                </div>
                <div v-if="selectedTransactionOrder.invoiceCarrierBarcode">
                  <dt>載具</dt>
                  <dd>{{ selectedTransactionOrder.invoiceCarrierBarcode }}</dd>
                </div>
                <div v-if="selectedTransactionOrder.taxId">
                  <dt>統編</dt>
                  <dd>{{ selectedTransactionOrder.taxId }}</dd>
                </div>
              </dl>

              <div class="transaction-preview-lines">
                <article v-for="line in selectedTransactionOrder.lines" :key="`${selectedTransactionOrder.id}-${line.itemId}`">
                  <div>
                    <strong>{{ line.name }}</strong>
                    <span>{{ line.options.join(' / ') || '標準' }}</span>
                  </div>
                  <span>x{{ line.quantity }}</span>
                  <strong>{{ formatCurrency(line.unitPrice * line.quantity) }}</strong>
                </article>
                <div v-if="selectedTransactionOrder.lines.length === 0" class="empty-state transaction-empty-state">
                  <ReceiptText :size="24" aria-hidden="true" />
                  <span>尚無交易明細</span>
                </div>
              </div>

              <div class="transaction-preview-actions">
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="manualPrintActionDisabled(selectedTransactionOrder)"
                  @click="printTransactionDetail(selectedTransactionOrder.id)"
                >
                  <ReceiptText :size="16" aria-hidden="true" />
                  補印交易明細
                </button>
                <button
                  v-if="orderCanBeVoided(selectedTransactionOrder)"
                  class="secondary-button transaction-action--danger"
                  type="button"
                  :disabled="voidingOrderId === selectedTransactionOrder.id"
                  @click="requestTransactionAdminAction('void', selectedTransactionOrder)"
                >
                  <Trash2 :size="16" aria-hidden="true" />
                  {{ voidActionLabel(selectedTransactionOrder) }}
                </button>
                <button
                  v-if="orderCanBeRefunded(selectedTransactionOrder)"
                  class="secondary-button transaction-action--danger"
                  type="button"
                  :disabled="refundingOrderId === selectedTransactionOrder.id"
                  @click="requestTransactionAdminAction('refund', selectedTransactionOrder)"
                >
                  <WalletCards :size="16" aria-hidden="true" />
                  {{ refundActionLabel(selectedTransactionOrder) }}
                </button>
              </div>
            </article>
          </div>
        </section>
        <section v-else-if="activeToolboxPanel === 'cash-drawer'" class="toolbox-detail-panel cash-drawer-panel" aria-labelledby="toolbox-title">
          <div class="cash-drawer-action-grid">
            <article class="cash-drawer-action">
              <header>
                <WalletCards :size="20" aria-hidden="true" />
                <div>
                  <strong>錢櫃</strong>
                  <span>瀏覽錢櫃開啟記錄或打開錢櫃</span>
                </div>
              </header>
              <label>
                開啟原因
                <input
                  v-model="cashDrawerReason"
                  type="text"
                  maxlength="120"
                  autocomplete="off"
                  placeholder="手動開啟錢櫃"
                />
              </label>
              <dl class="cash-drawer-target">
                <div>
                  <dt>裝置</dt>
                  <dd>{{ activeCashDrawerDevice?.name ?? '未設定錢櫃裝置' }}</dd>
                </div>
                <div>
                  <dt>列印站</dt>
                  <dd>{{ cashDrawerTargetStation ? `${cashDrawerTargetStation.name} · ${cashDrawerTargetStation.host}:${cashDrawerTargetStation.port}` : '使用預設列印站' }}</dd>
                </div>
              </dl>
              <button
                class="primary-button"
                type="button"
                :disabled="isCashDrawerOpening"
                @click="openCashDrawerAction"
              >
                <WalletCards :size="18" aria-hidden="true" />
                {{ isCashDrawerOpening ? '開啟中' : '開啟錢櫃並記錄' }}
              </button>
              <p class="cash-drawer-message" aria-live="polite">{{ cashDrawerActionMessage }}</p>
            </article>

            <article class="cash-drawer-action">
              <header>
                <ReceiptText :size="20" aria-hidden="true" />
                <div>
                  <strong>臨時收支</strong>
                  <span>新增現金臨時收支紀錄並瀏覽本班內容</span>
                </div>
              </header>
              <dl class="cash-drawer-target">
                <div>
                  <dt>收入</dt>
                  <dd>{{ formatCurrency(registerSession?.cashAdjustmentIncome ?? 0) }}</dd>
                </div>
                <div>
                  <dt>支出</dt>
                  <dd>{{ formatCurrency(registerSession?.cashAdjustmentExpense ?? 0) }}</dd>
                </div>
              </dl>
              <button class="secondary-button" type="button" @click="runToolboxAction('closeout')">
                <WalletCards :size="18" aria-hidden="true" />
                前往臨時收支
              </button>
            </article>
          </div>

          <div class="cash-drawer-history-grid">
            <section aria-label="錢櫃開啟記錄">
              <header>
                <strong>錢櫃開啟記錄</strong>
                <button class="icon-button" type="button" title="重新載入錢櫃紀錄" @click="loadCashDrawerEvents">
                  <RefreshCw :size="16" aria-hidden="true" />
                </button>
              </header>
              <article
                v-for="event in cashDrawerRecentEvents"
                :key="event.id"
                class="cash-drawer-history-row"
              >
                <div>
                  <strong>{{ event.reason || '手動開啟錢櫃' }}</strong>
                  <span>{{ formatOrderTime(event.createdAt) }} · {{ event.stationId || '未知工作站' }}</span>
                </div>
                <span>{{ cashDrawerDeliveryLabel(event.deliveryStatus) }}</span>
              </article>
              <p v-if="cashDrawerRecentEvents.length === 0" class="cash-drawer-empty">尚無錢櫃開啟記錄</p>
            </section>

            <section aria-label="臨時收支記錄">
              <header>
                <strong>本班臨時收支</strong>
                <span>{{ cashDrawerRecentAdjustments.length }} 筆</span>
              </header>
              <article
                v-for="adjustment in cashDrawerRecentAdjustments"
                :key="adjustment.id"
                class="cash-drawer-history-row"
                :class="registerCashAdjustmentClass(adjustment.kind)"
              >
                <div>
                  <strong>{{ adjustment.reason }}</strong>
                  <span>{{ formatOrderTime(adjustment.createdAt) }} · {{ adjustment.kind === 'income' ? '收入' : '支出' }}</span>
                </div>
                <span>{{ formatCurrency(adjustment.amount) }}</span>
              </article>
              <p v-if="cashDrawerRecentAdjustments.length === 0" class="cash-drawer-empty">本班尚無臨時收支</p>
            </section>
          </div>
        </section>
        <section v-else-if="activeToolboxPanel === 'device-management'" class="toolbox-detail-panel device-management-panel" aria-labelledby="toolbox-title">
          <div class="device-management-tabs" aria-label="裝置分類">
            <span>出單機</span>
            <span>刷卡機</span>
            <span>掃碼裝置</span>
          </div>
          <div class="device-management-grid">
            <article class="device-management-card">
              <header>
                <Printer :size="20" aria-hidden="true" />
                <div>
                  <strong>出單機</strong>
                  <span>{{ printerSettings.stations.length }} 台設定 · 目前 {{ printStation.name }}</span>
                </div>
              </header>
              <div class="device-management-list">
                <div v-for="station in printerSettings.stations" :key="station.id" class="device-management-row">
                  <div>
                    <strong>{{ station.name }}</strong>
                    <span>{{ station.host }}:{{ station.port }} · {{ station.protocol.toUpperCase() }}</span>
                  </div>
                  <b>{{ station.enabled ? '已啟用' : '停用' }}</b>
                </div>
                <p v-if="printerSettings.stations.length === 0" class="device-management-empty">尚未設定出單機</p>
              </div>
            </article>
            <article class="device-management-card">
              <header>
                <QrCode :size="20" aria-hidden="true" />
                <div>
                  <strong>刷卡機 / 掃碼裝置</strong>
                  <span>{{ engagementSettings.hardwareDevices.length }} 個外設設定</span>
                </div>
              </header>
              <div class="device-management-list">
                <div v-for="device in engagementSettings.hardwareDevices" :key="device.id" class="device-management-row">
                  <div>
                    <strong>{{ device.name }}</strong>
                    <span>{{ deviceKindLabel(device.kind) }} · {{ device.targetStationId || '未指定工作站' }}</span>
                  </div>
                  <b>{{ device.enabled ? '已啟用' : '停用' }}</b>
                </div>
                <p v-if="engagementSettings.hardwareDevices.length === 0" class="device-management-empty">尚未設定外設</p>
              </div>
            </article>
            <article class="device-management-card">
              <header>
                <ReceiptText :size="20" aria-hidden="true" />
                <div>
                  <strong>未印出單據</strong>
                  <span>{{ unprintedPrintJobs.length }} 筆列印單待處理</span>
                </div>
              </header>
              <div class="device-management-list">
                <div v-for="job in unprintedPrintJobs.slice(0, 6)" :key="job.printJob.id" class="device-management-row">
                  <div>
                    <strong>{{ compactOrderId(job.orderId) }}</strong>
                    <span>{{ job.printJob.status === 'failed' ? '列印失敗' : '等待列印' }} · {{ formatOrderTime(job.printJob.createdAt) }}</span>
                  </div>
                  <b>{{ job.printJob.attempts }} 次</b>
                </div>
                <p v-if="unprintedPrintJobs.length === 0" class="device-management-empty">目前沒有未印出的單據</p>
              </div>
            </article>
          </div>
          <div class="device-management-actions">
            <button class="secondary-button" type="button" :disabled="isDeviceManagementRefreshing" @click="refreshDeviceManagementAction">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isDeviceManagementRefreshing ? '整理中' : '重新整理連線狀態' }}
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="isDeviceManagementCancelling || unprintedPrintJobs.length === 0"
              @click="cancelAllUnprintedPrintJobsAction"
            >
              <Trash2 :size="18" aria-hidden="true" />
              {{ isDeviceManagementCancelling ? '取消中' : '取消所有未印出的單據' }}
            </button>
          </div>
          <p class="device-management-message" aria-live="polite">{{ deviceManagementMessage }}</p>
          <small class="device-management-host-id">主機 App ID：{{ stationClaimLabel }}</small>
        </section>
        <section v-else-if="activeToolboxPanel === 'customer-management'" class="toolbox-detail-panel customer-management-panel" aria-labelledby="toolbox-title">
          <div class="customer-management-toolbar">
            <label class="search-box">
              <Search :size="18" aria-hidden="true" />
              <input v-model="customerManagementSearchTerm" type="search" placeholder="搜尋顧客" @keyup.enter="loadCustomerManagementMembers" />
            </label>
            <label>
              顧客類型
              <select v-model="customerManagementTypeFilter">
                <option value="all">全部</option>
                <option v-for="type in customerManagementTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </label>
          </div>
          <div class="customer-management-sort" role="group" aria-label="顧客排序">
            <button
              type="button"
              :class="{ active: customerManagementSortMode === 'consumed' }"
              @click="customerManagementSortMode = 'consumed'"
            >
              顯示消費時間排序
            </button>
            <button
              type="button"
              :class="{ active: customerManagementSortMode === 'created' }"
              @click="customerManagementSortMode = 'created'"
            >
              顯示建立時間排序
            </button>
          </div>
          <form class="customer-management-create" @submit.prevent="createCustomerManagementMember">
            <input v-model="customerManagementDraft.displayName" type="text" placeholder="姓名 / 稱呼" />
            <input v-model="customerManagementDraft.phone" type="tel" placeholder="電話" />
            <select v-model="customerManagementDraft.customerType">
              <option v-for="type in customerManagementTypes" :key="type" :value="type">{{ type }}</option>
            </select>
            <input v-model.number="customerManagementDraft.pointsBalance" type="number" min="0" step="1" inputmode="numeric" placeholder="點數" />
            <button class="secondary-button" type="submit" :disabled="isCustomerManagementCreating">
              <Plus :size="18" aria-hidden="true" />
              {{ isCustomerManagementCreating ? '新增中' : '新增顧客資訊' }}
            </button>
          </form>
          <div class="customer-management-actions">
            <button class="primary-button" type="button" :disabled="isCustomerManagementLoading" @click="loadCustomerManagementMembers">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isCustomerManagementLoading ? '讀取中' : '刷新顧客' }}
            </button>
            <p aria-live="polite">{{ customerManagementMessage }}</p>
          </div>
          <div class="customer-management-list">
            <article v-for="member in filteredCustomerManagementMembers" :key="member.id" class="customer-management-row">
              <div>
                <strong>{{ member.displayName || member.phone || member.lineUserId || '未命名顧客' }}</strong>
                <span>{{ member.phone || '未留電話' }} · {{ member.customerType }}</span>
              </div>
              <dl>
                <div>
                  <dt>點數</dt>
                  <dd>{{ member.pointsBalance }}</dd>
                </div>
                <div>
                  <dt>錢包</dt>
                  <dd>{{ formatCurrency(member.walletBalance) }}</dd>
                </div>
                <div>
                  <dt>{{ customerManagementSortMode === 'created' ? '建立' : '最近' }}</dt>
                  <dd>{{ customerManagementSortMode === 'created' ? formatOrderTime(member.createdAt) : latestCustomerActivityLabel(member) }}</dd>
                </div>
              </dl>
            </article>
            <p v-if="filteredCustomerManagementMembers.length === 0" class="customer-management-empty">
              尚無顧客資料，或目前篩選沒有結果
            </p>
          </div>
        </section>
        <section v-else-if="activeToolboxPanel === 'inventory-management'" class="toolbox-detail-panel inventory-management-panel" aria-labelledby="toolbox-title">
          <div class="inventory-management-toolbar">
            <label class="search-box">
              <Search :size="18" aria-hidden="true" />
              <input v-model="inventorySearchTerm" type="search" placeholder="搜尋庫存品項" />
            </label>
            <label>
              類別
              <select v-model="inventoryCategoryFilter">
                <option value="all">全部</option>
                <option v-for="category in activeInventoryCategories" :key="category.id" :value="category.id">
                  {{ category.name }}
                </option>
              </select>
            </label>
            <button class="primary-button" type="button" :disabled="isInventoryLoading" @click="loadInventoryManagement">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isInventoryLoading ? '讀取中' : '刷新庫存' }}
            </button>
          </div>

          <div class="inventory-create-grid">
            <form class="inventory-create-card" @submit.prevent="createInventoryCategoryAction">
              <strong>庫存類別</strong>
              <input v-model="inventoryCategoryDraft.name" type="text" placeholder="類別名稱" />
              <button class="secondary-button" type="submit" :disabled="isInventorySaving">
                <Plus :size="18" aria-hidden="true" />
                新增類別
              </button>
            </form>
            <form class="inventory-create-card inventory-create-card--item" @submit.prevent="createInventoryItemAction">
              <strong>庫存品項</strong>
              <select v-model="inventoryItemDraft.categoryId">
                <option value="" disabled>選擇類別</option>
                <option v-for="category in activeInventoryCategories" :key="category.id" :value="category.id">
                  {{ category.name }}
                </option>
              </select>
              <input v-model="inventoryItemDraft.name" type="text" placeholder="品項名稱" />
              <input v-model="inventoryItemDraft.unit" type="text" placeholder="單位" />
              <input v-model.number="inventoryItemDraft.defaultUnitCost" type="number" min="0" step="1" inputmode="numeric" placeholder="預設單價" />
              <input v-model.number="inventoryItemDraft.stockQuantity" type="number" step="0.001" inputmode="decimal" placeholder="目前存量" />
              <input v-model.number="inventoryItemDraft.lowStockQuantity" type="number" min="0" step="0.001" inputmode="decimal" placeholder="安全庫存" />
              <input v-model="inventoryItemDraft.note" type="text" placeholder="備註" />
              <button class="secondary-button" type="submit" :disabled="isInventorySaving">
                <Plus :size="18" aria-hidden="true" />
                新增品項
              </button>
            </form>
          </div>

          <div class="inventory-management-grid">
            <section class="inventory-list" aria-label="庫存品項">
              <article
                v-for="item in filteredInventoryItems"
                :key="item.id"
                class="inventory-row"
                :class="{ 'inventory-row--active': inventorySelectedItemId === item.id }"
                @click="inventorySelectedItemId = item.id"
              >
                <div>
                  <strong>{{ item.name }}</strong>
                  <span>{{ inventoryCategoryName(item.categoryId) }} · {{ item.unit }} · {{ item.note || '無備註' }}</span>
                </div>
                <b :class="`inventory-stock inventory-stock--${inventoryStockTone(item)}`">
                  {{ inventoryQuantityLabel(item.stockQuantity, item.unit) }}
                </b>
              </article>
              <p v-if="filteredInventoryItems.length === 0" class="inventory-empty">
                尚未建立庫存品項
              </p>
            </section>

            <section class="inventory-detail" aria-label="庫存操作">
              <template v-if="selectedInventoryItem">
                <header>
                  <div>
                    <strong>{{ selectedInventoryItem.name }}</strong>
                    <span>{{ inventoryCategoryName(selectedInventoryItem.categoryId) }} · 安全庫存 {{ selectedInventoryItem.lowStockQuantity ?? '未設定' }}</span>
                  </div>
                  <button class="ghost-danger-button" type="button" :disabled="isInventorySaving" @click="deactivateInventoryItemAction(selectedInventoryItem)">
                    停用
                  </button>
                </header>

                <form class="inventory-operation-form" @submit.prevent="createInventoryRecordAction">
                  <label>
                    操作
                    <select v-model="inventoryOperationDraft.action">
                      <option value="purchase">進貨</option>
                      <option value="return">退貨</option>
                      <option value="consumption">消耗</option>
                      <option value="scrapped">報廢</option>
                      <option value="count">盤點</option>
                    </select>
                  </label>
                  <label v-if="inventoryOperationDraft.action !== 'count'">
                    數量
                    <input v-model.number="inventoryOperationDraft.quantity" type="number" min="0" step="0.001" inputmode="decimal" />
                  </label>
                  <label v-else>
                    盤點量
                    <input v-model.number="inventoryOperationDraft.countedQuantity" type="number" step="0.001" inputmode="decimal" />
                  </label>
                  <label v-if="['purchase', 'return'].includes(inventoryOperationDraft.action)">
                    單價
                    <input v-model.number="inventoryOperationDraft.unitCost" type="number" min="0" step="1" inputmode="numeric" />
                  </label>
                  <label>
                    備註
                    <input v-model="inventoryOperationDraft.note" type="text" />
                  </label>
                  <button class="primary-button" type="submit" :disabled="isInventorySaving">
                    <Check :size="18" aria-hidden="true" />
                    {{ inventoryActionLabels[inventoryOperationDraft.action] }}
                  </button>
                </form>

                <div class="inventory-records">
                  <article v-for="record in selectedInventoryRecords" :key="record.id" class="inventory-record-row">
                    <div>
                      <strong>{{ inventoryActionLabels[record.action] }} · {{ inventoryRecordDeltaLabel(record, selectedInventoryItem) }}</strong>
                      <span>{{ formatOrderTime(record.createdAt) }} · {{ record.note || record.stationId || '無備註' }}</span>
                    </div>
                    <b>{{ inventoryQuantityLabel(record.quantityAfter, selectedInventoryItem.unit) }}</b>
                  </article>
                  <p v-if="selectedInventoryRecords.length === 0" class="inventory-empty">尚無庫存紀錄</p>
                </div>
              </template>
              <p v-else class="inventory-empty">請選擇庫存品項</p>
            </section>
          </div>
          <p class="inventory-message" aria-live="polite">{{ inventoryMessage }}</p>
        </section>
        <section v-else-if="activeToolboxPanel === 'current-sales'" class="toolbox-detail-panel" aria-labelledby="toolbox-title">
          <header class="current-sales-header">
            <div>
              <strong>{{ currentSalesPeriodLabel }}</strong>
              <span>依 iCHEF 餐期概況顯示未結帳與已結帳金額</span>
            </div>
            <button class="secondary-button" type="button" @click="runToolboxAction('closeout')">
              前往班別
            </button>
          </header>

          <div class="current-sales-grid" aria-label="目前營業概況">
            <article
              v-for="metric in currentSalesMetrics"
              :key="metric.label"
              class="current-sales-card"
              :class="`current-sales-card--${metric.tone}`"
            >
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
              <small>{{ metric.detail }}</small>
            </article>
          </div>

          <div class="current-sales-mode-list" aria-label="服務方式營業概況">
            <article v-for="row in currentSalesModeRows" :key="row.mode">
              <div>
                <strong>{{ row.label }}</strong>
                <span>{{ row.count }} 張訂單</span>
              </div>
              <dl>
                <div>
                  <dt>已結</dt>
                  <dd>{{ formatCurrency(row.paidTotal) }}</dd>
                </div>
                <div>
                  <dt>未結</dt>
                  <dd>{{ formatCurrency(row.pendingTotal) }}</dd>
                </div>
              </dl>
            </article>
          </div>
        </section>
        <section v-else-if="activeToolboxPanel === 'system-info'" class="toolbox-detail-panel" aria-labelledby="toolbox-title">
          <div class="system-info-list" aria-label="系統資訊">
            <article v-for="item in systemInfoItems" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.detail }}</small>
            </article>
          </div>
          <button
            class="secondary-button preference-reset-button"
            type="button"
            :disabled="backendStatus.mode === 'syncing'"
            @click="refreshBackendData"
          >
            <RefreshCw :size="18" aria-hidden="true" />
            重新同步
          </button>
        </section>
        <section v-else-if="activeToolboxPanel === 'label-management'" class="toolbox-detail-panel label-management-panel" aria-labelledby="toolbox-title">
          <div class="label-management-intro">
            <p>將店內常用服務新增為標籤，點餐時可快速標示。訂單標籤僅顯示於 POS 與後台紀錄。</p>
            <button class="secondary-button" type="button" @click="addLabelManagementDraft">
              <Plus :size="18" aria-hidden="true" />
              新增
            </button>
          </div>
          <div class="label-management-list">
            <article v-for="label in labelManagementDrafts" :key="label.id" class="label-management-row">
              <input
                :value="label.label"
                type="text"
                maxlength="24"
                placeholder="訂單標籤"
                @input="updateLabelManagementDraft(label.id, { label: ($event.target as HTMLInputElement).value })"
              />
              <input
                :value="label.color"
                type="color"
                aria-label="標籤顏色"
                @input="updateLabelManagementDraft(label.id, { color: ($event.target as HTMLInputElement).value })"
              />
              <button class="icon-button" type="button" aria-label="刪除標籤" @click="deleteLabelManagementDraft(label.id)">
                <Trash2 :size="18" aria-hidden="true" />
              </button>
            </article>
            <p v-if="labelManagementDrafts.length === 0" class="label-management-empty">尚未設定訂單標籤</p>
          </div>
          <div class="label-management-actions">
            <button class="primary-button" type="button" :disabled="isLabelManagementSaving || !labelManagementHasChanges" @click="saveLabelManagementDrafts">
              <Check :size="18" aria-hidden="true" />
              {{ isLabelManagementSaving ? '儲存中' : '儲存' }}
            </button>
            <button class="secondary-button" type="button" :disabled="isLabelManagementSaving" @click="syncLabelManagementDrafts">
              <RefreshCw :size="18" aria-hidden="true" />
              還原
            </button>
          </div>
          <p class="label-management-message" aria-live="polite">{{ labelManagementMessage }}</p>
        </section>
        <section v-else-if="activeToolboxPanel === 'time-clock'" class="toolbox-detail-panel" aria-labelledby="toolbox-title">
          <form class="time-clock-form" @submit.prevent="submitTimeClockAction">
            <label>
              員工識別碼
              <input
                v-model="timeClockStaffCode"
                type="password"
                inputmode="numeric"
                autocomplete="off"
                placeholder="輸入後按打卡"
              />
            </label>
            <label>
              備註
              <input v-model="timeClockNote" type="text" maxlength="120" placeholder="選填" />
            </label>
            <button class="primary-button" type="submit" :disabled="isTimeClockSubmitting">
              <Clock3 :size="18" aria-hidden="true" />
              {{ isTimeClockSubmitting ? '同步中' : '打卡' }}
            </button>
            <p class="time-clock-message" aria-live="polite">{{ timeClockMessage }}</p>
          </form>
          <article v-if="latestTimeClockEntry" class="time-clock-result">
            <strong>{{ latestTimeClockEntry.staffName }}</strong>
            <span>{{ latestTimeClockEntry.roleName || latestTimeClockEntry.roleId || '未指定角色' }}</span>
            <span>{{ latestTimeClockEntry.eventType === 'clock-in' ? '上班' : '下班' }} · {{ formatOrderTime(latestTimeClockEntry.createdAt) }}</span>
          </article>
        </section>
      </section>
    </div>
  </main>
</template>
