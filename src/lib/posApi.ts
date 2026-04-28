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
  PosOrder,
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
  note: string
  subtotal: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  status: OrderStatus
  created_at: string
  claimed_by?: string | null
  claimed_at?: string | null
  claim_expires_at?: string | null
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

interface AuditEventsResponse {
  events: ApiAuditEvent[]
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
}

export interface ProductUpdateInput {
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

interface ProductResponse {
  product: ApiProduct
}

export type AdminSettingKey = 'printer_settings' | 'access_control'
export type ProductChannel = 'pos' | 'online' | 'qr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const stationIdStorageKey = 'script-coffee-pos-station-id'

const apiBaseUrl = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/pos-api` : ''

export const isPosApiConfigured = Boolean(apiBaseUrl && supabaseAnonKey)

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

const normalizeAdminSettings = (rows: ApiSettingRow[]): PosAdminSettings => {
  const printerSettings = rows.find((row) => row.key === 'printer_settings')?.value
  const accessControl = rows.find((row) => row.key === 'access_control')?.value

  return {
    printerSettings: isPrinterSettings(printerSettings) ? printerSettings : { stations: [], rules: [] },
    accessControl: isAccessControlSettings(accessControl) ? accessControl : { roles: [] },
  }
}

export const normalizeOrder = (order: ApiOrder): PosOrder => ({
  id: order.order_number,
  remoteId: order.id,
  source: order.source,
  mode: order.service_mode,
  customerName: order.customer_name,
  customerPhone: order.customer_phone,
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
  lines: (order.order_items ?? []).map((line) => {
    const cartLine = {
      itemId: line.product_id ?? line.product_sku,
      productSku: line.product_sku,
      name: line.name,
      unitPrice: line.unit_price,
      quantity: line.quantity,
      options: normalizeOptions(line.options),
    }

    return line.product_id ? { ...cartLine, productId: line.product_id } : cartLine
  }),
})

export const fetchProducts = async (channel: ProductChannel = 'pos'): Promise<MenuItem[]> => {
  const data = await request<ProductsResponse>(`/products?channel=${channel}`)
  return data.products.map(normalizeProduct)
}

export const fetchAdminProducts = async (adminPin: string): Promise<MenuItem[]> => {
  const data = await request<ProductsResponse>('/admin/products', {
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
  })
  return data.products.map(normalizeProduct)
}

export const updateProduct = async (
  adminPin: string,
  productId: string,
  input: ProductUpdateInput,
): Promise<MenuItem> => {
  const data = await request<ProductResponse>(`/admin/products/${productId}`, {
    method: 'PATCH',
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
    body: JSON.stringify(input),
  })

  return normalizeProduct(data.product)
}

export const fetchAdminSettings = async (adminPin: string): Promise<PosAdminSettings> => {
  const data = await request<AdminSettingsResponse>('/admin/settings', {
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
  })

  return normalizeAdminSettings(data.settings)
}

export const fetchAdminAuditEvents = async (adminPin: string, limit = 50): Promise<PosAuditEvent[]> => {
  const rawLimit = Number.isFinite(limit) ? limit : 50
  const cappedLimit = Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
  const data = await request<AuditEventsResponse>(`/admin/audit-events?limit=${cappedLimit}`, {
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
  })

  return data.events.map(normalizeAuditEvent)
}

export const updateAdminSetting = async <SettingValue>(
  adminPin: string,
  key: AdminSettingKey,
  value: SettingValue,
): Promise<SettingValue> => {
  const data = await request<{ setting: ApiSettingRow }>(`/admin/settings/${key}`, {
    method: 'PATCH',
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
    body: JSON.stringify(value),
  })

  return data.setting.value as SettingValue
}

export const fetchRuntimeSettings = async (): Promise<RuntimeSettingsResponse> =>
  request<RuntimeSettingsResponse>('/settings/runtime')

export const fetchOrders = async (limit = 50): Promise<PosOrder[]> => {
  const data = await request<OrdersResponse>(`/orders?limit=${limit}`)
  return data.orders.map(normalizeOrder)
}

export const fetchCurrentRegisterSession = async (): Promise<RegisterSession | null> => {
  const data = await request<RegisterSessionResponse>('/register/current')
  return data.session ? normalizeRegisterSession(data.session) : null
}

export const openRegisterSession = async (
  adminPin: string,
  openingCash: number,
  note = '',
): Promise<RegisterSession> => {
  const data = await request<RegisterSessionResponse>('/register/open', {
    method: 'POST',
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
    body: JSON.stringify({ openingCash, note, stationId: currentStationId() }),
  })

  if (!data.session) {
    throw new Error('Register session was not returned')
  }

  return normalizeRegisterSession(data.session)
}

export const closeRegisterSession = async (
  adminPin: string,
  closingCash: number,
  note = '',
  force = false,
): Promise<RegisterSession> => {
  const data = await request<RegisterSessionResponse>('/register/close', {
    method: 'POST',
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
    body: JSON.stringify({ closingCash, note, stationId: currentStationId(), force }),
  })

  if (!data.session) {
    throw new Error('Register session was not returned')
  }

  return normalizeRegisterSession(data.session)
}

export const createOrder = async (order: PosOrder): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: order.id,
      source: order.source,
      serviceMode: order.mode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      note: order.note,
      subtotal: order.subtotal,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      lines: order.lines.map((line) => ({
        productId: line.productId,
        productSku: line.productSku,
        name: line.name,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        options: line.options,
      })),
    }),
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
  adminPin: string,
  order: PosOrder,
  note = '',
): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/void`, {
    method: 'POST',
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
    body: JSON.stringify({ stationId: currentStationId(), note }),
  })

  return normalizeOrder(data.order)
}

export const refundOrder = async (
  adminPin: string,
  order: PosOrder,
  note = '',
): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/refund`, {
    method: 'POST',
    headers: {
      'X-POS-ADMIN-PIN': adminPin,
    },
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
