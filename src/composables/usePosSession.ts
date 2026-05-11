import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { menuItems } from '../data/menu'
import { initialOrders } from '../data/orders'
import { formatDateKey } from '../lib/formatters'
import {
  calculateServiceChargeAmount,
  serviceChargeLabel,
  serviceChargeRateForMode,
} from '../lib/serviceCharge'
import {
  calculateDiscountApplications,
  defaultDiscountSettings,
  normalizeDiscountSettings,
} from '../lib/discounts'
import { isNativeLanPrinterAvailable, lanPrinterModeLabel, sendLanPrintPayload } from '../lib/lanPrinter'
import {
  clearOnlineOrderNotifier,
  markOnlineOrderNotifierSeen,
  notifyBackgroundOnlineOrders,
  setOnlineOrderNotifierAppActive,
  snoozeOnlineOrderNotifier,
  syncOnlineOrderNotifier,
} from '../lib/onlineOrderNotifier'
import {
  createCounterDraftOrder,
  createOrder,
  createPrintJob,
  closeRegisterSession,
  createProduct,
  createRegisterCashAdjustment,
  defaultEngagementSettings,
  defaultPosAppearanceSettings,
  defaultOnlineOrderingSettings,
  deleteProduct,
  deletePrintJob,
  fetchAdminProducts,
  fetchCurrentRegisterSession,
  fetchOnlineOrderReminderStates,
  fetchOrders,
  fetchProducts,
  fetchRuntimeSettings,
  openRegisterSession,
  claimOrder,
  currentStationId,
  currentStationLabel,
  createCashDrawerOpenEvent,
  finalizeCounterDraftOrder,
  fetchCashDrawerEvents,
  isPosApiConfigured,
  mergeOrderIntoOrder,
  normalizeEngagementSettings,
  normalizePaymentBreakdown,
  normalizePaymentSplits,
  releaseOrderClaim,
  refundOrder,
  sendStationHeartbeat,
  defaultFloorPlanSettings,
  updateAdminSetting,
  updateCounterDraftOrder,
  updateOrderFloorAssignment as persistOrderFloorAssignment,
  updateProduct,
  updatePrintJobStatus,
  updateOrderPaymentStatus as persistOrderPaymentStatus,
  updateOrderStatus as persistOrderStatus,
  updateOnlineOrderReminderStates,
  voidOrder,
} from '../lib/posApi'
import type { ProductUpdateInput } from '../lib/posApi'
import {
  isPosRealtimeConfigured,
  subscribeToPosRealtimeEvents,
  type PosRealtimeEvent,
  type PosRealtimeStatus,
} from '../lib/posRealtime'
import {
  buildCustomerReceiptPayload,
  buildCashDrawerPulsePayload,
  buildOrderQrCodePayload,
  buildOrderPrintPlan,
  buildPrinterHealthcheckPayload,
  buildPrinterHealthcheckPreview,
  buildTransactionDetailPayload,
} from '../lib/printing'
import type {
  CartLine,
  AccessControlPolicy,
  CashDrawerDeliveryStatus,
  CashDrawerEvent,
  ComboLineItem,
  CustomerDraft,
  MenuCategory,
  MenuItem,
  OrderSource,
  OrderStatus,
  OnlineOrderReminderAction,
  OnlineOrderReminderState,
  OnlineNotificationStationSettings,
  OnlineOrderingSettings,
  PaymentAllocation,
  PaymentMethod,
  PaymentSplit,
  PaymentStatus,
  FloorPlanSettings,
  PosAppearanceSettings,
  PosOrder,
  ProductSupplyStatus,
  PrintJob,
  PrintRuleTiming,
  PrinterSettings,
  PrintStation,
  PrintStationSetting,
  PrintStatus,
  RegisterCashAdjustmentKind,
  RegisterSession,
  ServiceMode,
  CustomerEngagementSettings,
  DiscountApplication,
  DiscountCampaign,
  DiscountSettings,
} from '../types/pos'

type CategoryFilter = 'all' | MenuCategory
type BackendMode = 'syncing' | 'connected' | 'fallback'
type RuntimeSettings = Awaited<ReturnType<typeof fetchRuntimeSettings>>
type WebAudioGlobal = typeof globalThis & { webkitAudioContext?: typeof AudioContext }

const envIntervalMs = (name: string, fallback: number, min: number, max: number): number => {
  const rawValue = import.meta.env[name] as string | undefined
  const value = Number(rawValue)
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(value)))
}

const queueSyncIntervalMs = envIntervalMs('VITE_POS_QUEUE_SYNC_INTERVAL_MS', 20_000, 500, 60_000)
const stationHeartbeatIntervalMs = 30_000
const onlineReminderClockIntervalMs = 30_000
const onlineReminderShortSnoozeMs = 60_000
const onlineReminderLongSnoozeMs = 24 * 60 * 60_000
const realtimeRefreshDebounceMs = 350
const realtimeBusyRetryMs = 1_200
const realtimeReconnectBaseDelayMs = 2_000
const realtimeReconnectMaxDelayMs = 30_000
const maxCartLineQuantity = 999
const counterDraftStorageKey = 'script-coffee-pos-counter-draft'
const recentItemsStorageKey = 'script-coffee-pos-recent-items'
const pendingLocalOrdersStorageKey = 'script-coffee-pos-pending-orders'
const localCounterOrdersStorageKey = 'script-coffee-pos-local-counter-orders'
const localProductsStorageKey = 'script-coffee-pos-local-products'
const acceptedOnlineOrderIdsStorageKey = 'script-coffee-pos-accepted-online-orders'
const dismissedQueueOrderKeysStorageKey = 'script-coffee-pos-dismissed-queue-orders'
const appliedSettingsProfileStoragePrefix = 'script-coffee-pos-applied-settings-profile'

interface UsePosSessionOptions {
  autoLoad?: boolean
}

interface BackendStatus {
  mode: BackendMode
  label: string
  detail: string
}

type SettingsProfileStatus = 'loading' | 'current' | 'pending' | 'local'
type StationOperationMode = 'host' | 'child'

interface StoredSettingsProfile {
  fingerprint: string
  appliedAt: string
  runtimeSettings: RuntimeSettings
}

interface CounterDraftState {
  cartLines: CartLine[]
  customer: CustomerDraft
  draftOrderId: string | null
  draftStartedAt: string | null
  paymentMethod: PaymentMethod
  serviceMode: ServiceMode
  orderLabels: string[]
  serviceFeeRate: number
  extraFeeAmount: number
  discountAmount: number
  selectedDiscountCampaignIds: string[]
  disabledAutomaticDiscountCampaignIds: string[]
  pointsRedeemed: number
  couponCode: string
  paymentSplits: PaymentSplit[]
  paymentBreakdown: PaymentAllocation[]
  transactionReceiptCount: number
}

const serviceModes: ServiceMode[] = ['dine-in', 'takeout', 'delivery']
const paymentMethods: PaymentMethod[] = ['cash', 'card', 'line-pay', 'jkopay', 'transfer']
const orderSources: OrderSource[] = ['counter', 'qr', 'online']
const orderStatuses: OrderStatus[] = ['new', 'preparing', 'ready', 'served', 'failed', 'voided']
const paymentStatuses: PaymentStatus[] = ['pending', 'authorized', 'paid', 'expired', 'failed', 'refunded']
const printStatuses: PrintStatus[] = ['queued', 'printed', 'skipped', 'failed']
const electronicInvoiceStatuses: PosOrder['electronicInvoiceStatus'][] = ['not_requested', 'queued', 'issued', 'voided', 'refunded', 'failed']
const electronicInvoicePrintModes: PosOrder['electronicInvoicePrintMode'][] = ['paper', 'carrier', 'donation', 'none']

const defaultCustomerDraft = (): CustomerDraft => ({
  memberId: null,
  name: '現場客',
  phone: '',
  customerType: '一般顧客',
  pointsBalance: 0,
  availableCoupons: [],
  deliveryAddress: '',
  requestedFulfillmentAt: '',
  taxId: '',
  invoiceCarrierBarcode: '',
  invoiceDonationCode: '',
  electronicInvoiceRequested: false,
  electronicInvoicePrintMode: 'none',
  note: '',
})

const isServiceMode = (value: unknown): value is ServiceMode =>
  typeof value === 'string' && serviceModes.includes(value as ServiceMode)

const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  typeof value === 'string' && paymentMethods.includes(value as PaymentMethod)

const sanitizeDraftOrderId = (value: unknown): string | null =>
  typeof value === 'string' && /^POS-\d{8}-\d{3}$/.test(value) ? value : null

const sanitizeDraftStartedAt = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? value : null
}

const isMenuCategory = (value: unknown): value is MenuCategory =>
  typeof value === 'string' && value.trim().length > 0

const isOrderSource = (value: unknown): value is OrderSource =>
  typeof value === 'string' && orderSources.includes(value as OrderSource)

const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === 'string' && orderStatuses.includes(value as OrderStatus)

const isPaymentStatus = (value: unknown): value is PaymentStatus =>
  typeof value === 'string' && paymentStatuses.includes(value as PaymentStatus)

const isPrintStatus = (value: unknown): value is PrintStatus =>
  typeof value === 'string' && printStatuses.includes(value as PrintStatus)

const isElectronicInvoiceStatus = (value: unknown): value is PosOrder['electronicInvoiceStatus'] =>
  typeof value === 'string' && electronicInvoiceStatuses.includes(value as PosOrder['electronicInvoiceStatus'])

const isElectronicInvoicePrintMode = (value: unknown): value is PosOrder['electronicInvoicePrintMode'] =>
  typeof value === 'string' && electronicInvoicePrintModes.includes(value as PosOrder['electronicInvoicePrintMode'])

const normalizeTaxId = (value: string): string => value.replace(/\s/g, '').trim()
const normalizeInvoiceCarrierBarcode = (value: string): string => value.replace(/\s/g, '').trim().toUpperCase()
const normalizeInvoiceDonationCode = (value: string): string => value.replace(/\s/g, '').trim()
const invoiceFieldError = (taxId: string, carrierBarcode: string, donationCode: string): string | null => {
  const normalizedTaxId = normalizeTaxId(taxId)
  const normalizedCarrierBarcode = normalizeInvoiceCarrierBarcode(carrierBarcode)
  const normalizedDonationCode = normalizeInvoiceDonationCode(donationCode)
  if (normalizedTaxId && !/^[0-9]{8}$/.test(normalizedTaxId)) {
    return '統一編號需為 8 碼數字'
  }

  if (normalizedCarrierBarcode.length > 32) {
    return '載具條碼最多 32 字元'
  }

  if (normalizedDonationCode && !/^[0-9]{3,7}$/.test(normalizedDonationCode)) {
    return '捐贈碼需為 3 至 7 碼數字'
  }

  if (normalizedCarrierBarcode && normalizedDonationCode) {
    return '載具條碼與捐贈碼只能擇一'
  }

  return null
}

const sanitizeCounterDraftLine = (line: unknown): CartLine | null => {
  if (!line || typeof line !== 'object') {
    return null
  }

  const entry = line as Partial<CartLine>
  if (
    typeof entry.itemId !== 'string' ||
    typeof entry.productSku !== 'string' ||
    typeof entry.name !== 'string' ||
    typeof entry.unitPrice !== 'number' ||
    typeof entry.quantity !== 'number'
  ) {
    return null
  }

  const nextLine: CartLine = {
    itemId: entry.itemId,
    productSku: entry.productSku,
    name: entry.name,
    unitPrice: Math.max(0, Math.trunc(entry.unitPrice)),
    quantity: Math.max(1, Math.trunc(entry.quantity)),
    options: Array.isArray(entry.options)
      ? entry.options.filter((option): option is string => typeof option === 'string')
      : [],
  }

  const comboItems = Array.isArray(entry.comboItems)
    ? entry.comboItems.flatMap((item): ComboLineItem[] => {
      if (!item || typeof item !== 'object') {
        return []
      }

      const source = item as Partial<ComboLineItem>
      if (
        typeof source.groupId !== 'string' ||
        typeof source.groupLabel !== 'string' ||
        typeof source.productId !== 'string' ||
        typeof source.productSku !== 'string' ||
        typeof source.name !== 'string'
      ) {
        return []
      }

      return [{
        groupId: source.groupId,
        groupLabel: source.groupLabel,
        productId: source.productId,
        productSku: source.productSku,
        name: source.name,
        quantity: Math.max(1, Math.trunc(Number(source.quantity) || 1)),
        priceDelta: Math.trunc(Number(source.priceDelta) || 0),
        options: Array.isArray(source.options)
          ? source.options.filter((option): option is string => typeof option === 'string')
          : [],
      }]
    }).slice(0, 80)
    : []

  if (comboItems.length > 0) {
    nextLine.comboItems = comboItems
  }

  if (typeof entry.productId === 'string') {
    nextLine.productId = entry.productId
  }

  if (isMenuCategory(entry.category)) {
    nextLine.category = entry.category
  }

  if (typeof entry.prepStation === 'string') {
    nextLine.prepStation = entry.prepStation
  }

  if (typeof entry.printLabel === 'boolean') {
    nextLine.printLabel = entry.printLabel
  }

  if (typeof entry.printPaused === 'boolean') {
    nextLine.printPaused = entry.printPaused
  }

  return nextLine
}

const sanitizeCustomerDraft = (value: unknown): CustomerDraft => {
  const fallback = defaultCustomerDraft()
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const draft = value as Partial<CustomerDraft>
  return {
    memberId: typeof draft.memberId === 'string' ? draft.memberId : null,
    name: typeof draft.name === 'string' && draft.name.trim() ? draft.name : fallback.name,
    phone: typeof draft.phone === 'string' ? draft.phone : fallback.phone,
    customerType: typeof draft.customerType === 'string' && draft.customerType.trim()
      ? draft.customerType
      : fallback.customerType,
    pointsBalance: Number.isFinite(draft.pointsBalance)
      ? Math.max(0, Math.trunc(Number(draft.pointsBalance)))
      : fallback.pointsBalance,
    availableCoupons: Array.isArray(draft.availableCoupons) ? draft.availableCoupons : [],
    deliveryAddress: typeof draft.deliveryAddress === 'string' ? draft.deliveryAddress : fallback.deliveryAddress,
    requestedFulfillmentAt: typeof draft.requestedFulfillmentAt === 'string'
      ? draft.requestedFulfillmentAt
      : fallback.requestedFulfillmentAt,
    taxId: typeof draft.taxId === 'string' ? draft.taxId : fallback.taxId,
    invoiceCarrierBarcode: typeof draft.invoiceCarrierBarcode === 'string'
      ? draft.invoiceCarrierBarcode
      : fallback.invoiceCarrierBarcode,
    invoiceDonationCode: typeof draft.invoiceDonationCode === 'string'
      ? draft.invoiceDonationCode
      : fallback.invoiceDonationCode,
    electronicInvoiceRequested: typeof draft.electronicInvoiceRequested === 'boolean'
      ? draft.electronicInvoiceRequested
      : fallback.electronicInvoiceRequested,
    electronicInvoicePrintMode: isElectronicInvoicePrintMode(draft.electronicInvoicePrintMode)
      ? draft.electronicInvoicePrintMode
      : fallback.electronicInvoicePrintMode,
    note: typeof draft.note === 'string' ? draft.note : fallback.note,
  }
}

const readCounterDraft = (): CounterDraftState | null => {
  try {
    const rawDraft = globalThis.localStorage?.getItem(counterDraftStorageKey)
    if (!rawDraft) {
      return null
    }

    const parsed = JSON.parse(rawDraft) as Partial<CounterDraftState>
    return {
      cartLines: Array.isArray(parsed.cartLines)
        ? parsed.cartLines.map(sanitizeCounterDraftLine).filter((line): line is CartLine => Boolean(line))
        : [],
      customer: sanitizeCustomerDraft(parsed.customer),
      draftOrderId: sanitizeDraftOrderId(parsed.draftOrderId),
      draftStartedAt: sanitizeDraftStartedAt(parsed.draftStartedAt),
      paymentMethod: isPaymentMethod(parsed.paymentMethod) ? parsed.paymentMethod : 'cash',
      serviceMode: isServiceMode(parsed.serviceMode) ? parsed.serviceMode : 'takeout',
      orderLabels: Array.isArray(parsed.orderLabels)
        ? parsed.orderLabels.filter((label): label is string => typeof label === 'string').slice(0, 12)
        : [],
      serviceFeeRate: Number.isFinite(parsed.serviceFeeRate)
        ? Math.min(Math.max(Math.trunc(Number(parsed.serviceFeeRate)), 0), 30)
        : 0,
      extraFeeAmount: Number.isFinite(parsed.extraFeeAmount)
        ? Math.max(0, Math.trunc(Number(parsed.extraFeeAmount)))
        : 0,
      discountAmount: Number.isFinite(parsed.discountAmount)
        ? Math.max(0, Math.trunc(Number(parsed.discountAmount)))
        : 0,
      selectedDiscountCampaignIds: Array.isArray(parsed.selectedDiscountCampaignIds)
        ? parsed.selectedDiscountCampaignIds.filter((campaignId): campaignId is string => typeof campaignId === 'string').slice(0, 20)
        : [],
      disabledAutomaticDiscountCampaignIds: Array.isArray(parsed.disabledAutomaticDiscountCampaignIds)
        ? parsed.disabledAutomaticDiscountCampaignIds.filter((campaignId): campaignId is string => typeof campaignId === 'string').slice(0, 20)
        : [],
      pointsRedeemed: Number.isFinite(parsed.pointsRedeemed)
        ? Math.max(0, Math.trunc(Number(parsed.pointsRedeemed)))
        : 0,
      couponCode: typeof parsed.couponCode === 'string' ? parsed.couponCode : '',
      paymentSplits: normalizePaymentSplits(parsed.paymentSplits),
      paymentBreakdown: normalizePaymentBreakdown(parsed.paymentBreakdown),
      transactionReceiptCount: Math.min(10, Math.max(0, Math.trunc(Number(parsed.transactionReceiptCount) || 0))),
    }
  } catch {
    return null
  }
}

const writeCounterDraft = (draft: CounterDraftState): void => {
  try {
    const hasDraft =
      draft.cartLines.length > 0 ||
      draft.customer.phone.trim().length > 0 ||
      draft.customer.deliveryAddress.trim().length > 0 ||
      draft.customer.requestedFulfillmentAt.trim().length > 0 ||
      draft.customer.taxId.trim().length > 0 ||
      draft.customer.invoiceCarrierBarcode.trim().length > 0 ||
      draft.customer.invoiceDonationCode.trim().length > 0 ||
      draft.customer.electronicInvoiceRequested ||
      draft.customer.electronicInvoicePrintMode !== 'none' ||
      draft.customer.note.trim().length > 0 ||
      draft.customer.name.trim() !== '現場客' ||
      Boolean(draft.customer.memberId) ||
      Boolean(draft.draftOrderId) ||
      draft.paymentMethod !== 'cash' ||
      draft.serviceMode !== 'takeout' ||
      draft.orderLabels.length > 0 ||
      draft.serviceFeeRate > 0 ||
      draft.extraFeeAmount > 0 ||
      draft.discountAmount > 0 ||
      draft.selectedDiscountCampaignIds.length > 0 ||
      draft.disabledAutomaticDiscountCampaignIds.length > 0 ||
      draft.pointsRedeemed > 0 ||
      draft.couponCode.trim().length > 0 ||
      draft.paymentSplits.length > 0 ||
      draft.paymentBreakdown.length > 0 ||
      draft.transactionReceiptCount > 0

    if (!hasDraft) {
      globalThis.localStorage?.removeItem(counterDraftStorageKey)
      return
    }

    globalThis.localStorage?.setItem(counterDraftStorageKey, JSON.stringify(draft))
  } catch {
    return
  }
}

const readRecentItemIds = (): string[] => {
  try {
    const rawItems = globalThis.localStorage?.getItem(recentItemsStorageKey)
    if (!rawItems) {
      return []
    }

    const parsed = JSON.parse(rawItems)
    return Array.isArray(parsed)
      ? parsed.filter((itemId): itemId is string => typeof itemId === 'string' && itemId.trim().length > 0).slice(0, 6)
      : []
  } catch {
    return []
  }
}

const writeRecentItemIds = (itemIds: string[]): void => {
  try {
    if (itemIds.length === 0) {
      globalThis.localStorage?.removeItem(recentItemsStorageKey)
      return
    }

    globalThis.localStorage?.setItem(recentItemsStorageKey, JSON.stringify(itemIds.slice(0, 6)))
  } catch {
    return
  }
}

const nullableString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const sanitizeStoredOrder = (value: unknown, requireLines: boolean): PosOrder | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const order = value as Partial<PosOrder>
  const lines = Array.isArray(order.lines)
    ? order.lines.map(sanitizeCounterDraftLine).filter((line): line is CartLine => Boolean(line))
    : []

  if (
    typeof order.id !== 'string' ||
    order.id.trim().length === 0 ||
    (requireLines && lines.length === 0) ||
    typeof order.subtotal !== 'number' ||
    typeof order.customerName !== 'string' ||
    typeof order.customerPhone !== 'string' ||
    typeof order.deliveryAddress !== 'string' ||
    typeof order.note !== 'string' ||
    typeof order.createdAt !== 'string'
  ) {
    return null
  }

  return {
    id: order.id,
    source: isOrderSource(order.source) ? order.source : 'counter',
    mode: isServiceMode(order.mode) ? order.mode : 'takeout',
    customerName: order.customerName.trim() || '現場客',
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    requestedFulfillmentAt: nullableString(order.requestedFulfillmentAt),
    taxId: typeof order.taxId === 'string' ? order.taxId : '',
    invoiceCarrierBarcode: typeof order.invoiceCarrierBarcode === 'string' ? order.invoiceCarrierBarcode : '',
    invoiceDonationCode: typeof order.invoiceDonationCode === 'string' ? order.invoiceDonationCode : '',
    electronicInvoiceRequested: order.electronicInvoiceRequested === true,
    electronicInvoiceStatus: isElectronicInvoiceStatus(order.electronicInvoiceStatus) ? order.electronicInvoiceStatus : 'not_requested',
    electronicInvoicePrintMode: isElectronicInvoicePrintMode(order.electronicInvoicePrintMode) ? order.electronicInvoicePrintMode : 'none',
    electronicInvoiceNumber: typeof order.electronicInvoiceNumber === 'string' ? order.electronicInvoiceNumber : '',
    electronicInvoiceRandomCode: typeof order.electronicInvoiceRandomCode === 'string' ? order.electronicInvoiceRandomCode : '',
    electronicInvoiceIssuedAt: nullableString(order.electronicInvoiceIssuedAt),
    electronicInvoiceVoidedAt: nullableString(order.electronicInvoiceVoidedAt),
    electronicInvoiceUploadDueAt: nullableString(order.electronicInvoiceUploadDueAt),
    memberId: nullableString(order.memberId),
    note: order.note,
    lines,
    subtotal: Math.max(0, Math.trunc(order.subtotal)),
    orderLabels: Array.isArray(order.orderLabels)
      ? order.orderLabels.filter((label): label is string => typeof label === 'string').slice(0, 12)
      : [],
    serviceFeeRate: Math.min(Math.max(Math.trunc(Number(order.serviceFeeRate) || 0), 0), 30),
    serviceFeeAmount: Math.max(0, Math.trunc(Number(order.serviceFeeAmount) || 0)),
    extraFeeAmount: Math.max(0, Math.trunc(Number(order.extraFeeAmount) || 0)),
    discountAmount: Math.max(0, Math.trunc(Number(order.discountAmount) || 0)),
    pointsRedeemed: Math.max(0, Math.trunc(Number(order.pointsRedeemed) || 0)),
    couponCode: typeof order.couponCode === 'string' ? order.couponCode : '',
    paymentSplits: normalizePaymentSplits(order.paymentSplits),
    paymentBreakdown: normalizePaymentBreakdown(order.paymentBreakdown),
    transactionReceiptCount: Math.min(10, Math.max(0, Math.trunc(Number(order.transactionReceiptCount) || 0))),
    memberPointsEarned: Math.max(0, Math.trunc(Number(order.memberPointsEarned) || 0)),
    paymentMethod: isPaymentMethod(order.paymentMethod) ? order.paymentMethod : 'cash',
    paymentStatus: isPaymentStatus(order.paymentStatus) ? order.paymentStatus : 'pending',
    status: isOrderStatus(order.status) ? order.status : 'new',
    createdAt: order.createdAt,
    claimedBy: nullableString(order.claimedBy),
    claimedAt: nullableString(order.claimedAt),
    claimExpiresAt: nullableString(order.claimExpiresAt),
    printStatus: isPrintStatus(order.printStatus) ? order.printStatus : 'skipped',
    printJobs: [],
  }
}

const sanitizePendingLocalOrder = (value: unknown): PosOrder | null => sanitizeStoredOrder(value, true)

const sanitizeLocalCounterOrder = (value: unknown): PosOrder | null => sanitizeStoredOrder(value, false)

const readPendingLocalOrders = (): PosOrder[] => {
  try {
    const rawOrders = globalThis.localStorage?.getItem(pendingLocalOrdersStorageKey)
    if (!rawOrders) {
      return []
    }

    const parsed = JSON.parse(rawOrders)
    return Array.isArray(parsed)
      ? parsed.map(sanitizePendingLocalOrder).filter((order): order is PosOrder => Boolean(order)).slice(0, 50)
      : []
  } catch {
    return []
  }
}

const readLocalCounterOrders = (): PosOrder[] => {
  try {
    const rawOrders = globalThis.localStorage?.getItem(localCounterOrdersStorageKey)
    if (!rawOrders) {
      return []
    }

    const parsed = JSON.parse(rawOrders)
    return Array.isArray(parsed)
      ? parsed.map(sanitizeLocalCounterOrder).filter((order): order is PosOrder => Boolean(order)).slice(0, 50)
      : []
  } catch {
    return []
  }
}

const writePendingLocalOrders = (orders: PosOrder[]): void => {
  try {
    if (orders.length === 0) {
      globalThis.localStorage?.removeItem(pendingLocalOrdersStorageKey)
      return
    }

    globalThis.localStorage?.setItem(pendingLocalOrdersStorageKey, JSON.stringify(orders.slice(0, 50)))
  } catch {
    return
  }
}

const writeLocalCounterOrders = (orders: PosOrder[]): void => {
  try {
    const visibleOrders = orders.filter((order) => !['served', 'voided', 'failed'].includes(order.status)).slice(0, 50)
    if (visibleOrders.length === 0) {
      globalThis.localStorage?.removeItem(localCounterOrdersStorageKey)
      return
    }

    globalThis.localStorage?.setItem(localCounterOrdersStorageKey, JSON.stringify(visibleOrders))
  } catch {
    return
  }
}

const readAcceptedOnlineOrderIds = (): string[] => {
  try {
    const rawIds = globalThis.localStorage?.getItem(acceptedOnlineOrderIdsStorageKey)
    if (!rawIds) {
      return []
    }

    const parsed = JSON.parse(rawIds)
    return Array.isArray(parsed)
      ? parsed.filter((orderId): orderId is string => typeof orderId === 'string').slice(0, 100)
      : []
  } catch {
    return []
  }
}

const writeAcceptedOnlineOrderIds = (orderIds: string[]): void => {
  try {
    globalThis.localStorage?.setItem(
      acceptedOnlineOrderIdsStorageKey,
      JSON.stringify([...new Set(orderIds)].slice(-100)),
    )
  } catch {
    return
  }
}

const queueDismissalKeyFor = (order: PosOrder): string =>
  `${order.remoteId ?? order.id}|${order.createdAt}`

const readDismissedQueueOrderKeys = (): string[] => {
  try {
    const rawKeys = globalThis.localStorage?.getItem(dismissedQueueOrderKeysStorageKey)
    if (!rawKeys) {
      return []
    }

    const parsed = JSON.parse(rawKeys)
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string').slice(-200)
      : []
  } catch {
    return []
  }
}

const writeDismissedQueueOrderKeys = (keys: string[]): void => {
  try {
    const nextKeys = [...new Set(keys)].slice(-200)
    if (nextKeys.length === 0) {
      globalThis.localStorage?.removeItem(dismissedQueueOrderKeysStorageKey)
      return
    }

    globalThis.localStorage?.setItem(dismissedQueueOrderKeysStorageKey, JSON.stringify(nextKeys))
  } catch {
    return
  }
}

const settingsProfileStorageKey = (stationId: string): string =>
  `${appliedSettingsProfileStoragePrefix}:${stationId || 'default'}`

const stableSettingsProfileStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSettingsProfileStringify).join(',')}]`
  }

  const source = value as Record<string, unknown>
  return `{${Object.keys(source).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSettingsProfileStringify(source[key])}`,
  ).join(',')}}`
}

const settingsProfileFingerprint = (runtimeSettings: RuntimeSettings): string => {
  const source = stableSettingsProfileStringify(runtimeSettings)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const isStoredRuntimeSettings = (value: unknown): value is RuntimeSettings => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const settings = value as Partial<RuntimeSettings>
  return Boolean(
    settings.onlineOrdering &&
    settings.discountSettings &&
    settings.printerSettings &&
    settings.posAppearance &&
    settings.floorPlan &&
    settings.engagementSettings &&
    settings.accessPolicy,
  )
}

const readStoredSettingsProfile = (stationId: string): StoredSettingsProfile | null => {
  try {
    const rawProfile = globalThis.localStorage?.getItem(settingsProfileStorageKey(stationId))
    if (!rawProfile) {
      return null
    }

    const parsed = JSON.parse(rawProfile) as Partial<StoredSettingsProfile>
    if (
      typeof parsed.fingerprint !== 'string' ||
      typeof parsed.appliedAt !== 'string' ||
      !isStoredRuntimeSettings(parsed.runtimeSettings)
    ) {
      return null
    }

    return {
      fingerprint: parsed.fingerprint,
      appliedAt: parsed.appliedAt,
      runtimeSettings: parsed.runtimeSettings,
    }
  } catch {
    return null
  }
}

const writeStoredSettingsProfile = (
  stationId: string,
  runtimeSettings: RuntimeSettings,
  fingerprint: string,
  appliedAt = new Date().toISOString(),
): string => {
  try {
    globalThis.localStorage?.setItem(settingsProfileStorageKey(stationId), JSON.stringify({
      fingerprint,
      appliedAt,
      runtimeSettings,
    }))
  } catch {
    return appliedAt
  }

  return appliedAt
}

const mergeLocalPendingOrders = (pendingOrders: PosOrder[], baseOrders: PosOrder[]): PosOrder[] => {
  const baseIds = new Set(baseOrders.map((order) => order.id))
  return [...pendingOrders.filter((order) => !baseIds.has(order.id)), ...baseOrders]
}

const mergeLocalCounterOrders = (localOrders: PosOrder[], baseOrders: PosOrder[]): PosOrder[] => {
  const localIds = new Set(localOrders.map((order) => order.id))
  return [...localOrders, ...baseOrders.filter((order) => !localIds.has(order.id))]
}

const paymentStatusFor = (method: PaymentMethod): PosOrder['paymentStatus'] => {
  if (method === 'cash' || method === 'transfer') {
    return 'pending'
  }
  return 'authorized'
}

const invoicePrintModeFromDraft = (draft: CustomerDraft): PosOrder['electronicInvoicePrintMode'] => {
  if (!draft.electronicInvoiceRequested) {
    return 'none'
  }

  if (normalizeInvoiceDonationCode(draft.invoiceDonationCode)) {
    return 'donation'
  }

  if (normalizeInvoiceCarrierBarcode(draft.invoiceCarrierBarcode)) {
    return 'carrier'
  }

  return draft.electronicInvoicePrintMode === 'paper' ? 'paper' : 'none'
}

const invoiceRequestedFromDraft = (draft: CustomerDraft): boolean =>
  draft.electronicInvoiceRequested ||
  Boolean(normalizeTaxId(draft.taxId) || normalizeInvoiceCarrierBarcode(draft.invoiceCarrierBarcode) || normalizeInvoiceDonationCode(draft.invoiceDonationCode))

const electronicInvoiceStatusFor = (
  requested: boolean,
  paymentStatus: PaymentStatus,
): PosOrder['electronicInvoiceStatus'] =>
  requested && (paymentStatus === 'authorized' || paymentStatus === 'paid') ? 'queued' : 'not_requested'

const buildOrderId = (date: Date, sequence: number): string =>
  `POS-${formatDateKey(date)}-${String(sequence).padStart(3, '0')}`

const toRequestedFulfillmentIso = (value: string): string | null => {
  if (!value.trim()) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const toDatetimeLocalInputValue = (value: string | null): string => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const timestamp = date.getTime()
  if (!Number.isFinite(timestamp)) {
    return ''
  }

  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const buildDefaultPrinterSettings = (station: PrintStation): PrinterSettings => ({
  stations: [
    {
      id: station.id ?? 'counter',
      name: station.name,
      host: station.host,
      port: station.port,
      protocol: station.protocol,
      enabled: station.online,
      autoPrint: station.autoPrint,
    },
  ],
  rules: [
    {
      id: 'counter-all-labels',
      name: '櫃台全品項貼紙',
      serviceMode: 'takeout',
      stationId: station.id ?? 'counter',
      timings: ['order', 'reprint'],
      categories: ['coffee', 'tea', 'food', 'retail'],
      itemIds: [],
      countExcludedCategories: [],
      countExcludedItemIds: [],
      copies: 1,
      labelMode: 'label',
      enabled: true,
    },
    {
      id: 'counter-dine-in-receipt',
      name: '內用貼紙',
      serviceMode: 'dine-in',
      stationId: station.id ?? 'counter',
      timings: ['order', 'reprint'],
      categories: ['coffee', 'tea', 'food', 'retail'],
      itemIds: [],
      countExcludedCategories: [],
      countExcludedItemIds: [],
      copies: 1,
      labelMode: 'label',
      enabled: true,
    },
    {
      id: 'counter-delivery-receipt',
      name: '外送貼紙',
      serviceMode: 'delivery',
      stationId: station.id ?? 'counter',
      timings: ['order', 'reprint'],
      categories: ['coffee', 'tea', 'food', 'retail'],
      itemIds: [],
      countExcludedCategories: [],
      countExcludedItemIds: [],
      copies: 1,
      labelMode: 'label',
      enabled: true,
    },
  ],
})

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return '未知錯誤'
}

const isInventoryError = (message: string): boolean => /inventory|Product not found|quantity/i.test(message)

const isCouponRedemptionError = (message: string): boolean =>
  /優惠券已使用|優惠券.*過期|優惠券.*不適用|coupon.*redeem|coupon.*used|coupon.*expired/i.test(message)

const nextSequenceFromOrders = (orders: PosOrder[], dateKey = formatDateKey(new Date())): number => {
  const orderIdPattern = new RegExp(`^POS-${dateKey}-(\\d{3})$`)
  const maxSequence = orders.reduce((currentMax, order) => {
    const match = order.id.match(orderIdPattern)
    const sequence = match ? Number(match[1]) : 0
    return Number.isFinite(sequence) ? Math.max(currentMax, sequence) : currentMax
  }, 0)

  return maxSequence + 1
}

const sequenceFromOrderId = (orderId: string | null): number => {
  const match = orderId?.match(/^POS-\d{8}-(\d{3})$/)
  const sequence = match ? Number(match[1]) : 0

  return Number.isFinite(sequence) ? sequence : 0
}

const sortProducts = (products: MenuItem[]): MenuItem[] =>
  [...products].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

interface ProductUpdateOverrides {
  isAvailable?: boolean
  posVisible?: boolean
  onlineVisible?: boolean
  qrVisible?: boolean
}

const productToUpdateInput = (product: MenuItem, overrides: ProductUpdateOverrides = {}): ProductUpdateInput => ({
  barcode: product.barcode,
  name: product.name,
  category: product.category,
  price: product.price,
  tags: [...product.tags],
  accent: product.accent,
  isAvailable: overrides.isAvailable ?? product.available,
  sortOrder: product.sortOrder,
  posVisible: overrides.posVisible ?? product.posVisible,
  onlineVisible: overrides.onlineVisible ?? product.onlineVisible,
  qrVisible: overrides.qrVisible ?? product.qrVisible,
  prepStation: product.prepStation,
  printLabel: product.printLabel,
  inventoryCount: product.inventoryCount,
  lowStockThreshold: product.lowStockThreshold,
  soldOutUntil: product.soldOutUntil,
  supplyPeriods: product.supplyPeriods.map((period) => ({ ...period, days: [...period.days] })),
  futureOrderAvailable: product.futureOrderAvailable,
})

const productSkuFromName = (name: string): string => {
  const sku = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 64)

  return sku || `product-${Date.now().toString(36)}`
}

const createLocalProductId = (): string =>
  `local-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`

const buildLocalProduct = (input: ProductUpdateInput): MenuItem => ({
  id: createLocalProductId(),
  sku: input.sku?.trim() || productSkuFromName(input.name),
  barcode: input.barcode?.trim() ?? '',
  name: input.name.trim(),
  category: input.category.trim(),
  price: input.price,
  tags: [...input.tags],
  accent: input.accent,
  available: input.isAvailable,
  sortOrder: input.sortOrder,
  posVisible: input.posVisible,
  onlineVisible: input.onlineVisible,
  qrVisible: input.qrVisible,
  prepStation: input.prepStation,
  printLabel: input.printLabel,
  inventoryCount: input.inventoryCount,
  lowStockThreshold: input.lowStockThreshold,
  soldOutUntil: input.soldOutUntil,
  supplyPeriods: input.supplyPeriods.map((period) => ({ ...period, days: [...period.days] })),
  futureOrderAvailable: input.futureOrderAvailable,
})

const isLocalProduct = (product: MenuItem): boolean => product.id.startsWith('local-')

const sanitizeLocalProduct = (value: unknown): MenuItem | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const product = value as Partial<MenuItem>
  if (
    typeof product.id !== 'string' ||
    typeof product.sku !== 'string' ||
    typeof product.name !== 'string' ||
    typeof product.category !== 'string' ||
    typeof product.price !== 'number'
  ) {
    return null
  }

  return {
    id: product.id,
    sku: product.sku,
    barcode: typeof product.barcode === 'string' ? product.barcode : '',
    name: product.name,
    category: product.category,
    price: Math.max(0, Math.trunc(product.price)),
    tags: Array.isArray(product.tags) ? product.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    accent: typeof product.accent === 'string' ? product.accent : '#0b6b63',
    available: typeof product.available === 'boolean' ? product.available : true,
    sortOrder: typeof product.sortOrder === 'number' ? Math.trunc(product.sortOrder) : 0,
    posVisible: typeof product.posVisible === 'boolean' ? product.posVisible : true,
    onlineVisible: typeof product.onlineVisible === 'boolean' ? product.onlineVisible : true,
    qrVisible: typeof product.qrVisible === 'boolean' ? product.qrVisible : true,
    prepStation: typeof product.prepStation === 'string' ? product.prepStation : 'counter',
    printLabel: typeof product.printLabel === 'boolean' ? product.printLabel : true,
    inventoryCount: typeof product.inventoryCount === 'number' ? Math.trunc(product.inventoryCount) : null,
    lowStockThreshold: typeof product.lowStockThreshold === 'number' ? Math.trunc(product.lowStockThreshold) : null,
    soldOutUntil: typeof product.soldOutUntil === 'string' ? product.soldOutUntil : null,
    supplyPeriods: Array.isArray(product.supplyPeriods) ? product.supplyPeriods : [],
    futureOrderAvailable: product.futureOrderAvailable === true,
  }
}

const readLocalProducts = (): MenuItem[] => {
  try {
    const rawProducts = globalThis.localStorage?.getItem(localProductsStorageKey)
    if (!rawProducts) {
      return []
    }

    const parsed = JSON.parse(rawProducts)
    return Array.isArray(parsed)
      ? parsed.map(sanitizeLocalProduct).filter((product): product is MenuItem => Boolean(product))
      : []
  } catch {
    return []
  }
}

const writeLocalProducts = (products: MenuItem[]): void => {
  try {
    globalThis.localStorage?.setItem(localProductsStorageKey, JSON.stringify(products.filter(isLocalProduct)))
  } catch {
    return
  }
}

const isProductTemporarilyStopped = (product: MenuItem): boolean => {
  if (!product.soldOutUntil) {
    return false
  }

  const stoppedUntil = new Date(product.soldOutUntil).getTime()
  return Number.isFinite(stoppedUntil) && stoppedUntil > Date.now()
}

const isCurrentTimeInSupplyWindow = (product: MenuItem, now = new Date()): boolean => {
  if (product.supplyPeriods.length === 0) {
    return true
  }

  const day = now.getDay()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return product.supplyPeriods.some((period) => {
    if (!period.days.includes(day)) {
      return false
    }

    const [startHour = 0, startMinute = 0] = period.start.split(':').map(Number)
    const [endHour = 23, endMinute = 59] = period.end.split(':').map(Number)
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = endHour * 60 + endMinute
    if (endMinutes < startMinutes) {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes
    }

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes
  })
}

const productSupplyOverrides = (status: ProductSupplyStatus): ProductUpdateOverrides => {
  if (status === 'online-stopped') {
    return {
      isAvailable: true,
      posVisible: true,
      onlineVisible: false,
      qrVisible: false,
    }
  }

  if (status === 'stopped') {
    return {
      isAvailable: false,
      posVisible: true,
      onlineVisible: false,
      qrVisible: false,
    }
  }

  return {
    isAvailable: true,
    posVisible: true,
    onlineVisible: true,
    qrVisible: true,
  }
}

const isProductOrderable = (product: MenuItem): boolean =>
  product.available &&
  product.posVisible &&
  product.inventoryCount !== 0 &&
  !isProductTemporarilyStopped(product) &&
  isCurrentTimeInSupplyWindow(product)

const isProductVisibleInPos = (product: MenuItem): boolean => product.posVisible

const summarizePrintStatuses = (statuses: PrintStatus[]): PrintStatus => {
  if (statuses.length === 0) {
    return 'skipped'
  }

  if (statuses.some((status) => status === 'failed')) {
    return 'failed'
  }

  if (statuses.every((status) => status === 'printed')) {
    return 'printed'
  }

  if (statuses.some((status) => status === 'queued')) {
    return 'queued'
  }

  return 'skipped'
}

const summarizePrintJobs = (printJobs: PrintJob[]): PrintStatus => {
  if (printJobs.length === 0) {
    return 'skipped'
  }

  return summarizePrintStatuses(printJobs.map((printJob) => printJob.status))
}

const claimExpiresIn = (seconds = 180): string => new Date(Date.now() + seconds * 1000).toISOString()

const isClaimExpired = (order: PosOrder, now = Date.now()): boolean => {
  if (!order.claimedBy || !order.claimExpiresAt) {
    return true
  }

  const expiresAt = new Date(order.claimExpiresAt).getTime()
  return !Number.isFinite(expiresAt) || expiresAt <= now
}

export const usePosSession = (options: UsePosSessionOptions = {}) => {
  const autoLoad = options.autoLoad ?? true
  const savedCounterDraft = readCounterDraft()
  const savedPendingLocalOrders = readPendingLocalOrders()
  const savedLocalCounterOrders = readLocalCounterOrders()
  const selectedCategory = ref<CategoryFilter>('all')
  const searchTerm = ref('')
  const serviceMode = ref<ServiceMode>(savedCounterDraft?.serviceMode ?? 'takeout')
  const paymentMethod = ref<PaymentMethod>(savedCounterDraft?.paymentMethod ?? 'cash')
  const orderLabels = ref<string[]>(savedCounterDraft?.orderLabels ?? [])
  const serviceFeeRate = ref(savedCounterDraft?.serviceFeeRate ?? 0)
  const extraFeeAmount = ref(savedCounterDraft?.extraFeeAmount ?? 0)
  const discountAmount = ref(savedCounterDraft?.discountAmount ?? 0)
  const selectedDiscountCampaignIds = ref<string[]>(savedCounterDraft?.selectedDiscountCampaignIds ?? [])
  const disabledAutomaticDiscountCampaignIds = ref<string[]>(savedCounterDraft?.disabledAutomaticDiscountCampaignIds ?? [])
  const pointsRedeemed = ref(savedCounterDraft?.pointsRedeemed ?? 0)
  const couponCode = ref(savedCounterDraft?.couponCode ?? '')
  const paymentSplits = ref<PaymentSplit[]>(savedCounterDraft?.paymentSplits ?? [])
  const paymentBreakdown = ref<PaymentAllocation[]>(savedCounterDraft?.paymentBreakdown ?? [])
  const transactionReceiptCount = ref(savedCounterDraft?.transactionReceiptCount ?? 0)
  const savedLocalProducts = readLocalProducts()
  const menuCatalog = ref<MenuItem[]>(sortProducts([...menuItems, ...savedLocalProducts]))
  const productStatusCatalog = ref<MenuItem[]>(sortProducts([...menuItems, ...savedLocalProducts]))
  const cartLines = ref<CartLine[]>(savedCounterDraft?.cartLines ?? [])
  const recentItemIds = ref<string[]>(readRecentItemIds())
  const pendingLocalOrders = ref<PosOrder[]>(savedPendingLocalOrders)
  const localCounterOrders = ref<PosOrder[]>(savedLocalCounterOrders)
  const orderQueue = ref<PosOrder[]>(
    mergeLocalCounterOrders(savedLocalCounterOrders, mergeLocalPendingOrders(savedPendingLocalOrders, initialOrders)),
  )
  const lastPrintPreview = ref('尚未送出列印資料')
  const counterDraftOrderId = ref<string | null>(savedCounterDraft?.draftOrderId ?? null)
  const counterDraftStartedAt = ref<string | null>(
    counterDraftOrderId.value ? savedCounterDraft?.draftStartedAt ?? null : null,
  )
  const nextSequence = ref(
    Math.max(nextSequenceFromOrders(orderQueue.value), sequenceFromOrderId(counterDraftOrderId.value) + 1),
  )
  const isSubmitting = ref(false)
  const printingOrderId = ref<string | null>(null)
  const deletingPrintJobId = ref<string | null>(null)
  const claimingOrderId = ref<string | null>(null)
  const updatingPaymentOrderId = ref<string | null>(null)
  const voidingOrderId = ref<string | null>(null)
  const refundingOrderId = ref<string | null>(null)
  const isLoadingProductStatus = ref(false)
  const togglingProductId = ref<string | null>(null)
  const productStatusMessage = ref('後台編輯模式可載入完整商品清單，並在平板上暫停或恢復供應')
  const registerSession = ref<RegisterSession | null>(null)
  const registerMessage = ref('尚未載入開班資料')
  const cashDrawerEvents = ref<CashDrawerEvent[]>([])
  const stationHeartbeatMessage = ref('尚未回報平板在線狀態')
  const isRegisterBusy = ref(false)
  const backendStatus = reactive<BackendStatus>({
    mode: isPosApiConfigured ? 'syncing' : 'fallback',
    label: isPosApiConfigured ? 'API 同步中' : '本機模式',
    detail: isPosApiConfigured ? '正在連線 POS API' : '尚未設定 Supabase URL 或 anon key',
  })
  const customer = reactive<CustomerDraft>(savedCounterDraft?.customer ?? defaultCustomerDraft())
  const printStation = reactive<PrintStation>({
    id: 'counter',
    name: 'GODEX DT2X',
    host: import.meta.env.VITE_POS_PRINTER_HOST ?? '192.168.1.100',
    port: Number(import.meta.env.VITE_POS_PRINTER_PORT ?? 9100),
    protocol: 'EZPL over TCP',
    online: true,
    autoPrint: true,
    lastPrintAt: null,
  })
  const printerSettings = ref<PrinterSettings>(buildDefaultPrinterSettings(printStation))
  const onlineOrderingSettings = ref<OnlineOrderingSettings>(defaultOnlineOrderingSettings())
  const discountSettings = ref<DiscountSettings>(defaultDiscountSettings())
  const posAppearanceSettings = ref<PosAppearanceSettings>(defaultPosAppearanceSettings())
  const floorPlanSettings = ref<FloorPlanSettings>(defaultFloorPlanSettings())
  const engagementSettings = ref<CustomerEngagementSettings>(defaultEngagementSettings())
  const accessPolicy = ref<AccessControlPolicy>({ protectedPermissions: [] })
  const settingsProfileStatus = ref<SettingsProfileStatus>(isPosApiConfigured ? 'loading' : 'local')
  const settingsProfileMessage = ref(isPosApiConfigured ? '正在檢查設定檔' : '本機模式不使用設定檔套用')
  const settingsProfileAppliedAt = ref<string | null>(null)
  const settingsProfilePendingSince = ref<string | null>(null)
  const onlineReminderClock = ref(Date.now())
  const onlineReminderStates = ref<Record<string, OnlineOrderReminderState>>({})
  const onlineReminderStateHydrated = ref(!isPosApiConfigured)
  const acceptedOnlineOrderIds = ref<string[]>(readAcceptedOnlineOrderIds())
  const dismissedQueueOrderKeys = ref<string[]>(readDismissedQueueOrderKeys())
  const onlineReminderAudioMessage = ref('')
  const stationClaimId = currentStationId()
  const stationClaimLabel = currentStationLabel()
  const stationOperationMode = computed<StationOperationMode>(() => {
    const hostStationId = engagementSettings.value.appOperation.hostStationId.trim()
    if (!hostStationId) {
      return 'host'
    }

    return hostStationId === stationClaimId ? 'host' : 'child'
  })
  const stationOperationModeLabel = computed(() => stationOperationMode.value === 'host' ? '主機' : '子機')
  const canApplySettingsProfile = computed(() => stationOperationMode.value === 'host')
  const stationOperationMessage = computed(() => {
    const settings = engagementSettings.value.appOperation
    const hostStationId = settings.hostStationId.trim()
    const childCount = settings.childStationIds.length
    const childLimitLabel = `${childCount}/${settings.maxChildStations} 台子機`

    if (!hostStationId) {
      return `未指定主機，${stationClaimLabel} 可套用新設定檔`
    }

    if (stationOperationMode.value === 'host') {
      return `主機 ${stationClaimLabel} 可套用新設定檔 · ${childLimitLabel}`
    }

    const childRegistered = settings.childStationIds.includes(stationClaimId)
    return childRegistered
      ? `連線主機 ${hostStationId} · 子機不可套用新設定檔`
      : `未列入子機清單，請以主機 ${hostStationId} 套用新設定檔`
  })
  let queueSyncTimer: number | null = null
  let stationHeartbeatTimer: number | null = null
  let onlineReminderClockTimer: number | null = null
  let counterDraftSyncTimer: number | null = null
  let realtimeUnsubscribe: (() => void) | null = null
  let realtimeReconnectTimer: number | null = null
  let realtimeQueueRefreshTimer: number | null = null
  let realtimeRuntimeRefreshTimer: number | null = null
  let realtimeRegisterRefreshTimer: number | null = null
  let realtimeProductRefreshTimer: number | null = null
  let realtimeOnlineReminderStateRefreshTimer: number | null = null
  let realtimeCashDrawerRefreshTimer: number | null = null
  let realtimeReconnectAttempt = 0
  let realtimeSubscriptionToken = 0
  let realtimeClosedByClient = false
  let lastPlayedOnlineReminderSignature = ''
  let settingsProfileHydrated = false
  let appliedSettingsProfileFingerprint = ''
  const pendingRuntimeSettingsProfile = ref<RuntimeSettings | null>(null)
  let pendingSettingsProfileFingerprint = ''

  const currentPrinterSettings = (): PrinterSettings => ({
    stations: printerSettings.value.stations.map((station) => {
      if (station.id !== printStation.id) {
        return { ...station }
      }

      return {
        ...station,
        enabled: printStation.online,
        autoPrint: printStation.autoPrint,
        host: printStation.host,
        port: printStation.port,
        protocol: printStation.protocol,
        name: printStation.name,
      }
    }),
    rules: printerSettings.value.rules.map((rule) => ({
      ...rule,
      timings: [...(rule.timings ?? ['order', 'reprint'])],
      categories: [...rule.categories],
      itemIds: [...(rule.itemIds ?? [])],
      countExcludedCategories: [...(rule.countExcludedCategories ?? [])],
      countExcludedItemIds: [...(rule.countExcludedItemIds ?? [])],
    })),
  })

  const printStationFromSetting = (setting: PrintStationSetting): PrintStation => ({
    id: setting.id,
    name: setting.name,
    host: setting.host,
    port: setting.port,
    protocol: setting.protocol,
    online: setting.enabled,
    autoPrint: setting.autoPrint,
    lastPrintAt: null,
  })

  const manualPrintStationFor = (stationId = ''): PrintStation => {
    const settings = currentPrinterSettings()
    const station = stationId
      ? settings.stations.find((entry) => entry.id === stationId && entry.enabled)
      : null

    if (station) {
      return printStationFromSetting(station)
    }

    return { ...printStation }
  }

  const applyRuntimeSettings = (runtimeSettings: RuntimeSettings): void => {
    const nextEngagementSettings = normalizeEngagementSettings(runtimeSettings.engagementSettings)
    onlineOrderingSettings.value = runtimeSettings.onlineOrdering
    discountSettings.value = normalizeDiscountSettings(runtimeSettings.discountSettings)
    posAppearanceSettings.value = runtimeSettings.posAppearance
    floorPlanSettings.value = runtimeSettings.floorPlan
    engagementSettings.value = nextEngagementSettings
    accessPolicy.value = runtimeSettings.accessPolicy
    if (!savedCounterDraft) {
      serviceFeeRate.value = serviceChargeRateForMode(nextEngagementSettings.serviceCharge, serviceMode.value)
    }
    printerSettings.value = runtimeSettings.printerSettings.stations.length > 0
      ? runtimeSettings.printerSettings
      : buildDefaultPrinterSettings(printStation)
    const primaryStation = printerSettings.value.stations.find((station) => station.enabled)
    if (!primaryStation) {
      return
    }

    printStation.id = primaryStation.id
    printStation.name = primaryStation.name
    printStation.host = primaryStation.host
    printStation.port = primaryStation.port
    printStation.protocol = primaryStation.protocol
    printStation.autoPrint = primaryStation.autoPrint
    printStation.online = primaryStation.enabled
  }

  const settingsProfilePending = computed(() => Boolean(pendingRuntimeSettingsProfile.value))

  const markSettingsProfileCurrent = (fingerprint: string, appliedAt: string | null): void => {
    appliedSettingsProfileFingerprint = fingerprint
    pendingRuntimeSettingsProfile.value = null
    pendingSettingsProfileFingerprint = ''
    settingsProfilePendingSince.value = null
    settingsProfileAppliedAt.value = appliedAt
    settingsProfileStatus.value = 'current'
    settingsProfileMessage.value = appliedAt
      ? `已套用設定檔 · ${new Date(appliedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
      : '已套用目前設定檔'
  }

  const queuePendingSettingsProfile = (
    runtimeSettings: RuntimeSettings,
    fingerprint: string,
    reason = '偵測到後台新設定',
  ): void => {
    const isSamePendingProfile = pendingSettingsProfileFingerprint === fingerprint
    pendingRuntimeSettingsProfile.value = runtimeSettings
    pendingSettingsProfileFingerprint = fingerprint
    if (!isSamePendingProfile || !settingsProfilePendingSince.value) {
      settingsProfilePendingSince.value = new Date().toISOString()
    }
    settingsProfileStatus.value = 'pending'
    settingsProfileMessage.value = `${reason}，請在工具箱套用新設定檔`
  }

  const applyRuntimeSettingsWithProfile = (runtimeSettings: RuntimeSettings): void => {
    const fingerprint = settingsProfileFingerprint(runtimeSettings)

    if (!settingsProfileHydrated) {
      settingsProfileHydrated = true
      const storedProfile = readStoredSettingsProfile(stationClaimId)
      if (storedProfile && storedProfile.fingerprint !== fingerprint) {
        try {
          applyRuntimeSettings(storedProfile.runtimeSettings)
          appliedSettingsProfileFingerprint = storedProfile.fingerprint
          settingsProfileAppliedAt.value = storedProfile.appliedAt
          queuePendingSettingsProfile(runtimeSettings, fingerprint, '後台已有更新設定檔')
          return
        } catch {
          // Corrupt local snapshots should not block POS startup.
        }
      }
    }

    if (appliedSettingsProfileFingerprint && appliedSettingsProfileFingerprint !== fingerprint) {
      queuePendingSettingsProfile(runtimeSettings, fingerprint)
      return
    }

    applyRuntimeSettings(runtimeSettings)
    const appliedAt = writeStoredSettingsProfile(stationClaimId, runtimeSettings, fingerprint)
    markSettingsProfileCurrent(fingerprint, appliedAt)
  }

  const applyPendingSettingsProfile = (): void => {
    if (!pendingRuntimeSettingsProfile.value || !pendingSettingsProfileFingerprint) {
      settingsProfileMessage.value = '目前沒有待套用的新設定檔'
      return
    }

    if (!canApplySettingsProfile.value) {
      settingsProfileMessage.value = `子機不可套用新設定檔，請改用主機：${engagementSettings.value.appOperation.hostStationId || '未指定'}`
      return
    }

    const runtimeSettings = pendingRuntimeSettingsProfile.value
    const fingerprint = pendingSettingsProfileFingerprint
    applyRuntimeSettings(runtimeSettings)
    const appliedAt = writeStoredSettingsProfile(stationClaimId, runtimeSettings, fingerprint)
    markSettingsProfileCurrent(fingerprint, appliedAt)
    setBackendStatus('connected', '設定檔已套用', '已依 iCHEF 流程套用後台最新設定')
  }

  const onlineReminderMinutes = computed(() =>
    Math.max(0, onlineOrderingSettings.value.unconfirmedReminderMinutes),
  )

  const defaultOnlineNotificationStationSettings = (): OnlineNotificationStationSettings => ({
    stationId: stationClaimId,
    stationLabel: stationClaimLabel,
    enabled: true,
    serviceModes: {
      'dine-in': true,
      takeout: true,
      delivery: true,
    },
    tableIds: [],
    soundEnabled: onlineOrderingSettings.value.soundEnabled,
    notificationRepeatMode: onlineOrderingSettings.value.notificationRepeatMode,
    notificationVolume: Math.min(Math.max(Math.trunc(onlineOrderingSettings.value.notificationVolume), 0), 100),
  })

  const currentOnlineNotificationSettings = computed<OnlineNotificationStationSettings>(() => {
    const station = onlineOrderingSettings.value.notificationRouting.stations.find((entry) => entry.stationId === stationClaimId)
    if (!station) {
      return defaultOnlineNotificationStationSettings()
    }

    return {
      stationId: station.stationId,
      stationLabel: station.stationLabel || stationClaimLabel,
      enabled: station.enabled !== false,
      serviceModes: {
        'dine-in': station.serviceModes['dine-in'] !== false,
        takeout: station.serviceModes.takeout !== false,
        delivery: station.serviceModes.delivery !== false,
      },
      tableIds: [...station.tableIds],
      soundEnabled: station.soundEnabled !== false,
      notificationRepeatMode: station.notificationRepeatMode === 'once' ? 'once' : 'continuous',
      notificationVolume: Math.min(Math.max(Math.trunc(station.notificationVolume), 0), 100),
    }
  })

  const effectiveOnlineOrderingNotificationSettings = computed<OnlineOrderingSettings>(() => ({
    ...onlineOrderingSettings.value,
    soundEnabled: currentOnlineNotificationSettings.value.soundEnabled,
    notificationRepeatMode: currentOnlineNotificationSettings.value.notificationRepeatMode,
    notificationVolume: currentOnlineNotificationSettings.value.notificationVolume,
  }))

  const floorTableIdsForOrder = (order: PosOrder): string[] => {
    if (order.mode !== 'dine-in') {
      return []
    }

    const noteTable = order.note.match(/桌位\s*([^、，,]+)/i)?.[1]?.trim().toUpperCase()
    const nameTable = order.customerName.match(/(?:^|\s)([A-Z]\d+)\b/i)?.[1]?.trim().toUpperCase()
    const tableLabel = noteTable || nameTable
    if (!tableLabel) {
      return []
    }

    const matches = floorPlanSettings.value.tables
      .filter((table) => table.id.toUpperCase() === tableLabel || table.label.toUpperCase() === tableLabel)
      .map((table) => table.id.toUpperCase())
    return [...new Set([tableLabel, ...matches])]
  }

  const onlineNotificationOrderMatchesStation = (order: PosOrder): boolean => {
    const settings = currentOnlineNotificationSettings.value
    if (!settings.enabled || settings.serviceModes[order.mode] === false) {
      return false
    }

    if (order.mode !== 'dine-in' || settings.tableIds.length === 0) {
      return true
    }

    const routedTableIds = new Set(settings.tableIds.map((tableId) => tableId.toUpperCase()))
    return floorTableIdsForOrder(order).some((tableId) => routedTableIds.has(tableId.toUpperCase()))
  }

  const saveCurrentStationOnlineNotificationSettings = async (
    patch: Partial<OnlineNotificationStationSettings>,
  ): Promise<void> => {
    const currentSettings = currentOnlineNotificationSettings.value
    const nextStation: OnlineNotificationStationSettings = {
      ...currentSettings,
      ...patch,
      stationId: stationClaimId,
      stationLabel: stationClaimLabel,
      serviceModes: {
        ...currentSettings.serviceModes,
        ...(patch.serviceModes ?? {}),
      },
      tableIds: patch.tableIds
        ? [...new Set(patch.tableIds.map((tableId) => tableId.trim().toUpperCase()).filter(Boolean))].slice(0, 80)
        : [...currentSettings.tableIds],
      notificationRepeatMode: patch.notificationRepeatMode === 'once' ? 'once' : (patch.notificationRepeatMode ?? currentSettings.notificationRepeatMode),
      notificationVolume: Math.min(
        Math.max(Math.trunc(Number(patch.notificationVolume ?? currentSettings.notificationVolume)), 0),
        100,
      ),
    }
    const otherStations = onlineOrderingSettings.value.notificationRouting.stations.filter(
      (station) => station.stationId !== stationClaimId,
    )
    const savedSettings = await updateAdminSetting<OnlineOrderingSettings>('online_ordering', {
      ...onlineOrderingSettings.value,
      notificationRouting: {
        stations: [nextStation, ...otherStations].slice(0, 32),
      },
    })
    onlineOrderingSettings.value = savedSettings
  }

  const onlineOrderAccepted = (order: PosOrder): boolean =>
    acceptedOnlineOrderIds.value.includes(order.id) || Boolean(order.claimedBy)

  const onlineOrderRequiresAcceptance = (order: PosOrder): boolean =>
    onlineOrderingSettings.value.acceptanceRequired &&
    (order.source === 'online' || order.source === 'qr') &&
    order.status === 'new' &&
    ['pending', 'authorized', 'paid'].includes(order.paymentStatus) &&
    !onlineOrderAccepted(order)

  const isOnlineReminderCandidate = (order: PosOrder): boolean =>
    (order.source === 'online' || order.source === 'qr') &&
    order.status === 'new' &&
    ['pending', 'authorized', 'paid'].includes(order.paymentStatus)

  const onlineReminderStateForOrder = (order: PosOrder): OnlineOrderReminderState | null =>
    onlineReminderStates.value[order.id] ?? null

  const onlineReminderSuppressed = (order: PosOrder): boolean => {
    const state = onlineReminderStateForOrder(order)
    if (!state) {
      return false
    }

    if (state.status === 'seen') {
      return true
    }

    if (state.status !== 'snoozed' || !state.snoozedUntil) {
      return false
    }

    const snoozedUntil = new Date(state.snoozedUntil).getTime()
    return Number.isFinite(snoozedUntil) && snoozedUntil > onlineReminderClock.value
  }

  const unconfirmedOnlineOrders = computed(() =>
    orderQueue.value.filter(isOnlineReminderCandidate),
  )

  const overdueUnconfirmedOnlineOrders = computed(() => {
    const thresholdMs = onlineReminderMinutes.value * 60_000
    const now = onlineReminderClock.value

    return unconfirmedOnlineOrders.value.filter((order) => {
      const createdAt = new Date(order.createdAt).getTime()
      if (!Number.isFinite(createdAt)) {
        return false
      }

      return now - createdAt >= thresholdMs
    })
  })

  const activeOnlineReminderOrders = computed(() => {
    if (!onlineReminderStateHydrated.value) {
      return []
    }

    const candidateOrders = onlineOrderingSettings.value.acceptanceRequired
      ? unconfirmedOnlineOrders.value.filter(onlineOrderRequiresAcceptance)
      : overdueUnconfirmedOnlineOrders.value
    return candidateOrders
      .filter(onlineNotificationOrderMatchesStation)
      .filter((order) => !onlineReminderSuppressed(order))
  })

  const onlineReminderSignature = computed(() => {
    const orderSignature = activeOnlineReminderOrders.value.map((order) => order.id).sort().join('|')
    if (!orderSignature || currentOnlineNotificationSettings.value.notificationRepeatMode !== 'continuous') {
      return orderSignature
    }

    return `${orderSignature}:${Math.floor(onlineReminderClock.value / 60_000)}`
  })

  const onlineOrderReminder = computed(() => ({
    soundEnabled: currentOnlineNotificationSettings.value.soundEnabled,
    reminderMinutes: onlineReminderMinutes.value,
    unconfirmedCount: unconfirmedOnlineOrders.value.length,
    overdueCount: overdueUnconfirmedOnlineOrders.value.length,
    activeOverdueCount: activeOnlineReminderOrders.value.length,
    audioMessage: onlineReminderAudioMessage.value,
  }))

  const isDocumentActive = (): boolean =>
    !globalThis.document?.visibilityState || globalThis.document.visibilityState === 'visible'

  const syncOnlineReminderNotifier = (): void => {
    syncOnlineOrderNotifier({
      settings: effectiveOnlineOrderingNotificationSettings.value,
      activeOrders: activeOnlineReminderOrders.value,
      acceptedOrderIds: acceptedOnlineOrderIds.value,
      appActive: isDocumentActive(),
    })
  }

  const applyOnlineReminderStates = (
    states: OnlineOrderReminderState[],
    scopedOrderIds: string[] = [],
  ): void => {
    const nextStates = { ...onlineReminderStates.value }
    for (const orderId of scopedOrderIds) {
      delete nextStates[orderId]
    }
    for (const state of states) {
      nextStates[state.orderNumber] = state
    }
    onlineReminderStates.value = nextStates
  }

  const onlineReminderStateScopeForOrders = (orders: PosOrder[]): string[] =>
    [...new Set(orders.filter(isOnlineReminderCandidate).map((order) => order.id))]

  const refreshOnlineReminderStatesForOrders = async (orders: PosOrder[] = orderQueue.value): Promise<void> => {
    if (!isPosApiConfigured) {
      onlineReminderStateHydrated.value = true
      return
    }

    const orderIds = onlineReminderStateScopeForOrders(orders)
    if (orderIds.length === 0) {
      onlineReminderStates.value = {}
      onlineReminderStateHydrated.value = true
      return
    }

    try {
      const states = await fetchOnlineOrderReminderStates(orderIds)
      applyOnlineReminderStates(states, orderIds)
      onlineReminderStateHydrated.value = true
      onlineReminderClock.value = Date.now()
    } catch (error) {
      setBackendStatus('fallback', '提醒狀態同步失敗', `線上新單提醒狀態無法同步：${getErrorMessage(error)}`)
    }
  }

  const updateOnlineReminderStateOptimistically = (
    orderIds: string[],
    action: OnlineOrderReminderAction,
    snoozedUntil: string | null,
  ): void => {
    const now = new Date().toISOString()
    const nextStates = { ...onlineReminderStates.value }
    for (const orderId of orderIds) {
      const current = nextStates[orderId]
      nextStates[orderId] = {
        orderId: current?.orderId ?? '',
        orderNumber: orderId,
        status: action === 'snooze' ? 'snoozed' : 'seen',
        snoozedUntil: action === 'snooze' ? snoozedUntil : null,
        snoozedByStationId: action === 'snooze' ? stationClaimId : '',
        seenAt: action === 'snooze' ? null : now,
        seenByStationId: action === 'snooze' ? '' : stationClaimId,
        lastAction: action,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      }
    }
    onlineReminderStates.value = nextStates
    onlineReminderClock.value = Date.now()
  }

  const persistOnlineReminderState = (
    orderIds: string[],
    action: OnlineOrderReminderAction,
    snoozedUntil?: string,
  ): void => {
    const uniqueOrderIds = [...new Set(orderIds)].filter(Boolean)
    if (uniqueOrderIds.length === 0) {
      return
    }

    if (action === 'snooze') {
      const snoozedUntilEpochMs = new Date(snoozedUntil ?? '').getTime()
      if (Number.isFinite(snoozedUntilEpochMs)) {
        snoozeOnlineOrderNotifier(uniqueOrderIds, snoozedUntilEpochMs)
      }
    } else {
      markOnlineOrderNotifierSeen(uniqueOrderIds)
    }

    updateOnlineReminderStateOptimistically(uniqueOrderIds, action, snoozedUntil ?? null)

    if (!isPosApiConfigured) {
      return
    }

    const updateInput = snoozedUntil
      ? { orderIds: uniqueOrderIds, action, snoozedUntil }
      : { orderIds: uniqueOrderIds, action }

    void updateOnlineOrderReminderStates(updateInput)
      .then((states) => {
        applyOnlineReminderStates(states, uniqueOrderIds)
      })
      .catch((error) => {
        setBackendStatus('fallback', '提醒狀態寫入失敗', `線上新單提醒狀態未同步：${getErrorMessage(error)}`)
      })
  }

  const playOnlineOrderTone = async (): Promise<void> => {
    const AudioContextCtor = globalThis.AudioContext ?? (globalThis as WebAudioGlobal).webkitAudioContext
    if (!AudioContextCtor) {
      onlineReminderAudioMessage.value = '此裝置不支援提示音'
      return
    }

    try {
      const audioContext = new AudioContextCtor()
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const now = audioContext.currentTime
      const gain = audioContext.createGain()
      const volume = Math.min(Math.max(currentOnlineNotificationSettings.value.notificationVolume, 0), 100) / 100
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.18 * volume), now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
      gain.connect(audioContext.destination)

      for (const [index, frequency] of [880, 1175].entries()) {
        const oscillator = audioContext.createOscillator()
        const startAt = now + index * 0.18
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, startAt)
        oscillator.connect(gain)
        oscillator.start(startAt)
        oscillator.stop(startAt + 0.12)
      }

      globalThis.setTimeout(() => {
        void audioContext.close()
      }, 560)
      onlineReminderAudioMessage.value = ''
    } catch {
      onlineReminderAudioMessage.value = '提示音被瀏覽器阻擋，點一下頁面後會恢復'
    }
  }

  const maybePlayOnlineOrderReminder = (): void => {
    const signature = onlineReminderSignature.value
    if (!signature) {
      lastPlayedOnlineReminderSignature = ''
      return
    }

    if (!currentOnlineNotificationSettings.value.soundEnabled || signature === lastPlayedOnlineReminderSignature) {
      return
    }

    if (!isDocumentActive()) {
      const notified = notifyBackgroundOnlineOrders({
        signature,
        orders: activeOnlineReminderOrders.value,
        settings: effectiveOnlineOrderingNotificationSettings.value,
      })
      if (notified) {
        lastPlayedOnlineReminderSignature = signature
      }
      return
    }

    lastPlayedOnlineReminderSignature = signature
    void playOnlineOrderTone()
  }

  const acknowledgeOnlineOrderReminders = (): void => {
    const snoozedIds = activeOnlineReminderOrders.value.map((order) => order.id)
    const snoozeMs = onlineOrderingSettings.value.acceptanceRequired
      ? onlineReminderShortSnoozeMs
      : onlineReminderLongSnoozeMs
    const snoozedUntil = new Date(Date.now() + snoozeMs).toISOString()
    persistOnlineReminderState(snoozedIds, 'snooze', snoozedUntil)
  }

  const markOnlineOrderRemindersSeen = (
    orderIds = activeOnlineReminderOrders.value.map((order) => order.id),
  ): void => {
    persistOnlineReminderState(orderIds, 'seen')
  }

  watch(
    unconfirmedOnlineOrders,
    (orders) => {
      const activeIds = new Set(orders.map((order) => order.id))
      onlineReminderStates.value = Object.fromEntries(
        Object.entries(onlineReminderStates.value).filter(([orderId]) => activeIds.has(orderId)),
      )
    },
  )

  watch(
    [onlineReminderSignature, () => currentOnlineNotificationSettings.value.soundEnabled],
    () => {
      maybePlayOnlineOrderReminder()
    },
  )

  watch(
    [
      activeOnlineReminderOrders,
      acceptedOnlineOrderIds,
      () => onlineOrderingSettings.value.acceptanceRequired,
      () => currentOnlineNotificationSettings.value.enabled,
      () => currentOnlineNotificationSettings.value.soundEnabled,
      () => currentOnlineNotificationSettings.value.notificationRepeatMode,
      () => currentOnlineNotificationSettings.value.notificationVolume,
      () => currentOnlineNotificationSettings.value.tableIds.join('|'),
      () => Object.entries(currentOnlineNotificationSettings.value.serviceModes).map(([mode, enabled]) => `${mode}:${enabled}`).join('|'),
      () => onlineOrderingSettings.value.unconfirmedReminderMinutes,
    ],
    () => {
      syncOnlineReminderNotifier()
    },
  )

  watch(orderQueue, (orders) => {
    const activeOrderIds = new Set(orders.filter((order) => !['served', 'voided', 'failed'].includes(order.status)).map((order) => order.id))
    const nextAcceptedIds = acceptedOnlineOrderIds.value.filter((orderId) => activeOrderIds.has(orderId))
    if (nextAcceptedIds.length !== acceptedOnlineOrderIds.value.length) {
      acceptedOnlineOrderIds.value = nextAcceptedIds
      writeAcceptedOnlineOrderIds(nextAcceptedIds)
      markOnlineOrderNotifierSeen(nextAcceptedIds)
    }
  })

  const filteredMenu = computed(() => {
    const keyword = searchTerm.value.trim().toLowerCase()
    return menuCatalog.value.filter((item) => {
      const matchesCategory = selectedCategory.value === 'all' || item.category === selectedCategory.value
      const matchesKeyword =
        keyword.length === 0 ||
        item.name.toLowerCase().includes(keyword) ||
        item.sku.toLowerCase().includes(keyword) ||
        item.barcode.toLowerCase().includes(keyword) ||
        item.tags.some((tag) => tag.toLowerCase().includes(keyword))
      return isProductVisibleInPos(item) && matchesCategory && matchesKeyword
    })
  })

  const quickAddItems = computed(() => {
    const availableItems = menuCatalog.value.filter(isProductOrderable)
    const recentItems = recentItemIds.value
      .map((itemId) => availableItems.find((item) => item.id === itemId))
      .filter((item): item is MenuItem => Boolean(item))
    const priorityItems = availableItems.filter((item) =>
      item.tags.some((tag) => ['熱賣', '可加購', '限量'].includes(tag)),
    )
    const seenItemIds = new Set<string>()

    return [...recentItems, ...priorityItems, ...availableItems]
      .filter((item) => {
        if (seenItemIds.has(item.id)) {
          return false
        }

        seenItemIds.add(item.id)
        return true
      })
      .slice(0, 6)
  })

  const cartItemSubtotal = computed(() =>
    cartLines.value.reduce((total, line) => total + line.unitPrice * line.quantity, 0),
  )
  const activeServiceChargeSettings = computed(() => engagementSettings.value.serviceCharge)
  const serviceFeeLabel = computed(() => serviceChargeLabel(activeServiceChargeSettings.value))
  const selectedDiscountCampaignIdSet = computed(() => new Set(selectedDiscountCampaignIds.value))
  const availableDiscountCampaigns = computed<DiscountCampaign[]>(() =>
    discountSettings.value.campaigns.filter((campaign) =>
      campaign.enabled &&
      campaign.usage.posEnabled &&
      campaign.serviceModes.includes(serviceMode.value),
    ),
  )
  const discountCalculation = computed(() =>
    calculateDiscountApplications(discountSettings.value, {
      lines: cartLines.value,
      serviceMode: serviceMode.value,
      channel: 'pos',
      selectedCampaignIds: selectedDiscountCampaignIds.value,
      disabledCampaignIds: disabledAutomaticDiscountCampaignIds.value,
    }),
  )
  const discountCampaignApplications = computed<DiscountApplication[]>(() => discountCalculation.value.applications)
  const automaticDiscountAmount = computed(() => discountCalculation.value.total)
  const totalDiscountAmount = computed(() =>
    Math.max(0, Math.trunc(discountAmount.value || 0)) + automaticDiscountAmount.value,
  )
  const serviceFeeAmount = computed(() => calculateServiceChargeAmount(
    {
      ...activeServiceChargeSettings.value,
      enabled: serviceFeeRate.value > 0,
      dineInRate: serviceFeeRate.value,
      takeoutRate: serviceFeeRate.value,
      deliveryRate: serviceFeeRate.value,
    },
    cartLines.value,
    serviceMode.value,
    totalDiscountAmount.value,
  ))
  const loyaltyPointSettings = computed(() => engagementSettings.value.loyaltyPoints)
  const cartTotalBeforePoints = computed(() =>
    Math.max(
      0,
      cartItemSubtotal.value +
        serviceFeeAmount.value +
        Math.max(0, Math.trunc(extraFeeAmount.value || 0)) -
        totalDiscountAmount.value,
    ),
  )
  const pointRedemptionLimit = computed(() => {
    const settings = loyaltyPointSettings.value
    if (!customer.memberId || !settings.enabled || !settings.redeemEnabled) {
      return 0
    }

    const balanceLimit = Math.max(0, Math.trunc(Number(customer.pointsBalance) || 0))
    const orderLimit = Math.min(balanceLimit, cartTotalBeforePoints.value)
    const cappedLimit = settings.maximumRedeemPointsPerOrder > 0
      ? Math.min(orderLimit, settings.maximumRedeemPointsPerOrder)
      : orderLimit

    return cappedLimit >= settings.minimumRedeemPoints ? cappedLimit : 0
  })
  const effectivePointsRedeemed = computed(() => {
    const settings = loyaltyPointSettings.value
    const requestedPoints = Math.max(0, Math.trunc(Number(pointsRedeemed.value) || 0))
    const cappedPoints = Math.min(requestedPoints, pointRedemptionLimit.value)
    return cappedPoints >= settings.minimumRedeemPoints ? cappedPoints : 0
  })
  const memberPointsEarned = computed(() => {
    const settings = loyaltyPointSettings.value
    if (!customer.memberId || !settings.enabled || !settings.earningEnabled) {
      return 0
    }

    return Math.max(0, Math.floor(Math.max(0, cartTotalBeforePoints.value - effectivePointsRedeemed.value) / settings.spendAmountPerPoint))
  })
  const cartTotal = computed(() =>
    Math.max(
      0,
      cartTotalBeforePoints.value - effectivePointsRedeemed.value,
    ),
  )

  const cartQuantity = computed(() => cartLines.value.reduce((total, line) => total + line.quantity, 0))
  const lineCountsForProductTotal = (line: CartLine): boolean => {
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
  const cartProductTotalQuantity = computed(() =>
    cartLines.value.reduce((total, line) => total + (lineCountsForProductTotal(line) ? line.quantity : 0), 0),
  )
  const pendingOrders = computed(() =>
    orderQueue.value.filter((order) =>
      order.status !== 'served' &&
      order.status !== 'voided' &&
      order.status !== 'failed' &&
      !onlineOrderRequiresAcceptance(order),
    ),
  )

  const setBackendStatus = (mode: BackendMode, label: string, detail: string): void => {
    backendStatus.mode = mode
    backendStatus.label = label
    backendStatus.detail = detail
  }

  const orderSyncOperationBusy = (): boolean =>
    isSubmitting.value ||
    Boolean(printingOrderId.value) ||
    Boolean(claimingOrderId.value) ||
    Boolean(updatingPaymentOrderId.value) ||
    Boolean(voidingOrderId.value) ||
    Boolean(refundingOrderId.value)

  const applyRegisterSession = (session: RegisterSession | null): void => {
    registerSession.value = session
    registerMessage.value = session
      ? `目前班別：${session.status === 'open' ? '營業中' : '已關班'}`
      : '尚未開班'
  }

  const applyCustomerMember = (member: { id: string; displayName: string; phone: string; customerType: string; pointsBalance: number; coupons?: CustomerDraft['availableCoupons'] }): void => {
    customer.memberId = member.id
    customer.name = member.displayName
    customer.phone = member.phone
    customer.customerType = member.customerType
    customer.pointsBalance = member.pointsBalance
    customer.availableCoupons = member.coupons ?? []
  }

  const clearCustomerMember = (): void => {
    customer.memberId = null
    customer.customerType = '一般顧客'
    customer.pointsBalance = 0
    customer.availableCoupons = []
    pointsRedeemed.value = 0
    couponCode.value = ''
  }

  const toggleOrderLabel = (labelId: string): void => {
    if (orderLabels.value.includes(labelId)) {
      orderLabels.value = orderLabels.value.filter((label) => label !== labelId)
      return
    }

    orderLabels.value = [...orderLabels.value, labelId].slice(0, 12)
  }

  const toggleDiscountCampaign = (campaignId: string): void => {
    const campaign = availableDiscountCampaigns.value.find((entry) => entry.id === campaignId)
    if (campaign?.kind === 'automatic' && campaign.usage.posAutoApply) {
      if (disabledAutomaticDiscountCampaignIds.value.includes(campaignId)) {
        disabledAutomaticDiscountCampaignIds.value = disabledAutomaticDiscountCampaignIds.value.filter((id) => id !== campaignId)
        return
      }
      disabledAutomaticDiscountCampaignIds.value = [...disabledAutomaticDiscountCampaignIds.value, campaignId].slice(0, 20)
      return
    }

    if (selectedDiscountCampaignIdSet.value.has(campaignId)) {
      selectedDiscountCampaignIds.value = selectedDiscountCampaignIds.value.filter((id) => id !== campaignId)
      return
    }

    selectedDiscountCampaignIds.value = [...selectedDiscountCampaignIds.value, campaignId].slice(0, 20)
  }

  const rememberRecentItem = (itemId: string): void => {
    recentItemIds.value = [itemId, ...recentItemIds.value.filter((entry) => entry !== itemId)].slice(0, 6)
    writeRecentItemIds(recentItemIds.value)
  }

  const resetCustomerDraft = (): void => {
    const nextDraft = defaultCustomerDraft()
    customer.memberId = nextDraft.memberId
    customer.name = nextDraft.name
    customer.phone = nextDraft.phone
    customer.customerType = nextDraft.customerType
    customer.pointsBalance = nextDraft.pointsBalance
    customer.availableCoupons = nextDraft.availableCoupons
    customer.deliveryAddress = nextDraft.deliveryAddress
    customer.requestedFulfillmentAt = nextDraft.requestedFulfillmentAt
    customer.taxId = nextDraft.taxId
    customer.invoiceCarrierBarcode = nextDraft.invoiceCarrierBarcode
    customer.invoiceDonationCode = nextDraft.invoiceDonationCode
    customer.electronicInvoiceRequested = engagementSettings.value.electronicInvoice.enabled &&
      engagementSettings.value.electronicInvoice.defaultIssueOnCheckout
    customer.electronicInvoicePrintMode = engagementSettings.value.electronicInvoice.defaultPrintPaper ? 'paper' : 'none'
    customer.note = nextDraft.note
  }

  const resetOrderAdjustments = (): void => {
    orderLabels.value = []
    serviceFeeRate.value = serviceChargeRateForMode(engagementSettings.value.serviceCharge, serviceMode.value)
    extraFeeAmount.value = 0
    discountAmount.value = 0
    selectedDiscountCampaignIds.value = []
    disabledAutomaticDiscountCampaignIds.value = []
    pointsRedeemed.value = 0
    couponCode.value = ''
    paymentSplits.value = []
    paymentBreakdown.value = []
    transactionReceiptCount.value = 0
  }

  const syncNextSequenceFromQueue = (): void => {
    nextSequence.value = Math.max(
      nextSequenceFromOrders(orderQueue.value),
      sequenceFromOrderId(counterDraftOrderId.value) + 1,
    )
  }

  const clearCounterDraftIdentity = (): void => {
    counterDraftOrderId.value = null
    counterDraftStartedAt.value = null
    syncNextSequenceFromQueue()
  }

  const defaultRequestedFulfillmentAtForMode = (mode: ServiceMode, startedAt: Date): string | null => {
    if (mode !== 'takeout') {
      return null
    }

    const pickupMinutes = Math.min(
      Math.max(Math.trunc(Number(engagementSettings.value.workflowAlerts.defaultTakeoutPickupMinutes) || 0), 0),
      86400,
    )
    return new Date(startedAt.getTime() + pickupMinutes * 60_000).toISOString()
  }

  const startCounterDraft = async (mode: ServiceMode = 'takeout'): Promise<void> => {
    const startedAt = new Date()
    const sequence = Math.max(nextSequence.value, nextSequenceFromOrders(orderQueue.value, formatDateKey(startedAt)))
    const orderId = buildOrderId(startedAt, sequence)
    const startedAtIso = startedAt.toISOString()
    const requestedFulfillmentAt = defaultRequestedFulfillmentAtForMode(mode, startedAt)
    const order: PosOrder = {
      id: orderId,
      source: 'counter',
      mode,
      customerName: '現場客',
      customerPhone: '',
      deliveryAddress: '',
      requestedFulfillmentAt,
      taxId: '',
      invoiceCarrierBarcode: '',
      invoiceDonationCode: '',
      electronicInvoiceRequested: false,
      electronicInvoiceStatus: 'not_requested',
      electronicInvoicePrintMode: 'none',
      electronicInvoiceNumber: '',
      electronicInvoiceRandomCode: '',
      electronicInvoiceIssuedAt: null,
      electronicInvoiceVoidedAt: null,
      electronicInvoiceUploadDueAt: null,
      memberId: null,
      note: '',
      lines: [],
      subtotal: 0,
      orderLabels: [],
      serviceFeeRate: 0,
      serviceFeeAmount: 0,
      extraFeeAmount: 0,
      discountAmount: 0,
      pointsRedeemed: 0,
      couponCode: '',
      paymentSplits: [],
      paymentBreakdown: [],
      transactionReceiptCount: 0,
      memberPointsEarned: 0,
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      status: 'new',
      createdAt: startedAtIso,
      isDraft: true,
      claimedBy: stationClaimId,
      claimedAt: startedAtIso,
      claimExpiresAt: claimExpiresIn(),
      printStatus: 'skipped',
      printJobs: [],
    }

    clearCart()
    resetCustomerDraft()
    customer.requestedFulfillmentAt = toDatetimeLocalInputValue(requestedFulfillmentAt)
    resetOrderAdjustments()
    paymentMethod.value = 'cash'
    serviceMode.value = mode
    counterDraftOrderId.value = orderId
    counterDraftStartedAt.value = startedAtIso
    nextSequence.value = sequence + 1
    rememberLocalCounterOrder(order)

    if (!isPosApiConfigured) {
      setBackendStatus('fallback', '本機草稿', `${order.id} 已保留在本機，連線 POS API 後才能跨平板追溯`)
      return
    }

    try {
      const persistedDraft = await createCounterDraftOrder(order)
      const nextOrder: PosOrder = {
        ...persistedDraft,
        lines: order.lines,
        isDraft: true,
      }
      replaceOrder(order.id, nextOrder)
      removeLocalCounterOrder(order.id)
      setBackendStatus('connected', '草稿已同步', `${order.id} 已建立在資料庫`)
    } catch (error) {
      setBackendStatus('fallback', '草稿同步失敗', `${order.id} 先保留在本機：${getErrorMessage(error)}`)
    }
  }

  watch(serviceMode, (nextMode, previousMode) => {
    const previousDefaultRate = serviceChargeRateForMode(engagementSettings.value.serviceCharge, previousMode)
    if (serviceFeeRate.value === previousDefaultRate || serviceFeeRate.value === engagementSettings.value.defaultServiceFeeRate) {
      serviceFeeRate.value = serviceChargeRateForMode(engagementSettings.value.serviceCharge, nextMode)
    }
  })

  watch([pointsRedeemed, pointRedemptionLimit, loyaltyPointSettings], ([requestedPoints, limit, settings]) => {
    const normalizedPoints = Math.max(0, Math.trunc(Number(requestedPoints) || 0))
    const cappedPoints = normalizedPoints >= settings.minimumRedeemPoints
      ? Math.min(normalizedPoints, limit)
      : 0
    if (pointsRedeemed.value !== cappedPoints) {
      pointsRedeemed.value = cappedPoints
    }
  })

  const noteTokensFromText = (value: string): string[] =>
    value
      .split(/[、，,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)

  const customerHasNote = (note: string): boolean => {
    const nextNote = note.trim()
    if (!nextNote) {
      return false
    }

    return noteTokensFromText(customer.note).includes(nextNote)
  }

  const appendCustomerNote = (note: string): void => {
    const nextNote = note.trim()
    if (!nextNote) {
      return
    }

    if (customerHasNote(nextNote)) {
      return
    }

    const existingNotes = noteTokensFromText(customer.note)
    customer.note = [...existingNotes, nextNote].join('、')
  }

  const toggleCustomerNote = (note: string): void => {
    const nextNote = note.trim()
    if (!nextNote) {
      return
    }

    const existingNotes = noteTokensFromText(customer.note)
    if (!existingNotes.includes(nextNote)) {
      customer.note = [...existingNotes, nextNote].join('、')
      return
    }

    customer.note = existingNotes.filter((entry) => entry !== nextNote).join('、')
  }

  const mergePrintJobs = (order: PosOrder, printJobs: PrintJob[]): PrintJob[] => {
    const mergedPrintJobs = new Map<string, PrintJob>()
    for (const printJob of order.printJobs) {
      mergedPrintJobs.set(printJob.id, printJob)
    }

    for (const printJob of printJobs) {
      mergedPrintJobs.set(printJob.id, printJob)
    }

    return [...mergedPrintJobs.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }

  const replaceOrder = (orderId: string, nextOrder: PosOrder): void => {
    orderQueue.value = orderQueue.value.map((order) => (order.id === orderId ? nextOrder : order))

    if (pendingLocalOrders.value.some((order) => order.id === orderId)) {
      pendingLocalOrders.value = pendingLocalOrders.value.map((order) => (order.id === orderId ? nextOrder : order))
      writePendingLocalOrders(pendingLocalOrders.value)
    }

    if (localCounterOrders.value.some((order) => order.id === orderId)) {
      localCounterOrders.value = localCounterOrders.value.map((order) => (order.id === orderId ? nextOrder : order))
      writeLocalCounterOrders(localCounterOrders.value)
    }
  }

  const removeLocalCounterOrder = (orderId: string): void => {
    localCounterOrders.value = localCounterOrders.value.filter((order) => order.id !== orderId)
    writeLocalCounterOrders(localCounterOrders.value)
  }

  const rememberLocalCounterOrder = (order: PosOrder): void => {
    if (order.remoteId) {
      removeLocalCounterOrder(order.id)
      return
    }

    localCounterOrders.value = [
      order,
      ...localCounterOrders.value.filter((entry) => entry.id !== order.id),
    ].slice(0, 50)
    writeLocalCounterOrders(localCounterOrders.value)
    orderQueue.value = [order, ...orderQueue.value.filter((entry) => entry.id !== order.id)]
  }

  const clearCounterOrderFromLocalStores = (orderId: string): void => {
    pendingLocalOrders.value = pendingLocalOrders.value.filter((order) => order.id !== orderId)
    localCounterOrders.value = localCounterOrders.value.filter((order) => order.id !== orderId)
    writePendingLocalOrders(pendingLocalOrders.value)
    writeLocalCounterOrders(localCounterOrders.value)
  }

  const rememberPendingLocalOrder = (order: PosOrder): void => {
    if (order.remoteId) {
      return
    }

    removeLocalCounterOrder(order.id)
    pendingLocalOrders.value = [
      order,
      ...pendingLocalOrders.value.filter((entry) => entry.id !== order.id),
    ].slice(0, 50)
    writePendingLocalOrders(pendingLocalOrders.value)
    orderQueue.value = mergeLocalPendingOrders(pendingLocalOrders.value, orderQueue.value)
  }

  const syncCounterDraftToBackend = async (order: PosOrder): Promise<void> => {
    if (!isPosApiConfigured || !order.remoteId || !order.isDraft || order.status !== 'new') {
      return
    }

    try {
      const savedDraft = await updateCounterDraftOrder(order)
      replaceOrder(order.id, {
        ...savedDraft,
        lines: order.lines.map((line) => ({ ...line, options: [...line.options] })),
        isDraft: true,
      })
      removeLocalCounterOrder(order.id)
    } catch (error) {
      setBackendStatus('fallback', '草稿同步失敗', `${order.id} 暫存在本機：${getErrorMessage(error)}`)
    }
  }

  const scheduleCounterDraftSync = (order: PosOrder): void => {
    if (!isPosApiConfigured || !order.remoteId || !order.isDraft) {
      return
    }

    if (counterDraftSyncTimer !== null) {
      globalThis.clearTimeout(counterDraftSyncTimer)
    }
    counterDraftSyncTimer = globalThis.setTimeout(() => {
      counterDraftSyncTimer = null
      void syncCounterDraftToBackend(order)
    }, 700)
  }

  const syncActiveCounterOrderSnapshot = (): void => {
    const orderId = counterDraftOrderId.value
    if (!orderId) {
      return
    }

    const currentOrder = orderQueue.value.find((order) => order.id === orderId)
    if (!currentOrder || ['served', 'voided', 'failed'].includes(currentOrder.status)) {
      return
    }

    const now = new Date().toISOString()
    const nextPaymentStatus = ['pending', 'authorized'].includes(currentOrder.paymentStatus)
      ? paymentStatusFor(paymentMethod.value)
      : currentOrder.paymentStatus
    const electronicInvoiceRequested = engagementSettings.value.electronicInvoice.enabled && invoiceRequestedFromDraft(customer)
    const electronicInvoicePrintMode = electronicInvoiceRequested ? invoicePrintModeFromDraft(customer) : 'none'
    const nextOrder: PosOrder = {
      ...currentOrder,
      mode: serviceMode.value,
      customerName: customer.name.trim() || '現場客',
      customerPhone: customer.phone.trim(),
      deliveryAddress: serviceMode.value === 'delivery' ? customer.deliveryAddress.trim() : '',
      requestedFulfillmentAt: toRequestedFulfillmentIso(customer.requestedFulfillmentAt),
      taxId: normalizeTaxId(customer.taxId),
      invoiceCarrierBarcode: normalizeInvoiceCarrierBarcode(customer.invoiceCarrierBarcode),
      invoiceDonationCode: normalizeInvoiceDonationCode(customer.invoiceDonationCode),
      electronicInvoiceRequested,
      electronicInvoiceStatus: currentOrder.electronicInvoiceStatus === 'not_requested'
        ? electronicInvoiceStatusFor(electronicInvoiceRequested, nextPaymentStatus)
        : currentOrder.electronicInvoiceStatus,
      electronicInvoicePrintMode,
      electronicInvoiceNumber: currentOrder.electronicInvoiceNumber,
      electronicInvoiceRandomCode: currentOrder.electronicInvoiceRandomCode,
      electronicInvoiceIssuedAt: currentOrder.electronicInvoiceIssuedAt,
      electronicInvoiceVoidedAt: currentOrder.electronicInvoiceVoidedAt,
      electronicInvoiceUploadDueAt: currentOrder.electronicInvoiceUploadDueAt,
      memberId: customer.memberId,
      note: customer.note.trim(),
      lines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
      subtotal: cartTotal.value,
      orderLabels: [...orderLabels.value],
      serviceFeeRate: Math.min(Math.max(Math.trunc(serviceFeeRate.value || 0), 0), 30),
      serviceFeeAmount: serviceFeeAmount.value,
      extraFeeAmount: Math.max(0, Math.trunc(extraFeeAmount.value || 0)),
      discountAmount: totalDiscountAmount.value,
      pointsRedeemed: effectivePointsRedeemed.value,
      couponCode: couponCode.value.trim(),
      paymentSplits: normalizePaymentSplits(paymentSplits.value),
      paymentBreakdown: normalizePaymentBreakdown(paymentBreakdown.value),
      transactionReceiptCount: Math.min(10, Math.max(0, Math.trunc(transactionReceiptCount.value || 0))),
      memberPointsEarned: memberPointsEarned.value,
      paymentMethod: paymentMethod.value,
      paymentStatus: nextPaymentStatus,
      claimedBy: currentOrder.claimedBy ?? stationClaimId,
      claimedAt: currentOrder.claimedAt ?? now,
      claimExpiresAt: currentOrder.claimExpiresAt ?? claimExpiresIn(),
    }

    replaceOrder(orderId, nextOrder)
    if (!nextOrder.remoteId) {
      rememberLocalCounterOrder(nextOrder)
      return
    }

    if (nextOrder.isDraft) {
      scheduleCounterDraftSync(nextOrder)
    }
  }

  watch(
    [
      cartLines,
      serviceMode,
      paymentMethod,
      customer,
      counterDraftOrderId,
      counterDraftStartedAt,
      orderLabels,
      serviceFeeRate,
      extraFeeAmount,
      discountAmount,
      selectedDiscountCampaignIds,
      disabledAutomaticDiscountCampaignIds,
      pointsRedeemed,
      couponCode,
      paymentSplits,
      paymentBreakdown,
      transactionReceiptCount,
    ],
    () => {
      writeCounterDraft({
        cartLines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
        customer: { ...customer },
        draftOrderId: counterDraftOrderId.value,
        draftStartedAt: counterDraftOrderId.value ? counterDraftStartedAt.value : null,
        paymentMethod: paymentMethod.value,
        serviceMode: serviceMode.value,
        orderLabels: [...orderLabels.value],
        serviceFeeRate: serviceFeeRate.value,
        extraFeeAmount: extraFeeAmount.value,
        discountAmount: discountAmount.value,
        selectedDiscountCampaignIds: [...selectedDiscountCampaignIds.value],
        disabledAutomaticDiscountCampaignIds: [...disabledAutomaticDiscountCampaignIds.value],
        pointsRedeemed: effectivePointsRedeemed.value,
        couponCode: couponCode.value,
        paymentSplits: normalizePaymentSplits(paymentSplits.value),
        paymentBreakdown: normalizePaymentBreakdown(paymentBreakdown.value),
        transactionReceiptCount: Math.min(10, Math.max(0, Math.trunc(transactionReceiptCount.value || 0))),
      })
      syncActiveCounterOrderSnapshot()
    },
    { deep: true, immediate: true },
  )

  const applyRemoteOrders = (remoteOrders: PosOrder[]): void => {
    const visibleRemoteOrders = remoteOrders.filter((order) =>
      !dismissedQueueOrderKeys.value.includes(queueDismissalKeyFor(order)),
    )
    const remoteOrderIds = new Set(visibleRemoteOrders.map((order) => order.id))
    const nextPendingOrders = pendingLocalOrders.value.filter((order) => !remoteOrderIds.has(order.id))
    const nextLocalCounterOrders = localCounterOrders.value.filter((order) =>
      !remoteOrderIds.has(order.id) && !['served', 'voided', 'failed'].includes(order.status),
    )

    if (nextPendingOrders.length !== pendingLocalOrders.value.length) {
      pendingLocalOrders.value = nextPendingOrders
      writePendingLocalOrders(pendingLocalOrders.value)
    }

    if (nextLocalCounterOrders.length !== localCounterOrders.value.length) {
      localCounterOrders.value = nextLocalCounterOrders
      writeLocalCounterOrders(localCounterOrders.value)
    }

    orderQueue.value = mergeLocalCounterOrders(localCounterOrders.value, mergeLocalPendingOrders(pendingLocalOrders.value, visibleRemoteOrders))
  }

  const syncPendingLocalOrders = async (): Promise<number> => {
    if (!isPosApiConfigured || pendingLocalOrders.value.length === 0) {
      return 0
    }

    const stillPendingOrders: PosOrder[] = []
    let syncedCount = 0

    for (const order of pendingLocalOrders.value) {
      if (order.status === 'voided') {
        stillPendingOrders.push(order)
        continue
      }

      try {
        const persistedOrder = await createOrder(order)
        if (order.status !== 'new') {
          await persistOrderStatus(persistedOrder, order.status)
        }
        syncedCount += 1
      } catch {
        stillPendingOrders.push(order)
      }
    }

    if (syncedCount > 0 || stillPendingOrders.length !== pendingLocalOrders.value.length) {
      pendingLocalOrders.value = stillPendingOrders
      writePendingLocalOrders(pendingLocalOrders.value)
    }

    return syncedCount
  }

  const pendingLocalOrderDetail = (): string =>
    pendingLocalOrders.value.length > 0 ? `，另有 ${pendingLocalOrders.value.length} 張本機待同步` : ''

  const syncedLocalOrderDetail = (count: number): string => (count > 0 ? `，已補同步 ${count} 張本機訂單` : '')

  const counterOrderSkipsClaimTimeout = (order: PosOrder): boolean => order.source === 'counter'

  const orderClaimExpired = (order: PosOrder, now = Date.now()): boolean =>
    counterOrderSkipsClaimTimeout(order) ? false : isClaimExpired(order, now)

  const orderClaimedByCurrentStation = (order: PosOrder): boolean =>
    Boolean(order.claimedBy) && order.claimedBy === stationClaimId && !orderClaimExpired(order)

  const orderClaimedByOtherStation = (order: PosOrder): boolean =>
    !counterOrderSkipsClaimTimeout(order) &&
    Boolean(order.claimedBy) &&
    order.claimedBy !== stationClaimId &&
    !orderClaimExpired(order)

  const orderPendingSync = (order: PosOrder): boolean =>
    pendingLocalOrders.value.some((entry) => entry.id === order.id)

  const claimLabelFor = (order: PosOrder): string => {
    if (!order.claimedBy) {
      return ''
    }

    if (counterOrderSkipsClaimTimeout(order)) {
      return ''
    }

    if (orderClaimExpired(order)) {
      return '鎖定逾時'
    }

    if (order.claimedBy === stationClaimId) {
      return '本機處理中'
    }

    return '其他平板處理中'
  }

  const claimOrderForStation = async (orderId: string, force = false): Promise<boolean> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return false
    }

    if (orderClaimedByCurrentStation(order) && !force) {
      return true
    }

    claimingOrderId.value = orderId

    if (!isPosApiConfigured || !order.remoteId) {
      replaceOrder(order.id, {
        ...order,
        claimedBy: stationClaimId,
        claimedAt: new Date().toISOString(),
        claimExpiresAt: claimExpiresIn(),
      })
      claimingOrderId.value = null
      return true
    }

    try {
      const claimedOrder = await claimOrder(order, force)
      replaceOrder(order.id, {
        ...claimedOrder,
        lines: claimedOrder.lines.length > 0 ? claimedOrder.lines : order.lines,
        printStatus: claimedOrder.printStatus === 'skipped' ? order.printStatus : claimedOrder.printStatus,
      })
      setBackendStatus('connected', '訂單已鎖定', `${order.id} 由 ${stationClaimLabel} 處理`)
      return true
    } catch (error) {
      setBackendStatus('fallback', '鎖定失敗', `${order.id} 無法鎖定：${getErrorMessage(error)}`)
      return false
    } finally {
      claimingOrderId.value = null
    }
  }

  const markOnlineOrderHandled = (orderId: string, action: Extract<OnlineOrderReminderAction, 'accepted' | 'rejected'>): void => {
    acceptedOnlineOrderIds.value = [...new Set([...acceptedOnlineOrderIds.value, orderId])].slice(-100)
    persistOnlineReminderState([orderId], action)
    writeAcceptedOnlineOrderIds(acceptedOnlineOrderIds.value)
  }

  const markOnlineOrderAccepted = (orderId: string): void => {
    markOnlineOrderHandled(orderId, 'accepted')
  }

  const acceptOnlineOrderForStation = async (
    orderId: string,
    options: { printAfterAccept?: boolean } = {},
  ): Promise<boolean> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return false
    }

    if (!onlineOrderRequiresAcceptance(order)) {
      markOnlineOrderAccepted(order.id)
      if (options.printAfterAccept) {
        await printOrder(order.id, 'order')
      }
      return true
    }

    const claimed = await claimOrderForStation(order.id, Boolean(order.claimedBy && orderClaimExpired(order)))
    if (!claimed) {
      return false
    }

    markOnlineOrderAccepted(order.id)
    if (options.printAfterAccept) {
      await printOrder(order.id, 'order')
    }
    setBackendStatus(
      'connected',
      options.printAfterAccept ? '線上訂單已接單並出單' : '線上訂單已接單',
      options.printAfterAccept ? `${order.id} 已排入桌況頁並執行出單流程` : `${order.id} 已接受但未出單`,
    )
    return true
  }

  const rejectOnlineOrderForStation = async (orderId: string): Promise<boolean> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order || (order.source !== 'online' && order.source !== 'qr')) {
      return false
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return false
    }

    const shouldRefundRejectedOnlineOrder = ['authorized', 'paid'].includes(order.paymentStatus)
    voidingOrderId.value = orderId
    if (shouldRefundRejectedOnlineOrder) {
      refundingOrderId.value = orderId
    }

    try {
      const rejectedOrder =
        isPosApiConfigured && order.remoteId
          ? order.paymentStatus === 'pending'
            ? await voidOrder(order, '拒絕接單')
            : shouldRefundRejectedOnlineOrder
              ? await refundOrder(order, '拒絕接單')
              : await persistOrderStatus(order, 'voided')
          : {
              ...order,
              status: 'voided' as OrderStatus,
              paymentStatus: shouldRefundRejectedOnlineOrder ? 'refunded' as PaymentStatus : 'failed' as PaymentStatus,
              note: [
                order.note,
                shouldRefundRejectedOnlineOrder ? '已退款：拒絕接單' : '拒絕接單',
              ].filter(Boolean).join(' / '),
              claimedBy: null,
              claimedAt: null,
              claimExpiresAt: null,
            }

      replaceOrder(orderId, {
        ...rejectedOrder,
        lines: rejectedOrder.lines.length > 0 ? rejectedOrder.lines : order.lines,
        printStatus: rejectedOrder.printStatus === 'skipped' ? order.printStatus : rejectedOrder.printStatus,
      })
      markOnlineOrderHandled(order.id, 'rejected')
      setBackendStatus(
        'connected',
        shouldRefundRejectedOnlineOrder ? '已退款並拒絕接單' : '已拒絕接單',
        shouldRefundRejectedOnlineOrder ? `${order.id} 已退款並從待接單移除` : `${order.id} 已從待接單移除`,
      )
      void loadRegisterSession()
      return true
    } catch (error) {
      setBackendStatus('fallback', '拒絕接單失敗', `${order.id} 拒絕失敗：${getErrorMessage(error)}`)
      return false
    } finally {
      voidingOrderId.value = null
      if (shouldRefundRejectedOnlineOrder) {
        refundingOrderId.value = null
      }
    }
  }

  const releaseOrderClaimForStation = async (orderId: string): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order || !orderClaimedByCurrentStation(order)) {
      return
    }

    claimingOrderId.value = orderId

    if (!isPosApiConfigured || !order.remoteId) {
      replaceOrder(order.id, { ...order, claimedBy: null, claimedAt: null, claimExpiresAt: null })
      claimingOrderId.value = null
      return
    }

    try {
      const releasedOrder = await releaseOrderClaim(order)
      replaceOrder(order.id, {
        ...releasedOrder,
        lines: releasedOrder.lines.length > 0 ? releasedOrder.lines : order.lines,
        printStatus: releasedOrder.printStatus === 'skipped' ? order.printStatus : releasedOrder.printStatus,
      })
      setBackendStatus('connected', '訂單已釋放', `${order.id} 已解除平板鎖定`)
    } catch (error) {
      setBackendStatus('fallback', '釋放失敗', `${order.id} 釋放失敗：${getErrorMessage(error)}`)
    } finally {
      claimingOrderId.value = null
    }
  }

  const applySavedProduct = (product: MenuItem): void => {
    if (isLocalProduct(product)) {
      const savedProducts = readLocalProducts()
      writeLocalProducts(
        savedProducts.some((entry) => entry.id === product.id)
          ? savedProducts.map((entry) => (entry.id === product.id ? product : entry))
          : [...savedProducts, product],
      )
    }

    productStatusCatalog.value = sortProducts(
      productStatusCatalog.value.some((entry) => entry.id === product.id)
        ? productStatusCatalog.value.map((entry) => (entry.id === product.id ? product : entry))
        : [...productStatusCatalog.value, product],
    )

    const shouldShowInPos = isProductVisibleInPos(product)
    if (!shouldShowInPos) {
      menuCatalog.value = menuCatalog.value.filter((entry) => entry.id !== product.id)
      cartLines.value = cartLines.value.filter((line) => line.itemId !== product.id && line.productId !== product.id)
      return
    }

    menuCatalog.value = sortProducts(
      menuCatalog.value.some((entry) => entry.id === product.id)
        ? menuCatalog.value.map((entry) => (entry.id === product.id ? product : entry))
        : [...menuCatalog.value, product],
    )
  }

  const removeSavedProduct = (productId: string): void => {
    writeLocalProducts(readLocalProducts().filter((product) => product.id !== productId))
    productStatusCatalog.value = productStatusCatalog.value.filter((entry) => entry.id !== productId)
    menuCatalog.value = menuCatalog.value.filter((entry) => entry.id !== productId)
    cartLines.value = cartLines.value.filter((line) => line.itemId !== productId && line.productId !== productId)
  }

  const restoreSupplyProductSnapshot = (products: MenuItem[]): void => {
    const restoredProducts = sortProducts(products.map((product) => ({ ...product, tags: [...product.tags] })))
    productStatusCatalog.value = restoredProducts
    menuCatalog.value = sortProducts(restoredProducts.filter(isProductVisibleInPos))
    writeLocalProducts(restoredProducts.filter(isLocalProduct))
    cartLines.value = cartLines.value.filter((line) =>
      restoredProducts.some((product) => product.id === line.itemId || product.id === line.productId),
    )
  }

  const appendPrintPreviewStatus = (message: string): void => {
    lastPrintPreview.value = `${lastPrintPreview.value}\n${message}`
  }

  const tryNativeLanPrint = async (
    payload: string,
    station: PrintStation = printStation,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!isNativeLanPrinterAvailable()) {
      appendPrintPreviewStatus(`STATUS ${lanPrinterModeLabel()}，尚未送出 TCP payload`)
      return { ok: false, error: 'native LAN printer is not available' }
    }

    try {
      const result = await sendLanPrintPayload(station, payload)
      appendPrintPreviewStatus(`STATUS ${station.name} 已送出 ${result.bytesWritten} bytes，耗時 ${result.elapsedMs}ms`)
      return { ok: true }
    } catch (error) {
      const message = getErrorMessage(error)
      if (station.id === printStation.id) {
        printStation.online = false
      }
      appendPrintPreviewStatus(`STATUS ${station.name} TCP 列印失敗：${message}`)
      return { ok: false, error: message }
    }
  }

  const refreshBackendData = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      setBackendStatus('fallback', '本機模式', '尚未設定 Supabase URL 或 anon key')
      return
    }

    setBackendStatus('syncing', 'API 同步中', '正在載入商品與訂單')

    try {
      const syncedLocalCount = await syncPendingLocalOrders()
      const [remoteProducts, remoteOrders, currentRegisterSession, runtimeSettings] = await Promise.all([
        fetchProducts(),
        fetchOrders(),
        fetchCurrentRegisterSession(),
        fetchRuntimeSettings(),
      ])
      applyRuntimeSettingsWithProfile(runtimeSettings)
      await refreshOnlineReminderStatesForOrders(remoteOrders)
      writeLocalProducts([])
      menuCatalog.value = sortProducts(remoteProducts)
      productStatusCatalog.value = sortProducts(remoteProducts)
      applyRemoteOrders(remoteOrders)
      applyRegisterSession(currentRegisterSession)
      syncNextSequenceFromQueue()
      setBackendStatus(
        'connected',
        'API 已同步',
        `已載入 ${remoteProducts.length} 個商品、${remoteOrders.length} 張遠端訂單${syncedLocalOrderDetail(syncedLocalCount)}${pendingLocalOrderDetail()}`,
      )
    } catch (error) {
      setBackendStatus('fallback', '本機模式', `POS API 載入失敗：${getErrorMessage(error)}`)
    }
  }

  const refreshProductCatalog = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      return
    }

    try {
      const remoteProducts = await fetchProducts()
      writeLocalProducts([])
      menuCatalog.value = sortProducts(remoteProducts)
      productStatusCatalog.value = sortProducts(remoteProducts)
    } catch {
      return
    }
  }

  const refreshRuntimeSettings = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      return
    }

    try {
      applyRuntimeSettingsWithProfile(await fetchRuntimeSettings())
    } catch {
      return
    }
  }

  const loadCashDrawerEvents = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      cashDrawerEvents.value = []
      return
    }

    try {
      cashDrawerEvents.value = await fetchCashDrawerEvents(60)
    } catch (error) {
      setBackendStatus('fallback', '錢櫃紀錄載入失敗', `錢櫃紀錄同步失敗：${getErrorMessage(error)}`)
    }
  }

  const resolveCashDrawerPrintStation = (targetStationId = ''): PrintStation => {
    const targetSetting = printerSettings.value.stations.find((station) => station.id === targetStationId)
      ?? printerSettings.value.stations.find((station) => station.enabled)

    return targetSetting ? printStationFromSetting(targetSetting) : { ...printStation }
  }

  const openCashDrawerForStation = async (input: {
    reason: string
    deviceId?: string
    targetStationId?: string
  }): Promise<CashDrawerEvent> => {
    if (!isPosApiConfigured) {
      throw new Error('POS API is not configured')
    }

    const targetStation = resolveCashDrawerPrintStation(input.targetStationId)
    const payload = buildCashDrawerPulsePayload()
    const openedAt = new Date()
    lastPrintPreview.value = [
      'CASH DRAWER',
      `${targetStation.name} ${targetStation.host}:${targetStation.port}`,
      'ESC/POS pulse',
      openedAt.toISOString(),
    ].join('\n')

    const printResult = await tryNativeLanPrint(payload, targetStation)
    let deliveryStatus: CashDrawerDeliveryStatus = 'preview'
    let errorMessage = ''
    if (printResult.ok) {
      deliveryStatus = 'sent'
      if (targetStation.id === printStation.id) {
        printStation.online = true
        printStation.lastPrintAt = openedAt.toISOString()
      }
    } else {
      errorMessage = printResult.error
      deliveryStatus = isNativeLanPrinterAvailable() ? 'failed' : 'preview'
    }

    const event = await createCashDrawerOpenEvent({
      reason: input.reason.trim() || '手動開啟錢櫃',
      deviceId: input.deviceId ?? '',
      targetStationId: targetStation.id ?? input.targetStationId ?? '',
      printerHost: targetStation.host,
      printerPort: targetStation.port,
      deliveryStatus,
      errorMessage,
    })

    cashDrawerEvents.value = [
      event,
      ...cashDrawerEvents.value.filter((entry) => entry.id !== event.id),
    ].slice(0, 60)

    setBackendStatus(
      deliveryStatus === 'failed' ? 'fallback' : 'connected',
      deliveryStatus === 'sent' ? '錢櫃已送出' : '錢櫃已記錄',
      deliveryStatus === 'failed'
        ? `已寫入錢櫃紀錄，硬體送出失敗：${errorMessage}`
        : `已寫入錢櫃開啟紀錄 · ${targetStation.host}:${targetStation.port}`,
    )

    return event
  }

  const scheduleRealtimeQueueRefresh = (delay = realtimeRefreshDebounceMs): void => {
    if (realtimeQueueRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeQueueRefreshTimer)
    }

    realtimeQueueRefreshTimer = globalThis.setTimeout(() => {
      realtimeQueueRefreshTimer = null
      if (orderSyncOperationBusy()) {
        scheduleRealtimeQueueRefresh(realtimeBusyRetryMs)
        return
      }

      void refreshQueueState(true)
    }, delay)
  }

  const scheduleRealtimeRuntimeRefresh = (): void => {
    if (realtimeRuntimeRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeRuntimeRefreshTimer)
    }

    realtimeRuntimeRefreshTimer = globalThis.setTimeout(() => {
      realtimeRuntimeRefreshTimer = null
      void refreshRuntimeSettings()
    }, realtimeRefreshDebounceMs)
  }

  const scheduleRealtimeRegisterRefresh = (): void => {
    if (realtimeRegisterRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeRegisterRefreshTimer)
    }

    realtimeRegisterRefreshTimer = globalThis.setTimeout(() => {
      realtimeRegisterRefreshTimer = null
      void loadRegisterSession()
    }, realtimeRefreshDebounceMs)
  }

  const scheduleRealtimeProductRefresh = (): void => {
    if (realtimeProductRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeProductRefreshTimer)
    }

    realtimeProductRefreshTimer = globalThis.setTimeout(() => {
      realtimeProductRefreshTimer = null
      void refreshProductCatalog()
    }, realtimeRefreshDebounceMs)
  }

  const scheduleRealtimeOnlineReminderStateRefresh = (): void => {
    if (realtimeOnlineReminderStateRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeOnlineReminderStateRefreshTimer)
    }

    realtimeOnlineReminderStateRefreshTimer = globalThis.setTimeout(() => {
      realtimeOnlineReminderStateRefreshTimer = null
      void refreshOnlineReminderStatesForOrders()
    }, realtimeRefreshDebounceMs)
  }

  const scheduleRealtimeCashDrawerRefresh = (): void => {
    if (realtimeCashDrawerRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeCashDrawerRefreshTimer)
    }

    realtimeCashDrawerRefreshTimer = globalThis.setTimeout(() => {
      realtimeCashDrawerRefreshTimer = null
      void loadCashDrawerEvents()
    }, realtimeRefreshDebounceMs)
  }

  const handleRealtimeEvent = (event: PosRealtimeEvent): void => {
    if (event.topic === 'orders') {
      scheduleRealtimeQueueRefresh()
      onlineReminderClock.value = Date.now()
      return
    }

    if (event.topic === 'runtime_settings') {
      scheduleRealtimeRuntimeRefresh()
      return
    }

    if (event.topic === 'register_sessions') {
      scheduleRealtimeRegisterRefresh()
      return
    }

    if (event.topic === 'products') {
      scheduleRealtimeProductRefresh()
      return
    }

    if (event.topic === 'online_order_reminders') {
      scheduleRealtimeOnlineReminderStateRefresh()
      onlineReminderClock.value = Date.now()
      return
    }

    if (event.topic === 'cash_drawer') {
      scheduleRealtimeCashDrawerRefresh()
      return
    }

    if (event.topic === 'inventory_management') {
      globalThis.dispatchEvent(new CustomEvent('script-coffee-pos-inventory-management-changed'))
    }
  }

  const disconnectRealtime = (): void => {
    realtimeClosedByClient = true
    realtimeSubscriptionToken += 1
    realtimeUnsubscribe?.()
    realtimeUnsubscribe = null
  }

  const connectRealtime = (): void => {
    if (!isPosApiConfigured || !isPosRealtimeConfigured) {
      return
    }

    disconnectRealtime()
    realtimeClosedByClient = false
    const subscriptionToken = realtimeSubscriptionToken + 1
    realtimeSubscriptionToken = subscriptionToken
    realtimeUnsubscribe = subscribeToPosRealtimeEvents({
      topics: ['orders', 'runtime_settings', 'register_sessions', 'products', 'online_order_reminders', 'cash_drawer', 'inventory_management'],
      onEvent: handleRealtimeEvent,
      onStatus: (status) => {
        if (subscriptionToken === realtimeSubscriptionToken) {
          handleRealtimeStatus(status)
        }
      },
    })
  }

  const scheduleRealtimeReconnect = (error?: string): void => {
    if (realtimeClosedByClient || realtimeReconnectTimer !== null) {
      return
    }

    const delay = Math.min(
      realtimeReconnectMaxDelayMs,
      realtimeReconnectBaseDelayMs * 2 ** realtimeReconnectAttempt,
    )
    realtimeReconnectAttempt = Math.min(realtimeReconnectAttempt + 1, 5)
    realtimeReconnectTimer = globalThis.setTimeout(() => {
      realtimeReconnectTimer = null
      connectRealtime()
      void refreshQueueState(true)
      void refreshRuntimeSettings()
      void loadRegisterSession()
    }, delay)

    if (error) {
      backendStatus.detail = `Realtime 斷線，保留 ${queueSyncIntervalMs / 1000} 秒輪詢：${error}`
    }
  }

  function handleRealtimeStatus(status: PosRealtimeStatus): void {
    if (status.status === 'SUBSCRIBED') {
      realtimeReconnectAttempt = 0
      if (realtimeReconnectTimer !== null) {
        globalThis.clearTimeout(realtimeReconnectTimer)
        realtimeReconnectTimer = null
      }
      return
    }

    if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status.status)) {
      scheduleRealtimeReconnect(status.error ?? status.status)
    }
  }

  const refreshQueueState = async (quiet = false): Promise<void> => {
    if (!isPosApiConfigured) {
      if (!quiet) {
        setBackendStatus('fallback', '本機模式', '尚未設定 Supabase URL 或 anon key')
      }
      return
    }

    if (orderSyncOperationBusy()) {
      return
    }

    if (!quiet) {
      setBackendStatus('syncing', 'API 同步中', '正在更新訂單佇列')
    }

    try {
      const syncedLocalCount = await syncPendingLocalOrders()
      const [remoteOrders, currentRegisterSession, runtimeSettings] = await Promise.all([
        fetchOrders(),
        fetchCurrentRegisterSession(),
        fetchRuntimeSettings().catch(() => null),
      ])
      if (runtimeSettings) {
        applyRuntimeSettingsWithProfile(runtimeSettings)
      }
      await refreshOnlineReminderStatesForOrders(remoteOrders)
      applyRemoteOrders(remoteOrders)
      applyRegisterSession(currentRegisterSession)
      syncNextSequenceFromQueue()
      setBackendStatus(
        'connected',
        quiet ? '自動同步完成' : 'API 已同步',
        `已更新 ${remoteOrders.length} 張遠端訂單${syncedLocalOrderDetail(syncedLocalCount)}${pendingLocalOrderDetail()}`,
      )
    } catch (error) {
      setBackendStatus('fallback', '同步失敗', `訂單佇列同步失敗：${getErrorMessage(error)}`)
    }
  }

  const createCartLine = (
    item: MenuItem,
    quantity: number,
    options: string[] = item.tags.slice(0, 1),
    unitPrice = item.price,
    itemId = item.id,
    comboItems: ComboLineItem[] = [],
  ): CartLine => {
    const nextLine: CartLine = {
      itemId,
      productSku: item.sku,
      category: item.category,
      name: item.name,
      unitPrice,
      quantity,
      options,
      prepStation: item.prepStation,
      printLabel: item.printLabel,
    }

    if (comboItems.length > 0) {
      nextLine.comboItems = comboItems.map((comboItem) => ({
        ...comboItem,
        options: comboItem.options ? [...comboItem.options] : [],
      }))
    }

    if (item.id !== item.sku || itemId !== item.id) {
      nextLine.productId = item.id
    }

    return nextLine
  }

  const normalizeCartQuantity = (quantity: number): number => {
    if (!Number.isFinite(quantity)) {
      return 0
    }

    return Math.min(maxCartLineQuantity, Math.max(0, Math.trunc(quantity)))
  }

  const setItemQuantity = (item: MenuItem, quantity: number): void => {
    const nextQuantity = normalizeCartQuantity(quantity)
    const existing = cartLines.value.find((line) => line.itemId === item.id)

    if (nextQuantity === 0) {
      cartLines.value = cartLines.value.filter((line) => line.itemId !== item.id)
      return
    }

    rememberRecentItem(item.id)

    if (existing) {
      existing.quantity = nextQuantity
      return
    }

    cartLines.value.push(createCartLine(item, nextQuantity))
  }

  const setLineQuantity = (itemId: string, quantity: number): void => {
    const nextQuantity = normalizeCartQuantity(quantity)
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (!line) {
      return
    }

    if (nextQuantity === 0) {
      cartLines.value = cartLines.value.filter((entry) => entry.itemId !== itemId)
      return
    }

    line.quantity = nextQuantity
  }

  const addItem = (item: MenuItem): void => {
    setItemQuantity(item, (cartLines.value.find((line) => line.itemId === item.id)?.quantity ?? 0) + 1)
  }

  const addConfiguredItem = (item: MenuItem, options: string[], priceAdjustment = 0, comboItems: ComboLineItem[] = []): void => {
    const normalizedOptions = options.filter((option) => option.trim().length > 0)
    const variantKey = [item.id, ...normalizedOptions].join('::')
    const unitPrice = Math.max(0, item.price + priceAdjustment)
    const existing = cartLines.value.find((line) => line.itemId === variantKey)

    rememberRecentItem(item.id)

    if (existing) {
      existing.quantity = normalizeCartQuantity(existing.quantity + 1)
      return
    }

    cartLines.value.push(createCartLine(item, 1, normalizedOptions, unitPrice, variantKey, comboItems))
  }

  const lineVariantSignature = (line: CartLine): string =>
    [line.productId ?? line.itemId, line.productSku, ...line.options].join('::')

  const mergeComboItemsIntoRemoteLines = (remoteLines: CartLine[], localLines: CartLine[]): CartLine[] => {
    const localBySignature = new Map(localLines.map((line) => [lineVariantSignature(line), line]))
    return remoteLines.map((line) => {
      const localLine = localBySignature.get(lineVariantSignature(line))
      return localLine?.comboItems && localLine.comboItems.length > 0
        ? {
          ...line,
          comboItems: localLine.comboItems.map((item) => ({
            ...item,
            options: item.options ? [...item.options] : [],
          })),
        }
        : line
    })
  }

  const updateConfiguredLine = (
    lineItemId: string,
    item: MenuItem,
    options: string[],
    priceAdjustment = 0,
    comboItems: ComboLineItem[] = [],
  ): void => {
    const currentLine = cartLines.value.find((line) => line.itemId === lineItemId)
    if (!currentLine) {
      return
    }

    const normalizedOptions = options.filter((option) => option.trim().length > 0)
    const variantKey = [item.id, ...normalizedOptions].join('::')
    const unitPrice = Math.max(0, item.price + priceAdjustment)
    const existing = cartLines.value.find((line) => line.itemId === variantKey && line.itemId !== lineItemId)

    rememberRecentItem(item.id)

    if (existing) {
      existing.quantity = normalizeCartQuantity(existing.quantity + currentLine.quantity)
      cartLines.value = cartLines.value.filter((line) => line.itemId !== lineItemId)
      return
    }

    cartLines.value = cartLines.value.map((line) => {
      if (line.itemId !== lineItemId) {
        return line
      }

      const nextLine = createCartLine(item, currentLine.quantity, normalizedOptions, unitPrice, variantKey, comboItems)
      if (currentLine.printPaused) {
        nextLine.printPaused = true
      }
      return nextLine
    })
  }

  const toggleLinePrintPaused = (itemId: string): void => {
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (!line) {
      return
    }

    line.printPaused = !line.printPaused
  }

  const increaseLine = (itemId: string): void => {
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (line) {
      setLineQuantity(itemId, line.quantity + 1)
    }
  }

  const decreaseLine = (itemId: string): void => {
    const line = cartLines.value.find((entry) => entry.itemId === itemId)
    if (!line) {
      return
    }

    setLineQuantity(itemId, line.quantity - 1)
  }

  const clearCart = (): void => {
    cartLines.value = []
  }

  const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }
    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }
    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }
    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    const previousStatus = claimedOrder.status
    claimedOrder.status = status

    if (!isPosApiConfigured || !claimedOrder.remoteId) {
      return
    }

    try {
      const persistedOrder = await persistOrderStatus(claimedOrder, status)
      replaceOrder(orderId, {
        ...persistedOrder,
        lines: persistedOrder.lines.length > 0 ? persistedOrder.lines : claimedOrder.lines,
        printStatus: persistedOrder.printStatus === 'skipped' ? claimedOrder.printStatus : persistedOrder.printStatus,
      })
      setBackendStatus('connected', 'API 已同步', `${orderId} 已更新為 ${status}`)
    } catch (error) {
      claimedOrder.status = previousStatus
      setBackendStatus('fallback', '本機模式', `訂單狀態同步失敗：${getErrorMessage(error)}`)
    }
  }

  const updatePaymentStatus = async (orderId: string, paymentStatus: PaymentStatus): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }
    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }
    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    const previousPaymentStatus = claimedOrder.paymentStatus
    claimedOrder.paymentStatus = paymentStatus
    updatingPaymentOrderId.value = orderId

    if (!isPosApiConfigured || !claimedOrder.remoteId) {
      updatingPaymentOrderId.value = null
      return
    }

    try {
      const persistedOrder = await persistOrderPaymentStatus(claimedOrder, paymentStatus)
      replaceOrder(orderId, {
        ...persistedOrder,
        lines: persistedOrder.lines.length > 0 ? persistedOrder.lines : claimedOrder.lines,
        printStatus: persistedOrder.printStatus === 'skipped' ? claimedOrder.printStatus : persistedOrder.printStatus,
      })
      setBackendStatus('connected', '收款已同步', `${orderId} 已更新為 ${paymentStatus}`)
      void loadRegisterSession()
    } catch (error) {
      claimedOrder.paymentStatus = previousPaymentStatus
      setBackendStatus('fallback', '收款失敗', `付款狀態同步失敗：${getErrorMessage(error)}`)
    } finally {
      updatingPaymentOrderId.value = null
    }
  }

  const orderWithFloorAssignment = (
    order: PosOrder,
    tableLabel: string,
    partySize: number,
    floorLabel = '',
  ): PosOrder => {
    const normalizedTableLabel = tableLabel.trim().toUpperCase()
    const normalizedFloorLabel = floorLabel.trim()
    const normalizedPartySize = Math.min(20, Math.max(1, Math.trunc(partySize)))
    const preservedNotes = noteTokensFromText(order.note).filter((token) =>
      !/^樓層\s*\S+/i.test(token) && !/^桌位\s*\S+/i.test(token) && !/^\d+\s*人$/.test(token),
    )

    return {
      ...order,
      mode: 'dine-in',
      customerName: `${normalizedFloorLabel ? `${normalizedFloorLabel} ` : ''}${normalizedTableLabel} 內用客`,
      note: [
        normalizedFloorLabel ? `樓層 ${normalizedFloorLabel}` : '',
        `桌位 ${normalizedTableLabel}`,
        `${normalizedPartySize} 人`,
        ...preservedNotes,
      ].filter(Boolean).join('、'),
    }
  }

  const partySizeFromOrderNote = (order: PosOrder): number => {
    const partyToken = noteTokensFromText(order.note).find((token) => /^\d+\s*人$/.test(token))
    const partySize = Number(partyToken?.match(/^(\d+)/)?.[1] ?? 1)
    return Number.isFinite(partySize) ? Math.min(99, Math.max(1, Math.trunc(partySize))) : 1
  }

  const noteTokenValue = (order: PosOrder, pattern: RegExp): string => {
    for (const token of noteTokensFromText(order.note)) {
      const match = token.match(pattern)
      if (match?.[1]) {
        return match[1].trim()
      }
    }

    return ''
  }

  const preservedDineInNotes = (order: PosOrder): string[] =>
    noteTokensFromText(order.note).filter((token) =>
      !/^樓層\s*\S+/i.test(token) &&
      !/^桌位\s*\S+/i.test(token) &&
      !/^\d+\s*人$/.test(token) &&
      !/^併單\s+/i.test(token) &&
      !/^已併入\s+/i.test(token),
    )

  const mergedDineInNote = (targetOrder: PosOrder, sourceOrder: PosOrder): string => {
    const targetFloor = noteTokenValue(targetOrder, /^樓層\s*(\S+)/i)
    const targetTable = noteTokenValue(targetOrder, /^桌位\s*(\S+)/i)
    const preservedNotes = [
      ...preservedDineInNotes(targetOrder),
      ...preservedDineInNotes(sourceOrder),
    ].filter((note, index, notes) => notes.indexOf(note) === index)

    return [
      targetFloor ? `樓層 ${targetFloor}` : '',
      targetTable ? `桌位 ${targetTable}` : '',
      `${partySizeFromOrderNote(targetOrder) + partySizeFromOrderNote(sourceOrder)} 人`,
      `併單 ${sourceOrder.id}`,
      ...preservedNotes,
    ].filter(Boolean).join('、').slice(0, 500)
  }

  const mergeStatus = (targetStatus: OrderStatus, sourceStatus: OrderStatus): OrderStatus => {
    if (targetStatus === 'ready' || sourceStatus === 'ready') {
      return 'ready'
    }
    if (targetStatus === 'preparing' || sourceStatus === 'preparing') {
      return 'preparing'
    }

    return 'new'
  }

  const cloneCartLine = (line: CartLine): CartLine => ({
    ...line,
    options: [...line.options],
    ...(line.comboItems ? { comboItems: line.comboItems.map((item) => ({ ...item, options: [...(item.options ?? [])] })) } : {}),
  })

  const localMergedOrder = (targetOrder: PosOrder, sourceOrder: PosOrder): PosOrder => ({
    ...targetOrder,
    lines: [...targetOrder.lines.map(cloneCartLine), ...sourceOrder.lines.map(cloneCartLine)],
    subtotal: targetOrder.subtotal + sourceOrder.subtotal,
    serviceFeeAmount: targetOrder.serviceFeeAmount + sourceOrder.serviceFeeAmount,
    extraFeeAmount: targetOrder.extraFeeAmount + sourceOrder.extraFeeAmount,
    discountAmount: targetOrder.discountAmount + sourceOrder.discountAmount,
    pointsRedeemed: targetOrder.pointsRedeemed + sourceOrder.pointsRedeemed,
    memberPointsEarned: targetOrder.memberPointsEarned + sourceOrder.memberPointsEarned,
    orderLabels: [...new Set([...targetOrder.orderLabels, ...sourceOrder.orderLabels])],
    memberId: targetOrder.memberId ?? sourceOrder.memberId,
    note: mergedDineInNote(targetOrder, sourceOrder),
    status: mergeStatus(targetOrder.status, sourceOrder.status),
    printJobs: mergePrintJobs(targetOrder, sourceOrder.printJobs),
  })

  const updateOrderFloorAssignmentForStation = async (
    orderId: string,
    tableLabel: string,
    partySize: number,
    floorLabel = '',
  ): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    const previousOrder = { ...claimedOrder, lines: [...claimedOrder.lines], printJobs: [...claimedOrder.printJobs] }
    const optimisticOrder = orderWithFloorAssignment(claimedOrder, tableLabel, partySize, floorLabel)
    replaceOrder(orderId, optimisticOrder)

    if (!isPosApiConfigured || !optimisticOrder.remoteId) {
      setBackendStatus('fallback', '本機移桌', `${orderId} 已移至 ${tableLabel}，等待 API 連線後同步`)
      return
    }

    try {
      const persistedOrder = await persistOrderFloorAssignment(optimisticOrder, {
        tableLabel,
        partySize,
        floorLabel,
      })
      replaceOrder(orderId, {
        ...persistedOrder,
        lines: persistedOrder.lines.length > 0 ? persistedOrder.lines : optimisticOrder.lines,
        printStatus: persistedOrder.printStatus === 'skipped' ? optimisticOrder.printStatus : persistedOrder.printStatus,
      })
      setBackendStatus('connected', '桌位已同步', `${orderId} 已移至 ${tableLabel}`)
      await printOrder(orderId, 'move')
    } catch (error) {
      replaceOrder(orderId, previousOrder)
      setBackendStatus('fallback', '移桌失敗', `${orderId} 移桌同步失敗：${getErrorMessage(error)}`)
    }
  }

  const mergeOrderIntoOrderForStation = async (sourceOrderId: string, targetOrderId: string): Promise<boolean> => {
    if (sourceOrderId === targetOrderId) {
      return false
    }

    const sourceOrder = orderQueue.value.find((entry) => entry.id === sourceOrderId)
    const targetOrder = orderQueue.value.find((entry) => entry.id === targetOrderId)
    if (!sourceOrder || !targetOrder) {
      return false
    }

    if (orderClaimedByOtherStation(sourceOrder) || orderClaimedByOtherStation(targetOrder)) {
      const lockedOrder = orderClaimedByOtherStation(sourceOrder) ? sourceOrder : targetOrder
      setBackendStatus('fallback', '訂單已鎖定', `${lockedOrder.id} 目前由 ${lockedOrder.claimedBy} 處理`)
      return false
    }

    if (sourceOrder.mode !== 'dine-in' || targetOrder.mode !== 'dine-in') {
      setBackendStatus('fallback', '併單失敗', '只有內用桌位訂單可以併單')
      return false
    }

    const previousSource = { ...sourceOrder, lines: sourceOrder.lines.map(cloneCartLine), printJobs: [...sourceOrder.printJobs] }
    const previousTarget = { ...targetOrder, lines: targetOrder.lines.map(cloneCartLine), printJobs: [...targetOrder.printJobs] }
    const optimisticOrder = localMergedOrder(targetOrder, sourceOrder)
    replaceOrder(targetOrderId, optimisticOrder)
    removeOrderFromQueue(sourceOrderId)

    if (!isPosApiConfigured || !sourceOrder.remoteId || !targetOrder.remoteId) {
      setBackendStatus('fallback', '本機併單', `${sourceOrderId} 已併入 ${targetOrderId}，等待 API 連線後同步`)
      return true
    }

    try {
      const persistedOrder = await mergeOrderIntoOrder(sourceOrder, targetOrder)
      replaceOrder(targetOrderId, {
        ...persistedOrder,
        printStatus: persistedOrder.printStatus === 'skipped' ? optimisticOrder.printStatus : persistedOrder.printStatus,
      })
      setBackendStatus('connected', '併單已同步', `${sourceOrderId} 已併入 ${targetOrderId}`)
      void loadRegisterSession()
      await printOrder(persistedOrder.id, 'merge')
      return true
    } catch (error) {
      orderQueue.value = [
        previousSource,
        ...orderQueue.value.filter((order) => order.id !== previousSource.id),
      ].map((order) => (order.id === previousTarget.id ? previousTarget : order))
      replaceOrder(previousTarget.id, previousTarget)
      setBackendStatus('fallback', '併單失敗', `${sourceOrderId} 併入 ${targetOrderId} 失敗：${getErrorMessage(error)}`)
      return false
    }
  }

  const voidOrderForStation = async (orderId: string, note = ''): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (order.paymentStatus !== 'pending') {
      setBackendStatus('fallback', '不可作廢', `${order.id} 已收款，需先接退款流程`)
      return
    }

    if (order.status === 'served' || order.status === 'voided') {
      setBackendStatus('fallback', '不可作廢', `${order.id} 已交付或已作廢`)
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    voidingOrderId.value = orderId

    try {
      const voidedOrder = await voidOrder(claimedOrder, note)
      replaceOrder(orderId, {
        ...voidedOrder,
        lines: voidedOrder.lines.length > 0 ? voidedOrder.lines : claimedOrder.lines,
        printStatus: voidedOrder.printStatus === 'skipped' ? claimedOrder.printStatus : voidedOrder.printStatus,
      })
      setBackendStatus('connected', '訂單已作廢', `${orderId} 已排除關帳統計`)
      void loadRegisterSession()
    } catch (error) {
      setBackendStatus('fallback', '作廢失敗', `${orderId} 作廢失敗：${getErrorMessage(error)}`)
    } finally {
      voidingOrderId.value = null
    }
  }

  const refundOrderForStation = async (orderId: string, note = ''): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (!['authorized', 'paid'].includes(order.paymentStatus)) {
      setBackendStatus('fallback', '不可退款', `${order.id} 尚未收款或已處理退款`)
      return
    }

    if (order.status === 'failed' || order.status === 'voided') {
      setBackendStatus('fallback', '不可退款', `${order.id} 已異常或已作廢`)
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    refundingOrderId.value = orderId

    try {
      const refundedOrder = await refundOrder(claimedOrder, note)
      replaceOrder(orderId, {
        ...refundedOrder,
        lines: refundedOrder.lines.length > 0 ? refundedOrder.lines : claimedOrder.lines,
        printStatus: refundedOrder.printStatus === 'skipped' ? claimedOrder.printStatus : refundedOrder.printStatus,
      })
      setBackendStatus('connected', '訂單已退款', `${orderId} 已建立退款流水並排除銷售`)
      void loadRegisterSession()
    } catch (error) {
      setBackendStatus('fallback', '退款失敗', `${orderId} 退款失敗：${getErrorMessage(error)}`)
    } finally {
      refundingOrderId.value = null
    }
  }

  const printOrder = async (orderId: string, timing: PrintRuleTiming | null = null): Promise<void> => {
    if (printingOrderId.value) {
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }
    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }
    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    printingOrderId.value = orderId
    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    const printTiming = timing ?? (claimedOrder.printJobs.length > 0 ? 'reprint' : 'order')
    const printPlan = buildOrderPrintPlan(claimedOrder, currentPrinterSettings(), { timing: printTiming })
    lastPrintPreview.value = printPlan.preview

    if (printPlan.jobs.length === 0) {
      if (printTiming === 'order' || printTiming === 'reprint') {
        const nextOrder = { ...claimedOrder, printStatus: 'skipped' as const }
        replaceOrder(order.id, nextOrder)
      }
      setBackendStatus('connected', '出單略過', printPlan.skippedReason ?? '沒有建立列印任務')
      printingOrderId.value = null
      return
    }

    printStation.lastPrintAt = new Date().toISOString()
    const printStatuses: PrintStatus[] = []
    const createdPrintJobs: PrintJob[] = []

    try {
      for (const job of printPlan.jobs) {
        let jobStatus: PrintStatus = 'queued'
        let printJobId: string | null = null

        if (isPosApiConfigured && order.remoteId) {
          const printJob = await createPrintJob(claimedOrder, job.payload, job.station)
          jobStatus = printJob.status
          printJobId = printJob.id
          createdPrintJobs.push(printJob)
        }

        if (isNativeLanPrinterAvailable()) {
          const printResult = await tryNativeLanPrint(job.payload, job.station)
          jobStatus = printResult.ok ? 'printed' : 'failed'

          if (printJobId) {
            const updatedPrintJob = await updatePrintJobStatus(
              printJobId,
              printResult.ok ? 'printed' : 'failed',
              printResult.ok ? undefined : printResult.error,
            )
            jobStatus = updatedPrintJob.status
            createdPrintJobs.push(updatedPrintJob)
          }
        }

        printStatuses.push(jobStatus)
      }

      const nextPrintStatus = summarizePrintStatuses(printStatuses)
      replaceOrder(order.id, {
        ...claimedOrder,
        printStatus: nextPrintStatus,
        printJobs: mergePrintJobs(claimedOrder, createdPrintJobs),
      })

      if (!isNativeLanPrinterAvailable()) {
        appendPrintPreviewStatus(`STATUS ${lanPrinterModeLabel()}，已準備 ${printPlan.jobs.length} 筆出單資料`)
      }

      setBackendStatus(
        'connected',
        '出單完成',
        nextPrintStatus === 'printed'
          ? `${order.id} 已完成 ${printPlan.jobs.length} 筆列印`
          : `${order.id} 出單狀態：${nextPrintStatus}`,
      )
    } catch (error) {
      replaceOrder(order.id, {
        ...claimedOrder,
        printStatus: 'failed',
        printJobs: mergePrintJobs(claimedOrder, createdPrintJobs),
      })
      setBackendStatus('fallback', '出單失敗', `${order.id} 出單失敗：${getErrorMessage(error)}`)
    } finally {
      printingOrderId.value = null
    }
  }

  const printManualOrderPayload = async (
    orderId: string,
    buildPayload: (order: PosOrder, station: PrintStation) => string,
    label: string,
    options: { stationId?: string } = {},
  ): Promise<void> => {
    if (printingOrderId.value) {
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    const claimed = await claimOrderForStation(orderId)
    if (!claimed) {
      return
    }

    printingOrderId.value = orderId
    const claimedOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    const station = manualPrintStationFor(options.stationId)
    const payload = buildPayload(claimedOrder, station)
    lastPrintPreview.value = [`JOB ${label}`, `ORDER ${claimedOrder.id}`, `PRINTER ${station.name}`, payload].join('\n')
    if (!station.id || station.id === printStation.id) {
      printStation.lastPrintAt = new Date().toISOString()
    }

    const createdPrintJobs: PrintJob[] = []
    let jobStatus: PrintStatus = 'queued'
    let printJobId: string | null = null

    try {
      if (isPosApiConfigured && claimedOrder.remoteId) {
        const printJob = await createPrintJob(claimedOrder, payload, {
          ...station,
          name: `${station.name} ${label}`,
        })
        jobStatus = printJob.status
        printJobId = printJob.id
        createdPrintJobs.push(printJob)
      }

      if (isNativeLanPrinterAvailable()) {
        const printResult = await tryNativeLanPrint(payload, station)
        jobStatus = printResult.ok ? 'printed' : 'failed'

        if (printJobId) {
          const updatedPrintJob = await updatePrintJobStatus(
            printJobId,
            printResult.ok ? 'printed' : 'failed',
            printResult.ok ? undefined : printResult.error,
          )
          jobStatus = updatedPrintJob.status
          createdPrintJobs.push(updatedPrintJob)
        }
      }

      replaceOrder(order.id, {
        ...claimedOrder,
        printStatus: summarizePrintStatuses([jobStatus]),
        printJobs: mergePrintJobs(claimedOrder, createdPrintJobs),
      })

      if (!isNativeLanPrinterAvailable()) {
        appendPrintPreviewStatus(`STATUS ${lanPrinterModeLabel()}，已準備 ${label}`)
      }

      setBackendStatus('connected', `${label}已送出`, `${claimedOrder.id} ${label}狀態：${jobStatus}`)
    } catch (error) {
      replaceOrder(order.id, {
        ...claimedOrder,
        printStatus: 'failed',
        printJobs: mergePrintJobs(claimedOrder, createdPrintJobs),
      })
      setBackendStatus('fallback', `${label}失敗`, `${claimedOrder.id} ${label}失敗：${getErrorMessage(error)}`)
    } finally {
      printingOrderId.value = null
    }
  }

  const printOrderQrCode = (
    orderId: string,
    options: { stationId?: string; logoText?: string } = {},
  ): Promise<void> => {
    const payloadOptions = options.logoText ? { logoText: options.logoText } : {}
    const printOptions = options.stationId ? { stationId: options.stationId } : {}

    return printManualOrderPayload(
      orderId,
      (order, station) => buildOrderQrCodePayload(order, station, payloadOptions),
      '訂單 QR Code',
      printOptions,
    )
  }

  const printCustomerReceipt = (orderId: string): Promise<void> =>
    printManualOrderPayload(orderId, buildCustomerReceiptPayload, '顧客聯')

  const printTransactionDetail = (orderId: string): Promise<void> =>
    printManualOrderPayload(orderId, buildTransactionDetailPayload, '交易明細')

  const deletePrintJobForOrder = async (orderId: string, printJobId: string): Promise<void> => {
    if (deletingPrintJobId.value) {
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    deletingPrintJobId.value = printJobId

    try {
      if (isPosApiConfigured && order.remoteId) {
        await deletePrintJob(printJobId)
      }

      const currentOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
      const nextPrintJobs = currentOrder.printJobs.filter((printJob) => printJob.id !== printJobId)
      replaceOrder(order.id, {
        ...currentOrder,
        printJobs: nextPrintJobs,
        printStatus: summarizePrintJobs(nextPrintJobs),
      })
      setBackendStatus('connected', '列印單已刪除', `${order.id} 已移除 1 筆列印單`)
    } catch (error) {
      setBackendStatus('fallback', '列印單刪除失敗', `${order.id} 刪除失敗：${getErrorMessage(error)}`)
    } finally {
      deletingPrintJobId.value = null
    }
  }

  const loadProductStatusCatalog = async (): Promise<void> => {
    isLoadingProductStatus.value = true
    productStatusMessage.value = '載入完整商品狀態中'

    try {
      const products = await fetchAdminProducts()
      writeLocalProducts([])
      productStatusCatalog.value = sortProducts(products.filter((product) => product.posVisible))
      productStatusMessage.value = `已載入 ${productStatusCatalog.value.length} 個 POS 商品，可直接暫停或恢復供應`
    } catch (error) {
      productStatusMessage.value = `商品狀態載入失敗：${getErrorMessage(error)}`
    } finally {
      isLoadingProductStatus.value = false
    }
  }

  const updateProductAvailability = async (
    productId: string,
    isAvailable: boolean,
  ): Promise<void> => {
    const product = productStatusCatalog.value.find((entry) => entry.id === productId)
      ?? menuCatalog.value.find((entry) => entry.id === productId)
    if (!product) {
      productStatusMessage.value = '找不到商品資料，請重新載入'
      return
    }

    togglingProductId.value = productId
    const optimisticProduct = { ...product, available: isAvailable }
    applySavedProduct(optimisticProduct)
    productStatusMessage.value = `${product.name} ${isAvailable ? '恢復供應中' : '暫停供應中'}`

    try {
      const savedProduct = await updateProduct(productId, productToUpdateInput(product, { isAvailable }))
      applySavedProduct(savedProduct)
      productStatusMessage.value = `${savedProduct.name} 已${savedProduct.available ? '恢復供應' : '暫停供應'}`
      setBackendStatus('connected', 'API 已同步', productStatusMessage.value)
    } catch (error) {
      applySavedProduct(product)
      productStatusMessage.value = `商品狀態更新失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '本機模式', productStatusMessage.value)
    } finally {
      togglingProductId.value = null
    }
  }

  const updateProductSupplyStatus = async (
    productId: string,
    status: ProductSupplyStatus,
  ): Promise<boolean> => {
    const product = productStatusCatalog.value.find((entry) => entry.id === productId)
      ?? menuCatalog.value.find((entry) => entry.id === productId)
    if (!product) {
      productStatusMessage.value = '找不到商品資料，請重新載入'
      return false
    }

    const statusLabel = status === 'normal' ? '正常供應' : status === 'online-stopped' ? '線上停售' : '全部停售'
    togglingProductId.value = productId
    productStatusMessage.value = `${product.name} 更新為${statusLabel}中`

    if (!isPosApiConfigured) {
      togglingProductId.value = null
      productStatusMessage.value = `${product.name} 已暫存本機；需連線 POS API 才會寫入資料庫`
      setBackendStatus('fallback', '供應狀態未同步', productStatusMessage.value)
      return false
    }

    try {
      const savedProduct = await updateProduct(productId, productToUpdateInput(product, productSupplyOverrides(status)))
      applySavedProduct(savedProduct)
      productStatusMessage.value = `${savedProduct.name} 已更新為${statusLabel}`
      setBackendStatus('connected', 'API 已同步', productStatusMessage.value)
      return true
    } catch (error) {
      productStatusMessage.value = `商品狀態更新失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '供應狀態未同步', productStatusMessage.value)
      return false
    } finally {
      togglingProductId.value = null
    }
  }

  const reorderProductsForStation = async (orderedProductIds: string[]): Promise<boolean> => {
    const productMap = new Map(
      [...productStatusCatalog.value, ...menuCatalog.value].map((product) => [product.id, product]),
    )
    const orderedProducts = orderedProductIds
      .map((productId) => productMap.get(productId))
      .filter((product): product is MenuItem => Boolean(product))

    if (orderedProducts.length < 2) {
      return true
    }

    const category = orderedProducts[0]?.category
    if (!category || orderedProducts.some((product) => product.category !== category)) {
      productStatusMessage.value = '只能在同一分類內調整商品順序'
      return false
    }

    const previousProducts = orderedProducts.map((product) => ({ ...product, tags: [...product.tags] }))
    const reorderedProducts = orderedProducts.map((product, index) => ({
      ...product,
      sortOrder: (index + 1) * 10,
    }))
    const changedProducts = reorderedProducts.filter((product, index) =>
      product.sortOrder !== previousProducts[index]?.sortOrder,
    )

    if (changedProducts.length === 0) {
      return true
    }

    for (const product of reorderedProducts) {
      applySavedProduct(product)
    }
    productStatusMessage.value = `${category} 商品順序更新中`

    if (!isPosApiConfigured) {
      productStatusMessage.value = '商品順序已暫存在本機；需連線 POS API 才會寫入資料庫'
      setBackendStatus('fallback', '商品排序未同步', productStatusMessage.value)
      return false
    }

    try {
      const savedProducts = await Promise.all(
        changedProducts.map((product) =>
          isLocalProduct(product) ? Promise.resolve(product) : updateProduct(product.id, productToUpdateInput(product)),
        ),
      )
      for (const product of savedProducts) {
        applySavedProduct(product)
      }
      productStatusMessage.value = '商品順序已寫入資料庫'
      setBackendStatus('connected', '商品排序已同步', productStatusMessage.value)
      return true
    } catch (error) {
      for (const product of previousProducts) {
        applySavedProduct(product)
      }
      productStatusMessage.value = `商品順序更新失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '商品排序失敗', productStatusMessage.value)
      return false
    }
  }

  const createProductForStation = async (
    input: ProductUpdateInput,
  ): Promise<MenuItem | null> => {
    const fallbackProduct = buildLocalProduct(input)
    productStatusMessage.value = `${fallbackProduct.name} 建立中`

    if (!isPosApiConfigured) {
      productStatusMessage.value = `${fallbackProduct.name} 未新增：需連線 POS API 才會寫入資料庫`
      setBackendStatus('fallback', '商品未同步', productStatusMessage.value)
      return null
    }

    try {
      const savedProduct = await createProduct(input)
      applySavedProduct(savedProduct)
      productStatusMessage.value = `${savedProduct.name} 已新增`
      setBackendStatus('connected', 'API 已同步', productStatusMessage.value)
      return savedProduct
    } catch (error) {
      productStatusMessage.value = `商品新增失敗，未寫入資料庫：${getErrorMessage(error)}`
      setBackendStatus('fallback', '商品新增失敗', productStatusMessage.value)
      return null
    }
  }

  const deleteProductForStation = async (productId: string): Promise<boolean> => {
    const product = productStatusCatalog.value.find((entry) => entry.id === productId)
      ?? menuCatalog.value.find((entry) => entry.id === productId)
    if (!product) {
      productStatusMessage.value = '找不到商品資料，請重新載入'
      return false
    }

    togglingProductId.value = productId
    productStatusMessage.value = `${product.name} 刪除中`

    if (product.id.startsWith('local-')) {
      removeSavedProduct(productId)
      togglingProductId.value = null
      productStatusMessage.value = `${product.name} 已從本機清單刪除`
      setBackendStatus('fallback', '本機商品已刪除', '此品項原本尚未寫入資料庫')
      return true
    }

    if (!isPosApiConfigured) {
      togglingProductId.value = null
      productStatusMessage.value = `${product.name} 未刪除：需連線 POS API 才會更新資料庫`
      setBackendStatus('fallback', '商品未同步', productStatusMessage.value)
      return false
    }

    try {
      await deleteProduct(productId)
      removeSavedProduct(productId)
      productStatusMessage.value = `${product.name} 已刪除`
      setBackendStatus('connected', 'API 已同步', productStatusMessage.value)
      return true
    } catch (error) {
      productStatusMessage.value = `商品刪除失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '本機模式', productStatusMessage.value)
      return false
    } finally {
      togglingProductId.value = null
    }
  }

  const readRegisterCashAmount = (value: number): number | null => {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return null
    }

    return value
  }

  const loadRegisterSession = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      registerMessage.value = '本機模式未啟用雲端開班資料'
      return
    }

    try {
      applyRegisterSession(await fetchCurrentRegisterSession())
      registerMessage.value = registerSession.value
        ? `已載入${registerSession.value.status === 'open' ? '營業中' : '已關班'}班別`
        : '尚未開班'
    } catch (error) {
      registerMessage.value = `開班資料載入失敗：${getErrorMessage(error)}`
    }
  }

  const openRegisterSessionForStation = async (
    openingCashValue: number,
    note: string,
  ): Promise<void> => {
    const openingCash = readRegisterCashAmount(openingCashValue)
    if (openingCash === null) {
      registerMessage.value = '開班現金需為 0 以上整數'
      return
    }

    if (!isPosApiConfigured) {
      registerMessage.value = '本機模式無法建立雲端班別'
      return
    }

    isRegisterBusy.value = true
    registerMessage.value = '開班中'

    try {
      const session = await openRegisterSession(openingCash, note)
      applyRegisterSession(session)
      registerMessage.value = `已開班，預期現金 ${session.expectedCash}`
      setBackendStatus('connected', '班別已開啟', `${stationClaimLabel} 已開班`)
    } catch (error) {
      registerMessage.value = `開班失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '開班失敗', registerMessage.value)
    } finally {
      isRegisterBusy.value = false
    }
  }

  const closeRegisterSessionForStation = async (
    closingCashValue: number,
    note: string,
    force = false,
    staffCode = '',
  ): Promise<void> => {
    const closingCash = readRegisterCashAmount(closingCashValue)
    if (closingCash === null) {
      registerMessage.value = '關班現金需為 0 以上整數'
      return
    }

    const normalizedStaffCode = staffCode.trim().replace(/\s+/g, '')
    if (!normalizedStaffCode) {
      registerMessage.value = '請輸入員工識別碼'
      return
    }

    if (!isPosApiConfigured) {
      registerMessage.value = '本機模式無法關閉雲端班別'
      return
    }

    isRegisterBusy.value = true
    registerMessage.value = '關班結算中'

    try {
      const session = await closeRegisterSession(closingCash, note, force, normalizedStaffCode)
      applyRegisterSession(session)
      const variance = closingCash - session.expectedCash
      registerMessage.value = `已關班，現金差額 ${variance}`
      setBackendStatus('connected', '班別已關閉', `${stationClaimLabel} 已完成關班`)
    } catch (error) {
      registerMessage.value = `關班失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '關班失敗', registerMessage.value)
    } finally {
      isRegisterBusy.value = false
    }
  }

  const createRegisterCashAdjustmentForStation = async (
    kind: RegisterCashAdjustmentKind,
    amountValue: number,
    reason: string,
    note: string,
  ): Promise<boolean> => {
    const amount = readRegisterCashAmount(amountValue)
    if (amount === null || amount <= 0) {
      registerMessage.value = '現金異動金額需為 1 以上整數'
      return false
    }

    const normalizedReason = reason.trim()
    if (!normalizedReason) {
      registerMessage.value = '請輸入現金異動原因'
      return false
    }

    if (!registerSession.value || registerSession.value.status !== 'open') {
      registerMessage.value = '需先開班才能登記現金臨時收支'
      return false
    }

    if (!isPosApiConfigured) {
      registerMessage.value = '本機模式無法同步現金臨時收支'
      return false
    }

    isRegisterBusy.value = true
    registerMessage.value = kind === 'income' ? '登記臨時收入中' : '登記臨時支出中'

    try {
      const session = await createRegisterCashAdjustment(kind, amount, normalizedReason, note.trim())
      applyRegisterSession(session)
      registerMessage.value = `${kind === 'income' ? '臨時收入' : '臨時支出'}已登記 ${amount}`
      setBackendStatus('connected', '現金異動已同步', `${stationClaimLabel} 已更新班別現金`)
      return true
    } catch (error) {
      registerMessage.value = `現金異動失敗：${getErrorMessage(error)}`
      setBackendStatus('fallback', '現金異動失敗', registerMessage.value)
      return false
    } finally {
      isRegisterBusy.value = false
    }
  }

  const buildCounterOrderFromDraft = (now: Date): PosOrder => {
    const existingOrder = counterDraftOrderId.value
      ? orderQueue.value.find((order) => order.id === counterDraftOrderId.value)
      : null
    const draftOrderId = counterDraftOrderId.value
    const orderId = existingOrder?.id ?? draftOrderId ?? buildOrderId(now, nextSequence.value)
    const createdAt = existingOrder?.createdAt ?? counterDraftStartedAt.value ?? now.toISOString()
    const paymentStatus = existingOrder && !['pending', 'authorized'].includes(existingOrder.paymentStatus)
      ? existingOrder.paymentStatus
      : paymentStatusFor(paymentMethod.value)
    const electronicInvoiceRequested = engagementSettings.value.electronicInvoice.enabled && invoiceRequestedFromDraft(customer)
    const electronicInvoicePrintMode = electronicInvoiceRequested ? invoicePrintModeFromDraft(customer) : 'none'

    return {
      ...(existingOrder ?? {}),
      id: orderId,
      source: 'counter',
      mode: serviceMode.value,
      customerName: customer.name.trim() || '現場客',
      customerPhone: customer.phone.trim(),
      deliveryAddress: serviceMode.value === 'delivery' ? customer.deliveryAddress.trim() : '',
      requestedFulfillmentAt: toRequestedFulfillmentIso(customer.requestedFulfillmentAt),
      taxId: normalizeTaxId(customer.taxId),
      invoiceCarrierBarcode: normalizeInvoiceCarrierBarcode(customer.invoiceCarrierBarcode),
      invoiceDonationCode: normalizeInvoiceDonationCode(customer.invoiceDonationCode),
      electronicInvoiceRequested,
      electronicInvoiceStatus: existingOrder?.electronicInvoiceStatus && existingOrder.electronicInvoiceStatus !== 'not_requested'
        ? existingOrder.electronicInvoiceStatus
        : electronicInvoiceStatusFor(electronicInvoiceRequested, paymentStatus),
      electronicInvoicePrintMode,
      electronicInvoiceNumber: existingOrder?.electronicInvoiceNumber ?? '',
      electronicInvoiceRandomCode: existingOrder?.electronicInvoiceRandomCode ?? '',
      electronicInvoiceIssuedAt: existingOrder?.electronicInvoiceIssuedAt ?? null,
      electronicInvoiceVoidedAt: existingOrder?.electronicInvoiceVoidedAt ?? null,
      electronicInvoiceUploadDueAt: existingOrder?.electronicInvoiceUploadDueAt ?? null,
      memberId: customer.memberId,
      note: customer.note.trim(),
      lines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
      subtotal: cartTotal.value,
      orderLabels: [...orderLabels.value],
      serviceFeeRate: Math.min(Math.max(Math.trunc(serviceFeeRate.value || 0), 0), 30),
      serviceFeeAmount: serviceFeeAmount.value,
      extraFeeAmount: Math.max(0, Math.trunc(extraFeeAmount.value || 0)),
      discountAmount: totalDiscountAmount.value,
      pointsRedeemed: effectivePointsRedeemed.value,
      couponCode: couponCode.value.trim(),
      paymentSplits: normalizePaymentSplits(paymentSplits.value),
      paymentBreakdown: normalizePaymentBreakdown(paymentBreakdown.value),
      transactionReceiptCount: Math.min(10, Math.max(0, Math.trunc(transactionReceiptCount.value || 0))),
      memberPointsEarned: memberPointsEarned.value,
      paymentMethod: paymentMethod.value,
      paymentStatus,
      status: existingOrder?.status ?? 'new',
      isDraft: existingOrder?.isDraft ?? true,
      createdAt,
      claimedBy: existingOrder?.claimedBy ?? stationClaimId,
      claimedAt: existingOrder?.claimedAt ?? now.toISOString(),
      claimExpiresAt: existingOrder?.claimExpiresAt ?? claimExpiresIn(),
      printStatus: existingOrder?.printStatus ?? 'skipped',
      printJobs: existingOrder?.printJobs ?? [],
    }
  }

  const finishCounterDraft = (): void => {
    clearCart()
    resetCustomerDraft()
    resetOrderAdjustments()
    clearCounterDraftIdentity()
  }

  const saveCounterOrder = async (finish = true): Promise<PosOrder | null> => {
    if (cartLines.value.length === 0 || isSubmitting.value) {
      return null
    }

    if (serviceMode.value === 'delivery' && !customer.deliveryAddress.trim()) {
      setBackendStatus('fallback', '外送地址未填', '外送訂單需要地址，避免交付資訊只留在備註')
      return null
    }

    const invoiceError = invoiceFieldError(customer.taxId, customer.invoiceCarrierBarcode, customer.invoiceDonationCode)
    if (invoiceError) {
      setBackendStatus('fallback', '發票資訊格式錯誤', invoiceError)
      return null
    }

    isSubmitting.value = true
    const now = new Date()
    const draftOrderId = counterDraftOrderId.value
    const draftSequence = sequenceFromOrderId(draftOrderId)
    const existingOrder = draftOrderId ? orderQueue.value.find((entry) => entry.id === draftOrderId) : null
    const order = buildCounterOrderFromDraft(now)
    const printPlan = buildOrderPrintPlan(order, currentPrinterSettings(), { timing: 'order' })
    order.printStatus = printPlan.jobs.length > 0 ? 'queued' : 'skipped'

    if (draftOrderId || existingOrder) {
      nextSequence.value = Math.max(nextSequence.value, draftSequence + 1)
    } else {
      nextSequence.value += 1
    }
    if (existingOrder) {
      replaceOrder(existingOrder.id, order)
    } else {
      orderQueue.value.unshift(order)
    }
    lastPrintPreview.value = printPlan.preview

    if (!isPosApiConfigured) {
      rememberPendingLocalOrder(order)
      if (printPlan.jobs.length > 0) {
        appendPrintPreviewStatus('STATUS 本機模式已產生列印 payload，尚未建立雲端 print_jobs')
      }
      setBackendStatus('fallback', '本機待同步', `${order.id} 已保留在平板，待 POS API 恢復後補同步`)
      if (finish) {
        finishCounterDraft()
      }
      isSubmitting.value = false
      return order
    }

    if (order.remoteId && !order.isDraft) {
      replaceOrder(order.id, order)
      setBackendStatus('connected', '訂單已更新', `${order.id} 已更新購物車內容`)
      if (finish) {
        finishCounterDraft()
      }
      isSubmitting.value = false
      return order
    }

    try {
      if (counterDraftSyncTimer !== null) {
        globalThis.clearTimeout(counterDraftSyncTimer)
        counterDraftSyncTimer = null
      }

      const persistedOrder = order.remoteId && order.isDraft
        ? await finalizeCounterDraftOrder(order)
        : await createOrder(order)
      let nextOrder: PosOrder = {
        ...order,
        createdAt: persistedOrder.createdAt,
        lines: persistedOrder.lines.length > 0 ? mergeComboItemsIntoRemoteLines(persistedOrder.lines, order.lines) : order.lines,
        isDraft: false,
      }

      if (persistedOrder.remoteId) {
        nextOrder.remoteId = persistedOrder.remoteId
      }

      let backendDetail = `${order.id} 已建立，${printPlan.jobs.length > 0 ? '可立即出單' : printPlan.skippedReason ?? '未建立列印任務'}`
      let claimSucceeded = true

      try {
        const claimedOrder = await claimOrder(nextOrder)
        nextOrder = {
          ...claimedOrder,
          lines: claimedOrder.lines.length > 0 ? mergeComboItemsIntoRemoteLines(claimedOrder.lines, nextOrder.lines) : nextOrder.lines,
          printStatus: claimedOrder.printStatus === 'skipped' ? nextOrder.printStatus : claimedOrder.printStatus,
        }
      } catch (error) {
        claimSucceeded = false
        backendDetail = `${order.id} 已建立，但平板鎖定失敗：${getErrorMessage(error)}`
      }

      replaceOrder(order.id, nextOrder)
      pendingLocalOrders.value = pendingLocalOrders.value.filter((entry) => entry.id !== order.id)
      writePendingLocalOrders(pendingLocalOrders.value)
      removeLocalCounterOrder(order.id)

      if (!claimSucceeded) {
        backendDetail = `${backendDetail}，但尚未取得平板鎖定`
      }

      setBackendStatus('connected', 'API 已同步', `${backendDetail}${pendingLocalOrderDetail()}`)
      void loadRegisterSession()
      void refreshProductCatalog()
      if (finish) {
        finishCounterDraft()
      }
      return nextOrder
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      if (isInventoryError(errorMessage)) {
        if (!existingOrder) {
          orderQueue.value = orderQueue.value.filter((entry) => entry.id !== order.id)
          if (!draftOrderId) {
            nextSequence.value = Math.max(1, nextSequence.value - 1)
          }
        }
        setBackendStatus('fallback', '庫存不足', `訂單未建立：${errorMessage}`)
        void refreshProductCatalog()
        return null
      }

      if (isCouponRedemptionError(errorMessage)) {
        if (existingOrder) {
          replaceOrder(existingOrder.id, existingOrder)
        } else {
          orderQueue.value = orderQueue.value.filter((entry) => entry.id !== order.id)
          if (!draftOrderId) {
            nextSequence.value = Math.max(1, nextSequence.value - 1)
          }
        }
        customer.availableCoupons = customer.availableCoupons.filter((coupon) => coupon.code !== couponCode.value.trim())
        couponCode.value = ''
        setBackendStatus('fallback', '優惠券不可用', `訂單未建立：${errorMessage}`)
        return null
      }

      rememberPendingLocalOrder(order)
      setBackendStatus('fallback', '本機模式', `訂單保留在本機，雲端同步失敗：${errorMessage}`)
      if (finish) {
        finishCounterDraft()
      }
      return order
    } finally {
      isSubmitting.value = false
    }
  }

  const submitCounterOrder = async (): Promise<PosOrder | null> => {
    const order = await saveCounterOrder()
    if (!order) {
      return null
    }

    await printOrder(order.id, 'order')
    return orderQueue.value.find((entry) => entry.id === order.id) ?? order
  }

  const loadCounterOrderForEditing = async (orderId: string): Promise<boolean> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (
      !order ||
      order.source !== 'counter' ||
      !['pending', 'authorized'].includes(order.paymentStatus) ||
      ['served', 'voided', 'failed'].includes(order.status)
    ) {
      return false
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return false
    }

    const claimed = await claimOrderForStation(order.id)
    if (!claimed) {
      return false
    }

    const editableOrder = orderQueue.value.find((entry) => entry.id === orderId) ?? order
    serviceMode.value = editableOrder.mode
    paymentMethod.value = editableOrder.paymentMethod
    orderLabels.value = [...editableOrder.orderLabels]
    serviceFeeRate.value = editableOrder.serviceFeeRate
    extraFeeAmount.value = editableOrder.extraFeeAmount
    discountAmount.value = editableOrder.discountAmount
    pointsRedeemed.value = editableOrder.pointsRedeemed
    couponCode.value = editableOrder.couponCode
    paymentSplits.value = normalizePaymentSplits(editableOrder.paymentSplits)
    paymentBreakdown.value = normalizePaymentBreakdown(editableOrder.paymentBreakdown)
    transactionReceiptCount.value = Math.min(10, Math.max(0, Math.trunc(editableOrder.transactionReceiptCount || 0)))
    customer.memberId = editableOrder.memberId
    customer.name = editableOrder.customerName || '現場客'
    customer.phone = editableOrder.customerPhone
    customer.customerType = customer.memberId ? customer.customerType : '一般顧客'
    customer.deliveryAddress = editableOrder.deliveryAddress
    customer.requestedFulfillmentAt = toDatetimeLocalInputValue(editableOrder.requestedFulfillmentAt)
    customer.taxId = editableOrder.taxId
    customer.invoiceCarrierBarcode = editableOrder.invoiceCarrierBarcode
    customer.invoiceDonationCode = editableOrder.invoiceDonationCode
    customer.electronicInvoiceRequested = editableOrder.electronicInvoiceRequested
    customer.electronicInvoicePrintMode = editableOrder.electronicInvoicePrintMode
    customer.note = editableOrder.note
    cartLines.value = editableOrder.lines.map((line) => ({ ...line, options: [...line.options] }))
    counterDraftOrderId.value = editableOrder.id
    counterDraftStartedAt.value = editableOrder.createdAt

    if (!editableOrder.remoteId) {
      rememberLocalCounterOrder(editableOrder)
    }

    setBackendStatus('connected', '訂單編輯中', `${editableOrder.id} 已載入購物車`)
    return true
  }

  const rememberDismissedQueueOrder = (order: PosOrder): void => {
    const key = queueDismissalKeyFor(order)
    if (dismissedQueueOrderKeys.value.includes(key)) {
      return
    }

    dismissedQueueOrderKeys.value = [...dismissedQueueOrderKeys.value, key].slice(-200)
    writeDismissedQueueOrderKeys(dismissedQueueOrderKeys.value)
  }

  const removeOrderFromQueue = (orderId: string): void => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (order) {
      rememberDismissedQueueOrder(order)
    }

    orderQueue.value = orderQueue.value.filter((order) => order.id !== orderId)
    clearCounterOrderFromLocalStores(orderId)

    if (counterDraftOrderId.value === orderId) {
      clearCart()
      resetCustomerDraft()
      clearCounterDraftIdentity()
    }
  }

  const deleteOrderFromQueue = async (orderId: string): Promise<void> => {
    if (voidingOrderId.value) {
      return
    }

    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }

    if (orderClaimedByOtherStation(order)) {
      setBackendStatus('fallback', '訂單已鎖定', `${order.id} 目前由 ${order.claimedBy} 處理`)
      return
    }

    voidingOrderId.value = orderId

    try {
      if (isPosApiConfigured && order.remoteId) {
        await persistOrderStatus(order, 'voided')
      }

      removeOrderFromQueue(orderId)
      setBackendStatus('connected', '訂單已刪除', `${order.id} 已從桌況頁移除`)
      void loadRegisterSession()
    } catch (error) {
      removeOrderFromQueue(orderId)
      setBackendStatus('fallback', '本機刪除訂單', `${order.id} 已先從本機移除：${getErrorMessage(error)}`)
    } finally {
      voidingOrderId.value = null
    }
  }

  const sendPrinterHealthcheck = async (): Promise<void> => {
    const now = new Date()
    const payload = buildPrinterHealthcheckPayload(printStation, now)
    lastPrintPreview.value = buildPrinterHealthcheckPreview(printStation, payload)
    const result = await tryNativeLanPrint(payload, printStation)
    if (result.ok) {
      printStation.online = true
      printStation.lastPrintAt = now.toISOString()
    }
  }

  const syncStationHeartbeat = async (): Promise<void> => {
    if (!isPosApiConfigured) {
      stationHeartbeatMessage.value = '本機模式未回報平板在線狀態'
      return
    }

    try {
      const station = await sendStationHeartbeat()
      stationHeartbeatMessage.value = `${station.stationLabel} 在線`
    } catch (error) {
      stationHeartbeatMessage.value = `平板心跳失敗：${getErrorMessage(error)}`
    }
  }

  const handleVisibilitySync = (): void => {
    const visible = isDocumentActive()
    if (visible && isPosApiConfigured) {
      onlineReminderStateHydrated.value = false
    }
    setOnlineOrderNotifierAppActive(visible)
    syncOnlineReminderNotifier()

    if (visible) {
      void refreshForegroundReminderState()
      void syncStationHeartbeat()
    }
  }

  const refreshForegroundReminderState = async (): Promise<void> => {
    onlineReminderClock.value = Date.now()

    try {
      await refreshQueueState(true)
      if (isPosApiConfigured && !onlineReminderStateHydrated.value) {
        await refreshOnlineReminderStatesForOrders()
      }
    } finally {
      if (isDocumentActive()) {
        onlineReminderClock.value = Date.now()
        syncOnlineReminderNotifier()
        if (!isPosApiConfigured || onlineReminderStateHydrated.value) {
          maybePlayOnlineOrderReminder()
        }
      }
    }
  }

  onMounted(() => {
    if (autoLoad) {
      void refreshBackendData()
      void syncStationHeartbeat()
      connectRealtime()
      syncOnlineReminderNotifier()
      queueSyncTimer = globalThis.setInterval(() => {
        void refreshQueueState(true)
      }, queueSyncIntervalMs)
      stationHeartbeatTimer = globalThis.setInterval(() => {
        void syncStationHeartbeat()
      }, stationHeartbeatIntervalMs)
      onlineReminderClockTimer = globalThis.setInterval(() => {
        onlineReminderClock.value = Date.now()
      }, onlineReminderClockIntervalMs)
      globalThis.document?.addEventListener('visibilitychange', handleVisibilitySync)
    }
  })

  onBeforeUnmount(() => {
    disconnectRealtime()

    if (queueSyncTimer !== null) {
      globalThis.clearInterval(queueSyncTimer)
    }

    if (stationHeartbeatTimer !== null) {
      globalThis.clearInterval(stationHeartbeatTimer)
    }

    if (onlineReminderClockTimer !== null) {
      globalThis.clearInterval(onlineReminderClockTimer)
    }

    if (counterDraftSyncTimer !== null) {
      globalThis.clearTimeout(counterDraftSyncTimer)
    }

    if (realtimeReconnectTimer !== null) {
      globalThis.clearTimeout(realtimeReconnectTimer)
    }

    if (realtimeQueueRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeQueueRefreshTimer)
    }

    if (realtimeRuntimeRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeRuntimeRefreshTimer)
    }

    if (realtimeRegisterRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeRegisterRefreshTimer)
    }

    if (realtimeProductRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeProductRefreshTimer)
    }

    if (realtimeOnlineReminderStateRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeOnlineReminderStateRefreshTimer)
    }

    if (realtimeCashDrawerRefreshTimer !== null) {
      globalThis.clearTimeout(realtimeCashDrawerRefreshTimer)
    }

    globalThis.document?.removeEventListener('visibilitychange', handleVisibilitySync)
    clearOnlineOrderNotifier()
  })

  const refreshPosData = async (): Promise<void> => {
    await refreshBackendData()
  }

  return {
    appendCustomerNote,
    applyPendingSettingsProfile,
    acknowledgeOnlineOrderReminders,
    acceptOnlineOrderForStation,
    activeOnlineReminderOrders,
    backendStatus,
    canApplySettingsProfile,
    cashDrawerEvents,
    cartLines,
    cartItemSubtotal,
    cartQuantity,
    cartProductTotalQuantity,
    cartTotalBeforePoints,
    cartTotal,
    effectivePointsRedeemed,
    availableDiscountCampaigns,
    automaticDiscountAmount,
    clearCart,
    clearCustomerMember,
    closeRegisterSessionForStation,
    counterDraftOrderId,
    counterDraftStartedAt,
    currentOnlineNotificationSettings,
    customer,
    customerHasNote,
    deletingPrintJobId,
    discountAmount,
    discountCampaignApplications,
    discountSettings,
    disabledAutomaticDiscountCampaignIds,
    selectedDiscountCampaignIds,
    accessPolicy,
    engagementSettings,
    extraFeeAmount,
    createProductForStation,
    createRegisterCashAdjustmentForStation,
    decreaseLine,
    deleteOrderFromQueue,
    deleteProductForStation,
    deletePrintJobForOrder,
    filteredMenu,
    floorPlanSettings,
    increaseLine,
    isSubmitting,
    isLoadingProductStatus,
    isRegisterBusy,
    lastPrintPreview,
    menuCatalog,
    claimLabelFor,
    claimOrderForStation,
    claimingOrderId,
    loadProductStatusCatalog,
    loadCounterOrderForEditing,
    loadCashDrawerEvents,
    loadRegisterSession,
    mergeOrderIntoOrderForStation,
    markOnlineOrderRemindersSeen,
    orderQueue,
    orderPendingSync,
    orderClaimExpired,
    orderClaimedByCurrentStation,
    orderClaimedByOtherStation,
    onlineOrderRequiresAcceptance,
    onlineOrderReminder,
    onlineOrderingSettings,
    orderLabels,
    paymentBreakdown,
    paymentMethod,
    paymentSplits,
    transactionReceiptCount,
    pendingOrders,
    posAppearanceSettings,
    pointRedemptionLimit,
    pointsRedeemed,
    memberPointsEarned,
    printCustomerReceipt,
    printTransactionDetail,
    printOrder,
    printOrderQrCode,
    printingOrderId,
    printStation,
    printerSettings,
    productStatusCatalog,
    productStatusMessage,
    quickAddItems,
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
    serviceMode,
    serviceFeeAmount,
    serviceFeeLabel,
    serviceFeeRate,
    saveCounterOrder,
    saveCurrentStationOnlineNotificationSettings,
    setItemQuantity,
    setLineQuantity,
    startCounterDraft,
    settingsProfileAppliedAt,
    settingsProfileMessage,
    settingsProfilePending,
    settingsProfilePendingSince,
    settingsProfileStatus,
    stationClaimId,
    stationClaimLabel,
    stationHeartbeatMessage,
    stationOperationMessage,
    stationOperationMode,
    stationOperationModeLabel,
    togglingProductId,
    toggleCustomerNote,
    toggleLinePrintPaused,
    toggleOrderLabel,
    toggleDiscountCampaign,
    totalDiscountAmount,
    applyCustomerMember,
    couponCode,
    unconfirmedOnlineOrders,
    updatingPaymentOrderId,
    addConfiguredItem,
    addItem,
    updateConfiguredLine,
    openRegisterSessionForStation,
    openCashDrawerForStation,
    refreshBackendData: refreshPosData,
    refreshQueueState,
    sendPrinterHealthcheck,
    submitCounterOrder,
    updateOrderStatus,
    updateOrderFloorAssignmentForStation,
    updatePaymentStatus,
    updateProductAvailability,
    updateProductSupplyStatus,
    voidingOrderId,
    voidOrderForStation,
  }
}
