export type MenuCategory = string
export type ServiceMode = 'dine-in' | 'takeout' | 'delivery'
export type PaymentMethod = 'cash' | 'card' | 'custom' | 'app91-card' | 'line-pay' | 'jkopay' | 'transfer'
export type PaymentAllocationStatus = 'open' | 'paid'
export type PaymentSplitStatus = 'open' | 'paid'
export type OrderSource = 'counter' | 'qr' | 'online'
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'failed' | 'voided'
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'expired' | 'failed' | 'refunded'
export type PrintStatus = 'queued' | 'printed' | 'skipped' | 'failed'
export type RegisterSessionStatus = 'open' | 'closed'
export type RegisterCashAdjustmentKind = 'income' | 'expense'
export type CashDrawerDeliveryStatus = 'sent' | 'preview' | 'failed'
export type ProductSupplyStatus = 'normal' | 'online-stopped' | 'stopped'
export type ReservationStatus = 'booked' | 'reminded' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'
export type HardwareDeviceKind = 'bluetooth-scanner' | 'payment-qr' | 'cash-drawer' | 'ipad-qr-print'
export type OnlineOrderReminderStatus = 'active' | 'snoozed' | 'seen'
export type OnlineOrderReminderAction = 'snooze' | 'seen' | 'accepted' | 'rejected'
export type OnlineDineInCheckoutMode = 'prepaid' | 'postpaid'
export type OnlineItemCommentMode = 'hidden' | 'shown'
export type OnlineOrderCommentMode = 'hidden' | 'optional' | 'required'
export type OnlineTableQrTheme = 'black' | 'green' | 'orange' | 'yellow' | 'purple'
export type OnlineWebsiteThemeColor = 'classic' | 'green' | 'orange' | 'yellow' | 'purple' | 'blue' | 'rose' | 'brown' | 'slate'
export type OnlineMenuDisplayMode = 'list' | 'grid'
export type InventoryRecordAction = 'purchase' | 'return' | 'consumption' | 'scrapped' | 'count'
export type InventoryConsumptionSubject = 'product' | 'option'
export type DiscountCampaignKind = 'automatic' | 'manual'
export type DiscountCampaignScope = 'whole-order' | 'categories' | 'products'
export type DiscountValueType = 'amount' | 'percentage'
export type ProductTaxCategory = 'taxable' | 'zero' | 'exempt'
export type ElectronicInvoiceStatus = 'not_requested' | 'queued' | 'issued' | 'voided' | 'refunded' | 'failed'
export type ElectronicInvoicePrintMode = 'paper' | 'carrier' | 'donation' | 'none'

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
  barcode: string
  name: string
  category: MenuCategory
  price: number
  taxCategory: ProductTaxCategory
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
  taxCategory: ProductTaxCategory
  name: string
  unitPrice: number
  quantity: number
  options: string[]
  comboItems?: ComboLineItem[]
  prepStation?: string
  printLabel?: boolean
  printPaused?: boolean
  orderItemId?: string
  fulfilledAt?: string | null
  fulfilledByStationId?: string
}

export interface ComboLineItem {
  groupId: string
  groupLabel: string
  productId: string
  productSku: string
  name: string
  quantity: number
  priceDelta: number
  options?: string[]
}

export interface PaymentSplit {
  id: string
  label: string
  amount: number
  lineKeys: string[]
  paymentMethod: PaymentMethod
  status: PaymentSplitStatus
  paidAt: string | null
}

export interface PaymentAllocation {
  id: string
  paymentMethod: PaymentMethod
  amount: number
  status: PaymentAllocationStatus
  paidAt: string | null
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
  taxId: string
  invoiceCarrierBarcode: string
  invoiceDonationCode: string
  zeroTaxSalesReason: string
  electronicInvoiceRequested: boolean
  electronicInvoicePrintMode: ElectronicInvoicePrintMode
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
  taxId: string
  invoiceCarrierBarcode: string
  invoiceDonationCode: string
  zeroTaxSalesReason: string
  electronicInvoiceRequested: boolean
  electronicInvoiceStatus: ElectronicInvoiceStatus
  electronicInvoicePrintMode: ElectronicInvoicePrintMode
  electronicInvoiceNumber: string
  electronicInvoiceRandomCode: string
  electronicInvoiceIssuedAt: string | null
  electronicInvoiceVoidedAt: string | null
  electronicInvoiceUploadDueAt: string | null
  memberId: string | null
  customerNote: string
  staffNote: string
  note: string
  paymentNote: string
  qrSessionOrderId?: string | null
  qrSessionStartedAt?: string | null
  lines: CartLine[]
  subtotal: number
  orderLabels: string[]
  serviceFeeRate: number
  serviceFeeAmount: number
  extraFeeAmount: number
  discountAmount: number
  pointsRedeemed: number
  couponCode: string
  paymentSplits: PaymentSplit[]
  paymentBreakdown: PaymentAllocation[]
  transactionReceiptCount: number
  memberPointsEarned: number
  registerSessionId?: string | null
  checkoutStationId?: string
  checkoutBookId?: string
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

export interface CashDrawerEvent {
  id: string
  stationId: string
  registerSessionId: string | null
  reason: string
  deviceId: string
  targetStationId: string
  printerHost: string
  printerPort: number
  deliveryStatus: CashDrawerDeliveryStatus
  errorMessage: string
  createdAt: string
}

export interface InventoryCategory {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface InventoryItem {
  id: string
  categoryId: string
  name: string
  unit: string
  defaultUnitCost: number
  stockQuantity: number
  lowStockQuantity: number | null
  note: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface InventoryRecord {
  id: string
  itemId: string
  action: InventoryRecordAction
  quantity: number
  quantityDelta: number
  quantityAfter: number
  unitCost: number
  totalCost: number
  note: string
  stationId: string
  createdAt: string
}

export interface InventoryConsumptionRule {
  id: string
  subjectType: InventoryConsumptionSubject
  productId: string | null
  optionLabel: string
  itemId: string
  quantity: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface RegisterSession {
  id: string
  status: RegisterSessionStatus
  bookId: string
  bookName: string
  stationId: string
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
export type PrintRuleTiming = 'order' | 'reprint' | 'move' | 'merge'

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
  timings: PrintRuleTiming[]
  categories: MenuCategory[]
  itemIds: string[]
  countExcludedCategories: MenuCategory[]
  countExcludedItemIds: string[]
  copies: number
  labelMode: PrintLabelMode
  enabled: boolean
}

export interface PrinterSettings {
  stations: PrintStationSetting[]
  rules: PrintRuleSetting[]
}

export type AdminPermission =
  | 'openOrders'
  | 'sendOrdersToKitchen'
  | 'transferOrders'
  | 'deleteOrders'
  | 'deleteOrderItems'
  | 'useVariablePriceNotes'
  | 'checkoutOrders'
  | 'adjustServiceCharges'
  | 'applyManualDiscounts'
  | 'sendDailyReports'
  | 'manageProducts'
  | 'manageSupplyQuantityStatus'
  | 'managePrinting'
  | 'managePayments'
  | 'manageReports'
  | 'manageCustomers'
  | 'manageAccess'
  | 'manageOnlineOrders'
  | 'cancelOnlineOrders'
  | 'manageOnlineAvailability'
  | 'manageReservations'
  | 'manageCashDrawer'
  | 'viewCurrentSales'
  | 'voidOrders'
  | 'refundOrders'
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
  reportEmail: string
}

export interface AccessControlSettings {
  roles: RoleSetting[]
  staffAccounts: StaffAccountSetting[]
  protectedPermissions: AdminPermission[]
}

export interface AccessControlPolicy {
  protectedPermissions: AdminPermission[]
}

export interface StaffPermissionVerification {
  verified: boolean
  permission: AdminPermission
  staff: {
    id: string
    name: string
    roleId: string
    roleName: string
  }
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

export interface ComboProductChoice {
  productId: string
  priceDelta: number
}

export interface ComboProductGroup {
  id: string
  label: string
  requirement: string
  required: boolean
  min: number
  max: number
  allowRepeat: boolean
  choices: ComboProductChoice[]
}

export type ComboProductAssignments = Record<string, ComboProductGroup[]>

export interface OnlineMenuCategory {
  id: MenuCategory
  label: string
}

export type OnlineNotificationRepeatMode = 'once' | 'continuous'

export type OnlineServiceModeAvailability = Record<ServiceMode, boolean>

export interface OnlinePaymentMethodSetting {
  id: PaymentMethod
  label: string
  enabled: boolean
  opensCashDrawer: boolean
}

export interface OnlineScheduledOrderTimeWindow {
  id: string
  label: string
  days: number[]
  start: string
  end: string
  allDay: boolean
}

export interface OnlineDineInTimeLimitRule {
  id: string
  label: string
  days: number[]
  mealMinutes: number
  lastOrderBeforeEndMinutes: number
}

export interface OnlineDineInTimeLimitSettings {
  enabled: boolean
  mealMinutes: number
  lastOrderBeforeEndMinutes: number
  holidayRules: OnlineDineInTimeLimitRule[]
}

export interface OnlineDineInCheckoutSettings {
  mode: OnlineDineInCheckoutMode
}

export interface OnlineCommentFieldSettings {
  itemNotes: OnlineItemCommentMode
  orderNote: OnlineOrderCommentMode
  orderNotePlaceholder: string
}

export interface OnlineTableQrCodeSettings {
  theme: OnlineTableQrTheme
  logoText: string
  logoDataUrl: string
}

export interface OnlineStoreProfileSettings {
  name: string
  phone: string
  address: string
  notice: string
  noticeExpanded: boolean
  coverImageDataUrls: string[]
}

export interface OnlineGoogleBusinessProfileSettings {
  connected: boolean
  businessName: string
  category: string
  phone: string
  address: string
  profileUrl: string
  placeId: string
  menuUrl: string
  orderUrl: string
  businessHoursNote: string
  menuPhotoDataUrls: string[]
}

export interface OnlineLineOfficialAccountSettings {
  connected: boolean
  officialAccountId: string
  displayName: string
  profileUrl: string
  orderEntryUrl: string
  liffId: string
  channelId: string
  orderStatusNotifications: boolean
  marketingAudienceEnabled: boolean
  messageQuotaNote: string
}

export interface OnlineWebsiteAppearanceSettings {
  themeColor: OnlineWebsiteThemeColor
  defaultMenuDisplay: OnlineMenuDisplayMode
}

export interface OnlineMemberPortalSettings {
  enabled: boolean
  requireLoginForTakeoutDelivery: boolean
  requireLoginForDineInQr: boolean
}

export interface OnlineAiMenuTranslationSettings {
  enabled: boolean
}

export interface OnlineNotificationStationSettings {
  stationId: string
  stationLabel: string
  enabled: boolean
  serviceModes: OnlineServiceModeAvailability
  tableIds: string[]
  soundEnabled: boolean
  notificationRepeatMode: OnlineNotificationRepeatMode
  notificationVolume: number
}

export interface OnlineNotificationRoutingSettings {
  stations: OnlineNotificationStationSettings[]
}

export interface OnlineOrderingSettings {
  enabled: boolean
  serviceModeAvailability: OnlineServiceModeAvailability
  allowScheduledOrders: boolean
  scheduledOrderIntervalMinutes: number
  scheduledOrderMaxDays: number
  scheduledOrderTimeWindows: OnlineScheduledOrderTimeWindow[]
  averagePrepMinutes: number
  unconfirmedReminderMinutes: number
  acceptanceRequired: boolean
  acceptWithoutPrinting: boolean
  soundEnabled: boolean
  notificationRepeatMode: OnlineNotificationRepeatMode
  notificationVolume: number
  checkoutInstructions: string
  showTaxIdField: boolean
  showCarrierBarcodeField: boolean
  showDonationCodeField: boolean
  paymentMethods: OnlinePaymentMethodSetting[]
  deliveryFeeAmount: number
  deliveryMinimumSubtotal: number
  freeDeliveryThreshold: number
  deliveryTravelMinutes: number
  sessionQrCode: {
    autoPrint: boolean
    stationId: string
    logoText: string
  }
  dineInTimeLimit: OnlineDineInTimeLimitSettings
  dineInCheckout: OnlineDineInCheckoutSettings
  commentFields: OnlineCommentFieldSettings
  tableQrCode: OnlineTableQrCodeSettings
  storeProfile: OnlineStoreProfileSettings
  googleBusinessProfile: OnlineGoogleBusinessProfileSettings
  lineOfficialAccount: OnlineLineOfficialAccountSettings
  websiteAppearance: OnlineWebsiteAppearanceSettings
  memberPortal: OnlineMemberPortalSettings
  aiMenuTranslation: OnlineAiMenuTranslationSettings
  notificationRouting: OnlineNotificationRoutingSettings
  pauseMessage: string
  menuCategories: OnlineMenuCategory[]
  availableOptionChoices: OnlineMenuOptionChoice[]
  menuOptionGroups: OnlineMenuOptionGroup[]
  productOptionAssignments: Record<string, string[]>
  comboProductAssignments: ComboProductAssignments
  noteSupplyStatuses: Record<string, ProductSupplyStatus>
}

export interface DiscountCampaignSchedule {
  enabled: boolean
  days: number[]
  start: string
  end: string
  allDay: boolean
}

export interface DiscountCampaignUsage {
  posEnabled: boolean
  posAutoApply: boolean
  onlineEnabled: boolean
  requiresVerification: boolean
}

export interface DiscountCampaign {
  id: string
  name: string
  kind: DiscountCampaignKind
  scope: DiscountCampaignScope
  valueType: DiscountValueType
  discountValue: number
  minimumSubtotal: number
  enabled: boolean
  sortOrder: number
  serviceModes: ServiceMode[]
  categories: MenuCategory[]
  productIds: string[]
  schedule: DiscountCampaignSchedule
  usage: DiscountCampaignUsage
}

export interface DiscountSettings {
  campaigns: DiscountCampaign[]
}

export interface DiscountApplication {
  campaignId: string
  campaignName: string
  amount: number
  kind: DiscountCampaignKind
  valueType: DiscountValueType
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

export interface FloorTableHoldSetting {
  id: string
  tableId: string
  startedAt: string
  expiresAt: string | null
  durationMinutes: number | null
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
  orderId?: string
}

export interface FloorPlanSettings {
  floors: FloorLevelSetting[]
  activeFloorId: string
  tables: FloorTableSetting[]
  display: FloorDisplayPreferences
  partySizes: Record<string, number>
  waitline: WaitlineEntry[]
  tableHolds: FloorTableHoldSetting[]
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

export interface ReservationBusinessHour {
  id: string
  day: number
  enabled: boolean
  start: string
  end: string
}

export type ReservationSpecialDateMode = 'closed' | 'custom-hours'

export interface ReservationSpecialDateRule {
  id: string
  label: string
  startDate: string
  endDate: string
  mode: ReservationSpecialDateMode
  start: string
  end: string
}

export interface ReservationWebsiteSettings {
  enabled: boolean
  restaurantName: string
  phone: string
  address: string
  announcement: string
  minPartySize: number
  maxPartySize: number
  slotMinutes: number
  durationMinutes: number
  seatHoldMinutes: number
  leadMinutes: number
  bookingWindowDays: number
  allowTableCombinations: boolean
  onlineTableIds: string[]
  businessHours: ReservationBusinessHour[]
  specialDates: ReservationSpecialDateRule[]
}

export interface ProductTotalDisplaySettings {
  enabled: boolean
  excludedCategories: MenuCategory[]
  excludedItemIds: string[]
}

export interface LoyaltyPointSettings {
  enabled: boolean
  earningEnabled: boolean
  redeemEnabled: boolean
  spendAmountPerPoint: number
  minimumRedeemPoints: number
  maximumRedeemPointsPerOrder: number
}

export interface FlyDoveSmsMarketingSettings {
  enabled: boolean
  apiTokenConfigured: boolean
  accountName: string
  audienceNamePrefix: string
  defaultMessageTemplate: string
  complianceNote: string
}

export type MemberAudienceExecutionMode = 'excel' | 'flydove' | 'line-oa'

export interface MemberAudienceRuleSetting {
  id: string
  name: string
  executionMode: MemberAudienceExecutionMode
  keyword: string
  customerType: string
  minPoints: number
  requireActiveCoupon: boolean
  requireLineBinding: boolean
  productSku: string
  productDays: number
  minSpend: number
  spendDays: number
  lastVisitDays: number
  minOrderCount: number
  orderCountDays: number
  updatedAt: string | null
  lastPreviewedAt: string | null
  lastPreviewCount: number
}

export interface MemberAudiencePreviewSummary {
  totalCount: number
  phoneReadyCount: number
  lineReadyCount: number
  excelCount: number
  previewedAt: string
  appliedFilters: string[]
}

export interface MemberAudiencePreview {
  members: PosMember[]
  summary: MemberAudiencePreviewSummary
}

export interface CheckoutCounterBookSetting {
  id: string
  name: string
  stationIds: string[]
  printStationId: string
  cashDrawerDeviceId: string
  paymentDeviceIds: string[]
  enabled: boolean
}

export interface CheckoutCounterSettings {
  enabled: boolean
  defaultBookId: string
  books: CheckoutCounterBookSetting[]
}

export interface ElectronicInvoiceSettings {
  enabled: boolean
  defaultIssueOnCheckout: boolean
  allowManualIssueToggle: boolean
  defaultPrintPaper: boolean
  uploadDeadlineHours: number
}

export interface WorkflowAlertSettings {
  todayOrderStartTime: string
  todayOrderEndTime: string
  fulfillmentDueSoonMinutes: number
  defaultTakeoutPickupMinutes: number
  fulfillmentConfirmationEnabled: boolean
  scheduledPickupReminderEnabled: boolean
  waitlineWaitWarningEnabled: boolean
  waitlineWaitWarningMinutes: number
  dineInUnprintedWarningEnabled: boolean
  dineInUnprintedWarningMinutes: number
  dineInFulfillmentWarningEnabled: boolean
  dineInFulfillmentWarningMinutes: number
  dineInDwellWarningEnabled: boolean
  dineInDwellWarningMinutes: number
  takeoutUnprintedWarningEnabled: boolean
  takeoutUnprintedWarningMinutes: number
  takeoutFulfillmentWarningEnabled: boolean
  takeoutFulfillmentWarningMinutes: number
  takeoutWaitWarningEnabled: boolean
  takeoutWaitWarningMinutes: number
  takeoutLoopEnabled: boolean
  dineInAutoExitEnabled: boolean
  takeoutAutoExitEnabled: boolean
}

export interface OrderPageDisplaySettings {
  noteColumns: number
}

export type ServiceChargeDiscountBasis = 'before-discount' | 'after-discount'

export interface ServiceChargeSettings {
  enabled: boolean
  label: string
  dineInRate: number
  takeoutRate: number
  deliveryRate: number
  discountBasis: ServiceChargeDiscountBasis
  excludedCategories: MenuCategory[]
  excludedItemIds: string[]
}

export interface PosAppOperationSettings {
  hostStationId: string
  childStationIds: string[]
  maxChildStations: number
}

export interface CustomerEngagementSettings {
  orderLabels: OrderLabelSetting[]
  customerTypes: string[]
  defaultServiceFeeRate: number
  serviceCharge: ServiceChargeSettings
  productTotalDisplay: ProductTotalDisplaySettings
  loyaltyPoints: LoyaltyPointSettings
  checkoutCounters: CheckoutCounterSettings
  appOperation: PosAppOperationSettings
  electronicInvoice: ElectronicInvoiceSettings
  workflowAlerts: WorkflowAlertSettings
  orderPageDisplay: OrderPageDisplaySettings
  flyDoveSmsMarketing: FlyDoveSmsMarketingSettings
  memberAudiences: MemberAudienceRuleSetting[]
  recommendations: RecommendationRule[]
  translations: TranslationSetting[]
  hardwareDevices: HardwareDeviceSetting[]
  supplyRules: SupplyRulesSettings
  reservationWebsite: ReservationWebsiteSettings
}

export interface PosAdminSettings {
  printerSettings: PrinterSettings
  accessControl: AccessControlSettings
  onlineOrdering: OnlineOrderingSettings
  discountSettings: DiscountSettings
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

export interface MemberFavoriteProductAnalysis {
  productSku: string
  name: string
  quantity: number
  orderCount: number
  totalAmount: number
}

export interface MemberSalesAnalysis {
  totalOrders: number
  totalSpent: number
  averageSpent: number
  averageCycleDays: number | null
  firstConsumedAt: string | null
  lastConsumedAt: string | null
  favoriteProducts: MemberFavoriteProductAnalysis[]
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
  analysis: MemberSalesAnalysis
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
  redeemedOrderId: string | null
  redeemedAt: string | null
  redemptionStationId: string
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
  assignedTableIds: string[]
  preOrder: CartLine[]
  customerNote: string
  staffNote: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface ReservationBlacklistEntry {
  id: string
  phone: string
  normalizedPhone: string
  customerName: string
  reason: string
  note: string
  isActive: boolean
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

export type ProductSalesReportTimeUnit = 'day' | 'week' | 'month'

export type NoteAnalysisReportTimeUnit = 'day' | 'week' | 'month'

export type DiscountAnalysisReportTimeUnit = 'day' | 'week' | 'month'

export type ServiceChargeReportTimeUnit = 'day' | 'week' | 'month'

export type DiscountAnalysisActivityType = 'merchant-discount' | 'coupon'

export interface ProductSalesCategoryReportRow {
  category: string
  orderCount: number
  quantity: number
  total: number
  averagePrice: number
  selectionRate: number
  salesShare: number
}

export interface ProductSalesProductReportRow {
  key: string
  sku: string
  name: string
  category: string
  orderCount: number
  quantity: number
  total: number
  averagePrice: number
  selectionRate: number
  salesShare: number
}

export interface ProductSalesComboReportRow {
  key: string
  parentSku: string
  parentName: string
  groupLabel: string
  sku: string
  name: string
  quantity: number
  priceDeltaTotal: number
}

export interface ProductSalesTrendReportRow {
  key: string
  label: string
  orderCount: number
  partySize: number
  quantity: number
  total: number
}

export interface ProductSalesReportSummary {
  totalOrders: number
  totalPartySize: number
  totalQuantity: number
  totalSales: number
  averageTicket: number
  averageItemPrice: number
}

export interface ProductSalesReport {
  startDate: string
  endDate: string
  rangeStart: string
  rangeEnd: string
  timeUnit: ProductSalesReportTimeUnit
  summary: ProductSalesReportSummary
  categories: ProductSalesCategoryReportRow[]
  products: ProductSalesProductReportRow[]
  comboSelections: ProductSalesComboReportRow[]
  trend: ProductSalesTrendReportRow[]
}

export interface NoteAnalysisReportRow {
  key: string
  noteName: string
  clickCount: number
  priceDeltaTotal: number
  noteRate: number
  productCount: number
}

export interface NoteAnalysisProductReportRow {
  key: string
  noteName: string
  productKey: string
  sku: string
  name: string
  category: string
  clickCount: number
  priceDeltaTotal: number
  noteRate: number
}

export interface NoteAnalysisTrendReportRow {
  key: string
  label: string
  clickCount: number
  priceDeltaTotal: number
}

export interface NoteAnalysisReportSummary {
  totalOrders: number
  totalPartySize: number
  totalSelections: number
  totalPriceDelta: number
  averageSelectionsPerOrder: number
}

export interface NoteAnalysisReport {
  startDate: string
  endDate: string
  rangeStart: string
  rangeEnd: string
  timeUnit: NoteAnalysisReportTimeUnit
  summary: NoteAnalysisReportSummary
  notes: NoteAnalysisReportRow[]
  products: NoteAnalysisProductReportRow[]
  trend: NoteAnalysisTrendReportRow[]
}

export interface DiscountAnalysisActivityReportRow {
  key: string
  activityName: string
  activityType: DiscountAnalysisActivityType
  orderCount: number
  discountedSales: number
  salesShare: number
  discountAmount: number
  posSales: number
  onlineSales: number
  qrSales: number
}

export interface DiscountAnalysisTrendReportRow {
  key: string
  label: string
  orderCount: number
  discountedSales: number
  discountAmount: number
}

export interface DiscountAnalysisReportSummary {
  totalOrders: number
  totalNetSales: number
  discountOrderCount: number
  discountOrderSales: number
  discountSalesShare: number
  totalDiscountAmount: number
  averageDiscountPerOrder: number
}

export interface DiscountAnalysisReport {
  startDate: string
  endDate: string
  rangeStart: string
  rangeEnd: string
  timeUnit: DiscountAnalysisReportTimeUnit
  summary: DiscountAnalysisReportSummary
  activities: DiscountAnalysisActivityReportRow[]
  trend: DiscountAnalysisTrendReportRow[]
}

export interface ServiceChargeBreakdownReportRow {
  key: string
  orderCount: number
  serviceChargeOrderCount: number
  serviceChargeTotal: number
  averageServiceCharge: number
}

export interface ServiceChargeTrendReportRow {
  key: string
  label: string
  orderCount: number
  partySize: number
  serviceChargeOrderCount: number
  serviceChargeTotal: number
  averageServiceCharge: number
}

export interface ServiceChargeReportSummary {
  totalOrders: number
  totalPartySize: number
  serviceChargeOrderCount: number
  totalServiceCharge: number
  averageServiceChargePerServiceOrder: number
  averageServiceChargePerOrder: number
}

export interface ServiceChargeReport {
  startDate: string
  endDate: string
  rangeStart: string
  rangeEnd: string
  timeUnit: ServiceChargeReportTimeUnit
  summary: ServiceChargeReportSummary
  byServiceMode: ServiceChargeBreakdownReportRow[]
  bySource: ServiceChargeBreakdownReportRow[]
  trend: ServiceChargeTrendReportRow[]
}

export interface ElectronicInvoiceReportRow {
  orderId: string
  orderNumber: string
  checkoutAt: string
  source: OrderSource
  serviceMode: ServiceMode
  partySize: number
  carrierOrDonationCode: string
  taxId: string
  salesAmount: number
  taxAmount: number
  zeroTaxSalesAmount: number
  zeroTaxSalesReason: string
  taxExemptSalesAmount: number
  totalAmount: number
  status: ElectronicInvoiceStatus
  printMode: ElectronicInvoicePrintMode
  invoiceNumber: string
  randomCode: string
  uploadDueAt: string | null
}

export interface ElectronicInvoiceReportSummary {
  totalRecords: number
  issuedRecords: number
  voidedRecords: number
  refundedRecords: number
  queuedRecords: number
  failedRecords: number
  totalSalesAmount: number
  totalTaxAmount: number
  totalAmount: number
}

export interface ElectronicInvoiceReport {
  startDate: string
  endDate: string
  rangeStart: string
  rangeEnd: string
  summary: ElectronicInvoiceReportSummary
  rows: ElectronicInvoiceReportRow[]
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

export type CloseoutReportDeliveryStatus = 'queued' | 'sent' | 'failed' | 'skipped'

export interface CloseoutReportDelivery {
  id: string
  registerSessionId: string
  recipientStaffId: string
  recipientName: string
  recipientEmail: string
  status: CloseoutReportDeliveryStatus
  subject: string
  deliveryProvider: string
  errorMessage: string
  sentAt: string | null
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
