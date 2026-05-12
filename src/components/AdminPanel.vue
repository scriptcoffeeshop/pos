<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Printer,
  RefreshCw,
  ReceiptText,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Trash2,
  UserPlus,
  Wallet,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { categoryLabels } from '../data/menu'
import { defaultDiscountSettings, normalizeDiscountSettings } from '../lib/discounts'
import {
  defaultDineInTimeLimitHolidayRule,
  defaultDineInTimeLimitSettings,
  normalizeDineInTimeLimitSettings,
} from '../lib/dineInTimeLimit'
import { formatCurrency } from '../lib/formatters'
import {
  downloadTableQrCardsHtml,
  tableQrThemeOptions,
  type TableQrCardSource,
} from '../lib/tableQrCards'
import {
  adjustMemberWallet,
  createAdminMember,
  createAdminCoupon,
  createAdminReservation,
  createAdminReservationBlacklistEntry,
  createInventoryConsumptionRule,
  defaultEngagementSettings,
  defaultFloorPlanSettings,
  fetchAdminAuditEvents,
  fetchAdminCloseoutReportDeliveries,
  fetchAdminCoupons,
  fetchAdminDailyReport,
  fetchAdminInventory,
  fetchAdminMembers,
  fetchAdminPaymentEvents,
  fetchAdminReservationBlacklist,
  fetchAdminProducts,
  fetchAdminReservations,
  fetchAdminSettings,
  fetchAdminStations,
  fetchAdminTimeClockEntries,
  type ProductUpdateInput,
  type InventoryConsumptionRuleInput,
  updateAdminSetting,
  updateAdminReservationBlacklistEntry,
  updateAdminReservation,
  updateInventoryConsumptionRule,
  updateProduct,
} from '../lib/posApi'
import type {
  AccessControlSettings,
  AdminPermission,
  CloseoutReportDelivery,
  CustomerEngagementSettings,
  DailySalesReport,
  DiscountCampaign,
  DiscountSettings,
  FloorPlanSettings,
  InventoryConsumptionRule,
  InventoryItem,
  MemberCoupon,
  MenuCategory,
  MenuItem,
  OnlineOrderingSettings,
  OnlineDineInTimeLimitRule,
  OnlineScheduledOrderTimeWindow,
  PrinterSettings,
  PosAuditEvent,
  PosMember,
  PosPaymentEvent,
  PosReservation,
  ReservationBlacklistEntry,
  ReservationSpecialDateRule,
  PosStationHeartbeat,
  PrintLabelMode,
  PrintRuleSetting,
  PrintRuleTiming,
  RoleSetting,
  ServiceMode,
  ReservationStatus,
  StaffAccountSetting,
  StaffTimeClockEntry,
} from '../types/pos'

interface ProductDraft extends MenuItem {
  tagsText: string
  soldOutUntilInput: string
}

interface MemberDraft {
  lineUserId: string
  displayName: string
  phone: string
  customerType: string
  pointsBalance: number
  openingBalance: number
  note: string
}

interface CouponDraft {
  memberId: string
  code: string
  title: string
  discountAmount: number
  discountPercent: number
  expiresAt: string
}

interface ReservationDraft {
  customerName: string
  customerPhone: string
  partySize: number
  reservedAt: string
  importantLabel: string
  note: string
}

interface ReservationBlacklistDraft {
  phone: string
  customerName: string
  reason: string
  note: string
}

interface WalletAdjustmentDraft {
  amount: number
  note: string
}

interface InventoryConsumptionDraft {
  itemId: string
  quantity: number
}

interface OptionConsumptionDraft extends InventoryConsumptionDraft {
  optionLabel: string
}

type AdminTab =
  | 'products'
  | 'online'
  | 'discounts'
  | 'members'
  | 'ichef'
  | 'reports'
  | 'payments'
  | 'printing'
  | 'access'
  | 'operations'
  | 'audit'
  | 'stations'
type PaymentEventStatusFilter = 'all' | 'applied' | 'duplicate' | 'unapplied'
type OperationTimelineKind = 'audit' | 'register' | 'station'
type OperationTimelineFilter = 'all' | OperationTimelineKind

interface OperationTimelineEntry {
  id: string
  kind: OperationTimelineKind
  title: string
  subject: string
  stationId: string
  actor: string
  summary: string
  statusLabel: string
  statusClass: string
  createdAt: string
  searchableText: string
}

const emit = defineEmits<{
  refreshPos: []
}>()

const adminTabs: Array<{ value: AdminTab; label: string }> = [
  { value: 'products', label: '商品菜單' },
  { value: 'online', label: '線上點餐' },
  { value: 'discounts', label: '優惠活動' },
  { value: 'members', label: '會員錢包' },
  { value: 'ichef', label: 'iCHEF 補齊' },
  { value: 'reports', label: '營運報表' },
  { value: 'payments', label: '支付事件' },
  { value: 'printing', label: '出單規則' },
  { value: 'access', label: '權限' },
  { value: 'operations', label: '營運紀錄' },
  { value: 'stations', label: '平板' },
  { value: 'audit', label: '稽核' },
]

const categoryOptions: Array<{ value: 'all' | MenuCategory; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: categoryLabels.coffee ?? '咖啡' },
  { value: 'tea', label: categoryLabels.tea ?? '茶飲' },
  { value: 'food', label: categoryLabels.food ?? '輕食' },
  { value: 'retail', label: categoryLabels.retail ?? '零售' },
]
const reservationWeekdayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

const menuCategoryOptions = categoryOptions.filter((category): category is { value: MenuCategory; label: string } =>
  category.value !== 'all',
)

const serviceModeOptions: Array<{ value: ServiceMode; label: string }> = [
  { value: 'takeout', label: '外帶' },
  { value: 'dine-in', label: '內用' },
  { value: 'delivery', label: '外送' },
]

const labelModeOptions: Array<{ value: PrintLabelMode; label: string }> = [
  { value: 'label', label: '貼紙' },
  { value: 'receipt', label: '收據' },
  { value: 'both', label: '貼紙+收據' },
]

const printRuleTimingOptions: Array<{ value: PrintRuleTiming; label: string }> = [
  { value: 'order', label: '出單' },
  { value: 'reprint', label: '重印' },
  { value: 'move', label: '移桌' },
  { value: 'merge', label: '併單' },
]

const defaultPrintRuleTimings: PrintRuleTiming[] = ['order', 'reprint']

const permissionOptions: Array<{ value: AdminPermission; label: string }> = [
  { value: 'openOrders', label: '開單' },
  { value: 'sendOrdersToKitchen', label: '出單至廚房' },
  { value: 'transferOrders', label: '轉單' },
  { value: 'deleteOrders', label: '刪單' },
  { value: 'deleteOrderItems', label: '刪品項' },
  { value: 'useVariablePriceNotes', label: '變價註記' },
  { value: 'checkoutOrders', label: '結帳' },
  { value: 'adjustServiceCharges', label: '服務費/其他費用' },
  { value: 'applyManualDiscounts', label: '手動折扣' },
  { value: 'sendDailyReports', label: '日結報表寄送' },
  { value: 'manageProducts', label: '商品' },
  { value: 'managePrinting', label: '出單' },
  { value: 'managePayments', label: '支付' },
  { value: 'manageReports', label: '報表' },
  { value: 'manageCustomers', label: '顧客' },
  { value: 'manageAccess', label: '權限' },
  { value: 'manageOnlineOrders', label: '線上接單' },
  { value: 'cancelOnlineOrders', label: '取消線上訂單' },
  { value: 'manageOnlineAvailability', label: '線上營業狀態' },
  { value: 'manageReservations', label: '訂位' },
  { value: 'manageCashDrawer', label: '錢櫃' },
  { value: 'viewCurrentSales', label: '目前營業概況' },
  { value: 'voidOrders', label: '作廢' },
  { value: 'refundOrders', label: '退款' },
  { value: 'closeRegister', label: '關帳' },
]

const auditActionLabels: Record<string, string> = {
  'access.verify': '權限驗證',
  'register.open': '開班',
  'register.close': '關班',
  'register.close_report.delivery': '關帳信寄送',
  'register.cash_adjustment': '現金臨時收支',
  'employee.time_clock': '員工打卡',
  'product.update': '商品更新',
  'setting.update': '設定更新',
  'inventory.consumption_rule.create': '庫存消耗規則',
  'inventory.consumption_rule.update': '庫存消耗規則',
  'inventory.record.consumption': '庫存消耗',
  'member.create': '建立會員',
  'member.wallet.adjust': '錢包調整',
  'order.create': '建立訂單',
  'order.claim': '鎖單',
  'order.release_claim': '釋放鎖單',
  'order.status.update': '訂單狀態',
  'order.payment.update': '收款狀態',
  'order.payment.expired': '付款逾期',
  'order.void': '訂單作廢',
  'order.refund': '訂單退款',
  'payment.webhook.record': '金流回呼',
}

const paymentStatusLabels = {
  pending: '待收款',
  authorized: '已授權',
  paid: '已付款',
  expired: '逾期',
  failed: '失敗',
  refunded: '已退款',
} as const

const activeReservationStatuses: ReservationStatus[] = ['booked', 'reminded', 'confirmed']
const reservationStatusLabels: Record<ReservationStatus, string> = {
  booked: '已預訂',
  reminded: '已發送提醒',
  confirmed: '已保留訂位',
  seated: '已帶位',
  cancelled: '已取消',
  no_show: '未出席',
}

const paymentEventStatusOptions: Array<{ value: PaymentEventStatusFilter; label: string }> = [
  { value: 'all', label: '全部狀態' },
  { value: 'applied', label: '已套用' },
  { value: 'duplicate', label: '重送' },
  { value: 'unapplied', label: '未套用' },
]

const operationTimelineFilterOptions: Array<{ value: OperationTimelineFilter; label: string }> = [
  { value: 'all', label: '全部紀錄' },
  { value: 'register', label: '班別' },
  { value: 'station', label: '平板' },
  { value: 'audit', label: '操作' },
]

const auditFieldLabels: Record<string, string> = {
  name: '名稱',
  category: '分類',
  price: '售價',
  tags: '標籤',
  accent: '色票',
  is_available: '上下架',
  sort_order: '排序',
  pos_visible: 'POS 顯示',
  online_visible: '線上顯示',
  qr_visible: '掃碼顯示',
  prep_station: '備餐站',
  print_label: '貼紙',
  inventory_count: '庫存',
  low_stock_threshold: '低庫存',
  sold_out_until: '暫停供應',
}

const auditTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const auditActionLabel = (action: string): string => auditActionLabels[action] ?? action

const isStationOnline = (iso: string): boolean => {
  const lastSeenAt = new Date(iso).getTime()
  return Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt < 90_000
}

const emptyPrinterSettings = (): PrinterSettings => ({
  stations: [],
  rules: [],
})

const emptyAccessControl = (): AccessControlSettings => ({
  roles: [],
  staffAccounts: [],
  protectedPermissions: [],
})

const weekdayOptions = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
]

const defaultOnlineOrderingSettings = (): OnlineOrderingSettings => ({
  enabled: true,
  serviceModeAvailability: {
    'dine-in': true,
    takeout: true,
    delivery: true,
  },
  allowScheduledOrders: true,
  scheduledOrderIntervalMinutes: 15,
  scheduledOrderMaxDays: 7,
  scheduledOrderTimeWindows: [
    {
      id: 'daily',
      label: '每日',
      days: [1, 2, 3, 4, 5, 6, 0],
      start: '00:00',
      end: '23:59',
      allDay: true,
    },
  ],
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
  paymentMethods: [
    { id: 'line-pay', label: 'LINE Pay', enabled: true, opensCashDrawer: false },
    { id: 'jkopay', label: '街口', enabled: true, opensCashDrawer: false },
    { id: 'cash', label: '取餐時付款', enabled: true, opensCashDrawer: true },
    { id: 'card', label: '線上刷卡', enabled: false, opensCashDrawer: false },
    { id: 'app91-card', label: '91APP 支付線上刷卡', enabled: false, opensCashDrawer: false },
    { id: 'transfer', label: '轉帳', enabled: false, opensCashDrawer: false },
  ],
  deliveryFeeAmount: 60,
  deliveryMinimumSubtotal: 0,
  freeDeliveryThreshold: 0,
  deliveryTravelMinutes: 20,
  sessionQrCode: {
    autoPrint: false,
    stationId: '',
    logoText: 'Script Coffee',
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
  dineInTimeLimit: defaultDineInTimeLimitSettings(),
  dineInCheckout: {
    mode: 'postpaid',
  },
  commentFields: {
    itemNotes: 'shown',
    orderNote: 'optional',
    orderNotePlaceholder: '甜度、冰量或其他需求',
  },
  pauseMessage: '目前暫停線上點餐，請稍後再試',
  menuCategories: [],
  availableOptionChoices: [],
  menuOptionGroups: [],
  productOptionAssignments: {},
  comboProductAssignments: {},
  noteSupplyStatuses: {},
})

const clonePrinterSettings = (settings: PrinterSettings): PrinterSettings => ({
  stations: settings.stations.map((station) => ({ ...station })),
  rules: settings.rules.map((rule) => ({
    ...rule,
    timings: [...(rule.timings ?? defaultPrintRuleTimings)],
    categories: [...rule.categories],
    itemIds: [...(rule.itemIds ?? [])],
    countExcludedCategories: [...(rule.countExcludedCategories ?? [])],
    countExcludedItemIds: [...(rule.countExcludedItemIds ?? [])],
  })),
})

const normalizeRolePermissions = (permissions: AdminPermission[]): AdminPermission[] => {
  const normalized = new Set(permissions)
  if (normalized.has('manageReports') || normalized.has('closeRegister')) {
    normalized.add('viewCurrentSales')
  }
  return [...normalized]
}

const cloneAccessControl = (settings: AccessControlSettings): AccessControlSettings => ({
  roles: settings.roles.map((role) => ({ ...role, permissions: normalizeRolePermissions(role.permissions) })),
  staffAccounts: (settings.staffAccounts ?? []).map((staff) => ({
    ...staff,
    reportEmail: staff.reportEmail ?? '',
  })),
  protectedPermissions: [...(settings.protectedPermissions ?? [])],
})

const cloneOnlineOrdering = (settings: OnlineOrderingSettings): OnlineOrderingSettings => ({
  ...defaultOnlineOrderingSettings(),
  ...settings,
  serviceModeAvailability: {
    ...defaultOnlineOrderingSettings().serviceModeAvailability,
    ...settings.serviceModeAvailability,
  },
  paymentMethods: (settings.paymentMethods ?? defaultOnlineOrderingSettings().paymentMethods).map((method) => ({ ...method })),
  sessionQrCode: {
    ...defaultOnlineOrderingSettings().sessionQrCode,
    ...(settings.sessionQrCode ?? {}),
  },
  tableQrCode: {
    ...defaultOnlineOrderingSettings().tableQrCode,
    ...(settings.tableQrCode ?? {}),
    theme: tableQrThemeOptions.some((option) => option.value === settings.tableQrCode?.theme)
      ? settings.tableQrCode.theme
      : defaultOnlineOrderingSettings().tableQrCode.theme,
    logoText:
      typeof settings.tableQrCode?.logoText === 'string' && settings.tableQrCode.logoText.trim().length > 0
        ? settings.tableQrCode.logoText.trim().slice(0, 40)
        : defaultOnlineOrderingSettings().tableQrCode.logoText,
    logoDataUrl:
      typeof settings.tableQrCode?.logoDataUrl === 'string' && settings.tableQrCode.logoDataUrl.startsWith('data:image/')
        ? settings.tableQrCode.logoDataUrl.slice(0, 120_000)
        : '',
  },
  storeProfile: {
    ...defaultOnlineOrderingSettings().storeProfile,
    ...(settings.storeProfile ?? {}),
    name:
      typeof settings.storeProfile?.name === 'string' && settings.storeProfile.name.trim().length > 0
        ? settings.storeProfile.name.trim().slice(0, 60)
        : defaultOnlineOrderingSettings().storeProfile.name,
    phone: typeof settings.storeProfile?.phone === 'string' ? settings.storeProfile.phone.trim().slice(0, 32) : '',
    address:
      typeof settings.storeProfile?.address === 'string' ? settings.storeProfile.address.trim().slice(0, 160) : '',
    notice: typeof settings.storeProfile?.notice === 'string' ? settings.storeProfile.notice.trim().slice(0, 3000) : '',
    noticeExpanded: settings.storeProfile?.noticeExpanded === true,
    coverImageDataUrls: Array.isArray(settings.storeProfile?.coverImageDataUrls)
      ? settings.storeProfile.coverImageDataUrls
        .filter((imageUrl): imageUrl is string => typeof imageUrl === 'string' && imageUrl.startsWith('data:image/'))
        .map((imageUrl) => imageUrl.slice(0, 600_000))
        .slice(0, 4)
      : [],
  },
  notificationRouting: {
    stations: (settings.notificationRouting?.stations ?? [])
      .filter((station) => station.stationId)
      .slice(0, 32)
      .map((station) => ({
        stationId: station.stationId.trim().slice(0, 80),
        stationLabel: (station.stationLabel || station.stationId).trim().slice(0, 80),
        enabled: station.enabled !== false,
        serviceModes: {
          'dine-in': station.serviceModes?.['dine-in'] !== false,
          takeout: station.serviceModes?.takeout !== false,
          delivery: station.serviceModes?.delivery !== false,
        },
        tableIds: [...new Set((station.tableIds ?? []).map((tableId) => tableId.trim().toUpperCase()).filter(Boolean))]
          .slice(0, 80),
        soundEnabled: station.soundEnabled !== false,
        notificationRepeatMode: station.notificationRepeatMode === 'once' ? 'once' : 'continuous',
        notificationVolume: Math.min(Math.max(Math.trunc(Number(station.notificationVolume) || 0), 0), 100),
      })),
  },
  dineInTimeLimit: normalizeDineInTimeLimitSettings(
    settings.dineInTimeLimit,
    defaultOnlineOrderingSettings().dineInTimeLimit,
  ),
  dineInCheckout: {
    ...defaultOnlineOrderingSettings().dineInCheckout,
    ...(settings.dineInCheckout ?? {}),
    mode: settings.dineInCheckout?.mode === 'prepaid' ? 'prepaid' : 'postpaid',
  },
  commentFields: {
    ...defaultOnlineOrderingSettings().commentFields,
    ...(settings.commentFields ?? {}),
    itemNotes: settings.commentFields?.itemNotes === 'hidden' ? 'hidden' : 'shown',
    orderNote:
      settings.commentFields?.orderNote === 'hidden' || settings.commentFields?.orderNote === 'required'
        ? settings.commentFields.orderNote
        : 'optional',
    orderNotePlaceholder:
      typeof settings.commentFields?.orderNotePlaceholder === 'string' && settings.commentFields.orderNotePlaceholder.trim().length > 0
        ? settings.commentFields.orderNotePlaceholder.trim().slice(0, 80)
        : defaultOnlineOrderingSettings().commentFields.orderNotePlaceholder,
  },
  scheduledOrderTimeWindows: (
    settings.scheduledOrderTimeWindows ?? defaultOnlineOrderingSettings().scheduledOrderTimeWindows
  ).map((timeWindow) => ({ ...timeWindow, days: [...timeWindow.days] })),
  menuCategories: settings.menuCategories.map((category) => ({ ...category })),
  availableOptionChoices: (settings.availableOptionChoices ?? []).map((choice) => ({ ...choice })),
  menuOptionGroups: settings.menuOptionGroups.map((group) => ({
    ...group,
    choices: group.choices.map((choice) => ({ ...choice })),
  })),
  productOptionAssignments: Object.entries(settings.productOptionAssignments).reduce<Record<string, string[]>>(
    (assignments, [productId, groupIds]) => {
      assignments[productId] = [...groupIds]
      return assignments
    },
    {},
  ),
  comboProductAssignments: Object.entries(settings.comboProductAssignments ?? {}).reduce<
    OnlineOrderingSettings['comboProductAssignments']
  >(
    (assignments, [productId, groups]) => {
      assignments[productId] = groups.map((group) => ({
        ...group,
        choices: group.choices.map((choice) => ({ ...choice })),
      }))
      return assignments
    },
    {},
  ),
  noteSupplyStatuses: { ...settings.noteSupplyStatuses },
})

const cloneDiscountSettings = (settings: DiscountSettings): DiscountSettings =>
  normalizeDiscountSettings(settings)

const cloneEngagementSettings = (settings: CustomerEngagementSettings): CustomerEngagementSettings => {
  const defaults = defaultEngagementSettings()
  const reservationWebsite = settings.reservationWebsite ?? defaults.reservationWebsite
  const reservationBusinessHours = reservationWebsite.businessHours ?? defaults.reservationWebsite.businessHours
  const reservationSpecialDates = reservationWebsite.specialDates ?? defaults.reservationWebsite.specialDates

  return {
    ...defaults,
    ...settings,
    orderLabels: settings.orderLabels.map((label) => ({ ...label })),
    customerTypes: [...settings.customerTypes],
    serviceCharge: {
      ...defaults.serviceCharge,
      ...settings.serviceCharge,
      excludedCategories: [...(settings.serviceCharge?.excludedCategories ?? [])],
      excludedItemIds: [...(settings.serviceCharge?.excludedItemIds ?? [])],
    },
    productTotalDisplay: {
      ...defaults.productTotalDisplay,
      ...settings.productTotalDisplay,
      excludedCategories: [...(settings.productTotalDisplay?.excludedCategories ?? [])],
      excludedItemIds: [...(settings.productTotalDisplay?.excludedItemIds ?? [])],
    },
    loyaltyPoints: {
      ...defaults.loyaltyPoints,
      ...settings.loyaltyPoints,
    },
    electronicInvoice: {
      ...defaults.electronicInvoice,
      ...settings.electronicInvoice,
    },
    workflowAlerts: {
      ...defaults.workflowAlerts,
      ...settings.workflowAlerts,
    },
    orderPageDisplay: {
      ...defaults.orderPageDisplay,
      ...settings.orderPageDisplay,
    },
    checkoutCounters: {
      ...defaults.checkoutCounters,
      ...settings.checkoutCounters,
      books: (settings.checkoutCounters?.books ?? defaults.checkoutCounters.books).map((book) => ({
        ...book,
        stationIds: [...book.stationIds],
        paymentDeviceIds: [...book.paymentDeviceIds],
      })),
    },
    appOperation: {
      ...defaults.appOperation,
      ...settings.appOperation,
      childStationIds: [...(settings.appOperation?.childStationIds ?? [])],
    },
    recommendations: settings.recommendations.map((rule) => ({ ...rule, productIds: [...rule.productIds] })),
    translations: settings.translations.map((translation) => ({ ...translation })),
    hardwareDevices: settings.hardwareDevices.map((device) => ({ ...device })),
    supplyRules: {
      ...settings.supplyRules,
      defaultPeriods: settings.supplyRules.defaultPeriods.map((period) => ({ ...period, days: [...period.days] })),
    },
    reservationWebsite: {
      ...defaults.reservationWebsite,
      ...reservationWebsite,
      businessHours: reservationBusinessHours.map((period) => ({ ...period })),
      specialDates: reservationSpecialDates.map((rule) => ({ ...rule })),
    },
  }
}

const toDateInput = (date = new Date()): string => {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

const dateInputDaysAgo = (days: number): string => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toDateInput(date)
}

const activeAdminTab = ref<AdminTab>('products')
const searchTerm = ref('')
const selectedCategory = ref<'all' | MenuCategory>('all')
const productDrafts = ref<ProductDraft[]>([])
const inventoryItems = ref<InventoryItem[]>([])
const inventoryConsumptionRules = ref<InventoryConsumptionRule[]>([])
const productConsumptionDrafts = ref<Record<string, InventoryConsumptionDraft>>({})
const optionConsumptionDraft = ref<OptionConsumptionDraft>({
  optionLabel: '',
  itemId: '',
  quantity: 1,
})
const members = ref<PosMember[]>([])
const coupons = ref<MemberCoupon[]>([])
const reservations = ref<PosReservation[]>([])
const reservationBlacklist = ref<ReservationBlacklistEntry[]>([])
const memberSearchTerm = ref('')
const newMember = ref<MemberDraft>({
  lineUserId: '',
  displayName: '',
  phone: '',
  customerType: '一般顧客',
  pointsBalance: 0,
  openingBalance: 0,
  note: '',
})
const newCoupon = ref<CouponDraft>({
  memberId: '',
  code: '',
  title: '',
  discountAmount: 0,
  discountPercent: 0,
  expiresAt: '',
})
const newReservation = ref<ReservationDraft>({
  customerName: '',
  customerPhone: '',
  partySize: 2,
  reservedAt: '',
  importantLabel: '',
  note: '',
})
const newBlacklistEntry = ref<ReservationBlacklistDraft>({
  phone: '',
  customerName: '',
  reason: '線上訂位黑名單',
  note: '',
})
const pendingBlacklistedReservationPhone = ref('')
const walletAdjustmentDrafts = ref<Record<string, WalletAdjustmentDraft>>({})
const reportDate = ref(toDateInput())
const dailyReport = ref<DailySalesReport | null>(null)
const closeoutReportDeliveries = ref<CloseoutReportDelivery[]>([])
const printerSettings = ref<PrinterSettings>(emptyPrinterSettings())
const accessControl = ref<AccessControlSettings>(emptyAccessControl())
const onlineOrdering = ref<OnlineOrderingSettings>(defaultOnlineOrderingSettings())
const discountSettings = ref<DiscountSettings>(defaultDiscountSettings())
const engagementSettings = ref<CustomerEngagementSettings>(defaultEngagementSettings())
const floorPlan = ref<FloorPlanSettings>(defaultFloorPlanSettings())
const auditEvents = ref<PosAuditEvent[]>([])
const permissionAuditEvents = ref<PosAuditEvent[]>([])
const paymentEvents = ref<PosPaymentEvent[]>([])
const stationHeartbeats = ref<PosStationHeartbeat[]>([])
const timeClockEntries = ref<StaffTimeClockEntry[]>([])
const auditLimit = ref(50)
const permissionAuditLimit = ref(100)
const closeoutReportDeliveryLimit = ref(60)
const paymentEventLimit = ref(50)
const timeClockLimit = ref(300)
const timeClockStartDate = ref(dateInputDaysAgo(6))
const timeClockEndDate = ref(toDateInput())
const timeClockStaffFilter = ref('all')
const paymentProviderFilter = ref('all')
const paymentEventStatusFilter = ref<PaymentEventStatusFilter>('all')
const auditActionFilter = ref('all')
const operationSearchTerm = ref('')
const operationKindFilter = ref<OperationTimelineFilter>('all')
const operationStationFilter = ref('all')
const isLoading = ref(false)
const isAuditLoading = ref(false)
const isPermissionAuditLoading = ref(false)
const isPaymentEventLoading = ref(false)
const isMemberLoading = ref(false)
const isReportLoading = ref(false)
const isCloseoutReportDeliveryLoading = ref(false)
const isStationLoading = ref(false)
const isIchefLoading = ref(false)
const isOperationLoading = ref(false)
const isTimeClockLoading = ref(false)
const savingProductId = ref<string | null>(null)
const savingMemberId = ref<string | null>(null)
const savingSettingKey = ref<string | null>(null)
const adminMessage = ref('尚未載入後台資料')
const tableQrDownloadMessage = ref('')
const onlineStoreProfileMessage = ref('')

const visibleProducts = computed(() => productDrafts.value.filter((product) => product.available && product.posVisible).length)
const onlineProducts = computed(() => productDrafts.value.filter((product) => product.onlineVisible || product.qrVisible).length)
const lowStockProducts = computed(() =>
  productDrafts.value.filter((product) =>
    product.inventoryCount !== null &&
    product.lowStockThreshold !== null &&
    product.inventoryCount > 0 &&
    product.inventoryCount <= product.lowStockThreshold,
  ).length,
)
const printRuleCount = computed(() => printerSettings.value.rules.filter((rule) => rule.enabled).length)
const roleCount = computed(() => accessControl.value.roles.length)
const activeStaffCount = computed(() => accessControl.value.staffAccounts.filter((staff) => staff.active).length)
const onlineOrderingStatusLabel = computed(() => (onlineOrdering.value.enabled ? '開放中' : '已暫停'))
const onlineOrderingPrepLabel = computed(() => `${onlineOrdering.value.averagePrepMinutes} 分`)
const onlineNotificationRoutedStationCount = computed(() =>
  onlineOrdering.value.notificationRouting.stations.filter((station) => station.enabled).length,
)
const activeDiscountCampaignCount = computed(() => discountSettings.value.campaigns.filter((campaign) => campaign.enabled).length)
const automaticDiscountCampaignCount = computed(() =>
  discountSettings.value.campaigns.filter((campaign) => campaign.enabled && campaign.kind === 'automatic').length,
)
const auditEventCount = computed(() => auditEvents.value.length)
const paymentEventCount = computed(() => paymentEvents.value.length)
const unappliedPaymentEventCount = computed(() => paymentEvents.value.filter((event) => !event.applied).length)
const memberCount = computed(() => members.value.length)
const couponCount = computed(() => coupons.value.length)
const activeReservationCount = computed(() =>
  reservations.value.filter((reservation) => activeReservationStatuses.includes(reservation.status)).length,
)
const activeReservationBlacklistCount = computed(() =>
  reservationBlacklist.value.filter((entry) => entry.isActive).length,
)
const activeInventoryItems = computed(() => inventoryItems.value.filter((item) => item.isActive))
const activeInventoryConsumptionRuleCount = computed(() =>
  inventoryConsumptionRules.value.filter((rule) => rule.isActive).length,
)
const optionChoiceDisplayLabel = (choice: { label: string; priceDelta?: number }): string =>
  choice.priceDelta && choice.priceDelta > 0 ? `${choice.label} +${formatCurrency(choice.priceDelta)}` : choice.label
const inventoryOptionLabels = computed(() =>
  [...new Set(onlineOrdering.value.availableOptionChoices.map(optionChoiceDisplayLabel).filter(Boolean))],
)
const inventoryItemName = (itemId: string): string =>
  inventoryItems.value.find((item) => item.id === itemId)?.name ?? '未知庫存品項'
const activeConsumptionRules = (rules: InventoryConsumptionRule[]): InventoryConsumptionRule[] =>
  rules
    .filter((rule) => rule.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder || first.createdAt.localeCompare(second.createdAt))
const productConsumptionRules = (productId: string): InventoryConsumptionRule[] =>
  activeConsumptionRules(
    inventoryConsumptionRules.value.filter((rule) => rule.subjectType === 'product' && rule.productId === productId),
  )
const optionConsumptionRules = computed(() =>
  activeConsumptionRules(inventoryConsumptionRules.value.filter((rule) => rule.subjectType === 'option')),
)
const ensureProductConsumptionDraft = (productId: string): InventoryConsumptionDraft => {
  const existing = productConsumptionDrafts.value[productId]
  if (existing) {
    return existing
  }

  const draft = {
    itemId: activeInventoryItems.value[0]?.id ?? '',
    quantity: 1,
  }
  productConsumptionDrafts.value = {
    ...productConsumptionDrafts.value,
    [productId]: draft,
  }
  return draft
}
const resetConsumptionDraftDefaults = (): void => {
  const fallbackItemId = activeInventoryItems.value[0]?.id ?? ''
  productConsumptionDrafts.value = Object.fromEntries(
    productDrafts.value.map((product) => [
      product.id,
      productConsumptionDrafts.value[product.id] ?? { itemId: fallbackItemId, quantity: 1 },
    ]),
  )
  optionConsumptionDraft.value = {
    optionLabel: inventoryOptionLabels.value[0] ?? '',
    itemId: fallbackItemId,
    quantity: 1,
  }
}
const normalizeReservationPhoneKey = (phone: string): string => phone.replace(/[\s\-().]/g, '').trim()
const findReservationBlacklistEntry = (phone: string): ReservationBlacklistEntry | null => {
  const phoneKey = normalizeReservationPhoneKey(phone)
  if (!phoneKey) {
    return null
  }

  return reservationBlacklist.value.find((entry) => entry.normalizedPhone === phoneKey) ?? null
}
const findActiveReservationBlacklistEntry = (phone: string): ReservationBlacklistEntry | null => {
  const entry = findReservationBlacklistEntry(phone)
  return entry?.isActive ? entry : null
}
const reservationDraftBlacklistEntry = computed(() =>
  findActiveReservationBlacklistEntry(newReservation.value.customerPhone),
)
const walletBalanceTotal = computed(() => members.value.reduce((total, member) => total + member.walletBalance, 0))
const reportPeakHour = computed(() => {
  const report = dailyReport.value
  if (!report) {
    return null
  }

  return [...report.hourly].sort((a, b) => b.total - a.total || b.count - a.count)[0] ?? null
})
const closeoutReportDeliverySummary = computed(() => ({
  sent: closeoutReportDeliveries.value.filter((delivery) => delivery.status === 'sent').length,
  queued: closeoutReportDeliveries.value.filter((delivery) => delivery.status === 'queued').length,
  failed: closeoutReportDeliveries.value.filter((delivery) => delivery.status === 'failed').length,
}))
const onlineStationCount = computed(() =>
  stationHeartbeats.value.filter((station) => isStationOnline(station.lastSeenAt)).length,
)
const auditActionOptions = computed(() =>
  Array.from(new Set(auditEvents.value.map((event) => event.action))).map((action) => ({
    value: action,
    label: auditActionLabel(action),
  })),
)
const permissionAuditSummary = computed(() => {
  if (permissionAuditEvents.value.length === 0) {
    return '尚無權限驗證紀錄'
  }

  const latest = permissionAuditEvents.value[0]!
  return `${permissionAuditEvents.value.length} 筆 · 最近 ${formatAuditTime(latest.createdAt)}`
})
const filteredAuditEvents = computed(() =>
  auditActionFilter.value === 'all'
    ? auditEvents.value
    : auditEvents.value.filter((event) => event.action === auditActionFilter.value),
)
const paymentProviderOptions = computed(() =>
  Array.from(new Set(paymentEvents.value.map((event) => event.provider)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((provider) => ({ value: provider, label: provider })),
)
const filteredPaymentEvents = computed(() =>
  paymentEvents.value.filter((event) => {
    if (paymentEventStatusFilter.value === 'duplicate') {
      return event.duplicate
    }

    if (paymentEventStatusFilter.value === 'applied') {
      return event.applied && !event.duplicate
    }

    if (paymentEventStatusFilter.value === 'unapplied') {
      return !event.applied && !event.duplicate
    }

    return true
  }),
)
const stationOptions = computed(() => {
  if (printerSettings.value.stations.length > 0) {
    return printerSettings.value.stations
  }

  return [
    {
      id: 'bar',
      name: '吧台',
      host: '192.168.1.100',
      port: 9100,
      protocol: 'EZPL over TCP',
      enabled: true,
      autoPrint: true,
    },
  ]
})

const stationNameForId = (stationId: string): string =>
  stationOptions.value.find((station) => station.id === stationId)?.name ?? '目前出單機'

const printerRulesInPrintOrder = (settings: PrinterSettings): PrintRuleSetting[] => {
  if (settings.stations.length === 0) {
    return settings.rules
  }

  const stationIds = new Set(settings.stations.map((station) => station.id))
  return [
    ...settings.stations.flatMap((station) => settings.rules.filter((rule) => rule.stationId === station.id)),
    ...settings.rules.filter((rule) => !stationIds.has(rule.stationId)),
  ]
}
const printerRuleRows = computed<PrintRuleSetting[]>(() => printerRulesInPrintOrder(printerSettings.value))

const tableQrThemeLabel = computed(() =>
  tableQrThemeOptions.find((option) => option.value === onlineOrdering.value.tableQrCode.theme)?.label ?? '經典黑色',
)
const tableQrFloorIndex = computed(() =>
  new Map(floorPlan.value.floors.map((floor, index) => [floor.id, index])),
)
const tableQrFloorById = computed(() =>
  new Map(floorPlan.value.floors.map((floor) => [floor.id, floor])),
)
const tableQrCardSources = computed<TableQrCardSource[]>(() =>
  floorPlan.value.tables
    .map((table) => ({
      table,
      floor: tableQrFloorById.value.get(table.floorId) ?? null,
    }))
    .sort((first, second) => {
      const firstFloorIndex = tableQrFloorIndex.value.get(first.table.floorId) ?? Number.MAX_SAFE_INTEGER
      const secondFloorIndex = tableQrFloorIndex.value.get(second.table.floorId) ?? Number.MAX_SAFE_INTEGER
      return (
        firstFloorIndex - secondFloorIndex ||
        first.table.y - second.table.y ||
        first.table.x - second.table.x ||
        first.table.label.localeCompare(second.table.label, 'zh-TW')
      )
    }),
)

const activePrintRuleCategoryIds = ref<Record<string, MenuCategory>>({})
const activePrintRuleCountCategoryIds = ref<Record<string, MenuCategory>>({})
const sortedPrintRuleProducts = computed<ProductDraft[]>(() =>
  [...productDrafts.value].sort((first, second) =>
    first.category.localeCompare(second.category, 'zh-TW') ||
    first.sortOrder - second.sortOrder ||
    first.name.localeCompare(second.name, 'zh-TW'),
  ),
)
const printRuleProductIdsForCategory = (category: MenuCategory): string[] =>
  sortedPrintRuleProducts.value.filter((product) => product.category === category).map((product) => product.id)
const activePrintRuleCategoryId = (rule: PrintRuleSetting): MenuCategory =>
  activePrintRuleCategoryIds.value[rule.id] ??
  rule.categories.find((category) => menuCategoryOptions.some((option) => option.value === category)) ??
  menuCategoryOptions[0]?.value ??
  'coffee'
const selectPrintRuleCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  activePrintRuleCategoryIds.value = {
    ...activePrintRuleCategoryIds.value,
    [rule.id]: category,
  }
}
const activePrintRuleCountCategoryId = (rule: PrintRuleSetting): MenuCategory =>
  activePrintRuleCountCategoryIds.value[rule.id] ??
  (rule.countExcludedCategories ?? []).find((category) => menuCategoryOptions.some((option) => option.value === category)) ??
  menuCategoryOptions[0]?.value ??
  'coffee'
const selectPrintRuleCountCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  activePrintRuleCountCategoryIds.value = {
    ...activePrintRuleCountCategoryIds.value,
    [rule.id]: category,
  }
}
const printRuleProductOptions = (rule: PrintRuleSetting): ProductDraft[] => {
  const activeCategory = activePrintRuleCategoryId(rule)
  return sortedPrintRuleProducts.value.filter((product) => product.category === activeCategory)
}
const printRuleCountProductOptions = (rule: PrintRuleSetting): ProductDraft[] => {
  const activeCategory = activePrintRuleCountCategoryId(rule)
  return sortedPrintRuleProducts.value.filter((product) => product.category === activeCategory)
}
const printRuleCategoryFullySelected = (rule: PrintRuleSetting, category: MenuCategory): boolean => {
  const categoryProductIds = printRuleProductIdsForCategory(category)
  if (categoryProductIds.length === 0) {
    return rule.categories.includes(category)
  }

  const selectedItemIds = new Set(rule.itemIds ?? [])
  return rule.categories.includes(category) || categoryProductIds.every((itemId) => selectedItemIds.has(itemId))
}
const printRuleItemSelected = (rule: PrintRuleSetting, product: ProductDraft): boolean =>
  rule.categories.includes(product.category) || (rule.itemIds ?? []).includes(product.id)
const printRuleCountCategoryFullySelected = (rule: PrintRuleSetting, category: MenuCategory): boolean => {
  const categoryProductIds = printRuleProductIdsForCategory(category)
  const categories = rule.countExcludedCategories ?? []
  if (categoryProductIds.length === 0) {
    return categories.includes(category)
  }

  const selectedItemIds = new Set(rule.countExcludedItemIds ?? [])
  return categories.includes(category) || categoryProductIds.every((itemId) => selectedItemIds.has(itemId))
}
const printRuleCountItemSelected = (rule: PrintRuleSetting, product: ProductDraft): boolean =>
  (rule.countExcludedCategories ?? []).includes(product.category) || (rule.countExcludedItemIds ?? []).includes(product.id)
const printRuleTimingSelected = (rule: PrintRuleSetting, timing: PrintRuleTiming): boolean =>
  (rule.timings ?? defaultPrintRuleTimings).includes(timing)
const activeProductTotalCategory = ref<MenuCategory>(menuCategoryOptions[0]?.value ?? 'coffee')
const selectProductTotalCategory = (category: MenuCategory): void => {
  activeProductTotalCategory.value = category
}
const productTotalProductOptions = computed<ProductDraft[]>(() =>
  sortedPrintRuleProducts.value.filter((product) => product.category === activeProductTotalCategory.value),
)
const productTotalCategoryFullyExcluded = (category: MenuCategory): boolean => {
  const settings = engagementSettings.value.productTotalDisplay
  const categoryProductIds = printRuleProductIdsForCategory(category)
  if (categoryProductIds.length === 0) {
    return settings.excludedCategories.includes(category)
  }

  const excludedItemIds = new Set(settings.excludedItemIds)
  return settings.excludedCategories.includes(category) || categoryProductIds.every((itemId) => excludedItemIds.has(itemId))
}
const productTotalItemExcluded = (product: ProductDraft): boolean =>
  engagementSettings.value.productTotalDisplay.excludedCategories.includes(product.category) ||
  engagementSettings.value.productTotalDisplay.excludedItemIds.includes(product.id)
const activeServiceChargeCategory = ref<MenuCategory>(menuCategoryOptions[0]?.value ?? 'coffee')
const selectServiceChargeCategory = (category: MenuCategory): void => {
  activeServiceChargeCategory.value = category
}
const serviceChargeProductOptions = computed<ProductDraft[]>(() =>
  sortedPrintRuleProducts.value.filter((product) => product.category === activeServiceChargeCategory.value),
)
const serviceChargeCategoryFullyExcluded = (category: MenuCategory): boolean => {
  const settings = engagementSettings.value.serviceCharge
  const categoryProductIds = printRuleProductIdsForCategory(category)
  if (categoryProductIds.length === 0) {
    return settings.excludedCategories.includes(category)
  }

  const excludedItemIds = new Set(settings.excludedItemIds)
  return settings.excludedCategories.includes(category) || categoryProductIds.every((itemId) => excludedItemIds.has(itemId))
}
const serviceChargeItemExcluded = (product: ProductDraft): boolean =>
  engagementSettings.value.serviceCharge.excludedCategories.includes(product.category) ||
  engagementSettings.value.serviceCharge.excludedItemIds.includes(product.id)
const normalizePrintRuleFullCategories = (rule: PrintRuleSetting): void => {
  const itemIds = new Set(rule.itemIds ?? [])
  const categories = new Set(rule.categories)
  for (const category of menuCategoryOptions.map((option) => option.value)) {
    const categoryProductIds = printRuleProductIdsForCategory(category)
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
const normalizePrintRuleCountFullCategories = (rule: PrintRuleSetting): void => {
  const itemIds = new Set(rule.countExcludedItemIds ?? [])
  const categories = new Set(rule.countExcludedCategories ?? [])
  for (const category of menuCategoryOptions.map((option) => option.value)) {
    const categoryProductIds = printRuleProductIdsForCategory(category)
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
const normalizeProductTotalFullCategories = (): void => {
  const settings = engagementSettings.value.productTotalDisplay
  const itemIds = new Set(settings.excludedItemIds)
  const categories = new Set(settings.excludedCategories)
  for (const category of menuCategoryOptions.map((option) => option.value)) {
    const categoryProductIds = printRuleProductIdsForCategory(category)
    if (categoryProductIds.length === 0 || !categoryProductIds.every((itemId) => itemIds.has(itemId))) {
      continue
    }

    categories.add(category)
    for (const itemId of categoryProductIds) {
      itemIds.delete(itemId)
    }
  }

  settings.excludedCategories = [...categories]
  settings.excludedItemIds = [...itemIds]
}
const normalizeServiceChargeFullCategories = (): void => {
  const settings = engagementSettings.value.serviceCharge
  const itemIds = new Set(settings.excludedItemIds)
  const categories = new Set(settings.excludedCategories)
  for (const category of menuCategoryOptions.map((option) => option.value)) {
    const categoryProductIds = printRuleProductIdsForCategory(category)
    if (categoryProductIds.length === 0 || !categoryProductIds.every((itemId) => itemIds.has(itemId))) {
      continue
    }

    categories.add(category)
    for (const itemId of categoryProductIds) {
      itemIds.delete(itemId)
    }
  }

  settings.excludedCategories = [...categories]
  settings.excludedItemIds = [...itemIds]
}

const operationStationOptions = computed(() => {
  const stations = new Map<string, string>()
  for (const station of stationHeartbeats.value) {
    stations.set(station.stationId, station.stationLabel || station.stationId)
  }
  for (const event of auditEvents.value) {
    if (event.stationId) {
      stations.set(event.stationId, stations.get(event.stationId) ?? event.stationId)
    }
  }

  return Array.from(stations.entries())
    .sort(([, first], [, second]) => first.localeCompare(second, 'zh-TW'))
    .map(([value, label]) => ({ value, label }))
})

const operationTimelineEntries = computed<OperationTimelineEntry[]>(() => {
  const auditEntries = auditEvents.value.map((event): OperationTimelineEntry => {
    const kind: OperationTimelineKind = event.action.startsWith('register.') ? 'register' : 'audit'
    const title = auditActionLabel(event.action)
    const subject = auditSubject(event)
    const stationId = event.stationId || '未標記平板'
    const actor = event.actor || 'pos-api'
    const summary = auditMetadataSummary(event)
    const statusLabel = kind === 'register' ? '班別' : '操作'

    return {
      id: `audit-${event.id}`,
      kind,
      title,
      subject,
      stationId,
      actor,
      summary,
      statusLabel,
      statusClass: kind === 'register' ? 'status-pill--success' : 'status-pill--neutral',
      createdAt: event.createdAt,
      searchableText: [title, subject, stationId, actor, summary, event.action].join(' ').toLowerCase(),
    }
  })

  const stationEntries = stationHeartbeats.value.map((station): OperationTimelineEntry => {
    const stationLabel = station.stationLabel || station.stationId
    const statusLabel = stationStatusLabel(station)
    const summaryParts = [
      station.platform || '未標記平台',
      station.appVersion || '未標記版本',
      station.userAgent ? station.userAgent.slice(0, 80) : '',
    ].filter(Boolean)
    const summary = summaryParts.join(' · ')

    return {
      id: `station-${station.stationId}`,
      kind: 'station',
      title: `平板${statusLabel}`,
      subject: stationLabel,
      stationId: station.stationId,
      actor: 'station-heartbeat',
      summary,
      statusLabel,
      statusClass: stationStatusClass(station),
      createdAt: station.lastSeenAt,
      searchableText: [stationLabel, station.stationId, statusLabel, summary].join(' ').toLowerCase(),
    }
  })

  return [...auditEntries, ...stationEntries].sort((first, second) => {
    const firstTime = new Date(first.createdAt).getTime()
    const secondTime = new Date(second.createdAt).getTime()
    return (Number.isFinite(secondTime) ? secondTime : 0) - (Number.isFinite(firstTime) ? firstTime : 0)
  })
})

const filteredOperationTimelineEntries = computed(() => {
  const keyword = operationSearchTerm.value.trim().toLowerCase()
  return operationTimelineEntries.value.filter((entry) => {
    const matchesKind = operationKindFilter.value === 'all' || entry.kind === operationKindFilter.value
    const matchesStation = operationStationFilter.value === 'all' || entry.stationId === operationStationFilter.value
    const matchesKeyword = !keyword || entry.searchableText.includes(keyword)

    return matchesKind && matchesStation && matchesKeyword
  })
})

const operationTimelineCount = computed(() => filteredOperationTimelineEntries.value.length)

const filteredProducts = computed(() => {
  const keyword = searchTerm.value.trim().toLowerCase()
  return productDrafts.value.filter((product) => {
    const matchesCategory = selectedCategory.value === 'all' || product.category === selectedCategory.value
    const matchesKeyword =
      keyword.length === 0 ||
      product.name.toLowerCase().includes(keyword) ||
      product.sku.toLowerCase().includes(keyword) ||
      product.barcode.toLowerCase().includes(keyword) ||
      product.tagsText.toLowerCase().includes(keyword)

    return matchesCategory && matchesKeyword
  })
})

const filteredMembers = computed(() => {
  const keyword = memberSearchTerm.value.trim().toLowerCase()
  if (!keyword) {
    return members.value
  }

  return members.value.filter((member) =>
    member.displayName.toLowerCase().includes(keyword) ||
    member.phone.toLowerCase().includes(keyword) ||
    member.customerType.toLowerCase().includes(keyword) ||
    (member.lineUserId ?? '').toLowerCase().includes(keyword),
  )
})

const toDraft = (product: MenuItem): ProductDraft => ({
  ...product,
  tags: [...product.tags],
  supplyPeriods: product.supplyPeriods.map((period) => ({ ...period, days: [...period.days] })),
  tagsText: product.tags.join('，'),
  soldOutUntilInput: toDatetimeLocalInput(product.soldOutUntil),
})

const tagsFromText = (tagsText: string): string[] =>
  tagsText
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

const buildId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}`

const numberOrNull = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.max(0, Math.trunc(numberValue)) : null
}

const toDatetimeLocalInput = (iso: string | null): string => {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16)
}

const fromDatetimeLocalInput = (value: string): string | null => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const resetNewMember = (): void => {
  newMember.value = {
    lineUserId: '',
    displayName: '',
    phone: '',
    customerType: '一般顧客',
    pointsBalance: 0,
    openingBalance: 0,
    note: '',
  }
}

const walletAdjustmentDraft = (memberId: string): WalletAdjustmentDraft => {
  const currentDraft = walletAdjustmentDrafts.value[memberId]
  if (currentDraft) {
    return currentDraft
  }

  const nextDraft = { amount: 0, note: '' }
  walletAdjustmentDrafts.value = {
    ...walletAdjustmentDrafts.value,
    [memberId]: nextDraft,
  }
  return nextDraft
}

const updateWalletAdjustmentAmount = (memberId: string, event: Event): void => {
  const target = event.target as HTMLInputElement | null
  walletAdjustmentDraft(memberId).amount = Number(target?.value ?? 0)
}

const updateWalletAdjustmentNote = (memberId: string, event: Event): void => {
  const target = event.target as HTMLInputElement | null
  walletAdjustmentDraft(memberId).note = target?.value ?? ''
}

const formatAuditTime = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '時間未知' : auditTimeFormatter.format(date)
}

const couponStatusLabel = (coupon: MemberCoupon): string => {
  if (coupon.status === 'redeemed') {
    return '已使用'
  }
  if (coupon.status === 'expired') {
    return '已過期'
  }
  return '可使用'
}

const couponMemberLabel = (coupon: MemberCoupon): string => {
  if (!coupon.memberId) {
    return '未綁定會員'
  }
  const member = members.value.find((entry) => entry.id === coupon.memberId)
  return member ? `${member.displayName} · ${member.phone || member.lineUserId || '手動'}` : coupon.memberId.slice(0, 8)
}

const couponUsageLabel = (coupon: MemberCoupon): string => {
  if (coupon.status !== 'redeemed') {
    return coupon.expiresAt ? `到期 ${formatAuditTime(coupon.expiresAt)}` : '無到期日'
  }
  const redeemedAt = coupon.redeemedAt ? formatAuditTime(coupon.redeemedAt) : '時間未知'
  const orderLabel = coupon.redeemedOrderId ? ` · 訂單 ${coupon.redeemedOrderId.slice(0, 8)}` : ''
  const stationLabel = coupon.redemptionStationId ? ` · ${coupon.redemptionStationId}` : ''
  return `使用 ${redeemedAt}${orderLabel}${stationLabel}`
}

const stationStatusLabel = (station: PosStationHeartbeat): string =>
  isStationOnline(station.lastSeenAt) ? '在線' : '離線'

const stationStatusClass = (station: PosStationHeartbeat): string =>
  isStationOnline(station.lastSeenAt) ? 'status-pill--success' : 'status-pill--danger'

const timeClockEventLabel = (entry: StaffTimeClockEntry): string =>
  entry.eventType === 'clock-in' ? '上班' : '下班'

const timeClockEventClass = (entry: StaffTimeClockEntry): string =>
  entry.eventType === 'clock-in' ? 'status-pill--success' : 'status-pill--neutral'

const dateInputTime = (value: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number.NaN
  }

  return new Date(`${value}T00:00:00`).getTime()
}

const timeClockRangeDays = computed(() => {
  const start = dateInputTime(timeClockStartDate.value)
  const end = dateInputTime(timeClockEndDate.value)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null
  }

  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1
})

const timeClockDateRangeValid = computed(() =>
  Boolean(timeClockStartDate.value) &&
  Boolean(timeClockEndDate.value) &&
  timeClockRangeDays.value !== null &&
  timeClockRangeDays.value <= 93,
)

const timeClockStaffFilterLabel = computed(() => {
  if (timeClockStaffFilter.value === 'all') {
    return '全體員工'
  }

  return accessControl.value.staffAccounts.find((staff) => staff.id === timeClockStaffFilter.value)?.name ?? '指定員工'
})

const timeClockReportSummary = computed(() => {
  const rangeText = timeClockRangeDays.value === null
    ? '日期區間無效'
    : `${timeClockStartDate.value} - ${timeClockEndDate.value} · ${timeClockRangeDays.value} 天`
  return `${rangeText} · ${timeClockStaffFilterLabel.value} · ${timeClockEntries.value.length} 筆`
})

const reportBreakdownLabel = (key: string): string => {
  const labels: Record<string, string> = {
    cash: '現金',
    card: '刷卡',
    'app91-card': '91APP 支付線上刷卡',
    'line-pay': 'LINE Pay',
    jkopay: '街口',
    transfer: '轉帳',
    counter: '櫃台',
    online: '線上',
    qr: '掃碼',
    'dine-in': '內用',
    takeout: '外帶',
    delivery: '外送',
    new: '新單',
    preparing: '製作中',
    ready: '可交付',
    served: '已交付',
    failed: '異常',
    voided: '已作廢',
  }

  return labels[key] ?? key
}

const reportHourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

const closeoutReportDeliveryStatusLabel = (delivery: CloseoutReportDelivery): string => {
  const labels: Record<CloseoutReportDelivery['status'], string> = {
    queued: '待寄送',
    sent: '已寄送',
    failed: '寄送失敗',
    skipped: '已略過',
  }

  return labels[delivery.status]
}

const closeoutReportDeliveryStatusClass = (delivery: CloseoutReportDelivery): string => {
  if (delivery.status === 'sent') {
    return 'status-pill--success'
  }

  if (delivery.status === 'failed') {
    return 'status-pill--danger'
  }

  return 'status-pill--neutral'
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

const downloadCsv = (filename: string, rows: unknown[][]): void => {
  const documentRef = globalThis.document
  const urlApi = globalThis.URL
  if (!documentRef || !urlApi || rows.length === 0) {
    adminMessage.value = '目前環境無法匯出 CSV'
    return
  }

  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = urlApi.createObjectURL(blob)
  const link = documentRef.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  urlApi.revokeObjectURL(url)
}

const exportDailyReportCsv = (): void => {
  const report = dailyReport.value
  if (!report) {
    adminMessage.value = '請先載入營運日報'
    return
  }

  const rows: unknown[][] = [
    ['section', 'label', 'count', 'total'],
    ['summary', 'total_orders', report.totalOrders, ''],
    ['summary', 'collected_orders', report.collectedOrders, report.collectedTotal],
    ['summary', 'pending_total', '', report.pendingTotal],
    ['summary', 'refund_total', '', report.refundTotal],
    ['summary', 'average_ticket', '', report.averageTicket],
    ['summary', 'open_orders', report.openOrderCount, ''],
    ['summary', 'failed_payment', report.failedPaymentCount, ''],
    ['summary', 'failed_print', report.failedPrintCount, ''],
    ['summary', 'voided_orders', report.voidedOrderCount, ''],
    ...report.byPaymentMethod.map((row) => ['payment_method', reportBreakdownLabel(row.key), row.count, row.total]),
    ...report.bySource.map((row) => ['source', reportBreakdownLabel(row.key), row.count, row.total]),
    ...report.byServiceMode.map((row) => ['service_mode', reportBreakdownLabel(row.key), row.count, row.total]),
    ...report.byStatus.map((row) => ['status', reportBreakdownLabel(row.key), row.count, row.total]),
    ...report.hourly.filter((row) => row.count > 0).map((row) => ['hourly', reportHourLabel(row.hour), row.count, row.total]),
    ...report.topProducts.map((row) => ['top_product', `${row.sku} ${row.name}`, row.quantity, row.total]),
  ]

  downloadCsv(`script-coffee-daily-report-${report.date}.csv`, rows)
  adminMessage.value = `${report.date} 日報 CSV 已匯出`
}

const paymentEventStatusClass = (event: PosPaymentEvent): string => {
  if (event.duplicate) {
    return 'status-pill--neutral'
  }

  return event.applied ? 'status-pill--success' : 'status-pill--danger'
}

const paymentEventStatusLabel = (event: PosPaymentEvent): string => {
  if (event.duplicate) {
    return '重送'
  }

  return event.applied ? '已套用' : '未套用'
}

const exportPaymentEventsCsv = (): void => {
  if (filteredPaymentEvents.value.length === 0) {
    adminMessage.value = '目前沒有可匯出的支付事件'
    return
  }

  const rows: unknown[][] = [
    [
      'provider',
      'event_id',
      'order_number',
      'event_type',
      'payment_status',
      'amount',
      'applied',
      'duplicate',
      'created_at',
      'processed_at',
    ],
    ...filteredPaymentEvents.value.map((event) => [
      event.provider,
      event.eventId,
      event.orderNumber,
      event.eventType,
      event.paymentStatus,
      event.amount ?? '',
      event.applied,
      event.duplicate,
      event.createdAt,
      event.processedAt ?? '',
    ]),
  ]

  const provider = paymentProviderFilter.value === 'all' ? 'all' : paymentProviderFilter.value
  downloadCsv(`script-coffee-payment-events-${provider}.csv`, rows)
  adminMessage.value = `已匯出 ${filteredPaymentEvents.value.length} 筆支付事件`
}

const exportMembersCsv = (): void => {
  if (filteredMembers.value.length === 0) {
    adminMessage.value = '目前沒有可匯出的會員'
    return
  }

  const rows: unknown[][] = [
    ['display_name', 'line_user_id', 'wallet_balance', 'ledger_count', 'last_ledger_at', 'last_ledger_amount'],
    ...filteredMembers.value.map((member) => {
      const latestLedger = member.ledger[0]
      return [
        member.displayName,
        member.lineUserId ?? '',
        member.walletBalance,
        member.ledger.length,
        latestLedger?.createdAt ?? '',
        latestLedger?.amount ?? '',
      ]
    }),
  ]

  downloadCsv('script-coffee-members.csv', rows)
  adminMessage.value = `已匯出 ${filteredMembers.value.length} 位會員`
}

const exportAuditEventsCsv = (): void => {
  if (filteredAuditEvents.value.length === 0) {
    adminMessage.value = '目前沒有可匯出的稽核紀錄'
    return
  }

  const rows: unknown[][] = [
    ['created_at', 'action', 'action_label', 'subject', 'station_id', 'actor', 'summary'],
    ...filteredAuditEvents.value.map((event) => [
      event.createdAt,
      event.action,
      auditActionLabel(event.action),
      auditSubject(event),
      event.stationId ?? '',
      event.actor ?? 'pos-api',
      auditMetadataSummary(event),
    ]),
  ]

  const action = auditActionFilter.value === 'all' ? 'all' : auditActionFilter.value
  downloadCsv(`script-coffee-audit-${action}.csv`, rows)
  adminMessage.value = `已匯出 ${filteredAuditEvents.value.length} 筆稽核紀錄`
}

const permissionLabel = (permission: unknown): string =>
  typeof permission === 'string' && permission.trim().length > 0
    ? permissionOptions.find((option) => option.value === permission)?.label ?? permission
    : '未標記權限'

const permissionAuditOperator = (event: PosAuditEvent): string =>
  auditMetadataLabel(event, 'operatorStaffName') ?? '未知員工'

const permissionAuditRole = (event: PosAuditEvent): string =>
  auditMetadataLabel(event, 'operatorRoleName') ?? auditMetadataLabel(event, 'operatorRoleId') ?? '未知角色'

const exportPermissionAuditCsv = (): void => {
  if (permissionAuditEvents.value.length === 0) {
    adminMessage.value = '目前沒有可匯出的權限紀錄'
    return
  }

  const rows: unknown[][] = [
    ['created_at', 'permission', 'permission_label', 'operator_staff_name', 'operator_role_name', 'station_id', 'actor'],
    ...permissionAuditEvents.value.map((event) => [
      event.createdAt,
      auditMetadataLabel(event, 'permission') ?? '',
      permissionLabel(event.metadata.permission),
      permissionAuditOperator(event),
      permissionAuditRole(event),
      event.stationId ?? '',
      event.actor ?? 'pos-api',
    ]),
  ]

  downloadCsv('script-coffee-permission-log.csv', rows)
  adminMessage.value = `已匯出 ${permissionAuditEvents.value.length} 筆權限紀錄`
}

const exportOperationTimelineCsv = (): void => {
  if (filteredOperationTimelineEntries.value.length === 0) {
    adminMessage.value = '目前沒有可匯出的營運紀錄'
    return
  }

  const rows: unknown[][] = [
    ['created_at', 'type', 'title', 'subject', 'station_id', 'actor', 'status', 'summary'],
    ...filteredOperationTimelineEntries.value.map((entry) => [
      entry.createdAt,
      entry.kind,
      entry.title,
      entry.subject,
      entry.stationId,
      entry.actor,
      entry.statusLabel,
      entry.summary,
    ]),
  ]

  const kind = operationKindFilter.value === 'all' ? 'all' : operationKindFilter.value
  downloadCsv(`script-coffee-operations-${kind}.csv`, rows)
  adminMessage.value = `已匯出 ${filteredOperationTimelineEntries.value.length} 筆營運紀錄`
}

const exportTimeClockCsv = (): void => {
  if (timeClockEntries.value.length === 0) {
    adminMessage.value = '目前沒有可匯出的打卡紀錄'
    return
  }

  const rows: unknown[][] = [
    ['created_at', 'staff_name', 'staff_code', 'role_name', 'event_type', 'station_id', 'note'],
    ...timeClockEntries.value.map((entry) => [
      entry.createdAt,
      entry.staffName,
      entry.staffCode,
      entry.roleName || entry.roleId,
      timeClockEventLabel(entry),
      entry.stationId,
      entry.note,
    ]),
  ]

  const staff = timeClockStaffFilter.value === 'all' ? 'all' : timeClockStaffFilterLabel.value.replace(/\s+/g, '-')
  downloadCsv(`script-coffee-time-clock-${timeClockStartDate.value}-${timeClockEndDate.value}-${staff}.csv`, rows)
  adminMessage.value = `已匯出 ${timeClockEntries.value.length} 筆打卡紀錄`
}

const auditMetadataLabel = (event: PosAuditEvent, key: string): string | null => {
  const value = event.metadata[key]
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('zh-TW')
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }

  return null
}

const auditMoneyLabel = (event: PosAuditEvent, key: string): string | null => {
  const value = event.metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toLocaleString('zh-TW')}` : null
}

const auditSignedNumberLabel = (event: PosAuditEvent, key: string): string | null => {
  const value = event.metadata[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return value > 0 ? `+${value.toLocaleString('zh-TW')}` : value.toLocaleString('zh-TW')
}

const auditChangeLabel = (
  event: PosAuditEvent,
  beforeKey: string,
  afterKey: string,
  emptyLabel = '未追蹤',
): string | null => {
  const before = auditMetadataLabel(event, beforeKey) ?? emptyLabel
  const after = auditMetadataLabel(event, afterKey) ?? emptyLabel
  return before === emptyLabel && after === emptyLabel ? null : `${before}→${after}`
}

const auditMoneyChangeLabel = (event: PosAuditEvent, beforeKey: string, afterKey: string): string | null => {
  const before = auditMoneyLabel(event, beforeKey)
  const after = auditMoneyLabel(event, afterKey)
  return before && after ? `${before}→${after}` : null
}

const auditAvailabilityChangeLabel = (event: PosAuditEvent): string | null => {
  const before = event.metadata.availableBefore
  const after = event.metadata.availableAfter
  if (typeof before !== 'boolean' || typeof after !== 'boolean') {
    return null
  }

  return `${before ? '上架' : '停售'}→${after ? '上架' : '停售'}`
}

const auditListLabel = (event: PosAuditEvent, key: string): string | null => {
  const value = event.metadata[key]
  if (!Array.isArray(value)) {
    return null
  }

  const items = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => (key === 'changedFields' ? auditFieldLabels[entry] ?? entry : entry))
    .slice(0, 4)

  return items.length > 0 ? items.join('/') : null
}

const auditSubject = (event: PosAuditEvent): string => {
  const orderNumber = auditMetadataLabel(event, 'orderNumber')
  if (orderNumber) {
    return `訂單 ${orderNumber}`
  }

  const displayName = auditMetadataLabel(event, 'displayName')
  if (displayName) {
    return `會員 ${displayName}`
  }

  if (event.orderId) {
    return `訂單 ${event.orderId.slice(0, 8)}`
  }

  if (event.registerSessionId) {
    return `班別 ${event.registerSessionId.slice(0, 8)}`
  }

  return '系統'
}

const auditMetadataSummary = (event: PosAuditEvent): string => {
  const parts = [
    auditMetadataLabel(event, 'status') ? `狀態 ${auditMetadataLabel(event, 'status')}` : null,
    auditMetadataLabel(event, 'paymentStatus') ? `付款 ${auditMetadataLabel(event, 'paymentStatus')}` : null,
    auditMoneyLabel(event, 'subtotal') ? `金額 ${auditMoneyLabel(event, 'subtotal')}` : null,
    auditMetadataLabel(event, 'lineCount') ? `品項 ${auditMetadataLabel(event, 'lineCount')}` : null,
    auditMetadataLabel(event, 'sku') ? `SKU ${auditMetadataLabel(event, 'sku')}` : null,
    auditMetadataLabel(event, 'key') ? `設定 ${auditMetadataLabel(event, 'key')}` : null,
    auditMetadataLabel(event, 'source') ? `來源 ${auditMetadataLabel(event, 'source')}` : null,
    auditMetadataLabel(event, 'expiredAfterMinutes')
      ? `逾時 ${auditMetadataLabel(event, 'expiredAfterMinutes')} 分`
      : null,
    auditMoneyLabel(event, 'openingBalance') ? `開通 ${auditMoneyLabel(event, 'openingBalance')}` : null,
    event.action === 'register.cash_adjustment' && auditMoneyLabel(event, 'amount')
      ? `金額 ${auditMoneyLabel(event, 'amount')}`
      : null,
    event.action !== 'register.cash_adjustment' && auditMoneyLabel(event, 'amount')
      ? `錢包 ${auditMoneyLabel(event, 'amount')}`
      : null,
    auditMoneyLabel(event, 'balanceAfter') ? `餘額 ${auditMoneyLabel(event, 'balanceAfter')}` : null,
    auditChangeLabel(event, 'inventoryBefore', 'inventoryAfter')
      ? `庫存 ${auditChangeLabel(event, 'inventoryBefore', 'inventoryAfter')}`
      : null,
    auditSignedNumberLabel(event, 'inventoryDelta') ? `庫存差額 ${auditSignedNumberLabel(event, 'inventoryDelta')}` : null,
    auditChangeLabel(event, 'lowStockThresholdBefore', 'lowStockThresholdAfter')
      ? `低庫存 ${auditChangeLabel(event, 'lowStockThresholdBefore', 'lowStockThresholdAfter')}`
      : null,
    auditMoneyChangeLabel(event, 'priceBefore', 'priceAfter')
      ? `售價 ${auditMoneyChangeLabel(event, 'priceBefore', 'priceAfter')}`
      : null,
    auditSignedNumberLabel(event, 'priceDelta') ? `價差 ${auditSignedNumberLabel(event, 'priceDelta')}` : null,
    auditAvailabilityChangeLabel(event) ? `上下架 ${auditAvailabilityChangeLabel(event)}` : null,
    auditChangeLabel(event, 'soldOutUntilBefore', 'soldOutUntilAfter', '未設定')
      ? `暫停 ${auditChangeLabel(event, 'soldOutUntilBefore', 'soldOutUntilAfter', '未設定')}`
      : null,
    auditListLabel(event, 'changedFields') ? `欄位 ${auditListLabel(event, 'changedFields')}` : null,
    auditMetadataLabel(event, 'previousStatus') ? `原狀態 ${auditMetadataLabel(event, 'previousStatus')}` : null,
    auditMetadataLabel(event, 'previousPaymentStatus')
      ? `原付款 ${auditMetadataLabel(event, 'previousPaymentStatus')}`
      : null,
    auditMoneyLabel(event, 'openingCash') ? `開班金 ${auditMoneyLabel(event, 'openingCash')}` : null,
    auditMoneyLabel(event, 'closingCash') ? `實點 ${auditMoneyLabel(event, 'closingCash')}` : null,
    auditMoneyLabel(event, 'expectedCash') ? `預期 ${auditMoneyLabel(event, 'expectedCash')}` : null,
    auditMetadataLabel(event, 'reason') ? `原因 ${auditMetadataLabel(event, 'reason')}` : null,
    auditMetadataLabel(event, 'kind') ? `類型 ${auditMetadataLabel(event, 'kind')}` : null,
    auditMetadataLabel(event, 'staffName') ? `員工 ${auditMetadataLabel(event, 'staffName')}` : null,
    auditMetadataLabel(event, 'roleName') ? `角色 ${auditMetadataLabel(event, 'roleName')}` : null,
    auditMetadataLabel(event, 'eventType') ? `打卡 ${auditMetadataLabel(event, 'eventType')}` : null,
    auditMetadataLabel(event, 'openOrderCount') ? `未交付 ${auditMetadataLabel(event, 'openOrderCount')}` : null,
    auditMetadataLabel(event, 'failedPaymentCount') ? `付款異常 ${auditMetadataLabel(event, 'failedPaymentCount')}` : null,
    auditMetadataLabel(event, 'failedPrintCount') ? `列印失敗 ${auditMetadataLabel(event, 'failedPrintCount')}` : null,
    auditMetadataLabel(event, 'voidedOrderCount') ? `作廢 ${auditMetadataLabel(event, 'voidedOrderCount')}` : null,
    auditMoneyLabel(event, 'refundAmount') ? `退款 ${auditMoneyLabel(event, 'refundAmount')}` : null,
    auditMetadataLabel(event, 'force') === '是' ? '強制鎖單' : null,
    auditMetadataLabel(event, 'forced') === '是' ? '強制關班' : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('、') : '無附加資料'
}

const timeClockQueryOptions = (): {
  limit: number
  startDate: string
  endDate: string
  staffAccountId: string
} | null => {
  if (!timeClockDateRangeValid.value) {
    adminMessage.value = '打卡紀錄日期需為有效區間，且不可超過 93 天'
    return null
  }

  return {
    limit: Math.min(Math.max(Math.trunc(timeClockLimit.value || 300), 1), 2000),
    startDate: timeClockStartDate.value,
    endDate: timeClockEndDate.value,
    staffAccountId: timeClockStaffFilter.value,
  }
}

const loadAdminData = async (): Promise<void> => {
  isLoading.value = true
  adminMessage.value = '讀取後台資料中'

  try {
    const timeClockQuery = timeClockQueryOptions()
    if (!timeClockQuery) {
      return
    }

    const [
      products,
      memberRows,
      report,
      settings,
      events,
      permissionEvents,
      paymentRows,
      stations,
      couponRows,
      reservationRows,
      blacklistRows,
      timeClockRows,
      inventory,
      closeoutDeliveries,
    ] = await Promise.all([
      fetchAdminProducts(),
      fetchAdminMembers(50, memberSearchTerm.value),
      fetchAdminDailyReport(reportDate.value),
      fetchAdminSettings(),
      fetchAdminAuditEvents(auditLimit.value),
      fetchAdminAuditEvents(permissionAuditLimit.value, 'access.verify'),
      fetchAdminPaymentEvents(paymentEventLimit.value, paymentProviderFilter.value),
      fetchAdminStations(),
      fetchAdminCoupons(),
      fetchAdminReservations(),
      fetchAdminReservationBlacklist(),
      fetchAdminTimeClockEntries(timeClockQuery),
      fetchAdminInventory(120),
      fetchAdminCloseoutReportDeliveries(closeoutReportDeliveryLimit.value),
    ])
    productDrafts.value = products.map(toDraft)
    inventoryItems.value = inventory.items
    inventoryConsumptionRules.value = inventory.consumptionRules
    members.value = memberRows
    dailyReport.value = report
    printerSettings.value = clonePrinterSettings(settings.printerSettings)
    accessControl.value = cloneAccessControl(settings.accessControl)
    onlineOrdering.value = cloneOnlineOrdering(settings.onlineOrdering)
    discountSettings.value = cloneDiscountSettings(settings.discountSettings)
    engagementSettings.value = cloneEngagementSettings(settings.engagementSettings)
    floorPlan.value = settings.floorPlan
    auditEvents.value = events
    permissionAuditEvents.value = permissionEvents
    paymentEvents.value = paymentRows
    stationHeartbeats.value = stations
    coupons.value = couponRows
    reservations.value = reservationRows
    reservationBlacklist.value = blacklistRows
    timeClockEntries.value = timeClockRows
    closeoutReportDeliveries.value = closeoutDeliveries
    resetConsumptionDraftDefaults()
    adminMessage.value = `已載入 ${products.length} 個商品、${memberRows.length} 位會員、${couponRows.length} 張券、${discountSettings.value.campaigns.length} 個優惠活動、${reservationRows.length} 筆訂位、${blacklistRows.length} 筆訂位黑名單、${inventory.items.length} 個庫存品項、${inventory.consumptionRules.length} 條自動消耗規則、${report.totalOrders} 張日報訂單、${closeoutDeliveries.length} 筆關帳信、${settings.printerSettings.rules.length} 條出單規則、${accessControl.value.staffAccounts.length} 位員工、${timeClockRows.length} 筆打卡、${permissionEvents.length} 筆權限紀錄、${events.length} 筆稽核、${paymentRows.length} 筆支付事件、${stations.length} 台平板`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '讀取後台資料失敗'
  } finally {
    isLoading.value = false
  }
}

const loadPaymentEvents = async (): Promise<void> => {
  isPaymentEventLoading.value = true
  adminMessage.value = '讀取支付事件中'

  try {
    paymentEvents.value = await fetchAdminPaymentEvents(paymentEventLimit.value, paymentProviderFilter.value)
    adminMessage.value = `已載入 ${paymentEvents.value.length} 筆支付事件`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '支付事件讀取失敗'
  } finally {
    isPaymentEventLoading.value = false
  }
}

const loadAuditEvents = async (): Promise<void> => {
  isAuditLoading.value = true
  adminMessage.value = '讀取稽核紀錄中'

  try {
    auditEvents.value = await fetchAdminAuditEvents(auditLimit.value)
    adminMessage.value = `已載入 ${auditEvents.value.length} 筆稽核紀錄`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '稽核紀錄讀取失敗'
  } finally {
    isAuditLoading.value = false
  }
}

const loadPermissionAuditEvents = async (): Promise<void> => {
  isPermissionAuditLoading.value = true
  adminMessage.value = '讀取權限紀錄中'

  try {
    permissionAuditEvents.value = await fetchAdminAuditEvents(permissionAuditLimit.value, 'access.verify')
    adminMessage.value = `已載入 ${permissionAuditEvents.value.length} 筆權限紀錄`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '權限紀錄讀取失敗'
  } finally {
    isPermissionAuditLoading.value = false
  }
}

const loadStationHeartbeats = async (): Promise<void> => {
  isStationLoading.value = true
  adminMessage.value = '讀取平板在線狀態中'

  try {
    stationHeartbeats.value = await fetchAdminStations()
    adminMessage.value = `已載入 ${stationHeartbeats.value.length} 台平板狀態`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '平板在線狀態讀取失敗'
  } finally {
    isStationLoading.value = false
  }
}

const loadTimeClockEntries = async (): Promise<void> => {
  isTimeClockLoading.value = true
  adminMessage.value = '讀取員工打卡紀錄中'

  try {
    const timeClockQuery = timeClockQueryOptions()
    if (!timeClockQuery) {
      return
    }

    timeClockEntries.value = await fetchAdminTimeClockEntries(timeClockQuery)
    adminMessage.value = `已載入 ${timeClockEntries.value.length} 筆員工打卡紀錄（${timeClockReportSummary.value}）`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '員工打卡紀錄讀取失敗'
  } finally {
    isTimeClockLoading.value = false
  }
}

const loadOperationTimeline = async (): Promise<void> => {
  isOperationLoading.value = true
  adminMessage.value = '讀取營運紀錄中'

  try {
    const [events, stations] = await Promise.all([
      fetchAdminAuditEvents(auditLimit.value),
      fetchAdminStations(),
    ])
    auditEvents.value = events
    stationHeartbeats.value = stations
    adminMessage.value = `已載入 ${filteredOperationTimelineEntries.value.length} 筆營運紀錄`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '營運紀錄讀取失敗'
  } finally {
    isOperationLoading.value = false
  }
}

const loadMembers = async (): Promise<void> => {
  isMemberLoading.value = true
  adminMessage.value = '讀取會員錢包中'

  try {
    members.value = await fetchAdminMembers(50, memberSearchTerm.value)
    adminMessage.value = `已載入 ${members.value.length} 位會員`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '會員錢包讀取失敗'
  } finally {
    isMemberLoading.value = false
  }
}

const loadDailyReport = async (): Promise<void> => {
  isReportLoading.value = true
  adminMessage.value = '讀取營運日報中'

  try {
    dailyReport.value = await fetchAdminDailyReport(reportDate.value)
    adminMessage.value = `已載入 ${dailyReport.value.date} 日報，營收 ${formatCurrency(dailyReport.value.collectedTotal)}`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '營運日報讀取失敗'
  } finally {
    isReportLoading.value = false
  }
}

const loadCloseoutReportDeliveries = async (): Promise<void> => {
  isCloseoutReportDeliveryLoading.value = true
  adminMessage.value = '讀取關帳信紀錄中'

  try {
    closeoutReportDeliveries.value = await fetchAdminCloseoutReportDeliveries(closeoutReportDeliveryLimit.value)
    adminMessage.value = `已載入 ${closeoutReportDeliveries.value.length} 筆關帳信紀錄`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '關帳信紀錄讀取失敗'
  } finally {
    isCloseoutReportDeliveryLoading.value = false
  }
}

const addMember = async (): Promise<void> => {
  savingMemberId.value = 'new'
  adminMessage.value = '建立會員中'

  try {
    const member = await createAdminMember({
      lineUserId: newMember.value.lineUserId.trim(),
      displayName: newMember.value.displayName.trim(),
      phone: newMember.value.phone.trim(),
      customerType: newMember.value.customerType.trim() || '一般顧客',
      pointsBalance: Math.max(0, Math.trunc(Number(newMember.value.pointsBalance) || 0)),
      openingBalance: Math.max(0, Math.trunc(Number(newMember.value.openingBalance) || 0)),
      note: newMember.value.note.trim(),
    })
    members.value = [member, ...members.value.filter((entry) => entry.id !== member.id)]
    resetNewMember()
    adminMessage.value = `${member.displayName} 已建立`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '會員建立失敗'
  } finally {
    savingMemberId.value = null
  }
}

const saveWalletAdjustment = async (member: PosMember): Promise<void> => {
  const draft = walletAdjustmentDraft(member.id)
  const amount = Math.trunc(Number(draft.amount) || 0)
  if (amount === 0) {
    adminMessage.value = '錢包調整金額不可為 0'
    return
  }

  savingMemberId.value = member.id
  adminMessage.value = `調整 ${member.displayName} 錢包`

  try {
    const savedMember = await adjustMemberWallet(member.id, {
      amount,
      note: draft.note.trim(),
    })
    members.value = members.value.map((entry) => (entry.id === savedMember.id ? savedMember : entry))
    walletAdjustmentDrafts.value = {
      ...walletAdjustmentDrafts.value,
      [member.id]: { amount: 0, note: '' },
    }
    adminMessage.value = `${savedMember.displayName} 餘額 ${formatCurrency(savedMember.walletBalance)}`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '錢包調整失敗'
  } finally {
    savingMemberId.value = null
  }
}

const saveProduct = async (product: ProductDraft): Promise<void> => {
  savingProductId.value = product.id
  adminMessage.value = `儲存 ${product.name}`

  const payload: ProductUpdateInput = {
    barcode: product.barcode.trim().replace(/\s+/g, '').toUpperCase(),
    name: product.name,
    category: product.category,
    price: Number(product.price),
    tags: tagsFromText(product.tagsText),
    accent: product.accent,
    isAvailable: product.available,
    sortOrder: Number(product.sortOrder),
    posVisible: product.posVisible,
    onlineVisible: product.onlineVisible,
    qrVisible: product.qrVisible,
    prepStation: product.prepStation,
    printLabel: product.printLabel,
    inventoryCount: numberOrNull(product.inventoryCount),
    lowStockThreshold: numberOrNull(product.lowStockThreshold),
    soldOutUntil: fromDatetimeLocalInput(product.soldOutUntilInput),
    supplyPeriods: product.supplyPeriods.map((period) => ({ ...period, days: [...period.days] })),
    futureOrderAvailable: product.futureOrderAvailable,
  }

  try {
    const savedProduct = await updateProduct(product.id, payload)
    productDrafts.value = productDrafts.value.map((entry) => (entry.id === product.id ? toDraft(savedProduct) : entry))
    adminMessage.value = `${savedProduct.name} 已更新`
    emit('refreshPos')
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '商品更新失敗'
  } finally {
    savingProductId.value = null
  }
}

const upsertLocalConsumptionRule = (rule: InventoryConsumptionRule): void => {
  inventoryConsumptionRules.value = [
    rule,
    ...inventoryConsumptionRules.value.filter((entry) => entry.id !== rule.id),
  ].sort((first, second) => first.sortOrder - second.sortOrder || first.createdAt.localeCompare(second.createdAt))
}

const createConsumptionRule = async (input: InventoryConsumptionRuleInput, successMessage: string): Promise<void> => {
  savingSettingKey.value = 'inventory_consumption'
  adminMessage.value = '儲存庫存自動消耗規則'

  try {
    const rule = await createInventoryConsumptionRule(input)
    upsertLocalConsumptionRule(rule)
    adminMessage.value = successMessage
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '庫存自動消耗規則建立失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const addProductConsumptionRule = async (product: ProductDraft): Promise<void> => {
  const draft = ensureProductConsumptionDraft(product.id)
  if (!draft.itemId) {
    adminMessage.value = '請先建立庫存品項'
    return
  }
  if (!Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) <= 0) {
    adminMessage.value = '消耗量必須大於 0'
    return
  }

  await createConsumptionRule(
    {
      subjectType: 'product',
      productId: product.id,
      itemId: draft.itemId,
      quantity: Number(draft.quantity),
      sortOrder: productConsumptionRules(product.id).length,
      isActive: true,
    },
    `${product.name} 已加入自動消耗 ${inventoryItemName(draft.itemId)}`,
  )
  productConsumptionDrafts.value = {
    ...productConsumptionDrafts.value,
    [product.id]: { itemId: activeInventoryItems.value[0]?.id ?? '', quantity: 1 },
  }
}

const addOptionConsumptionRule = async (): Promise<void> => {
  const draft = optionConsumptionDraft.value
  if (!draft.optionLabel) {
    adminMessage.value = '請選擇註記'
    return
  }
  if (!draft.itemId) {
    adminMessage.value = '請先建立庫存品項'
    return
  }
  if (!Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) <= 0) {
    adminMessage.value = '消耗量必須大於 0'
    return
  }

  await createConsumptionRule(
    {
      subjectType: 'option',
      optionLabel: draft.optionLabel,
      itemId: draft.itemId,
      quantity: Number(draft.quantity),
      sortOrder: optionConsumptionRules.value.length,
      isActive: true,
    },
    `${draft.optionLabel} 已加入自動消耗 ${inventoryItemName(draft.itemId)}`,
  )
  optionConsumptionDraft.value = {
    optionLabel: inventoryOptionLabels.value[0] ?? '',
    itemId: activeInventoryItems.value[0]?.id ?? '',
    quantity: 1,
  }
}

const saveConsumptionRule = async (rule: InventoryConsumptionRule): Promise<void> => {
  savingSettingKey.value = `inventory_consumption:${rule.id}`
  adminMessage.value = '更新庫存自動消耗規則'

  try {
    const savedRule = await updateInventoryConsumptionRule(rule.id, {
      subjectType: rule.subjectType,
      productId: rule.productId,
      optionLabel: rule.optionLabel,
      itemId: rule.itemId,
      quantity: Number(rule.quantity),
      isActive: rule.isActive,
      sortOrder: Number(rule.sortOrder),
    })
    upsertLocalConsumptionRule(savedRule)
    adminMessage.value = '庫存自動消耗規則已更新'
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '庫存自動消耗規則更新失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const deactivateConsumptionRule = async (rule: InventoryConsumptionRule): Promise<void> => {
  savingSettingKey.value = `inventory_consumption:${rule.id}`
  adminMessage.value = '停用庫存自動消耗規則'

  try {
    const savedRule = await updateInventoryConsumptionRule(rule.id, { isActive: false })
    upsertLocalConsumptionRule(savedRule)
    adminMessage.value = '庫存自動消耗規則已停用'
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '庫存自動消耗規則停用失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const addStation = (): void => {
  printerSettings.value.stations.push({
    id: buildId('station'),
    name: '新出單機',
    host: '192.168.1.100',
    port: 9100,
    protocol: 'EZPL over TCP',
    enabled: true,
    autoPrint: false,
  })
}

const removeStation = (stationId: string): void => {
  if (printerSettings.value.stations.length <= 1) {
    adminMessage.value = '至少保留一台出單機'
    return
  }

  const fallbackStation = printerSettings.value.stations.find((station) => station.id !== stationId)
  printerSettings.value.stations = printerSettings.value.stations.filter((station) => station.id !== stationId)
  printerSettings.value.rules = printerSettings.value.rules.map((rule) =>
    rule.stationId === stationId && fallbackStation ? { ...rule, stationId: fallbackStation.id } : rule,
  )
}

const moveStation = (stationId: string, direction: -1 | 1): void => {
  const stations = [...printerSettings.value.stations]
  const index = stations.findIndex((station) => station.id === stationId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= stations.length) {
    return
  }

  const [station] = stations.splice(index, 1)
  if (!station) {
    return
  }

  stations.splice(nextIndex, 0, station)
  printerSettings.value.stations = stations
}

const addPrintRule = (): void => {
  printerSettings.value.rules.push({
    id: buildId('rule'),
    name: '新印單規則',
    serviceMode: 'takeout',
    stationId: stationOptions.value[0]?.id ?? 'bar',
    timings: ['order', 'reprint'],
    categories: ['coffee', 'tea', 'food'],
    itemIds: [],
    countExcludedCategories: [],
    countExcludedItemIds: [],
    copies: 1,
    labelMode: 'label',
    enabled: true,
  })
}

const removePrintRule = (ruleId: string): void => {
  printerSettings.value.rules = printerSettings.value.rules.filter((rule) => rule.id !== ruleId)
}

const printRuleStationIndex = (rule: PrintRuleSetting): number =>
  printerSettings.value.rules.filter((entry) => entry.stationId === rule.stationId).findIndex((entry) => entry.id === rule.id)
const printRuleStationCount = (rule: PrintRuleSetting): number =>
  printerSettings.value.rules.filter((entry) => entry.stationId === rule.stationId).length
const movePrintRule = (ruleId: string, direction: -1 | 1): void => {
  const rules = [...printerSettings.value.rules]
  const index = rules.findIndex((rule) => rule.id === ruleId)
  const rule = rules[index]
  if (!rule) {
    return
  }

  const stationRuleIndexes = rules
    .map((entry, entryIndex) => (entry.stationId === rule.stationId ? entryIndex : -1))
    .filter((entryIndex) => entryIndex >= 0)
  const stationPosition = stationRuleIndexes.indexOf(index)
  const targetIndex = stationRuleIndexes[stationPosition + direction]
  if (stationPosition < 0 || targetIndex === undefined) {
    return
  }

  const targetRule = rules[targetIndex]
  if (!targetRule) {
    return
  }

  rules[index] = targetRule
  rules[targetIndex] = rule
  printerSettings.value.rules = rules
}

const toggleRuleCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  selectPrintRuleCategory(rule, category)
  const categoryProductIds = printRuleProductIdsForCategory(category)
  const itemIds = new Set(rule.itemIds ?? [])
  if (printRuleCategoryFullySelected(rule, category)) {
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

const toggleRuleItem = (rule: PrintRuleSetting, itemId: string): void => {
  const product = sortedPrintRuleProducts.value.find((entry) => entry.id === itemId)
  if (!product) {
    return
  }

  const itemIds = new Set(rule.itemIds ?? [])
  if (printRuleItemSelected(rule, product)) {
    if (rule.categories.includes(product.category)) {
      rule.categories = rule.categories.filter((entry) => entry !== product.category)
      for (const categoryItemId of printRuleProductIdsForCategory(product.category)) {
        if (categoryItemId !== product.id) {
          itemIds.add(categoryItemId)
        }
      }
    }
    itemIds.delete(product.id)
    rule.itemIds = [...itemIds]
    return
  }

  itemIds.add(product.id)
  rule.itemIds = [...itemIds]
  normalizePrintRuleFullCategories(rule)
}

const toggleRuleTiming = (rule: PrintRuleSetting, timing: PrintRuleTiming): void => {
  const timings = new Set(rule.timings ?? defaultPrintRuleTimings)
  if (timings.has(timing)) {
    timings.delete(timing)
  } else {
    timings.add(timing)
  }
  rule.timings = timings.size > 0 ? [...timings] : [timing]
}

const toggleRuleCountCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  selectPrintRuleCountCategory(rule, category)
  const categoryProductIds = printRuleProductIdsForCategory(category)
  const itemIds = new Set(rule.countExcludedItemIds ?? [])
  if (printRuleCountCategoryFullySelected(rule, category)) {
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

const toggleRuleCountItem = (rule: PrintRuleSetting, itemId: string): void => {
  const product = sortedPrintRuleProducts.value.find((entry) => entry.id === itemId)
  if (!product) {
    return
  }

  const itemIds = new Set(rule.countExcludedItemIds ?? [])
  if (printRuleCountItemSelected(rule, product)) {
    if ((rule.countExcludedCategories ?? []).includes(product.category)) {
      rule.countExcludedCategories = (rule.countExcludedCategories ?? []).filter((entry) => entry !== product.category)
      for (const categoryItemId of printRuleProductIdsForCategory(product.category)) {
        if (categoryItemId !== product.id) {
          itemIds.add(categoryItemId)
        }
      }
    }
    itemIds.delete(product.id)
    rule.countExcludedItemIds = [...itemIds]
    return
  }

  itemIds.add(product.id)
  rule.countExcludedItemIds = [...itemIds]
  normalizePrintRuleCountFullCategories(rule)
}

const toggleProductTotalCategory = (category: MenuCategory): void => {
  selectProductTotalCategory(category)
  const settings = engagementSettings.value.productTotalDisplay
  const categoryProductIds = printRuleProductIdsForCategory(category)
  const itemIds = new Set(settings.excludedItemIds)
  if (productTotalCategoryFullyExcluded(category)) {
    settings.excludedCategories = settings.excludedCategories.filter((entry) => entry !== category)
    for (const itemId of categoryProductIds) {
      itemIds.delete(itemId)
    }
    settings.excludedItemIds = [...itemIds]
    return
  }

  settings.excludedCategories = [...new Set([...settings.excludedCategories, category])]
  for (const itemId of categoryProductIds) {
    itemIds.delete(itemId)
  }
  settings.excludedItemIds = [...itemIds]
}

const toggleProductTotalItem = (itemId: string): void => {
  const product = sortedPrintRuleProducts.value.find((entry) => entry.id === itemId)
  if (!product) {
    return
  }

  const settings = engagementSettings.value.productTotalDisplay
  const itemIds = new Set(settings.excludedItemIds)
  if (productTotalItemExcluded(product)) {
    if (settings.excludedCategories.includes(product.category)) {
      settings.excludedCategories = settings.excludedCategories.filter((entry) => entry !== product.category)
      for (const categoryItemId of printRuleProductIdsForCategory(product.category)) {
        if (categoryItemId !== product.id) {
          itemIds.add(categoryItemId)
        }
      }
    }
    itemIds.delete(product.id)
    settings.excludedItemIds = [...itemIds]
    return
  }

  itemIds.add(product.id)
  settings.excludedItemIds = [...itemIds]
  normalizeProductTotalFullCategories()
}

const toggleServiceChargeCategory = (category: MenuCategory): void => {
  selectServiceChargeCategory(category)
  const settings = engagementSettings.value.serviceCharge
  const categoryProductIds = printRuleProductIdsForCategory(category)
  const itemIds = new Set(settings.excludedItemIds)
  if (serviceChargeCategoryFullyExcluded(category)) {
    settings.excludedCategories = settings.excludedCategories.filter((entry) => entry !== category)
    for (const itemId of categoryProductIds) {
      itemIds.delete(itemId)
    }
    settings.excludedItemIds = [...itemIds]
    return
  }

  settings.excludedCategories = [...new Set([...settings.excludedCategories, category])]
  for (const itemId of categoryProductIds) {
    itemIds.delete(itemId)
  }
  settings.excludedItemIds = [...itemIds]
}

const toggleServiceChargeItem = (itemId: string): void => {
  const product = sortedPrintRuleProducts.value.find((entry) => entry.id === itemId)
  if (!product) {
    return
  }

  const settings = engagementSettings.value.serviceCharge
  const itemIds = new Set(settings.excludedItemIds)
  if (serviceChargeItemExcluded(product)) {
    if (settings.excludedCategories.includes(product.category)) {
      settings.excludedCategories = settings.excludedCategories.filter((entry) => entry !== product.category)
      for (const categoryItemId of printRuleProductIdsForCategory(product.category)) {
        if (categoryItemId !== product.id) {
          itemIds.add(categoryItemId)
        }
      }
    }
    itemIds.delete(product.id)
    settings.excludedItemIds = [...itemIds]
    return
  }

  itemIds.add(product.id)
  settings.excludedItemIds = [...itemIds]
  normalizeServiceChargeFullCategories()
}

const savePrinterSettings = async (): Promise<void> => {
  savingSettingKey.value = 'printer_settings'
  adminMessage.value = '儲存出單機設定'

  try {
    const settingsForSave: PrinterSettings = {
      stations: printerSettings.value.stations.map((station) => ({ ...station })),
      rules: printerRulesInPrintOrder(printerSettings.value).map((rule) => ({
        ...rule,
        timings: [...new Set(rule.timings ?? defaultPrintRuleTimings)],
        categories: [...new Set(rule.categories)],
        itemIds: [...new Set(rule.itemIds ?? [])],
        countExcludedCategories: [...new Set(rule.countExcludedCategories ?? [])],
        countExcludedItemIds: [...new Set(rule.countExcludedItemIds ?? [])],
        copies: Math.min(5, Math.max(1, Number(rule.copies) || 1)),
      })),
    }
    const savedSettings = await updateAdminSetting<PrinterSettings>('printer_settings', settingsForSave)
    printerSettings.value = clonePrinterSettings(savedSettings)
    adminMessage.value = '出單機設定已更新'
    emit('refreshPos')
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '出單機設定更新失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const downloadTableQrCards = async (tableId?: string): Promise<void> => {
  const sources = tableId
    ? tableQrCardSources.value.filter((source) => source.table.id === tableId)
    : tableQrCardSources.value

  if (sources.length === 0) {
    tableQrDownloadMessage.value = '尚未建立桌位，請先在桌位地圖新增桌位。'
    return
  }

  const firstSource = sources[0]
  tableQrDownloadMessage.value = sources.length === 1
    ? `正在產生 ${firstSource?.table.label ?? '單桌'} 桌卡`
    : `正在產生 ${sources.length} 張桌卡`

  try {
    await downloadTableQrCardsHtml(sources, onlineOrdering.value)
    tableQrDownloadMessage.value = sources.length === 1
      ? `${firstSource?.table.label ?? '單桌'} 桌卡已產生`
      : `${sources.length} 張桌卡已產生`
  } catch (error) {
    tableQrDownloadMessage.value = error instanceof Error ? error.message : '桌卡產生失敗'
  }
}

const clearTableQrLogo = (): void => {
  onlineOrdering.value.tableQrCode.logoDataUrl = ''
  tableQrDownloadMessage.value = '桌卡 Logo 已清除'
}

const handleTableQrLogoUpload = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    tableQrDownloadMessage.value = '請上傳 JPG 或 PNG 圖檔。'
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : ''
    if (!result.startsWith('data:image/')) {
      tableQrDownloadMessage.value = 'Logo 圖檔讀取失敗，請重新選擇 JPG 或 PNG。'
      input.value = ''
      return
    }

    if (result.length > 120_000) {
      tableQrDownloadMessage.value = 'Logo 圖檔過大，請使用 90x90px 左右的 JPG 或 PNG。'
      input.value = ''
      return
    }

    onlineOrdering.value.tableQrCode.logoDataUrl = result
    tableQrDownloadMessage.value = '桌卡 Logo 已載入，儲存線上設定後會同步到其他平板。'
  }
  reader.onerror = () => {
    tableQrDownloadMessage.value = 'Logo 圖檔讀取失敗，請重新選擇 JPG 或 PNG。'
  }
  reader.readAsDataURL(file)
}

const removeStoreCoverImage = (imageIndex: number): void => {
  onlineOrdering.value.storeProfile.coverImageDataUrls = onlineOrdering.value.storeProfile.coverImageDataUrls.filter(
    (_imageUrl, index) => index !== imageIndex,
  )
  onlineStoreProfileMessage.value = '店家封面圖片已移除，儲存線上設定後會同步。'
}

const handleStoreCoverImageUpload = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length === 0) {
    return
  }

  const existingImages = onlineOrdering.value.storeProfile.coverImageDataUrls
  const availableSlots = Math.max(0, 4 - existingImages.length)
  if (availableSlots === 0) {
    onlineStoreProfileMessage.value = '最多可上傳 4 張店家封面圖片。'
    input.value = ''
    return
  }

  const selectedFiles = files.slice(0, availableSlots)
  if (selectedFiles.some((file) => !['image/jpeg', 'image/png'].includes(file.type))) {
    onlineStoreProfileMessage.value = '店家封面圖片請使用 JPG 或 PNG。'
    input.value = ''
    return
  }

  Promise.all(
    selectedFiles.map((file) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : ''
          if (!result.startsWith('data:image/')) {
            reject(new Error('圖片讀取失敗，請重新選擇 JPG 或 PNG。'))
            return
          }

          if (result.length > 600_000) {
            reject(new Error('單張封面圖片過大，請壓縮後再上傳。'))
            return
          }

          resolve(result)
        }
        reader.onerror = () => reject(new Error('圖片讀取失敗，請重新選擇 JPG 或 PNG。'))
        reader.readAsDataURL(file)
      }),
    ),
  )
    .then((imageUrls) => {
      onlineOrdering.value.storeProfile.coverImageDataUrls = [...existingImages, ...imageUrls].slice(0, 4)
      onlineStoreProfileMessage.value = `已載入 ${imageUrls.length} 張封面圖片，儲存線上設定後會同步。`
    })
    .catch((error) => {
      onlineStoreProfileMessage.value = error instanceof Error ? error.message : '店家封面圖片讀取失敗'
    })
    .finally(() => {
      input.value = ''
    })
}

const saveOnlineOrdering = async (): Promise<void> => {
  savingSettingKey.value = 'online_ordering'
  adminMessage.value = '儲存線上點餐設定'

  try {
    const savedSettings = await updateAdminSetting<OnlineOrderingSettings>(
      'online_ordering',
      {
        ...onlineOrdering.value,
        averagePrepMinutes: Math.min(Math.max(Math.trunc(Number(onlineOrdering.value.averagePrepMinutes) || 0), 0), 180),
        unconfirmedReminderMinutes: Math.min(
          Math.max(Math.trunc(Number(onlineOrdering.value.unconfirmedReminderMinutes) || 0), 0),
          120,
        ),
        notificationRepeatMode:
          onlineOrdering.value.notificationRepeatMode === 'once' ? 'once' : 'continuous',
        notificationVolume: Math.min(Math.max(Math.trunc(Number(onlineOrdering.value.notificationVolume) || 0), 0), 100),
        serviceModeAvailability: {
          'dine-in': onlineOrdering.value.serviceModeAvailability['dine-in'] !== false,
          takeout: onlineOrdering.value.serviceModeAvailability.takeout !== false,
          delivery: onlineOrdering.value.serviceModeAvailability.delivery !== false,
        },
        checkoutInstructions: onlineOrdering.value.checkoutInstructions.trim().slice(0, 500),
        showTaxIdField: Boolean(onlineOrdering.value.showTaxIdField),
        showCarrierBarcodeField: Boolean(onlineOrdering.value.showCarrierBarcodeField),
        showDonationCodeField: Boolean(onlineOrdering.value.showDonationCodeField),
        scheduledOrderIntervalMinutes: Math.min(
          Math.max(Math.trunc(Number(onlineOrdering.value.scheduledOrderIntervalMinutes) || 15), 5),
          120,
        ),
        scheduledOrderMaxDays: Math.min(Math.max(Math.trunc(Number(onlineOrdering.value.scheduledOrderMaxDays) || 1), 1), 60),
        scheduledOrderTimeWindows: onlineOrdering.value.scheduledOrderTimeWindows.map((timeWindow) => ({
          id: timeWindow.id,
          label: timeWindow.label.trim().slice(0, 24) || '取餐時段',
          days: [...new Set(timeWindow.days.filter((day) => day >= 0 && day <= 6))],
          start: timeWindow.start,
          end: timeWindow.end,
          allDay: Boolean(timeWindow.allDay),
        })),
        paymentMethods: onlineOrdering.value.paymentMethods.map((method) => ({
          id: method.id,
          label: method.label.trim().slice(0, 24) || method.id,
          enabled: Boolean(method.enabled),
          opensCashDrawer: Boolean(method.opensCashDrawer),
        })),
        deliveryFeeAmount: Math.min(Math.max(Math.trunc(Number(onlineOrdering.value.deliveryFeeAmount) || 0), 0), 999_999),
        deliveryMinimumSubtotal: Math.min(
          Math.max(Math.trunc(Number(onlineOrdering.value.deliveryMinimumSubtotal) || 0), 0),
          999_999,
        ),
        freeDeliveryThreshold: Math.min(Math.max(Math.trunc(Number(onlineOrdering.value.freeDeliveryThreshold) || 0), 0), 999_999),
        deliveryTravelMinutes: Math.min(Math.max(Math.trunc(Number(onlineOrdering.value.deliveryTravelMinutes) || 0), 0), 180),
        sessionQrCode: {
          autoPrint: Boolean(onlineOrdering.value.sessionQrCode.autoPrint),
          stationId: onlineOrdering.value.sessionQrCode.stationId.trim().slice(0, 80),
          logoText:
            onlineOrdering.value.sessionQrCode.logoText.trim().slice(0, 40) ||
            defaultOnlineOrderingSettings().sessionQrCode.logoText,
        },
        tableQrCode: {
          theme: tableQrThemeOptions.some((option) => option.value === onlineOrdering.value.tableQrCode.theme)
            ? onlineOrdering.value.tableQrCode.theme
            : defaultOnlineOrderingSettings().tableQrCode.theme,
          logoText:
            onlineOrdering.value.tableQrCode.logoText.trim().slice(0, 40) ||
            defaultOnlineOrderingSettings().tableQrCode.logoText,
          logoDataUrl: onlineOrdering.value.tableQrCode.logoDataUrl.startsWith('data:image/')
            ? onlineOrdering.value.tableQrCode.logoDataUrl.slice(0, 120_000)
            : '',
        },
        storeProfile: {
          name:
            onlineOrdering.value.storeProfile.name.trim().slice(0, 60) ||
            defaultOnlineOrderingSettings().storeProfile.name,
          phone: onlineOrdering.value.storeProfile.phone.trim().slice(0, 32),
          address: onlineOrdering.value.storeProfile.address.trim().slice(0, 160),
          notice: onlineOrdering.value.storeProfile.notice.trim().slice(0, 3000),
          noticeExpanded: Boolean(onlineOrdering.value.storeProfile.noticeExpanded),
          coverImageDataUrls: onlineOrdering.value.storeProfile.coverImageDataUrls
            .filter((imageUrl) => imageUrl.startsWith('data:image/'))
            .map((imageUrl) => imageUrl.slice(0, 600_000))
            .slice(0, 4),
        },
        notificationRouting: {
          stations: onlineOrdering.value.notificationRouting.stations
            .filter((station) => station.stationId.trim())
            .slice(0, 32)
            .map((station) => ({
              stationId: station.stationId.trim().slice(0, 80),
              stationLabel: (station.stationLabel.trim() || station.stationId.trim()).slice(0, 80),
              enabled: station.enabled !== false,
              serviceModes: {
                'dine-in': station.serviceModes['dine-in'] !== false,
                takeout: station.serviceModes.takeout !== false,
                delivery: station.serviceModes.delivery !== false,
              },
              tableIds: [...new Set(station.tableIds.map((tableId) => tableId.trim().toUpperCase()).filter(Boolean))]
                .slice(0, 80),
              soundEnabled: station.soundEnabled !== false,
              notificationRepeatMode: station.notificationRepeatMode === 'once' ? 'once' : 'continuous',
              notificationVolume: Math.min(Math.max(Math.trunc(Number(station.notificationVolume) || 0), 0), 100),
            })),
        },
        dineInTimeLimit: normalizeDineInTimeLimitSettings({
          enabled: Boolean(onlineOrdering.value.dineInTimeLimit.enabled),
          mealMinutes: onlineOrdering.value.dineInTimeLimit.mealMinutes,
          lastOrderBeforeEndMinutes: onlineOrdering.value.dineInTimeLimit.lastOrderBeforeEndMinutes,
          holidayRules: onlineOrdering.value.dineInTimeLimit.holidayRules,
        }, defaultOnlineOrderingSettings().dineInTimeLimit),
        dineInCheckout: {
          mode: onlineOrdering.value.dineInCheckout.mode === 'prepaid' ? 'prepaid' : 'postpaid',
        },
        commentFields: {
          itemNotes: onlineOrdering.value.commentFields.itemNotes === 'hidden' ? 'hidden' : 'shown',
          orderNote:
            onlineOrdering.value.commentFields.orderNote === 'hidden' || onlineOrdering.value.commentFields.orderNote === 'required'
              ? onlineOrdering.value.commentFields.orderNote
              : 'optional',
          orderNotePlaceholder:
            onlineOrdering.value.commentFields.orderNotePlaceholder.trim().slice(0, 80) ||
            defaultOnlineOrderingSettings().commentFields.orderNotePlaceholder,
        },
        pauseMessage: onlineOrdering.value.pauseMessage.trim() || defaultOnlineOrderingSettings().pauseMessage,
        menuCategories: onlineOrdering.value.menuCategories,
        availableOptionChoices: onlineOrdering.value.availableOptionChoices,
        menuOptionGroups: onlineOrdering.value.menuOptionGroups,
        productOptionAssignments: onlineOrdering.value.productOptionAssignments,
        comboProductAssignments: onlineOrdering.value.comboProductAssignments,
        noteSupplyStatuses: onlineOrdering.value.noteSupplyStatuses,
      },
    )
    onlineOrdering.value = cloneOnlineOrdering(savedSettings)
    adminMessage.value = '線上點餐設定已更新'
    emit('refreshPos')
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '線上點餐設定更新失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const normalizedDiscountCampaignsForSave = (): DiscountCampaign[] =>
  discountSettings.value.campaigns.map((campaign, index) => ({
    ...campaign,
    id: campaign.id.trim().replace(/\s+/g, '-').slice(0, 80) || `discount-${index + 1}`,
    name: campaign.name.trim().slice(0, 80) || `優惠活動 ${index + 1}`,
    discountValue: campaign.valueType === 'percentage'
      ? Math.min(Math.max(Math.trunc(Number(campaign.discountValue) || 0), 0), 100)
      : Math.min(Math.max(Math.trunc(Number(campaign.discountValue) || 0), 0), 999_999),
    minimumSubtotal: Math.min(Math.max(Math.trunc(Number(campaign.minimumSubtotal) || 0), 0), 999_999),
    sortOrder: index + 1,
    serviceModes: campaign.serviceModes.length > 0 ? campaign.serviceModes : ['dine-in', 'takeout', 'delivery'],
    categories: [...new Set(campaign.categories.filter(Boolean))],
    productIds: [...new Set(campaign.productIds.filter(Boolean))],
    schedule: {
      enabled: Boolean(campaign.schedule.enabled),
      days: campaign.schedule.days.length > 0
        ? [...new Set(campaign.schedule.days.filter((day) => day >= 0 && day <= 6))]
        : [1, 2, 3, 4, 5, 6, 0],
      start: campaign.schedule.start || '00:00',
      end: campaign.schedule.end || '23:59',
      allDay: Boolean(campaign.schedule.allDay),
    },
    usage: {
      posEnabled: campaign.usage.posEnabled !== false,
      posAutoApply: campaign.kind === 'automatic' && campaign.usage.posAutoApply === true,
      onlineEnabled: campaign.kind === 'automatic' && campaign.usage.onlineEnabled === true,
      requiresVerification: campaign.usage.requiresVerification === true,
    },
  }))

const saveDiscountSettings = async (): Promise<void> => {
  savingSettingKey.value = 'discount_settings'
  adminMessage.value = '儲存優惠活動設定'

  try {
    const savedSettings = await updateAdminSetting<DiscountSettings>('discount_settings', {
      campaigns: normalizedDiscountCampaignsForSave(),
    })
    discountSettings.value = cloneDiscountSettings(savedSettings)
    adminMessage.value = '優惠活動已更新，POS 與線上訂單會依最新設定重新計算'
    emit('refreshPos')
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '優惠活動更新失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const addDiscountCampaign = (kind: DiscountCampaign['kind']): void => {
  const nextIndex = discountSettings.value.campaigns.length + 1
  discountSettings.value.campaigns.push({
    id: buildId(kind === 'automatic' ? 'auto-discount' : 'manual-discount'),
    name: kind === 'automatic' ? `自動優惠 ${nextIndex}` : `手動優惠 ${nextIndex}`,
    kind,
    scope: 'whole-order',
    valueType: 'amount',
    discountValue: kind === 'automatic' ? 20 : 0,
    minimumSubtotal: 0,
    enabled: true,
    sortOrder: nextIndex,
    serviceModes: ['dine-in', 'takeout', 'delivery'],
    categories: [],
    productIds: [],
    schedule: {
      enabled: false,
      days: [1, 2, 3, 4, 5, 6, 0],
      start: '00:00',
      end: '23:59',
      allDay: true,
    },
    usage: {
      posEnabled: true,
      posAutoApply: kind === 'automatic',
      onlineEnabled: kind === 'automatic',
      requiresVerification: kind === 'manual',
    },
  })
}

const removeDiscountCampaign = (campaignId: string): void => {
  if (discountSettings.value.campaigns.length <= 1) {
    adminMessage.value = '至少保留 1 個優惠活動'
    return
  }

  discountSettings.value.campaigns = discountSettings.value.campaigns.filter((campaign) => campaign.id !== campaignId)
}

const moveDiscountCampaign = (campaignId: string, direction: -1 | 1): void => {
  const campaigns = [...discountSettings.value.campaigns]
  const index = campaigns.findIndex((campaign) => campaign.id === campaignId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= campaigns.length) {
    return
  }

  const [campaign] = campaigns.splice(index, 1)
  if (!campaign) {
    return
  }
  campaigns.splice(nextIndex, 0, campaign)
  discountSettings.value.campaigns = campaigns.map((entry, entryIndex) => ({ ...entry, sortOrder: entryIndex + 1 }))
}

const toggleDiscountCampaignServiceMode = (campaign: DiscountCampaign, mode: ServiceMode): void => {
  const modes = new Set(campaign.serviceModes)
  if (modes.has(mode)) {
    modes.delete(mode)
  } else {
    modes.add(mode)
  }
  campaign.serviceModes = Array.from(modes)
}

const toggleDiscountCampaignDay = (campaign: DiscountCampaign, day: number): void => {
  const days = new Set(campaign.schedule.days)
  if (days.has(day)) {
    days.delete(day)
  } else {
    days.add(day)
  }
  campaign.schedule.days = Array.from(days).sort((first, second) => first - second)
}

const toggleDiscountCampaignCategory = (campaign: DiscountCampaign, category: MenuCategory): void => {
  const categories = new Set(campaign.categories)
  if (categories.has(category)) {
    categories.delete(category)
  } else {
    categories.add(category)
  }
  campaign.categories = Array.from(categories)
}

const toggleDiscountCampaignProduct = (campaign: DiscountCampaign, productId: string): void => {
  const productIds = new Set(campaign.productIds)
  if (productIds.has(productId)) {
    productIds.delete(productId)
  } else {
    productIds.add(productId)
  }
  campaign.productIds = Array.from(productIds)
}

const moveOnlinePaymentMethod = (methodId: string, direction: -1 | 1): void => {
  const methods = [...onlineOrdering.value.paymentMethods]
  const index = methods.findIndex((method) => method.id === methodId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= methods.length) {
    return
  }

  const [method] = methods.splice(index, 1)
  if (!method) {
    return
  }

  methods.splice(nextIndex, 0, method)
  onlineOrdering.value.paymentMethods = methods
}

const onlinePaymentMethodPosition = (methodId: string): number =>
  onlineOrdering.value.paymentMethods.findIndex((method) => method.id === methodId)

const addScheduledOrderTimeWindow = (): void => {
  onlineOrdering.value.scheduledOrderTimeWindows.push({
    id: buildId('pickup-window'),
    label: `取餐時段 ${onlineOrdering.value.scheduledOrderTimeWindows.length + 1}`,
    days: [1, 2, 3, 4, 5],
    start: '11:00',
    end: '20:00',
    allDay: false,
  })
}

const deleteScheduledOrderTimeWindow = (windowId: string): void => {
  if (onlineOrdering.value.scheduledOrderTimeWindows.length <= 1) {
    adminMessage.value = '至少保留 1 個取餐時段'
    return
  }

  onlineOrdering.value.scheduledOrderTimeWindows = onlineOrdering.value.scheduledOrderTimeWindows.filter(
    (timeWindow) => timeWindow.id !== windowId,
  )
}

const toggleScheduledOrderWindowDay = (timeWindow: OnlineScheduledOrderTimeWindow, day: number): void => {
  const daySet = new Set(timeWindow.days)
  if (daySet.has(day)) {
    daySet.delete(day)
  } else {
    daySet.add(day)
  }

  timeWindow.days = [...daySet].sort((first, second) => first - second)
}

const addDineInTimeLimitHolidayRule = (): void => {
  const nextRule = defaultDineInTimeLimitHolidayRule(onlineOrdering.value.dineInTimeLimit.holidayRules.length + 1)
  onlineOrdering.value.dineInTimeLimit.holidayRules.push({
    ...nextRule,
    id: buildId('dine-holiday'),
  })
}

const deleteDineInTimeLimitHolidayRule = (ruleId: string): void => {
  onlineOrdering.value.dineInTimeLimit.holidayRules = onlineOrdering.value.dineInTimeLimit.holidayRules.filter(
    (rule) => rule.id !== ruleId,
  )
}

const toggleDineInTimeLimitHolidayDay = (rule: OnlineDineInTimeLimitRule, day: number): void => {
  const daySet = new Set(rule.days)
  if (daySet.has(day)) {
    daySet.delete(day)
  } else {
    daySet.add(day)
  }

  rule.days = [...daySet].sort((first, second) => first - second)
}

const addOrderLabel = (): void => {
  engagementSettings.value.orderLabels.push({
    id: buildId('label'),
    label: '新標籤',
    color: '#0f766e',
  })
}

const removeOrderLabel = (labelId: string): void => {
  engagementSettings.value.orderLabels = engagementSettings.value.orderLabels.filter((label) => label.id !== labelId)
}

const addRecommendationRule = (): void => {
  engagementSettings.value.recommendations.push({
    id: buildId('recommend'),
    title: '新推薦',
    trigger: 'any',
    productIds: [],
    enabled: true,
  })
}

const addCheckoutCounterBook = (): void => {
  const nextIndex = engagementSettings.value.checkoutCounters.books.length + 1
  engagementSettings.value.checkoutCounters.books.push({
    id: buildId('book'),
    name: `帳本 ${nextIndex}`,
    stationIds: [],
    printStationId: stationOptions.value[0]?.id ?? '',
    cashDrawerDeviceId: engagementSettings.value.hardwareDevices.find((device) => device.kind === 'cash-drawer')?.id ?? '',
    paymentDeviceIds: [],
    enabled: true,
  })
}

const removeCheckoutCounterBook = (bookId: string): void => {
  if (engagementSettings.value.checkoutCounters.books.length <= 1) {
    return
  }

  engagementSettings.value.checkoutCounters.books = engagementSettings.value.checkoutCounters.books.filter((book) => book.id !== bookId)
  if (engagementSettings.value.checkoutCounters.defaultBookId === bookId) {
    engagementSettings.value.checkoutCounters.defaultBookId = engagementSettings.value.checkoutCounters.books[0]?.id ?? 'main'
  }
}

const checkoutCounterStationText = (book: CustomerEngagementSettings['checkoutCounters']['books'][number]): string =>
  book.stationIds.join(', ')

const checkoutCounterPaymentDeviceText = (book: CustomerEngagementSettings['checkoutCounters']['books'][number]): string =>
  book.paymentDeviceIds.join(', ')

const updateCheckoutCounterStations = (
  book: CustomerEngagementSettings['checkoutCounters']['books'][number],
  value: string,
): void => {
  book.stationIds = [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))].slice(0, 20)
}

const updateCheckoutCounterPaymentDevices = (
  book: CustomerEngagementSettings['checkoutCounters']['books'][number],
  value: string,
): void => {
  book.paymentDeviceIds = [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))].slice(0, 20)
}

const appOperationChildStationText = (): string =>
  engagementSettings.value.appOperation.childStationIds.join(', ')

const updateAppOperationChildStations = (value: string): void => {
  const hostStationId = engagementSettings.value.appOperation.hostStationId.trim()
  const rawMaxChildStations = Number(engagementSettings.value.appOperation.maxChildStations)
  const maxChildStations = Number.isFinite(rawMaxChildStations)
    ? Math.min(Math.max(Math.trunc(rawMaxChildStations), 0), 20)
    : 5
  engagementSettings.value.appOperation.childStationIds = [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))]
    .filter((stationId) => stationId !== hostStationId)
    .slice(0, maxChildStations)
}

const addSupplyWindow = (): void => {
  engagementSettings.value.supplyRules.defaultPeriods.push({
    id: buildId('window'),
    label: '新時段',
    days: [1, 2, 3, 4, 5],
    start: '09:00',
    end: '18:00',
  })
}

const removeSupplyWindow = (windowId: string): void => {
  engagementSettings.value.supplyRules.defaultPeriods =
    engagementSettings.value.supplyRules.defaultPeriods.filter((period) => period.id !== windowId)
}

const addReservationSpecialDate = (mode: ReservationSpecialDateRule['mode'] = 'closed'): void => {
  const date = toDateInput()
  engagementSettings.value.reservationWebsite.specialDates.push({
    id: buildId('reservation-special'),
    label: mode === 'closed' ? '不開放訂位' : '特殊訂位日',
    startDate: date,
    endDate: date,
    mode,
    start: '09:00',
    end: '20:00',
  })
}

const removeReservationSpecialDate = (ruleId: string): void => {
  engagementSettings.value.reservationWebsite.specialDates =
    engagementSettings.value.reservationWebsite.specialDates.filter((rule) => rule.id !== ruleId)
}

const isReservationTableOnline = (tableId: string): boolean =>
  engagementSettings.value.reservationWebsite.onlineTableIds.length === 0 ||
  engagementSettings.value.reservationWebsite.onlineTableIds.includes(tableId)

const setReservationTableOnline = (tableId: string, event: Event): void => {
  const enabled = (event.target as HTMLInputElement | null)?.checked === true
  const currentIds = engagementSettings.value.reservationWebsite.onlineTableIds.length === 0
    ? floorPlan.value.tables.map((table) => table.id)
    : engagementSettings.value.reservationWebsite.onlineTableIds
  const nextIds = new Set(currentIds)
  if (enabled) {
    nextIds.add(tableId)
  } else {
    nextIds.delete(tableId)
  }
  engagementSettings.value.reservationWebsite.onlineTableIds = [...nextIds]
}

const updateEngagementCustomerTypes = (event: Event): void => {
  const value = (event.target as HTMLInputElement | null)?.value ?? ''
  engagementSettings.value.customerTypes = value
    .split(/[，,]/)
    .map((type) => type.trim())
    .filter(Boolean)
}

const saveEngagementSettings = async (): Promise<void> => {
  savingSettingKey.value = 'engagement_settings'
  adminMessage.value = '儲存 iCHEF 補齊設定'

  try {
    const savedSettings = await updateAdminSetting<CustomerEngagementSettings>(
      'engagement_settings',
      engagementSettings.value,
    )
    engagementSettings.value = cloneEngagementSettings(savedSettings)
    adminMessage.value = 'iCHEF 補齊設定已更新'
    emit('refreshPos')
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : 'iCHEF 補齊設定更新失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const addCoupon = async (): Promise<void> => {
  savingSettingKey.value = 'coupon'
  adminMessage.value = '建立優惠券中'

  try {
    const coupon = await createAdminCoupon({
      memberId: newCoupon.value.memberId || null,
      code: newCoupon.value.code,
      title: newCoupon.value.title,
      discountAmount: Math.max(0, Math.trunc(Number(newCoupon.value.discountAmount) || 0)),
      discountPercent: Math.max(0, Math.trunc(Number(newCoupon.value.discountPercent) || 0)),
      expiresAt: fromDatetimeLocalInput(newCoupon.value.expiresAt),
    })
    coupons.value = [coupon, ...coupons.value]
    newCoupon.value = {
      memberId: '',
      code: '',
      title: '',
      discountAmount: 0,
      discountPercent: 0,
      expiresAt: '',
    }
    adminMessage.value = `${coupon.title} 已建立`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '優惠券建立失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const addReservation = async (): Promise<void> => {
  const blacklistEntry = reservationDraftBlacklistEntry.value
  const phoneKey = normalizeReservationPhoneKey(newReservation.value.customerPhone)
  if (blacklistEntry && pendingBlacklistedReservationPhone.value !== phoneKey) {
    pendingBlacklistedReservationPhone.value = phoneKey
    adminMessage.value = `${newReservation.value.customerPhone} 在訂位黑名單中：${blacklistEntry.reason || blacklistEntry.note || '請確認是否仍要建立訂位'}。若仍要建立，請再次按建立訂位。`
    return
  }

  isIchefLoading.value = true
  adminMessage.value = '建立訂位中'

  try {
    const reservation = await createAdminReservation({
      customerName: newReservation.value.customerName.trim() || '訂位客',
      customerPhone: newReservation.value.customerPhone.trim(),
      partySize: Math.max(1, Math.trunc(Number(newReservation.value.partySize) || 2)),
      reservedAt: fromDatetimeLocalInput(newReservation.value.reservedAt) ?? '',
      status: 'booked',
      importantLabel: newReservation.value.importantLabel.trim(),
      preOrder: [],
      note: newReservation.value.note.trim(),
    })
    reservations.value = [reservation, ...reservations.value].sort((first, second) =>
      new Date(first.reservedAt).getTime() - new Date(second.reservedAt).getTime(),
    )
    newReservation.value = {
      customerName: '',
      customerPhone: '',
      partySize: 2,
      reservedAt: '',
      importantLabel: '',
      note: '',
    }
    pendingBlacklistedReservationPhone.value = ''
    adminMessage.value = `${reservation.customerName} 訂位已建立`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '訂位建立失敗'
  } finally {
    isIchefLoading.value = false
  }
}

const addReservationBlacklistEntry = async (): Promise<void> => {
  savingSettingKey.value = 'reservation_blacklist'
  adminMessage.value = '新增訂位黑名單中'

  try {
    const entry = await createAdminReservationBlacklistEntry({
      phone: newBlacklistEntry.value.phone.trim(),
      customerName: newBlacklistEntry.value.customerName.trim(),
      reason: newBlacklistEntry.value.reason.trim() || '線上訂位黑名單',
      note: newBlacklistEntry.value.note.trim(),
      isActive: true,
    })
    reservationBlacklist.value = [
      entry,
      ...reservationBlacklist.value.filter((candidate) => candidate.id !== entry.id),
    ]
    newBlacklistEntry.value = {
      phone: '',
      customerName: '',
      reason: '線上訂位黑名單',
      note: '',
    }
    adminMessage.value = `${entry.phone} 已加入訂位黑名單`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '訂位黑名單新增失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const replaceReservationBlacklistEntry = (entry: ReservationBlacklistEntry): void => {
  reservationBlacklist.value = [
    entry,
    ...reservationBlacklist.value.filter((candidate) => candidate.id !== entry.id),
  ].sort((first, second) => Number(second.isActive) - Number(first.isActive))
}

const setReservationBlacklistStatus = async (
  entry: ReservationBlacklistEntry,
  isActive: boolean,
): Promise<void> => {
  savingSettingKey.value = `reservation_blacklist_${entry.id}`
  adminMessage.value = isActive ? '恢復訂位黑名單中' : '解除訂位黑名單中'

  try {
    const saved = await updateAdminReservationBlacklistEntry(entry.id, { isActive })
    replaceReservationBlacklistEntry(saved)
    adminMessage.value = `${saved.phone} 已${saved.isActive ? '列入' : '解除'}訂位黑名單`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '訂位黑名單更新失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const toggleReservationBlacklistForReservation = async (reservation: PosReservation): Promise<void> => {
  const existing = findReservationBlacklistEntry(reservation.customerPhone)
  if (existing) {
    await setReservationBlacklistStatus(existing, !existing.isActive)
    return
  }

  savingSettingKey.value = `reservation_blacklist_reservation_${reservation.id}`
  adminMessage.value = '從訂位加入黑名單中'

  try {
    const entry = await createAdminReservationBlacklistEntry({
      phone: reservation.customerPhone,
      customerName: reservation.customerName,
      reason: reservation.importantLabel || '訂位細節加入',
      note: reservation.note,
      isActive: true,
    })
    replaceReservationBlacklistEntry(entry)
    adminMessage.value = `${reservation.customerName} 已加入訂位黑名單`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '訂位黑名單新增失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const setReservationStatus = async (reservation: PosReservation, status: ReservationStatus): Promise<void> => {
  isIchefLoading.value = true
  adminMessage.value = '更新訂位狀態'

  try {
    const saved = await updateAdminReservation(reservation.id, { status })
    reservations.value = reservations.value.map((entry) => (entry.id === saved.id ? saved : entry))
    adminMessage.value = `${saved.customerName} 已更新為 ${reservationStatusLabels[saved.status]}`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '訂位更新失敗'
  } finally {
    isIchefLoading.value = false
  }
}

const addRole = (): void => {
  accessControl.value.roles.push({
    id: buildId('role'),
    name: '新角色',
    pinRequired: false,
    permissions: ['manageProducts'],
  })
}

const removeRole = (roleId: string): void => {
  if (accessControl.value.roles.length <= 1) {
    adminMessage.value = '至少保留一個角色'
    return
  }

  const fallbackRoleId = accessControl.value.roles.find((role) => role.id !== roleId)?.id ?? ''
  accessControl.value.roles = accessControl.value.roles.filter((role) => role.id !== roleId)
  accessControl.value.staffAccounts = accessControl.value.staffAccounts.map((staff) =>
    staff.roleId === roleId ? { ...staff, roleId: fallbackRoleId } : staff,
  )
}

const addStaffAccount = (): void => {
  accessControl.value.staffAccounts.push({
    id: buildId('staff'),
    name: '新員工',
    staffCode: String(1000 + accessControl.value.staffAccounts.length),
    roleId: accessControl.value.roles[0]?.id ?? 'owner',
    active: true,
    reportEmail: '',
  })
}

const removeStaffAccount = (staffId: string): void => {
  accessControl.value.staffAccounts = accessControl.value.staffAccounts.filter((staff) => staff.id !== staffId)
}

const staffRoleName = (staff: StaffAccountSetting): string =>
  accessControl.value.roles.find((role) => role.id === staff.roleId)?.name ?? '未指定角色'

const staffCanReceiveDailyReport = (staff: StaffAccountSetting): boolean =>
  accessControl.value.roles
    .find((role) => role.id === staff.roleId)
    ?.permissions.includes('sendDailyReports') ?? false

const hasPermission = (role: RoleSetting, permission: AdminPermission): boolean => role.permissions.includes(permission)

const permissionRequiresStaffCode = (permission: AdminPermission): boolean =>
  accessControl.value.protectedPermissions.includes(permission)

const togglePermission = (role: RoleSetting, permission: AdminPermission): void => {
  if (hasPermission(role, permission)) {
    role.permissions = role.permissions.filter((entry) => entry !== permission)
    return
  }

  role.permissions = [...role.permissions, permission]
}

const toggleProtectedPermission = (permission: AdminPermission): void => {
  if (permissionRequiresStaffCode(permission)) {
    accessControl.value.protectedPermissions = accessControl.value.protectedPermissions.filter((entry) => entry !== permission)
    return
  }

  accessControl.value.protectedPermissions = [...accessControl.value.protectedPermissions, permission]
}

const saveAccessControl = async (): Promise<void> => {
  savingSettingKey.value = 'access_control'
  adminMessage.value = '儲存權限設定'

  try {
    const savedAccessControl = await updateAdminSetting<AccessControlSettings>('access_control', accessControl.value)
    accessControl.value = cloneAccessControl(savedAccessControl)
    adminMessage.value = '權限設定已更新'
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '權限設定更新失敗'
  } finally {
    savingSettingKey.value = null
  }
}
</script>

<template>
  <section class="admin-workspace" aria-label="POS 後台">
    <section class="admin-panel admin-access-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Back Office</p>
          <h2>營運後台</h2>
          <span class="panel-note">商品菜單、出單規則、角色權限</span>
        </div>
        <span class="status-pill status-pill--success">
          <ShieldCheck :size="18" aria-hidden="true" />
          編輯模式
        </span>
      </div>

      <div class="admin-access-grid">
        <p class="panel-note">已由工具箱連點 6 下解鎖。</p>
        <button class="primary-button" type="button" :disabled="isLoading" @click="loadAdminData">
          <RefreshCw :size="18" aria-hidden="true" />
          {{ isLoading ? '讀取中' : '載入後台' }}
        </button>
      </div>
      <p class="admin-message">{{ adminMessage }}</p>
    </section>

    <section class="overview-strip admin-summary-strip" aria-label="後台摘要">
      <article>
        <span>POS 可售</span>
        <strong>{{ visibleProducts }}</strong>
      </article>
      <article>
        <span>線上/掃碼</span>
        <strong>{{ onlineProducts }}</strong>
      </article>
      <article>
        <span>線上點餐</span>
        <strong>{{ onlineOrderingStatusLabel }}</strong>
      </article>
      <article>
        <span>備餐時間</span>
        <strong>{{ onlineOrderingPrepLabel }}</strong>
      </article>
      <article>
        <span>低庫存</span>
        <strong>{{ lowStockProducts }}</strong>
      </article>
      <article>
        <span>自動消耗</span>
        <strong>{{ activeInventoryConsumptionRuleCount }}</strong>
      </article>
      <article>
        <span>會員</span>
        <strong>{{ memberCount }}</strong>
      </article>
      <article>
        <span>優惠券</span>
        <strong>{{ couponCount }}</strong>
      </article>
      <article>
        <span>有效訂位</span>
        <strong>{{ activeReservationCount }}</strong>
      </article>
      <article>
        <span>錢包餘額</span>
        <strong>{{ formatCurrency(walletBalanceTotal) }}</strong>
      </article>
      <article>
        <span>日報營收</span>
        <strong>{{ dailyReport ? formatCurrency(dailyReport.collectedTotal) : '$0' }}</strong>
      </article>
      <article>
        <span>支付事件</span>
        <strong>{{ paymentEventCount }}</strong>
      </article>
      <article>
        <span>未套用支付</span>
        <strong>{{ unappliedPaymentEventCount }}</strong>
      </article>
      <article>
        <span>出單規則</span>
        <strong>{{ printRuleCount }}</strong>
      </article>
      <article>
        <span>權限角色</span>
        <strong>{{ roleCount }}</strong>
      </article>
      <article>
        <span>在線平板</span>
        <strong>{{ onlineStationCount }}</strong>
      </article>
      <article>
        <span>營運紀錄</span>
        <strong>{{ operationTimelineCount }}</strong>
      </article>
      <article>
        <span>稽核紀錄</span>
        <strong>{{ auditEventCount }}</strong>
      </article>
    </section>

    <section class="admin-panel">
      <div class="segmented-control admin-tabs" aria-label="後台功能">
        <button
          v-for="tabItem in adminTabs"
          :key="tabItem.value"
          class="segment-button"
          :class="{ 'segment-button--active': activeAdminTab === tabItem.value }"
          type="button"
          @click="activeAdminTab = tabItem.value"
        >
          {{ tabItem.label }}
        </button>
      </div>

      <section v-if="activeAdminTab === 'products'" class="admin-tab-panel" aria-label="商品菜單">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Products</p>
            <h2>商品與前台顯示</h2>
            <span class="panel-note">管理 POS、外帶外送、掃碼點餐與商品條碼</span>
          </div>
          <label class="search-box">
            <Search :size="18" aria-hidden="true" />
            <input v-model="searchTerm" type="search" placeholder="搜尋商品、SKU 或條碼" />
          </label>
        </div>

        <div class="segmented-control admin-filter" aria-label="商品分類">
          <button
            v-for="category in categoryOptions"
            :key="category.value"
            class="segment-button"
            :class="{ 'segment-button--active': selectedCategory === category.value }"
            type="button"
            @click="selectedCategory = category.value"
          >
            {{ category.label }}
          </button>
        </div>

        <div class="admin-product-list">
          <article v-for="product in filteredProducts" :key="product.id" class="admin-product-row">
            <header class="admin-row-header">
              <div class="admin-product-identity">
                <span class="product-swatch" :style="{ backgroundColor: product.accent }" aria-hidden="true"></span>
                <div>
                  <strong>{{ product.name || '未命名商品' }}</strong>
                  <span>{{ product.sku }}<template v-if="product.barcode"> · 條碼 {{ product.barcode }}</template></span>
                </div>
              </div>

              <button
                class="primary-button admin-save-button"
                type="button"
                :disabled="savingProductId === product.id"
                @click="saveProduct(product)"
              >
                <Save :size="18" aria-hidden="true" />
                {{ savingProductId === product.id ? '儲存中' : '儲存' }}
              </button>
            </header>

            <div class="admin-product-edit-grid">
              <label>
                名稱
                <input v-model="product.name" type="text" />
              </label>

              <label>
                分類
                <select v-model="product.category">
                  <option value="coffee">咖啡</option>
                  <option value="tea">茶飲</option>
                  <option value="food">輕食</option>
                  <option value="retail">零售</option>
                </select>
              </label>

              <label>
                價格
                <input v-model.number="product.price" type="number" min="0" step="1" />
              </label>

              <label>
                商品條碼
                <input
                  v-model.trim="product.barcode"
                  type="text"
                  maxlength="48"
                  inputmode="text"
                  autocomplete="off"
                  placeholder="選填，不可重複"
                />
              </label>

              <label>
                排序
                <input v-model.number="product.sortOrder" type="number" step="1" />
              </label>

              <label>
                備餐站
                <select v-model="product.prepStation">
                  <option v-for="station in stationOptions" :key="station.id" :value="station.id">
                    {{ station.name }}
                  </option>
                </select>
              </label>

              <label>
                色票
                <span class="color-input-row">
                  <input v-model="product.accent" type="color" />
                  <input v-model="product.accent" type="text" />
                </span>
              </label>

              <label class="admin-product-tags">
                標籤
                <input v-model="product.tagsText" type="text" />
              </label>
            </div>

            <div class="admin-product-stock-grid">
              <label>
                今日庫存
                <input v-model.number="product.inventoryCount" type="number" min="0" step="1" placeholder="不追蹤" />
              </label>

              <label>
                低庫存提醒
                <input v-model.number="product.lowStockThreshold" type="number" min="0" step="1" placeholder="不提醒" />
              </label>

              <label>
                暫停供應至
                <input v-model="product.soldOutUntilInput" type="datetime-local" />
              </label>

              <label class="toggle-row">
                <input v-model="product.futureOrderAvailable" type="checkbox" />
                預約單可售
              </label>
            </div>

            <details class="inventory-consumption-card">
              <summary>
                <span>自動消耗庫存</span>
                <small>{{ productConsumptionRules(product.id).length }} 條</small>
              </summary>

              <div class="inventory-consumption-form">
                <label>
                  庫存品項
                  <select v-model="ensureProductConsumptionDraft(product.id).itemId">
                    <option value="">選擇庫存品項</option>
                    <option v-for="item in activeInventoryItems" :key="item.id" :value="item.id">
                      {{ item.name }} · {{ item.stockQuantity }} {{ item.unit }}
                    </option>
                  </select>
                </label>
                <label>
                  每份消耗
                  <input v-model.number="ensureProductConsumptionDraft(product.id).quantity" type="number" min="0.001" step="0.001" />
                </label>
                <button
                  type="button"
                  :disabled="activeInventoryItems.length === 0 || savingSettingKey === 'inventory_consumption'"
                  @click="addProductConsumptionRule(product)"
                >
                  新增規則
                </button>
              </div>

              <div class="inventory-consumption-list">
                <article v-for="rule in productConsumptionRules(product.id)" :key="rule.id" class="inventory-consumption-row">
                  <span>{{ inventoryItemName(rule.itemId) }}</span>
                  <label>
                    數量
                    <input v-model.number="rule.quantity" type="number" min="0.001" step="0.001" />
                  </label>
                  <button type="button" @click="saveConsumptionRule(rule)">儲存</button>
                  <button type="button" @click="deactivateConsumptionRule(rule)">停用</button>
                </article>
                <span v-if="productConsumptionRules(product.id).length === 0" class="panel-note">
                  尚未設定；商品正式建單後不會扣新庫存品項。
                </span>
              </div>
            </details>

            <div class="admin-toggle-grid" aria-label="商品顯示與列印">
              <label class="toggle-row admin-availability">
                <input v-model="product.available" type="checkbox" />
                <Eye v-if="product.available" :size="18" aria-hidden="true" />
                <EyeOff v-else :size="18" aria-hidden="true" />
                {{ product.available ? '上架' : '停售' }}
              </label>
              <label class="toggle-row">
                <input v-model="product.posVisible" type="checkbox" />
                <Store :size="18" aria-hidden="true" />
                POS
              </label>
              <label class="toggle-row">
                <input v-model="product.onlineVisible" type="checkbox" />
                外帶外送
              </label>
              <label class="toggle-row">
                <input v-model="product.qrVisible" type="checkbox" />
                掃碼
              </label>
              <label class="toggle-row">
                <input v-model="product.printLabel" type="checkbox" />
                列印標籤
              </label>
            </div>
          </article>

          <div v-if="filteredProducts.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>沒有符合條件的商品</span>
          </div>
        </div>

        <section class="inventory-consumption-card inventory-consumption-card--global" aria-label="註記自動消耗庫存">
          <div class="panel-heading admin-subheading">
            <div>
              <p class="eyebrow">Inventory</p>
              <h3>註記自動消耗</h3>
              <span class="panel-note">對齊 iCHEF 單一註記消耗庫存；例如換燕麥奶、加糖漿。</span>
            </div>
          </div>

          <div class="inventory-consumption-form inventory-consumption-form--option">
            <label>
              註記
              <select v-model="optionConsumptionDraft.optionLabel">
                <option value="">選擇註記</option>
                <option v-for="optionLabel in inventoryOptionLabels" :key="optionLabel" :value="optionLabel">
                  {{ optionLabel }}
                </option>
              </select>
            </label>
            <label>
              庫存品項
              <select v-model="optionConsumptionDraft.itemId">
                <option value="">選擇庫存品項</option>
                <option v-for="item in activeInventoryItems" :key="item.id" :value="item.id">
                  {{ item.name }} · {{ item.stockQuantity }} {{ item.unit }}
                </option>
              </select>
            </label>
            <label>
              每次消耗
              <input v-model.number="optionConsumptionDraft.quantity" type="number" min="0.001" step="0.001" />
            </label>
            <button
              type="button"
              :disabled="activeInventoryItems.length === 0 || inventoryOptionLabels.length === 0 || savingSettingKey === 'inventory_consumption'"
              @click="addOptionConsumptionRule"
            >
              新增註記規則
            </button>
          </div>

          <div class="inventory-consumption-list">
            <article v-for="rule in optionConsumptionRules" :key="rule.id" class="inventory-consumption-row">
              <span>{{ rule.optionLabel }}</span>
              <span>{{ inventoryItemName(rule.itemId) }}</span>
              <label>
                數量
                <input v-model.number="rule.quantity" type="number" min="0.001" step="0.001" />
              </label>
              <button type="button" @click="saveConsumptionRule(rule)">儲存</button>
              <button type="button" @click="deactivateConsumptionRule(rule)">停用</button>
            </article>
            <span v-if="optionConsumptionRules.length === 0" class="panel-note">尚未設定註記消耗規則。</span>
          </div>
        </section>
      </section>

      <section v-else-if="activeAdminTab === 'online'" class="admin-tab-panel" aria-label="線上點餐設定">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Online</p>
            <h2>線上點餐設定</h2>
            <span class="panel-note">控制消費者頁接單狀態、預約與提醒節奏</span>
          </div>
          <button class="primary-button" type="button" :disabled="savingSettingKey === 'online_ordering'" @click="saveOnlineOrdering">
            <Save :size="18" aria-hidden="true" />
            {{ savingSettingKey === 'online_ordering' ? '儲存中' : '儲存線上設定' }}
          </button>
        </div>

        <div class="admin-online-status-grid">
          <article>
            <span>功能狀態</span>
            <strong>{{ onlineOrdering.enabled ? '可掃碼點餐' : '僅菜單瀏覽' }}</strong>
            <small>{{ onlineOrdering.enabled ? '消費者可送出新訂單' : '消費者頁保留菜單瀏覽但不開放送單' }}</small>
          </article>
          <article>
            <span>店家營業資訊</span>
            <strong>{{ onlineOrdering.storeProfile.name }}</strong>
            <small>{{ onlineOrdering.storeProfile.coverImageDataUrls.length }} 張封面圖</small>
          </article>
          <article>
            <span>平均備餐</span>
            <strong>{{ onlineOrdering.averagePrepMinutes }} 分</strong>
            <small>顯示於消費者頁並作為預約最早時間參考</small>
          </article>
          <article>
            <span>未確認提醒</span>
            <strong>{{ onlineOrdering.unconfirmedReminderMinutes }} 分</strong>
            <small>{{ onlineOrdering.soundEnabled ? '提示音已啟用' : '提示音未啟用' }}</small>
          </article>
          <article>
            <span>平板通知</span>
            <strong>{{ onlineNotificationRoutedStationCount }} 台</strong>
            <small>POS 工具箱可為每台平板指定服務方式與內用桌位</small>
          </article>
          <article>
            <span>接單流程</span>
            <strong>{{ onlineOrdering.acceptanceRequired ? '平板確認' : '自動入列' }}</strong>
            <small>{{ onlineOrdering.acceptWithoutPrinting ? '可接受但不出單' : '接單後依列印站規則' }}</small>
          </article>
          <article>
            <span>訂單 QR Code</span>
            <strong>{{ onlineOrdering.sessionQrCode.autoPrint ? '自動列印' : '手動列印' }}</strong>
            <small>{{ stationNameForId(onlineOrdering.sessionQrCode.stationId) }}</small>
          </article>
          <article>
            <span>桌位 QR Code</span>
            <strong>{{ tableQrThemeLabel }}</strong>
            <small>{{ tableQrCardSources.length }} 張桌卡</small>
          </article>
          <article>
            <span>用餐限時</span>
            <strong>{{ onlineOrdering.dineInTimeLimit.enabled ? `${onlineOrdering.dineInTimeLimit.mealMinutes} 分` : '未啟用' }}</strong>
            <small>最後加點 {{ onlineOrdering.dineInTimeLimit.lastOrderBeforeEndMinutes }} 分鐘前</small>
          </article>
          <article>
            <span>內用結帳</span>
            <strong>{{ onlineOrdering.dineInCheckout.mode === 'prepaid' ? '先結' : '後結' }}</strong>
            <small>{{ onlineOrdering.dineInCheckout.mode === 'prepaid' ? '掃碼送單前需選線上付款' : '掃碼送單後由 POS 收款' }}</small>
          </article>
          <article>
            <span>備註欄位</span>
            <strong>{{ onlineOrdering.commentFields.orderNote === 'required' ? '訂單必填' : onlineOrdering.commentFields.orderNote === 'hidden' ? '訂單隱藏' : '訂單選填' }}</strong>
            <small>{{ onlineOrdering.commentFields.itemNotes === 'hidden' ? '隱藏餐點備註' : '顯示餐點備註' }}</small>
          </article>
        </div>

        <section class="admin-subpanel">
          <div class="admin-subpanel-heading">
            <div>
              <p class="eyebrow">Runtime</p>
              <h3>接單與提醒</h3>
            </div>
          </div>

          <div class="admin-online-toggle-grid">
            <label class="toggle-row">
              <input v-model="onlineOrdering.enabled" type="checkbox" />
              消費者可送出訂單
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.serviceModeAvailability.takeout" type="checkbox" />
              開放自取
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.serviceModeAvailability['dine-in']" type="checkbox" />
              開放內用掃碼
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.serviceModeAvailability.delivery" type="checkbox" />
              開放外送
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.allowScheduledOrders" type="checkbox" />
              允許顧客選希望時間
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.soundEnabled" type="checkbox" />
              新單提示音
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.acceptanceRequired" type="checkbox" />
              線上/掃碼單需平板接單
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.acceptWithoutPrinting" type="checkbox" />
              接單時可接受但不出單
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.showTaxIdField" type="checkbox" />
              結帳顯示統一編號
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.showCarrierBarcodeField" type="checkbox" />
              結帳顯示載具條碼
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.showDonationCodeField" type="checkbox" />
              結帳顯示捐贈碼
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.sessionQrCode.autoPrint" type="checkbox" />
              建立內用訂單後自動列印 QR
            </label>
            <label class="toggle-row">
              <input v-model="onlineOrdering.dineInTimeLimit.enabled" type="checkbox" />
              套用用餐與點餐限時
            </label>
          </div>

          <div class="admin-online-settings-grid">
            <label>
              平均備餐分鐘
              <input v-model.number="onlineOrdering.averagePrepMinutes" type="number" min="0" max="180" step="1" />
            </label>
            <label>
              未確認提醒分鐘
              <input v-model.number="onlineOrdering.unconfirmedReminderMinutes" type="number" min="0" max="120" step="1" />
            </label>
            <label>
              提示聲播放
              <select v-model="onlineOrdering.notificationRepeatMode">
                <option value="continuous">連續提醒</option>
                <option value="once">只播放一次</option>
              </select>
            </label>
            <label>
              提示音量
              <input v-model.number="onlineOrdering.notificationVolume" type="range" min="0" max="100" step="5" />
              <small>{{ onlineOrdering.notificationVolume }}%</small>
            </label>
            <label>
              內用掃碼結帳模式
              <select v-model="onlineOrdering.dineInCheckout.mode">
                <option value="postpaid">後結：用餐後由 POS 結帳</option>
                <option value="prepaid">先結：送單前需線上付款</option>
              </select>
              <small>後結模式會在 QR 頁隱藏付款選項，先結模式只允許線上付款模組。</small>
            </label>
            <label>
              餐點備註
              <select v-model="onlineOrdering.commentFields.itemNotes">
                <option value="shown">顯示欄位</option>
                <option value="hidden">隱藏欄位</option>
              </select>
              <small>控制消費者是否可在單一品項填寫文字備註。</small>
            </label>
            <label>
              訂單備註
              <select v-model="onlineOrdering.commentFields.orderNote">
                <option value="optional">顯示欄位，消費者選填</option>
                <option value="required">顯示欄位，消費者必填</option>
                <option value="hidden">隱藏欄位</option>
              </select>
              <small>隱藏時 QR 桌號資訊仍會保留，但消費者不能送出額外訂單備註。</small>
            </label>
            <label>
              備註提示文字
              <input v-model="onlineOrdering.commentFields.orderNotePlaceholder" type="text" maxlength="80" />
              <small>顯示於消費者訂單備註欄位。</small>
            </label>
            <label class="wide-field">
              僅菜單瀏覽提示
              <input v-model="onlineOrdering.pauseMessage" type="text" maxlength="120" />
            </label>
            <label class="wide-field">
              結帳說明
              <textarea
                v-model="onlineOrdering.checkoutInstructions"
                rows="3"
                maxlength="500"
                placeholder="例如：如需統編或手機條碼請於結帳時填寫，門市會依資料開立。"
              />
            </label>
            <label>
              訂單 QR 出單機
              <select v-model="onlineOrdering.sessionQrCode.stationId">
                <option value="">目前出單機</option>
                <option v-for="station in stationOptions" :key="`session-qr-${station.id}`" :value="station.id">
                  {{ station.name }}
                </option>
              </select>
            </label>
            <label>
              QR Logo 文字
              <input v-model="onlineOrdering.sessionQrCode.logoText" type="text" maxlength="40" />
            </label>
            <label>
              桌卡顏色
              <select v-model="onlineOrdering.tableQrCode.theme">
                <option v-for="theme in tableQrThemeOptions" :key="theme.value" :value="theme.value">
                  {{ theme.label }}
                </option>
              </select>
              <small>對照 iCHEF 桌卡樣式：黑、綠、橘、黃、紫。</small>
            </label>
            <label>
              桌卡 Logo 文字
              <input v-model="onlineOrdering.tableQrCode.logoText" type="text" maxlength="40" />
            </label>
            <label class="wide-field">
              桌卡 Logo 圖檔
              <input type="file" accept="image/png,image/jpeg" @change="handleTableQrLogoUpload" />
              <small>{{ onlineOrdering.tableQrCode.logoDataUrl ? '已上傳 Logo 圖檔，會優先顯示於桌卡。' : '可上傳約 90x90px 的 JPG 或 PNG；未上傳時使用 Logo 文字。' }}</small>
            </label>
            <label>
              用餐限時分鐘
              <input v-model.number="onlineOrdering.dineInTimeLimit.mealMinutes" type="number" min="0" max="720" step="5" />
            </label>
            <label>
              最後加點
              <input
                v-model.number="onlineOrdering.dineInTimeLimit.lastOrderBeforeEndMinutes"
                type="number"
                min="0"
                max="720"
                step="5"
              />
              <small>用餐結束前 n 分鐘；0 代表同用餐結束</small>
            </label>
          </div>

          <div class="admin-table-qr-panel" aria-label="桌位 QR Code 下載">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Table QR Code</p>
                <h3>桌位 QR Code 桌卡</h3>
                <span class="panel-note">依目前樓層與桌位產生可列印 A4 桌卡；先結/後結會套用不同操作步驟。</span>
              </div>
              <div class="admin-table-qr-actions">
                <button
                  v-if="onlineOrdering.tableQrCode.logoDataUrl"
                  class="utility-button"
                  type="button"
                  @click="clearTableQrLogo"
                >
                  清除 Logo
                </button>
                <button
                  class="utility-button"
                  type="button"
                  :disabled="tableQrCardSources.length === 0"
                  @click="downloadTableQrCards()"
                >
                  <Download :size="16" aria-hidden="true" />
                  下載全部
                </button>
              </div>
            </div>
            <p v-if="tableQrDownloadMessage" class="admin-inline-note">{{ tableQrDownloadMessage }}</p>
            <div v-if="tableQrCardSources.length" class="admin-table-qr-list">
              <article v-for="source in tableQrCardSources" :key="source.table.id" class="admin-table-qr-row">
                <div>
                  <strong>{{ source.floor?.label ? `${source.floor.label} · ${source.table.label}` : source.table.label }}</strong>
                  <span>{{ source.table.capacity }} 人 · {{ source.table.width }}% 寬 · {{ source.table.x }}%, {{ source.table.y }}%</span>
                </div>
                <button class="utility-button" type="button" @click="downloadTableQrCards(source.table.id)">
                  <Download :size="16" aria-hidden="true" />
                  下載
                </button>
              </article>
            </div>
            <p v-else class="panel-note">尚未建立桌位，請先到桌位地圖後台編輯模式新增桌位。</p>
          </div>

          <div class="admin-online-store-profile" aria-label="店家營業資訊">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Store profile</p>
                <h3>店家營業資訊</h3>
                <span class="panel-note">顯示於內用掃碼與線上點餐頁，對齊 iCHEF 店家資訊、提醒事項與封面圖片。</span>
              </div>
            </div>
            <div class="admin-online-settings-grid">
              <label>
                店家名稱
                <input v-model="onlineOrdering.storeProfile.name" type="text" maxlength="60" />
                <small>中文建議 10 字以內，英數建議 15 字元以內。</small>
              </label>
              <label>
                聯絡電話
                <input v-model="onlineOrdering.storeProfile.phone" type="tel" maxlength="32" />
              </label>
              <label class="wide-field">
                店家地址
                <input v-model="onlineOrdering.storeProfile.address" type="text" maxlength="160" />
              </label>
              <label class="wide-field">
                提醒事項
                <textarea
                  v-model="onlineOrdering.storeProfile.notice"
                  rows="4"
                  maxlength="3000"
                  placeholder="例如：尖峰時段餐點需等候，請依現場叫號取餐。"
                />
                <small>{{ onlineOrdering.storeProfile.notice.length }}/3000，未開啟顯示全文時預設只顯示前 3 行。</small>
              </label>
              <label class="toggle-row wide-field">
                <input v-model="onlineOrdering.storeProfile.noticeExpanded" type="checkbox" />
                提醒事項預設顯示全文
              </label>
              <label class="wide-field">
                店家封面圖片
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  :disabled="onlineOrdering.storeProfile.coverImageDataUrls.length >= 4"
                  @change="handleStoreCoverImageUpload"
                />
                <small>建議 750x400px 以上 JPG/PNG，最多 4 張；多張會在消費者頁輪播。</small>
              </label>
            </div>
            <p v-if="onlineStoreProfileMessage" class="admin-inline-note">{{ onlineStoreProfileMessage }}</p>
            <div v-if="onlineOrdering.storeProfile.coverImageDataUrls.length" class="admin-store-cover-list">
              <article
                v-for="(imageUrl, index) in onlineOrdering.storeProfile.coverImageDataUrls"
                :key="`${imageUrl.slice(0, 36)}-${index}`"
                class="admin-store-cover-row"
              >
                <img :src="imageUrl" alt="" />
                <span>封面 {{ index + 1 }}</span>
                <button class="utility-button" type="button" @click="removeStoreCoverImage(index)">移除</button>
              </article>
            </div>
          </div>

          <div class="admin-online-schedule-rules" aria-label="用餐與點餐限時">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Dine-in time limit</p>
                <h3>用餐與點餐限時</h3>
              </div>
              <button class="utility-button" type="button" @click="addDineInTimeLimitHolidayRule">
                <Plus :size="16" aria-hidden="true" />
                新增假日規則
              </button>
            </div>
            <div v-if="onlineOrdering.dineInTimeLimit.holidayRules.length" class="admin-time-limit-rule-list">
              <article
                v-for="rule in onlineOrdering.dineInTimeLimit.holidayRules"
                :key="rule.id"
                class="admin-time-limit-rule-row"
              >
                <label>
                  名稱
                  <input v-model="rule.label" type="text" maxlength="40" />
                </label>
                <label>
                  用餐限時
                  <input v-model.number="rule.mealMinutes" type="number" min="0" max="720" step="5" />
                </label>
                <label>
                  最後加點
                  <input v-model.number="rule.lastOrderBeforeEndMinutes" type="number" min="0" max="720" step="5" />
                </label>
                <div class="admin-weekday-toggle" aria-label="假日規則星期">
                  <button
                    v-for="day in weekdayOptions"
                    :key="day.value"
                    type="button"
                    :class="{ 'admin-weekday-toggle--active': rule.days.includes(day.value) }"
                    @click="toggleDineInTimeLimitHolidayDay(rule, day.value)"
                  >
                    {{ day.label }}
                  </button>
                </div>
                <button class="icon-button" type="button" title="刪除假日規則" @click="deleteDineInTimeLimitHolidayRule(rule.id)">
                  <Trash2 :size="18" aria-hidden="true" />
                </button>
              </article>
            </div>
            <p v-else class="panel-note">未設定假日規則時，每天都使用預設限時；用餐限時設為 0 代表不限時。</p>
          </div>

          <div class="admin-online-schedule-rules" aria-label="預約訂單設定">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Scheduled orders</p>
                <h3>預約訂單</h3>
              </div>
              <button class="utility-button" type="button" @click="addScheduledOrderTimeWindow">
                <Plus :size="16" aria-hidden="true" />
                新增時段
              </button>
            </div>
            <div class="admin-online-settings-grid">
              <label>
                取餐時間間隔
                <input v-model.number="onlineOrdering.scheduledOrderIntervalMinutes" type="number" min="5" max="120" step="5" />
              </label>
              <label>
                最長預約天數
                <input v-model.number="onlineOrdering.scheduledOrderMaxDays" type="number" min="1" max="60" step="1" />
              </label>
            </div>
            <div class="admin-schedule-window-list">
              <article
                v-for="timeWindow in onlineOrdering.scheduledOrderTimeWindows"
                :key="timeWindow.id"
                class="admin-schedule-window-row"
              >
                <label>
                  名稱
                  <input v-model="timeWindow.label" type="text" maxlength="24" />
                </label>
                <label class="toggle-row">
                  <input v-model="timeWindow.allDay" type="checkbox" />
                  全天
                </label>
                <label>
                  開始
                  <input v-model="timeWindow.start" type="time" :disabled="timeWindow.allDay" />
                </label>
                <label>
                  結束
                  <input v-model="timeWindow.end" type="time" :disabled="timeWindow.allDay" />
                </label>
                <div class="admin-weekday-toggle" aria-label="可預約星期">
                  <button
                    v-for="day in weekdayOptions"
                    :key="day.value"
                    type="button"
                    :class="{ 'admin-weekday-toggle--active': timeWindow.days.includes(day.value) }"
                    @click="toggleScheduledOrderWindowDay(timeWindow, day.value)"
                  >
                    {{ day.label }}
                  </button>
                </div>
                <button class="icon-button" type="button" title="刪除時段" @click="deleteScheduledOrderTimeWindow(timeWindow.id)">
                  <Trash2 :size="18" aria-hidden="true" />
                </button>
              </article>
            </div>
          </div>

          <div class="admin-online-delivery-rules" aria-label="外送運費規則">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Delivery</p>
                <h3>外送規則</h3>
              </div>
              <span class="panel-note">外送僅顯示線上付款方式</span>
            </div>
            <div class="admin-online-settings-grid">
              <label>
                外送費
                <input v-model.number="onlineOrdering.deliveryFeeAmount" type="number" min="0" max="999999" step="1" />
              </label>
              <label>
                外送最低金額
                <input v-model.number="onlineOrdering.deliveryMinimumSubtotal" type="number" min="0" max="999999" step="1" />
              </label>
              <label>
                滿額免運
                <input v-model.number="onlineOrdering.freeDeliveryThreshold" type="number" min="0" max="999999" step="1" />
              </label>
              <label>
                預計車程分鐘
                <input v-model.number="onlineOrdering.deliveryTravelMinutes" type="number" min="0" max="180" step="1" />
              </label>
            </div>
          </div>

          <div class="admin-online-payment-methods" aria-label="線上支付模組">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Payment modules</p>
                <h3>支付模組</h3>
              </div>
              <span class="panel-note">顯示順序依列表排序</span>
            </div>
            <div class="admin-payment-method-list">
              <article
                v-for="method in onlineOrdering.paymentMethods"
                :key="method.id"
                class="admin-payment-method-row"
              >
                <label class="toggle-row">
                  <input v-model="method.enabled" type="checkbox" />
                  啟用
                </label>
                <label class="toggle-row">
                  <input v-model="method.opensCashDrawer" type="checkbox" />
                  結帳開錢櫃
                </label>
                <label>
                  顯示名稱
                  <input v-model="method.label" type="text" maxlength="24" />
                </label>
                <div class="admin-payment-method-actions" aria-label="支付方式排序">
                  <button
                    class="icon-button"
                    type="button"
                    title="往上"
                    :disabled="onlinePaymentMethodPosition(method.id) <= 0"
                    @click="moveOnlinePaymentMethod(method.id, -1)"
                  >
                    <ArrowUp :size="18" aria-hidden="true" />
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    title="往下"
                    :disabled="onlinePaymentMethodPosition(method.id) >= onlineOrdering.paymentMethods.length - 1"
                    @click="moveOnlinePaymentMethod(method.id, 1)"
                  >
                    <ArrowDown :size="18" aria-hidden="true" />
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>
      </section>

      <section v-else-if="activeAdminTab === 'discounts'" class="admin-tab-panel" aria-label="優惠活動">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Promotions</p>
            <h2>優惠活動</h2>
            <span class="panel-note">{{ activeDiscountCampaignCount }} 個啟用 · {{ automaticDiscountCampaignCount }} 個自動優惠</span>
          </div>
          <div class="admin-action-row">
            <button class="utility-button" type="button" @click="addDiscountCampaign('automatic')">
              <Plus :size="16" aria-hidden="true" />
              新增自動優惠
            </button>
            <button class="utility-button" type="button" @click="addDiscountCampaign('manual')">
              <Plus :size="16" aria-hidden="true" />
              新增手動優惠
            </button>
            <button class="primary-button" type="button" :disabled="savingSettingKey === 'discount_settings'" @click="saveDiscountSettings">
              <Save :size="18" aria-hidden="true" />
              {{ savingSettingKey === 'discount_settings' ? '儲存中' : '儲存優惠' }}
            </button>
          </div>
        </div>

        <div class="admin-discount-list">
          <article v-for="(campaign, index) in discountSettings.campaigns" :key="campaign.id" class="admin-discount-row">
            <header class="admin-row-header">
              <div class="admin-discount-title">
                <strong>{{ campaign.name || `優惠活動 ${index + 1}` }}</strong>
                <span>{{ campaign.kind === 'automatic' ? '自動優惠' : '手動優惠' }} · {{ campaign.enabled ? '進行中' : '停用' }}</span>
              </div>
              <div class="admin-payment-method-actions" aria-label="優惠排序">
                <button class="icon-button" type="button" title="往上" :disabled="index === 0" @click="moveDiscountCampaign(campaign.id, -1)">
                  <ArrowUp :size="18" aria-hidden="true" />
                </button>
                <button class="icon-button" type="button" title="往下" :disabled="index >= discountSettings.campaigns.length - 1" @click="moveDiscountCampaign(campaign.id, 1)">
                  <ArrowDown :size="18" aria-hidden="true" />
                </button>
                <button class="icon-button" type="button" title="刪除優惠" @click="removeDiscountCampaign(campaign.id)">
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div class="admin-discount-grid">
              <label>
                活動名稱
                <input v-model="campaign.name" type="text" maxlength="80" />
              </label>
              <label>
                類型
                <select v-model="campaign.kind">
                  <option value="automatic">自動優惠</option>
                  <option value="manual">手動優惠</option>
                </select>
              </label>
              <label>
                範圍
                <select v-model="campaign.scope">
                  <option value="whole-order">全單</option>
                  <option value="categories">指定分類</option>
                  <option value="products">指定商品</option>
                </select>
              </label>
              <label>
                計算
                <select v-model="campaign.valueType">
                  <option value="amount">折讓金額</option>
                  <option value="percentage">折扣比例</option>
                </select>
              </label>
              <label>
                數值
                <input v-model.number="campaign.discountValue" type="number" min="0" :max="campaign.valueType === 'percentage' ? 100 : 999999" step="1" />
              </label>
              <label>
                最低消費
                <input v-model.number="campaign.minimumSubtotal" type="number" min="0" max="999999" step="1" />
              </label>
            </div>

            <div class="admin-online-toggle-grid">
              <label class="toggle-row">
                <input v-model="campaign.enabled" type="checkbox" />
                啟用
              </label>
              <label class="toggle-row">
                <input v-model="campaign.usage.posEnabled" type="checkbox" />
                iCHEF POS
              </label>
              <label class="toggle-row">
                <input v-model="campaign.usage.posAutoApply" type="checkbox" :disabled="campaign.kind !== 'automatic'" />
                POS 自動套用
              </label>
              <label class="toggle-row">
                <input v-model="campaign.usage.onlineEnabled" type="checkbox" :disabled="campaign.kind !== 'automatic'" />
                外帶外送網站
              </label>
              <label class="toggle-row">
                <input v-model="campaign.usage.requiresVerification" type="checkbox" />
                POS 調整需權限
              </label>
              <label class="toggle-row">
                <input v-model="campaign.schedule.enabled" type="checkbox" />
                限定時間
              </label>
            </div>

            <div class="admin-discount-scope-grid">
              <section>
                <strong>使用訂單</strong>
                <div class="admin-weekday-toggle">
                  <button
                    v-for="mode in serviceModeOptions"
                    :key="`${campaign.id}-${mode.value}`"
                    type="button"
                    :class="{ 'admin-weekday-toggle--active': campaign.serviceModes.includes(mode.value) }"
                    @click="toggleDiscountCampaignServiceMode(campaign, mode.value)"
                  >
                    {{ mode.label }}
                  </button>
                </div>
              </section>
              <section v-if="campaign.schedule.enabled">
                <strong>優惠時間</strong>
                <div class="admin-discount-time-grid">
                  <label class="toggle-row">
                    <input v-model="campaign.schedule.allDay" type="checkbox" />
                    全天
                  </label>
                  <input v-model="campaign.schedule.start" type="time" :disabled="campaign.schedule.allDay" />
                  <input v-model="campaign.schedule.end" type="time" :disabled="campaign.schedule.allDay" />
                </div>
                <div class="admin-weekday-toggle">
                  <button
                    v-for="day in weekdayOptions"
                    :key="`${campaign.id}-day-${day.value}`"
                    type="button"
                    :class="{ 'admin-weekday-toggle--active': campaign.schedule.days.includes(day.value) }"
                    @click="toggleDiscountCampaignDay(campaign, day.value)"
                  >
                    {{ day.label }}
                  </button>
                </div>
              </section>
            </div>

            <div v-if="campaign.scope !== 'whole-order'" class="admin-rule-scope">
              <div>
                <strong>{{ campaign.scope === 'categories' ? '指定分類' : '指定商品' }}</strong>
                <span>{{ campaign.scope === 'categories' ? `${campaign.categories.length} 個分類` : `${campaign.productIds.length} 個商品` }}</span>
              </div>
              <div v-if="campaign.scope === 'categories'" class="admin-toggle-grid">
                <label
                  v-for="category in menuCategoryOptions"
                  :key="`${campaign.id}-${category.value}`"
                  class="toggle-row"
                  :class="{ 'toggle-row--active': campaign.categories.includes(category.value) }"
                >
                  <input
                    type="checkbox"
                    :checked="campaign.categories.includes(category.value)"
                    @change="toggleDiscountCampaignCategory(campaign, category.value)"
                  />
                  {{ category.label }}
                </label>
              </div>
              <div v-else class="admin-rule-item-grid">
                <label
                  v-for="product in productDrafts"
                  :key="`${campaign.id}-${product.id}`"
                  class="toggle-row"
                  :class="{ 'toggle-row--active': campaign.productIds.includes(product.id) }"
                >
                  <input
                    type="checkbox"
                    :checked="campaign.productIds.includes(product.id)"
                    @change="toggleDiscountCampaignProduct(campaign, product.id)"
                  />
                  <span>{{ product.name }}</span>
                  <small>{{ categoryLabels[product.category] ?? product.category }}</small>
                </label>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeAdminTab === 'members'" class="admin-tab-panel" aria-label="會員錢包">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Members</p>
            <h2>會員錢包</h2>
            <span class="panel-note">建立會員、查餘額與寫入儲值/扣款流水</span>
          </div>
          <div class="admin-action-row admin-audit-actions">
            <label class="search-box">
              <Search :size="18" aria-hidden="true" />
              <input v-model="memberSearchTerm" type="search" placeholder="搜尋會員或 LINE UID" @keyup.enter="loadMembers" />
            </label>
            <button class="primary-button" type="button" :disabled="isMemberLoading" @click="loadMembers">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isMemberLoading ? '讀取中' : '刷新會員' }}
            </button>
            <button
              class="primary-button secondary-button"
              type="button"
              :disabled="filteredMembers.length === 0"
              @click="exportMembersCsv"
            >
              <Download :size="18" aria-hidden="true" />
              匯出 CSV
            </button>
          </div>
        </div>

        <section class="admin-subpanel admin-member-create">
          <div class="admin-subpanel-heading">
            <div>
              <p class="eyebrow">Create</p>
              <h3>新增會員</h3>
            </div>
            <UserPlus :size="22" aria-hidden="true" />
          </div>

          <div class="admin-member-create-grid">
            <label>
              顯示名稱
              <input v-model="newMember.displayName" type="text" placeholder="例如 林小姐" />
            </label>
            <label>
              LINE UID
              <input v-model="newMember.lineUserId" type="text" placeholder="可留空，之後綁定" />
            </label>
            <label>
              電話
              <input v-model="newMember.phone" type="tel" placeholder="顧客電話" />
            </label>
            <label>
              顧客類型
              <input v-model="newMember.customerType" type="text" placeholder="一般顧客 / VIP" />
            </label>
            <label>
              開通點數
              <input v-model.number="newMember.pointsBalance" type="number" min="0" step="1" />
            </label>
            <label>
              開通餘額
              <input v-model.number="newMember.openingBalance" type="number" min="0" step="1" />
            </label>
            <label>
              備註
              <input v-model="newMember.note" type="text" placeholder="開卡、儲值來源或人工調整原因" />
            </label>
            <button class="primary-button" type="button" :disabled="savingMemberId === 'new'" @click="addMember">
              <Save :size="18" aria-hidden="true" />
              {{ savingMemberId === 'new' ? '建立中' : '建立會員' }}
            </button>
          </div>
        </section>

        <div class="admin-member-list">
          <article v-for="member in filteredMembers" :key="member.id" class="admin-member-row">
            <header class="admin-row-header">
              <div class="admin-member-identity">
                <Wallet :size="22" aria-hidden="true" />
                <div>
                  <strong>{{ member.displayName }}</strong>
                  <span>{{ member.phone || member.lineUserId || '手動會員' }} · {{ member.customerType }} · {{ member.pointsBalance }} 點</span>
                </div>
              </div>
              <strong class="admin-wallet-balance">{{ formatCurrency(member.walletBalance) }}</strong>
            </header>

            <div class="admin-member-adjust-grid">
              <label>
                調整金額
                <input
                  :value="walletAdjustmentDraft(member.id).amount"
                  type="number"
                  step="1"
                  placeholder="正數儲值，負數扣款"
                  @input="updateWalletAdjustmentAmount(member.id, $event)"
                />
              </label>
              <label>
                原因
                <input
                  :value="walletAdjustmentDraft(member.id).note"
                  type="text"
                  placeholder="例如 現金儲值、活動補點、人工扣款"
                  @input="updateWalletAdjustmentNote(member.id, $event)"
                />
              </label>
              <button class="primary-button" type="button" :disabled="savingMemberId === member.id" @click="saveWalletAdjustment(member)">
                <Save :size="18" aria-hidden="true" />
                {{ savingMemberId === member.id ? '儲存中' : '寫入流水' }}
              </button>
            </div>

            <div class="admin-audit-meta">
              <span v-for="entry in member.ledger" :key="entry.id">
                {{ formatAuditTime(entry.createdAt) }} · {{ formatCurrency(entry.amount) }} · 餘額
                {{ entry.balanceAfter === null ? '未知' : formatCurrency(entry.balanceAfter) }}
              </span>
              <span v-if="member.ledger.length === 0">尚無交易流水</span>
              <span v-for="coupon in member.coupons" :key="coupon.id">
                {{ coupon.title }} · {{ coupon.code }} · {{ coupon.status }}
              </span>
            </div>
          </article>

          <div v-if="filteredMembers.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>尚無符合條件的會員</span>
          </div>
        </div>
      </section>

      <section v-else-if="activeAdminTab === 'ichef'" class="admin-tab-panel" aria-label="iCHEF 補齊功能">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">iCHEF Parity</p>
            <h2>CRM、標籤、訂位、推薦、外設</h2>
            <span class="panel-note">集中管理 iCHEF 缺口：訂單標籤、優惠券、點數、訂位、AI/推薦與硬體外設</span>
          </div>
          <button class="primary-button" type="button" :disabled="savingSettingKey === 'engagement_settings'" @click="saveEngagementSettings">
            <Save :size="18" aria-hidden="true" />
            {{ savingSettingKey === 'engagement_settings' ? '儲存中' : '儲存補齊設定' }}
          </button>
        </div>

        <div class="admin-section-grid">
          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Item Counts</p>
                <h3>商品總數設定</h3>
              </div>
              <strong>{{ engagementSettings.productTotalDisplay.enabled ? '顯示' : '隱藏' }}</strong>
            </div>

            <div class="admin-online-toggle-grid">
              <label class="toggle-row">
                <input v-model="engagementSettings.productTotalDisplay.enabled" type="checkbox" />
                顯示商品總數
              </label>
            </div>

            <p class="panel-note">
              POS 點餐與結帳畫面會排除下方商品；此設定與 GoDEX 已裁貼紙「不計算商品」分開管理。
            </p>

            <div class="admin-rule-scope">
              <div>
                <strong>不計算分類</strong>
                <span>分類文字只切換下方品項，方框才會整類排除。</span>
              </div>
              <div class="admin-toggle-grid">
                <div
                  v-for="category in menuCategoryOptions"
                  :key="`product-total-${category.value}`"
                  class="toggle-row admin-rule-category-row"
                  :class="{
                    'toggle-row--active': productTotalCategoryFullyExcluded(category.value),
                    'toggle-row--focused': activeProductTotalCategory === category.value,
                  }"
                >
                  <input
                    type="checkbox"
                    :checked="productTotalCategoryFullyExcluded(category.value)"
                    @click.stop
                    @change="toggleProductTotalCategory(category.value)"
                  />
                  <button
                    class="admin-rule-category-button"
                    type="button"
                    @click="selectProductTotalCategory(category.value)"
                  >
                    {{ category.label }}
                  </button>
                </div>
              </div>
            </div>

            <div class="admin-rule-scope">
              <div>
                <strong>不計算指定品項</strong>
                <span>{{ categoryLabels[activeProductTotalCategory] ?? activeProductTotalCategory }} 品項可單獨調整。</span>
              </div>
              <div class="admin-rule-item-grid">
                <label
                  v-for="product in productTotalProductOptions"
                  :key="`product-total-item-${product.id}`"
                  class="toggle-row"
                  :class="{ 'toggle-row--active': productTotalItemExcluded(product) }"
                >
                  <input
                    type="checkbox"
                    :checked="productTotalItemExcluded(product)"
                    @change="toggleProductTotalItem(product.id)"
                  />
                  <span>{{ product.name }}</span>
                  <small>{{ categoryLabels[product.category] ?? product.category }}</small>
                </label>
              </div>
              <p v-if="productTotalProductOptions.length === 0" class="panel-note">此分類尚無商品。</p>
            </div>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">E-Invoice</p>
                <h3>電子發票帳本</h3>
              </div>
              <ReceiptText :size="22" aria-hidden="true" />
            </div>

            <div class="admin-online-settings-grid">
              <label class="toggle-row">
                <input v-model="engagementSettings.electronicInvoice.enabled" type="checkbox" />
                啟用電子發票追蹤
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.electronicInvoice.defaultIssueOnCheckout" type="checkbox" />
                結帳預設開立
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.electronicInvoice.allowManualIssueToggle" type="checkbox" />
                結帳頁允許手動調整
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.electronicInvoice.defaultPrintPaper" type="checkbox" />
                預設列印紙本發票
              </label>
              <label>
                上傳期限小時
                <input v-model.number="engagementSettings.electronicInvoice.uploadDeadlineHours" type="number" min="1" max="168" step="1" />
              </label>
            </div>

            <p class="panel-note">
              本專案先保存發票需求、載具/捐贈碼、狀態與 48 小時上傳期限；正式財政部加值中心串接需另接服務憑證。
            </p>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Workflow</p>
                <h3>店面流程與外帶設定</h3>
              </div>
              <SlidersHorizontal :size="22" aria-hidden="true" />
            </div>

            <div class="admin-online-settings-grid">
              <label>
                今日訂單開始時間
                <input v-model="engagementSettings.workflowAlerts.todayOrderStartTime" type="time" />
              </label>
              <label>
                今日訂單結束時間
                <input v-model="engagementSettings.workflowAlerts.todayOrderEndTime" type="time" />
              </label>
              <label>
                到點提醒提前分鐘
                <input
                  v-model.number="engagementSettings.workflowAlerts.fulfillmentDueSoonMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.scheduledPickupReminderEnabled" type="checkbox" />
                預約取餐提前提醒
              </label>
              <label>
                預設外帶取餐時間（分）
                <input
                  v-model.number="engagementSettings.workflowAlerts.defaultTakeoutPickupMinutes"
                  type="number"
                  min="0"
                  max="86400"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.fulfillmentConfirmationEnabled" type="checkbox" />
                出餐確認
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.waitlineWaitWarningEnabled" type="checkbox" />
                候位等待警示
              </label>
              <label>
                候位等待警示分鐘
                <input
                  v-model.number="engagementSettings.workflowAlerts.waitlineWaitWarningMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.dineInUnprintedWarningEnabled" type="checkbox" />
                內用未出單警示
              </label>
              <label>
                內用未出單警示分鐘
                <input
                  v-model.number="engagementSettings.workflowAlerts.dineInUnprintedWarningMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.dineInFulfillmentWarningEnabled" type="checkbox" />
                內用出餐等待警示
              </label>
              <label>
                內用出餐等待警示分鐘
                <input
                  v-model.number="engagementSettings.workflowAlerts.dineInFulfillmentWarningMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.dineInDwellWarningEnabled" type="checkbox" />
                店內滯留警示
              </label>
              <label>
                店內滯留警示分鐘
                <input
                  v-model.number="engagementSettings.workflowAlerts.dineInDwellWarningMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.takeoutUnprintedWarningEnabled" type="checkbox" />
                外帶未出單警示
              </label>
              <label>
                外帶未出單警示分鐘
                <input
                  v-model.number="engagementSettings.workflowAlerts.takeoutUnprintedWarningMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.takeoutFulfillmentWarningEnabled" type="checkbox" />
                外帶出餐等待警示
              </label>
              <label>
                外帶出餐等待警示分鐘
                <input
                  v-model.number="engagementSettings.workflowAlerts.takeoutFulfillmentWarningMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.takeoutWaitWarningEnabled" type="checkbox" />
                外帶等待警示
              </label>
              <label>
                外帶等待警示分鐘
                <input
                  v-model.number="engagementSettings.workflowAlerts.takeoutWaitWarningMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                />
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.takeoutLoopEnabled" type="checkbox" />
                外帶循環模式
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.dineInAutoExitEnabled" type="checkbox" />
                內用自動出店
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.workflowAlerts.takeoutAutoExitEnabled" type="checkbox" />
                外帶/外送自動出店
              </label>
              <label>
                註記欄位數量
                <select v-model.number="engagementSettings.orderPageDisplay.noteColumns">
                  <option :value="1">每列 1 欄</option>
                  <option :value="2">每列 2 欄</option>
                  <option :value="3">每列 3 欄</option>
                </select>
              </label>
            </div>

            <p class="panel-note">
              訂單工作區的今日/未來/過去篩選會依開始與結束時間切分；外帶草稿會預帶取餐時間；出餐確認關閉時，首次出單後會自動標記可交付，開啟時需手動按完成；候位、未出單、出餐等待、店內滯留與外帶等待警示會顯示在桌況、候位與訂單任務；外帶循環會在送單或結帳後開下一張外帶單；自動出店會在已完成製作且已付款時把訂單交付，內用掃碼已付款單仍需手動出店；註記欄位數量會套用到點餐頁商品註記選項。
            </p>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Labels</p>
                <h3>訂單標籤</h3>
              </div>
              <button class="icon-button" type="button" title="新增標籤" @click="addOrderLabel">
                <Plus :size="18" aria-hidden="true" />
              </button>
            </div>

            <article v-for="label in engagementSettings.orderLabels" :key="label.id" class="admin-rule-row">
              <div class="admin-rule-grid">
                <label>
                  標籤
                  <input v-model="label.label" type="text" />
                </label>
                <label>
                  代碼
                  <input v-model="label.id" type="text" />
                </label>
                <label>
                  色彩
                  <span class="color-input-row">
                    <input v-model="label.color" type="color" />
                    <input v-model="label.color" type="text" />
                  </span>
                </label>
                <button class="icon-button" type="button" title="刪除標籤" @click="removeOrderLabel(label.id)">
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
              </div>
            </article>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Coupons</p>
                <h3>優惠券 / 點數折抵</h3>
              </div>
              <Wallet :size="22" aria-hidden="true" />
            </div>

            <div class="admin-online-settings-grid">
              <label class="toggle-row">
                <input v-model="engagementSettings.loyaltyPoints.enabled" type="checkbox" />
                啟用點數活動
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.loyaltyPoints.earningEnabled" type="checkbox" />
                結帳累點
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.loyaltyPoints.redeemEnabled" type="checkbox" />
                結帳折抵
              </label>
              <label>
                消費金額 / 1 點
                <input v-model.number="engagementSettings.loyaltyPoints.spendAmountPerPoint" type="number" min="1" max="9999" step="1" />
              </label>
              <label>
                最低折抵點數
                <input v-model.number="engagementSettings.loyaltyPoints.minimumRedeemPoints" type="number" min="0" max="999999" step="1" />
              </label>
              <label>
                單筆折抵上限
                <input v-model.number="engagementSettings.loyaltyPoints.maximumRedeemPointsPerOrder" type="number" min="0" max="999999" step="1" />
              </label>
            </div>

            <p class="panel-note">
              0 代表不限制單筆折抵上限；正式結帳會由 POS API 原子扣點與累點，作廢/退款會依點數流水回補。
            </p>

            <div class="admin-online-settings-grid">
              <label>
                綁定會員
                <select v-model="newCoupon.memberId">
                  <option value="">不綁定</option>
                  <option v-for="member in members" :key="member.id" :value="member.id">
                    {{ member.displayName }} · {{ member.phone || member.lineUserId || '手動' }}
                  </option>
                </select>
              </label>
              <label>
                券碼
                <input v-model="newCoupon.code" type="text" placeholder="VIP50" />
              </label>
              <label>
                名稱
                <input v-model="newCoupon.title" type="text" placeholder="VIP 折抵" />
              </label>
              <label>
                固定折抵
                <input v-model.number="newCoupon.discountAmount" type="number" min="0" step="1" />
              </label>
              <label>
                百分比
                <input v-model.number="newCoupon.discountPercent" type="number" min="0" max="100" step="1" />
              </label>
              <label>
                到期
                <input v-model="newCoupon.expiresAt" type="datetime-local" />
              </label>
              <button class="primary-button" type="button" :disabled="savingSettingKey === 'coupon'" @click="addCoupon">
                <Save :size="18" aria-hidden="true" />
                建立優惠券
              </button>
            </div>

            <div class="admin-audit-meta admin-coupon-list">
              <span v-for="coupon in coupons.slice(0, 8)" :key="coupon.id">
                {{ coupon.title }} · {{ coupon.code }} ·
                {{ coupon.discountAmount > 0 ? formatCurrency(coupon.discountAmount) : `${coupon.discountPercent}%` }} ·
                {{ couponStatusLabel(coupon) }} · {{ couponMemberLabel(coupon) }} · {{ couponUsageLabel(coupon) }}
              </span>
              <span v-if="coupons.length === 0">尚無優惠券</span>
            </div>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Reservations</p>
                <h3>訂位週/月管理</h3>
              </div>
              <CalendarDays :size="22" aria-hidden="true" />
            </div>

            <div class="admin-online-settings-grid">
              <label>
                姓名
                <input v-model="newReservation.customerName" type="text" />
              </label>
              <label>
                電話
                <input v-model="newReservation.customerPhone" type="tel" />
              </label>
              <p v-if="reservationDraftBlacklistEntry" class="admin-inline-warning wide-field">
                此手機在訂位黑名單中：{{ reservationDraftBlacklistEntry.reason || reservationDraftBlacklistEntry.note || '請確認是否仍要提供訂位' }}。再次按建立訂位可覆蓋。
              </p>
              <label>
                人數
                <input v-model.number="newReservation.partySize" type="number" min="1" max="50" />
              </label>
              <label>
                時間
                <input v-model="newReservation.reservedAt" type="datetime-local" />
              </label>
              <label>
                節慶/重點
                <input v-model="newReservation.importantLabel" type="text" placeholder="母親節 / 包場" />
              </label>
              <label class="wide-field">
                備註 / 預先點餐
                <input v-model="newReservation.note" type="text" placeholder="可記錄預點餐內容" />
              </label>
              <button class="primary-button" type="button" :disabled="isIchefLoading" @click="addReservation">
                <Save :size="18" aria-hidden="true" />
                建立訂位
              </button>
            </div>

            <article
              v-for="reservation in reservations.slice(0, 8)"
              :key="reservation.id"
              class="admin-report-row"
              :class="{ 'admin-report-row-warning': Boolean(findActiveReservationBlacklistEntry(reservation.customerPhone)) }"
            >
              <span>{{ formatAuditTime(reservation.reservedAt) }} · {{ reservation.customerName }}</span>
              <strong>{{ reservation.partySize }} 人</strong>
              <small>
                {{ findActiveReservationBlacklistEntry(reservation.customerPhone) ? '黑名單' : (reservation.assignedTableIds.length > 0 ? reservation.assignedTableIds.join(' / ') : (reservation.importantLabel || reservationStatusLabels[reservation.status])) }}
              </small>
              <button
                v-if="reservation.status === 'booked'"
                class="secondary-button"
                type="button"
                @click="setReservationStatus(reservation, 'reminded')"
              >
                發提醒
              </button>
              <button
                v-if="reservation.status === 'booked' || reservation.status === 'reminded'"
                class="secondary-button"
                type="button"
                @click="setReservationStatus(reservation, 'confirmed')"
              >
                保留
              </button>
              <button
                v-if="activeReservationStatuses.includes(reservation.status)"
                class="secondary-button"
                type="button"
                @click="setReservationStatus(reservation, 'seated')"
              >
                入座
              </button>
              <button
                v-if="activeReservationStatuses.includes(reservation.status)"
                class="secondary-button"
                type="button"
                @click="setReservationStatus(reservation, 'cancelled')"
              >
                取消
              </button>
              <button class="secondary-button" type="button" @click="toggleReservationBlacklistForReservation(reservation)">
                {{ findActiveReservationBlacklistEntry(reservation.customerPhone) ? '解除黑名單' : '加入黑名單' }}
              </button>
            </article>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Reservation Website</p>
                <h3>專屬訂位網站 / 規則</h3>
              </div>
              <CalendarDays :size="22" aria-hidden="true" />
            </div>

            <div class="admin-online-toggle-grid">
              <label class="toggle-row">
                <input v-model="engagementSettings.reservationWebsite.enabled" type="checkbox" />
                開放消費者線上訂位
              </label>
            </div>

            <div class="admin-online-settings-grid">
              <label>
                餐廳名稱
                <input v-model="engagementSettings.reservationWebsite.restaurantName" type="text" />
              </label>
              <label>
                門市電話
                <input v-model="engagementSettings.reservationWebsite.phone" type="tel" />
              </label>
              <label class="wide-field">
                地址
                <input v-model="engagementSettings.reservationWebsite.address" type="text" />
              </label>
              <label class="wide-field">
                訂位公告
                <input v-model="engagementSettings.reservationWebsite.announcement" type="text" />
              </label>
              <label>
                最少人數
                <input v-model.number="engagementSettings.reservationWebsite.minPartySize" type="number" min="1" max="50" />
              </label>
              <label>
                最多人數
                <input v-model.number="engagementSettings.reservationWebsite.maxPartySize" type="number" min="1" max="50" />
              </label>
              <label>
                訂位間隔（分）
                <input v-model.number="engagementSettings.reservationWebsite.slotMinutes" type="number" min="5" max="240" step="5" />
              </label>
              <label>
                用餐時間（分）
                <input v-model.number="engagementSettings.reservationWebsite.durationMinutes" type="number" min="15" max="480" step="15" />
              </label>
              <label>
                座位保留（分）
                <input v-model.number="engagementSettings.reservationWebsite.seatHoldMinutes" type="number" min="0" max="30" step="5" />
              </label>
              <label>
                最早提前（分）
                <input v-model.number="engagementSettings.reservationWebsite.leadMinutes" type="number" min="1" max="1440" step="5" />
              </label>
              <label>
                開放天數
                <input v-model.number="engagementSettings.reservationWebsite.bookingWindowDays" type="number" min="1" max="60" />
              </label>
            </div>

            <div class="admin-online-toggle-grid">
              <label class="toggle-row">
                <input v-model="engagementSettings.reservationWebsite.allowTableCombinations" type="checkbox" />
                人數超過單桌時允許併桌
              </label>
            </div>

            <div class="admin-rule-scope">
              <strong>每週開放時段</strong>
              <article
                v-for="period in engagementSettings.reservationWebsite.businessHours"
                :key="period.id"
                class="admin-rule-grid"
              >
                <label class="toggle-row">
                  <input v-model="period.enabled" type="checkbox" />
                  {{ reservationWeekdayLabels[period.day] }}
                </label>
                <input v-model="period.start" type="time" />
                <input v-model="period.end" type="time" />
                <span class="panel-note">{{ period.enabled ? '開放' : '關閉' }}</span>
              </article>
            </div>

            <div class="admin-rule-scope">
              <div>
                <strong>特殊訂位日</strong>
                <div class="admin-action-row">
                  <button class="secondary-button" type="button" @click="addReservationSpecialDate('closed')">
                    整日不開放
                  </button>
                  <button class="secondary-button" type="button" @click="addReservationSpecialDate('custom-hours')">
                    自訂時段
                  </button>
                </div>
              </div>
              <article
                v-for="rule in engagementSettings.reservationWebsite.specialDates"
                :key="rule.id"
                class="admin-special-date-grid"
              >
                <label>
                  標籤
                  <input v-model="rule.label" type="text" placeholder="連假 / 包場 / 店休" />
                </label>
                <label>
                  起始日
                  <input v-model="rule.startDate" type="date" />
                </label>
                <label>
                  結束日
                  <input v-model="rule.endDate" type="date" />
                </label>
                <label>
                  模式
                  <select v-model="rule.mode">
                    <option value="closed">整日不開放</option>
                    <option value="custom-hours">自訂時段開放</option>
                  </select>
                </label>
                <label>
                  開始
                  <input v-model="rule.start" type="time" :disabled="rule.mode === 'closed'" />
                </label>
                <label>
                  結束
                  <input v-model="rule.end" type="time" :disabled="rule.mode === 'closed'" />
                </label>
                <button class="icon-button" type="button" title="刪除特殊訂位日" @click="removeReservationSpecialDate(rule.id)">
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
              </article>
              <p v-if="engagementSettings.reservationWebsite.specialDates.length === 0" class="panel-note">
                尚未設定特殊訂位日，會依照每週開放時段提供線上訂位。
              </p>
            </div>

            <div class="admin-rule-scope">
              <strong>可線上訂位桌位</strong>
              <label v-for="table in floorPlan.tables" :key="table.id" class="toggle-row">
                <input
                  :checked="isReservationTableOnline(table.id)"
                  type="checkbox"
                  @change="setReservationTableOnline(table.id, $event)"
                />
                {{ table.floorId }} · {{ table.label }} · {{ table.capacity }} 人
              </label>
            </div>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Blacklist</p>
                <h3>線上訂位黑名單</h3>
              </div>
              <strong>{{ activeReservationBlacklistCount }} 筆啟用</strong>
            </div>

            <div class="admin-online-settings-grid">
              <label>
                手機號碼
                <input v-model="newBlacklistEntry.phone" type="tel" placeholder="0912345678" />
              </label>
              <label>
                姓名 / 稱呼
                <input v-model="newBlacklistEntry.customerName" type="text" placeholder="可留空" />
              </label>
              <label>
                原因
                <input v-model="newBlacklistEntry.reason" type="text" placeholder="No show / 惡意訂位" />
              </label>
              <label class="wide-field">
                店內備註
                <input v-model="newBlacklistEntry.note" type="text" placeholder="僅店內判斷使用" />
              </label>
              <button class="primary-button" type="button" :disabled="savingSettingKey === 'reservation_blacklist'" @click="addReservationBlacklistEntry">
                <UserPlus :size="18" aria-hidden="true" />
                新增黑名單
              </button>
            </div>

            <article v-for="entry in reservationBlacklist.slice(0, 10)" :key="entry.id" class="admin-report-row">
              <span>{{ entry.phone }} · {{ entry.customerName || '未填姓名' }}</span>
              <strong>{{ entry.isActive ? '啟用' : '已解除' }}</strong>
              <small>{{ entry.reason || entry.note || '線上訂位黑名單' }}</small>
              <button class="secondary-button" type="button" @click="setReservationBlacklistStatus(entry, !entry.isActive)">
                {{ entry.isActive ? '解除' : '恢復' }}
              </button>
            </article>
            <p v-if="reservationBlacklist.length === 0" class="panel-note">尚無訂位黑名單</p>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">AI / Hardware / Supply</p>
                <h3>推薦、翻譯、外設、停售規則</h3>
              </div>
              <SlidersHorizontal :size="22" aria-hidden="true" />
            </div>

            <div class="admin-online-toggle-grid">
              <label class="toggle-row">
                <input v-model="engagementSettings.supplyRules.preOpenCheckEnabled" type="checkbox" />
                線上營業前檢查無供應商品
              </label>
              <label class="toggle-row">
                <input v-model="engagementSettings.supplyRules.allowFutureOrdersAcrossDay" type="checkbox" />
                跨日預約可售
              </label>
            </div>

            <div class="admin-online-settings-grid">
              <label>
                服務費名稱
                <input v-model="engagementSettings.serviceCharge.label" type="text" />
              </label>
              <label>
                內用服務費 %
                <input v-model.number="engagementSettings.serviceCharge.dineInRate" type="number" min="0" max="30" />
              </label>
              <label>
                外帶服務費 %
                <input v-model.number="engagementSettings.serviceCharge.takeoutRate" type="number" min="0" max="30" />
              </label>
              <label>
                外送服務費 %
                <input v-model.number="engagementSettings.serviceCharge.deliveryRate" type="number" min="0" max="30" />
              </label>
              <label>
                折扣計算
                <select v-model="engagementSettings.serviceCharge.discountBasis">
                  <option value="before-discount">折扣前</option>
                  <option value="after-discount">折扣後</option>
                </select>
              </label>
              <label>
                舊版預設服務費 %
                <input v-model.number="engagementSettings.defaultServiceFeeRate" type="number" min="0" max="30" />
              </label>
              <label>
                顧客類型
                <input
                  :value="engagementSettings.customerTypes.join('，')"
                  type="text"
                  @input="updateEngagementCustomerTypes"
                />
              </label>
            </div>

            <div class="admin-online-toggle-grid">
              <label class="toggle-row">
                <input v-model="engagementSettings.serviceCharge.enabled" type="checkbox" />
                啟用服務費
              </label>
            </div>

            <div class="admin-rule-scope">
              <div>
                <strong>服務費不計算分類</strong>
                <span>分類文字只切換下方品項，方框才會整類排除。</span>
              </div>
              <div class="admin-toggle-grid">
                <div
                  v-for="category in menuCategoryOptions"
                  :key="`service-charge-category-${category.value}`"
                  class="toggle-row admin-rule-category-row"
                  :class="{
                    'toggle-row--active': serviceChargeCategoryFullyExcluded(category.value),
                    'toggle-row--focused': activeServiceChargeCategory === category.value,
                  }"
                >
                  <input
                    type="checkbox"
                    :checked="serviceChargeCategoryFullyExcluded(category.value)"
                    @click.stop
                    @change="toggleServiceChargeCategory(category.value)"
                  />
                  <button class="admin-rule-category-button" type="button" @click="selectServiceChargeCategory(category.value)">
                    {{ category.label }}
                  </button>
                </div>
              </div>
            </div>

            <div class="admin-rule-scope">
              <div>
                <strong>服務費不計算指定品項</strong>
                <span>{{ categoryLabels[activeServiceChargeCategory] ?? activeServiceChargeCategory }} 品項可單獨調整。</span>
              </div>
              <div class="admin-rule-item-grid">
                <label
                  v-for="product in serviceChargeProductOptions"
                  :key="`service-charge-item-${product.id}`"
                  class="toggle-row"
                  :class="{ 'toggle-row--active': serviceChargeItemExcluded(product) }"
                >
                  <input
                    type="checkbox"
                    :checked="serviceChargeItemExcluded(product)"
                    @change="toggleServiceChargeItem(product.id)"
                  />
                  <span>{{ product.name }}</span>
                  <small>{{ categoryLabels[product.category] ?? product.category }}</small>
                </label>
              </div>
              <p v-if="serviceChargeProductOptions.length === 0" class="panel-note">此分類尚無商品。</p>
            </div>

            <div class="admin-rule-scope">
              <div>
                <strong>供應時段</strong>
                <button class="icon-button" type="button" title="新增時段" @click="addSupplyWindow">
                  <Plus :size="18" aria-hidden="true" />
                </button>
              </div>
              <article v-for="period in engagementSettings.supplyRules.defaultPeriods" :key="period.id" class="admin-rule-grid">
                <input v-model="period.label" type="text" />
                <input v-model="period.start" type="time" />
                <input v-model="period.end" type="time" />
                <button class="icon-button" type="button" title="刪除時段" @click="removeSupplyWindow(period.id)">
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
              </article>
            </div>

            <div class="admin-rule-scope">
              <div>
                <strong>推薦規則</strong>
                <button class="icon-button" type="button" title="新增推薦" @click="addRecommendationRule">
                  <Plus :size="18" aria-hidden="true" />
                </button>
              </div>
              <article v-for="rule in engagementSettings.recommendations" :key="rule.id" class="admin-rule-grid">
                <input v-model="rule.title" type="text" />
                <input v-model="rule.trigger" type="text" placeholder="any / coffee / morning" />
                <label class="toggle-row">
                  <input v-model="rule.enabled" type="checkbox" />
                  啟用
                </label>
              </article>
            </div>

            <div class="admin-rule-scope">
              <div>
                <strong>App 運作模式</strong>
                <span>對齊 iCHEF POS 主機 / 子機：只有主機可套用新設定檔，子機工具箱限縮。</span>
              </div>
              <div class="admin-online-settings-grid">
                <label>
                  主機 station id
                  <input
                    v-model.trim="engagementSettings.appOperation.hostStationId"
                    type="text"
                    placeholder="留空代表目前平板可作為主機"
                    @input="updateAppOperationChildStations(appOperationChildStationText())"
                  />
                </label>
                <label>
                  子機上限
                  <input
                    v-model.number="engagementSettings.appOperation.maxChildStations"
                    type="number"
                    min="0"
                    max="20"
                    step="1"
                    @input="updateAppOperationChildStations(appOperationChildStationText())"
                  />
                </label>
                <label class="wide-field">
                  子機 station id
                  <input
                    :value="appOperationChildStationText()"
                    type="text"
                    placeholder="最多 5 台，逗號分隔；依合約可調整上限"
                    @input="updateAppOperationChildStations(($event.target as HTMLInputElement).value)"
                  />
                </label>
              </div>
              <p class="panel-note">
                iCHEF 同一 Store ID 僅一台 iPad 可作為主機；子機需連同一網路且 App 版本一致。本設定會讓非主機無法套用新設定檔，並在 POS 工具箱顯示子機限制。
              </p>
            </div>

            <div class="admin-rule-scope">
              <div>
                <strong>多結帳口 / 帳本</strong>
                <button class="icon-button" type="button" title="新增帳本" @click="addCheckoutCounterBook">
                  <Plus :size="18" aria-hidden="true" />
                </button>
              </div>
              <label class="toggle-row">
                <input v-model="engagementSettings.checkoutCounters.enabled" type="checkbox" />
                啟用 iPad 獨立結帳口
              </label>
              <label>
                預設帳本
                <select v-model="engagementSettings.checkoutCounters.defaultBookId">
                  <option
                    v-for="book in engagementSettings.checkoutCounters.books"
                    :key="`checkout-default-${book.id}`"
                    :value="book.id"
                  >
                    {{ book.name }}
                  </option>
                </select>
              </label>
              <article
                v-for="book in engagementSettings.checkoutCounters.books"
                :key="book.id"
                class="admin-rule-grid"
              >
                <input v-model="book.name" type="text" placeholder="帳本名稱" />
                <input
                  :value="checkoutCounterStationText(book)"
                  type="text"
                  placeholder="指定平板 station id，逗號分隔"
                  @input="updateCheckoutCounterStations(book, ($event.target as HTMLInputElement).value)"
                />
                <select v-model="book.printStationId">
                  <option value="">預設出單機</option>
                  <option v-for="station in printerSettings.stations" :key="`checkout-printer-${station.id}`" :value="station.id">
                    {{ station.name }}
                  </option>
                </select>
                <select v-model="book.cashDrawerDeviceId">
                  <option value="">不指定錢櫃</option>
                  <option
                    v-for="device in engagementSettings.hardwareDevices.filter((entry) => entry.kind === 'cash-drawer')"
                    :key="`checkout-drawer-${device.id}`"
                    :value="device.id"
                  >
                    {{ device.name }}
                  </option>
                </select>
                <input
                  :value="checkoutCounterPaymentDeviceText(book)"
                  type="text"
                  placeholder="刷卡/掃碼 device id，逗號分隔"
                  @input="updateCheckoutCounterPaymentDevices(book, ($event.target as HTMLInputElement).value)"
                />
                <label class="toggle-row">
                  <input v-model="book.enabled" type="checkbox" />
                  啟用
                </label>
                <button class="icon-button" type="button" title="刪除帳本" @click="removeCheckoutCounterBook(book.id)">
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
              </article>
              <p class="panel-note">
                指定平板會在開班、結帳、現金臨時收支與錢櫃事件中使用自己的帳本；未指定的平板使用預設帳本。
              </p>
            </div>

            <div class="admin-rule-scope">
              <strong>外設</strong>
              <label v-for="device in engagementSettings.hardwareDevices" :key="device.id" class="toggle-row">
                <input v-model="device.enabled" type="checkbox" />
                {{ device.name }}
                <input v-model="device.targetStationId" type="text" placeholder="指定平板 / station id" />
              </label>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="activeAdminTab === 'reports'" class="admin-tab-panel" aria-label="營運報表">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Reports</p>
            <h2>營運日報</h2>
            <span class="panel-note">依台灣營業日統計營收、付款方式、來源與熱門商品</span>
          </div>
          <div class="admin-action-row admin-audit-actions">
            <label class="admin-limit-field">
              日期
              <input v-model="reportDate" type="date" />
            </label>
            <button class="primary-button" type="button" :disabled="isReportLoading" @click="loadDailyReport">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isReportLoading ? '讀取中' : '刷新日報' }}
            </button>
            <label class="admin-limit-field">
              關帳信
              <input v-model.number="closeoutReportDeliveryLimit" type="number" min="1" max="200" step="1" />
            </label>
            <button class="primary-button secondary-button" type="button" :disabled="isCloseoutReportDeliveryLoading" @click="loadCloseoutReportDeliveries">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isCloseoutReportDeliveryLoading ? '讀取中' : '刷新關帳信' }}
            </button>
            <button class="primary-button secondary-button" type="button" :disabled="!dailyReport" @click="exportDailyReportCsv">
              <Download :size="18" aria-hidden="true" />
              匯出 CSV
            </button>
          </div>
        </div>

        <div v-if="dailyReport" class="admin-report-grid">
          <article class="admin-report-card admin-report-card--primary">
            <span>實收營收</span>
            <strong>{{ formatCurrency(dailyReport.collectedTotal) }}</strong>
            <small>{{ dailyReport.collectedOrders }} 張已收 · 平均 {{ formatCurrency(dailyReport.averageTicket) }}</small>
          </article>
          <article class="admin-report-card">
            <span>待收款</span>
            <strong>{{ formatCurrency(dailyReport.pendingTotal) }}</strong>
            <small>{{ dailyReport.openOrderCount }} 張未交付</small>
          </article>
          <article class="admin-report-card">
            <span>退款</span>
            <strong>{{ formatCurrency(dailyReport.refundTotal) }}</strong>
            <small>{{ dailyReport.voidedOrderCount }} 張作廢</small>
          </article>
          <article class="admin-report-card">
            <span>異常</span>
            <strong>{{ dailyReport.failedPaymentCount + dailyReport.failedPrintCount }}</strong>
            <small>付款 {{ dailyReport.failedPaymentCount }} · 列印 {{ dailyReport.failedPrintCount }}</small>
          </article>
          <article class="admin-report-card">
            <span>尖峰時段</span>
            <strong>{{ reportPeakHour ? reportHourLabel(reportPeakHour.hour) : '--:--' }}</strong>
            <small>{{ reportPeakHour ? `${reportPeakHour.count} 張 · ${formatCurrency(reportPeakHour.total)}` : '尚無資料' }}</small>
          </article>
        </div>

        <section class="admin-subpanel admin-report-delivery-panel" aria-label="關帳信紀錄">
          <div class="admin-subpanel-heading">
            <div>
              <p class="eyebrow">Closeout Email</p>
              <h3>關帳信紀錄</h3>
            </div>
            <span class="panel-note">
              已寄 {{ closeoutReportDeliverySummary.sent }} · 待寄 {{ closeoutReportDeliverySummary.queued }} · 失敗 {{ closeoutReportDeliverySummary.failed }}
            </span>
          </div>

          <div class="admin-audit-list admin-report-delivery-list">
            <article v-for="delivery in closeoutReportDeliveries" :key="delivery.id" class="admin-audit-row">
              <header class="admin-row-header">
                <div class="admin-audit-primary">
                  <strong>{{ delivery.recipientName }} · {{ delivery.recipientEmail }}</strong>
                  <span>{{ delivery.subject }}</span>
                </div>
                <time :datetime="delivery.createdAt">{{ formatAuditTime(delivery.createdAt) }}</time>
              </header>
              <div class="admin-audit-meta">
                <span class="status-pill" :class="closeoutReportDeliveryStatusClass(delivery)">
                  {{ closeoutReportDeliveryStatusLabel(delivery) }}
                </span>
                <span>{{ delivery.deliveryProvider }}</span>
                <span>{{ delivery.sentAt ? `寄出 ${formatAuditTime(delivery.sentAt)}` : '尚未寄出' }}</span>
                <span v-if="delivery.errorMessage">{{ delivery.errorMessage }}</span>
              </div>
            </article>

            <div v-if="closeoutReportDeliveries.length === 0" class="empty-state">
              <Search :size="24" aria-hidden="true" />
              <span>尚無關帳信紀錄</span>
            </div>
          </div>
        </section>

        <div v-if="dailyReport" class="admin-section-grid admin-report-sections">
          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Payment</p>
                <h3>付款方式</h3>
              </div>
              <BarChart3 :size="22" aria-hidden="true" />
            </div>
            <article v-for="row in dailyReport.byPaymentMethod" :key="row.key" class="admin-report-row">
              <span>{{ reportBreakdownLabel(row.key) }}</span>
              <strong>{{ formatCurrency(row.total) }}</strong>
              <small>{{ row.count }} 張</small>
            </article>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Channel</p>
                <h3>來源與服務</h3>
              </div>
              <BarChart3 :size="22" aria-hidden="true" />
            </div>
            <article v-for="row in dailyReport.bySource" :key="row.key" class="admin-report-row">
              <span>{{ reportBreakdownLabel(row.key) }}</span>
              <strong>{{ formatCurrency(row.total) }}</strong>
              <small>{{ row.count }} 張</small>
            </article>
            <article v-for="row in dailyReport.byServiceMode" :key="`mode-${row.key}`" class="admin-report-row">
              <span>{{ reportBreakdownLabel(row.key) }}</span>
              <strong>{{ formatCurrency(row.total) }}</strong>
              <small>{{ row.count }} 張</small>
            </article>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Products</p>
                <h3>熱門商品</h3>
              </div>
              <BarChart3 :size="22" aria-hidden="true" />
            </div>
            <article v-for="product in dailyReport.topProducts" :key="product.sku" class="admin-report-row">
              <span>{{ product.name }}</span>
              <strong>{{ formatCurrency(product.total) }}</strong>
              <small>{{ product.quantity }} 件</small>
            </article>
            <div v-if="dailyReport.topProducts.length === 0" class="empty-state">
              <Search :size="24" aria-hidden="true" />
              <span>尚無已收款商品</span>
            </div>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Hourly</p>
                <h3>時段分布</h3>
              </div>
              <BarChart3 :size="22" aria-hidden="true" />
            </div>
            <article
              v-for="row in dailyReport.hourly.filter((entry) => entry.count > 0)"
              :key="row.hour"
              class="admin-report-row"
            >
              <span>{{ reportHourLabel(row.hour) }}</span>
              <strong>{{ formatCurrency(row.total) }}</strong>
              <small>{{ row.count }} 張</small>
            </article>
            <div v-if="dailyReport.hourly.every((entry) => entry.count === 0)" class="empty-state">
              <Search :size="24" aria-hidden="true" />
              <span>當日尚無訂單</span>
            </div>
          </section>
        </div>

        <div v-if="!dailyReport" class="empty-state">
          <BarChart3 :size="24" aria-hidden="true" />
          <span>載入後台後會顯示日報</span>
        </div>
      </section>

      <section v-else-if="activeAdminTab === 'payments'" class="admin-tab-panel" aria-label="支付事件">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Payments</p>
            <h2>金流回呼事件</h2>
            <span class="panel-note">追查 LINE Pay、街口與未來金流 provider 的冪等處理</span>
          </div>
          <div class="admin-action-row admin-audit-actions">
            <label class="admin-limit-field">
              筆數
              <input v-model.number="paymentEventLimit" type="number" min="1" max="100" step="1" />
            </label>
            <label class="admin-limit-field">
              Provider
              <select v-model="paymentProviderFilter">
                <option value="all">全部</option>
                <option v-for="provider in paymentProviderOptions" :key="provider.value" :value="provider.value">
                  {{ provider.label }}
                </option>
              </select>
            </label>
            <label class="admin-limit-field">
              狀態
              <select v-model="paymentEventStatusFilter">
                <option v-for="option in paymentEventStatusOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <button class="primary-button" type="button" :disabled="isPaymentEventLoading" @click="loadPaymentEvents">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isPaymentEventLoading ? '讀取中' : '刷新支付' }}
            </button>
            <button
              class="primary-button secondary-button"
              type="button"
              :disabled="filteredPaymentEvents.length === 0"
              @click="exportPaymentEventsCsv"
            >
              <Download :size="18" aria-hidden="true" />
              匯出 CSV
            </button>
          </div>
        </div>

        <div class="admin-audit-list">
          <article v-for="event in filteredPaymentEvents" :key="event.id" class="admin-audit-row">
            <header class="admin-row-header">
              <div class="admin-audit-primary">
                <strong>{{ event.provider }} · {{ event.orderNumber }}</strong>
                <span>{{ event.eventType || 'payment.webhook' }} · {{ event.eventId }}</span>
              </div>
              <time :datetime="event.createdAt">{{ formatAuditTime(event.createdAt) }}</time>
            </header>

            <div class="admin-audit-meta">
              <span class="status-pill" :class="paymentEventStatusClass(event)">{{ paymentEventStatusLabel(event) }}</span>
              <span>{{ paymentStatusLabels[event.paymentStatus] }}</span>
              <span>{{ event.amount === null ? '金額未帶入' : formatCurrency(event.amount) }}</span>
              <span>{{ event.processedAt ? `處理 ${formatAuditTime(event.processedAt)}` : '未處理' }}</span>
            </div>
          </article>

          <div v-if="filteredPaymentEvents.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>尚無金流回呼事件</span>
          </div>
        </div>
      </section>

      <section v-else-if="activeAdminTab === 'printing'" class="admin-tab-panel" aria-label="出單規則">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Printing</p>
            <h2>出單機與印單規則</h2>
            <span class="panel-note">先設定出單機，再指定服務方式與商品類別</span>
          </div>
          <button class="primary-button" type="button" :disabled="savingSettingKey === 'printer_settings'" @click="savePrinterSettings">
            <Save :size="18" aria-hidden="true" />
            {{ savingSettingKey === 'printer_settings' ? '儲存中' : '儲存出單' }}
          </button>
        </div>

        <div class="admin-section-grid">
          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Stations</p>
                <h3>出單機</h3>
              </div>
              <button class="icon-button" type="button" title="新增出單機" @click="addStation">
                <Plus :size="18" aria-hidden="true" />
              </button>
            </div>

            <article v-for="(station, stationIndex) in printerSettings.stations" :key="station.id" class="admin-station-row">
              <div class="admin-station-title">
                <Printer :size="20" aria-hidden="true" />
                <strong>{{ station.name }}</strong>
                <div class="admin-order-actions" aria-label="出單機排序">
                  <button
                    class="icon-button"
                    type="button"
                    title="出單機往上"
                    :disabled="stationIndex === 0"
                    @click="moveStation(station.id, -1)"
                  >
                    <ArrowUp :size="16" aria-hidden="true" />
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    title="出單機往下"
                    :disabled="stationIndex >= printerSettings.stations.length - 1"
                    @click="moveStation(station.id, 1)"
                  >
                    <ArrowDown :size="16" aria-hidden="true" />
                  </button>
                </div>
                <button class="icon-button" type="button" title="刪除出單機" @click="removeStation(station.id)">
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
              </div>
              <div class="admin-station-grid">
                <label>
                  名稱
                  <input v-model="station.name" type="text" />
                </label>
                <label>
                  主機 IP
                  <input v-model="station.host" type="text" />
                </label>
                <label>
                  連接埠
                  <input v-model.number="station.port" type="number" min="1" max="65535" />
                </label>
                <label>
                  協定
                  <input v-model="station.protocol" type="text" />
                </label>
              </div>
              <div class="admin-toggle-grid admin-toggle-grid--compact">
                <label class="toggle-row">
                  <input v-model="station.enabled" type="checkbox" />
                  啟用
                </label>
                <label class="toggle-row">
                  <input v-model="station.autoPrint" type="checkbox" />
                  自動列印
                </label>
              </div>
            </article>
          </section>

          <section class="admin-subpanel">
            <div class="admin-subpanel-heading">
              <div>
                <p class="eyebrow">Rules</p>
                <h3>印單規則</h3>
              </div>
              <button class="icon-button" type="button" title="新增印單規則" @click="addPrintRule">
                <Plus :size="18" aria-hidden="true" />
              </button>
            </div>

            <article v-for="rule in printerRuleRows" :key="rule.id" class="admin-rule-row">
              <div class="admin-row-header">
                <label>
                  規則名稱
                  <input v-model="rule.name" type="text" />
                </label>
                <div class="admin-order-actions" aria-label="印單規則排序">
                  <button
                    class="icon-button"
                    type="button"
                    title="同出單機規則往上"
                    :disabled="printRuleStationIndex(rule) <= 0"
                    @click="movePrintRule(rule.id, -1)"
                  >
                    <ArrowUp :size="16" aria-hidden="true" />
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    title="同出單機規則往下"
                    :disabled="printRuleStationIndex(rule) >= printRuleStationCount(rule) - 1"
                    @click="movePrintRule(rule.id, 1)"
                  >
                    <ArrowDown :size="16" aria-hidden="true" />
                  </button>
                  <button class="icon-button" type="button" title="刪除印單規則" @click="removePrintRule(rule.id)">
                    <Trash2 :size="16" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div class="admin-rule-grid">
                <label>
                  服務方式
                  <select v-model="rule.serviceMode">
                    <option v-for="mode in serviceModeOptions" :key="mode.value" :value="mode.value">
                      {{ mode.label }}
                    </option>
                  </select>
                </label>
                <label>
                  出單機
                  <select v-model="rule.stationId">
                    <option v-for="station in stationOptions" :key="station.id" :value="station.id">
                      {{ station.name }}
                    </option>
                  </select>
                </label>
                <label>
                  單據
                  <select v-model="rule.labelMode">
                    <option v-for="mode in labelModeOptions" :key="mode.value" :value="mode.value">
                      {{ mode.label }}
                    </option>
                  </select>
                </label>
                <label>
                  份數
                  <input v-model.number="rule.copies" type="number" min="1" max="5" />
                </label>
              </div>

              <div class="admin-toggle-grid">
                <label class="toggle-row">
                  <input v-model="rule.enabled" type="checkbox" />
                  啟用
                </label>
                <label
                  v-for="timing in printRuleTimingOptions"
                  :key="`${rule.id}-timing-${timing.value}`"
                  class="toggle-row"
                  :class="{ 'toggle-row--active': printRuleTimingSelected(rule, timing.value) }"
                >
                  <input
                    type="checkbox"
                    :checked="printRuleTimingSelected(rule, timing.value)"
                    @change="toggleRuleTiming(rule, timing.value)"
                  />
                  {{ timing.label }}
                </label>
                <div
                  v-for="category in menuCategoryOptions"
                  :key="category.value"
                  class="toggle-row admin-rule-category-row"
                  :class="{
                    'toggle-row--active': printRuleCategoryFullySelected(rule, category.value),
                    'toggle-row--focused': activePrintRuleCategoryId(rule) === category.value,
                  }"
                >
                  <input
                    type="checkbox"
                    :checked="printRuleCategoryFullySelected(rule, category.value)"
                    @click.stop
                    @change="toggleRuleCategory(rule, category.value)"
                  />
                  <button
                    class="admin-rule-category-button"
                    type="button"
                    @click="selectPrintRuleCategory(rule, category.value)"
                  >
                    {{ category.label }}
                  </button>
                </div>
              </div>

              <div class="admin-rule-scope">
                <div>
                  <strong>指定品項</strong>
                  <span>{{ categoryLabels[activePrintRuleCategoryId(rule)] ?? activePrintRuleCategoryId(rule) }} 品項可單獨調整。</span>
                </div>
                <div class="admin-rule-item-grid">
                  <label
                    v-for="product in printRuleProductOptions(rule)"
                    :key="`${rule.id}-${product.id}`"
                    class="toggle-row"
                    :class="{ 'toggle-row--active': printRuleItemSelected(rule, product) }"
                  >
                    <input
                      type="checkbox"
                      :checked="printRuleItemSelected(rule, product)"
                      @change="toggleRuleItem(rule, product.id)"
                    />
                    <span>{{ product.name }}</span>
                    <small>{{ categoryLabels[product.category] ?? product.category }}</small>
                  </label>
                </div>
              </div>

              <div class="admin-rule-scope">
                <div>
                  <strong>不計算商品</strong>
                  <span>已裁貼紙總數會排除這些品項，商品仍可依列印範圍出單。</span>
                </div>
                <div class="admin-toggle-grid">
                  <div
                    v-for="category in menuCategoryOptions"
                    :key="`${rule.id}-count-${category.value}`"
                    class="toggle-row admin-rule-category-row"
                    :class="{
                      'toggle-row--active': printRuleCountCategoryFullySelected(rule, category.value),
                      'toggle-row--focused': activePrintRuleCountCategoryId(rule) === category.value,
                    }"
                  >
                    <input
                      type="checkbox"
                      :checked="printRuleCountCategoryFullySelected(rule, category.value)"
                      @click.stop
                      @change="toggleRuleCountCategory(rule, category.value)"
                    />
                    <button
                      class="admin-rule-category-button"
                      type="button"
                      @click="selectPrintRuleCountCategory(rule, category.value)"
                    >
                      {{ category.label }}
                    </button>
                  </div>
                </div>
                <div class="admin-rule-item-grid">
                  <label
                    v-for="product in printRuleCountProductOptions(rule)"
                    :key="`${rule.id}-count-${product.id}`"
                    class="toggle-row"
                    :class="{ 'toggle-row--active': printRuleCountItemSelected(rule, product) }"
                  >
                    <input
                      type="checkbox"
                      :checked="printRuleCountItemSelected(rule, product)"
                      @change="toggleRuleCountItem(rule, product.id)"
                    />
                    <span>{{ product.name }}</span>
                    <small>{{ categoryLabels[product.category] ?? product.category }}</small>
                  </label>
                </div>
              </div>
            </article>
          </section>
        </div>
      </section>

      <section v-else-if="activeAdminTab === 'operations'" class="admin-tab-panel" aria-label="營運紀錄">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Timeline</p>
            <h2>營運紀錄</h2>
            <span class="panel-note">整合平板心跳、開關班與關鍵操作紀錄</span>
          </div>
          <div class="admin-action-row admin-audit-actions admin-operations-toolbar">
            <label class="search-box">
              <Search :size="18" aria-hidden="true" />
              <input v-model="operationSearchTerm" type="search" placeholder="搜尋平板、訂單、會員或操作" />
            </label>
            <label class="admin-limit-field">
              類型
              <select v-model="operationKindFilter">
                <option v-for="option in operationTimelineFilterOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label class="admin-limit-field">
              平板
              <select v-model="operationStationFilter">
                <option value="all">全部平板</option>
                <option v-for="station in operationStationOptions" :key="station.value" :value="station.value">
                  {{ station.label }}
                </option>
              </select>
            </label>
            <button class="primary-button" type="button" :disabled="isOperationLoading" @click="loadOperationTimeline">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isOperationLoading ? '讀取中' : '刷新紀錄' }}
            </button>
            <button
              class="primary-button secondary-button"
              type="button"
              :disabled="filteredOperationTimelineEntries.length === 0"
              @click="exportOperationTimelineCsv"
            >
              <Download :size="18" aria-hidden="true" />
              匯出 CSV
            </button>
          </div>
        </div>

        <div class="admin-operation-summary" aria-label="營運紀錄摘要">
          <article>
            <span>目前顯示</span>
            <strong>{{ filteredOperationTimelineEntries.length }}</strong>
          </article>
          <article>
            <span>操作稽核</span>
            <strong>{{ auditEvents.length }}</strong>
          </article>
          <article>
            <span>平板心跳</span>
            <strong>{{ stationHeartbeats.length }}</strong>
          </article>
          <article>
            <span>在線平板</span>
            <strong>{{ onlineStationCount }}</strong>
          </article>
        </div>

        <div class="admin-operation-list">
          <article v-for="entry in filteredOperationTimelineEntries" :key="entry.id" class="admin-operation-row">
            <time :datetime="entry.createdAt">{{ formatAuditTime(entry.createdAt) }}</time>
            <div class="admin-operation-body">
              <header class="admin-row-header">
                <div class="admin-audit-primary">
                  <strong>{{ entry.title }}</strong>
                  <span>{{ entry.subject }}</span>
                </div>
                <span class="status-pill" :class="entry.statusClass">{{ entry.statusLabel }}</span>
              </header>

              <div class="admin-audit-meta">
                <span>{{ entry.stationId }}</span>
                <span>{{ entry.actor }}</span>
                <span>{{ entry.summary }}</span>
              </div>
            </div>
          </article>

          <div v-if="filteredOperationTimelineEntries.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>尚無符合條件的營運紀錄</span>
          </div>
        </div>
      </section>

      <section v-else-if="activeAdminTab === 'stations'" class="admin-tab-panel" aria-label="平板在線">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Stations</p>
            <h2>平板在線</h2>
            <span class="panel-note">檢查平板最後心跳與使用環境</span>
          </div>
          <button class="primary-button" type="button" :disabled="isStationLoading" @click="loadStationHeartbeats">
            <RefreshCw :size="18" aria-hidden="true" />
            {{ isStationLoading ? '讀取中' : '刷新平板' }}
          </button>
        </div>

        <div class="admin-station-heartbeat-list">
          <article v-for="station in stationHeartbeats" :key="station.stationId" class="admin-station-heartbeat-row">
            <header class="admin-row-header">
              <div class="admin-audit-primary">
                <strong>{{ station.stationLabel || station.stationId }}</strong>
                <span>{{ station.stationId }}</span>
              </div>
              <span class="status-pill" :class="stationStatusClass(station)">
                {{ stationStatusLabel(station) }}
              </span>
            </header>

            <div class="admin-audit-meta">
              <span>最後 {{ formatAuditTime(station.lastSeenAt) }}</span>
              <span>{{ station.platform || '未標記平台' }}</span>
              <span>{{ station.appVersion || '未標記版本' }}</span>
            </div>
          </article>

          <div v-if="stationHeartbeats.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>尚無平板心跳紀錄</span>
          </div>
        </div>
      </section>

      <section v-else-if="activeAdminTab === 'audit'" class="admin-tab-panel" aria-label="操作稽核">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Audit</p>
            <h2>操作稽核</h2>
            <span class="panel-note">追查收款、作廢、鎖單與開關班紀錄</span>
          </div>
          <div class="admin-action-row admin-audit-actions">
            <label class="admin-limit-field">
              筆數
              <input v-model.number="auditLimit" type="number" min="1" max="100" step="1" />
            </label>
            <button class="primary-button" type="button" :disabled="isAuditLoading" @click="loadAuditEvents">
              <RefreshCw :size="18" aria-hidden="true" />
              {{ isAuditLoading ? '讀取中' : '刷新稽核' }}
            </button>
            <button
              class="primary-button secondary-button"
              type="button"
              :disabled="filteredAuditEvents.length === 0"
              @click="exportAuditEventsCsv"
            >
              <Download :size="18" aria-hidden="true" />
              匯出 CSV
            </button>
          </div>
        </div>

        <div class="segmented-control admin-filter admin-audit-filter" aria-label="稽核類型">
          <button
            class="segment-button"
            :class="{ 'segment-button--active': auditActionFilter === 'all' }"
            type="button"
            @click="auditActionFilter = 'all'"
          >
            全部
          </button>
          <button
            v-for="action in auditActionOptions"
            :key="action.value"
            class="segment-button"
            :class="{ 'segment-button--active': auditActionFilter === action.value }"
            type="button"
            @click="auditActionFilter = action.value"
          >
            {{ action.label }}
          </button>
        </div>

        <div class="admin-audit-list">
          <article v-for="event in filteredAuditEvents" :key="event.id" class="admin-audit-row">
            <header class="admin-row-header">
              <div class="admin-audit-primary">
                <strong>{{ auditActionLabel(event.action) }}</strong>
                <span>{{ auditSubject(event) }}</span>
              </div>
              <time :datetime="event.createdAt">{{ formatAuditTime(event.createdAt) }}</time>
            </header>

            <div class="admin-audit-meta">
              <span>{{ event.stationId || '未標記平板' }}</span>
              <span>{{ event.actor || 'pos-api' }}</span>
              <span>{{ auditMetadataSummary(event) }}</span>
            </div>
          </article>

          <div v-if="filteredAuditEvents.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>尚無符合條件的稽核紀錄</span>
          </div>
        </div>
      </section>

      <section v-else class="admin-tab-panel" aria-label="權限">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Access</p>
            <h2>角色權限與員工</h2>
            <span class="panel-note">員工識別碼可在工具箱打卡，上下班紀錄會寫入雲端</span>
          </div>
          <div class="admin-action-row">
            <button class="icon-button" type="button" title="新增員工" @click="addStaffAccount">
              <UserPlus :size="18" aria-hidden="true" />
            </button>
            <button class="icon-button" type="button" title="新增角色" @click="addRole">
              <Plus :size="18" aria-hidden="true" />
            </button>
            <button class="primary-button" type="button" :disabled="savingSettingKey === 'access_control'" @click="saveAccessControl">
              <Save :size="18" aria-hidden="true" />
              {{ savingSettingKey === 'access_control' ? '儲存中' : '儲存權限' }}
            </button>
          </div>
        </div>

        <div class="admin-role-list">
          <article v-for="role in accessControl.roles" :key="role.id" class="admin-role-row">
            <div class="admin-role-header">
              <KeyRound :size="20" aria-hidden="true" />
              <label>
                角色名稱
                <input v-model="role.name" type="text" />
              </label>
              <label class="toggle-row">
                <input v-model="role.pinRequired" type="checkbox" />
                需員工識別碼
              </label>
              <button class="icon-button" type="button" title="刪除角色" @click="removeRole(role.id)">
                <Trash2 :size="16" aria-hidden="true" />
              </button>
            </div>

            <div class="permission-grid">
              <label
                v-for="permission in permissionOptions"
                :key="permission.value"
                class="toggle-row permission-toggle"
              >
                <input
                  type="checkbox"
                  :checked="hasPermission(role, permission.value)"
                  @change="togglePermission(role, permission.value)"
                />
                <SlidersHorizontal :size="16" aria-hidden="true" />
                {{ permission.label }}
              </label>
            </div>
          </article>
        </div>

        <div class="panel-heading admin-subheading">
          <div>
            <p class="eyebrow">POS Verification</p>
            <h3>操作驗證開關</h3>
            <span class="panel-note">開啟後，平板執行該操作時會要求員工識別碼，並檢查所屬角色是否有權限</span>
          </div>
        </div>

        <div class="admin-protected-permission-grid">
          <label
            v-for="permission in permissionOptions"
            :key="`protected-${permission.value}`"
            class="toggle-row permission-toggle admin-protected-permission"
          >
            <input
              type="checkbox"
              :checked="permissionRequiresStaffCode(permission.value)"
              @change="toggleProtectedPermission(permission.value)"
            />
            <KeyRound :size="16" aria-hidden="true" />
            <span>{{ permission.label }}</span>
            <small>{{ permissionRequiresStaffCode(permission.value) ? '需要驗證' : '無須驗證' }}</small>
          </label>
        </div>

        <div class="panel-heading admin-subheading">
          <div>
            <p class="eyebrow">Staff</p>
            <h3>員工識別碼</h3>
            <span class="panel-note">{{ activeStaffCount }} 位啟用 · 供工具箱打卡與後續權限驗證使用</span>
          </div>
        </div>

        <div class="admin-role-list">
          <article v-for="staff in accessControl.staffAccounts" :key="staff.id" class="admin-role-row">
            <div class="admin-role-header">
              <UserPlus :size="20" aria-hidden="true" />
              <label>
                員工名稱
                <input v-model="staff.name" type="text" />
              </label>
              <label>
                識別碼
                <input v-model="staff.staffCode" type="text" inputmode="numeric" autocomplete="off" />
              </label>
              <label>
                角色
                <select v-model="staff.roleId">
                  <option v-for="role in accessControl.roles" :key="role.id" :value="role.id">
                    {{ role.name }}
                  </option>
                </select>
              </label>
              <label v-if="staffCanReceiveDailyReport(staff)">
                報表寄送 Email
                <input v-model.trim="staff.reportEmail" type="email" autocomplete="email" />
              </label>
              <label class="toggle-row">
                <input v-model="staff.active" type="checkbox" />
                啟用
              </label>
              <button class="icon-button" type="button" title="刪除員工" @click="removeStaffAccount(staff.id)">
                <Trash2 :size="16" aria-hidden="true" />
              </button>
            </div>
            <div class="admin-audit-meta">
              <span>{{ staffRoleName(staff) }}</span>
              <span>{{ staff.active ? '可打卡' : '已停用' }}</span>
              <span>{{ staffCanReceiveDailyReport(staff) ? (staff.reportEmail || '未設定報表 Email') : '未開啟日結報表寄送' }}</span>
            </div>
          </article>
          <div v-if="accessControl.staffAccounts.length === 0" class="empty-state">
            <UserPlus :size="24" aria-hidden="true" />
            <span>尚未建立員工識別碼</span>
          </div>
        </div>

        <div class="panel-heading admin-subheading">
          <div>
            <p class="eyebrow">Permission Log</p>
            <h3>權限紀錄</h3>
            <span class="panel-note">{{ permissionAuditSummary }} · 只列出員工識別碼驗證成功紀錄</span>
          </div>
          <div class="admin-action-row admin-audit-actions">
            <label class="admin-inline-field">
              筆數
              <input v-model.number="permissionAuditLimit" type="number" min="1" max="100" step="1" />
            </label>
            <button class="primary-button" type="button" :disabled="isPermissionAuditLoading" @click="loadPermissionAuditEvents">
              <RefreshCw :size="16" aria-hidden="true" />
              {{ isPermissionAuditLoading ? '讀取中' : '刷新權限紀錄' }}
            </button>
            <button class="secondary-button" type="button" :disabled="permissionAuditEvents.length === 0" @click="exportPermissionAuditCsv">
              <Download :size="16" aria-hidden="true" />
              下載權限紀錄
            </button>
          </div>
        </div>

        <div class="admin-audit-list">
          <article v-for="event in permissionAuditEvents" :key="event.id" class="admin-audit-row">
            <div class="admin-row-header">
              <div class="admin-audit-primary">
                <strong>{{ permissionAuditOperator(event) }}</strong>
                <span>{{ permissionLabel(event.metadata.permission) }}</span>
              </div>
              <time :datetime="event.createdAt">{{ formatAuditTime(event.createdAt) }}</time>
            </div>
            <div class="admin-audit-meta">
              <span>{{ permissionAuditRole(event) }}</span>
              <span>{{ event.stationId || '未標記平板' }}</span>
              <span>{{ event.actor || 'pos-api' }}</span>
            </div>
          </article>
          <div v-if="permissionAuditEvents.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>尚無權限驗證紀錄</span>
          </div>
        </div>

        <div class="panel-heading admin-subheading">
          <div>
            <p class="eyebrow">Time Clock</p>
            <h3>打卡紀錄</h3>
            <span class="panel-note">{{ timeClockReportSummary }} · 建議查詢區間不超過 93 天</span>
          </div>
          <div class="admin-action-row admin-audit-actions">
            <label class="admin-inline-field">
              起日
              <input v-model="timeClockStartDate" type="date" :max="timeClockEndDate" />
            </label>
            <label class="admin-inline-field">
              迄日
              <input v-model="timeClockEndDate" type="date" :min="timeClockStartDate" />
            </label>
            <label class="admin-inline-field">
              員工
              <select v-model="timeClockStaffFilter">
                <option value="all">全體員工</option>
                <option v-for="staff in accessControl.staffAccounts" :key="staff.id" :value="staff.id">
                  {{ staff.name }} · {{ staff.staffCode }}
                </option>
              </select>
            </label>
            <label class="admin-inline-field">
              筆數
              <input v-model.number="timeClockLimit" type="number" min="1" max="2000" step="1" />
            </label>
            <button class="primary-button" type="button" :disabled="isTimeClockLoading || !timeClockDateRangeValid" @click="loadTimeClockEntries">
              <RefreshCw :size="16" aria-hidden="true" />
              {{ isTimeClockLoading ? '讀取中' : '刷新打卡' }}
            </button>
            <button class="secondary-button" type="button" :disabled="timeClockEntries.length === 0" @click="exportTimeClockCsv">
              <Download :size="16" aria-hidden="true" />
              下載打卡紀錄
            </button>
          </div>
        </div>
        <p v-if="!timeClockDateRangeValid" class="admin-inline-warning">請選擇有效日期區間，且最多 93 天。</p>

        <div class="admin-audit-list">
          <article v-for="entry in timeClockEntries" :key="entry.id" class="admin-audit-row">
            <div class="admin-row-header">
              <div class="admin-audit-primary">
                <strong>{{ entry.staffName }}</strong>
                <span>{{ entry.roleName || entry.roleId || '未指定角色' }}</span>
              </div>
              <time :datetime="entry.createdAt">{{ formatAuditTime(entry.createdAt) }}</time>
            </div>
            <div class="admin-audit-meta">
              <span class="status-pill" :class="timeClockEventClass(entry)">{{ timeClockEventLabel(entry) }}</span>
              <span>{{ entry.stationId || '未標記平板' }}</span>
              <span v-if="entry.note">{{ entry.note }}</span>
            </div>
          </article>
          <div v-if="timeClockEntries.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>尚無員工打卡紀錄</span>
          </div>
        </div>
      </section>
    </section>
  </section>
</template>
