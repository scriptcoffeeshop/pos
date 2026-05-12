import type {
  AccessControlSettings,
  AccessControlPolicy,
  AdminPermission,
  MenuCategory,
  MenuItem,
  MemberCoupon,
  FloorLevelSetting,
  FloorDisplayPreferences,
  FloorPlanSettings,
  FloorTableSetting,
  InventoryConsumptionRule,
  InventoryConsumptionSubject,
  InventoryCategory,
  InventoryItem,
  InventoryRecord,
  InventoryRecordAction,
  OrderSource,
  OrderStatus,
  PaymentAllocation,
  PaymentMethod,
  PaymentSplit,
  PaymentStatus,
  PosAdminSettings,
  PosAuditEvent,
  DailySalesReport,
  CartLine,
  ComboLineItem,
  CustomerEngagementSettings,
  DiscountSettings,
  OnlineMenuCategory,
  OnlineMenuOptionChoice,
  OnlineMenuOptionGroup,
  OnlineNotificationRepeatMode,
  OnlineServiceModeAvailability,
  OnlineOrderReminderAction,
  OnlineOrderReminderState,
  OnlineOrderReminderStatus,
  OnlineOrderingSettings,
  PosAppearanceSettings,
  PosMember,
  PosOrder,
  PosPaymentEvent,
  PosReservation,
  ReservationBusinessHour,
  ReservationBlacklistEntry,
  ReservationSpecialDateMode,
  ReservationSpecialDateRule,
  PosStationHeartbeat,
  RegisterCashAdjustment,
  RegisterCashAdjustmentKind,
  RegisterSession,
  CashDrawerDeliveryStatus,
  CashDrawerEvent,
  CloseoutReportDelivery,
  CloseoutReportDeliveryStatus,
  ComboProductGroup,
  ReservationStatus,
  StaffTimeClockEntry,
  StaffPermissionVerification,
  SupplyPeriodRule,
  TimeClockEventType,
  WaitlineEntry,
  PrintJob,
  PrintLabelMode,
  PrintRuleSetting,
  PrintRuleTiming,
  PrintStatus,
  PrinterSettings,
  PrintStation,
  ServiceMode,
} from '../types/pos'
import {
  defaultDineInTimeLimitSettings,
  normalizeDineInTimeLimitSettings,
} from './dineInTimeLimit'
import { defaultDiscountSettings, normalizeDiscountSettings } from './discounts'

interface ApiProduct {
  id: string
  sku: string
  barcode?: string | null
  name: string
  category: MenuCategory
  price: number
  tags: string[] | null
  accent: string | null
  is_available: boolean
  sort_order: number
  pos_visible: boolean
  online_visible: boolean
  qr_visible: boolean
  prep_station: string | null
  print_label: boolean
  inventory_count?: number | null
  low_stock_threshold?: number | null
  sold_out_until?: string | null
  supply_windows?: unknown
  future_order_available?: boolean
}

interface ApiOrderItem {
  id: string
  product_id: string | null
  product_sku: string
  name: string
  unit_price: number
  quantity: number
  options: unknown
  combo_items?: unknown
  print_paused?: boolean | null
  fulfilled_at?: string | null
  fulfilled_by_station_id?: string | null
}

interface ApiPrintJob {
  id: string
  status: PrintStatus
  printed_at: string | null
  created_at: string
  attempts: number
  last_error: string | null
}

interface ApiOrder {
  id: string
  order_number: string
  source: OrderSource
  service_mode: ServiceMode
  customer_name: string
  customer_phone: string
  delivery_address?: string | null
  requested_fulfillment_at?: string | null
  tax_id?: string | null
  invoice_carrier_barcode?: string | null
  invoice_donation_code?: string | null
  electronic_invoice_requested?: boolean | null
  electronic_invoice_status?: PosOrder['electronicInvoiceStatus'] | null
  electronic_invoice_print_mode?: PosOrder['electronicInvoicePrintMode'] | null
  electronic_invoice_number?: string | null
  electronic_invoice_random_code?: string | null
  electronic_invoice_issued_at?: string | null
  electronic_invoice_voided_at?: string | null
  electronic_invoice_upload_due_at?: string | null
  member_id?: string | null
  note: string
  subtotal: number
  order_labels?: string[] | null
  service_fee_rate?: number | null
  service_fee_amount?: number | null
  extra_fee_amount?: number | null
  discount_amount?: number | null
  points_redeemed?: number | null
  coupon_code?: string | null
  payment_splits?: unknown
  payment_breakdown?: unknown
  transaction_receipt_count?: number | null
  member_points_earned?: number | null
  register_session_id?: string | null
  checkout_station_id?: string | null
  checkout_book_id?: string | null
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  status: OrderStatus
  created_at: string
  claimed_by?: string | null
  claimed_at?: string | null
  claim_expires_at?: string | null
  draft_lines?: unknown
  order_items?: ApiOrderItem[]
  print_jobs?: ApiPrintJob[]
}

interface ApiOnlineOrderReminderState {
  order_id: string
  order_number: string
  status: OnlineOrderReminderStatus
  snoozed_until: string | null
  snoozed_by_station_id: string | null
  seen_at: string | null
  seen_by_station_id: string | null
  last_action: OnlineOrderReminderState['lastAction']
  created_at: string
  updated_at: string
}

interface CreateOrderResponse {
  order: ApiOrder
}

interface ProductsResponse {
  products: ApiProduct[]
}

interface OrdersResponse {
  orders: ApiOrder[]
}

interface OnlineOrderReminderStatesResponse {
  states: ApiOnlineOrderReminderState[]
}

interface PrintJobResponse {
  printJob: ApiPrintJob
}

interface ClaimOrderResponse {
  order: ApiOrder
}

interface ApiRegisterSession {
  id: string
  status: 'open' | 'closed'
  book_id?: string | null
  book_name?: string | null
  station_id?: string | null
  opened_at: string
  closed_at: string | null
  opening_cash: number
  closing_cash: number | null
  expected_cash: number
  cash_sales: number
  non_cash_sales: number
  cash_adjustment_income?: number | null
  cash_adjustment_expense?: number | null
  pending_total: number
  order_count: number
  open_order_count: number
  failed_payment_count: number
  failed_print_count: number
  voided_order_count: number
  note: string
  cash_adjustments?: ApiRegisterCashAdjustment[] | null
}

interface ApiRegisterCashAdjustment {
  id: string
  register_session_id: string
  kind: RegisterCashAdjustmentKind
  reason: string
  amount: number
  note: string | null
  station_id: string | null
  created_at: string
}

interface RegisterSessionResponse {
  session: ApiRegisterSession | null
  adjustment?: ApiRegisterCashAdjustment
}

interface ApiCashDrawerEvent {
  id: string
  station_id: string | null
  register_session_id: string | null
  reason?: string | null
  device_id?: string | null
  target_station_id?: string | null
  printer_host?: string | null
  printer_port?: number | null
  delivery_status?: CashDrawerDeliveryStatus | null
  error_message?: string | null
  created_at: string
}

interface CashDrawerEventsResponse {
  events: ApiCashDrawerEvent[]
}

interface ApiInventoryCategory {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface ApiInventoryItem {
  id: string
  category_id: string
  name: string
  unit: string
  default_unit_cost: number
  stock_quantity: number | string
  low_stock_quantity: number | string | null
  note: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

interface ApiInventoryRecord {
  id: string
  item_id: string
  action: InventoryRecordAction
  quantity: number | string
  quantity_delta: number | string
  quantity_after: number | string
  unit_cost: number
  total_cost: number
  note: string | null
  station_id: string | null
  created_at: string
}

interface ApiInventoryConsumptionRule {
  id: string
  subject_type: InventoryConsumptionSubject
  product_id: string | null
  option_label: string | null
  item_id: string
  quantity: number | string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

interface InventoryResponse {
  categories: ApiInventoryCategory[]
  items: ApiInventoryItem[]
  records: ApiInventoryRecord[]
  consumptionRules?: ApiInventoryConsumptionRule[]
}

interface InventoryCategoryResponse {
  category: ApiInventoryCategory
}

interface InventoryItemResponse {
  item: ApiInventoryItem
}

interface InventoryRecordResponse {
  record: ApiInventoryRecord
}

interface InventoryConsumptionRuleResponse {
  rule: ApiInventoryConsumptionRule
}

interface ApiAuditEvent {
  id: string
  action: string
  order_id: string | null
  register_session_id: string | null
  station_id: string | null
  actor: string | null
  metadata: unknown
  created_at: string
}

interface ApiCloseoutReportDelivery {
  id: string
  register_session_id: string
  recipient_staff_id: string
  recipient_name: string
  recipient_email: string
  status: CloseoutReportDeliveryStatus
  subject: string
  delivery_provider: string
  error_message: string | null
  sent_at: string | null
  created_at: string
}

interface ApiPaymentEvent {
  id: string
  provider: string
  event_id: string
  order_id: string
  order_number: string
  event_type: string
  payment_status: PaymentStatus
  amount: number | null
  applied: boolean
  duplicate: boolean
  processed_at: string | null
  created_at: string
}

interface ApiTransactionLedgerEntry {
  id: string
  member_id: string | null
  order_id: string | null
  entry_type: 'top_up' | 'payment' | 'refund' | 'adjustment'
  amount: number
  balance_after: number | null
  note: string
  created_at: string
}

interface ApiMember {
  id: string
  line_user_id: string | null
  line_display_name: string
  phone?: string | null
  customer_type?: string | null
  points_balance?: number | null
  wallet_balance: number
  created_at: string
  updated_at: string
  ledger?: ApiTransactionLedgerEntry[]
  coupons?: ApiMemberCoupon[]
}

interface ApiMemberCoupon {
  id: string
  member_id: string | null
  code: string
  title: string
  discount_amount: number
  discount_percent: number
  status: 'active' | 'redeemed' | 'expired'
  expires_at: string | null
  redeemed_order_id?: string | null
  redeemed_at?: string | null
  redemption_station_id?: string | null
  created_at: string
  updated_at: string
}

interface ApiReservation {
  id: string
  customer_name: string
  customer_phone: string
  party_size: number
  reserved_at: string
  status: ReservationStatus
  important_label: string
  assigned_table_ids?: string[] | null
  pre_order: unknown
  note: string
  created_at: string
  updated_at: string
}

interface ApiReservationBlacklistEntry {
  id: string
  phone: string
  normalized_phone: string
  customer_name: string
  reason: string
  note: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface AuditEventsResponse {
  events: ApiAuditEvent[]
}

interface CloseoutReportDeliveriesResponse {
  deliveries: ApiCloseoutReportDelivery[]
}

interface PaymentEventsResponse {
  events: ApiPaymentEvent[]
}

interface MembersResponse {
  members: ApiMember[]
}

interface MemberResponse {
  member: ApiMember
}

interface CouponsResponse {
  coupons: ApiMemberCoupon[]
}

interface CouponResponse {
  coupon: ApiMemberCoupon
}

interface ReservationsResponse {
  reservations: ApiReservation[]
}

interface ReservationResponse {
  reservation: ApiReservation
}

interface ReservationBlacklistResponse {
  entries: ApiReservationBlacklistEntry[]
}

interface ReservationBlacklistEntryResponse {
  entry: ApiReservationBlacklistEntry
}

interface ApiStationHeartbeat {
  station_id: string
  station_label: string | null
  platform: string | null
  app_version: string | null
  user_agent: string | null
  last_seen_at: string
  created_at: string
}

interface ApiStaffTimeClockEntry {
  id: string
  staff_account_id: string
  staff_code: string
  staff_name: string
  role_id: string
  role_name: string
  event_type: 'clock_in' | 'clock_out'
  station_id: string | null
  note: string | null
  created_at: string
}

interface StationHeartbeatResponse {
  station: ApiStationHeartbeat
}

interface StationHeartbeatsResponse {
  stations: ApiStationHeartbeat[]
}

interface StaffTimeClockEntryResponse {
  entry: ApiStaffTimeClockEntry
}

interface StaffTimeClockEntriesResponse {
  entries: ApiStaffTimeClockEntry[]
}

interface ApiSettingRow {
  key: string
  value: unknown
}

interface AdminSettingsResponse {
  settings: ApiSettingRow[]
}

interface RuntimeSettingsResponse {
  printerSettings: PrinterSettings
  onlineOrdering: OnlineOrderingSettings
  discountSettings: DiscountSettings
  posAppearance: PosAppearanceSettings
  floorPlan: FloorPlanSettings
  engagementSettings: CustomerEngagementSettings
  accessPolicy: AccessControlPolicy
}

interface DailyReportResponse {
  report: DailySalesReport
}

export interface ProductUpdateInput {
  sku?: string
  barcode?: string
  name: string
  category: MenuCategory
  price: number
  tags: string[]
  accent: string
  isAvailable: boolean
  sortOrder: number
  posVisible: boolean
  onlineVisible: boolean
  qrVisible: boolean
  prepStation: string
  printLabel: boolean
  inventoryCount: number | null
  lowStockThreshold: number | null
  soldOutUntil: string | null
  supplyPeriods: SupplyPeriodRule[]
  futureOrderAvailable: boolean
}

export interface CreateMemberInput {
  lineUserId: string
  displayName: string
  phone: string
  customerType: string
  pointsBalance: number
  openingBalance: number
  note: string
}

export interface WalletAdjustmentInput {
  amount: number
  note: string
}

export interface FloorAssignmentInput {
  tableLabel: string
  partySize: number
  floorLabel?: string
}

export interface CreateCouponInput {
  memberId: string | null
  code: string
  title: string
  discountAmount: number
  discountPercent: number
  expiresAt: string | null
}

export interface ReservationInput {
  customerName: string
  customerPhone: string
  partySize: number
  reservedAt: string
  status: ReservationStatus
  importantLabel: string
  assignedTableIds?: string[]
  preOrder: CartLine[]
  note: string
}

export interface PublicReservationInput {
  customerName: string
  customerPhone: string
  partySize: number
  reservedAt: string
  note: string
}

export interface ReservationBlacklistInput {
  phone: string
  customerName?: string
  reason?: string
  note?: string
  isActive?: boolean
}

export interface OnlineOrderReminderStateUpdateInput {
  orderIds: string[]
  action: OnlineOrderReminderAction
  snoozedUntil?: string
}

export interface InventoryCategoryInput {
  name: string
  sortOrder: number
  isActive: boolean
}

export interface InventoryItemInput {
  categoryId: string
  name: string
  unit: string
  defaultUnitCost: number
  stockQuantity: number
  lowStockQuantity: number | null
  note: string
  isActive: boolean
  sortOrder: number
}

export interface InventoryRecordInput {
  itemId: string
  action: InventoryRecordAction
  quantity?: number
  unitCost?: number
  totalCost?: number
  countedQuantity?: number
  note?: string
}

export interface InventoryConsumptionRuleInput {
  subjectType: InventoryConsumptionSubject
  productId?: string | null
  optionLabel?: string
  itemId: string
  quantity: number
  isActive?: boolean
  sortOrder?: number
}

interface ProductResponse {
  product: ApiProduct
}

export type AdminSettingKey =
  | 'printer_settings'
  | 'access_control'
  | 'online_ordering'
  | 'discount_settings'
  | 'pos_appearance'
  | 'floor_plan'
  | 'engagement_settings'
export type ProductChannel = 'pos' | 'online' | 'qr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const stationIdStorageKey = 'script-coffee-pos-station-id'

const apiBaseUrl = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/pos-api` : ''

export const isPosApiConfigured = Boolean(apiBaseUrl && supabaseAnonKey)

export const posApiConnection = (): { apiBaseUrl: string; supabaseAnonKey: string } | null =>
  isPosApiConfigured && supabaseAnonKey
    ? { apiBaseUrl, supabaseAnonKey }
    : null

export const currentStationId = (): string => {
  try {
    const savedId = globalThis.localStorage?.getItem(stationIdStorageKey)
    if (savedId && savedId.length <= 32) {
      return savedId
    }

    const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const suffix = randomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()
    const nextId = `tablet-${suffix}`
    globalThis.localStorage?.setItem(stationIdStorageKey, nextId)
    return nextId
  } catch {
    return `tablet-session-${Date.now()}`
  }
}

export const currentStationLabel = (): string => {
  const stationId = currentStationId()
  return `平板 ${stationId.replace(/^tablet-/, '').slice(-4).toUpperCase()}`
}

const request = async <ResponseBody>(path: string, init: RequestInit = {}): Promise<ResponseBody> => {
  if (!isPosApiConfigured || !supabaseAnonKey) {
    throw new Error('POS API is not configured')
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `POS API request failed with ${response.status}`)
  }

  return response.json() as Promise<ResponseBody>
}

const normalizeOptions = (options: unknown): string[] => {
  if (!Array.isArray(options)) {
    return []
  }
  return options.filter((option): option is string => typeof option === 'string')
}

export const normalizePaymentSplits = (splits: unknown): PaymentSplit[] => {
  if (!Array.isArray(splits)) {
    return []
  }

  return splits.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const split = entry as Partial<PaymentSplit>
    const amount = Math.max(0, Math.trunc(Number(split.amount) || 0))
    const paymentMethod: PaymentMethod = split.paymentMethod === 'card' ||
      split.paymentMethod === 'app91-card' ||
      split.paymentMethod === 'line-pay' ||
      split.paymentMethod === 'jkopay' ||
      split.paymentMethod === 'transfer'
      ? split.paymentMethod
      : 'cash'
    const paidAt = typeof split.paidAt === 'string' && Number.isFinite(new Date(split.paidAt).getTime())
      ? split.paidAt
      : null

    const status: PaymentSplit['status'] = split.status === 'paid' ? 'paid' : 'open'

    return [{
      id: typeof split.id === 'string' && split.id.trim()
        ? split.id.trim().slice(0, 80)
        : `split-${index + 1}`,
      label: typeof split.label === 'string' && split.label.trim()
        ? split.label.trim().slice(0, 40)
        : `子單 ${index + 1}`,
      amount,
      lineKeys: Array.isArray(split.lineKeys)
        ? [...new Set(split.lineKeys.filter((lineKey): lineKey is string => typeof lineKey === 'string').map((lineKey) => lineKey.slice(0, 120)))].slice(0, 60)
        : [],
      paymentMethod,
      status,
      paidAt,
    }]
  }).slice(0, 12)
}

export const normalizePaymentBreakdown = (payments: unknown): PaymentAllocation[] => {
  if (!Array.isArray(payments)) {
    return []
  }

  return payments.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const payment = entry as Partial<PaymentAllocation>
    const paymentMethod: PaymentMethod = payment.paymentMethod === 'card' ||
      payment.paymentMethod === 'app91-card' ||
      payment.paymentMethod === 'line-pay' ||
      payment.paymentMethod === 'jkopay' ||
      payment.paymentMethod === 'transfer'
      ? payment.paymentMethod
      : 'cash'
    const paidAt = typeof payment.paidAt === 'string' && Number.isFinite(new Date(payment.paidAt).getTime())
      ? payment.paidAt
      : null
    const status: PaymentAllocation['status'] = payment.status === 'paid' ? 'paid' : 'open'

    return [{
      id: typeof payment.id === 'string' && payment.id.trim()
        ? payment.id.trim().slice(0, 80)
        : `payment-${index + 1}`,
      paymentMethod,
      amount: Math.max(0, Math.trunc(Number(payment.amount) || 0)),
      status,
      paidAt,
    }]
  }).slice(0, 8)
}

const readDraftLineString = (line: Record<string, unknown>, camelKey: string, snakeKey: string): string =>
  typeof line[camelKey] === 'string'
    ? String(line[camelKey])
    : typeof line[snakeKey] === 'string'
      ? String(line[snakeKey])
      : ''

const readDraftLineNumber = (line: Record<string, unknown>, camelKey: string, snakeKey: string): number => {
  const value = line[camelKey] ?? line[snakeKey]
  return Number.isFinite(value) ? Math.trunc(Number(value)) : 0
}

const normalizeComboLineItems = (items: unknown): ComboLineItem[] => {
  if (!Array.isArray(items)) {
    return []
  }

  return items.flatMap((entry): ComboLineItem[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const comboItem = entry as Partial<ComboLineItem>
    if (
      typeof comboItem.groupId !== 'string' ||
      typeof comboItem.groupLabel !== 'string' ||
      typeof comboItem.productId !== 'string' ||
      typeof comboItem.productSku !== 'string' ||
      typeof comboItem.name !== 'string'
    ) {
      return []
    }

    return [{
      groupId: comboItem.groupId,
      groupLabel: comboItem.groupLabel,
      productId: comboItem.productId,
      productSku: comboItem.productSku,
      name: comboItem.name,
      quantity: Math.max(1, Math.trunc(Number(comboItem.quantity) || 1)),
      priceDelta: Math.trunc(Number(comboItem.priceDelta) || 0),
      options: Array.isArray(comboItem.options)
        ? comboItem.options.filter((option): option is string => typeof option === 'string')
        : [],
    }]
  }).slice(0, 80)
}

const normalizeDraftLines = (lines: unknown): CartLine[] => {
  if (!Array.isArray(lines)) {
    return []
  }

  return lines.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const line = entry as Record<string, unknown>
    const productSku = readDraftLineString(line, 'productSku', 'product_sku')
    const name = readDraftLineString(line, 'name', 'name')
    const unitPrice = readDraftLineNumber(line, 'unitPrice', 'unit_price')
    const quantity = readDraftLineNumber(line, 'quantity', 'quantity')
    if (!productSku || !name || unitPrice < 0 || quantity <= 0) {
      return []
    }

    const productId = readDraftLineString(line, 'productId', 'product_id')
    const cartLine: CartLine = {
      itemId: productId || productSku,
      productSku,
      name,
      unitPrice,
      quantity,
      options: normalizeOptions(line.options),
    }
    const comboItems = normalizeComboLineItems(line.comboItems ?? line.combo_items)
    if (comboItems.length > 0) {
      cartLine.comboItems = comboItems
    }
    if (productId) {
      cartLine.productId = productId
    }
    const printPaused = line.printPaused ?? line.print_paused
    if (typeof printPaused === 'boolean') {
      cartLine.printPaused = printPaused
    }
    return [cartLine]
  })
}

const normalizePrintStatus = (order: ApiOrder): PrintStatus => {
  const printJobs = order.print_jobs ?? []
  if (printJobs.length === 0) {
    return 'skipped'
  }

  if (printJobs.some((job) => job.status === 'failed')) {
    return 'failed'
  }

  if (printJobs.every((job) => job.status === 'printed')) {
    return 'printed'
  }

  if (printJobs.some((job) => job.status === 'queued')) {
    return 'queued'
  }

  return 'skipped'
}

const normalizePrintJob = (printJob: ApiPrintJob): PrintJob => ({
  id: printJob.id,
  status: printJob.status,
  printedAt: printJob.printed_at,
  createdAt: printJob.created_at,
  attempts: printJob.attempts,
  lastError: printJob.last_error,
})

const normalizeRegisterCashAdjustment = (
  adjustment: ApiRegisterCashAdjustment,
): RegisterCashAdjustment => ({
  id: adjustment.id,
  registerSessionId: adjustment.register_session_id,
  kind: adjustment.kind,
  reason: adjustment.reason,
  amount: adjustment.amount,
  note: adjustment.note ?? '',
  stationId: adjustment.station_id ?? '',
  createdAt: adjustment.created_at,
})

const normalizeCashDrawerEvent = (event: ApiCashDrawerEvent): CashDrawerEvent => ({
  id: event.id,
  stationId: event.station_id ?? '',
  registerSessionId: event.register_session_id ?? null,
  reason: event.reason ?? '',
  deviceId: event.device_id ?? '',
  targetStationId: event.target_station_id ?? '',
  printerHost: event.printer_host ?? '',
  printerPort: event.printer_port ?? 0,
  deliveryStatus: event.delivery_status ?? 'preview',
  errorMessage: event.error_message ?? '',
  createdAt: event.created_at,
})

const normalizeInventoryNumber = (value: number | string | null | undefined): number => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.round(numberValue * 1000) / 1000 : 0
}

const normalizeInventoryCategory = (category: ApiInventoryCategory): InventoryCategory => ({
  id: category.id,
  name: category.name,
  sortOrder: category.sort_order,
  isActive: category.is_active,
  createdAt: category.created_at,
  updatedAt: category.updated_at,
})

const normalizeInventoryItem = (item: ApiInventoryItem): InventoryItem => ({
  id: item.id,
  categoryId: item.category_id,
  name: item.name,
  unit: item.unit,
  defaultUnitCost: item.default_unit_cost,
  stockQuantity: normalizeInventoryNumber(item.stock_quantity),
  lowStockQuantity: item.low_stock_quantity === null ? null : normalizeInventoryNumber(item.low_stock_quantity),
  note: item.note ?? '',
  isActive: item.is_active,
  sortOrder: item.sort_order,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
})

const normalizeInventoryRecord = (record: ApiInventoryRecord): InventoryRecord => ({
  id: record.id,
  itemId: record.item_id,
  action: record.action,
  quantity: normalizeInventoryNumber(record.quantity),
  quantityDelta: normalizeInventoryNumber(record.quantity_delta),
  quantityAfter: normalizeInventoryNumber(record.quantity_after),
  unitCost: record.unit_cost,
  totalCost: record.total_cost,
  note: record.note ?? '',
  stationId: record.station_id ?? '',
  createdAt: record.created_at,
})

const normalizeInventoryConsumptionRule = (
  rule: ApiInventoryConsumptionRule,
): InventoryConsumptionRule => ({
  id: rule.id,
  subjectType: rule.subject_type,
  productId: rule.product_id,
  optionLabel: rule.option_label ?? '',
  itemId: rule.item_id,
  quantity: normalizeInventoryNumber(rule.quantity),
  isActive: rule.is_active,
  sortOrder: rule.sort_order,
  createdAt: rule.created_at,
  updatedAt: rule.updated_at,
})

const normalizeRegisterSession = (session: ApiRegisterSession): RegisterSession => ({
  id: session.id,
  status: session.status,
  bookId: session.book_id ?? 'main',
  bookName: session.book_name ?? '主帳本',
  stationId: session.station_id ?? '',
  openedAt: session.opened_at,
  closedAt: session.closed_at,
  openingCash: session.opening_cash,
  closingCash: session.closing_cash,
  expectedCash: session.expected_cash,
  cashSales: session.cash_sales,
  nonCashSales: session.non_cash_sales,
  cashAdjustmentIncome: session.cash_adjustment_income ?? 0,
  cashAdjustmentExpense: session.cash_adjustment_expense ?? 0,
  pendingTotal: session.pending_total,
  orderCount: session.order_count,
  openOrderCount: session.open_order_count,
  failedPaymentCount: session.failed_payment_count,
  failedPrintCount: session.failed_print_count,
  voidedOrderCount: session.voided_order_count,
  note: session.note,
  cashAdjustments: (session.cash_adjustments ?? []).map(normalizeRegisterCashAdjustment),
})

const normalizeMetadata = (metadata: unknown): Record<string, unknown> => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }

  return metadata as Record<string, unknown>
}

const normalizeAuditEvent = (event: ApiAuditEvent): PosAuditEvent => ({
  id: event.id,
  action: event.action,
  orderId: event.order_id,
  registerSessionId: event.register_session_id,
  stationId: event.station_id ?? '',
  actor: event.actor ?? '',
  metadata: normalizeMetadata(event.metadata),
  createdAt: event.created_at,
})

const normalizeCloseoutReportDelivery = (delivery: ApiCloseoutReportDelivery): CloseoutReportDelivery => ({
  id: delivery.id,
  registerSessionId: delivery.register_session_id,
  recipientStaffId: delivery.recipient_staff_id,
  recipientName: delivery.recipient_name,
  recipientEmail: delivery.recipient_email,
  status: delivery.status,
  subject: delivery.subject,
  deliveryProvider: delivery.delivery_provider,
  errorMessage: delivery.error_message ?? '',
  sentAt: delivery.sent_at,
  createdAt: delivery.created_at,
})

const normalizePaymentEvent = (event: ApiPaymentEvent): PosPaymentEvent => ({
  id: event.id,
  provider: event.provider,
  eventId: event.event_id,
  orderId: event.order_id,
  orderNumber: event.order_number,
  eventType: event.event_type,
  paymentStatus: event.payment_status,
  amount: event.amount,
  applied: event.applied,
  duplicate: event.duplicate,
  processedAt: event.processed_at,
  createdAt: event.created_at,
})

const normalizeLedgerEntry = (entry: ApiTransactionLedgerEntry) => ({
  id: entry.id,
  memberId: entry.member_id,
  orderId: entry.order_id,
  entryType: entry.entry_type,
  amount: entry.amount,
  balanceAfter: entry.balance_after,
  note: entry.note,
  createdAt: entry.created_at,
})

const normalizeCoupon = (coupon: ApiMemberCoupon) => ({
  id: coupon.id,
  memberId: coupon.member_id,
  code: coupon.code,
  title: coupon.title,
  discountAmount: coupon.discount_amount,
  discountPercent: coupon.discount_percent,
  status: coupon.status,
  expiresAt: coupon.expires_at,
  redeemedOrderId: coupon.redeemed_order_id ?? null,
  redeemedAt: coupon.redeemed_at ?? null,
  redemptionStationId: coupon.redemption_station_id ?? '',
  createdAt: coupon.created_at,
  updatedAt: coupon.updated_at,
})

const normalizeMember = (member: ApiMember): PosMember => ({
  id: member.id,
  lineUserId: member.line_user_id,
  displayName: member.line_display_name,
  phone: member.phone ?? '',
  customerType: member.customer_type ?? '一般顧客',
  pointsBalance: member.points_balance ?? 0,
  walletBalance: member.wallet_balance,
  createdAt: member.created_at,
  updatedAt: member.updated_at,
  ledger: (member.ledger ?? []).map(normalizeLedgerEntry),
  coupons: (member.coupons ?? []).map(normalizeCoupon),
})

const normalizeReservation = (reservation: ApiReservation): PosReservation => ({
  id: reservation.id,
  customerName: reservation.customer_name,
  customerPhone: reservation.customer_phone,
  partySize: reservation.party_size,
  reservedAt: reservation.reserved_at,
  status: reservation.status,
  importantLabel: reservation.important_label,
  assignedTableIds: Array.isArray(reservation.assigned_table_ids)
    ? reservation.assigned_table_ids.filter((tableId): tableId is string => typeof tableId === 'string')
    : [],
  preOrder: normalizeDraftLines(reservation.pre_order),
  note: reservation.note,
  createdAt: reservation.created_at,
  updatedAt: reservation.updated_at,
})

const normalizeReservationBlacklistEntry = (entry: ApiReservationBlacklistEntry): ReservationBlacklistEntry => ({
  id: entry.id,
  phone: entry.phone,
  normalizedPhone: entry.normalized_phone,
  customerName: entry.customer_name,
  reason: entry.reason,
  note: entry.note,
  isActive: entry.is_active,
  createdAt: entry.created_at,
  updatedAt: entry.updated_at,
})

const normalizeStationHeartbeat = (station: ApiStationHeartbeat): PosStationHeartbeat => ({
  stationId: station.station_id,
  stationLabel: station.station_label ?? station.station_id,
  platform: station.platform ?? '',
  appVersion: station.app_version ?? '',
  userAgent: station.user_agent ?? '',
  lastSeenAt: station.last_seen_at,
  createdAt: station.created_at,
})

const normalizeStaffTimeClockEntry = (entry: ApiStaffTimeClockEntry): StaffTimeClockEntry => ({
  id: entry.id,
  staffAccountId: entry.staff_account_id,
  staffCode: entry.staff_code,
  staffName: entry.staff_name,
  roleId: entry.role_id,
  roleName: entry.role_name,
  eventType: entry.event_type === 'clock_in' ? 'clock-in' : 'clock-out',
  stationId: entry.station_id ?? '',
  note: entry.note ?? '',
  createdAt: entry.created_at,
})

export const normalizeProduct = (product: ApiProduct): MenuItem => ({
  id: product.id,
  sku: product.sku,
  barcode: product.barcode ?? '',
  name: product.name,
  category: product.category,
  price: product.price,
  tags: product.tags ?? [],
  accent: product.accent ?? '#0b6b63',
  available: product.is_available,
  sortOrder: product.sort_order,
  posVisible: product.pos_visible,
  onlineVisible: product.online_visible,
  qrVisible: product.qr_visible,
  prepStation: product.prep_station ?? 'bar',
  printLabel: product.print_label,
  inventoryCount: product.inventory_count ?? null,
  lowStockThreshold: product.low_stock_threshold ?? null,
  soldOutUntil: product.sold_out_until ?? null,
  supplyPeriods: normalizeSupplyWindows(product.supply_windows),
  futureOrderAvailable: product.future_order_available === true,
})

const legacyPrintRuleName = (name: string, serviceMode: ServiceMode): string => {
  if (name === '內用收據' || (name.includes('內用') && name.includes('收據'))) {
    return '內用貼紙'
  }

  if (name === '外送收據' || (name.includes('外送') && name.includes('收據'))) {
    return '外送貼紙'
  }

  if (serviceMode === 'dine-in' && name === '新印單規則') {
    return '內用貼紙'
  }

  if (serviceMode === 'delivery' && name === '新印單規則') {
    return '外送貼紙'
  }

  return name
}

const legacyPrintRuleLabelMode = (rule: PrintRuleSetting): PrintLabelMode => {
  if (rule.name === '內用收據' || rule.name === '外送收據') {
    return 'label'
  }

  return rule.labelMode
}

const defaultPrintRuleTimings: PrintRuleTiming[] = ['order', 'reprint']

const normalizePrintRuleTimings = (timings: unknown): PrintRuleTiming[] => {
  if (!Array.isArray(timings)) {
    return defaultPrintRuleTimings
  }

  const normalized = timings.filter((timing): timing is PrintRuleTiming =>
    timing === 'order' || timing === 'reprint' || timing === 'move' || timing === 'merge',
  )
  return normalized.length > 0 ? [...new Set(normalized)] : defaultPrintRuleTimings
}

const isPrinterSettings = (value: unknown): value is PrinterSettings => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const settings = value as PrinterSettings
  return Array.isArray(settings.stations) && Array.isArray(settings.rules)
}

const normalizePrinterSettings = (value: unknown): PrinterSettings => {
  if (!isPrinterSettings(value)) {
    return { stations: [], rules: [] }
  }

  return {
    stations: value.stations.map((station) => ({ ...station })),
    rules: value.rules.map((rule) => {
      const labelMode = legacyPrintRuleLabelMode(rule)
      return {
        ...rule,
        name: legacyPrintRuleName(rule.name, rule.serviceMode),
        labelMode,
        timings: normalizePrintRuleTimings((rule as Partial<PrintRuleSetting>).timings),
        categories: Array.isArray(rule.categories) ? [...rule.categories] : [],
        itemIds: Array.isArray(rule.itemIds) ? [...rule.itemIds] : [],
        countExcludedCategories: Array.isArray(rule.countExcludedCategories) ? [...rule.countExcludedCategories] : [],
        countExcludedItemIds: Array.isArray(rule.countExcludedItemIds) ? [...rule.countExcludedItemIds] : [],
      }
    }),
  }
}

const isAccessControlSettings = (value: unknown): value is AccessControlSettings => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const settings = value as AccessControlSettings
  return Array.isArray(settings.roles)
}

const normalizeRolePermissions = (permissions: AdminPermission[]): AdminPermission[] => {
  const normalized = new Set(permissions)
  if (normalized.has('manageReports') || normalized.has('closeRegister')) {
    normalized.add('viewCurrentSales')
  }
  return [...normalized]
}

const normalizeAccessControlSettings = (value: unknown): AccessControlSettings => {
  if (!isAccessControlSettings(value)) {
    return { roles: [], staffAccounts: [], protectedPermissions: [] }
  }

  const roles = value.roles.map((role) => ({ ...role, permissions: normalizeRolePermissions([...role.permissions]) }))
  const fallbackRole = roles[0]
  const protectedPermissions = Array.isArray(value.protectedPermissions)
    ? [...new Set(value.protectedPermissions.filter((permission): permission is AdminPermission => typeof permission === 'string'))]
    : []

  return {
    roles,
    staffAccounts: Array.isArray(value.staffAccounts)
      ? value.staffAccounts.map((staff) => ({
          ...staff,
          active: staff.active !== false,
          reportEmail: typeof staff.reportEmail === 'string' ? staff.reportEmail : '',
        }))
      : fallbackRole
        ? [
            {
              id: 'owner',
              name: '店主',
              staffCode: '0000',
              roleId: fallbackRole.id,
              active: true,
              reportEmail: '',
            },
          ]
        : [],
    protectedPermissions,
  }
}

const normalizeAccessPolicy = (value: unknown): AccessControlPolicy => {
  if (!value || typeof value !== 'object') {
    return { protectedPermissions: [] }
  }

  const policy = value as Partial<AccessControlPolicy>
  return {
    protectedPermissions: Array.isArray(policy.protectedPermissions)
      ? [...new Set(policy.protectedPermissions.filter((permission): permission is AdminPermission => typeof permission === 'string'))]
      : [],
  }
}

const defaultOnlinePaymentMethods = (): OnlineOrderingSettings['paymentMethods'] => [
  { id: 'line-pay', label: 'LINE Pay', enabled: true, opensCashDrawer: false },
  { id: 'jkopay', label: '街口', enabled: true, opensCashDrawer: false },
  { id: 'cash', label: '取餐時付款', enabled: true, opensCashDrawer: true },
  { id: 'card', label: '線上刷卡', enabled: false, opensCashDrawer: false },
  { id: 'app91-card', label: '91APP 支付線上刷卡', enabled: false, opensCashDrawer: false },
  { id: 'transfer', label: '轉帳', enabled: false, opensCashDrawer: false },
]

const defaultScheduledOrderTimeWindows = (): OnlineOrderingSettings['scheduledOrderTimeWindows'] => [
  {
    id: 'daily',
    label: '每日',
    days: [1, 2, 3, 4, 5, 6, 0],
    start: '00:00',
    end: '23:59',
    allDay: true,
  },
]

export const defaultOnlineOrderingSettings = (): OnlineOrderingSettings => ({
  enabled: true,
  serviceModeAvailability: {
    'dine-in': true,
    takeout: true,
    delivery: true,
  },
  allowScheduledOrders: true,
  scheduledOrderIntervalMinutes: 15,
  scheduledOrderMaxDays: 7,
  scheduledOrderTimeWindows: defaultScheduledOrderTimeWindows(),
  averagePrepMinutes: 20,
  unconfirmedReminderMinutes: 5,
  acceptanceRequired: true,
  acceptWithoutPrinting: false,
  soundEnabled: true,
  notificationRepeatMode: 'continuous',
  notificationVolume: 80,
  checkoutInstructions: '',
  showTaxIdField: false,
  showCarrierBarcodeField: false,
  showDonationCodeField: false,
  paymentMethods: defaultOnlinePaymentMethods(),
  deliveryFeeAmount: 60,
  deliveryMinimumSubtotal: 0,
  freeDeliveryThreshold: 0,
  deliveryTravelMinutes: 20,
  sessionQrCode: {
    autoPrint: false,
    stationId: '',
    logoText: 'Script Coffee',
  },
  dineInTimeLimit: defaultDineInTimeLimitSettings(),
  dineInCheckout: {
    mode: 'postpaid',
  },
  commentFields: {
    itemNotes: 'shown',
    orderNote: 'optional',
    orderNotePlaceholder: '甜度、冰量或其他需求',
  },
  tableQrCode: {
    theme: 'black',
    logoText: 'Script Coffee',
    logoDataUrl: '',
  },
  storeProfile: {
    name: 'Script Coffee',
    phone: '',
    address: '',
    notice: '',
    noticeExpanded: false,
    coverImageDataUrls: [],
  },
  notificationRouting: {
    stations: [],
  },
  pauseMessage: '目前暫停線上點餐，請稍後再試',
  menuCategories: [],
  availableOptionChoices: [],
  menuOptionGroups: [],
  productOptionAssignments: {},
  comboProductAssignments: {},
  noteSupplyStatuses: {},
})

const notificationRepeatModes = new Set<OnlineNotificationRepeatMode>(['once', 'continuous'])
const reservationSpecialDateModes = new Set<ReservationSpecialDateMode>(['closed', 'custom-hours'])
const reservationTimePattern = /^\d{2}:\d{2}$/
const reservationDatePattern = /^\d{4}-\d{2}-\d{2}$/
const serviceModes: ServiceMode[] = ['dine-in', 'takeout', 'delivery']
const paymentMethodIds: PaymentMethod[] = ['line-pay', 'jkopay', 'cash', 'card', 'app91-card', 'transfer']

const sanitizeOnlineText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim().slice(0, 80) : fallback

const sanitizeColor = (value: unknown, fallback = '#0f766e'): string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback

const runtimeTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/

const normalizeRuntimeTime = (value: unknown, fallback: string): string =>
  typeof value === 'string' && runtimeTimePattern.test(value) ? value : fallback

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback
}

const clampRuntimeInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  const numberValue = normalizeNumber(value, fallback)
  return Math.min(Math.max(numberValue, min), max)
}

const normalizeSupplyWindows = (value: unknown): SupplyPeriodRule[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const seenWindowIds = new Set<string>()
  return value.flatMap((entry): SupplyPeriodRule[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const period = entry as Partial<SupplyPeriodRule>
    const id = sanitizeOnlineText(period.id, `window-${seenWindowIds.size + 1}`)
    const label = sanitizeOnlineText(period.label, id)
    const start = typeof period.start === 'string' && /^\d{2}:\d{2}$/.test(period.start) ? period.start : '00:00'
    const end = typeof period.end === 'string' && /^\d{2}:\d{2}$/.test(period.end) ? period.end : '23:59'
    const days = Array.isArray(period.days)
      ? [...new Set(period.days.map((day) => normalizeNumber(day, -1)).filter((day) => day >= 0 && day <= 6))]
      : [1, 2, 3, 4, 5, 6, 0]
    if (!id || seenWindowIds.has(id) || days.length === 0) {
      return []
    }

    seenWindowIds.add(id)
    return [{ id, label, days, start, end }]
  }).slice(0, 20)
}

const normalizeSessionQrCodeSettings = (
  value: unknown,
  defaults = defaultOnlineOrderingSettings().sessionQrCode,
): OnlineOrderingSettings['sessionQrCode'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults }
  }

  const settings = value as Partial<OnlineOrderingSettings['sessionQrCode']>
  const logoText = typeof settings.logoText === 'string' && settings.logoText.trim()
    ? settings.logoText.trim().slice(0, 40)
    : defaults.logoText

  return {
    autoPrint: settings.autoPrint === true,
    stationId: typeof settings.stationId === 'string' ? settings.stationId.trim().slice(0, 80) : defaults.stationId,
    logoText,
  }
}

const normalizeDineInCheckoutSettings = (
  value: unknown,
  defaults = defaultOnlineOrderingSettings().dineInCheckout,
): OnlineOrderingSettings['dineInCheckout'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults }
  }

  const settings = value as Partial<OnlineOrderingSettings['dineInCheckout']>
  return {
    mode: settings.mode === 'prepaid' ? 'prepaid' : 'postpaid',
  }
}

const normalizeCommentFieldSettings = (
  value: unknown,
  defaults = defaultOnlineOrderingSettings().commentFields,
): OnlineOrderingSettings['commentFields'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults }
  }

  const settings = value as Partial<OnlineOrderingSettings['commentFields']>
  const orderNote =
    settings.orderNote === 'hidden' || settings.orderNote === 'required' || settings.orderNote === 'optional'
      ? settings.orderNote
      : defaults.orderNote

  return {
    itemNotes: settings.itemNotes === 'hidden' ? 'hidden' : 'shown',
    orderNote,
    orderNotePlaceholder:
      typeof settings.orderNotePlaceholder === 'string' && settings.orderNotePlaceholder.trim().length > 0
        ? settings.orderNotePlaceholder.trim().slice(0, 80)
        : defaults.orderNotePlaceholder,
  }
}

const normalizeTableQrCodeSettings = (
  value: unknown,
  defaults = defaultOnlineOrderingSettings().tableQrCode,
): OnlineOrderingSettings['tableQrCode'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults }
  }

  const settings = value as Partial<OnlineOrderingSettings['tableQrCode']>
  const theme =
    settings.theme === 'black' ||
    settings.theme === 'green' ||
    settings.theme === 'orange' ||
    settings.theme === 'yellow' ||
    settings.theme === 'purple'
      ? settings.theme
      : defaults.theme

  return {
    theme,
    logoText:
      typeof settings.logoText === 'string' && settings.logoText.trim().length > 0
        ? settings.logoText.trim().slice(0, 40)
        : defaults.logoText,
    logoDataUrl:
      typeof settings.logoDataUrl === 'string' && settings.logoDataUrl.startsWith('data:image/')
        ? settings.logoDataUrl.slice(0, 120_000)
        : '',
  }
}

const normalizeImageDataUrls = (value: unknown, limit = 4): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('data:image/'))
    .map((entry) => entry.slice(0, 600_000))
    .slice(0, limit)
}

const normalizeOnlineStoreProfileSettings = (
  value: unknown,
  defaults = defaultOnlineOrderingSettings().storeProfile,
): OnlineOrderingSettings['storeProfile'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults, coverImageDataUrls: [...defaults.coverImageDataUrls] }
  }

  const settings = value as Partial<OnlineOrderingSettings['storeProfile']>
  return {
    name:
      typeof settings.name === 'string' && settings.name.trim().length > 0
        ? settings.name.trim().slice(0, 60)
        : defaults.name,
    phone: typeof settings.phone === 'string' ? settings.phone.trim().slice(0, 32) : defaults.phone,
    address: typeof settings.address === 'string' ? settings.address.trim().slice(0, 160) : defaults.address,
    notice: typeof settings.notice === 'string' ? settings.notice.trim().slice(0, 3000) : defaults.notice,
    noticeExpanded: settings.noticeExpanded === true,
    coverImageDataUrls: normalizeImageDataUrls(settings.coverImageDataUrls),
  }
}

const normalizeOnlineNotificationServiceModes = (value: unknown): OnlineServiceModeAvailability => {
  const settings = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<OnlineServiceModeAvailability>)
    : {}

  return serviceModes.reduce<OnlineServiceModeAvailability>((availability, mode) => {
    availability[mode] = settings[mode] !== false
    return availability
  }, {
    'dine-in': true,
    takeout: true,
    delivery: true,
  })
}

const normalizeOnlineNotificationRoutingSettings = (
  value: unknown,
  defaults = defaultOnlineOrderingSettings().notificationRouting,
): OnlineOrderingSettings['notificationRouting'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      stations: defaults.stations.map((station) => ({
        ...station,
        serviceModes: { ...station.serviceModes },
        tableIds: [...station.tableIds],
      })),
    }
  }

  const settings = value as Partial<OnlineOrderingSettings['notificationRouting']>
  const seenStationIds = new Set<string>()
  const stations = Array.isArray(settings.stations)
    ? settings.stations.flatMap((entry): OnlineOrderingSettings['notificationRouting']['stations'] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return []
      }

      const station = entry as Partial<OnlineOrderingSettings['notificationRouting']['stations'][number]>
      const stationId = typeof station.stationId === 'string' ? station.stationId.trim().slice(0, 80) : ''
      if (!stationId || seenStationIds.has(stationId)) {
        return []
      }

      seenStationIds.add(stationId)
      const stationLabel =
        typeof station.stationLabel === 'string' && station.stationLabel.trim().length > 0
          ? station.stationLabel.trim().slice(0, 80)
          : stationId
      const notificationRepeatMode = notificationRepeatModes.has(station.notificationRepeatMode as OnlineNotificationRepeatMode)
        ? (station.notificationRepeatMode as OnlineNotificationRepeatMode)
        : defaultOnlineOrderingSettings().notificationRepeatMode
      const notificationVolume = Number.isFinite(station.notificationVolume)
        ? Math.min(Math.max(Math.trunc(Number(station.notificationVolume)), 0), 100)
        : defaultOnlineOrderingSettings().notificationVolume
      const tableIds = Array.isArray(station.tableIds)
        ? [...new Set(station.tableIds
          .map((tableId) => typeof tableId === 'string' ? tableId.trim().toUpperCase().slice(0, 12) : '')
          .filter(Boolean))]
          .slice(0, 80)
        : []

      return [{
        stationId,
        stationLabel,
        enabled: station.enabled !== false,
        serviceModes: normalizeOnlineNotificationServiceModes(station.serviceModes),
        tableIds,
        soundEnabled: station.soundEnabled !== false,
        notificationRepeatMode,
        notificationVolume,
      }]
    }).slice(0, 32)
    : []

  return { stations }
}

const defaultReservationBusinessHours = (): ReservationBusinessHour[] =>
  [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    id: `reservation-${day}`,
    day,
    enabled: day !== 0,
    start: '09:00',
    end: '20:00',
  }))

const normalizeReservationBusinessHours = (value: unknown): ReservationBusinessHour[] => {
  const source = Array.isArray(value) ? value : defaultReservationBusinessHours()
  const seenDays = new Set<number>()

  return source.flatMap((entry, index): ReservationBusinessHour[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const period = entry as Partial<ReservationBusinessHour>
    const day = normalizeNumber(period.day, index)
    if (day < 0 || day > 6 || seenDays.has(day)) {
      return []
    }

    const start = typeof period.start === 'string' && reservationTimePattern.test(period.start) ? period.start : '09:00'
    const end = typeof period.end === 'string' && reservationTimePattern.test(period.end) ? period.end : '20:00'
    seenDays.add(day)

    return [{
      id: sanitizeOnlineText(period.id, `reservation-${day}`),
      day,
      enabled: period.enabled !== false,
      start,
      end,
    }]
  }).slice(0, 7)
}

const normalizeReservationSpecialDates = (value: unknown): ReservationSpecialDateRule[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const seenRuleIds = new Set<string>()
  return value.flatMap((entry, index): ReservationSpecialDateRule[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const rule = entry as Partial<ReservationSpecialDateRule>
    const startDate = typeof rule.startDate === 'string' && reservationDatePattern.test(rule.startDate)
      ? rule.startDate
      : ''
    if (!startDate) {
      return []
    }

    const rawEndDate = typeof rule.endDate === 'string' && reservationDatePattern.test(rule.endDate)
      ? rule.endDate
      : startDate
    const endDate = rawEndDate < startDate ? startDate : rawEndDate
    const mode = rule.mode && reservationSpecialDateModes.has(rule.mode) ? rule.mode : 'closed'
    const id = sanitizeOnlineText(rule.id, `special-date-${index + 1}`)
    if (!id || seenRuleIds.has(id)) {
      return []
    }

    seenRuleIds.add(id)
    return [{
      id,
      label: sanitizeOnlineText(rule.label, mode === 'closed' ? '不開放訂位' : '特殊訂位日'),
      startDate,
      endDate,
      mode,
      start: typeof rule.start === 'string' && reservationTimePattern.test(rule.start) ? rule.start : '09:00',
      end: typeof rule.end === 'string' && reservationTimePattern.test(rule.end) ? rule.end : '20:00',
    }]
  }).slice(0, 80)
}

const normalizeOnlineMenuCategories = (value: unknown): OnlineMenuCategory[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const seenCategoryIds = new Set<string>()
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const category = entry as Partial<OnlineMenuCategory>
    const id = sanitizeOnlineText(category.id)
    const label = sanitizeOnlineText(category.label)
    if (!id || !label || seenCategoryIds.has(id)) {
      return []
    }

    seenCategoryIds.add(id)
    return [{ id, label }]
  })
}

const normalizeScheduledOrderTimeWindows = (value: unknown): OnlineOrderingSettings['scheduledOrderTimeWindows'] => {
  if (!Array.isArray(value)) {
    return defaultScheduledOrderTimeWindows()
  }

  const seenWindowIds = new Set<string>()
  const windows = value.flatMap((entry, index): OnlineOrderingSettings['scheduledOrderTimeWindows'] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const timeWindow = entry as Partial<OnlineOrderingSettings['scheduledOrderTimeWindows'][number]>
    const id = sanitizeOnlineText(timeWindow.id, `pickup-window-${index + 1}`)
    if (!id || seenWindowIds.has(id)) {
      return []
    }

    const days = Array.isArray(timeWindow.days)
      ? [...new Set(timeWindow.days.map((day) => normalizeNumber(day, -1)).filter((day) => day >= 0 && day <= 6))]
      : [1, 2, 3, 4, 5, 6, 0]
    if (days.length === 0) {
      return []
    }

    seenWindowIds.add(id)
    return [{
      id,
      label: sanitizeOnlineText(timeWindow.label, `取餐時段 ${index + 1}`),
      days,
      start: typeof timeWindow.start === 'string' && reservationTimePattern.test(timeWindow.start) ? timeWindow.start : '00:00',
      end: typeof timeWindow.end === 'string' && reservationTimePattern.test(timeWindow.end) ? timeWindow.end : '23:59',
      allDay: timeWindow.allDay === true,
    }]
  })

  return windows.length > 0 ? windows.slice(0, 20) : defaultScheduledOrderTimeWindows()
}

const normalizeOnlineMenuOptionGroups = (value: unknown): OnlineMenuOptionGroup[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const seenGroupIds = new Set<string>()
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const group = entry as Partial<OnlineMenuOptionGroup>
    const id = sanitizeOnlineText(group.id)
    const label = sanitizeOnlineText(group.label)
    if (!id || !label || seenGroupIds.has(id) || !Array.isArray(group.choices)) {
      return []
    }

    const seenChoiceIds = new Set<string>()
    const choices = group.choices.flatMap((choiceEntry) => {
      if (!choiceEntry || typeof choiceEntry !== 'object') {
        return []
      }

      const choice = choiceEntry as OnlineMenuOptionGroup['choices'][number]
      const choiceId = sanitizeOnlineText(choice.id)
      const choiceLabel = sanitizeOnlineText(choice.label)
      if (!choiceId || !choiceLabel || seenChoiceIds.has(choiceId)) {
        return []
      }

      seenChoiceIds.add(choiceId)
      const normalizedChoice: OnlineMenuOptionGroup['choices'][number] = {
        id: choiceId,
        label: choiceLabel,
      }
      if (Number.isFinite(choice.priceDelta)) {
        normalizedChoice.priceDelta = Math.trunc(choice.priceDelta ?? 0)
      }
      return [normalizedChoice]
    })

    if (choices.length === 0) {
      return []
    }

    const max = Math.max(1, Math.min(12, Math.trunc(Number(group.max) || 1)))
    const required = Boolean(group.required)
    const min = required ? Math.max(1, Math.min(max, Math.trunc(Number(group.min) || 1))) : 0
    seenGroupIds.add(id)

    return [{
      id,
      label,
      requirement: sanitizeOnlineText(group.requirement, required ? `必選 ${min} 個` : `選填最多 ${max} 個`),
      required,
      min,
      max,
      choices,
    }]
  })
}

const choicesFromOnlineMenuOptionGroups = (groups: OnlineMenuOptionGroup[]): OnlineMenuOptionChoice[] => {
  const seenChoiceIds = new Set<string>()
  return groups.flatMap((group) =>
    group.choices.flatMap((choice) => {
      if (seenChoiceIds.has(choice.id)) {
        return []
      }
      seenChoiceIds.add(choice.id)
      return [{ ...choice }]
    }),
  )
}

const normalizeOnlineMenuOptionChoices = (
  value: unknown,
  fallbackChoices: OnlineMenuOptionChoice[] = [],
): OnlineMenuOptionChoice[] => {
  const sourceChoices = Array.isArray(value) ? [...value, ...fallbackChoices] : fallbackChoices
  const seenChoiceIds = new Set<string>()
  return sourceChoices.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const choice = entry as Partial<OnlineMenuOptionChoice>
    const id = sanitizeOnlineText(choice.id)
    const label = sanitizeOnlineText(choice.label)
    if (!id || !label || seenChoiceIds.has(id)) {
      return []
    }

    seenChoiceIds.add(id)
    const normalizedChoice: OnlineMenuOptionChoice = { id, label }
    if (Number.isFinite(choice.priceDelta)) {
      normalizedChoice.priceDelta = Math.trunc(choice.priceDelta ?? 0)
    }
    return [normalizedChoice]
  })
}

const normalizeProductOptionAssignments = (
  value: unknown,
  groups: OnlineMenuOptionGroup[],
): Record<string, string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const validGroupIds = new Set(groups.map((group) => group.id))
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string[]>>(
    (assignments, [productId, groupIds]) => {
      if (!Array.isArray(groupIds)) {
        return assignments
      }

      const normalizedIds = [
        ...new Set(
          groupIds.filter((groupId): groupId is string =>
            typeof groupId === 'string' && validGroupIds.has(groupId),
          ),
        ),
      ]
      if (normalizedIds.length > 0) {
        assignments[productId] = normalizedIds
      }
      return assignments
    },
    {},
  )
}

const comboRequirementLabel = (required: boolean, min: number, max: number, allowRepeat: boolean): string => {
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
      const normalizedProductId = sanitizeOnlineText(productId)
      if (!normalizedProductId || !Array.isArray(rawGroups)) {
        return assignments
      }

      const seenGroupIds = new Set<string>()
      const groups = rawGroups.flatMap((entry, groupIndex): ComboProductGroup[] => {
        if (!entry || typeof entry !== 'object') {
          return []
        }

        const group = entry as Partial<ComboProductGroup>
        const id = sanitizeOnlineText(group.id, `combo-${groupIndex + 1}`)
        const label = sanitizeOnlineText(group.label, `套餐子項目 ${groupIndex + 1}`)
        if (!id || !label || seenGroupIds.has(id) || !Array.isArray(group.choices)) {
          return []
        }

        const seenChoiceIds = new Set<string>()
        const choices = group.choices.flatMap((choiceEntry) => {
          if (!choiceEntry || typeof choiceEntry !== 'object') {
            return []
          }

          const choice = choiceEntry as { productId?: unknown; priceDelta?: unknown }
          const choiceProductId = sanitizeOnlineText(choice.productId)
          if (!choiceProductId || choiceProductId === normalizedProductId || seenChoiceIds.has(choiceProductId)) {
            return []
          }

          seenChoiceIds.add(choiceProductId)
          return [{
            productId: choiceProductId,
            priceDelta: Number.isFinite(choice.priceDelta) ? Math.trunc(Number(choice.priceDelta)) : 0,
          }]
        }).slice(0, 40)

        if (choices.length === 0) {
          return []
        }

        const max = Math.max(1, Math.min(12, Math.trunc(Number(group.max) || 1)))
        const required = group.required !== false
        const min = required ? Math.max(1, Math.min(max, Math.trunc(Number(group.min) || 1))) : 0
        const allowRepeat = group.allowRepeat === true
        seenGroupIds.add(id)

        return [{
          id,
          label,
          requirement: sanitizeOnlineText(group.requirement, comboRequirementLabel(required, min, max, allowRepeat)),
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

const normalizeOnlineOrderingSettings = (value: unknown): OnlineOrderingSettings => {
  const defaults = defaultOnlineOrderingSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }

  const settings = value as Partial<OnlineOrderingSettings>
  const menuCategories = normalizeOnlineMenuCategories(settings.menuCategories)
  const menuOptionGroups = normalizeOnlineMenuOptionGroups(settings.menuOptionGroups)
  const availableOptionChoices = normalizeOnlineMenuOptionChoices(
    settings.availableOptionChoices,
    choicesFromOnlineMenuOptionGroups(menuOptionGroups),
  )
  const notificationRepeatMode = notificationRepeatModes.has(settings.notificationRepeatMode as OnlineNotificationRepeatMode)
    ? (settings.notificationRepeatMode as OnlineNotificationRepeatMode)
    : defaults.notificationRepeatMode
  const seenPaymentMethods = new Set<PaymentMethod>()
  const paymentMethods = Array.isArray(settings.paymentMethods)
    ? settings.paymentMethods.flatMap((entry): OnlineOrderingSettings['paymentMethods'] => {
      if (!entry || typeof entry !== 'object') {
        return []
      }

      const method = entry as Partial<OnlineOrderingSettings['paymentMethods'][number]>
      if (!method.id || !paymentMethodIds.includes(method.id) || seenPaymentMethods.has(method.id)) {
        return []
      }

      seenPaymentMethods.add(method.id)
      const defaultMethod = defaults.paymentMethods.find((entry) => entry.id === method.id)
      return [{
        id: method.id,
        label: typeof method.label === 'string' && method.label.trim()
          ? method.label.trim().slice(0, 24)
          : (defaultMethod?.label ?? method.id),
        enabled: method.enabled !== false,
        opensCashDrawer:
          typeof method.opensCashDrawer === 'boolean'
            ? method.opensCashDrawer
            : (defaultMethod?.opensCashDrawer ?? method.id === 'cash'),
      }]
    })
    : defaults.paymentMethods.map((method) => ({ ...method }))

  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : defaults.enabled,
    serviceModeAvailability:
      settings.serviceModeAvailability && typeof settings.serviceModeAvailability === 'object'
        ? serviceModes.reduce<OnlineOrderingSettings['serviceModeAvailability']>((availability, mode) => {
          availability[mode] = (settings.serviceModeAvailability as Partial<Record<ServiceMode, boolean>>)[mode] !== false
          return availability
        }, { ...defaults.serviceModeAvailability })
        : { ...defaults.serviceModeAvailability },
    allowScheduledOrders:
      typeof settings.allowScheduledOrders === 'boolean' ? settings.allowScheduledOrders : defaults.allowScheduledOrders,
    scheduledOrderIntervalMinutes: clampRuntimeInteger(
      settings.scheduledOrderIntervalMinutes,
      defaults.scheduledOrderIntervalMinutes,
      5,
      120,
    ),
    scheduledOrderMaxDays: clampRuntimeInteger(settings.scheduledOrderMaxDays, defaults.scheduledOrderMaxDays, 1, 60),
    scheduledOrderTimeWindows: normalizeScheduledOrderTimeWindows(settings.scheduledOrderTimeWindows),
    averagePrepMinutes: Number.isFinite(settings.averagePrepMinutes)
      ? Math.min(Math.max(Math.trunc(settings.averagePrepMinutes ?? defaults.averagePrepMinutes), 0), 180)
      : defaults.averagePrepMinutes,
    unconfirmedReminderMinutes: Number.isFinite(settings.unconfirmedReminderMinutes)
      ? Math.min(Math.max(Math.trunc(settings.unconfirmedReminderMinutes ?? defaults.unconfirmedReminderMinutes), 0), 120)
      : defaults.unconfirmedReminderMinutes,
    acceptanceRequired:
      typeof settings.acceptanceRequired === 'boolean' ? settings.acceptanceRequired : defaults.acceptanceRequired,
    acceptWithoutPrinting:
      typeof settings.acceptWithoutPrinting === 'boolean'
        ? settings.acceptWithoutPrinting
        : defaults.acceptWithoutPrinting,
    soundEnabled: typeof settings.soundEnabled === 'boolean' ? settings.soundEnabled : defaults.soundEnabled,
    notificationRepeatMode,
    notificationVolume: Number.isFinite(settings.notificationVolume)
      ? Math.min(Math.max(Math.trunc(settings.notificationVolume ?? defaults.notificationVolume), 0), 100)
      : defaults.notificationVolume,
    checkoutInstructions:
      typeof settings.checkoutInstructions === 'string'
        ? settings.checkoutInstructions.trim().slice(0, 500)
        : defaults.checkoutInstructions,
    showTaxIdField:
      typeof settings.showTaxIdField === 'boolean' ? settings.showTaxIdField : defaults.showTaxIdField,
    showCarrierBarcodeField:
      typeof settings.showCarrierBarcodeField === 'boolean'
        ? settings.showCarrierBarcodeField
        : defaults.showCarrierBarcodeField,
    showDonationCodeField:
      typeof settings.showDonationCodeField === 'boolean'
        ? settings.showDonationCodeField
        : defaults.showDonationCodeField,
    paymentMethods: paymentMethods.length > 0 ? paymentMethods : defaults.paymentMethods.map((method) => ({ ...method })),
    deliveryFeeAmount: clampRuntimeInteger(settings.deliveryFeeAmount, defaults.deliveryFeeAmount, 0, 999_999),
    deliveryMinimumSubtotal: clampRuntimeInteger(settings.deliveryMinimumSubtotal, defaults.deliveryMinimumSubtotal, 0, 999_999),
    freeDeliveryThreshold: clampRuntimeInteger(settings.freeDeliveryThreshold, defaults.freeDeliveryThreshold, 0, 999_999),
    deliveryTravelMinutes: clampRuntimeInteger(settings.deliveryTravelMinutes, defaults.deliveryTravelMinutes, 0, 180),
    sessionQrCode: normalizeSessionQrCodeSettings(settings.sessionQrCode, defaults.sessionQrCode),
    dineInTimeLimit: normalizeDineInTimeLimitSettings(settings.dineInTimeLimit, defaults.dineInTimeLimit),
    dineInCheckout: normalizeDineInCheckoutSettings(settings.dineInCheckout, defaults.dineInCheckout),
    commentFields: normalizeCommentFieldSettings(settings.commentFields, defaults.commentFields),
    tableQrCode: normalizeTableQrCodeSettings(settings.tableQrCode, defaults.tableQrCode),
    storeProfile: normalizeOnlineStoreProfileSettings(settings.storeProfile, defaults.storeProfile),
    notificationRouting: normalizeOnlineNotificationRoutingSettings(
      settings.notificationRouting,
      defaults.notificationRouting,
    ),
    pauseMessage:
      typeof settings.pauseMessage === 'string' && settings.pauseMessage.trim().length > 0
        ? settings.pauseMessage.trim().slice(0, 120)
        : defaults.pauseMessage,
    menuCategories,
    availableOptionChoices,
    menuOptionGroups,
    productOptionAssignments: normalizeProductOptionAssignments(settings.productOptionAssignments, menuOptionGroups),
    comboProductAssignments: normalizeComboProductAssignments(settings.comboProductAssignments),
    noteSupplyStatuses:
      settings.noteSupplyStatuses && typeof settings.noteSupplyStatuses === 'object' && !Array.isArray(settings.noteSupplyStatuses)
        ? Object.entries(settings.noteSupplyStatuses).reduce<Record<string, 'normal' | 'online-stopped' | 'stopped'>>(
          (statuses, [noteId, status]) => {
            if (status === 'normal' || status === 'online-stopped' || status === 'stopped') {
              statuses[noteId] = status
            }
            return statuses
          },
          {},
        )
        : defaults.noteSupplyStatuses,
  }
}

export const defaultPosAppearanceSettings = (): PosAppearanceSettings => ({
  interfaceScale: 0,
  densityScale: 0,
  textSize: 0,
  darkMode: false,
  toolboxOpacity: 100,
})

const clampPosAppearanceOffset = (value: unknown, fallback: number): number => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  return Math.min(200, Math.max(-200, Math.round(numberValue)))
}

const clampToolboxOpacity = (value: unknown, fallback: number): number => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  return Math.min(100, Math.max(35, Math.round(numberValue)))
}

export const normalizePosAppearanceSettings = (value: unknown): PosAppearanceSettings => {
  const defaults = defaultPosAppearanceSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }

  const settings = value as Partial<PosAppearanceSettings>
  return {
    interfaceScale: clampPosAppearanceOffset(settings.interfaceScale, defaults.interfaceScale),
    densityScale: clampPosAppearanceOffset(settings.densityScale, defaults.densityScale),
    textSize: clampPosAppearanceOffset(settings.textSize, defaults.textSize),
    darkMode: settings.darkMode === true,
    toolboxOpacity: clampToolboxOpacity(settings.toolboxOpacity, defaults.toolboxOpacity),
  }
}

export const defaultFloorPlanSettings = (): FloorPlanSettings => ({
  floors: [
    { id: '1F', label: '1F' },
  ],
  activeFloorId: '1F',
  tables: [
    { id: 'A2', floorId: '1F', label: 'A2', capacity: 2, x: 34, y: 28, width: 13 },
    { id: 'A3', floorId: '1F', label: 'A3', capacity: 2, x: 58, y: 28, width: 13 },
    { id: 'A1', floorId: '1F', label: 'A1', capacity: 4, x: 36, y: 58, width: 20 },
  ],
  display: {
    showPeople: true,
    showUnsubmittedWait: true,
    showTableStay: true,
    showWaitlinePeople: true,
    showWaitlineTime: true,
    showOrderLabels: false,
  },
  partySizes: {},
  waitline: [],
})

const normalizeFloorLevelId = (value: unknown, fallback = '1F'): string => {
  const normalized = typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16)
    : ''
  return normalized || fallback
}

const normalizeFloorLevelSettings = (value: unknown): FloorLevelSetting[] => {
  const defaults = defaultFloorPlanSettings().floors
  if (!Array.isArray(value)) {
    return defaults
  }

  const seenFloorIds = new Set<string>()
  const floors = value.flatMap((entry): FloorLevelSetting[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const floor = entry as Partial<FloorLevelSetting>
    const label = typeof floor.label === 'string' && floor.label.trim()
      ? floor.label.trim().slice(0, 16)
      : typeof floor.id === 'string'
        ? floor.id.trim().slice(0, 16)
        : ''
    const id = normalizeFloorLevelId(floor.id ?? label, label ? label.toUpperCase() : '1F')
    if (!id || seenFloorIds.has(id)) {
      return []
    }

    seenFloorIds.add(id)
    return [{ id, label: label || id }]
  }).slice(0, 12)

  return floors.length > 0 ? floors : defaults
}

const normalizeActiveFloorId = (value: unknown, floors: FloorLevelSetting[]): string => {
  const fallback = floors[0]?.id ?? '1F'
  const candidate = normalizeFloorLevelId(value, fallback)
  return floors.some((floor) => floor.id === candidate) ? candidate : fallback
}

const normalizeFloorTableSettings = (
  value: unknown,
  floors: FloorLevelSetting[],
  fallbackFloorId: string,
): FloorTableSetting[] => {
  const defaults = defaultFloorPlanSettings().tables
  if (!Array.isArray(value)) {
    return defaults
  }

  const seenTableIds = new Set<string>()
  const floorIds = new Set(floors.map((floor) => floor.id))
  const tables = value.flatMap((entry): FloorTableSetting[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const table = entry as Partial<FloorTableSetting>
    const id = typeof table.id === 'string' ? table.id.trim().toUpperCase().slice(0, 12) : ''
    const label = typeof table.label === 'string' ? table.label.trim().toUpperCase().slice(0, 12) : id
    const floorId = normalizeFloorLevelId(table.floorId, fallbackFloorId)
    const capacity = Number(table.capacity)
    const x = Number(table.x)
    const y = Number(table.y)
    const width = Number(table.width)
    if (!id || seenTableIds.has(id) || !Number.isFinite(capacity)) {
      return []
    }

    seenTableIds.add(id)
    return [{
      id,
      floorId: floorIds.has(floorId) ? floorId : fallbackFloorId,
      label: label || id,
      capacity: Math.min(20, Math.max(1, Math.trunc(capacity))),
      x: Number.isFinite(x) ? Math.min(92, Math.max(4, x)) : 40,
      y: Number.isFinite(y) ? Math.min(92, Math.max(4, y)) : 40,
      width: Number.isFinite(width) ? Math.min(36, Math.max(10, width)) : 16,
    }]
  }).slice(0, 40)

  return tables.length > 0 ? tables : defaults
}

const normalizeFloorDisplayPreferences = (value: unknown): FloorDisplayPreferences => {
  const defaults = defaultFloorPlanSettings().display
  const source = value && typeof value === 'object' ? value as Partial<FloorDisplayPreferences> : {}
  return {
    showPeople: source.showPeople !== false,
    showUnsubmittedWait: source.showUnsubmittedWait !== false,
    showTableStay: source.showTableStay !== false,
    showWaitlinePeople: source.showWaitlinePeople !== false,
    showWaitlineTime: source.showWaitlineTime !== false,
    showOrderLabels: source.showOrderLabels === true || defaults.showOrderLabels,
  }
}

const normalizeFloorPartySizes = (
  value: unknown,
  tables: FloorTableSetting[],
): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const tableCapacities = new Map(tables.map((table) => [table.id, table.capacity]))
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((sizes, [tableId, rawSize]) => {
    const id = tableId.trim().toUpperCase()
    const capacity = tableCapacities.get(id)
    const size = Number(rawSize)
    if (!capacity || !Number.isFinite(size)) {
      return sizes
    }

    sizes[id] = Math.min(capacity, Math.max(0, Math.trunc(size)))
    return sizes
  }, {})
}

const normalizeWaitlineEntries = (value: unknown): WaitlineEntry[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry): WaitlineEntry[] => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const source = entry as Partial<WaitlineEntry>
    const createdAt = typeof source.createdAt === 'string' ? source.createdAt : ''
    const timestamp = new Date(createdAt).getTime()
    if (!Number.isFinite(timestamp)) {
      return []
    }

    const orderId = typeof source.orderId === 'string' ? source.orderId.trim().slice(0, 80) : ''

    return [{
      id: typeof source.id === 'string' && source.id ? source.id.slice(0, 80) : `wait-${timestamp}`,
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 40) : '候位客',
      phone: typeof source.phone === 'string' ? source.phone.trim().slice(0, 32) : '',
      customerType: typeof source.customerType === 'string' && source.customerType.trim()
        ? source.customerType.trim().slice(0, 24)
        : 'walk-in',
      partySize: Math.min(20, Math.max(1, Math.trunc(Number(source.partySize) || 1))),
      createdAt,
      note: typeof source.note === 'string' ? source.note.trim().slice(0, 120) : '',
      ...(orderId ? { orderId } : {}),
    }]
  }).slice(0, 60)
}

export const normalizeFloorPlanSettings = (value: unknown): FloorPlanSettings => {
  const defaults = defaultFloorPlanSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }

  const settings = value as Partial<FloorPlanSettings>
  const floors = normalizeFloorLevelSettings(settings.floors)
  const activeFloorId = normalizeActiveFloorId(settings.activeFloorId, floors)
  const tables = normalizeFloorTableSettings(settings.tables, floors, activeFloorId)
  return {
    floors,
    activeFloorId,
    tables,
    display: normalizeFloorDisplayPreferences(settings.display),
    partySizes: normalizeFloorPartySizes(settings.partySizes, tables),
    waitline: normalizeWaitlineEntries(settings.waitline),
  }
}

export const defaultEngagementSettings = (): CustomerEngagementSettings => ({
  orderLabels: [
    { id: 'rush', label: '急單', color: '#b45309' },
    { id: 'allergy', label: '過敏', color: '#b91c1c' },
    { id: 'vip', label: 'VIP', color: '#0f766e' },
  ],
  customerTypes: ['一般顧客', '常客', 'VIP', '員工'],
  defaultServiceFeeRate: 0,
  serviceCharge: {
    enabled: false,
    label: '服務費',
    dineInRate: 0,
    takeoutRate: 0,
    deliveryRate: 0,
    discountBasis: 'before-discount',
    excludedCategories: [],
    excludedItemIds: [],
  },
  productTotalDisplay: {
    enabled: true,
    excludedCategories: [],
    excludedItemIds: [],
  },
  loyaltyPoints: {
    enabled: true,
    earningEnabled: true,
    redeemEnabled: true,
    spendAmountPerPoint: 100,
    minimumRedeemPoints: 1,
    maximumRedeemPointsPerOrder: 0,
  },
  checkoutCounters: {
    enabled: false,
    defaultBookId: 'main',
    books: [
      {
        id: 'main',
        name: '主帳本',
        stationIds: [],
        printStationId: '',
        cashDrawerDeviceId: 'cash-drawer',
        paymentDeviceIds: [],
        enabled: true,
      },
    ],
  },
  appOperation: {
    hostStationId: '',
    childStationIds: [],
    maxChildStations: 5,
  },
  electronicInvoice: {
    enabled: false,
    defaultIssueOnCheckout: true,
    allowManualIssueToggle: true,
    defaultPrintPaper: true,
    uploadDeadlineHours: 48,
  },
  workflowAlerts: {
    todayOrderStartTime: '00:00',
    todayOrderEndTime: '23:59',
    fulfillmentDueSoonMinutes: 15,
    defaultTakeoutPickupMinutes: 5,
    fulfillmentConfirmationEnabled: false,
    scheduledPickupReminderEnabled: false,
    waitlineWaitWarningEnabled: false,
    waitlineWaitWarningMinutes: 30,
    dineInUnprintedWarningEnabled: false,
    dineInUnprintedWarningMinutes: 15,
    dineInFulfillmentWarningEnabled: false,
    dineInFulfillmentWarningMinutes: 15,
    dineInDwellWarningEnabled: false,
    dineInDwellWarningMinutes: 120,
    takeoutUnprintedWarningEnabled: false,
    takeoutUnprintedWarningMinutes: 15,
    takeoutFulfillmentWarningEnabled: false,
    takeoutFulfillmentWarningMinutes: 15,
    takeoutWaitWarningEnabled: false,
    takeoutWaitWarningMinutes: 15,
    takeoutLoopEnabled: false,
    dineInAutoExitEnabled: false,
    takeoutAutoExitEnabled: true,
  },
  orderPageDisplay: {
    noteColumns: 3,
  },
  recommendations: [
    { id: 'retail-add-on', trigger: 'coffee', title: '咖啡加購', productIds: [], enabled: true },
    { id: 'food-pairing', trigger: 'morning', title: '早餐搭配', productIds: [], enabled: true },
  ],
  translations: [
    { locale: 'en', label: 'English', enabled: true },
    { locale: 'ja', label: '日本語', enabled: false },
  ],
  hardwareDevices: [
    { id: 'scanner', kind: 'bluetooth-scanner', name: '藍牙掃碼器', enabled: false, targetStationId: '' },
    { id: 'payment-qr', kind: 'payment-qr', name: '行動支付掃碼', enabled: false, targetStationId: '' },
    { id: 'cash-drawer', kind: 'cash-drawer', name: '錢櫃', enabled: false, targetStationId: '' },
    { id: 'ipad-qr-print', kind: 'ipad-qr-print', name: '指定 iPad 列印 QR code', enabled: false, targetStationId: '' },
  ],
  supplyRules: {
    preOpenCheckEnabled: true,
    allowFutureOrdersAcrossDay: true,
    defaultPeriods: [
      { id: 'all-day', label: '全天', days: [1, 2, 3, 4, 5, 6, 0], start: '08:00', end: '22:00' },
    ],
  },
  reservationWebsite: {
    enabled: false,
    restaurantName: 'Script Coffee',
    phone: '',
    address: '',
    announcement: '線上訂位送出後，門市會保留此筆訂位資訊。',
    minPartySize: 1,
    maxPartySize: 8,
    slotMinutes: 30,
    durationMinutes: 120,
    seatHoldMinutes: 15,
    leadMinutes: 30,
    bookingWindowDays: 14,
    allowTableCombinations: true,
    onlineTableIds: [],
    businessHours: defaultReservationBusinessHours(),
    specialDates: [],
  },
})

export const normalizeEngagementSettings = (value: unknown): CustomerEngagementSettings => {
  const defaults = defaultEngagementSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }

  const settings = value as Partial<CustomerEngagementSettings>
  const orderLabels = Array.isArray(settings.orderLabels)
    ? settings.orderLabels.flatMap((entry, index) => {
      const label = entry && typeof entry === 'object' ? entry as CustomerEngagementSettings['orderLabels'][number] : null
      const id = sanitizeOnlineText(label?.id, `label-${index + 1}`)
      const text = sanitizeOnlineText(label?.label, '')
      return id && text ? [{ id, label: text, color: sanitizeColor(label?.color) }] : []
    }).slice(0, 16)
    : defaults.orderLabels
  const customerTypes = Array.isArray(settings.customerTypes)
    ? [...new Set(settings.customerTypes.map((type) => sanitizeOnlineText(type)).filter(Boolean))].slice(0, 16)
    : defaults.customerTypes
  const legacyServiceRate = Math.min(Math.max(normalizeNumber(settings.defaultServiceFeeRate, 0), 0), 30)
  const rawServiceCharge = settings.serviceCharge && typeof settings.serviceCharge === 'object'
    ? settings.serviceCharge
    : defaults.serviceCharge
  const serviceCharge = rawServiceCharge as Partial<CustomerEngagementSettings['serviceCharge']>
  const rawProductTotalDisplay = settings.productTotalDisplay && typeof settings.productTotalDisplay === 'object'
    ? settings.productTotalDisplay
    : defaults.productTotalDisplay
  const productTotalDisplay = rawProductTotalDisplay as Partial<CustomerEngagementSettings['productTotalDisplay']>
  const rawLoyaltyPoints = settings.loyaltyPoints && typeof settings.loyaltyPoints === 'object'
    ? settings.loyaltyPoints
    : defaults.loyaltyPoints
  const loyaltyPoints = rawLoyaltyPoints as Partial<CustomerEngagementSettings['loyaltyPoints']>
  const rawCheckoutCounters = settings.checkoutCounters && typeof settings.checkoutCounters === 'object'
    ? settings.checkoutCounters
    : defaults.checkoutCounters
  const checkoutCounters = rawCheckoutCounters as Partial<CustomerEngagementSettings['checkoutCounters']>
  const rawAppOperation = settings.appOperation && typeof settings.appOperation === 'object'
    ? settings.appOperation
    : defaults.appOperation
  const appOperation = rawAppOperation as Partial<CustomerEngagementSettings['appOperation']>
  const appOperationHostStationId = sanitizeOnlineText(appOperation.hostStationId, '').slice(0, 80)
  const appOperationMaxChildStations = clampRuntimeInteger(
    appOperation.maxChildStations,
    defaults.appOperation.maxChildStations,
    0,
    20,
  )
  const appOperationChildStationIds = Array.isArray(appOperation.childStationIds)
    ? [...new Set(appOperation.childStationIds
      .map((stationId) => sanitizeOnlineText(stationId, '').slice(0, 80))
      .filter((stationId) => stationId && stationId !== appOperationHostStationId))]
      .slice(0, appOperationMaxChildStations)
    : defaults.appOperation.childStationIds
  const rawElectronicInvoice = settings.electronicInvoice && typeof settings.electronicInvoice === 'object'
    ? settings.electronicInvoice
    : defaults.electronicInvoice
  const electronicInvoice = rawElectronicInvoice as Partial<CustomerEngagementSettings['electronicInvoice']>
  const rawWorkflowAlerts = settings.workflowAlerts && typeof settings.workflowAlerts === 'object'
    ? settings.workflowAlerts
    : defaults.workflowAlerts
  const workflowAlerts = rawWorkflowAlerts as Partial<CustomerEngagementSettings['workflowAlerts']>
  const rawOrderPageDisplay = settings.orderPageDisplay && typeof settings.orderPageDisplay === 'object'
    ? settings.orderPageDisplay
    : defaults.orderPageDisplay
  const orderPageDisplay = rawOrderPageDisplay as Partial<CustomerEngagementSettings['orderPageDisplay']>
  const checkoutCounterBooks = Array.isArray(checkoutCounters.books)
    ? checkoutCounters.books.flatMap((entry, index): CustomerEngagementSettings['checkoutCounters']['books'] => {
      const book = entry && typeof entry === 'object' ? entry as Partial<CustomerEngagementSettings['checkoutCounters']['books'][number]> : null
      const id = sanitizeOnlineText(book?.id, `book-${index + 1}`).slice(0, 80)
      const name = sanitizeOnlineText(book?.name, id || '帳本').slice(0, 80)
      const stationIds = Array.isArray(book?.stationIds)
        ? [...new Set(book.stationIds.map((stationId) => sanitizeOnlineText(stationId, '').slice(0, 80)).filter(Boolean))].slice(0, 20)
        : []
      const paymentDeviceIds = Array.isArray(book?.paymentDeviceIds)
        ? [...new Set(book.paymentDeviceIds.map((deviceId) => sanitizeOnlineText(deviceId, '').slice(0, 80)).filter(Boolean))].slice(0, 20)
        : []
      return id && name
        ? [{
            id,
            name,
            stationIds,
            printStationId: sanitizeOnlineText(book?.printStationId, '').slice(0, 80),
            cashDrawerDeviceId: sanitizeOnlineText(book?.cashDrawerDeviceId, '').slice(0, 80),
            paymentDeviceIds,
            enabled: book?.enabled !== false,
          }]
        : []
    }).slice(0, 20)
    : defaults.checkoutCounters.books.map((book) => ({ ...book, stationIds: [...book.stationIds], paymentDeviceIds: [...book.paymentDeviceIds] }))
  const recommendations = Array.isArray(settings.recommendations)
    ? settings.recommendations.flatMap((entry, index) => {
      const rule = entry && typeof entry === 'object' ? entry as CustomerEngagementSettings['recommendations'][number] : null
      const id = sanitizeOnlineText(rule?.id, `recommend-${index + 1}`)
      const trigger = sanitizeOnlineText(rule?.trigger, 'any')
      const title = sanitizeOnlineText(rule?.title, '推薦')
      const productIds = Array.isArray(rule?.productIds)
        ? rule.productIds.filter((productId): productId is string => typeof productId === 'string').slice(0, 20)
        : []
      return id && title ? [{ id, trigger, title, productIds, enabled: rule?.enabled !== false }] : []
    }).slice(0, 20)
    : defaults.recommendations
  const translations = Array.isArray(settings.translations)
    ? settings.translations.flatMap((entry, index) => {
      const translation = entry && typeof entry === 'object' ? entry as CustomerEngagementSettings['translations'][number] : null
      const locale = sanitizeOnlineText(translation?.locale, `lang-${index + 1}`)
      const label = sanitizeOnlineText(translation?.label, locale)
      return locale && label ? [{ locale, label, enabled: translation?.enabled === true }] : []
    }).slice(0, 12)
    : defaults.translations
  const hardwareKinds = new Set<CustomerEngagementSettings['hardwareDevices'][number]['kind']>([
    'bluetooth-scanner',
    'payment-qr',
    'cash-drawer',
    'ipad-qr-print',
  ])
  const hardwareDevices = Array.isArray(settings.hardwareDevices)
    ? settings.hardwareDevices.flatMap((entry, index) => {
      const device = entry && typeof entry === 'object' ? entry as CustomerEngagementSettings['hardwareDevices'][number] : null
      const fallbackKind = defaults.hardwareDevices[0]?.kind ?? 'bluetooth-scanner'
      const rawKind = device?.kind
      const kind = rawKind && hardwareKinds.has(rawKind) ? rawKind : fallbackKind
      const id = sanitizeOnlineText(device?.id, `device-${index + 1}`)
      const name = sanitizeOnlineText(device?.name, '外設')
      const targetStationId = sanitizeOnlineText(device?.targetStationId, '')
      return id && name ? [{ id, kind, name, targetStationId, enabled: device?.enabled === true }] : []
    }).slice(0, 20)
    : defaults.hardwareDevices
  const rawSupplyRules = settings.supplyRules && typeof settings.supplyRules === 'object'
    ? settings.supplyRules
    : defaults.supplyRules
  const rawSupplyPeriods = (rawSupplyRules as { defaultPeriods?: unknown; defaultWindows?: unknown }).defaultPeriods ??
    (rawSupplyRules as { defaultWindows?: unknown }).defaultWindows
  const rawReservationWebsite = settings.reservationWebsite && typeof settings.reservationWebsite === 'object'
    ? settings.reservationWebsite
    : defaults.reservationWebsite
  const reservationWebsite = rawReservationWebsite as Partial<CustomerEngagementSettings['reservationWebsite']>
  const reservationMinPartySize = Math.min(
    Math.max(normalizeNumber(reservationWebsite.minPartySize, defaults.reservationWebsite.minPartySize), 1),
    50,
  )
  const reservationMaxPartySize = Math.max(
    reservationMinPartySize,
    Math.min(Math.max(normalizeNumber(reservationWebsite.maxPartySize, defaults.reservationWebsite.maxPartySize), 1), 50),
  )

  return {
    orderLabels: orderLabels.length > 0 ? orderLabels : defaults.orderLabels,
    customerTypes: customerTypes.length > 0 ? customerTypes : defaults.customerTypes,
    defaultServiceFeeRate: legacyServiceRate,
    serviceCharge: {
      enabled: serviceCharge.enabled === true || legacyServiceRate > 0,
      label: sanitizeOnlineText(serviceCharge.label, defaults.serviceCharge.label).slice(0, 40) || defaults.serviceCharge.label,
      dineInRate: Math.min(Math.max(normalizeNumber(serviceCharge.dineInRate, legacyServiceRate), 0), 30),
      takeoutRate: Math.min(Math.max(normalizeNumber(serviceCharge.takeoutRate, 0), 0), 30),
      deliveryRate: Math.min(Math.max(normalizeNumber(serviceCharge.deliveryRate, 0), 0), 30),
      discountBasis: serviceCharge.discountBasis === 'after-discount' ? 'after-discount' : 'before-discount',
      excludedCategories: Array.isArray(serviceCharge.excludedCategories)
        ? [...new Set(serviceCharge.excludedCategories.filter((category): category is MenuCategory => typeof category === 'string'))]
          .slice(0, 40)
        : defaults.serviceCharge.excludedCategories,
      excludedItemIds: Array.isArray(serviceCharge.excludedItemIds)
        ? [...new Set(serviceCharge.excludedItemIds.filter((itemId): itemId is string => typeof itemId === 'string'))]
          .slice(0, 200)
        : defaults.serviceCharge.excludedItemIds,
    },
    productTotalDisplay: {
      enabled: productTotalDisplay.enabled !== false,
      excludedCategories: Array.isArray(productTotalDisplay.excludedCategories)
        ? [...new Set(productTotalDisplay.excludedCategories.filter((category): category is MenuCategory => typeof category === 'string'))]
          .slice(0, 40)
        : defaults.productTotalDisplay.excludedCategories,
      excludedItemIds: Array.isArray(productTotalDisplay.excludedItemIds)
        ? [...new Set(productTotalDisplay.excludedItemIds.filter((itemId): itemId is string => typeof itemId === 'string'))]
          .slice(0, 200)
        : defaults.productTotalDisplay.excludedItemIds,
    },
    loyaltyPoints: {
      enabled: loyaltyPoints.enabled !== false,
      earningEnabled: loyaltyPoints.earningEnabled !== false,
      redeemEnabled: loyaltyPoints.redeemEnabled !== false,
      spendAmountPerPoint: Math.min(Math.max(normalizeNumber(loyaltyPoints.spendAmountPerPoint, defaults.loyaltyPoints.spendAmountPerPoint), 1), 9999),
      minimumRedeemPoints: Math.min(Math.max(normalizeNumber(loyaltyPoints.minimumRedeemPoints, defaults.loyaltyPoints.minimumRedeemPoints), 0), 999_999),
      maximumRedeemPointsPerOrder: Math.min(Math.max(normalizeNumber(loyaltyPoints.maximumRedeemPointsPerOrder, defaults.loyaltyPoints.maximumRedeemPointsPerOrder), 0), 999_999),
    },
    checkoutCounters: {
      enabled: checkoutCounters.enabled === true,
      defaultBookId: sanitizeOnlineText(checkoutCounters.defaultBookId, defaults.checkoutCounters.defaultBookId).slice(0, 80) || defaults.checkoutCounters.defaultBookId,
      books: checkoutCounterBooks.length > 0 ? checkoutCounterBooks : defaults.checkoutCounters.books.map((book) => ({ ...book, stationIds: [...book.stationIds], paymentDeviceIds: [...book.paymentDeviceIds] })),
    },
    appOperation: {
      hostStationId: appOperationHostStationId,
      childStationIds: appOperationChildStationIds,
      maxChildStations: appOperationMaxChildStations,
    },
    electronicInvoice: {
      enabled: electronicInvoice.enabled === true,
      defaultIssueOnCheckout: electronicInvoice.defaultIssueOnCheckout !== false,
      allowManualIssueToggle: electronicInvoice.allowManualIssueToggle !== false,
      defaultPrintPaper: electronicInvoice.defaultPrintPaper !== false,
      uploadDeadlineHours: Math.min(Math.max(normalizeNumber(electronicInvoice.uploadDeadlineHours, defaults.electronicInvoice.uploadDeadlineHours), 1), 168),
    },
    workflowAlerts: {
      todayOrderStartTime: normalizeRuntimeTime(workflowAlerts.todayOrderStartTime, defaults.workflowAlerts.todayOrderStartTime),
      todayOrderEndTime: normalizeRuntimeTime(workflowAlerts.todayOrderEndTime, defaults.workflowAlerts.todayOrderEndTime),
      fulfillmentDueSoonMinutes: clampRuntimeInteger(
        workflowAlerts.fulfillmentDueSoonMinutes,
        defaults.workflowAlerts.fulfillmentDueSoonMinutes,
        0,
        1440,
      ),
      defaultTakeoutPickupMinutes: clampRuntimeInteger(
        workflowAlerts.defaultTakeoutPickupMinutes,
        defaults.workflowAlerts.defaultTakeoutPickupMinutes,
        0,
        86400,
      ),
      fulfillmentConfirmationEnabled: workflowAlerts.fulfillmentConfirmationEnabled === true,
      scheduledPickupReminderEnabled: workflowAlerts.scheduledPickupReminderEnabled === true,
      waitlineWaitWarningEnabled: workflowAlerts.waitlineWaitWarningEnabled === true,
      waitlineWaitWarningMinutes: clampRuntimeInteger(
        workflowAlerts.waitlineWaitWarningMinutes,
        defaults.workflowAlerts.waitlineWaitWarningMinutes,
        0,
        1440,
      ),
      dineInUnprintedWarningEnabled: workflowAlerts.dineInUnprintedWarningEnabled === true,
      dineInUnprintedWarningMinutes: clampRuntimeInteger(
        workflowAlerts.dineInUnprintedWarningMinutes,
        defaults.workflowAlerts.dineInUnprintedWarningMinutes,
        0,
        1440,
      ),
      dineInFulfillmentWarningEnabled: workflowAlerts.dineInFulfillmentWarningEnabled === true,
      dineInFulfillmentWarningMinutes: clampRuntimeInteger(
        workflowAlerts.dineInFulfillmentWarningMinutes,
        defaults.workflowAlerts.dineInFulfillmentWarningMinutes,
        0,
        1440,
      ),
      dineInDwellWarningEnabled: workflowAlerts.dineInDwellWarningEnabled === true,
      dineInDwellWarningMinutes: clampRuntimeInteger(
        workflowAlerts.dineInDwellWarningMinutes,
        defaults.workflowAlerts.dineInDwellWarningMinutes,
        0,
        1440,
      ),
      takeoutUnprintedWarningEnabled: workflowAlerts.takeoutUnprintedWarningEnabled === true,
      takeoutUnprintedWarningMinutes: clampRuntimeInteger(
        workflowAlerts.takeoutUnprintedWarningMinutes,
        defaults.workflowAlerts.takeoutUnprintedWarningMinutes,
        0,
        1440,
      ),
      takeoutFulfillmentWarningEnabled: workflowAlerts.takeoutFulfillmentWarningEnabled === true,
      takeoutFulfillmentWarningMinutes: clampRuntimeInteger(
        workflowAlerts.takeoutFulfillmentWarningMinutes,
        defaults.workflowAlerts.takeoutFulfillmentWarningMinutes,
        0,
        1440,
      ),
      takeoutWaitWarningEnabled: workflowAlerts.takeoutWaitWarningEnabled === true,
      takeoutWaitWarningMinutes: clampRuntimeInteger(
        workflowAlerts.takeoutWaitWarningMinutes,
        defaults.workflowAlerts.takeoutWaitWarningMinutes,
        0,
        1440,
      ),
      takeoutLoopEnabled: workflowAlerts.takeoutLoopEnabled === true,
      dineInAutoExitEnabled: workflowAlerts.dineInAutoExitEnabled === true,
      takeoutAutoExitEnabled: workflowAlerts.takeoutAutoExitEnabled !== false,
    },
    orderPageDisplay: {
      noteColumns: clampRuntimeInteger(
        orderPageDisplay.noteColumns,
        defaults.orderPageDisplay.noteColumns,
        1,
        3,
      ),
    },
    recommendations,
    translations,
    hardwareDevices,
    supplyRules: {
      preOpenCheckEnabled: rawSupplyRules.preOpenCheckEnabled !== false,
      allowFutureOrdersAcrossDay: rawSupplyRules.allowFutureOrdersAcrossDay !== false,
      defaultPeriods: normalizeSupplyWindows(rawSupplyPeriods).length > 0
        ? normalizeSupplyWindows(rawSupplyPeriods)
        : defaults.supplyRules.defaultPeriods,
    },
    reservationWebsite: {
      enabled: reservationWebsite.enabled === true,
      restaurantName: sanitizeOnlineText(reservationWebsite.restaurantName, defaults.reservationWebsite.restaurantName),
      phone: sanitizeOnlineText(reservationWebsite.phone, defaults.reservationWebsite.phone),
      address: sanitizeOnlineText(reservationWebsite.address, defaults.reservationWebsite.address),
      announcement: sanitizeOnlineText(reservationWebsite.announcement, defaults.reservationWebsite.announcement),
      minPartySize: reservationMinPartySize,
      maxPartySize: reservationMaxPartySize,
      slotMinutes: Math.min(Math.max(normalizeNumber(reservationWebsite.slotMinutes, defaults.reservationWebsite.slotMinutes), 5), 240),
      durationMinutes: Math.min(Math.max(normalizeNumber(reservationWebsite.durationMinutes, defaults.reservationWebsite.durationMinutes), 15), 480),
      seatHoldMinutes: Math.min(Math.max(normalizeNumber(reservationWebsite.seatHoldMinutes, defaults.reservationWebsite.seatHoldMinutes), 0), 30),
      leadMinutes: Math.min(Math.max(normalizeNumber(reservationWebsite.leadMinutes, defaults.reservationWebsite.leadMinutes), 1), 1440),
      bookingWindowDays: Math.min(Math.max(normalizeNumber(reservationWebsite.bookingWindowDays, defaults.reservationWebsite.bookingWindowDays), 1), 60),
      allowTableCombinations: reservationWebsite.allowTableCombinations !== false,
      onlineTableIds: Array.isArray(reservationWebsite.onlineTableIds)
        ? [...new Set(reservationWebsite.onlineTableIds.map((tableId) => sanitizeOnlineText(tableId).toUpperCase()).filter(Boolean))].slice(0, 80)
        : defaults.reservationWebsite.onlineTableIds,
      businessHours: normalizeReservationBusinessHours(reservationWebsite.businessHours),
      specialDates: normalizeReservationSpecialDates(reservationWebsite.specialDates),
    },
  }
}

const normalizeAdminSettings = (rows: ApiSettingRow[]): PosAdminSettings => {
  const printerSettings = rows.find((row) => row.key === 'printer_settings')?.value
  const accessControl = rows.find((row) => row.key === 'access_control')?.value
  const onlineOrdering = rows.find((row) => row.key === 'online_ordering')?.value
  const discountSettings = rows.find((row) => row.key === 'discount_settings')?.value
  const posAppearance = rows.find((row) => row.key === 'pos_appearance')?.value
  const floorPlan = rows.find((row) => row.key === 'floor_plan')?.value
  const engagementSettings = rows.find((row) => row.key === 'engagement_settings')?.value

  return {
    printerSettings: normalizePrinterSettings(printerSettings),
    accessControl: normalizeAccessControlSettings(accessControl),
    onlineOrdering: normalizeOnlineOrderingSettings(onlineOrdering),
    discountSettings: normalizeDiscountSettings(discountSettings),
    posAppearance: normalizePosAppearanceSettings(posAppearance),
    floorPlan: normalizeFloorPlanSettings(floorPlan),
    engagementSettings: normalizeEngagementSettings(engagementSettings),
  }
}

export const normalizeOrder = (order: ApiOrder): PosOrder => {
  const orderItems = order.order_items ?? []
  const draftLines = orderItems.length === 0 ? normalizeDraftLines(order.draft_lines) : []

  return {
    id: order.order_number,
    remoteId: order.id,
    isDraft: order.source === 'counter' && order.status === 'new' && orderItems.length === 0,
    source: order.source,
    mode: order.service_mode,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    deliveryAddress: order.delivery_address ?? '',
    requestedFulfillmentAt: order.requested_fulfillment_at ?? null,
    taxId: order.tax_id ?? '',
    invoiceCarrierBarcode: order.invoice_carrier_barcode ?? '',
    invoiceDonationCode: order.invoice_donation_code ?? '',
    electronicInvoiceRequested: order.electronic_invoice_requested === true,
    electronicInvoiceStatus: order.electronic_invoice_status ?? 'not_requested',
    electronicInvoicePrintMode: order.electronic_invoice_print_mode ?? 'none',
    electronicInvoiceNumber: order.electronic_invoice_number ?? '',
    electronicInvoiceRandomCode: order.electronic_invoice_random_code ?? '',
    electronicInvoiceIssuedAt: order.electronic_invoice_issued_at ?? null,
    electronicInvoiceVoidedAt: order.electronic_invoice_voided_at ?? null,
    electronicInvoiceUploadDueAt: order.electronic_invoice_upload_due_at ?? null,
    memberId: order.member_id ?? null,
    note: order.note,
    subtotal: order.subtotal,
    orderLabels: Array.isArray(order.order_labels) ? order.order_labels.filter((label): label is string => typeof label === 'string') : [],
    serviceFeeRate: order.service_fee_rate ?? 0,
    serviceFeeAmount: order.service_fee_amount ?? 0,
    extraFeeAmount: order.extra_fee_amount ?? 0,
    discountAmount: order.discount_amount ?? 0,
    pointsRedeemed: order.points_redeemed ?? 0,
    couponCode: order.coupon_code ?? '',
    paymentSplits: normalizePaymentSplits(order.payment_splits),
    paymentBreakdown: normalizePaymentBreakdown(order.payment_breakdown),
    transactionReceiptCount: Math.min(10, Math.max(0, Math.trunc(order.transaction_receipt_count ?? 0))),
    memberPointsEarned: order.member_points_earned ?? 0,
    registerSessionId: order.register_session_id ?? null,
    checkoutStationId: order.checkout_station_id ?? '',
    checkoutBookId: order.checkout_book_id ?? 'main',
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    status: order.status,
    createdAt: order.created_at,
    claimedBy: order.claimed_by ?? null,
    claimedAt: order.claimed_at ?? null,
    claimExpiresAt: order.claim_expires_at ?? null,
    printStatus: normalizePrintStatus(order),
    printJobs: (order.print_jobs ?? []).map(normalizePrintJob),
    lines: orderItems.length > 0
      ? orderItems.map((line) => {
        const cartLine: CartLine = {
          itemId: line.product_id ?? line.product_sku,
          orderItemId: line.id,
          productSku: line.product_sku,
          name: line.name,
          unitPrice: line.unit_price,
          quantity: line.quantity,
          options: normalizeOptions(line.options),
          printPaused: line.print_paused === true,
          fulfilledAt: line.fulfilled_at ?? null,
          fulfilledByStationId: line.fulfilled_by_station_id ?? '',
        }
        if (line.product_id) {
          cartLine.productId = line.product_id
        }
        const comboItems = normalizeComboLineItems(line.combo_items)
        if (comboItems.length > 0) {
          cartLine.comboItems = comboItems
        }

        return cartLine
      })
      : draftLines,
  }
}

const normalizeOnlineOrderReminderState = (state: ApiOnlineOrderReminderState): OnlineOrderReminderState => ({
  orderId: state.order_id,
  orderNumber: state.order_number,
  status: state.status,
  snoozedUntil: state.snoozed_until,
  snoozedByStationId: state.snoozed_by_station_id ?? '',
  seenAt: state.seen_at,
  seenByStationId: state.seen_by_station_id ?? '',
  lastAction: state.last_action,
  createdAt: state.created_at,
  updatedAt: state.updated_at,
})

export const fetchProducts = async (channel: ProductChannel = 'pos'): Promise<MenuItem[]> => {
  const data = await request<ProductsResponse>(`/products?channel=${channel}`)
  return data.products.map(normalizeProduct)
}

export const fetchAdminProducts = async (): Promise<MenuItem[]> => {
  const data = await request<ProductsResponse>('/admin/products')
  return data.products.map(normalizeProduct)
}

export const createProduct = async (input: ProductUpdateInput): Promise<MenuItem> => {
  const data = await request<ProductResponse>('/admin/products', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify(input),
  })

  return normalizeProduct(data.product)
}

export const updateProduct = async (
  productId: string,
  input: ProductUpdateInput,
): Promise<MenuItem> => {
  const data = await request<ProductResponse>(`/admin/products/${productId}`, {
    method: 'PATCH',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify(input),
  })

  return normalizeProduct(data.product)
}

export const deleteProduct = async (productId: string): Promise<MenuItem> => {
  const data = await request<ProductResponse>(`/admin/products/${productId}`, {
    method: 'DELETE',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
  })

  return normalizeProduct(data.product)
}

export const fetchAdminInventory = async (recordLimit = 80): Promise<{
  categories: InventoryCategory[]
  items: InventoryItem[]
  records: InventoryRecord[]
  consumptionRules: InventoryConsumptionRule[]
}> => {
  const cappedLimit = Math.min(Math.max(Math.trunc(recordLimit), 1), 200)
  const data = await request<InventoryResponse>(`/admin/inventory?recordLimit=${cappedLimit}`)
  return {
    categories: data.categories.map(normalizeInventoryCategory),
    items: data.items.map(normalizeInventoryItem),
    records: data.records.map(normalizeInventoryRecord),
    consumptionRules: (data.consumptionRules ?? []).map(normalizeInventoryConsumptionRule),
  }
}

export const createInventoryCategory = async (input: InventoryCategoryInput): Promise<InventoryCategory> => {
  const data = await request<InventoryCategoryResponse>('/admin/inventory/categories', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeInventoryCategory(data.category)
}

export const updateInventoryCategory = async (
  categoryId: string,
  input: InventoryCategoryInput,
): Promise<InventoryCategory> => {
  const data = await request<InventoryCategoryResponse>(`/admin/inventory/categories/${categoryId}`, {
    method: 'PATCH',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeInventoryCategory(data.category)
}

export const createInventoryItem = async (input: InventoryItemInput): Promise<InventoryItem> => {
  const data = await request<InventoryItemResponse>('/admin/inventory/items', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeInventoryItem(data.item)
}

export const updateInventoryItem = async (
  itemId: string,
  input: InventoryItemInput,
): Promise<InventoryItem> => {
  const data = await request<InventoryItemResponse>(`/admin/inventory/items/${itemId}`, {
    method: 'PATCH',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeInventoryItem(data.item)
}

export const createInventoryRecord = async (input: InventoryRecordInput): Promise<InventoryRecord> => {
  const data = await request<InventoryRecordResponse>('/admin/inventory/records', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeInventoryRecord(data.record)
}

export const createInventoryConsumptionRule = async (
  input: InventoryConsumptionRuleInput,
): Promise<InventoryConsumptionRule> => {
  const data = await request<InventoryConsumptionRuleResponse>('/admin/inventory/consumption-rules', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeInventoryConsumptionRule(data.rule)
}

export const updateInventoryConsumptionRule = async (
  ruleId: string,
  input: Partial<InventoryConsumptionRuleInput>,
): Promise<InventoryConsumptionRule> => {
  const data = await request<InventoryConsumptionRuleResponse>(`/admin/inventory/consumption-rules/${ruleId}`, {
    method: 'PATCH',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeInventoryConsumptionRule(data.rule)
}

export const fetchAdminSettings = async (): Promise<PosAdminSettings> => {
  const data = await request<AdminSettingsResponse>('/admin/settings')

  return normalizeAdminSettings(data.settings)
}

export const fetchAdminAuditEvents = async (limit = 50): Promise<PosAuditEvent[]> => {
  const rawLimit = Number.isFinite(limit) ? limit : 50
  const cappedLimit = Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
  const data = await request<AuditEventsResponse>(`/admin/audit-events?limit=${cappedLimit}`)

  return data.events.map(normalizeAuditEvent)
}

export const fetchAdminCloseoutReportDeliveries = async (limit = 60): Promise<CloseoutReportDelivery[]> => {
  const rawLimit = Number.isFinite(limit) ? limit : 60
  const cappedLimit = Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
  const data = await request<CloseoutReportDeliveriesResponse>(`/admin/closeout-report-deliveries?limit=${cappedLimit}`)

  return data.deliveries.map(normalizeCloseoutReportDelivery)
}

interface AdminTimeClockEntryQuery {
  limit?: number
  startDate?: string
  endDate?: string
  staffAccountId?: string
}

interface StaffTimeClockEntryQuery {
  limit?: number
  staffAccountId?: string
}

export const fetchAdminTimeClockEntries = async (
  query: number | AdminTimeClockEntryQuery = 80,
): Promise<StaffTimeClockEntry[]> => {
  const options = typeof query === 'number' ? { limit: query } : query
  const rawLimit = Number.isFinite(options.limit ?? 80) ? options.limit ?? 80 : 80
  const cappedLimit = Math.min(Math.max(Math.trunc(rawLimit), 1), 2000)
  const params = new URLSearchParams({ limit: String(cappedLimit) })
  const startDate = options.startDate?.trim()
  const endDate = options.endDate?.trim()
  const staffAccountId = options.staffAccountId?.trim()
  if (startDate && endDate) {
    params.set('startDate', startDate)
    params.set('endDate', endDate)
  }
  if (staffAccountId && staffAccountId !== 'all') {
    params.set('staffAccountId', staffAccountId)
  }

  const data = await request<StaffTimeClockEntriesResponse>(`/admin/time-clock?${params.toString()}`)

  return data.entries.map(normalizeStaffTimeClockEntry)
}

export const fetchStaffTimeClockEntries = async (
  query: number | StaffTimeClockEntryQuery = 80,
): Promise<StaffTimeClockEntry[]> => {
  const options = typeof query === 'number' ? { limit: query } : query
  const rawLimit = Number.isFinite(options.limit ?? 80) ? options.limit ?? 80 : 80
  const cappedLimit = Math.min(Math.max(Math.trunc(rawLimit), 1), 300)
  const params = new URLSearchParams({ limit: String(cappedLimit) })
  const staffAccountId = options.staffAccountId?.trim()
  if (staffAccountId && staffAccountId !== 'all') {
    params.set('staffAccountId', staffAccountId)
  }

  const data = await request<StaffTimeClockEntriesResponse>(`/time-clock?${params.toString()}`)

  return data.entries.map(normalizeStaffTimeClockEntry)
}

export const fetchAdminPaymentEvents = async (
  limit = 50,
  provider = '',
): Promise<PosPaymentEvent[]> => {
  const rawLimit = Number.isFinite(limit) ? limit : 50
  const cappedLimit = Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
  const params = new URLSearchParams({ limit: String(cappedLimit) })
  const normalizedProvider = provider.trim()
  if (normalizedProvider && normalizedProvider !== 'all') {
    params.set('provider', normalizedProvider)
  }

  const data = await request<PaymentEventsResponse>(`/admin/payment-events?${params.toString()}`)

  return data.events.map(normalizePaymentEvent)
}

export const fetchAdminStations = async (): Promise<PosStationHeartbeat[]> => {
  const data = await request<StationHeartbeatsResponse>('/admin/stations')

  return data.stations.map(normalizeStationHeartbeat)
}

export const fetchAdminMembers = async (limit = 50, keyword = ''): Promise<PosMember[]> => {
  const rawLimit = Number.isFinite(limit) ? limit : 50
  const cappedLimit = Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
  const params = new URLSearchParams({ limit: String(cappedLimit) })
  if (keyword.trim()) {
    params.set('q', keyword.trim())
  }

  const data = await request<MembersResponse>(`/admin/members?${params.toString()}`)

  return data.members.map(normalizeMember)
}

export const searchPosMembers = async (keyword: string, limit = 8): Promise<PosMember[]> => {
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(Math.trunc(limit), 1), 20)),
  })
  if (keyword.trim()) {
    params.set('q', keyword.trim())
  }

  const data = await request<MembersResponse>(`/members/search?${params.toString()}`)
  return data.members.map(normalizeMember)
}

export const fetchAdminCoupons = async (limit = 80): Promise<MemberCoupon[]> => {
  const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 200)
  const data = await request<CouponsResponse>(`/admin/coupons?limit=${cappedLimit}`)
  return data.coupons.map(normalizeCoupon)
}

export const createAdminCoupon = async (input: CreateCouponInput): Promise<MemberCoupon> => {
  const data = await request<CouponResponse>('/admin/coupons', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeCoupon(data.coupon)
}

export const fetchAdminReservations = async (rangeStart = '', rangeEnd = ''): Promise<PosReservation[]> => {
  const params = new URLSearchParams()
  if (rangeStart.trim()) {
    params.set('from', rangeStart.trim())
  }
  if (rangeEnd.trim()) {
    params.set('to', rangeEnd.trim())
  }

  const data = await request<ReservationsResponse>(`/admin/reservations?${params.toString()}`)
  return data.reservations.map(normalizeReservation)
}

export const createAdminReservation = async (input: ReservationInput): Promise<PosReservation> => {
  const data = await request<ReservationResponse>('/admin/reservations', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeReservation(data.reservation)
}

export const createPublicReservation = async (input: PublicReservationInput): Promise<PosReservation> => {
  const data = await request<ReservationResponse>('/reservations', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  return normalizeReservation(data.reservation)
}

export const updateAdminReservation = async (
  reservationId: string,
  input: Partial<ReservationInput>,
): Promise<PosReservation> => {
  const data = await request<ReservationResponse>(`/admin/reservations/${reservationId}`, {
    method: 'PATCH',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeReservation(data.reservation)
}

export const fetchAdminReservationBlacklist = async (): Promise<ReservationBlacklistEntry[]> => {
  const data = await request<ReservationBlacklistResponse>('/admin/reservation-blacklist')
  return data.entries.map(normalizeReservationBlacklistEntry)
}

export const createAdminReservationBlacklistEntry = async (
  input: ReservationBlacklistInput,
): Promise<ReservationBlacklistEntry> => {
  const data = await request<ReservationBlacklistEntryResponse>('/admin/reservation-blacklist', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeReservationBlacklistEntry(data.entry)
}

export const updateAdminReservationBlacklistEntry = async (
  entryId: string,
  input: Partial<ReservationBlacklistInput>,
): Promise<ReservationBlacklistEntry> => {
  const data = await request<ReservationBlacklistEntryResponse>(`/admin/reservation-blacklist/${entryId}`, {
    method: 'PATCH',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeReservationBlacklistEntry(data.entry)
}

export const fetchAdminDailyReport = async (date: string): Promise<DailySalesReport> => {
  const params = new URLSearchParams()
  if (date.trim()) {
    params.set('date', date.trim())
  }

  const data = await request<DailyReportResponse>(`/admin/reports/daily?${params.toString()}`)

  return data.report
}

export const createAdminMember = async (
  input: CreateMemberInput,
): Promise<PosMember> => {
  const data = await request<MemberResponse>('/admin/members', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeMember(data.member)
}

export const adjustMemberWallet = async (
  memberId: string,
  input: WalletAdjustmentInput,
): Promise<PosMember> => {
  const data = await request<MemberResponse>(`/admin/members/${memberId}/wallet-adjustments`, {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      ...input,
      stationId: currentStationId(),
    }),
  })

  return normalizeMember(data.member)
}

export const sendStationHeartbeat = async (): Promise<PosStationHeartbeat> => {
  const data = await request<StationHeartbeatResponse>('/station/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      stationId: currentStationId(),
      stationLabel: currentStationLabel(),
      platform: globalThis.navigator?.platform ?? '',
      appVersion: import.meta.env.VITE_APP_VERSION ?? '',
      userAgent: globalThis.navigator?.userAgent ?? '',
    }),
  })

  return normalizeStationHeartbeat(data.station)
}

export const createStaffTimeClockEntry = async (
  staffCode: string,
  note = '',
  eventType?: TimeClockEventType,
): Promise<StaffTimeClockEntry> => {
  const data = await request<StaffTimeClockEntryResponse>('/time-clock', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({ staffCode, note, eventType, stationId: currentStationId() }),
  })

  return normalizeStaffTimeClockEntry(data.entry)
}

export const verifyAccessPermission = async (
  permission: AdminPermission,
  staffCode: string,
): Promise<StaffPermissionVerification> => {
  return request<StaffPermissionVerification>('/access/verify', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({ permission, staffCode, stationId: currentStationId() }),
  })
}

export const updateAdminSetting = async <SettingValue>(
  key: AdminSettingKey,
  value: SettingValue,
): Promise<SettingValue> => {
  const data = await request<{ setting: ApiSettingRow }>(`/admin/settings/${key}`, {
    method: 'PATCH',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify(value),
  })

  return data.setting.value as SettingValue
}

export const fetchRuntimeSettings = async (): Promise<RuntimeSettingsResponse> => {
  const data = await request<Partial<RuntimeSettingsResponse>>('/settings/runtime')
  return {
    printerSettings: normalizePrinterSettings(data.printerSettings),
    onlineOrdering: normalizeOnlineOrderingSettings(data.onlineOrdering),
    discountSettings: normalizeDiscountSettings(data.discountSettings ?? defaultDiscountSettings()),
    posAppearance: normalizePosAppearanceSettings(data.posAppearance),
    floorPlan: normalizeFloorPlanSettings(data.floorPlan),
    engagementSettings: normalizeEngagementSettings(data.engagementSettings),
    accessPolicy: normalizeAccessPolicy(data.accessPolicy),
  }
}

export const fetchOrders = async (limit = 50): Promise<PosOrder[]> => {
  const data = await request<OrdersResponse>(`/orders?limit=${limit}`)
  return data.orders.map(normalizeOrder)
}

export const fetchOnlineOrderReminderStates = async (
  orderIds: string[],
): Promise<OnlineOrderReminderState[]> => {
  const uniqueOrderIds = [...new Set(orderIds.map((orderId) => orderId.trim()).filter(Boolean))].slice(0, 100)
  if (uniqueOrderIds.length === 0) {
    return []
  }

  const params = new URLSearchParams({ orderIds: uniqueOrderIds.join(',') })
  const data = await request<OnlineOrderReminderStatesResponse>(`/online-order-reminders/state?${params.toString()}`)
  return data.states.map(normalizeOnlineOrderReminderState)
}

export const updateOnlineOrderReminderStates = async ({
  orderIds,
  action,
  snoozedUntil,
}: OnlineOrderReminderStateUpdateInput): Promise<OnlineOrderReminderState[]> => {
  const uniqueOrderIds = [...new Set(orderIds.map((orderId) => orderId.trim()).filter(Boolean))].slice(0, 100)
  if (uniqueOrderIds.length === 0) {
    return []
  }

  const data = await request<OnlineOrderReminderStatesResponse>('/online-order-reminders/state', {
    method: 'PATCH',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({
      orderIds: uniqueOrderIds,
      action,
      snoozedUntil,
      stationId: currentStationId(),
    }),
  })
  return data.states.map(normalizeOnlineOrderReminderState)
}

export const fetchCurrentRegisterSession = async (): Promise<RegisterSession | null> => {
  const data = await request<RegisterSessionResponse>('/register/current', {
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
  })
  return data.session ? normalizeRegisterSession(data.session) : null
}

export const openRegisterSession = async (
  openingCash: number,
  note = '',
): Promise<RegisterSession> => {
  const data = await request<RegisterSessionResponse>('/register/open', {
    method: 'POST',
    body: JSON.stringify({ openingCash, note, stationId: currentStationId() }),
  })

  if (!data.session) {
    throw new Error('Register session was not returned')
  }

  return normalizeRegisterSession(data.session)
}

export const closeRegisterSession = async (
  closingCash: number,
  note = '',
  force = false,
  staffCode = '',
): Promise<RegisterSession> => {
  const data = await request<RegisterSessionResponse>('/register/close', {
    method: 'POST',
    body: JSON.stringify({ closingCash, note, stationId: currentStationId(), force, staffCode }),
  })

  if (!data.session) {
    throw new Error('Register session was not returned')
  }

  return normalizeRegisterSession(data.session)
}

export const createRegisterCashAdjustment = async (
  kind: RegisterCashAdjustmentKind,
  amount: number,
  reason: string,
  note = '',
): Promise<RegisterSession> => {
  const data = await request<RegisterSessionResponse>('/register/cash-adjustments', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({ kind, amount, reason, note, stationId: currentStationId() }),
  })

  if (!data.session) {
    throw new Error('Register session was not returned')
  }

  return normalizeRegisterSession(data.session)
}

export const fetchCashDrawerEvents = async (limit = 60): Promise<CashDrawerEvent[]> => {
  const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 120)
  const data = await request<CashDrawerEventsResponse>(`/cash-drawer/events?limit=${cappedLimit}`)
  return (data.events ?? []).map(normalizeCashDrawerEvent)
}

export const createCashDrawerOpenEvent = async (input: {
  reason: string
  deviceId: string
  targetStationId: string
  printerHost: string
  printerPort: number
  deliveryStatus: CashDrawerDeliveryStatus
  errorMessage?: string
}): Promise<CashDrawerEvent> => {
  const data = await request<{ event: ApiCashDrawerEvent }>('/cash-drawer/open', {
    method: 'POST',
    headers: {
      'X-POS-STATION-ID': currentStationId(),
    },
    body: JSON.stringify({ ...input, stationId: currentStationId() }),
  })
  return normalizeCashDrawerEvent(data.event)
}

const orderPayload = (order: PosOrder) => ({
  orderNumber: order.id,
  source: order.source,
  serviceMode: order.mode,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  deliveryAddress: order.deliveryAddress,
  requestedFulfillmentAt: order.requestedFulfillmentAt,
  taxId: order.taxId,
  invoiceCarrierBarcode: order.invoiceCarrierBarcode,
  invoiceDonationCode: order.invoiceDonationCode,
  electronicInvoiceRequested: order.electronicInvoiceRequested,
  electronicInvoicePrintMode: order.electronicInvoicePrintMode,
  memberId: order.memberId,
  note: order.note,
  qrSessionOrderId: order.qrSessionOrderId ?? null,
  qrSessionStartedAt: order.qrSessionStartedAt ?? null,
  subtotal: order.subtotal,
  orderLabels: order.orderLabels,
  serviceFeeRate: order.serviceFeeRate,
  serviceFeeAmount: order.serviceFeeAmount,
  extraFeeAmount: order.extraFeeAmount,
  discountAmount: order.discountAmount,
  pointsRedeemed: order.pointsRedeemed,
  couponCode: order.couponCode,
  paymentSplits: order.paymentSplits.map((split) => ({
    id: split.id,
    label: split.label,
    amount: split.amount,
    lineKeys: split.lineKeys,
    paymentMethod: split.paymentMethod,
    status: split.status,
    paidAt: split.paidAt,
  })),
  paymentBreakdown: order.paymentBreakdown.map((payment) => ({
    id: payment.id,
    paymentMethod: payment.paymentMethod,
    amount: payment.amount,
    status: payment.status,
    paidAt: payment.paidAt,
  })),
  transactionReceiptCount: order.transactionReceiptCount,
  memberPointsEarned: order.memberPointsEarned,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  stationId: currentStationId(),
  lines: order.lines.map((line) => ({
    productId: line.productId,
    productSku: line.productSku,
    category: line.category,
    name: line.name,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    options: line.options,
    comboItems: line.comboItems,
    printPaused: line.printPaused === true,
  })),
})

export const createOrder = async (order: PosOrder): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload(order)),
  })

  return normalizeOrder(data.order)
}

export const createCounterDraftOrder = async (order: PosOrder): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>('/orders/drafts', {
    method: 'POST',
    body: JSON.stringify(orderPayload(order)),
  })

  return normalizeOrder(data.order)
}

export const updateCounterDraftOrder = async (order: PosOrder): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/draft`, {
    method: 'PATCH',
    body: JSON.stringify(orderPayload(order)),
  })

  return normalizeOrder(data.order)
}

export const finalizeCounterDraftOrder = async (order: PosOrder): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/finalize`, {
    method: 'POST',
    body: JSON.stringify(orderPayload(order)),
  })

  return normalizeOrder(data.order)
}

export const updateOrderStatus = async (order: PosOrder, status: OrderStatus): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, stationId: currentStationId() }),
  })

  return normalizeOrder(data.order)
}

export const updateOrderItemFulfillment = async (
  order: PosOrder,
  orderItemId: string,
  fulfilled: boolean,
): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/items/${orderItemId}/fulfillment`, {
    method: 'PATCH',
    body: JSON.stringify({ fulfilled, stationId: currentStationId() }),
  })

  return normalizeOrder(data.order)
}

export const updateOrderPaymentStatus = async (
  order: PosOrder,
  paymentStatus: PaymentStatus,
): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/payment`, {
    method: 'PATCH',
    body: JSON.stringify({ paymentStatus, stationId: currentStationId() }),
  })

  return normalizeOrder(data.order)
}

export const updateOrderFloorAssignment = async (
  order: PosOrder,
  input: FloorAssignmentInput,
): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/floor`, {
    method: 'PATCH',
    body: JSON.stringify({ ...input, stationId: currentStationId() }),
  })

  return normalizeOrder(data.order)
}

export const mergeOrderIntoOrder = async (
  sourceOrder: PosOrder,
  targetOrder: PosOrder,
): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${sourceOrder.remoteId ?? sourceOrder.id}/merge`, {
    method: 'POST',
    body: JSON.stringify({
      targetOrderId: targetOrder.remoteId ?? targetOrder.id,
      stationId: currentStationId(),
    }),
  })

  return normalizeOrder(data.order)
}

export const voidOrder = async (
  order: PosOrder,
  note = '',
): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/void`, {
    method: 'POST',
    body: JSON.stringify({ stationId: currentStationId(), note }),
  })

  return normalizeOrder(data.order)
}

export const refundOrder = async (
  order: PosOrder,
  note = '',
): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/refund`, {
    method: 'POST',
    body: JSON.stringify({ stationId: currentStationId(), note }),
  })

  return normalizeOrder(data.order)
}

export const claimOrder = async (order: PosOrder, force = false): Promise<PosOrder> => {
  const data = await request<ClaimOrderResponse>(`/orders/${order.remoteId ?? order.id}/claim`, {
    method: 'POST',
    body: JSON.stringify({ stationId: currentStationId(), force }),
  })

  return normalizeOrder(data.order)
}

export const releaseOrderClaim = async (order: PosOrder): Promise<PosOrder> => {
  const data = await request<ClaimOrderResponse>(`/orders/${order.remoteId ?? order.id}/release-claim`, {
    method: 'POST',
    body: JSON.stringify({ stationId: currentStationId() }),
  })

  return normalizeOrder(data.order)
}

export const createPrintJob = async (
  order: PosOrder,
  payload: string,
  station: PrintStation,
): Promise<PrintJob> => {
  if (!order.remoteId) {
    throw new Error('remote order id is required before creating print job')
  }

  const data = await request<PrintJobResponse>('/print-jobs', {
    method: 'POST',
    body: JSON.stringify({
      orderId: order.remoteId,
      stationId: currentStationId(),
      payload,
      stationName: station.name,
      printerHost: station.host,
      printerPort: station.port,
      protocol: station.protocol,
    }),
  })

  return normalizePrintJob(data.printJob)
}

export const updatePrintJobStatus = async (
  printJobId: string,
  status: Extract<PrintStatus, 'printed' | 'failed'>,
  error?: string,
): Promise<PrintJob> => {
  const data = await request<PrintJobResponse>(`/print-jobs/${printJobId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, error }),
  })

  return normalizePrintJob(data.printJob)
}

export const deletePrintJob = async (printJobId: string): Promise<PrintJob> => {
  const stationId = currentStationId()
  const data = await request<PrintJobResponse>(`/print-jobs/${printJobId}`, {
    method: 'DELETE',
    headers: {
      'X-POS-STATION-ID': stationId,
    },
    body: JSON.stringify({ stationId }),
  })

  return normalizePrintJob(data.printJob)
}
