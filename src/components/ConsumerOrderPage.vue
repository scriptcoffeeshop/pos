<script setup lang="ts">
import {
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Info,
  LayoutGrid,
  List,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  TicketCheck,
  Trash2,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { categoryLabels, menuItems } from '../data/menu'
import {
  calculateDiscountApplications,
  defaultDiscountSettings,
  normalizeDiscountSettings,
} from '../lib/discounts'
import { calculateDineInTimeLimitWindow } from '../lib/dineInTimeLimit'
import { formatCurrency, formatDateKey } from '../lib/formatters'
import { calculateServiceChargeAmount, serviceChargeLabel, serviceChargeRateForMode } from '../lib/serviceCharge'
import {
  createOrder,
  defaultEngagementSettings,
  defaultOnlineOrderingSettings,
  fetchProducts,
  fetchRuntimeSettings,
  isPosApiConfigured,
  normalizeEngagementSettings,
} from '../lib/posApi'
import { subscribeToPosRealtimeEvents } from '../lib/posRealtime'
import type {
  CartLine,
  ComboProductGroup,
  CustomerDraft,
  CustomerEngagementSettings,
  DiscountApplication,
  DiscountSettings,
  MenuCategory,
  MenuItem,
  OnlineMenuCategory,
  OnlineMenuOptionChoice,
  OnlineMenuOptionGroup,
  OnlineOrderingSettings,
  PaymentMethod,
  PosOrder,
  ServiceMode,
} from '../types/pos'

type CategoryFilter = 'all' | MenuCategory
type DisplayMode = 'list' | 'grid'
type OptionSelectionMap = Record<string, string[]>
type ComboSelectionMap = Record<string, Record<string, number>>
type ComboOptionSelectionMap = Record<string, Record<string, OptionSelectionMap>>

const allCategoryOption: { value: 'all'; label: string } = { value: 'all', label: '全部' }
const defaultCategoryOptions: Array<{ value: MenuCategory; label: string }> = [
  { value: 'coffee', label: categoryLabels.coffee ?? '咖啡' },
  { value: 'tea', label: categoryLabels.tea ?? '茶飲' },
  { value: 'food', label: categoryLabels.food ?? '輕食' },
  { value: 'retail', label: categoryLabels.retail ?? '零售' },
]

const serviceModeOptions: Array<{ value: ServiceMode; label: string }> = [
  { value: 'takeout', label: '自取' },
  { value: 'dine-in', label: '內用' },
  { value: 'delivery', label: '外送' },
]
const serviceModeLabels = serviceModeOptions.reduce<Record<ServiceMode, string>>(
  (labels, option) => {
    labels[option.value] = option.label
    return labels
  },
  {
    'dine-in': '內用',
    takeout: '自取',
    delivery: '外送',
  },
)

const fallbackPaymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'line-pay', label: 'LINE Pay' },
  { value: 'jkopay', label: '街口' },
  { value: 'cash', label: '取餐時付款' },
  { value: 'card', label: '線上刷卡' },
  { value: 'app91-card', label: '91APP 支付線上刷卡' },
  { value: 'transfer', label: '轉帳' },
]
const deliveryOnlinePaymentMethods = new Set<PaymentMethod>(['line-pay', 'jkopay', 'card', 'app91-card'])
const paymentAllowedForServiceMode = (method: PaymentMethod, mode: ServiceMode): boolean =>
  mode !== 'delivery' || deliveryOnlinePaymentMethods.has(method)
const urlParams = new URLSearchParams(globalThis.location?.search ?? '')
const consumerOrderSource = urlParams.get('source') === 'qr' ? 'qr' : 'online'
const qrSessionOrderId = urlParams.get('order')?.trim() ?? ''
const qrSessionStartedAt = urlParams.get('openedAt')?.trim() || urlParams.get('startedAt')?.trim() || ''
const qrFloorLabel = urlParams.get('floor')?.trim() ?? ''
const qrTableLabel = urlParams.get('table')?.trim() ?? ''
const qrTableDisplayLabel = [qrFloorLabel, qrTableLabel].filter(Boolean).join(' ')

const selectedCategory = ref<CategoryFilter>('all')
const searchTerm = ref('')
const displayMode = ref<DisplayMode>('list')
const serviceMode = ref<ServiceMode>(urlParams.get('mode') === 'dine-in' || qrTableLabel ? 'dine-in' : 'takeout')
const paymentMethod = ref<PaymentMethod>('line-pay')
const brandLogoSrc = `${import.meta.env.BASE_URL}assets/script-coffee-logo.png`
const menuCatalog = ref<MenuItem[]>([])
const onlineOrdering = ref<OnlineOrderingSettings>(defaultOnlineOrderingSettings())
const engagementSettings = ref<CustomerEngagementSettings>(defaultEngagementSettings())
const discountSettings = ref<DiscountSettings>(defaultDiscountSettings())
const cartLines = ref<CartLine[]>([])
const isLoading = ref(true)
const isSubmitting = ref(false)
const currentTime = ref(Date.now())
const storeCoverIndex = ref(0)
const storeNoticeExpanded = ref(false)
const orderMessage = ref('讀取線上菜單中')
const formError = ref('')
const lastOrder = ref<PosOrder | null>(null)
const optionPanelItem = ref<MenuItem | null>(null)
const optionSelections = ref<OptionSelectionMap>({})
const comboSelections = ref<ComboSelectionMap>({})
const comboOptionSelections = ref<ComboOptionSelectionMap>({})
const optionError = ref('')
const itemNoteDraft = ref('')
let onlineMenuSyncTimer: number | null = null
let onlineRealtimeRefreshTimer: number | null = null
let consumerClockTimer: number | null = null
let storeCoverCarouselTimer: number | null = null
let onlineRealtimeUnsubscribe: (() => void) | null = null
const customer = reactive<CustomerDraft>({
  memberId: null,
  name: '',
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

const normalizeTaxId = (value: string): string => value.replace(/\s/g, '').trim()
const normalizeInvoiceCarrierBarcode = (value: string): string => value.replace(/\s/g, '').trim().toUpperCase()
const normalizeInvoiceDonationCode = (value: string): string => value.replace(/\s/g, '').trim()
const timeToMinutes = (value: string): number => {
  const [hours = 0, minutes = 0] = value.split(':').map(Number)
  return Number.isInteger(hours) && Number.isInteger(minutes) ? hours * 60 + minutes : 0
}
const formatDatetimeLocal = (date: Date): string => {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16)
}
const invoiceFieldError = (): string | null => {
  const taxId = normalizeTaxId(customer.taxId)
  if (taxId && !/^[0-9]{8}$/.test(taxId)) {
    return '統一編號需為 8 碼數字'
  }

  const carrierBarcode = normalizeInvoiceCarrierBarcode(customer.invoiceCarrierBarcode)
  const donationCode = normalizeInvoiceDonationCode(customer.invoiceDonationCode)

  if (carrierBarcode.length > 32) {
    return '載具條碼最多 32 字元'
  }

  if (donationCode && !/^[0-9]{3,7}$/.test(donationCode)) {
    return '捐贈碼需為 3 至 7 碼數字'
  }

  if (carrierBarcode && donationCode) {
    return '載具條碼與捐贈碼只能擇一'
  }

  return null
}

const onlineFallbackMenu = (): MenuItem[] =>
  menuItems
    .filter((item) => item.available)
    .map((item) => ({
      ...item,
      onlineVisible: true,
    }))

const runtimeCategoryDefinitions = computed<OnlineMenuCategory[]>(() => {
  const definitions = new Map<MenuCategory, OnlineMenuCategory>()
  for (const category of onlineOrdering.value.menuCategories) {
    definitions.set(category.id, category)
  }

  return [...definitions.values()]
})

const categoryLabelFor = (category: MenuCategory): string =>
  runtimeCategoryDefinitions.value.find((definition) => definition.id === category)?.label ??
  defaultCategoryOptions.find((option) => option.value === category)?.label ??
  categoryLabels[category] ??
  category

const categoryOptions = computed<Array<{ value: CategoryFilter; label: string }>>(() => {
  const options = new Map<MenuCategory, { value: MenuCategory; label: string }>()

  for (const definition of runtimeCategoryDefinitions.value) {
    options.set(definition.id, {
      value: definition.id,
      label: definition.label,
    })
  }

  for (const option of defaultCategoryOptions) {
    if (!options.has(option.value) && menuCatalog.value.some((item) => item.category === option.value)) {
      options.set(option.value, option)
    }
  }

  for (const item of menuCatalog.value) {
    if (!options.has(item.category)) {
      options.set(item.category, {
        value: item.category,
        label: categoryLabelFor(item.category),
      })
    }
  }

  return [allCategoryOption, ...options.values()]
})

const itemMatchesFilter = (item: MenuItem): boolean => {
  const keyword = searchTerm.value.trim().toLowerCase()
  const matchesCategory = selectedCategory.value === 'all' || item.category === selectedCategory.value
  const matchesKeyword =
    keyword.length === 0 ||
    item.name.toLowerCase().includes(keyword) ||
    item.tags.some((tag) => tag.toLowerCase().includes(keyword))

  return isProductOrderable(item) && productVisibleForOrderSource(item) && matchesCategory && matchesKeyword
}

const filteredMenu = computed(() => menuCatalog.value.filter(itemMatchesFilter))
const menuGroups = computed(() =>
  categoryOptions.value
    .filter((category): category is { value: MenuCategory; label: string } => category.value !== 'all')
    .map((category) => ({
      ...category,
      items: menuCatalog.value.filter((item) => item.category === category.value && itemMatchesFilter(item)),
    }))
    .filter((group) => group.items.length > 0),
)

const onlineStoreProfile = computed(() => onlineOrdering.value.storeProfile)
const onlineStoreName = computed(() => onlineStoreProfile.value.name.trim() || 'Script Coffee')
const onlineStorePhone = computed(() => onlineStoreProfile.value.phone.trim())
const onlineStoreAddress = computed(() => onlineStoreProfile.value.address.trim())
const onlineStoreNotice = computed(() => onlineStoreProfile.value.notice.trim())
const onlineStoreCoverImages = computed(() =>
  onlineStoreProfile.value.coverImageDataUrls.filter((imageUrl) => imageUrl.startsWith('data:image/')).slice(0, 4),
)
const activeStoreCoverImage = computed(() => {
  const images = onlineStoreCoverImages.value
  if (images.length === 0) {
    return ''
  }

  return images[storeCoverIndex.value % images.length] ?? images[0] ?? ''
})
const storeNoticeOpen = computed(() => onlineStoreProfile.value.noticeExpanded || storeNoticeExpanded.value)

const cartQuantity = computed(() => cartLines.value.reduce((total, line) => total + line.quantity, 0))
const cartTotal = computed(() => cartLines.value.reduce((total, line) => total + line.unitPrice * line.quantity, 0))
const onlineDiscountCalculation = computed(() =>
  calculateDiscountApplications(discountSettings.value, {
    lines: cartLines.value,
    serviceMode: serviceMode.value,
    channel: 'online',
  }),
)
const onlineDiscountApplications = computed<DiscountApplication[]>(() => onlineDiscountCalculation.value.applications)
const onlineDiscountAmount = computed(() => onlineDiscountCalculation.value.total)
const onlineBenefitsRequireOnsitePayment = computed(() => onlineDiscountAmount.value > 0)
const serviceFeeLabel = computed(() => serviceChargeLabel(engagementSettings.value.serviceCharge))
const serviceFeeAmount = computed(() => calculateServiceChargeAmount(
  engagementSettings.value.serviceCharge,
  cartLines.value,
  serviceMode.value,
  onlineDiscountAmount.value,
))
const deliveryChargeableSubtotal = computed(() => Math.max(0, cartTotal.value - onlineDiscountAmount.value))
const scheduledOrderIntervalMinutes = computed(() =>
  Math.min(Math.max(Math.trunc(onlineOrdering.value.scheduledOrderIntervalMinutes || 15), 5), 120),
)
const scheduledOrderMaxDays = computed(() =>
  Math.min(Math.max(Math.trunc(onlineOrdering.value.scheduledOrderMaxDays || 1), 1), 60),
)
const deliveryMinimumSubtotal = computed(() => Math.max(0, Math.trunc(onlineOrdering.value.deliveryMinimumSubtotal || 0)))
const deliveryMinimumMet = computed(() =>
  serviceMode.value !== 'delivery' || deliveryChargeableSubtotal.value >= deliveryMinimumSubtotal.value,
)
const deliveryFeeAmount = computed(() => {
  if (serviceMode.value !== 'delivery') {
    return 0
  }

  const fee = Math.max(0, Math.trunc(onlineOrdering.value.deliveryFeeAmount || 0))
  const freeThreshold = Math.max(0, Math.trunc(onlineOrdering.value.freeDeliveryThreshold || 0))
  return freeThreshold > 0 && deliveryChargeableSubtotal.value >= freeThreshold ? 0 : fee
})
const orderTotal = computed(() => Math.max(0, cartTotal.value + serviceFeeAmount.value + deliveryFeeAmount.value - onlineDiscountAmount.value))
const deliveryFeeLabel = computed(() => {
  if (serviceMode.value !== 'delivery') {
    return ''
  }

  const freeThreshold = Math.max(0, Math.trunc(onlineOrdering.value.freeDeliveryThreshold || 0))
  if (freeThreshold > 0 && deliveryFeeAmount.value === 0) {
    return `已達 ${formatCurrency(freeThreshold)} 免運`
  }
  return freeThreshold > 0 ? `滿 ${formatCurrency(freeThreshold)} 免運` : '外送運費'
})
const requiresDeliveryAddress = computed(() => serviceMode.value === 'delivery')
const serviceModeOpen = (mode: ServiceMode): boolean => onlineOrdering.value.serviceModeAvailability[mode] !== false
const currentServiceModeOpen = computed(() => serviceModeOpen(serviceMode.value))
const isQrDineInOrder = computed(() => consumerOrderSource === 'qr' && serviceMode.value === 'dine-in')
const dineInCheckoutPostpaid = computed(() =>
  isQrDineInOrder.value && onlineOrdering.value.dineInCheckout.mode !== 'prepaid',
)
const dineInCheckoutPrepaid = computed(() =>
  isQrDineInOrder.value && onlineOrdering.value.dineInCheckout.mode === 'prepaid',
)
const requiresPaymentSelection = computed(() => !dineInCheckoutPostpaid.value)
const qrDineInTimeLimit = computed(() =>
  isQrDineInOrder.value
    ? calculateDineInTimeLimitWindow(
      onlineOrdering.value.dineInTimeLimit,
      qrSessionStartedAt,
      currentTime.value,
    )
    : null,
)
const qrDineInLastOrderBlocked = computed(() => qrDineInTimeLimit.value?.isLastOrderOver === true)
const qrDineInTimeLimitDetail = computed(() => {
  const limit = qrDineInTimeLimit.value
  if (!limit) {
    return ''
  }

  if (!limit.mealEndsAt || !limit.lastOrderAt) {
    return `${limit.ruleLabel} · 不限時`
  }

  const mealEndsAt = limit.mealEndsAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  const lastOrderAt = limit.lastOrderAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  return limit.isLastOrderOver
    ? `最後加點已截止 · 用餐至 ${mealEndsAt}`
    : `最後加點 ${lastOrderAt} · 用餐至 ${mealEndsAt}`
})
const paymentOptions = computed<Array<{ value: PaymentMethod; label: string }>>(() => {
  const configuredMethods = onlineOrdering.value.paymentMethods
  if (configuredMethods.length === 0) {
    return fallbackPaymentOptions
      .filter((method) => paymentAllowedForServiceMode(method.value, serviceMode.value))
      .filter((method) => !dineInCheckoutPrepaid.value || deliveryOnlinePaymentMethods.has(method.value))
      .filter((method) => !onlineBenefitsRequireOnsitePayment.value || method.value === 'cash')
  }

  return configuredMethods
    .filter((method) => method.enabled)
    .filter((method) => paymentAllowedForServiceMode(method.id, serviceMode.value))
    .filter((method) => !dineInCheckoutPrepaid.value || deliveryOnlinePaymentMethods.has(method.id))
    .filter((method) => !onlineBenefitsRequireOnsitePayment.value || method.id === 'cash')
    .map((method) => ({
      value: method.id,
      label: method.label.trim() || (fallbackPaymentOptions.find((fallback) => fallback.value === method.id)?.label ?? method.id),
    }))
})
const hasPaymentOptions = computed(() => !requiresPaymentSelection.value || paymentOptions.value.length > 0)
const onlineBenefitPaymentError = computed(() => {
  if (!requiresPaymentSelection.value || !onlineBenefitsRequireOnsitePayment.value || paymentOptions.value.length > 0) {
    return null
  }

  return serviceMode.value === 'delivery'
    ? '優惠活動須選擇現場付款，外送訂單目前需線上付款'
    : '優惠活動須選擇現場付款，請洽門市人員'
})
const itemNotesVisible = computed(() => onlineOrdering.value.commentFields.itemNotes !== 'hidden')
const orderNoteMode = computed(() => onlineOrdering.value.commentFields.orderNote)
const orderNoteVisible = computed(() => orderNoteMode.value !== 'hidden')
const orderNoteRequired = computed(() => orderNoteMode.value === 'required')
const orderNotePlaceholder = computed(() =>
  onlineOrdering.value.commentFields.orderNotePlaceholder.trim() || '甜度、冰量或其他需求',
)
const normalizedItemNote = computed(() => itemNoteDraft.value.trim().replace(/\s+/g, ' ').slice(0, 80))
const dineInCheckoutDetail = computed(() => {
  if (!isQrDineInOrder.value) {
    return ''
  }

  return dineInCheckoutPrepaid.value
    ? '先結模式：請先選擇線上付款方式，完成付款後才會送出訂單。'
    : '後結模式：可先送出訂單，用餐完畢後再至櫃檯或由店員在 POS 完成結帳。'
})
const canOrderOnline = computed(() =>
  onlineOrdering.value.enabled &&
  currentServiceModeOpen.value &&
  hasPaymentOptions.value &&
  !qrDineInLastOrderBlocked.value,
)
const onlineStatusLabel = computed(() =>
  onlineOrdering.value.enabled
    ? (currentServiceModeOpen.value && hasPaymentOptions.value && !qrDineInLastOrderBlocked.value ? '開放接單' : '暫停接單')
    : '僅菜單瀏覽',
)
const onlineStatusDetail = computed(() =>
  !onlineOrdering.value.enabled
    ? onlineOrdering.value.pauseMessage
    : currentServiceModeOpen.value
      ? qrDineInLastOrderBlocked.value
        ? '已超過最後加點時間'
        : hasPaymentOptions.value
          ? dineInCheckoutPostpaid.value
            ? `後結 · 平均備餐 ${onlineOrdering.value.averagePrepMinutes} 分鐘`
            : `平均備餐 ${onlineOrdering.value.averagePrepMinutes} 分鐘`
          : serviceMode.value === 'delivery'
            ? '外送需啟用線上付款'
            : dineInCheckoutPrepaid.value
              ? '先結模式需啟用線上付款模組'
            : '目前沒有開放付款方式'
      : `目前不開放${serviceModeLabels[serviceMode.value]}訂單`,
)
const requestedFulfillmentMinimum = computed(() => {
  const leadMinutes =
    Math.max(onlineOrdering.value.averagePrepMinutes, 0) +
    (serviceMode.value === 'delivery' ? Math.max(onlineOrdering.value.deliveryTravelMinutes, 0) : 0)
  const nextTime = new Date(Date.now() + leadMinutes * 60_000)
  return formatDatetimeLocal(nextTime)
})
const requestedFulfillmentMaximum = computed(() =>
  formatDatetimeLocal(new Date(Date.now() + scheduledOrderMaxDays.value * 24 * 60 * 60_000)),
)
const requestedFulfillmentStepSeconds = computed(() => scheduledOrderIntervalMinutes.value * 60)
const requestedFulfillmentDate = computed(() => {
  const value = customer.requestedFulfillmentAt.trim()
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
})
const isFutureRequestedFulfillmentDay = computed(() =>
  requestedFulfillmentDate.value !== null && formatDateKey(requestedFulfillmentDate.value) > formatDateKey(new Date()),
)
const scheduledOrderWindowMatches = (date: Date): boolean => {
  const windows = onlineOrdering.value.scheduledOrderTimeWindows
  if (windows.length === 0) {
    return true
  }

  const day = date.getDay()
  const minutes = date.getHours() * 60 + date.getMinutes()
  return windows.some((timeWindow) => {
    if (!timeWindow.days.includes(day)) {
      return false
    }

    const start = timeWindow.allDay ? 0 : timeToMinutes(timeWindow.start)
    const end = timeWindow.allDay ? 23 * 60 + 59 : timeToMinutes(timeWindow.end)
    const inRange = start <= end
      ? minutes >= start && minutes <= end
      : minutes >= start || minutes <= end
    if (!inRange) {
      return false
    }

    return ((minutes - start) % scheduledOrderIntervalMinutes.value + scheduledOrderIntervalMinutes.value) %
      scheduledOrderIntervalMinutes.value === 0
  })
}
const requestedFulfillmentError = (): string | null => {
  const value = customer.requestedFulfillmentAt.trim()
  if (!value) {
    return null
  }

  if (!onlineOrdering.value.allowScheduledOrders) {
    return '目前未開放預約時間，請清除希望時間後再送出'
  }

  const requestedAt = new Date(value)
  if (!Number.isFinite(requestedAt.getTime())) {
    return '希望時間格式不正確'
  }

  if (requestedAt < new Date(requestedFulfillmentMinimum.value)) {
    return '希望時間早於最早可取餐時間'
  }

  if (requestedAt > new Date(requestedFulfillmentMaximum.value)) {
    return `希望時間不可超過 ${scheduledOrderMaxDays.value} 天`
  }

  if (!scheduledOrderWindowMatches(requestedAt)) {
    return '希望時間不在可預約取餐時段內'
  }

  return null
}
const canSubmit = computed(() =>
  canOrderOnline.value &&
  cartLines.value.length > 0 &&
  customer.name.trim().length > 0 &&
  customer.phone.trim().length > 0 &&
  (!orderNoteRequired.value || customer.note.trim().length > 0) &&
  (!requiresPaymentSelection.value || paymentOptions.value.some((option) => option.value === paymentMethod.value)) &&
  onlineBenefitPaymentError.value === null &&
  deliveryMinimumMet.value &&
  requestedFulfillmentError() === null &&
  cartAvailabilityError.value === null &&
  (!requiresDeliveryAddress.value || customer.deliveryAddress.trim().length > 0) &&
  !isSubmitting.value,
)

const optionGroupMap = computed(() =>
  new Map(onlineOrdering.value.menuOptionGroups.map((group) => [group.id, group])),
)

const menuProductById = computed(() =>
  new Map(menuCatalog.value.map((product) => [product.id, product])),
)

const visibleChoicesForGroup = (group: OnlineMenuOptionGroup): OnlineMenuOptionGroup['choices'] =>
  group.choices.filter((choice) => {
    const status =
      onlineOrdering.value.noteSupplyStatuses[choice.id] ??
      onlineOrdering.value.noteSupplyStatuses[`${group.id}-${choice.id}`] ??
      'normal'
    return status === 'normal'
  })

const visibleOptionGroup = (group: OnlineMenuOptionGroup): OnlineMenuOptionGroup => ({
  ...group,
  choices: visibleChoicesForGroup(group),
})

const optionGroupsForItem = (item: MenuItem): OnlineMenuOptionGroup[] =>
  (onlineOrdering.value.productOptionAssignments[item.id] ?? [])
    .map((groupId) => optionGroupMap.value.get(groupId))
    .filter((group): group is OnlineMenuOptionGroup => Boolean(group))
    .map(visibleOptionGroup)
    .filter((group) => group.choices.length > 0)

const comboGroupsForItem = (item: MenuItem): ComboProductGroup[] =>
  (onlineOrdering.value.comboProductAssignments[item.id] ?? [])
    .map((group) => ({
      ...group,
      choices: group.choices.filter((choice) => menuProductById.value.has(choice.productId)),
    }))
    .filter((group) => group.choices.length > 0)

const optionPanelGroups = computed(() => (optionPanelItem.value ? optionGroupsForItem(optionPanelItem.value) : []))
const comboPanelGroups = computed(() => (optionPanelItem.value ? comboGroupsForItem(optionPanelItem.value) : []))

const selectedOptionChoices = computed(() =>
  optionPanelGroups.value.flatMap((group) => {
    const selectedIds = new Set(optionSelections.value[group.id] ?? [])
    return group.choices
      .filter((choice) => selectedIds.has(choice.id))
      .map((choice) => ({ group, choice }))
  }),
)

const optionChoiceLabel = (choice: OnlineMenuOptionChoice): string =>
  choice.priceDelta && choice.priceDelta > 0
    ? `${choice.label} +${formatCurrency(choice.priceDelta)}`
    : choice.label

const optionPriceAdjustment = computed(() =>
  selectedOptionChoices.value.reduce((total, entry) => total + (entry.choice.priceDelta ?? 0), 0),
)

const comboChoiceQuantity = (group: ComboProductGroup, productId: string): number =>
  comboSelections.value[group.id]?.[productId] ?? 0

const comboGroupSelectedCount = (group: ComboProductGroup): number =>
  Object.values(comboSelections.value[group.id] ?? {}).reduce((total, quantity) => total + Math.max(0, Math.trunc(quantity)), 0)

const comboChoiceProduct = (productId: string): MenuItem | null =>
  menuProductById.value.get(productId) ?? null

const comboOptionGroupsForProduct = (productId: string): OnlineMenuOptionGroup[] => {
  const product = comboChoiceProduct(productId)
  return product ? optionGroupsForItem(product) : []
}

const comboOptionSelected = (
  comboGroupId: string,
  productId: string,
  group: OnlineMenuOptionGroup,
  choice: OnlineMenuOptionChoice,
): boolean =>
  comboOptionSelections.value[comboGroupId]?.[productId]?.[group.id]?.includes(choice.id) ?? false

const comboChoiceOptionDetails = (comboGroupId: string, productId: string): { labels: string[]; rawLabels: string[]; priceDelta: number } => {
  const groupSelections = comboOptionSelections.value[comboGroupId]?.[productId] ?? {}
  const selectedChoices = comboOptionGroupsForProduct(productId).flatMap((group) =>
    group.choices.filter((choice) => groupSelections[group.id]?.includes(choice.id)),
  )

  return {
    labels: selectedChoices.map(optionChoiceLabel),
    rawLabels: selectedChoices.map((choice) => choice.label),
    priceDelta: selectedChoices.reduce((total, choice) => total + (choice.priceDelta ?? 0), 0),
  }
}

const selectedComboItems = computed(() =>
  comboPanelGroups.value.flatMap((group) =>
    Object.entries(comboSelections.value[group.id] ?? {}).flatMap(([productId, quantity]) => {
      const normalizedQuantity = Math.max(0, Math.trunc(Number(quantity) || 0))
      const choice = group.choices.find((entry) => entry.productId === productId)
      const product = comboChoiceProduct(productId)
      if (!choice || !product || normalizedQuantity <= 0) {
        return []
      }
      const optionDetails = comboChoiceOptionDetails(group.id, productId)

      return [{ group, choice, product, quantity: normalizedQuantity, optionDetails }]
    }),
  ),
)

const comboPriceAdjustment = computed(() =>
  selectedComboItems.value.reduce((total, entry) => total + (entry.choice.priceDelta + entry.optionDetails.priceDelta) * entry.quantity, 0),
)

const optionPanelUnitPrice = computed(() =>
  optionPanelItem.value ? Math.max(0, optionPanelItem.value.price + optionPriceAdjustment.value + comboPriceAdjustment.value) : 0,
)

const selectedOptionLabels = computed(() =>
  [
    ...selectedOptionChoices.value.map((entry) =>
      optionChoiceLabel(entry.choice),
    ),
    ...(itemNotesVisible.value && normalizedItemNote.value ? [`文字註記：${normalizedItemNote.value}`] : []),
    ...selectedComboItems.value.map((entry) => {
      const quantityLabel = entry.quantity > 1 ? ` x${entry.quantity}` : ''
      const priceDelta = entry.choice.priceDelta + entry.optionDetails.priceDelta
      const priceLabel = priceDelta > 0 ? ` +${formatCurrency(priceDelta * entry.quantity)}` : ''
      const optionLabel = entry.optionDetails.labels.length > 0 ? `（${entry.optionDetails.labels.join(' / ')}）` : ''
      return `${entry.group.label}: ${entry.product.name}${optionLabel}${quantityLabel}${priceLabel}`
    }),
  ],
)

const resetOptionSelections = (groups: OnlineMenuOptionGroup[]): OptionSelectionMap =>
  groups.reduce<OptionSelectionMap>((selections, group) => {
    selections[group.id] = []
    return selections
  }, {})

const openOptionPanel = (item: MenuItem): void => {
  const groups = optionGroupsForItem(item)
  optionPanelItem.value = item
  optionSelections.value = resetOptionSelections(groups)
  comboSelections.value = {}
  comboOptionSelections.value = {}
  itemNoteDraft.value = ''
  optionError.value = ''
}

const closeOptionPanel = (): void => {
  optionPanelItem.value = null
  optionSelections.value = {}
  comboSelections.value = {}
  comboOptionSelections.value = {}
  itemNoteDraft.value = ''
  optionError.value = ''
}

const optionSelected = (groupId: string, choiceId: string): boolean =>
  (optionSelections.value[groupId] ?? []).includes(choiceId)

const toggleOptionChoice = (group: OnlineMenuOptionGroup, choiceId: string): void => {
  const current = optionSelections.value[group.id] ?? []
  const isSelected = current.includes(choiceId)
  const next = isSelected
    ? current.filter((id) => id !== choiceId)
    : group.max === 1
      ? [choiceId]
      : [...current, choiceId].slice(0, group.max)

  optionSelections.value = {
    ...optionSelections.value,
    [group.id]: next,
  }
  optionError.value = ''
}

const removeComboOptionSelections = (comboGroupId: string, productId: string): void => {
  const currentGroupOptions = comboOptionSelections.value[comboGroupId] ?? {}
  if (!currentGroupOptions[productId]) {
    return
  }

  const nextGroupOptions = { ...currentGroupOptions }
  delete nextGroupOptions[productId]
  const nextSelections = { ...comboOptionSelections.value }
  if (Object.keys(nextGroupOptions).length > 0) {
    nextSelections[comboGroupId] = nextGroupOptions
  } else {
    delete nextSelections[comboGroupId]
  }
  comboOptionSelections.value = nextSelections
}

const toggleComboOptionChoice = (
  comboGroup: ComboProductGroup,
  productId: string,
  group: OnlineMenuOptionGroup,
  choice: OnlineMenuOptionChoice,
): void => {
  if (comboChoiceQuantity(comboGroup, productId) <= 0) {
    return
  }

  const currentProductSelections = comboOptionSelections.value[comboGroup.id]?.[productId] ?? {}
  const currentSelections = currentProductSelections[group.id] ?? []
  const isSelected = currentSelections.includes(choice.id)
  const next = isSelected
    ? currentSelections.filter((id) => id !== choice.id)
    : group.max === 1
      ? [choice.id]
      : [...currentSelections, choice.id].slice(0, group.max)

  comboOptionSelections.value = {
    ...comboOptionSelections.value,
    [comboGroup.id]: {
      ...(comboOptionSelections.value[comboGroup.id] ?? {}),
      [productId]: {
        ...currentProductSelections,
        [group.id]: next,
      },
    },
  }
  optionError.value = ''
}

const setComboChoiceQuantity = (group: ComboProductGroup, productId: string, quantity: number): void => {
  const currentGroupSelections = comboSelections.value[group.id] ?? {}
  const currentQuantity = currentGroupSelections[productId] ?? 0
  const nextQuantity = Math.max(0, Math.min(group.allowRepeat ? group.max : 1, Math.trunc(quantity)))
  const nextGroupCount = comboGroupSelectedCount(group) - currentQuantity + nextQuantity
  if (nextGroupCount > group.max) {
    return
  }

  const nextGroupSelections = { ...currentGroupSelections }
  if (nextQuantity > 0) {
    nextGroupSelections[productId] = nextQuantity
  } else {
    delete nextGroupSelections[productId]
    removeComboOptionSelections(group.id, productId)
  }

  comboSelections.value = {
    ...comboSelections.value,
    [group.id]: nextGroupSelections,
  }
  optionError.value = ''
}

const toggleComboChoice = (group: ComboProductGroup, productId: string): void => {
  const currentQuantity = comboChoiceQuantity(group, productId)
  if (group.max === 1) {
    if (currentQuantity > 0) {
      removeComboOptionSelections(group.id, productId)
    } else {
      Object.keys(comboSelections.value[group.id] ?? {}).forEach((selectedProductId) => {
        removeComboOptionSelections(group.id, selectedProductId)
      })
    }
    comboSelections.value = {
      ...comboSelections.value,
      [group.id]: currentQuantity > 0 ? {} : { [productId]: 1 },
    }
    optionError.value = ''
    return
  }

  setComboChoiceQuantity(group, productId, currentQuantity > 0 ? 0 : 1)
}

const incrementComboChoice = (group: ComboProductGroup, productId: string): void => {
  setComboChoiceQuantity(group, productId, comboChoiceQuantity(group, productId) + 1)
}

const decrementComboChoice = (group: ComboProductGroup, productId: string): void => {
  setComboChoiceQuantity(group, productId, comboChoiceQuantity(group, productId) - 1)
}

const validateOptionSelections = (): boolean => {
  for (const group of optionPanelGroups.value) {
    const selectedCount = optionSelections.value[group.id]?.length ?? 0
    if (group.required && selectedCount < group.min) {
      optionError.value = `「${group.label}」尚未選擇完成`
      return false
    }

    if (selectedCount > group.max) {
      optionError.value = `「${group.label}」最多只能選 ${group.max} 個`
      return false
    }
  }

  for (const group of comboPanelGroups.value) {
    const selectedCount = comboGroupSelectedCount(group)
    if (group.required && selectedCount < group.min) {
      optionError.value = `「${group.label}」尚未選擇完成`
      return false
    }

    if (selectedCount > group.max) {
      optionError.value = `「${group.label}」最多只能選 ${group.max} 份`
      return false
    }
  }

  for (const comboGroup of comboPanelGroups.value) {
    const selectedProducts = comboSelections.value[comboGroup.id] ?? {}
    for (const [productId, quantity] of Object.entries(selectedProducts)) {
      if (Math.max(0, Math.trunc(Number(quantity) || 0)) <= 0) {
        continue
      }

      const product = comboChoiceProduct(productId)
      if (!product) {
        continue
      }

      for (const group of comboOptionGroupsForProduct(productId)) {
        const selectedCount = comboOptionSelections.value[comboGroup.id]?.[productId]?.[group.id]?.length ?? 0
        if (group.required && selectedCount < group.min) {
          optionError.value = `「${product.name}」的「${group.label}」尚未選擇完成`
          return false
        }
        if (selectedCount > group.max) {
          optionError.value = `「${product.name}」的「${group.label}」最多只能選 ${group.max} 個`
          return false
        }
      }
    }
  }

  optionError.value = ''
  return true
}

const addConfiguredLine = (item: MenuItem, options: string[], unitPrice: number): void => {
  const variantKey = [item.id, ...options].join('::')
  const existing = cartLines.value.find((line) => line.itemId === variantKey)
  if (existing) {
    existing.quantity += 1
    return
  }

  const nextLine: CartLine = {
    itemId: variantKey,
    productSku: item.sku,
    productId: item.id,
    category: item.category,
    taxCategory: item.taxCategory,
    name: item.name,
    unitPrice,
    quantity: 1,
    options,
    prepStation: item.prepStation,
    printLabel: item.printLabel,
  }

  const comboItems = selectedComboItems.value.map((entry) => ({
    groupId: entry.group.id,
    groupLabel: entry.group.label,
    productId: entry.product.id,
    productSku: entry.product.sku,
    name: entry.product.name,
    quantity: entry.quantity,
    priceDelta: entry.choice.priceDelta + entry.optionDetails.priceDelta,
    options: entry.optionDetails.rawLabels,
  }))
  if (comboItems.length > 0) {
    nextLine.comboItems = comboItems
  }

  cartLines.value.push(nextLine)
}

const addItem = (item: MenuItem): void => {
  if (!canOrderOnline.value) {
    formError.value = onlineStatusDetail.value
    return
  }

  if (qrDineInLastOrderBlocked.value) {
    formError.value = '已超過最後加點時間，請洽現場人員'
    return
  }

  if (itemNotesVisible.value || optionGroupsForItem(item).length > 0 || comboGroupsForItem(item).length > 0) {
    openOptionPanel(item)
    return
  }

  const existing = cartLines.value.find((line) => line.itemId === item.id)
  if (existing) {
    existing.quantity += 1
    return
  }

  const nextLine: CartLine = {
    itemId: item.id,
    productSku: item.sku,
    category: item.category,
    taxCategory: item.taxCategory,
    name: item.name,
    unitPrice: item.price,
    quantity: 1,
    options: item.tags.slice(0, 1),
    prepStation: item.prepStation,
    printLabel: item.printLabel,
  }

  if (item.id !== item.sku) {
    nextLine.productId = item.id
  }

  cartLines.value.push(nextLine)
}

const confirmOptionPanel = (): void => {
  if (!optionPanelItem.value || !validateOptionSelections()) {
    return
  }

  addConfiguredLine(optionPanelItem.value, selectedOptionLabels.value, optionPanelUnitPrice.value)
  closeOptionPanel()
}

const increaseLine = (itemId: string): void => {
  const line = cartLines.value.find((entry) => entry.itemId === itemId)
  if (line) {
    line.quantity += 1
  }
}

const decreaseLine = (itemId: string): void => {
  const line = cartLines.value.find((entry) => entry.itemId === itemId)
  if (!line) {
    return
  }

  if (line.quantity === 1) {
    cartLines.value = cartLines.value.filter((entry) => entry.itemId !== itemId)
    return
  }

  line.quantity -= 1
}

const clearCart = (): void => {
  cartLines.value = []
}

const isProductTemporarilyStopped = (item: MenuItem): boolean => {
  if (!item.soldOutUntil) {
    return false
  }

  const stoppedUntil = new Date(item.soldOutUntil).getTime()
  return Number.isFinite(stoppedUntil) && stoppedUntil > Date.now()
}

const productAllowsFutureOrder = (item: MenuItem): boolean =>
  item.futureOrderAvailable &&
  onlineOrdering.value.allowScheduledOrders &&
  isFutureRequestedFulfillmentDay.value

const productVisibleForOrderSource = (item: MenuItem): boolean =>
  consumerOrderSource === 'qr' ? item.qrVisible : item.onlineVisible

const isProductOrderable = (item: MenuItem): boolean =>
  item.available &&
  item.inventoryCount !== 0 &&
  (!isProductTemporarilyStopped(item) || productAllowsFutureOrder(item))

const productAvailableForCart = (item: MenuItem): boolean =>
  productVisibleForOrderSource(item) && isProductOrderable(item)

const cartAvailabilityError = computed(() => {
  const unavailableNames = cartLines.value.flatMap((line) => {
    const item = menuCatalog.value.find((product) => product.id === line.itemId || product.sku === line.productSku)
    return item && !productAvailableForCart(item) ? [item.name] : []
  })

  return unavailableNames.length > 0
    ? `${[...new Set(unavailableNames)].slice(0, 3).join('、')} 目前不供應，請調整希望時間或移除品項`
    : null
})

const productDescription = (item: MenuItem): string => {
  const description = item.tags.join('、') || categoryLabelFor(item.category)
  if (isProductTemporarilyStopped(item) && productAllowsFutureOrder(item)) {
    return `${description} · 預約可訂`
  }

  if (
    item.inventoryCount !== null &&
    item.lowStockThreshold !== null &&
    item.inventoryCount > 0 &&
    item.inventoryCount <= item.lowStockThreshold
  ) {
    return `${description} · 剩 ${item.inventoryCount}`
  }

  return description
}

const buildOnlineOrderNumber = (date: Date): string => {
  const time = `${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `WEB-${formatDateKey(date)}-${time}${suffix}`
}

const toRequestedFulfillmentIso = (value: string): string | null => {
  if (!value.trim()) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const loadOnlineMenu = async (quiet = false): Promise<void> => {
  if (!quiet) {
    isLoading.value = true
  }
  if (!quiet) {
    formError.value = ''
  }

  try {
    if (!isPosApiConfigured) {
      onlineOrdering.value = defaultOnlineOrderingSettings()
      engagementSettings.value = defaultEngagementSettings()
      discountSettings.value = defaultDiscountSettings()
      menuCatalog.value = onlineFallbackMenu()
      orderMessage.value = '線上菜單預覽'
      return
    }

    const [runtimeSettings, products] = await Promise.all([
      fetchRuntimeSettings(),
      fetchProducts(consumerOrderSource === 'qr' ? 'qr' : 'online'),
    ])
    onlineOrdering.value = runtimeSettings.onlineOrdering
    engagementSettings.value = normalizeEngagementSettings(runtimeSettings.engagementSettings)
    discountSettings.value = normalizeDiscountSettings(runtimeSettings.discountSettings)
    menuCatalog.value = products
    orderMessage.value = onlineOrdering.value.enabled
      ? (products.length > 0 ? `${products.length} 個品項開放線上點餐` : '線上菜單尚未開放')
      : `僅菜單瀏覽 · ${onlineOrdering.value.pauseMessage}`
  } catch (error) {
    onlineOrdering.value = defaultOnlineOrderingSettings()
    engagementSettings.value = defaultEngagementSettings()
    discountSettings.value = defaultDiscountSettings()
    menuCatalog.value = onlineFallbackMenu()
    orderMessage.value = error instanceof Error ? `菜單同步失敗：${error.message}` : '菜單同步失敗'
  } finally {
    if (!quiet) {
      isLoading.value = false
    }
  }
}

const submitOnlineOrder = async (): Promise<void> => {
  if (!canOrderOnline.value) {
    formError.value = onlineStatusDetail.value
    return
  }

  const scheduledOrderError = requestedFulfillmentError()
  if (scheduledOrderError) {
    formError.value = scheduledOrderError
    return
  }

  const benefitPaymentError = onlineBenefitPaymentError.value
  if (benefitPaymentError) {
    formError.value = benefitPaymentError
    return
  }

  if (requiresPaymentSelection.value && !paymentOptions.value.some((option) => option.value === paymentMethod.value)) {
    formError.value = '目前不開放這個付款方式'
    return
  }

  if (!deliveryMinimumMet.value) {
    formError.value = `外送最低金額為 ${formatCurrency(deliveryMinimumSubtotal.value)}`
    return
  }

  if (!canSubmit.value) {
    formError.value = cartAvailabilityError.value ??
      (orderNoteRequired.value && customer.note.trim().length === 0
      ? '請填寫訂單備註'
      : requiresDeliveryAddress.value
        ? '請填寫姓名、電話、外送地址並加入品項'
        : '請填寫姓名、電話並加入品項')
    return
  }

  const invoiceError = invoiceFieldError()
  if (invoiceError) {
    formError.value = invoiceError
    return
  }

  if (!isPosApiConfigured) {
    formError.value = '線上點餐尚未連線，請稍後再試'
    return
  }

  isSubmitting.value = true
  formError.value = ''

  const now = new Date()
  const selectedPaymentMethod = dineInCheckoutPostpaid.value ? 'cash' : paymentMethod.value
  const requestedElectronicInvoice = engagementSettings.value.electronicInvoice.enabled && Boolean(
    engagementSettings.value.electronicInvoice.defaultIssueOnCheckout ||
    normalizeTaxId(customer.taxId) ||
    normalizeInvoiceCarrierBarcode(customer.invoiceCarrierBarcode) ||
    normalizeInvoiceDonationCode(customer.invoiceDonationCode),
  )
  const order: PosOrder = {
    id: buildOnlineOrderNumber(now),
    source: consumerOrderSource,
    mode: serviceMode.value,
    customerName: customer.name.trim(),
    customerPhone: customer.phone.trim(),
    deliveryAddress: serviceMode.value === 'delivery' ? customer.deliveryAddress.trim() : '',
    requestedFulfillmentAt: toRequestedFulfillmentIso(customer.requestedFulfillmentAt),
    taxId: normalizeTaxId(customer.taxId),
    invoiceCarrierBarcode: normalizeInvoiceCarrierBarcode(customer.invoiceCarrierBarcode),
    invoiceDonationCode: normalizeInvoiceDonationCode(customer.invoiceDonationCode),
    electronicInvoiceRequested: requestedElectronicInvoice,
    electronicInvoiceStatus: 'not_requested',
    electronicInvoicePrintMode: normalizeInvoiceDonationCode(customer.invoiceDonationCode)
      ? 'donation'
      : normalizeInvoiceCarrierBarcode(customer.invoiceCarrierBarcode)
        ? 'carrier'
        : normalizeTaxId(customer.taxId)
          ? 'paper'
          : requestedElectronicInvoice && engagementSettings.value.electronicInvoice.defaultPrintPaper
            ? 'paper'
            : 'none',
    electronicInvoiceNumber: '',
    electronicInvoiceRandomCode: '',
    electronicInvoiceIssuedAt: null,
    electronicInvoiceVoidedAt: null,
    electronicInvoiceUploadDueAt: null,
    memberId: null,
    note: [
      qrFloorLabel ? `樓層 ${qrFloorLabel}` : '',
      qrTableLabel ? `桌位 ${qrTableLabel}` : '',
      orderNoteVisible.value ? customer.note.trim() : '',
    ].filter(Boolean).join(' · '),
    qrSessionOrderId: qrSessionOrderId || null,
    qrSessionStartedAt: qrSessionStartedAt || null,
    lines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
    subtotal: cartTotal.value,
    orderLabels: [],
    serviceFeeRate: serviceChargeRateForMode(engagementSettings.value.serviceCharge, serviceMode.value),
    serviceFeeAmount: serviceFeeAmount.value,
    extraFeeAmount: deliveryFeeAmount.value,
    discountAmount: onlineDiscountAmount.value,
    pointsRedeemed: 0,
    couponCode: '',
    paymentSplits: [],
    paymentBreakdown: [],
    transactionReceiptCount: 0,
    memberPointsEarned: Math.max(0, Math.floor(cartTotal.value / 100)),
    paymentMethod: selectedPaymentMethod,
    paymentStatus: 'pending',
    status: 'new',
    createdAt: now.toISOString(),
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    printStatus: 'skipped',
    printJobs: [],
  }

  try {
    lastOrder.value = await createOrder(order)
    orderMessage.value = `${order.id} 已送出`
    clearCart()
    customer.deliveryAddress = ''
    customer.requestedFulfillmentAt = ''
    customer.taxId = ''
    customer.invoiceCarrierBarcode = ''
    customer.invoiceDonationCode = ''
    customer.electronicInvoiceRequested = false
    customer.electronicInvoicePrintMode = 'none'
    customer.note = ''
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '訂單送出失敗'
  } finally {
    isSubmitting.value = false
  }
}

const refreshOnlineMenuQuietly = (): void => {
  void loadOnlineMenu(true)
}

const scheduleOnlineRealtimeRefresh = (): void => {
  if (onlineRealtimeRefreshTimer !== null) {
    globalThis.clearTimeout(onlineRealtimeRefreshTimer)
  }

  onlineRealtimeRefreshTimer = globalThis.setTimeout(() => {
    onlineRealtimeRefreshTimer = null
    void loadOnlineMenu(true)
  }, 350)
}

onMounted(() => {
  void loadOnlineMenu()
  onlineMenuSyncTimer = globalThis.setInterval(refreshOnlineMenuQuietly, 15_000)
  consumerClockTimer = globalThis.setInterval(() => {
    currentTime.value = Date.now()
  }, 30_000)
  storeCoverCarouselTimer = globalThis.setInterval(() => {
    if (onlineStoreCoverImages.value.length > 1) {
      storeCoverIndex.value = (storeCoverIndex.value + 1) % onlineStoreCoverImages.value.length
    }
  }, 5_000)
  onlineRealtimeUnsubscribe = subscribeToPosRealtimeEvents({
    topics: ['runtime_settings', 'products'],
    onEvent: scheduleOnlineRealtimeRefresh,
  })
  globalThis.addEventListener('focus', refreshOnlineMenuQuietly)
})

onBeforeUnmount(() => {
  onlineRealtimeUnsubscribe?.()
  onlineRealtimeUnsubscribe = null
  if (onlineRealtimeRefreshTimer !== null) {
    globalThis.clearTimeout(onlineRealtimeRefreshTimer)
  }
  if (onlineMenuSyncTimer !== null) {
    globalThis.clearInterval(onlineMenuSyncTimer)
  }
  if (consumerClockTimer !== null) {
    globalThis.clearInterval(consumerClockTimer)
  }
  if (storeCoverCarouselTimer !== null) {
    globalThis.clearInterval(storeCoverCarouselTimer)
  }
  globalThis.removeEventListener('focus', refreshOnlineMenuQuietly)
})

watch(
  () => onlineOrdering.value.allowScheduledOrders,
  (allowScheduledOrders) => {
    if (!allowScheduledOrders) {
      customer.requestedFulfillmentAt = ''
    }
  },
)

watch(
  () => onlineOrdering.value.serviceModeAvailability,
  () => {
    if (qrTableLabel || serviceModeOpen(serviceMode.value)) {
      return
    }

    const fallbackMode = serviceModeOptions.find((option) => serviceModeOpen(option.value))?.value
    if (fallbackMode) {
      serviceMode.value = fallbackMode
    }
  },
  { deep: true },
)

watch(
  [paymentOptions, requiresPaymentSelection],
  ([options, shouldSelectPayment]) => {
    if (!shouldSelectPayment) {
      paymentMethod.value = 'cash'
      return
    }

    if (!options.some((option) => option.value === paymentMethod.value)) {
      paymentMethod.value = options[0]?.value ?? 'cash'
    }
  },
  { immediate: true },
)

watch(
  () => onlineStoreProfile.value.notice,
  () => {
    storeNoticeExpanded.value = false
  },
)

watch(
  () => onlineStoreCoverImages.value.length,
  (coverImageCount) => {
    if (coverImageCount === 0) {
      storeCoverIndex.value = 0
      return
    }

    storeCoverIndex.value = storeCoverIndex.value % coverImageCount
  },
)
</script>

<template>
  <section class="consumer-shell" aria-label="線上點餐">
    <section class="consumer-storefront">
      <div class="consumer-cover" :class="{ 'consumer-cover--photo': activeStoreCoverImage }" aria-hidden="true">
        <img :src="activeStoreCoverImage || brandLogoSrc" alt="" />
        <div v-if="onlineStoreCoverImages.length > 1" class="consumer-cover-dots">
          <span
            v-for="(_imageUrl, index) in onlineStoreCoverImages"
            :key="`cover-dot-${index}`"
            :class="{ 'consumer-cover-dot--active': index === storeCoverIndex % onlineStoreCoverImages.length }"
          />
        </div>
      </div>

      <div class="consumer-store-info">
        <div>
          <h2>{{ onlineStoreName }}</h2>
          <p class="consumer-status-line">
            <Clock3 :size="18" aria-hidden="true" />
            <strong>{{ onlineStatusLabel }}</strong>
            <span>{{ onlineStatusDetail }}</span>
          </p>
          <p class="consumer-status-line">
            <ShoppingBag :size="18" aria-hidden="true" />
            <span>{{ qrTableLabel ? `掃碼內用 · ${qrTableDisplayLabel}` : orderMessage }}</span>
          </p>
          <p v-if="qrDineInTimeLimitDetail" class="consumer-status-line consumer-status-line--limit">
            <Clock3 :size="18" aria-hidden="true" />
            <span>{{ qrDineInTimeLimitDetail }}</span>
          </p>
          <p v-if="onlineStorePhone || onlineStoreAddress" class="consumer-status-line">
            <Info :size="18" aria-hidden="true" />
            <span>{{ [onlineStorePhone, onlineStoreAddress].filter(Boolean).join(' · ') }}</span>
          </p>
          <div
            v-if="onlineStoreNotice"
            class="consumer-store-notice"
            :class="{ 'consumer-store-notice--clamped': !storeNoticeOpen }"
          >
            <p>{{ onlineStoreNotice }}</p>
            <button
              v-if="!onlineStoreProfile.noticeExpanded"
              class="text-button"
              type="button"
              @click="storeNoticeExpanded = !storeNoticeExpanded"
            >
              {{ storeNoticeExpanded ? '收合提醒事項' : '展開提醒事項' }}
            </button>
          </div>
        </div>
        <button class="icon-button" type="button" title="餐廳資訊">
          <Info :size="20" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section class="consumer-menu-shell" aria-labelledby="consumer-menu-title">
      <div class="consumer-menu-heading">
        <div>
          <h2 id="consumer-menu-title">菜單</h2>
          <span>{{ filteredMenu.length }} 個品項</span>
        </div>
        <div class="consumer-layout-toggle" aria-label="菜單顯示方式">
          <button
            type="button"
            title="格狀"
            :class="{ 'consumer-layout-button--active': displayMode === 'grid' }"
            @click="displayMode = 'grid'"
          >
            <LayoutGrid :size="18" aria-hidden="true" />
          </button>
          <button
            type="button"
            title="列表"
            :class="{ 'consumer-layout-button--active': displayMode === 'list' }"
            @click="displayMode = 'list'"
          >
            <List :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>

      <label class="search-box consumer-search">
        <Search :size="18" aria-hidden="true" />
        <input v-model="searchTerm" type="search" placeholder="搜尋咖啡、茶飲或輕食" />
      </label>

      <div class="consumer-category-rail" aria-label="線上菜單分類">
        <button
          v-for="category in categoryOptions"
          :key="category.value"
          :class="{ 'consumer-category-pill--active': selectedCategory === category.value }"
          type="button"
          @click="selectedCategory = category.value"
        >
          {{ category.label }}
        </button>
      </div>

      <div v-if="displayMode === 'grid'" class="consumer-product-grid">
        <button
          v-for="item in filteredMenu"
          :key="item.id"
          class="consumer-product-tile"
          type="button"
          :disabled="!canOrderOnline"
          @click="addItem(item)"
        >
          <span class="product-tile-top">
            <span class="product-swatch" :style="{ backgroundColor: item.accent }" aria-hidden="true"></span>
            <span class="product-category">{{ categoryLabelFor(item.category) }}</span>
          </span>
          <span class="product-name">{{ item.name }}</span>
          <span class="product-tags">{{ productDescription(item) }}</span>
          <span class="consumer-product-footer">
            <strong>{{ formatCurrency(item.price) }}</strong>
            <span>加入</span>
          </span>
        </button>
      </div>

      <div v-else class="consumer-product-list">
        <section v-for="group in menuGroups" :key="group.value" class="consumer-category-section">
          <p class="consumer-available-time">11:30 開始供應</p>
          <h3>{{ group.label }}</h3>
          <button
            v-for="item in group.items"
            :key="item.id"
            class="consumer-product-row"
            type="button"
            :disabled="!canOrderOnline"
            @click="addItem(item)"
          >
            <span class="consumer-product-row-copy">
              <strong>{{ item.name }}</strong>
              <span>{{ productDescription(item) }}</span>
              <b>{{ formatCurrency(item.price) }}</b>
            </span>
            <span class="product-swatch consumer-row-swatch" :style="{ backgroundColor: item.accent }" aria-hidden="true"></span>
          </button>
        </section>
      </div>

      <div v-if="!isLoading && filteredMenu.length === 0" class="consumer-empty-state">
        <ShoppingBag :size="24" aria-hidden="true" />
        <span>目前沒有可訂品項</span>
      </div>
    </section>

    <aside class="consumer-cart-panel" aria-labelledby="consumer-cart-title">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Order</p>
          <h2 id="consumer-cart-title">訂單內容</h2>
          <span class="panel-note">{{ cartQuantity }} 件 · {{ formatCurrency(orderTotal) }}</span>
        </div>
        <button class="icon-button" type="button" title="清空購物車" @click="clearCart">
          <Trash2 :size="20" aria-hidden="true" />
        </button>
      </div>

      <div class="consumer-cart-lines">
        <article v-for="line in cartLines" :key="line.itemId" class="cart-line consumer-cart-line">
          <div>
            <h3>{{ line.name }}</h3>
            <p>{{ line.options.join(' / ') || '標準' }}</p>
          </div>
          <div class="quantity-stepper" aria-label="數量">
            <button type="button" title="減少" @click="decreaseLine(line.itemId)">
              <Minus :size="16" aria-hidden="true" />
            </button>
            <span>{{ line.quantity }}</span>
            <button type="button" title="增加" @click="increaseLine(line.itemId)">
              <Plus :size="16" aria-hidden="true" />
            </button>
          </div>
          <strong>{{ formatCurrency(line.unitPrice * line.quantity) }}</strong>
        </article>

        <div v-if="cartLines.length === 0" class="empty-state consumer-cart-empty">
          <ShoppingBag :size="24" aria-hidden="true" />
          <span>購物車尚無品項</span>
        </div>
      </div>

      <div class="consumer-checkout-summary" aria-label="訂單金額">
        <div>
          <span>商品小計</span>
          <strong>{{ formatCurrency(cartTotal) }}</strong>
        </div>
        <div v-if="serviceMode === 'delivery'">
          <span>{{ deliveryFeeLabel }}</span>
          <strong>{{ formatCurrency(deliveryFeeAmount) }}</strong>
        </div>
        <div v-if="serviceFeeAmount > 0">
          <span>{{ serviceFeeLabel }}</span>
          <strong>{{ formatCurrency(serviceFeeAmount) }}</strong>
        </div>
        <div v-if="onlineDiscountAmount > 0">
          <span>優惠活動</span>
          <strong>-{{ formatCurrency(onlineDiscountAmount) }}</strong>
        </div>
        <div v-if="onlineDiscountApplications.length > 0" class="consumer-discount-list">
          <span v-for="application in onlineDiscountApplications" :key="application.campaignId">
            {{ application.campaignName }}
          </span>
        </div>
        <div class="consumer-checkout-summary-total">
          <span>合計</span>
          <strong>{{ formatCurrency(orderTotal) }}</strong>
        </div>
        <p v-if="serviceMode === 'delivery' && !deliveryMinimumMet" class="consumer-form-error">
          外送最低金額 {{ formatCurrency(deliveryMinimumSubtotal) }}
        </p>
      </div>

      <div class="segmented-control consumer-service-mode" aria-label="取餐方式">
        <button
          v-for="mode in serviceModeOptions"
          :key="mode.value"
          class="segment-button"
          :class="{ 'segment-button--active': serviceMode === mode.value }"
          type="button"
          :disabled="!serviceModeOpen(mode.value)"
          :title="serviceModeOpen(mode.value) ? mode.label : `目前不開放${mode.label}`"
          @click="serviceMode = mode.value"
        >
          {{ mode.label }}
        </button>
      </div>

      <p v-if="onlineOrdering.checkoutInstructions" class="consumer-checkout-instructions">
        {{ onlineOrdering.checkoutInstructions }}
      </p>
      <p v-if="dineInCheckoutDetail" class="consumer-checkout-instructions">
        {{ dineInCheckoutDetail }}
      </p>

      <div class="customer-grid consumer-customer-grid">
        <label>
          姓名
          <input v-model="customer.name" type="text" autocomplete="name" placeholder="取餐姓名" />
        </label>
        <label>
          電話
          <input v-model="customer.phone" type="tel" autocomplete="tel" placeholder="聯絡電話" />
        </label>
        <label>
          希望時間
          <input
            v-model="customer.requestedFulfillmentAt"
            type="datetime-local"
            :disabled="!onlineOrdering.allowScheduledOrders"
            :min="requestedFulfillmentMinimum"
            :max="requestedFulfillmentMaximum"
            :step="requestedFulfillmentStepSeconds"
          />
          <small>{{ onlineOrdering.allowScheduledOrders ? `可預約 ${scheduledOrderMaxDays} 天內 · ${scheduledOrderIntervalMinutes} 分鐘間隔` : '目前不開放預約' }}</small>
        </label>
        <label v-if="requiresDeliveryAddress" class="wide-field">
          外送地址
          <input v-model="customer.deliveryAddress" type="text" autocomplete="street-address" placeholder="外送地址" />
        </label>
        <label v-if="onlineOrdering.showTaxIdField">
          統一編號
          <input v-model="customer.taxId" type="text" inputmode="numeric" maxlength="8" placeholder="8 碼數字" />
        </label>
        <label v-if="onlineOrdering.showCarrierBarcodeField">
          載具條碼
          <input v-model="customer.invoiceCarrierBarcode" type="text" maxlength="32" placeholder="/ABC1234" />
        </label>
        <label v-if="onlineOrdering.showDonationCodeField">
          捐贈碼
          <input v-model="customer.invoiceDonationCode" type="text" inputmode="numeric" maxlength="7" placeholder="3 至 7 碼" />
        </label>
        <label v-if="orderNoteVisible" class="wide-field">
          備註
          <textarea v-model="customer.note" rows="3" :placeholder="orderNotePlaceholder" />
          <small>{{ orderNoteRequired ? '此欄位為必填' : '可填寫整筆訂單需求' }}</small>
        </label>
      </div>

      <div v-if="requiresPaymentSelection" class="payment-list consumer-payment-list" aria-label="付款方式">
        <button
          v-for="payment in paymentOptions"
          :key="payment.value"
          class="payment-button"
          :class="{ 'payment-button--active': paymentMethod === payment.value }"
          type="button"
          @click="paymentMethod = payment.value"
        >
          <CreditCard :size="18" aria-hidden="true" />
          {{ payment.label }}
        </button>
        <span v-if="paymentOptions.length === 0" class="panel-note">目前沒有開放付款方式</span>
        <span v-else-if="onlineBenefitsRequireOnsitePayment" class="panel-note">優惠活動須選擇現場付款，於 POS 結帳時操作。</span>
      </div>
      <p v-else class="consumer-checkout-instructions">
        付款方式將保留為現場後結，店員可在 POS 訂單內完成收款。
      </p>

      <p v-if="formError" class="consumer-form-error">{{ formError }}</p>

      <button class="primary-button consumer-submit-button" type="button" :disabled="!canSubmit" @click="submitOnlineOrder">
        <TicketCheck v-if="!isSubmitting" :size="20" aria-hidden="true" />
        <Clock3 v-else :size="20" aria-hidden="true" />
        {{ isSubmitting ? '送出中' : (canOrderOnline ? '送出訂單' : (onlineOrdering.enabled ? '暫停接單' : '僅菜單瀏覽')) }}
      </button>

      <article v-if="lastOrder" class="consumer-confirmation">
        <CheckCircle2 :size="22" aria-hidden="true" />
        <div>
          <strong>{{ lastOrder.id }}</strong>
          <span>{{ formatCurrency(lastOrder.subtotal + lastOrder.extraFeeAmount + lastOrder.serviceFeeAmount - lastOrder.discountAmount) }} · 門市接單中</span>
        </div>
      </article>
    </aside>

    <div v-if="optionPanelItem" class="consumer-option-backdrop" role="dialog" aria-modal="true">
      <section class="consumer-option-sheet" aria-label="品項註記">
        <header class="consumer-option-header">
          <button type="button" class="icon-button" title="關閉" @click="closeOptionPanel">
            <Minus :size="20" aria-hidden="true" />
          </button>
          <div>
            <p class="eyebrow">Options</p>
            <h2>{{ optionPanelItem.name }}</h2>
          </div>
          <strong>{{ formatCurrency(optionPanelUnitPrice) }}</strong>
        </header>

        <div class="consumer-option-body">
          <section v-for="group in optionPanelGroups" :key="group.id" class="consumer-option-group">
            <div class="consumer-option-group-heading">
              <h3>{{ group.label }}</h3>
              <span>{{ group.requirement }}</span>
            </div>
            <div class="consumer-option-grid">
              <button
                v-for="choice in group.choices"
                :key="choice.id"
                type="button"
                class="consumer-option-choice"
                :class="{ 'consumer-option-choice--active': optionSelected(group.id, choice.id) }"
                @click="toggleOptionChoice(group, choice.id)"
              >
                <span>
                  <strong>{{ choice.label }}</strong>
                  <small v-if="choice.priceDelta && choice.priceDelta > 0">+{{ formatCurrency(choice.priceDelta) }}</small>
                </span>
                <Check v-if="optionSelected(group.id, choice.id)" :size="18" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section v-for="group in comboPanelGroups" :key="group.id" class="consumer-option-group">
            <div class="consumer-option-group-heading">
              <h3>{{ group.label }}</h3>
              <span>{{ group.requirement }}</span>
            </div>
            <div class="consumer-option-grid">
              <div
                v-for="choice in group.choices"
                :key="`${group.id}-${choice.productId}`"
                class="consumer-option-choice consumer-option-choice--combo"
                :class="{ 'consumer-option-choice--active': comboChoiceQuantity(group, choice.productId) > 0 }"
              >
                <button type="button" class="consumer-option-choice-main" @click="toggleComboChoice(group, choice.productId)">
                  <span>
                    <strong>{{ comboChoiceProduct(choice.productId)?.name ?? choice.productId }}</strong>
                    <small v-if="choice.priceDelta && choice.priceDelta > 0">+{{ formatCurrency(choice.priceDelta) }}</small>
                  </span>
                  <Check v-if="comboChoiceQuantity(group, choice.productId) > 0 && !(group.allowRepeat || group.max > 1)" :size="18" aria-hidden="true" />
                </button>
                <span v-if="group.allowRepeat || group.max > 1" class="consumer-option-stepper">
                  <button type="button" title="減少套餐子項目" @click="decrementComboChoice(group, choice.productId)">
                    <Minus :size="14" aria-hidden="true" />
                  </button>
                  <strong>{{ comboChoiceQuantity(group, choice.productId) }}</strong>
                  <button type="button" title="增加套餐子項目" @click="incrementComboChoice(group, choice.productId)">
                    <Plus :size="14" aria-hidden="true" />
                  </button>
                </span>
                <div
                  v-if="comboChoiceQuantity(group, choice.productId) > 0 && comboOptionGroupsForProduct(choice.productId).length > 0"
                  class="consumer-combo-notes"
                >
                  <section v-for="noteGroup in comboOptionGroupsForProduct(choice.productId)" :key="`${group.id}-${choice.productId}-${noteGroup.id}`">
                    <div class="consumer-combo-note-title">
                      <span>{{ noteGroup.label }}</span>
                      <small>{{ noteGroup.requirement }}</small>
                    </div>
                    <div class="consumer-combo-note-grid">
                      <button
                        v-for="noteChoice in noteGroup.choices"
                        :key="noteChoice.id"
                        type="button"
                        class="consumer-combo-note-choice"
                        :class="{ 'consumer-combo-note-choice--active': comboOptionSelected(group.id, choice.productId, noteGroup, noteChoice) }"
                        @click="toggleComboOptionChoice(group, choice.productId, noteGroup, noteChoice)"
                      >
                        <span>{{ noteChoice.label }}</span>
                        <small v-if="noteChoice.priceDelta && noteChoice.priceDelta > 0">+{{ formatCurrency(noteChoice.priceDelta) }}</small>
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </section>

          <section v-if="itemNotesVisible" class="consumer-option-group">
            <div class="consumer-option-group-heading">
              <h3>餐點備註</h3>
              <span>選填</span>
            </div>
            <label class="consumer-item-note-field">
              <span>文字註記</span>
              <input v-model="itemNoteDraft" type="text" maxlength="80" placeholder="少冰、少糖、不要香菜" />
            </label>
          </section>

          <p v-if="optionError" class="consumer-form-error">{{ optionError }}</p>
        </div>

        <footer class="consumer-option-footer">
          <button type="button" @click="closeOptionPanel">取消</button>
          <button class="primary-button" type="button" @click="confirmOptionPanel">
            <CheckCircle2 :size="20" aria-hidden="true" />
            加入購物車
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>
