<script setup lang="ts">
import {
  BarChart3,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Printer,
  RefreshCw,
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
import { formatCurrency } from '../lib/formatters'
import {
  adjustMemberWallet,
  createAdminMember,
  fetchAdminAuditEvents,
  fetchAdminDailyReport,
  fetchAdminMembers,
  fetchAdminPaymentEvents,
  fetchAdminProducts,
  fetchAdminSettings,
  fetchAdminStations,
  type ProductUpdateInput,
  updateAdminSetting,
  updateProduct,
} from '../lib/posApi'
import type {
  AccessControlSettings,
  AdminPermission,
  DailySalesReport,
  MenuCategory,
  MenuItem,
  PrinterSettings,
  PosAuditEvent,
  PosMember,
  PosPaymentEvent,
  PosStationHeartbeat,
  PrintLabelMode,
  PrintRuleSetting,
  RoleSetting,
  ServiceMode,
} from '../types/pos'

interface ProductDraft extends MenuItem {
  tagsText: string
  soldOutUntilInput: string
}

interface MemberDraft {
  lineUserId: string
  displayName: string
  openingBalance: number
  note: string
}

interface WalletAdjustmentDraft {
  amount: number
  note: string
}

type AdminTab = 'products' | 'members' | 'reports' | 'payments' | 'printing' | 'access' | 'audit' | 'stations'
type PaymentEventStatusFilter = 'all' | 'applied' | 'duplicate' | 'unapplied'

const emit = defineEmits<{
  refreshPos: []
}>()

const adminTabs: Array<{ value: AdminTab; label: string }> = [
  { value: 'products', label: '商品菜單' },
  { value: 'members', label: '會員錢包' },
  { value: 'reports', label: '營運報表' },
  { value: 'payments', label: '支付事件' },
  { value: 'printing', label: '出單規則' },
  { value: 'access', label: '權限' },
  { value: 'stations', label: '平板' },
  { value: 'audit', label: '稽核' },
]

const categoryOptions: Array<{ value: 'all' | MenuCategory; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: categoryLabels.coffee },
  { value: 'tea', label: categoryLabels.tea },
  { value: 'food', label: categoryLabels.food },
  { value: 'retail', label: categoryLabels.retail },
]

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

const permissionOptions: Array<{ value: AdminPermission; label: string }> = [
  { value: 'manageProducts', label: '商品' },
  { value: 'managePrinting', label: '出單' },
  { value: 'managePayments', label: '支付' },
  { value: 'manageReports', label: '報表' },
  { value: 'manageCustomers', label: '顧客' },
  { value: 'manageAccess', label: '權限' },
  { value: 'voidOrders', label: '作廢' },
  { value: 'closeRegister', label: '關帳' },
]

const auditActionLabels: Record<string, string> = {
  'register.open': '開班',
  'register.close': '關班',
  'product.update': '商品更新',
  'setting.update': '設定更新',
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

const paymentEventStatusOptions: Array<{ value: PaymentEventStatusFilter; label: string }> = [
  { value: 'all', label: '全部狀態' },
  { value: 'applied', label: '已套用' },
  { value: 'duplicate', label: '重送' },
  { value: 'unapplied', label: '未套用' },
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

const readStoredPin = (): string => {
  try {
    return sessionStorage.getItem('script-coffee-pos-admin-pin') ?? ''
  } catch {
    return ''
  }
}

const writeStoredPin = (pin: string): void => {
  try {
    sessionStorage.setItem('script-coffee-pos-admin-pin', pin)
  } catch {
    return
  }
}

const emptyPrinterSettings = (): PrinterSettings => ({
  stations: [],
  rules: [],
})

const emptyAccessControl = (): AccessControlSettings => ({
  roles: [],
})

const clonePrinterSettings = (settings: PrinterSettings): PrinterSettings => ({
  stations: settings.stations.map((station) => ({ ...station })),
  rules: settings.rules.map((rule) => ({ ...rule, categories: [...rule.categories] })),
})

const cloneAccessControl = (settings: AccessControlSettings): AccessControlSettings => ({
  roles: settings.roles.map((role) => ({ ...role, permissions: [...role.permissions] })),
})

const toDateInput = (date = new Date()): string => {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

const adminPin = ref(readStoredPin())
const activeAdminTab = ref<AdminTab>('products')
const searchTerm = ref('')
const selectedCategory = ref<'all' | MenuCategory>('all')
const productDrafts = ref<ProductDraft[]>([])
const members = ref<PosMember[]>([])
const memberSearchTerm = ref('')
const newMember = ref<MemberDraft>({
  lineUserId: '',
  displayName: '',
  openingBalance: 0,
  note: '',
})
const walletAdjustmentDrafts = ref<Record<string, WalletAdjustmentDraft>>({})
const reportDate = ref(toDateInput())
const dailyReport = ref<DailySalesReport | null>(null)
const printerSettings = ref<PrinterSettings>(emptyPrinterSettings())
const accessControl = ref<AccessControlSettings>(emptyAccessControl())
const auditEvents = ref<PosAuditEvent[]>([])
const paymentEvents = ref<PosPaymentEvent[]>([])
const stationHeartbeats = ref<PosStationHeartbeat[]>([])
const auditLimit = ref(50)
const paymentEventLimit = ref(50)
const paymentProviderFilter = ref('all')
const paymentEventStatusFilter = ref<PaymentEventStatusFilter>('all')
const auditActionFilter = ref('all')
const isLoading = ref(false)
const isAuditLoading = ref(false)
const isPaymentEventLoading = ref(false)
const isMemberLoading = ref(false)
const isReportLoading = ref(false)
const isStationLoading = ref(false)
const savingProductId = ref<string | null>(null)
const savingMemberId = ref<string | null>(null)
const savingSettingKey = ref<string | null>(null)
const adminMessage = ref('尚未載入後台資料')

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
const auditEventCount = computed(() => auditEvents.value.length)
const paymentEventCount = computed(() => paymentEvents.value.length)
const unappliedPaymentEventCount = computed(() => paymentEvents.value.filter((event) => !event.applied).length)
const memberCount = computed(() => members.value.length)
const walletBalanceTotal = computed(() => members.value.reduce((total, member) => total + member.walletBalance, 0))
const reportPeakHour = computed(() => {
  const report = dailyReport.value
  if (!report) {
    return null
  }

  return [...report.hourly].sort((a, b) => b.total - a.total || b.count - a.count)[0] ?? null
})
const onlineStationCount = computed(() =>
  stationHeartbeats.value.filter((station) => isStationOnline(station.lastSeenAt)).length,
)
const auditActionOptions = computed(() =>
  Array.from(new Set(auditEvents.value.map((event) => event.action))).map((action) => ({
    value: action,
    label: auditActionLabel(action),
  })),
)
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

const filteredProducts = computed(() => {
  const keyword = searchTerm.value.trim().toLowerCase()
  return productDrafts.value.filter((product) => {
    const matchesCategory = selectedCategory.value === 'all' || product.category === selectedCategory.value
    const matchesKeyword =
      keyword.length === 0 ||
      product.name.toLowerCase().includes(keyword) ||
      product.sku.toLowerCase().includes(keyword) ||
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
    (member.lineUserId ?? '').toLowerCase().includes(keyword),
  )
})

const toDraft = (product: MenuItem): ProductDraft => ({
  ...product,
  tags: [...product.tags],
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

const stationStatusLabel = (station: PosStationHeartbeat): string =>
  isStationOnline(station.lastSeenAt) ? '在線' : '離線'

const stationStatusClass = (station: PosStationHeartbeat): string =>
  isStationOnline(station.lastSeenAt) ? 'status-pill--success' : 'status-pill--danger'

const reportBreakdownLabel = (key: string): string => {
  const labels: Record<string, string> = {
    cash: '現金',
    card: '刷卡',
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
    auditMoneyLabel(event, 'amount') ? `錢包 ${auditMoneyLabel(event, 'amount')}` : null,
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

const loadAdminData = async (): Promise<void> => {
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  isLoading.value = true
  adminMessage.value = '讀取後台資料中'

  try {
    writeStoredPin(adminPin.value.trim())
    const [products, memberRows, report, settings, events, paymentRows, stations] = await Promise.all([
      fetchAdminProducts(adminPin.value.trim()),
      fetchAdminMembers(adminPin.value.trim(), 50, memberSearchTerm.value),
      fetchAdminDailyReport(adminPin.value.trim(), reportDate.value),
      fetchAdminSettings(adminPin.value.trim()),
      fetchAdminAuditEvents(adminPin.value.trim(), auditLimit.value),
      fetchAdminPaymentEvents(adminPin.value.trim(), paymentEventLimit.value, paymentProviderFilter.value),
      fetchAdminStations(adminPin.value.trim()),
    ])
    productDrafts.value = products.map(toDraft)
    members.value = memberRows
    dailyReport.value = report
    printerSettings.value = clonePrinterSettings(settings.printerSettings)
    accessControl.value = cloneAccessControl(settings.accessControl)
    auditEvents.value = events
    paymentEvents.value = paymentRows
    stationHeartbeats.value = stations
    adminMessage.value = `已載入 ${products.length} 個商品、${memberRows.length} 位會員、${report.totalOrders} 張日報訂單、${settings.printerSettings.rules.length} 條出單規則、${events.length} 筆稽核、${paymentRows.length} 筆支付事件、${stations.length} 台平板`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '讀取後台資料失敗'
  } finally {
    isLoading.value = false
  }
}

const loadPaymentEvents = async (): Promise<void> => {
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  isPaymentEventLoading.value = true
  adminMessage.value = '讀取支付事件中'

  try {
    writeStoredPin(adminPin.value.trim())
    paymentEvents.value = await fetchAdminPaymentEvents(
      adminPin.value.trim(),
      paymentEventLimit.value,
      paymentProviderFilter.value,
    )
    adminMessage.value = `已載入 ${paymentEvents.value.length} 筆支付事件`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '支付事件讀取失敗'
  } finally {
    isPaymentEventLoading.value = false
  }
}

const loadAuditEvents = async (): Promise<void> => {
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  isAuditLoading.value = true
  adminMessage.value = '讀取稽核紀錄中'

  try {
    writeStoredPin(adminPin.value.trim())
    auditEvents.value = await fetchAdminAuditEvents(adminPin.value.trim(), auditLimit.value)
    adminMessage.value = `已載入 ${auditEvents.value.length} 筆稽核紀錄`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '稽核紀錄讀取失敗'
  } finally {
    isAuditLoading.value = false
  }
}

const loadStationHeartbeats = async (): Promise<void> => {
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  isStationLoading.value = true
  adminMessage.value = '讀取平板在線狀態中'

  try {
    writeStoredPin(adminPin.value.trim())
    stationHeartbeats.value = await fetchAdminStations(adminPin.value.trim())
    adminMessage.value = `已載入 ${stationHeartbeats.value.length} 台平板狀態`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '平板在線狀態讀取失敗'
  } finally {
    isStationLoading.value = false
  }
}

const loadMembers = async (): Promise<void> => {
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  isMemberLoading.value = true
  adminMessage.value = '讀取會員錢包中'

  try {
    writeStoredPin(adminPin.value.trim())
    members.value = await fetchAdminMembers(adminPin.value.trim(), 50, memberSearchTerm.value)
    adminMessage.value = `已載入 ${members.value.length} 位會員`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '會員錢包讀取失敗'
  } finally {
    isMemberLoading.value = false
  }
}

const loadDailyReport = async (): Promise<void> => {
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  isReportLoading.value = true
  adminMessage.value = '讀取營運日報中'

  try {
    writeStoredPin(adminPin.value.trim())
    dailyReport.value = await fetchAdminDailyReport(adminPin.value.trim(), reportDate.value)
    adminMessage.value = `已載入 ${dailyReport.value.date} 日報，營收 ${formatCurrency(dailyReport.value.collectedTotal)}`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '營運日報讀取失敗'
  } finally {
    isReportLoading.value = false
  }
}

const addMember = async (): Promise<void> => {
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  savingMemberId.value = 'new'
  adminMessage.value = '建立會員中'

  try {
    const member = await createAdminMember(adminPin.value.trim(), {
      lineUserId: newMember.value.lineUserId.trim(),
      displayName: newMember.value.displayName.trim(),
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
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  const draft = walletAdjustmentDraft(member.id)
  const amount = Math.trunc(Number(draft.amount) || 0)
  if (amount === 0) {
    adminMessage.value = '錢包調整金額不可為 0'
    return
  }

  savingMemberId.value = member.id
  adminMessage.value = `調整 ${member.displayName} 錢包`

  try {
    const savedMember = await adjustMemberWallet(adminPin.value.trim(), member.id, {
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
  }

  try {
    const savedProduct = await updateProduct(adminPin.value.trim(), product.id, payload)
    productDrafts.value = productDrafts.value.map((entry) => (entry.id === product.id ? toDraft(savedProduct) : entry))
    adminMessage.value = `${savedProduct.name} 已更新`
    emit('refreshPos')
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '商品更新失敗'
  } finally {
    savingProductId.value = null
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

const addPrintRule = (): void => {
  printerSettings.value.rules.push({
    id: buildId('rule'),
    name: '新印單規則',
    serviceMode: 'takeout',
    stationId: stationOptions.value[0]?.id ?? 'bar',
    categories: ['coffee', 'tea', 'food'],
    copies: 1,
    labelMode: 'label',
    enabled: true,
  })
}

const removePrintRule = (ruleId: string): void => {
  printerSettings.value.rules = printerSettings.value.rules.filter((rule) => rule.id !== ruleId)
}

const toggleRuleCategory = (rule: PrintRuleSetting, category: MenuCategory): void => {
  if (rule.categories.includes(category)) {
    rule.categories = rule.categories.filter((entry) => entry !== category)
    return
  }

  rule.categories = [...rule.categories, category]
}

const savePrinterSettings = async (): Promise<void> => {
  savingSettingKey.value = 'printer_settings'
  adminMessage.value = '儲存出單機設定'

  try {
    const savedSettings = await updateAdminSetting<PrinterSettings>(
      adminPin.value.trim(),
      'printer_settings',
      printerSettings.value,
    )
    printerSettings.value = clonePrinterSettings(savedSettings)
    adminMessage.value = '出單機設定已更新'
    emit('refreshPos')
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '出單機設定更新失敗'
  } finally {
    savingSettingKey.value = null
  }
}

const addRole = (): void => {
  accessControl.value.roles.push({
    id: buildId('role'),
    name: '新角色',
    pinRequired: true,
    permissions: ['manageProducts'],
  })
}

const removeRole = (roleId: string): void => {
  if (accessControl.value.roles.length <= 1) {
    adminMessage.value = '至少保留一個角色'
    return
  }

  accessControl.value.roles = accessControl.value.roles.filter((role) => role.id !== roleId)
}

const hasPermission = (role: RoleSetting, permission: AdminPermission): boolean => role.permissions.includes(permission)

const togglePermission = (role: RoleSetting, permission: AdminPermission): void => {
  if (hasPermission(role, permission)) {
    role.permissions = role.permissions.filter((entry) => entry !== permission)
    return
  }

  role.permissions = [...role.permissions, permission]
}

const saveAccessControl = async (): Promise<void> => {
  savingSettingKey.value = 'access_control'
  adminMessage.value = '儲存權限設定'

  try {
    const savedAccessControl = await updateAdminSetting<AccessControlSettings>(
      adminPin.value.trim(),
      'access_control',
      accessControl.value,
    )
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
          PIN 保護
        </span>
      </div>

      <div class="admin-access-grid">
        <label>
          管理 PIN
          <input v-model="adminPin" type="password" autocomplete="off" />
        </label>
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
        <span>低庫存</span>
        <strong>{{ lowStockProducts }}</strong>
      </article>
      <article>
        <span>會員</span>
        <strong>{{ memberCount }}</strong>
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
            <span class="panel-note">管理 POS、外帶外送與掃碼點餐的可見性</span>
          </div>
          <label class="search-box">
            <Search :size="18" aria-hidden="true" />
            <input v-model="searchTerm" type="search" placeholder="搜尋商品或 SKU" />
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
                  <span>{{ product.sku }}</span>
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
            </div>

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
                  <span>{{ member.lineUserId || '手動會員' }}</span>
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
            </div>
          </article>

          <div v-if="filteredMembers.length === 0" class="empty-state">
            <Search :size="24" aria-hidden="true" />
            <span>尚無符合條件的會員</span>
          </div>
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

            <article v-for="station in printerSettings.stations" :key="station.id" class="admin-station-row">
              <div class="admin-station-title">
                <Printer :size="20" aria-hidden="true" />
                <strong>{{ station.name }}</strong>
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

            <article v-for="rule in printerSettings.rules" :key="rule.id" class="admin-rule-row">
              <div class="admin-row-header">
                <label>
                  規則名稱
                  <input v-model="rule.name" type="text" />
                </label>
                <button class="icon-button" type="button" title="刪除印單規則" @click="removePrintRule(rule.id)">
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
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
                  v-for="category in menuCategoryOptions"
                  :key="category.value"
                  class="toggle-row"
                >
                  <input
                    type="checkbox"
                    :checked="rule.categories.includes(category.value)"
                    @change="toggleRuleCategory(rule, category.value)"
                  />
                  {{ category.label }}
                </label>
              </div>
            </article>
          </section>
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
            <h2>角色權限</h2>
            <span class="panel-note">先建立操作權限模型，之後接員工帳號與操作記錄</span>
          </div>
          <div class="admin-action-row">
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
      </section>
    </section>
  </section>
</template>
