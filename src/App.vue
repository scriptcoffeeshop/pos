<script setup lang="ts">
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  Wifi,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { usePosSession } from './composables/usePosSession'
import { categoryLabels } from './data/menu'
import { formatCurrency, formatOrderTime, formatRelativeMinutes } from './lib/formatters'
import type { MenuCategory, OrderStatus, PaymentMethod, ServiceMode } from './types/pos'

const {
  addItem,
  cartLines,
  cartQuantity,
  cartTotal,
  clearCart,
  customer,
  decreaseLine,
  filteredMenu,
  increaseLine,
  lastPrintPreview,
  orderQueue,
  paymentMethod,
  pendingOrders,
  printStation,
  searchTerm,
  selectedCategory,
  sendPrinterHealthcheck,
  serviceMode,
  submitCounterOrder,
  updateOrderStatus,
} = usePosSession()

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

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: '現金' },
  { value: 'card', label: '刷卡' },
  { value: 'line-pay', label: 'LINE Pay' },
  { value: 'jkopay', label: '街口' },
  { value: 'transfer', label: '轉帳' },
]

const statusActions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'preparing', label: '製作' },
  { value: 'ready', label: '完成' },
  { value: 'served', label: '交付' },
]

const activeOrder = computed(() => pendingOrders.value[0] ?? orderQueue.value[0] ?? null)
const queueHealth = computed(() => `${pendingOrders.value.length} 張待處理`)
</script>

<template>
  <main class="pos-shell">
    <header class="topbar">
      <div class="brand">
        <img src="/assets/script-coffee-logo.png" alt="Script Coffee" class="brand-logo" />
        <div>
          <p class="eyebrow">Script Coffee</p>
          <h1>門市 POS</h1>
        </div>
      </div>

      <div class="topbar-status" aria-label="POS 狀態">
        <span class="status-pill status-pill--success">
          <Wifi :size="18" aria-hidden="true" />
          Supabase 待接
        </span>
        <span class="status-pill" :class="printStation.online ? 'status-pill--success' : 'status-pill--danger'">
          <Printer :size="18" aria-hidden="true" />
          {{ printStation.host }}:{{ printStation.port }}
        </span>
        <span class="status-pill">
          <Clock3 :size="18" aria-hidden="true" />
          {{ queueHealth }}
        </span>
      </div>
    </header>

    <section class="workspace" aria-label="POS 工作台">
      <section class="menu-panel" aria-labelledby="menu-title">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Counter</p>
            <h2 id="menu-title">點餐</h2>
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
            <span class="product-swatch" :style="{ backgroundColor: item.accent }" aria-hidden="true"></span>
            <span class="product-name">{{ item.name }}</span>
            <span class="product-meta">
              <span>{{ categoryLabels[item.category] }}</span>
              <strong>{{ formatCurrency(item.price) }}</strong>
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

        <footer class="checkout-bar">
          <div>
            <span>{{ cartQuantity }} 件</span>
            <strong>{{ formatCurrency(cartTotal) }}</strong>
          </div>
          <button class="primary-button" type="button" :disabled="cartLines.length === 0" @click="submitCounterOrder">
            <ReceiptText :size="20" aria-hidden="true" />
            建立訂單
          </button>
        </footer>
      </section>

      <aside class="queue-panel" aria-labelledby="queue-title">
        <section class="queue-section">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Orders</p>
              <h2 id="queue-title">訂單佇列</h2>
            </div>
            <span class="queue-count">{{ pendingOrders.length }}</span>
          </div>

          <article v-for="order in orderQueue" :key="order.id" class="order-row">
            <div class="order-row-main">
              <span class="order-id">{{ order.id }}</span>
              <strong>{{ order.customerName }}</strong>
              <span>{{ formatOrderTime(order.createdAt) }} · {{ formatRelativeMinutes(order.createdAt) }}</span>
            </div>
            <div class="order-row-meta">
              <span>{{ formatCurrency(order.subtotal) }}</span>
              <span>{{ order.paymentMethod }} / {{ order.paymentStatus }}</span>
            </div>
            <div class="order-actions">
              <button
                v-for="action in statusActions"
                :key="action.value"
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
          <h2>{{ activeOrder.id }}</h2>
          <p>{{ activeOrder.note || '無備註' }}</p>
        </section>
      </aside>
    </section>
  </main>
</template>
