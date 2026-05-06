import type {
  AccessControlSettings,
  MenuCategory,
  MenuItem,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PosAdminSettings,
  PosAuditEvent,
  DailySalesReport,
  CartLine,
  OnlineMenuCategory,
  OnlineMenuOptionChoice,
  OnlineMenuOptionGroup,
  OnlineNotificationRepeatMode,
  OnlineOrderingSettings,
  PosAppearanceSettings,
  PosMember,
  PosOrder,
  PosPaymentEvent,
  PosStationHeartbeat,
  RegisterSession,
  PrintJob,
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
  note: string
  subtotal: number
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

interface CreateOrderResponse {
  order: ApiOrder
}

interface ProductsResponse {
  products: ApiProduct[]
}

interface OrdersResponse {
  orders: ApiOrder[]
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
  wallet_balance: number
  created_at: string
  updated_at: string
  ledger?: ApiTransactionLedgerEntry[]
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
}

export interface CreateMemberInput {
  lineUserId: string
  displayName: string
  openingBalance: number
  note: string
}

export interface WalletAdjustmentInput {
  amount: number
  note: string
}

interface ProductResponse {
  product: ApiProduct
}

export type AdminSettingKey = 'printer_settings' | 'access_control' | 'online_ordering' | 'pos_appearance'
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

const normalizeMember = (member: ApiMember): PosMember => ({
  id: member.id,
  lineUserId: member.line_user_id,
  displayName: member.line_display_name,
  walletBalance: member.wallet_balance,
  createdAt: member.created_at,
  updatedAt: member.updated_at,
  ledger: (member.ledger ?? []).map(normalizeLedgerEntry),
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
})

const isPrinterSettings = (value: unknown): value is PrinterSettings => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const settings = value as PrinterSettings
  return Array.isArray(settings.stations) && Array.isArray(settings.rules)
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

const normalizeAdminSettings = (rows: ApiSettingRow[]): PosAdminSettings => {
  const printerSettings = rows.find((row) => row.key === 'printer_settings')?.value
  const accessControl = rows.find((row) => row.key === 'access_control')?.value
  const onlineOrdering = rows.find((row) => row.key === 'online_ordering')?.value
  const posAppearance = rows.find((row) => row.key === 'pos_appearance')?.value

  return {
    printerSettings: isPrinterSettings(printerSettings) ? printerSettings : { stations: [], rules: [] },
    accessControl: isAccessControlSettings(accessControl) ? accessControl : { roles: [] },
    onlineOrdering: normalizeOnlineOrderingSettings(onlineOrdering),
    posAppearance: normalizePosAppearanceSettings(posAppearance),
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
    note: order.note,
    subtotal: order.subtotal,
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
    printerSettings: isPrinterSettings(data.printerSettings) ? data.printerSettings : { stations: [], rules: [] },
    onlineOrdering: normalizeOnlineOrderingSettings(data.onlineOrdering),
    posAppearance: normalizePosAppearanceSettings(data.posAppearance),
  }
}

export const fetchOrders = async (limit = 50): Promise<PosOrder[]> => {
  const data = await request<OrdersResponse>(`/orders?limit=${limit}`)
  return data.orders.map(normalizeOrder)
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
  note: order.note,
  subtotal: order.subtotal,
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
