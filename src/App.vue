<script setup lang="ts">
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  LayoutDashboard,
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
import { computed, ref } from 'vue'
import AdminPanel from './components/AdminPanel.vue'
import ConsumerOrderPage from './components/ConsumerOrderPage.vue'
import { usePosSession } from './composables/usePosSession'
import { categoryLabels } from './data/menu'
import { formatCurrency, formatOrderTime, formatRelativeMinutes } from './lib/formatters'
import type { MenuCategory, OrderStatus, PaymentMethod, ServiceMode } from './types/pos'

type AppView = 'pos' | 'admin' | 'online'

const isConsumerDomain =
  globalThis.location?.hostname === 'order.scriptcoffee.com.tw' ||
  globalThis.location?.hostname === 'online.scriptcoffee.com.tw'
const brandLogoSrc = `${import.meta.env.BASE_URL}assets/script-coffee-logo.png`

const readInitialView = (): AppView => {
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
  lastPrintPreview,
  orderQueue,
  paymentMethod,
  pendingOrders,
  printStation,
  refreshBackendData,
  searchTerm,
  selectedCategory,
  sendPrinterHealthcheck,
  serviceMode,
  submitCounterOrder,
  updateOrderStatus,
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

const activeOrder = computed(() => pendingOrders.value[0] ?? orderQueue.value[0] ?? null)
const queueHealth = computed(() => `${pendingOrders.value.length} 張待處理`)
const readyOrders = computed(() => pendingOrders.value.filter((order) => order.status === 'ready').length)
const activeOrderItemCount = computed(
  () => activeOrder.value?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0,
)
const todayRevenue = computed(() => orderQueue.value.reduce((total, order) => total + order.subtotal, 0))
const lastPrintTime = computed(() => (printStation.lastPrintAt ? formatOrderTime(printStation.lastPrintAt) : '尚未列印'))
const activeView = ref<AppView>(readInitialView())
const pageTitle = computed(() => (activeView.value === 'online' ? '線上點餐' : '門市 POS'))
const pageSubtitle = computed(() =>
  activeView.value === 'online' ? '線上菜單 · 自取訂單 · 門市接單' : '櫃台點餐 · 線上訂單 · LAN 列印',
)

const statusClass = (status: OrderStatus): string => `status-chip--${status}`

const setActiveView = (view: AppView): void => {
  activeView.value = view

  if (isConsumerDomain) {
    return
  }

  const params = new URLSearchParams(globalThis.location.search)
  params.set('view', view === 'online' ? 'order' : view)
  globalThis.history.replaceState(null, '', `${globalThis.location.pathname}?${params.toString()}`)
}
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

      <div v-if="!isConsumerDomain" class="topbar-actions">
        <div class="view-switch" aria-label="工作區切換">
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
              <input v-model="searchTerm" type="search" placeholder="搜尋品項或標籤" />
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
                <span>點選加入</span>
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
                <span class="panel-note">依建立時間排序</span>
              </div>
              <span class="queue-count">{{ pendingOrders.length }}</span>
            </div>

            <article v-for="order in orderQueue" :key="order.id" class="order-row" :class="`order-row--${order.status}`">
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
          </section>
        </aside>
      </section>
    </template>

    <AdminPanel v-else @refresh-pos="refreshBackendData" />
  </main>
</template>
