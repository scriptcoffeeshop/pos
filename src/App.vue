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
  WalletCards,
  Trash2,
  Wifi,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminPanel from './components/AdminPanel.vue'
import ConsumerOrderPage from './components/ConsumerOrderPage.vue'
import { usePosSession } from './composables/usePosSession'
import { categoryLabels } from './data/menu'
import { formatCurrency, formatDateKey, formatOrderTime, formatRelativeMinutes } from './lib/formatters'
import type { MenuCategory, MenuItem, OrderStatus, PaymentMethod, PaymentStatus, PosOrder, PrintJob, ServiceMode } from './types/pos'

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
  claimLabelFor,
  claimOrderForStation,
  claimingOrderId,
  closeRegisterSessionForStation,
  customer,
  decreaseLine,
  filteredMenu,
  increaseLine,
  isSubmitting,
  isLoadingProductStatus,
  isRegisterBusy,
  lastPrintPreview,
  loadProductStatusCatalog,
  loadRegisterSession,
  orderClaimExpired,
  orderClaimedByCurrentStation,
  orderClaimedByOtherStation,
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
  registerMessage,
  registerSession,
  refundingOrderId,
  refundOrderForStation,
  releaseOrderClaimForStation,
  searchTerm,
  selectedCategory,
  sendPrinterHealthcheck,
  serviceMode,
  stationClaimLabel,
  submitCounterOrder,
  togglingProductId,
  openRegisterSessionForStation,
  updateOrderStatus,
  updatePaymentStatus,
  updateProductAvailability,
  updatingPaymentOrderId,
  voidingOrderId,
  voidOrderForStation,
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
  refunded: '已退款',
} as const

const statusLabels: Record<OrderStatus, string> = {
  new: '新單',
  preparing: '製作中',
  ready: '可交付',
  served: '已交付',
  failed: '異常',
  voided: '已作廢',
}

const printStatusLabels = {
  queued: '待列印',
  printed: '已列印',
  skipped: '略過',
  failed: '失敗',
} as const

const noteSnippets = ['少冰', '去冰', '無糖', '熱飲', '分開裝', '需要袋子']
const currentTime = ref(Date.now())

const activeOrder = computed(() =>
  pendingOrders.value.find((order) => !orderClaimedByOtherStation(order) || orderClaimExpired(order, currentTime.value)) ??
  pendingOrders.value[0] ??
  orderQueue.value[0] ??
  null,
)
const queueHealth = computed(() => `${pendingOrders.value.length} 張待處理`)
const readyOrders = computed(() => pendingOrders.value.filter((order) => order.status === 'ready').length)
const todayOrders = computed(() => {
  const todayKey = formatDateKey(new Date())

  return orderQueue.value.filter((order) => {
    const orderDate = new Date(order.createdAt)
    return Number.isFinite(orderDate.getTime()) && formatDateKey(orderDate) === todayKey
  })
})
const salesCloseoutOrders = computed(() =>
  todayOrders.value.filter((order) => order.status !== 'failed' && order.status !== 'voided'),
)
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
const lowStockStationProducts = computed(() =>
  stationProducts.value.filter((product) =>
    product.inventoryCount !== null &&
    product.lowStockThreshold !== null &&
    product.inventoryCount > 0 &&
    product.inventoryCount <= product.lowStockThreshold,
  ),
)
const todayRevenue = computed(() => salesCloseoutOrders.value.reduce((total, order) => total + order.subtotal, 0))
const closeoutSummary = computed(() => {
  const collectedStatuses = new Set(['authorized', 'paid'])

  return todayOrders.value.reduce(
    (summary, order) => {
      const isSaleOrder = order.status !== 'failed' && order.status !== 'voided'

      if (isSaleOrder && collectedStatuses.has(order.paymentStatus)) {
        summary.collectedTotal += order.subtotal
      }

      if (isSaleOrder && order.paymentStatus === 'pending') {
        summary.pendingTotal += order.subtotal
        summary.pendingCount += 1
      }

      if (order.status !== 'voided' && (order.paymentStatus === 'failed' || order.paymentStatus === 'expired')) {
        summary.failedPaymentCount += 1
      }

      if (order.status !== 'voided' && order.printStatus === 'failed') {
        summary.failedPrintCount += 1
      }

      if (order.status === 'voided') {
        summary.voidedCount += 1
      }

      return summary
    },
    {
      collectedTotal: 0,
      pendingTotal: 0,
      pendingCount: 0,
      failedPaymentCount: 0,
      failedPrintCount: 0,
      voidedCount: 0,
    },
  )
})
const paymentCloseoutRows = computed(() =>
  paymentOptions
    .map((payment) => {
      const matchingOrders = salesCloseoutOrders.value.filter((order) => order.paymentMethod === payment.value)
      return {
        ...payment,
        count: matchingOrders.length,
        total: matchingOrders.reduce((sum, order) => sum + order.subtotal, 0),
        pending: matchingOrders.filter((order) => order.paymentStatus === 'pending').length,
      }
    })
    .filter((payment) => payment.count > 0 || payment.visible),
)
const lastPrintTime = computed(() => (printStation.lastPrintAt ? formatOrderTime(printStation.lastPrintAt) : '尚未列印'))
const activeView = ref<AppView>(readInitialView())
const queueFilter = ref<QueueFilter>('active')
const searchInput = ref<HTMLInputElement | null>(null)
const stationPin = ref('')
const registerPin = ref('')
const registerOpeningCash = ref(0)
const registerClosingCash = ref(0)
const registerNote = ref('')
let claimClockTimer: number | null = null
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
const registerIsOpen = computed(() => registerSession.value?.status === 'open')
const registerStatusLabel = computed(() => {
  if (!registerSession.value) {
    return '未開班'
  }

  if (registerSession.value.status === 'open') {
    return `營業中 · ${formatOrderTime(registerSession.value.openedAt)}`
  }

  return `已關班 · ${formatOrderTime(registerSession.value.closedAt ?? registerSession.value.openedAt)}`
})
const registerVariance = computed(() => {
  if (!registerSession.value) {
    return 0
  }

  const countedCash = registerSession.value.status === 'closed'
    ? registerSession.value.closingCash ?? 0
    : registerClosingCash.value

  return countedCash - registerSession.value.expectedCash
})
const registerVarianceClass = computed(() => {
  if (registerVariance.value === 0) {
    return 'register-variance--balanced'
  }

  return registerVariance.value > 0 ? 'register-variance--over' : 'register-variance--short'
})

const statusClass = (status: OrderStatus): string => `status-chip--${status}`

const lineQuantityByItem = (itemId: string): number =>
  cartLines.value.find((line) => line.itemId === itemId)?.quantity ?? 0

const isProductTemporarilyStopped = (product: MenuItem): boolean => {
  if (!product.soldOutUntil) {
    return false
  }

  const stoppedUntil = new Date(product.soldOutUntil).getTime()
  return Number.isFinite(stoppedUntil) && stoppedUntil > Date.now()
}

const productStockLabel = (product: MenuItem): string => {
  if (isProductTemporarilyStopped(product)) {
    return `暫停至 ${formatOrderTime(product.soldOutUntil ?? '')}`
  }

  if (product.inventoryCount === 0) {
    return '售完'
  }

  if (product.inventoryCount === null) {
    return ''
  }

  if (product.lowStockThreshold !== null && product.inventoryCount <= product.lowStockThreshold) {
    return `低庫存 ${product.inventoryCount}`
  }

  return `剩 ${product.inventoryCount}`
}

const productStockClass = (product: MenuItem): string => {
  if (product.inventoryCount === 0 || isProductTemporarilyStopped(product)) {
    return 'product-stock-badge--stopped'
  }

  if (
    product.inventoryCount !== null &&
    product.lowStockThreshold !== null &&
    product.inventoryCount <= product.lowStockThreshold
  ) {
    return 'product-stock-badge--low'
  }

  return 'product-stock-badge--ok'
}

const printAttemptCount = (order: PosOrder): number =>
  order.printJobs.reduce((total, printJob) => total + printJob.attempts, 0)

const latestPrintJob = (order: PosOrder): PrintJob | null =>
  [...order.printJobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null

const printSummary = (order: PosOrder): string => {
  const latestJob = latestPrintJob(order)
  const attempts = printAttemptCount(order)

  if (!latestJob) {
    return printStatusLabels[order.printStatus]
  }

  const attemptText = attempts > 0 ? ` · ${attempts} 次` : ''
  if (latestJob.lastError) {
    return `${printStatusLabels[order.printStatus]}${attemptText} · ${latestJob.lastError}`
  }

  return `${printStatusLabels[order.printStatus]}${attemptText}`
}

const printActionLabel = (order: PosOrder): string => {
  if (printingOrderId.value === order.id) {
    return '出單中'
  }

  return order.printJobs.length > 0 ? '重印' : '出單'
}

const claimActionLabel = (order: PosOrder): string => {
  if (claimingOrderId.value === order.id) {
    return '鎖定中'
  }

  if (orderClaimedByCurrentStation(order)) {
    return '釋放'
  }

  if (order.claimedBy && orderClaimExpired(order, currentTime.value)) {
    return '接手'
  }

  if (orderClaimedByOtherStation(order)) {
    return '鎖定中'
  }

  return '鎖定'
}

const claimChipClass = (order: PosOrder): string => {
  if (orderClaimedByCurrentStation(order)) {
    return 'claim-chip--mine'
  }

  if (orderClaimedByOtherStation(order)) {
    return 'claim-chip--locked'
  }

  if (order.claimedBy) {
    return 'claim-chip--expired'
  }

  return ''
}

const claimOrderAction = (order: PosOrder): void => {
  if (orderClaimedByCurrentStation(order)) {
    void releaseOrderClaimForStation(order.id)
    return
  }

  void claimOrderForStation(order.id, Boolean(order.claimedBy && orderClaimExpired(order, currentTime.value)))
}

const claimActionDisabled = (order: PosOrder): boolean =>
  claimingOrderId.value === order.id ||
  (orderClaimedByOtherStation(order) && !orderClaimExpired(order, currentTime.value))

const payableStatuses: PaymentStatus[] = ['pending', 'authorized']

const paymentActionLabel = (order: PosOrder): string => {
  if (updatingPaymentOrderId.value === order.id) {
    return '收款中'
  }

  if (order.paymentStatus === 'pending') {
    return '收款'
  }

  if (order.paymentStatus === 'authorized') {
    return '入帳'
  }

  return ''
}

const paymentActionDisabled = (order: PosOrder): boolean =>
  updatingPaymentOrderId.value === order.id ||
  orderClaimedByOtherStation(order) ||
  !payableStatuses.includes(order.paymentStatus)

const confirmPaymentAction = (order: PosOrder): void => {
  void updatePaymentStatus(order.id, 'paid')
}

const orderCanBeVoided = (order: PosOrder): boolean =>
  order.paymentStatus === 'pending' &&
  !['served', 'failed', 'voided'].includes(order.status) &&
  !orderClaimedByOtherStation(order)

const orderCanBeRefunded = (order: PosOrder): boolean =>
  ['authorized', 'paid'].includes(order.paymentStatus) &&
  !['failed', 'voided'].includes(order.status) &&
  !orderClaimedByOtherStation(order)

const voidActionLabel = (order: PosOrder): string => (
  voidingOrderId.value === order.id ? '作廢中' : '作廢'
)

const refundActionLabel = (order: PosOrder): string => (
  refundingOrderId.value === order.id ? '退款中' : '退款'
)

const voidOrderAction = (order: PosOrder): void => {
  void voidOrderForStation(stationPin.value.trim(), order.id)
}

const refundOrderAction = (order: PosOrder): void => {
  void refundOrderForStation(stationPin.value.trim(), order.id)
}

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

const openRegisterSessionAction = (): void => {
  void openRegisterSessionForStation(registerPin.value.trim(), registerOpeningCash.value, registerNote.value.trim())
}

const closeRegisterSessionAction = (): void => {
  void closeRegisterSessionForStation(registerPin.value.trim(), registerClosingCash.value, registerNote.value.trim())
}

watch(
  registerSession,
  (session) => {
    if (session?.status === 'open') {
      registerClosingCash.value = session.expectedCash
    }
  },
  { immediate: true },
)

onMounted(() => {
  globalThis.addEventListener('keydown', handlePosShortcut)
  claimClockTimer = globalThis.setInterval(() => {
    currentTime.value = Date.now()
  }, 15_000)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', handlePosShortcut)
  if (claimClockTimer !== null) {
    globalThis.clearInterval(claimClockTimer)
  }
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
          <span class="status-pill status-pill--neutral">
            <LockKeyhole :size="18" aria-hidden="true" />
            {{ stationClaimLabel }}
          </span>
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
          <span>已收款</span>
          <strong>{{ formatCurrency(closeoutSummary.collectedTotal) }}</strong>
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
              <span v-if="productStockLabel(item)" class="product-stock-badge" :class="productStockClass(item)">
                {{ productStockLabel(item) }}
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

            <article
              v-for="order in visibleQueueOrders"
              :key="order.id"
              class="order-row"
              :class="[`order-row--${order.status}`, { 'order-row--claimed-other': orderClaimedByOtherStation(order) }]"
            >
              <div class="order-row-main">
                <div class="order-row-title">
                  <span class="order-id">{{ order.id }}</span>
                  <span class="order-row-title-chips">
                    <span v-if="claimLabelFor(order)" class="claim-chip" :class="claimChipClass(order)">
                      <LockKeyhole :size="13" aria-hidden="true" />
                      {{ claimLabelFor(order) }}
                    </span>
                    <span class="status-chip" :class="statusClass(order.status)">{{ statusLabels[order.status] }}</span>
                  </span>
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
                <span :class="{ 'order-print-summary--failed': order.printStatus === 'failed' }">
                  {{ printSummary(order) }}
                </span>
              </div>
              <div class="order-actions">
                <button
                  v-if="paymentActionLabel(order)"
                  class="order-action--payment"
                  type="button"
                  :disabled="paymentActionDisabled(order)"
                  @click="confirmPaymentAction(order)"
                >
                  <CreditCard :size="16" aria-hidden="true" />
                  {{ paymentActionLabel(order) }}
                </button>
                <button
                  class="order-action--print"
                  type="button"
                  :disabled="printingOrderId === order.id || orderClaimedByOtherStation(order)"
                  @click="printOrder(order.id)"
                >
                  <Printer :size="16" aria-hidden="true" />
                  {{ printActionLabel(order) }}
                </button>
                <button
                  class="order-action--claim"
                  type="button"
                  :class="{ 'order-action--active': orderClaimedByCurrentStation(order) }"
                  :disabled="claimActionDisabled(order)"
                  @click="claimOrderAction(order)"
                >
                  <LockKeyhole :size="16" aria-hidden="true" />
                  {{ claimActionLabel(order) }}
                </button>
                <button
                  v-if="orderCanBeVoided(order)"
                  class="order-action--void"
                  type="button"
                  :disabled="voidingOrderId === order.id"
                  @click="voidOrderAction(order)"
                >
                  <Trash2 :size="16" aria-hidden="true" />
                  {{ voidActionLabel(order) }}
                </button>
                <button
                  v-if="orderCanBeRefunded(order)"
                  class="order-action--refund"
                  type="button"
                  :disabled="refundingOrderId === order.id"
                  @click="refundOrderAction(order)"
                >
                  <WalletCards :size="16" aria-hidden="true" />
                  {{ refundActionLabel(order) }}
                </button>
                <button
                  v-for="action in statusActions"
                  :key="action.value"
                  :class="{ 'order-action--active': order.status === action.value }"
                  type="button"
                  :disabled="order.status === action.value || orderClaimedByOtherStation(order)"
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
                  {{ availableStationProducts }} 個可售 · {{ stoppedStationProducts }} 個暫停 ·
                  {{ lowStockStationProducts.length }} 個低庫存
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
                  <small>
                    {{ categoryLabels[product.category] }} · {{ formatCurrency(product.price) }}
                    <template v-if="productStockLabel(product)"> · {{ productStockLabel(product) }}</template>
                  </small>
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

          <section class="closeout-section" aria-labelledby="closeout-title">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Closeout</p>
                <h2 id="closeout-title">關帳摘要</h2>
                <span class="panel-note">
                  {{ todayOrders.length }} 張單 · 待收 {{ closeoutSummary.pendingCount }} 張
                </span>
              </div>
              <WalletCards :size="22" aria-hidden="true" />
            </div>

            <div class="closeout-grid">
              <article>
                <span>已收</span>
                <strong>{{ formatCurrency(closeoutSummary.collectedTotal) }}</strong>
              </article>
              <article>
                <span>待收</span>
                <strong>{{ formatCurrency(closeoutSummary.pendingTotal) }}</strong>
              </article>
              <article>
                <span>付款異常</span>
                <strong>{{ closeoutSummary.failedPaymentCount }}</strong>
              </article>
              <article>
                <span>列印異常</span>
                <strong>{{ closeoutSummary.failedPrintCount }}</strong>
              </article>
              <article>
                <span>作廢</span>
                <strong>{{ closeoutSummary.voidedCount }}</strong>
              </article>
            </div>

            <div class="payment-closeout-list" aria-label="付款方式對帳">
              <article v-for="payment in paymentCloseoutRows" :key="payment.value">
                <span>{{ payment.label }}</span>
                <strong>{{ formatCurrency(payment.total) }}</strong>
                <small>{{ payment.count }} 張<span v-if="payment.pending"> · 待收 {{ payment.pending }}</span></small>
              </article>
            </div>

            <div class="register-session-panel" aria-label="班別開關帳">
              <div class="register-session-heading">
                <div>
                  <span>班別</span>
                  <strong>{{ registerStatusLabel }}</strong>
                  <small>{{ registerMessage }}</small>
                </div>
                <button
                  class="icon-button"
                  type="button"
                  title="重新載入班別"
                  :disabled="isRegisterBusy"
                  @click="loadRegisterSession"
                >
                  <RefreshCw :size="18" aria-hidden="true" />
                </button>
              </div>

              <div v-if="registerSession" class="register-metrics">
                <article>
                  <span>預期現金</span>
                  <strong>{{ formatCurrency(registerSession.expectedCash) }}</strong>
                </article>
                <article>
                  <span>現金銷售</span>
                  <strong>{{ formatCurrency(registerSession.cashSales) }}</strong>
                </article>
                <article>
                  <span>非現金</span>
                  <strong>{{ formatCurrency(registerSession.nonCashSales) }}</strong>
                </article>
                <article>
                  <span>待收</span>
                  <strong>{{ formatCurrency(registerSession.pendingTotal) }}</strong>
                </article>
                <article>
                  <span>單數</span>
                  <strong>{{ registerSession.orderCount }}</strong>
                </article>
                <article>
                  <span>未交付</span>
                  <strong>{{ registerSession.openOrderCount }}</strong>
                </article>
                <article>
                  <span>付款異常</span>
                  <strong>{{ registerSession.failedPaymentCount }}</strong>
                </article>
                <article>
                  <span>列印失敗</span>
                  <strong>{{ registerSession.failedPrintCount }}</strong>
                </article>
                <article>
                  <span>作廢</span>
                  <strong>{{ registerSession.voidedOrderCount }}</strong>
                </article>
                <article :class="registerVarianceClass">
                  <span>現金差額</span>
                  <strong>{{ formatCurrency(registerVariance) }}</strong>
                </article>
              </div>

              <div class="register-form-grid">
                <label>
                  管理 PIN
                  <input v-model="registerPin" type="password" inputmode="numeric" autocomplete="off" />
                </label>
                <label v-if="!registerIsOpen">
                  開班現金
                  <input v-model.number="registerOpeningCash" type="number" min="0" step="1" inputmode="numeric" />
                </label>
                <label v-else>
                  實點現金
                  <input v-model.number="registerClosingCash" type="number" min="0" step="1" inputmode="numeric" />
                </label>
                <label class="wide-field">
                  備註
                  <input v-model="registerNote" type="text" placeholder="交接、差額或補充說明" />
                </label>
              </div>

              <button
                v-if="registerIsOpen"
                class="register-action-button register-action-button--close"
                type="button"
                :disabled="isRegisterBusy"
                @click="closeRegisterSessionAction"
              >
                <WalletCards :size="18" aria-hidden="true" />
                {{ isRegisterBusy ? '關班中' : '關班' }}
              </button>
              <button
                v-else
                class="register-action-button"
                type="button"
                :disabled="isRegisterBusy"
                @click="openRegisterSessionAction"
              >
                <WalletCards :size="18" aria-hidden="true" />
                {{ isRegisterBusy ? '開班中' : '開班' }}
              </button>
            </div>
          </section>

          <section v-if="activeOrder" class="active-order">
            <p class="eyebrow">Next</p>
            <div class="next-order-title">
              <h2>{{ activeOrder.id }}</h2>
              <span class="order-row-title-chips">
                <span v-if="claimLabelFor(activeOrder)" class="claim-chip" :class="claimChipClass(activeOrder)">
                  <LockKeyhole :size="13" aria-hidden="true" />
                  {{ claimLabelFor(activeOrder) }}
                </span>
                <span class="status-chip" :class="statusClass(activeOrder.status)">
                  {{ statusLabels[activeOrder.status] }}
                </span>
              </span>
            </div>
            <p>{{ activeOrder.customerName }} · {{ activeOrderItemCount }} 件 · {{ activeOrder.note || '無備註' }}</p>
            <button
              v-if="paymentActionLabel(activeOrder)"
              class="active-order-payment-button"
              type="button"
              :disabled="paymentActionDisabled(activeOrder)"
              @click="confirmPaymentAction(activeOrder)"
            >
              <CreditCard :size="16" aria-hidden="true" />
              {{ paymentActionLabel(activeOrder) }}
            </button>
            <button
              v-if="orderCanBeVoided(activeOrder)"
              class="active-order-void-button"
              type="button"
              :disabled="voidingOrderId === activeOrder.id"
              @click="voidOrderAction(activeOrder)"
            >
              <Trash2 :size="16" aria-hidden="true" />
              {{ voidActionLabel(activeOrder) }}
            </button>
            <button
              v-if="orderCanBeRefunded(activeOrder)"
              class="active-order-refund-button"
              type="button"
              :disabled="refundingOrderId === activeOrder.id"
              @click="refundOrderAction(activeOrder)"
            >
              <WalletCards :size="16" aria-hidden="true" />
              {{ refundActionLabel(activeOrder) }}
            </button>
            <button
              class="active-order-print-button"
              type="button"
              :disabled="printingOrderId === activeOrder.id || orderClaimedByOtherStation(activeOrder)"
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
