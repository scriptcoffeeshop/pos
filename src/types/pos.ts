export type MenuCategory = string
export type ServiceMode = 'dine-in' | 'takeout' | 'delivery'
export type PaymentMethod = 'cash' | 'card' | 'line-pay' | 'jkopay' | 'transfer'
export type OrderSource = 'counter' | 'qr' | 'online'
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'failed' | 'voided'
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'expired' | 'failed' | 'refunded'
export type PrintStatus = 'queued' | 'printed' | 'skipped' | 'failed'
export type RegisterSessionStatus = 'open' | 'closed'
export type RegisterCashAdjustmentKind = 'income' | 'expense'
export type ProductSupplyStatus = 'normal' | 'online-stopped' | 'stopped'
export type ReservationStatus = 'booked' | 'seated' | 'cancelled' | 'no_show'
export type HardwareDeviceKind = 'bluetooth-scanner' | 'payment-qr' | 'cash-drawer' | 'ipad-qr-print'
export type OnlineOrderReminderStatus = 'active' | 'snoozed' | 'seen'
export type OnlineOrderReminderAction = 'snooze' | 'seen' | 'accepted' | 'rejected'

export interface SupplyPeriodRule {
  id: string
  label: string
  days: number[]
  start: string
  end: string
}

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
  supplyPeriods: SupplyPeriodRule[]
  futureOrderAvailable: boolean
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
  printPaused?: boolean
}

export interface CustomerDraft {
  memberId: string | null
  name: string
  phone: string
  customerType: string
  pointsBalance: number
  availableCoupons: MemberCoupon[]
  deliveryAddress: string
  requestedFulfillmentAt: string
  note: string
}

export interface PosOrder {
  id: string
  remoteId?: string
  isDraft?: boolean
  source: OrderSource
  mode: ServiceMode
  customerName: string
  customerPhone: string
  deliveryAddress: string
  requestedFulfillmentAt: string | null
  memberId: string | null
  note: string
  lines: CartLine[]
  subtotal: number
  orderLabels: string[]
  serviceFeeRate: number
  serviceFeeAmount: number
  extraFeeAmount: number
  discountAmount: number
  pointsRedeemed: number
  couponCode: string
  memberPointsEarned: number
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

export interface OnlineOrderReminderState {
  orderId: string
  orderNumber: string
  status: OnlineOrderReminderStatus
  snoozedUntil: string | null
  snoozedByStationId: string
  seenAt: string | null
  seenByStationId: string
  lastAction: 'active' | OnlineOrderReminderAction
  createdAt: string
  updatedAt: string
}

export interface PrintJob {
  id: string
  status: PrintStatus
  printedAt: string | null
  createdAt: string
  attempts: number
  lastError: string | null
}

export interface RegisterCashAdjustment {
  id: string
  registerSessionId: string
  kind: RegisterCashAdjustmentKind
  reason: string
  amount: number
  note: string
  stationId: string
  createdAt: string
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
  cashAdjustmentIncome: number
  cashAdjustmentExpense: number
  pendingTotal: number
  orderCount: number
  openOrderCount: number
  failedPaymentCount: number
  failedPrintCount: number
  voidedOrderCount: number
  note: string
  cashAdjustments: RegisterCashAdjustment[]
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
  itemIds: string[]
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

export interface StaffAccountSetting {
  id: string
  name: string
  staffCode: string
  roleId: string
  active: boolean
}

export interface AccessControlSettings {
  roles: RoleSetting[]
  staffAccounts: StaffAccountSetting[]
}

export type TimeClockEventType = 'clock-in' | 'clock-out'

export interface StaffTimeClockEntry {
  id: string
  staffAccountId: string
  staffCode: string
  staffName: string
  roleId: string
  roleName: string
  eventType: TimeClockEventType
  stationId: string
  note: string
  createdAt: string
}

export interface OnlineMenuOptionChoice {
  id: string
  label: string
  priceDelta?: number
}

export interface OnlineMenuOptionGroup {
  id: string
  label: string
  requirement: string
  required: boolean
  min: number
  max: number
  choices: OnlineMenuOptionChoice[]
}

export interface OnlineMenuCategory {
  id: MenuCategory
  label: string
}

export type OnlineNotificationRepeatMode = 'once' | 'continuous'

export interface OnlineOrderingSettings {
  enabled: boolean
  allowScheduledOrders: boolean
  averagePrepMinutes: number
  unconfirmedReminderMinutes: number
  acceptanceRequired: boolean
  acceptWithoutPrinting: boolean
  soundEnabled: boolean
  notificationRepeatMode: OnlineNotificationRepeatMode
  notificationVolume: number
  pauseMessage: string
  menuCategories: OnlineMenuCategory[]
  availableOptionChoices: OnlineMenuOptionChoice[]
  menuOptionGroups: OnlineMenuOptionGroup[]
  productOptionAssignments: Record<string, string[]>
  noteSupplyStatuses: Record<string, ProductSupplyStatus>
}

export interface PosAppearanceSettings {
  interfaceScale: number
  densityScale: number
  textSize: number
  darkMode: boolean
  toolboxOpacity: number
}

export interface FloorLevelSetting {
  id: string
  label: string
}

export interface FloorTableSetting {
  id: string
  floorId: string
  label: string
  capacity: number
  x: number
  y: number
  width: number
}

export interface FloorDisplayPreferences {
  showPeople: boolean
  showUnsubmittedWait: boolean
  showTableStay: boolean
  showWaitlinePeople: boolean
  showWaitlineTime: boolean
  showOrderLabels: boolean
}

export interface WaitlineEntry {
  id: string
  name: string
  phone: string
  customerType: string
  partySize: number
  createdAt: string
  note: string
}

export interface FloorPlanSettings {
  floors: FloorLevelSetting[]
  activeFloorId: string
  tables: FloorTableSetting[]
  display: FloorDisplayPreferences
  partySizes: Record<string, number>
  waitline: WaitlineEntry[]
}

export interface OrderLabelSetting {
  id: string
  label: string
  color: string
}

export interface RecommendationRule {
  id: string
  trigger: string
  title: string
  productIds: string[]
  enabled: boolean
}

export interface TranslationSetting {
  locale: string
  label: string
  enabled: boolean
}

export interface HardwareDeviceSetting {
  id: string
  kind: HardwareDeviceKind
  name: string
  enabled: boolean
  targetStationId: string
}

export interface SupplyRulesSettings {
  preOpenCheckEnabled: boolean
  allowFutureOrdersAcrossDay: boolean
  defaultPeriods: SupplyPeriodRule[]
}

export interface CustomerEngagementSettings {
  orderLabels: OrderLabelSetting[]
  customerTypes: string[]
  defaultServiceFeeRate: number
  recommendations: RecommendationRule[]
  translations: TranslationSetting[]
  hardwareDevices: HardwareDeviceSetting[]
  supplyRules: SupplyRulesSettings
}

export interface PosAdminSettings {
  printerSettings: PrinterSettings
  accessControl: AccessControlSettings
  onlineOrdering: OnlineOrderingSettings
  posAppearance: PosAppearanceSettings
  floorPlan: FloorPlanSettings
  engagementSettings: CustomerEngagementSettings
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
  phone: string
  customerType: string
  pointsBalance: number
  walletBalance: number
  createdAt: string
  updatedAt: string
  ledger: TransactionLedgerEntry[]
  coupons: MemberCoupon[]
}

export interface MemberCoupon {
  id: string
  memberId: string | null
  code: string
  title: string
  discountAmount: number
  discountPercent: number
  status: 'active' | 'redeemed' | 'expired'
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PosReservation {
  id: string
  customerName: string
  customerPhone: string
  partySize: number
  reservedAt: string
  status: ReservationStatus
  importantLabel: string
  preOrder: CartLine[]
  note: string
  createdAt: string
  updatedAt: string
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
