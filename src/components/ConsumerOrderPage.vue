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
import { formatCurrency, formatDateKey } from '../lib/formatters'
import {
  createOrder,
  defaultOnlineOrderingSettings,
  fetchProducts,
  fetchRuntimeSettings,
  isPosApiConfigured,
} from '../lib/posApi'
import type {
  CartLine,
  CustomerDraft,
  MenuCategory,
  MenuItem,
  OnlineMenuOptionGroup,
  OnlineOrderingSettings,
  PaymentMethod,
  PosOrder,
  ServiceMode,
} from '../types/pos'

type CategoryFilter = 'all' | MenuCategory
type DisplayMode = 'list' | 'grid'
type OptionSelectionMap = Record<string, string[]>

const baseCategoryOptions: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: '全部' },
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

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'line-pay', label: 'LINE Pay' },
  { value: 'jkopay', label: '街口' },
  { value: 'cash', label: '現場付款' },
]

const selectedCategory = ref<CategoryFilter>('all')
const searchTerm = ref('')
const displayMode = ref<DisplayMode>('list')
const serviceMode = ref<ServiceMode>('takeout')
const paymentMethod = ref<PaymentMethod>('line-pay')
const brandLogoSrc = `${import.meta.env.BASE_URL}assets/script-coffee-logo.png`
const menuCatalog = ref<MenuItem[]>([])
const onlineOrdering = ref<OnlineOrderingSettings>(defaultOnlineOrderingSettings())
const cartLines = ref<CartLine[]>([])
const isLoading = ref(true)
const isSubmitting = ref(false)
const orderMessage = ref('讀取線上菜單中')
const formError = ref('')
const lastOrder = ref<PosOrder | null>(null)
const optionPanelItem = ref<MenuItem | null>(null)
const optionSelections = ref<OptionSelectionMap>({})
const optionError = ref('')
let onlineMenuSyncTimer: number | null = null
const customer = reactive<CustomerDraft>({
  name: '',
  phone: '',
  deliveryAddress: '',
  requestedFulfillmentAt: '',
  note: '',
})

const onlineFallbackMenu = (): MenuItem[] =>
  menuItems
    .filter((item) => item.available)
    .map((item) => ({
      ...item,
      onlineVisible: true,
    }))

const categoryLabelFor = (category: MenuCategory): string =>
  baseCategoryOptions.find((option) => option.value === category)?.label ?? categoryLabels[category] ?? category

const categoryOptions = computed<Array<{ value: CategoryFilter; label: string }>>(() => {
  const options = new Map(baseCategoryOptions.map((option) => [option.value, option]))
  for (const item of menuCatalog.value) {
    if (!options.has(item.category)) {
      options.set(item.category, {
        value: item.category,
        label: categoryLabelFor(item.category),
      })
    }
  }
  return [...options.values()]
})

const itemMatchesFilter = (item: MenuItem): boolean => {
  const keyword = searchTerm.value.trim().toLowerCase()
  const matchesCategory = selectedCategory.value === 'all' || item.category === selectedCategory.value
  const matchesKeyword =
    keyword.length === 0 ||
    item.name.toLowerCase().includes(keyword) ||
    item.tags.some((tag) => tag.toLowerCase().includes(keyword))

  return isProductOrderable(item) && item.onlineVisible && matchesCategory && matchesKeyword
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

const cartQuantity = computed(() => cartLines.value.reduce((total, line) => total + line.quantity, 0))
const cartTotal = computed(() => cartLines.value.reduce((total, line) => total + line.unitPrice * line.quantity, 0))
const requiresDeliveryAddress = computed(() => serviceMode.value === 'delivery')
const canOrderOnline = computed(() => onlineOrdering.value.enabled)
const onlineStatusLabel = computed(() => (onlineOrdering.value.enabled ? '開放接單' : '暫停接單'))
const onlineStatusDetail = computed(() =>
  onlineOrdering.value.enabled
    ? `平均備餐 ${onlineOrdering.value.averagePrepMinutes} 分鐘`
    : onlineOrdering.value.pauseMessage,
)
const requestedFulfillmentMinimum = computed(() => {
  const nextTime = new Date(Date.now() + Math.max(onlineOrdering.value.averagePrepMinutes, 0) * 60_000)
  const timezoneOffsetMs = nextTime.getTimezoneOffset() * 60 * 1000
  return new Date(nextTime.getTime() - timezoneOffsetMs).toISOString().slice(0, 16)
})
const canSubmit = computed(() =>
  canOrderOnline.value &&
  cartLines.value.length > 0 &&
  customer.name.trim().length > 0 &&
  customer.phone.trim().length > 0 &&
  (!requiresDeliveryAddress.value || customer.deliveryAddress.trim().length > 0) &&
  !isSubmitting.value,
)

const optionGroupMap = computed(() =>
  new Map(onlineOrdering.value.menuOptionGroups.map((group) => [group.id, group])),
)

const visibleChoicesForGroup = (group: OnlineMenuOptionGroup): OnlineMenuOptionGroup['choices'] =>
  group.choices.filter((choice) => {
    const status = onlineOrdering.value.noteSupplyStatuses[`${group.id}-${choice.id}`] ?? 'normal'
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

const optionPanelGroups = computed(() => (optionPanelItem.value ? optionGroupsForItem(optionPanelItem.value) : []))

const selectedOptionChoices = computed(() =>
  optionPanelGroups.value.flatMap((group) => {
    const selectedIds = new Set(optionSelections.value[group.id] ?? [])
    return group.choices
      .filter((choice) => selectedIds.has(choice.id))
      .map((choice) => ({ group, choice }))
  }),
)

const optionPriceAdjustment = computed(() =>
  selectedOptionChoices.value.reduce((total, entry) => total + (entry.choice.priceDelta ?? 0), 0),
)

const optionPanelUnitPrice = computed(() =>
  optionPanelItem.value ? Math.max(0, optionPanelItem.value.price + optionPriceAdjustment.value) : 0,
)

const selectedOptionLabels = computed(() =>
  selectedOptionChoices.value.map((entry) =>
    entry.choice.priceDelta && entry.choice.priceDelta > 0
      ? `${entry.choice.label} +${formatCurrency(entry.choice.priceDelta)}`
      : entry.choice.label,
  ),
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
  optionError.value = ''
}

const closeOptionPanel = (): void => {
  optionPanelItem.value = null
  optionSelections.value = {}
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
    name: item.name,
    unitPrice,
    quantity: 1,
    options,
    prepStation: item.prepStation,
    printLabel: item.printLabel,
  }

  cartLines.value.push(nextLine)
}

const addItem = (item: MenuItem): void => {
  if (!canOrderOnline.value) {
    formError.value = onlineOrdering.value.pauseMessage
    return
  }

  if (optionGroupsForItem(item).length > 0) {
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

const isProductOrderable = (item: MenuItem): boolean =>
  item.available &&
  item.inventoryCount !== 0 &&
  !isProductTemporarilyStopped(item)

const productDescription = (item: MenuItem): string => {
  const description = item.tags.join('、') || categoryLabelFor(item.category)
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
      menuCatalog.value = onlineFallbackMenu()
      orderMessage.value = '線上菜單預覽'
      return
    }

    const [runtimeSettings, products] = await Promise.all([
      fetchRuntimeSettings(),
      fetchProducts('online'),
    ])
    onlineOrdering.value = runtimeSettings.onlineOrdering
    menuCatalog.value = products
    orderMessage.value = onlineOrdering.value.enabled
      ? (products.length > 0 ? `${products.length} 個品項開放線上點餐` : '線上菜單尚未開放')
      : onlineOrdering.value.pauseMessage
  } catch (error) {
    onlineOrdering.value = defaultOnlineOrderingSettings()
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
    formError.value = onlineOrdering.value.pauseMessage
    return
  }

  if (!onlineOrdering.value.allowScheduledOrders && customer.requestedFulfillmentAt.trim()) {
    formError.value = '目前未開放預約時間，請清除希望時間後再送出'
    return
  }

  if (!canSubmit.value) {
    formError.value = requiresDeliveryAddress.value
      ? '請填寫姓名、電話、外送地址並加入品項'
      : '請填寫姓名、電話並加入品項'
    return
  }

  if (!isPosApiConfigured) {
    formError.value = '線上點餐尚未連線，請稍後再試'
    return
  }

  isSubmitting.value = true
  formError.value = ''

  const now = new Date()
  const order: PosOrder = {
    id: buildOnlineOrderNumber(now),
    source: 'online',
    mode: serviceMode.value,
    customerName: customer.name.trim(),
    customerPhone: customer.phone.trim(),
    deliveryAddress: serviceMode.value === 'delivery' ? customer.deliveryAddress.trim() : '',
    requestedFulfillmentAt: toRequestedFulfillmentIso(customer.requestedFulfillmentAt),
    note: customer.note.trim(),
    lines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
    subtotal: cartTotal.value,
    paymentMethod: paymentMethod.value,
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

onMounted(() => {
  void loadOnlineMenu()
  onlineMenuSyncTimer = globalThis.setInterval(refreshOnlineMenuQuietly, 15_000)
  globalThis.addEventListener('focus', refreshOnlineMenuQuietly)
})

onBeforeUnmount(() => {
  if (onlineMenuSyncTimer !== null) {
    globalThis.clearInterval(onlineMenuSyncTimer)
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
</script>

<template>
  <section class="consumer-shell" aria-label="線上點餐">
    <section class="consumer-storefront">
      <div class="consumer-cover" aria-hidden="true">
        <img :src="brandLogoSrc" alt="" />
      </div>

      <div class="consumer-store-info">
        <div>
          <h2>Script Coffee</h2>
          <p class="consumer-status-line">
            <Clock3 :size="18" aria-hidden="true" />
            <strong>{{ onlineStatusLabel }}</strong>
            <span>{{ onlineStatusDetail }}</span>
          </p>
          <p class="consumer-status-line">
            <ShoppingBag :size="18" aria-hidden="true" />
            <span>{{ orderMessage }}</span>
          </p>
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
            <span class="product-category">{{ categoryLabels[item.category] }}</span>
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
          <span class="panel-note">{{ cartQuantity }} 件 · {{ formatCurrency(cartTotal) }}</span>
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

      <div class="segmented-control consumer-service-mode" aria-label="取餐方式">
        <button
          v-for="mode in serviceModeOptions"
          :key="mode.value"
          class="segment-button"
          :class="{ 'segment-button--active': serviceMode === mode.value }"
          type="button"
          @click="serviceMode = mode.value"
        >
          {{ mode.label }}
        </button>
      </div>

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
          />
        </label>
        <label v-if="requiresDeliveryAddress" class="wide-field">
          外送地址
          <input v-model="customer.deliveryAddress" type="text" autocomplete="street-address" placeholder="外送地址" />
        </label>
        <label class="wide-field">
          備註
          <textarea v-model="customer.note" rows="3" placeholder="甜度、冰量或其他需求" />
        </label>
      </div>

      <div class="payment-list consumer-payment-list" aria-label="付款方式">
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
      </div>

      <p v-if="formError" class="consumer-form-error">{{ formError }}</p>

      <button class="primary-button consumer-submit-button" type="button" :disabled="!canSubmit" @click="submitOnlineOrder">
        <TicketCheck v-if="!isSubmitting" :size="20" aria-hidden="true" />
        <Clock3 v-else :size="20" aria-hidden="true" />
        {{ isSubmitting ? '送出中' : (canOrderOnline ? '送出訂單' : '暫停接單') }}
      </button>

      <article v-if="lastOrder" class="consumer-confirmation">
        <CheckCircle2 :size="22" aria-hidden="true" />
        <div>
          <strong>{{ lastOrder.id }}</strong>
          <span>{{ formatCurrency(lastOrder.subtotal) }} · 門市接單中</span>
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
