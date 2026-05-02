export type MenuCategory = 'coffee' | 'tea' | 'food' | 'retail'
export type ServiceMode = 'dine-in' | 'takeout' | 'delivery'
export type PaymentMethod = 'cash' | 'card' | 'line-pay' | 'jkopay' | 'transfer'
export type OrderSource = 'counter' | 'qr' | 'online'
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'failed' | 'voided'
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'expired' | 'failed' | 'refunded'
export type PrintStatus = 'queued' | 'printed' | 'skipped' | 'failed'
export type RegisterSessionStatus = 'open' | 'closed'

export interface MenuItem {
  id: string
  sku: string
  name: string
  category: MenuCategory
  price: number
  tags: string[]
  accent: string
  available: boolean
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

export interface CartLine {
  itemId: string
  productId?: string
  productSku: string
  category?: MenuCategory
  name: string
  unitPrice: number
  quantity: number
  options: string[]
  prepStation?: string
  printLabel?: boolean
}

export interface CustomerDraft {
  name: string
  phone: string
  deliveryAddress: string
  requestedFulfillmentAt: string
  note: string
}

export interface PosOrder {
  id: string
  remoteId?: string
  source: OrderSource
  mode: ServiceMode
  customerName: string
  customerPhone: string
  deliveryAddress: string
  requestedFulfillmentAt: string | null
  note: string
  lines: CartLine[]
  subtotal: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  status: OrderStatus
  createdAt: string
  claimedBy: string | null
  claimedAt: string | null
  claimExpiresAt: string | null
  printStatus: PrintStatus
  printJobs: PrintJob[]
}

export interface PrintJob {
  id: string
  status: PrintStatus
  printedAt: string | null
  createdAt: string
  attempts: number
  lastError: string | null
}

export interface RegisterSession {
  id: string
  status: RegisterSessionStatus
  openedAt: string
  closedAt: string | null
  openingCash: number
  closingCash: number | null
  expectedCash: number
  cashSales: number
  nonCashSales: number
  pendingTotal: number
  orderCount: number
  openOrderCount: number
  failedPaymentCount: number
  failedPrintCount: number
  voidedOrderCount: number
  note: string
}

export interface PrintStation {
  id?: string
  name: string
  host: string
  port: number
  protocol: string
  online: boolean
  autoPrint: boolean
  lastPrintAt: string | null
}

export type PrintLabelMode = 'receipt' | 'label' | 'both'

export interface PrintStationSetting {
  id: string
  name: string
  host: string
  port: number
  protocol: string
  enabled: boolean
  autoPrint: boolean
}

export interface PrintRuleSetting {
  id: string
  name: string
  serviceMode: ServiceMode
  stationId: string
  categories: MenuCategory[]
  copies: number
  labelMode: PrintLabelMode
  enabled: boolean
}

export interface PrinterSettings {
  stations: PrintStationSetting[]
  rules: PrintRuleSetting[]
}

export type AdminPermission =
  | 'manageProducts'
  | 'managePrinting'
  | 'managePayments'
  | 'manageReports'
  | 'manageCustomers'
  | 'manageAccess'
  | 'voidOrders'
  | 'closeRegister'

export interface RoleSetting {
  id: string
  name: string
  pinRequired: boolean
  permissions: AdminPermission[]
}

export interface AccessControlSettings {
  roles: RoleSetting[]
}

export interface OnlineOrderingSettings {
  enabled: boolean
  allowScheduledOrders: boolean
  averagePrepMinutes: number
  unconfirmedReminderMinutes: number
  soundEnabled: boolean
  pauseMessage: string
}

export interface PosAdminSettings {
  printerSettings: PrinterSettings
  accessControl: AccessControlSettings
  onlineOrdering: OnlineOrderingSettings
}

export type TransactionLedgerEntryType = 'top_up' | 'payment' | 'refund' | 'adjustment'

export interface TransactionLedgerEntry {
  id: string
  memberId: string | null
  orderId: string | null
  entryType: TransactionLedgerEntryType
  amount: number
  balanceAfter: number | null
  note: string
  createdAt: string
}

export interface PosMember {
  id: string
  lineUserId: string | null
  displayName: string
  walletBalance: number
  createdAt: string
  updatedAt: string
  ledger: TransactionLedgerEntry[]
}

export interface ReportBreakdownRow {
  key: string
  count: number
  total: number
}

export interface TopProductReportRow {
  sku: string
  name: string
  quantity: number
  total: number
}

export interface HourlyReportRow {
  hour: number
  count: number
  total: number
}

export interface DailySalesReport {
  date: string
  rangeStart: string
  rangeEnd: string
  totalOrders: number
  collectedOrders: number
  collectedTotal: number
  pendingTotal: number
  refundTotal: number
  averageTicket: number
  openOrderCount: number
  failedPaymentCount: number
  failedPrintCount: number
  voidedOrderCount: number
  byPaymentMethod: ReportBreakdownRow[]
  bySource: ReportBreakdownRow[]
  byServiceMode: ReportBreakdownRow[]
  byStatus: ReportBreakdownRow[]
  hourly: HourlyReportRow[]
  topProducts: TopProductReportRow[]
}

export interface PosAuditEvent {
  id: string
  action: string
  orderId: string | null
  registerSessionId: string | null
  stationId: string
  actor: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface PosPaymentEvent {
  id: string
  provider: string
  eventId: string
  orderId: string
  orderNumber: string
  eventType: string
  paymentStatus: PaymentStatus
  amount: number | null
  applied: boolean
  duplicate: boolean
  processedAt: string | null
  createdAt: string
}

export interface PosStationHeartbeat {
  stationId: string
  stationLabel: string
  platform: string
  appVersion: string
  userAgent: string
  lastSeenAt: string
  createdAt: string
}
