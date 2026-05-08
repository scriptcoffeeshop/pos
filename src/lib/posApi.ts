import type {
  AccessControlSettings,
  MenuCategory,
  MenuItem,
  MemberCoupon,
  FloorLevelSetting,
  FloorDisplayPreferences,
  FloorPlanSettings,
  FloorTableSetting,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PosAdminSettings,
  PosAuditEvent,
  DailySalesReport,
  CartLine,
  CustomerEngagementSettings,
  OnlineMenuCategory,
  OnlineMenuOptionChoice,
  OnlineMenuOptionGroup,
  OnlineNotificationRepeatMode,
  OnlineOrderReminderAction,
  OnlineOrderReminderState,
  OnlineOrderReminderStatus,
  OnlineOrderingSettings,
  PosAppearanceSettings,
  PosMember,
  PosOrder,
  PosPaymentEvent,
  PosReservation,
  PosStationHeartbeat,
  RegisterSession,
  ReservationStatus,
  SupplyPeriodRule,
  WaitlineEntry,
  PrintJob,
  PrintLabelMode,
  PrintRuleSetting,
  PrintStatus,
  PrinterSettings,
  PrintStation,
  ServiceMode,
} from '../types/pos'

interface ApiProduct {
  id: string
  sku: string
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
  member_points_earned?: number | null
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
  opened_at: string
  closed_at: string | null
  opening_cash: number
  closing_cash: number | null
  expected_cash: number
  cash_sales: number
  non_cash_sales: number
  pending_total: number
  order_count: number
  open_order_count: number
  failed_payment_count: number
  failed_print_count: number
  voided_order_count: number
  note: string
}

interface RegisterSessionResponse {
  session: ApiRegisterSession | null
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
  pre_order: unknown
  note: string
  created_at: string
  updated_at: string
}

interface AuditEventsResponse {
  events: ApiAuditEvent[]
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

interface ApiStationHeartbeat {
  station_id: string
  station_label: string | null
  platform: string | null
  app_version: string | null
  user_agent: string | null
  last_seen_at: string
  created_at: string
}

interface StationHeartbeatResponse {
  station: ApiStationHeartbeat
}

interface StationHeartbeatsResponse {
  stations: ApiStationHeartbeat[]
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
  posAppearance: PosAppearanceSettings
  floorPlan: FloorPlanSettings
  engagementSettings: CustomerEngagementSettings
}

interface DailyReportResponse {
  report: DailySalesReport
}

export interface ProductUpdateInput {
  sku?: string
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
  preOrder: CartLine[]
  note: string
}

export interface OnlineOrderReminderStateUpdateInput {
  orderIds: string[]
  action: OnlineOrderReminderAction
  snoozedUntil?: string
}

interface ProductResponse {
  product: ApiProduct
}

export type AdminSettingKey =
  | 'printer_settings'
  | 'access_control'
  | 'online_ordering'
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
    if (productId) {
      cartLine.productId = productId
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

const normalizeRegisterSession = (session: ApiRegisterSession): RegisterSession => ({
  id: session.id,
  status: session.status,
  openedAt: session.opened_at,
  closedAt: session.closed_at,
  openingCash: session.opening_cash,
  closingCash: session.closing_cash,
  expectedCash: session.expected_cash,
  cashSales: session.cash_sales,
  nonCashSales: session.non_cash_sales,
  pendingTotal: session.pending_total,
  orderCount: session.order_count,
  openOrderCount: session.open_order_count,
  failedPaymentCount: session.failed_payment_count,
  failedPrintCount: session.failed_print_count,
  voidedOrderCount: session.voided_order_count,
  note: session.note,
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
  preOrder: normalizeDraftLines(reservation.pre_order),
  note: reservation.note,
  createdAt: reservation.created_at,
  updatedAt: reservation.updated_at,
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

export const normalizeProduct = (product: ApiProduct): MenuItem => ({
  id: product.id,
  sku: product.sku,
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
        categories: Array.isArray(rule.categories) ? [...rule.categories] : [],
        itemIds: Array.isArray(rule.itemIds) ? [...rule.itemIds] : [],
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

export const defaultOnlineOrderingSettings = (): OnlineOrderingSettings => ({
  enabled: true,
  allowScheduledOrders: true,
  averagePrepMinutes: 20,
  unconfirmedReminderMinutes: 5,
  acceptanceRequired: true,
  acceptWithoutPrinting: false,
  soundEnabled: true,
  notificationRepeatMode: 'continuous',
  notificationVolume: 80,
  pauseMessage: '目前暫停線上點餐，請稍後再試',
  menuCategories: [],
  availableOptionChoices: [],
  menuOptionGroups: [],
  productOptionAssignments: {},
  noteSupplyStatuses: {},
})

const notificationRepeatModes = new Set<OnlineNotificationRepeatMode>(['once', 'continuous'])

const sanitizeOnlineText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim().slice(0, 80) : fallback

const sanitizeColor = (value: unknown, fallback = '#0f766e'): string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback
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

  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : defaults.enabled,
    allowScheduledOrders:
      typeof settings.allowScheduledOrders === 'boolean' ? settings.allowScheduledOrders : defaults.allowScheduledOrders,
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
    pauseMessage:
      typeof settings.pauseMessage === 'string' && settings.pauseMessage.trim().length > 0
        ? settings.pauseMessage.trim().slice(0, 120)
        : defaults.pauseMessage,
    menuCategories,
    availableOptionChoices,
    menuOptionGroups,
    productOptionAssignments: normalizeProductOptionAssignments(settings.productOptionAssignments, menuOptionGroups),
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

  return {
    orderLabels: orderLabels.length > 0 ? orderLabels : defaults.orderLabels,
    customerTypes: customerTypes.length > 0 ? customerTypes : defaults.customerTypes,
    defaultServiceFeeRate: Math.min(Math.max(normalizeNumber(settings.defaultServiceFeeRate, 0), 0), 30),
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
  }
}

const normalizeAdminSettings = (rows: ApiSettingRow[]): PosAdminSettings => {
  const printerSettings = rows.find((row) => row.key === 'printer_settings')?.value
  const accessControl = rows.find((row) => row.key === 'access_control')?.value
  const onlineOrdering = rows.find((row) => row.key === 'online_ordering')?.value
  const posAppearance = rows.find((row) => row.key === 'pos_appearance')?.value
  const floorPlan = rows.find((row) => row.key === 'floor_plan')?.value
  const engagementSettings = rows.find((row) => row.key === 'engagement_settings')?.value

  return {
    printerSettings: normalizePrinterSettings(printerSettings),
    accessControl: isAccessControlSettings(accessControl) ? accessControl : { roles: [] },
    onlineOrdering: normalizeOnlineOrderingSettings(onlineOrdering),
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
    memberPointsEarned: order.member_points_earned ?? 0,
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
        const cartLine = {
          itemId: line.product_id ?? line.product_sku,
          productSku: line.product_sku,
          name: line.name,
          unitPrice: line.unit_price,
          quantity: line.quantity,
          options: normalizeOptions(line.options),
        }

        return line.product_id ? { ...cartLine, productId: line.product_id } : cartLine
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
    posAppearance: normalizePosAppearanceSettings(data.posAppearance),
    floorPlan: normalizeFloorPlanSettings(data.floorPlan),
    engagementSettings: normalizeEngagementSettings(data.engagementSettings),
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
  const data = await request<RegisterSessionResponse>('/register/current')
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
): Promise<RegisterSession> => {
  const data = await request<RegisterSessionResponse>('/register/close', {
    method: 'POST',
    body: JSON.stringify({ closingCash, note, stationId: currentStationId(), force }),
  })

  if (!data.session) {
    throw new Error('Register session was not returned')
  }

  return normalizeRegisterSession(data.session)
}

const orderPayload = (order: PosOrder) => ({
  orderNumber: order.id,
  source: order.source,
  serviceMode: order.mode,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  deliveryAddress: order.deliveryAddress,
  requestedFulfillmentAt: order.requestedFulfillmentAt,
  memberId: order.memberId,
  note: order.note,
  subtotal: order.subtotal,
  orderLabels: order.orderLabels,
  serviceFeeRate: order.serviceFeeRate,
  serviceFeeAmount: order.serviceFeeAmount,
  extraFeeAmount: order.extraFeeAmount,
  discountAmount: order.discountAmount,
  pointsRedeemed: order.pointsRedeemed,
  couponCode: order.couponCode,
  memberPointsEarned: order.memberPointsEarned,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  stationId: currentStationId(),
  lines: order.lines.map((line) => ({
    productId: line.productId,
    productSku: line.productSku,
    name: line.name,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    options: line.options,
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
