<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  LayoutDashboard,
  LockKeyhole,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Wifi,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AdminPanel from './components/AdminPanel.vue'
import ConsumerOrderPage from './components/ConsumerOrderPage.vue'
import { usePosSession } from './composables/usePosSession'
import { categoryLabels } from './data/menu'
import { formatCurrency, formatDateKey, formatOrderTime, formatRelativeMinutes } from './lib/formatters'
import type { MenuCategory, MenuItem, OrderStatus, PaymentMethod, ServiceMode } from './types/pos'

type AppView = 'pos' | 'admin' | 'online'
type QueueFilter = 'active' | 'ready' | 'all'

const isConsumerDomain =
  globalThis.location?.hostname === 'order.scriptcoffee.com.tw' ||
  globalThis.location?.hostname === 'online.scriptcoffee.com.tw'
const isNativeApp = Capacitor.getPlatform() !== 'web'
const brandLogoSrc = `${import.meta.env.BASE_URL}assets/script-coffee-logo.png`

const readInitialView = (): AppView => {
  if (isNativeApp) {
    return 'pos'
  }

  if (isConsumerDomain) {
    return 'online'
  }

  const params = new URLSearchParams(globalThis.location?.search ?? '')
  const view = params.get('view') ?? params.get('mode')
  const hash = globalThis.location?.hash.replace(/^#\/?/, '')

  if (view === 'admin' || hash === 'admin') {
    return 'admin'
  }

  if (view === 'order' || view === 'online' || hash === 'order' || hash === 'online') {
    return 'online'
  }

  return 'pos'
}

const {
  addItem,
  appendCustomerNote,
  backendStatus,
  cartLines,
  cartQuantity,
  cartTotal,
  clearCart,
  customer,
  decreaseLine,
  filteredMenu,
  increaseLine,
  isSubmitting,
  isLoadingProductStatus,
  lastPrintPreview,
  loadProductStatusCatalog,
  orderQueue,
  paymentMethod,
  pendingOrders,
  printOrder,
  printingOrderId,
  printStation,
  productStatusCatalog,
  productStatusMessage,
  quickAddItems,
  refreshBackendData,
  searchTerm,
  selectedCategory,
  sendPrinterHealthcheck,
  serviceMode,
  submitCounterOrder,
  togglingProductId,
  updateOrderStatus,
  updateProductAvailability,
} = usePosSession({ autoLoad: !isConsumerDomain })

const categoryOptions: Array<{ value: 'all' | MenuCategory; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: categoryLabels.coffee },
  { value: 'tea', label: categoryLabels.tea },
  { value: 'food', label: categoryLabels.food },
  { value: 'retail', label: categoryLabels.retail },
]

const serviceModeOptions: Array<{ value: ServiceMode; label: string }> = [
  { value: 'takeout', label: '外帶' },
  { value: 'dine-in', label: '內用' },
  { value: 'delivery', label: '外送' },
]

const paymentOptions: Array<{ value: PaymentMethod; label: string; visible: boolean }> = [
  { value: 'cash', label: '現金', visible: true },
  { value: 'card', label: '刷卡', visible: false },
  { value: 'line-pay', label: 'LINE Pay', visible: true },
  { value: 'jkopay', label: '街口', visible: true },
  { value: 'transfer', label: '轉帳', visible: false },
]

const visiblePaymentOptions = computed(() => paymentOptions.filter((payment) => payment.visible))

const statusActions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'preparing', label: '製作' },
  { value: 'ready', label: '完成' },
  { value: 'served', label: '交付' },
]

const serviceModeLabels: Record<ServiceMode, string> = {
  'dine-in': '內用',
  takeout: '外帶',
  delivery: '外送',
}

const paymentLabels: Record<PaymentMethod, string> = {
  cash: '現金',
  card: '刷卡',
  'line-pay': 'LINE Pay',
  jkopay: '街口',
  transfer: '轉帳',
}

const paymentStatusLabels = {
  pending: '待收款',
  authorized: '已授權',
  paid: '已付款',
  expired: '逾期',
  failed: '失敗',
} as const

const statusLabels: Record<OrderStatus, string> = {
  new: '新單',
  preparing: '製作中',
  ready: '可交付',
  served: '已交付',
  failed: '異常',
}

const printStatusLabels = {
  queued: '待列印',
  printed: '已列印',
  skipped: '略過',
  failed: '失敗',
} as const

const noteSnippets = ['少冰', '去冰', '無糖', '熱飲', '分開裝', '需要袋子']

const activeOrder = computed(() => pendingOrders.value[0] ?? orderQueue.value[0] ?? null)
const queueHealth = computed(() => `${pendingOrders.value.length} 張待處理`)
const readyOrders = computed(() => pendingOrders.value.filter((order) => order.status === 'ready').length)
const queueFilterOptions = computed(() => [
  { value: 'active' as const, label: '待處理', count: pendingOrders.value.length },
  { value: 'ready' as const, label: '可交付', count: readyOrders.value },
  { value: 'all' as const, label: '全部', count: orderQueue.value.length },
])
const visibleQueueOrders = computed(() => {
  if (queueFilter.value === 'ready') {
    return pendingOrders.value.filter((order) => order.status === 'ready')
  }

  if (queueFilter.value === 'active') {
    return pendingOrders.value
  }

  return orderQueue.value
})
const queueFilterNote = computed(() => {
  if (queueFilter.value === 'ready') {
    return '只顯示可交付訂單'
  }

  if (queueFilter.value === 'active') {
    return '隱藏已交付訂單'
  }

  return '顯示全部訂單'
})
const activeOrderItemCount = computed(
  () => activeOrder.value?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0,
)
const stationProducts = computed(() =>
  [...productStatusCatalog.value]
    .filter((product: MenuItem) => product.posVisible)
    .sort((a: MenuItem, b: MenuItem) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
)
const availableStationProducts = computed(() => stationProducts.value.filter((product) => product.available).length)
const stoppedStationProducts = computed(() => stationProducts.value.length - availableStationProducts.value)
const todayRevenue = computed(() => {
  const todayKey = formatDateKey(new Date())

  return orderQueue.value.reduce((total, order) => {
    const orderDate = new Date(order.createdAt)
    if (Number.isNaN(orderDate.getTime()) || formatDateKey(orderDate) !== todayKey) {
      return total
    }

    return total + order.subtotal
  }, 0)
})
const lastPrintTime = computed(() => (printStation.lastPrintAt ? formatOrderTime(printStation.lastPrintAt) : '尚未列印'))
const activeView = ref<AppView>(readInitialView())
const queueFilter = ref<QueueFilter>('active')
const searchInput = ref<HTMLInputElement | null>(null)
const stationPin = ref('')
const showInternalHeaderControls = computed(() => !isConsumerDomain && activeView.value !== 'online')
const canSwitchWorkspace = computed(() => showInternalHeaderControls.value && !isNativeApp)
const pageTitle = computed(() => {
  if (activeView.value === 'online') {
    return '線上點餐'
  }

  return isNativeApp ? '平板工作站' : '門市 POS'
})
const pageSubtitle = computed(() => {
  if (activeView.value === 'online') {
    return '線上菜單 · 自取訂單 · 門市接單'
  }

  return isNativeApp ? '櫃台點餐 · 線上接單 · 商品暫停 · LAN 出單' : '櫃台點餐 · 線上訂單 · LAN 列印'
})

const statusClass = (status: OrderStatus): string => `status-chip--${status}`

const lineQuantityByItem = (itemId: string): number =>
  cartLines.value.find((line) => line.itemId === itemId)?.quantity ?? 0

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
}

const focusMenuSearch = (): void => {
  void nextTick(() => {
    searchInput.value?.focus()
  })
}

const handlePosShortcut = (event: KeyboardEvent): void => {
  if (activeView.value !== 'pos') {
    return
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    void submitCounterOrder()
    return
  }

  const isEditing = isEditableKeyboardTarget(event.target)
  if (isEditing) {
    if (event.key === 'Escape' && event.target === searchInput.value && searchTerm.value) {
      event.preventDefault()
      searchTerm.value = ''
    }

    return
  }

  if (event.key === '/') {
    event.preventDefault()
    focusMenuSearch()
    return
  }

  if (event.key === 'Escape' && searchTerm.value) {
    event.preventDefault()
    searchTerm.value = ''
    return
  }

  if (/^[1-6]$/.test(event.key) && !event.altKey && !event.metaKey && !event.ctrlKey) {
    const item = quickAddItems.value[Number(event.key) - 1]
    if (item) {
      event.preventDefault()
      addItem(item)
    }
  }
}

const setActiveView = (view: AppView): void => {
  if (isNativeApp) {
    activeView.value = 'pos'
    globalThis.history.replaceState(null, '', globalThis.location.pathname)
    return
  }

  activeView.value = view

  if (isConsumerDomain) {
    return
  }

  const params = new URLSearchParams(globalThis.location.search)
  params.set('view', view === 'online' ? 'order' : view)
  globalThis.history.replaceState(null, '', `${globalThis.location.pathname}?${params.toString()}`)
}

const loadStationProducts = (): void => {
  void loadProductStatusCatalog(stationPin.value.trim())
}

const toggleStationProduct = (product: MenuItem): void => {
  void updateProductAvailability(stationPin.value.trim(), product.id, !product.available)
}

onMounted(() => {
  globalThis.addEventListener('keydown', handlePosShortcut)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', handlePosShortcut)
})
</script>

<template>
  <main class="pos-shell" :class="{ 'pos-shell--consumer': activeView === 'online' }">
    <header class="topbar">
      <div class="brand">
        <img :src="brandLogoSrc" alt="Script Coffee" class="brand-logo" />
        <div>
          <p class="eyebrow">Script Coffee</p>
          <h1>{{ pageTitle }}</h1>
          <span class="brand-subtitle">{{ pageSubtitle }}</span>
        </div>
      </div>

      <div v-if="showInternalHeaderControls" class="topbar-actions">
        <div v-if="canSwitchWorkspace" class="view-switch" aria-label="工作區切換">
          <button
            class="view-switch-button"
            :class="{ 'view-switch-button--active': activeView === 'pos' }"
            type="button"
            @click="setActiveView('pos')"
          >
            <LayoutDashboard :size="18" aria-hidden="true" />
            POS
          </button>
          <button
            class="view-switch-button"
            :class="{ 'view-switch-button--active': activeView === 'online' }"
            type="button"
            @click="setActiveView('online')"
          >
            <ShoppingBag :size="18" aria-hidden="true" />
            線上
          </button>
          <button
            class="view-switch-button"
            :class="{ 'view-switch-button--active': activeView === 'admin' }"
            type="button"
            @click="setActiveView('admin')"
          >
            <Settings2 :size="18" aria-hidden="true" />
            後台
          </button>
        </div>
        <span v-else-if="isNativeApp" class="status-pill status-pill--success">
          <LockKeyhole :size="18" aria-hidden="true" />
          APK 工作站
        </span>

        <div v-if="activeView !== 'online'" class="topbar-status" aria-label="POS 狀態">
          <span
            class="status-pill"
            :class="backendStatus.mode === 'fallback' ? 'status-pill--danger' : 'status-pill--success'"
            :title="backendStatus.detail"
          >
            <Wifi :size="18" aria-hidden="true" />
            {{ backendStatus.label }}
          </span>
          <span class="status-pill" :class="printStation.online ? 'status-pill--success' : 'status-pill--danger'">
            <Printer :size="18" aria-hidden="true" />
            {{ printStation.host }}:{{ printStation.port }}
          </span>
          <span class="status-pill">
            <Clock3 :size="18" aria-hidden="true" />
            {{ queueHealth }}
          </span>
          <button
            class="icon-button sync-button"
            :class="{ 'sync-button--active': backendStatus.mode === 'syncing' }"
            type="button"
            title="重新同步 POS API"
            :disabled="backendStatus.mode === 'syncing'"
            @click="refreshBackendData"
          >
            <RefreshCw :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

    <ConsumerOrderPage v-if="activeView === 'online'" />

    <template v-else-if="activeView === 'pos'">
      <section class="overview-strip" aria-label="今日營運摘要">
        <article>
          <span>今日營收</span>
          <strong>{{ formatCurrency(todayRevenue) }}</strong>
        </article>
        <article>
          <span>待處理</span>
          <strong>{{ pendingOrders.length }}</strong>
        </article>
        <article>
          <span>可交付</span>
          <strong>{{ readyOrders }}</strong>
        </article>
        <article>
          <span>列印狀態</span>
          <strong>{{ printStation.online ? '在線' : '離線' }}</strong>
        </article>
      </section>

      <section class="workspace" aria-label="POS 工作台">
        <section class="menu-panel" aria-labelledby="menu-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Counter</p>
              <h2 id="menu-title">點餐</h2>
              <span class="panel-note">顯示 {{ filteredMenu.length }} 個可售品項</span>
            </div>
            <label class="search-box">
              <Search :size="18" aria-hidden="true" />
              <input ref="searchInput" v-model="searchTerm" type="search" placeholder="搜尋品項或標籤" />
            </label>
          </div>

          <div class="segmented-control" aria-label="品項分類">
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

          <div v-if="quickAddItems.length > 0" class="quick-add-strip" aria-label="快速加購">
            <button
              v-for="(item, index) in quickAddItems"
              :key="item.id"
              class="quick-add-button"
              type="button"
              @click="addItem(item)"
            >
              <span class="quick-add-rank">{{ index + 1 }}</span>
              <span class="quick-add-name">{{ item.name }}</span>
              <strong>{{ formatCurrency(item.price) }}</strong>
              <span v-if="lineQuantityByItem(item.id) > 0" class="quick-add-count">
                x{{ lineQuantityByItem(item.id) }}
              </span>
            </button>
          </div>

          <div class="product-grid">
            <button
              v-for="item in filteredMenu"
              :key="item.id"
              class="product-tile"
              type="button"
              @click="addItem(item)"
            >
              <span class="product-tile-top">
                <span class="product-swatch" :style="{ backgroundColor: item.accent }" aria-hidden="true"></span>
                <span class="product-category">{{ categoryLabels[item.category] }}</span>
              </span>
              <span class="product-name">{{ item.name }}</span>
              <span class="product-meta">
                <strong>{{ formatCurrency(item.price) }}</strong>
                <span>{{ lineQuantityByItem(item.id) > 0 ? `已加 ${lineQuantityByItem(item.id)}` : '點選加入' }}</span>
              </span>
              <span class="product-tags">{{ item.tags.join(' / ') }}</span>
            </button>
          </div>
        </section>

        <section class="cart-panel" aria-labelledby="cart-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Cart</p>
              <h2 id="cart-title">目前訂單</h2>
              <span class="panel-note">{{ serviceModeLabels[serviceMode] }} · {{ paymentLabels[paymentMethod] }}</span>
            </div>
            <button class="icon-button" type="button" title="清空購物車" @click="clearCart">
              <Trash2 :size="20" aria-hidden="true" />
            </button>
          </div>

          <div class="segmented-control" aria-label="服務方式">
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

          <div class="cart-lines" aria-live="polite">
            <article v-for="line in cartLines" :key="line.itemId" class="cart-line">
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

            <div v-if="cartLines.length === 0" class="empty-state">
              <ShoppingCart :size="24" aria-hidden="true" />
              <span>尚未加入品項</span>
            </div>
          </div>

          <div class="customer-grid">
            <label>
              姓名
              <input v-model="customer.name" type="text" autocomplete="name" />
            </label>
            <label>
              電話
              <input v-model="customer.phone" type="tel" autocomplete="tel" />
            </label>
            <label class="wide-field">
              備註
              <textarea v-model="customer.note" rows="3" />
            </label>
          </div>

          <div class="note-shortcuts" aria-label="常用備註">
            <button v-for="note in noteSnippets" :key="note" type="button" @click="appendCustomerNote(note)">
              {{ note }}
            </button>
          </div>

          <div class="payment-list" aria-label="付款方式">
            <button
              v-for="payment in visiblePaymentOptions"
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

          <footer class="checkout-bar">
            <div>
              <span>{{ cartQuantity }} 件</span>
              <strong>{{ formatCurrency(cartTotal) }}</strong>
            </div>
            <button
              class="primary-button"
              type="button"
              :disabled="cartLines.length === 0 || isSubmitting"
              @click="submitCounterOrder"
            >
              <ReceiptText :size="20" aria-hidden="true" />
              {{ isSubmitting ? '建立中' : '建立訂單' }}
            </button>
          </footer>
        </section>

        <aside class="queue-panel" aria-labelledby="queue-title">
          <section class="queue-section">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Orders</p>
                <h2 id="queue-title">訂單佇列</h2>
                <span class="panel-note">{{ queueFilterNote }}</span>
              </div>
              <span class="queue-count">{{ pendingOrders.length }}</span>
            </div>

            <div class="segmented-control queue-filter" aria-label="訂單篩選">
              <button
                v-for="filter in queueFilterOptions"
                :key="filter.value"
                class="segment-button queue-filter-button"
                :class="{ 'segment-button--active': queueFilter === filter.value }"
                type="button"
                @click="queueFilter = filter.value"
              >
                <span>{{ filter.label }}</span>
                <strong>{{ filter.count }}</strong>
              </button>
            </div>

            <article v-for="order in visibleQueueOrders" :key="order.id" class="order-row" :class="`order-row--${order.status}`">
              <div class="order-row-main">
                <div class="order-row-title">
                  <span class="order-id">{{ order.id }}</span>
                  <span class="status-chip" :class="statusClass(order.status)">{{ statusLabels[order.status] }}</span>
                </div>
                <strong>{{ order.customerName }}</strong>
                <span>
                  {{ serviceModeLabels[order.mode] }} · {{ order.lines.length }} 項 ·
                  {{ formatOrderTime(order.createdAt) }} · {{ formatRelativeMinutes(order.createdAt) }}
                </span>
              </div>
              <div class="order-row-meta">
                <span>{{ formatCurrency(order.subtotal) }}</span>
                <span>{{ paymentLabels[order.paymentMethod] }} / {{ paymentStatusLabels[order.paymentStatus] }}</span>
                <span>{{ printStatusLabels[order.printStatus] }}</span>
              </div>
              <div class="order-actions">
                <button
                  class="order-action--print"
                  type="button"
                  :disabled="printingOrderId === order.id"
                  @click="printOrder(order.id)"
                >
                  <Printer :size="16" aria-hidden="true" />
                  {{ printingOrderId === order.id ? '出單中' : '出單' }}
                </button>
                <button
                  v-for="action in statusActions"
                  :key="action.value"
                  :class="{ 'order-action--active': order.status === action.value }"
                  type="button"
                  :disabled="order.status === action.value"
                  @click="updateOrderStatus(order.id, action.value)"
                >
                  {{ action.label }}
                </button>
              </div>
            </article>

            <div v-if="visibleQueueOrders.length === 0" class="empty-state queue-empty-state">
              <ReceiptText :size="24" aria-hidden="true" />
              <span>目前沒有符合條件的訂單</span>
            </div>
          </section>

          <section v-if="isNativeApp" class="station-section" aria-labelledby="station-title">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Station</p>
                <h2 id="station-title">前台操作</h2>
                <span class="panel-note">
                  {{ availableStationProducts }} 個可售 · {{ stoppedStationProducts }} 個暫停
                </span>
              </div>
            </div>

            <div class="station-pin-row">
              <label>
                PIN
                <input v-model="stationPin" type="password" inputmode="numeric" autocomplete="off" placeholder="管理 PIN" />
              </label>
              <button type="button" :disabled="isLoadingProductStatus" @click="loadStationProducts">
                <RefreshCw :size="16" aria-hidden="true" />
                {{ isLoadingProductStatus ? '載入中' : '載入' }}
              </button>
            </div>

            <p class="station-message">{{ productStatusMessage }}</p>

            <div class="station-product-list" aria-label="前台商品狀態">
              <article v-for="product in stationProducts" :key="product.id" class="station-product-row">
                <span class="product-swatch" :style="{ backgroundColor: product.accent }" aria-hidden="true"></span>
                <span>
                  <strong>{{ product.name }}</strong>
                  <small>{{ categoryLabels[product.category] }} · {{ formatCurrency(product.price) }}</small>
                </span>
                <button
                  type="button"
                  :class="{ 'station-product-toggle--stopped': !product.available }"
                  :disabled="togglingProductId === product.id"
                  @click="toggleStationProduct(product)"
                >
                  <EyeOff v-if="product.available" :size="16" aria-hidden="true" />
                  <Eye v-else :size="16" aria-hidden="true" />
                  {{ product.available ? '暫停' : '恢復' }}
                </button>
              </article>
            </div>
          </section>

          <section class="printer-section">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">LAN Printing</p>
                <h2>列印站</h2>
                <span class="panel-note">最後列印：{{ lastPrintTime }}</span>
              </div>
              <button class="icon-button" type="button" title="送出測試列印" @click="sendPrinterHealthcheck">
                <Printer :size="20" aria-hidden="true" />
              </button>
            </div>

            <div class="printer-health">
              <CheckCircle2 v-if="printStation.online" :size="20" aria-hidden="true" />
              <CircleAlert v-else :size="20" aria-hidden="true" />
              <div>
                <strong>{{ printStation.name }}</strong>
                <span>{{ printStation.protocol }}</span>
              </div>
            </div>

            <label class="toggle-row">
              <input v-model="printStation.autoPrint" type="checkbox" />
              自動列印新訂單
            </label>

            <pre class="print-preview">{{ lastPrintPreview }}</pre>
          </section>

          <section v-if="activeOrder" class="active-order">
            <p class="eyebrow">Next</p>
            <div class="next-order-title">
              <h2>{{ activeOrder.id }}</h2>
              <span class="status-chip" :class="statusClass(activeOrder.status)">{{ statusLabels[activeOrder.status] }}</span>
            </div>
            <p>{{ activeOrder.customerName }} · {{ activeOrderItemCount }} 件 · {{ activeOrder.note || '無備註' }}</p>
            <button
              class="active-order-print-button"
              type="button"
              :disabled="printingOrderId === activeOrder.id"
              @click="printOrder(activeOrder.id)"
            >
              <Printer :size="16" aria-hidden="true" />
              {{ printingOrderId === activeOrder.id ? '出單中' : '立即出單' }}
            </button>
          </section>
        </aside>
      </section>
    </template>

    <AdminPanel v-else @refresh-pos="refreshBackendData" />
  </main>
</template>
