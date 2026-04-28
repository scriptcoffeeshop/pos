<script setup lang="ts">
import {
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
import { computed, onMounted, reactive, ref } from 'vue'
import { categoryLabels, menuItems } from '../data/menu'
import { formatCurrency, formatDateKey } from '../lib/formatters'
import { createOrder, fetchProducts, isPosApiConfigured } from '../lib/posApi'
import type { CartLine, CustomerDraft, MenuCategory, MenuItem, PaymentMethod, PosOrder, ServiceMode } from '../types/pos'

type CategoryFilter = 'all' | MenuCategory
type DisplayMode = 'list' | 'grid'

const categoryOptions: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: categoryLabels.coffee },
  { value: 'tea', label: categoryLabels.tea },
  { value: 'food', label: categoryLabels.food },
  { value: 'retail', label: categoryLabels.retail },
]

const serviceModeOptions: Array<{ value: ServiceMode; label: string }> = [
  { value: 'takeout', label: '自取' },
  { value: 'dine-in', label: '內用' },
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
const cartLines = ref<CartLine[]>([])
const isLoading = ref(true)
const isSubmitting = ref(false)
const orderMessage = ref('讀取線上菜單中')
const formError = ref('')
const lastOrder = ref<PosOrder | null>(null)
const customer = reactive<CustomerDraft>({
  name: '',
  phone: '',
  note: '',
})

const onlineFallbackMenu = (): MenuItem[] =>
  menuItems
    .filter((item) => item.available)
    .map((item) => ({
      ...item,
      onlineVisible: true,
    }))

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
  categoryOptions
    .filter((category): category is { value: MenuCategory; label: string } => category.value !== 'all')
    .map((category) => ({
      ...category,
      items: menuCatalog.value.filter((item) => item.category === category.value && itemMatchesFilter(item)),
    }))
    .filter((group) => group.items.length > 0),
)

const cartQuantity = computed(() => cartLines.value.reduce((total, line) => total + line.quantity, 0))
const cartTotal = computed(() => cartLines.value.reduce((total, line) => total + line.unitPrice * line.quantity, 0))
const canSubmit = computed(
  () => cartLines.value.length > 0 && customer.name.trim().length > 0 && customer.phone.trim().length > 0 && !isSubmitting.value,
)

const addItem = (item: MenuItem): void => {
  const existing = cartLines.value.find((line) => line.itemId === item.id)
  if (existing) {
    existing.quantity += 1
    return
  }

  const nextLine: CartLine = {
    itemId: item.id,
    productSku: item.sku,
    name: item.name,
    unitPrice: item.price,
    quantity: 1,
    options: item.tags.slice(0, 1),
  }

  if (item.id !== item.sku) {
    nextLine.productId = item.id
  }

  cartLines.value.push(nextLine)
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
  const description = item.tags.join('、') || categoryLabels[item.category]
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

const loadOnlineMenu = async (): Promise<void> => {
  isLoading.value = true
  formError.value = ''

  try {
    if (!isPosApiConfigured) {
      menuCatalog.value = onlineFallbackMenu()
      orderMessage.value = '線上菜單預覽'
      return
    }

    const products = await fetchProducts('online')
    menuCatalog.value = products
    orderMessage.value = products.length > 0 ? `${products.length} 個品項開放線上點餐` : '線上菜單尚未開放'
  } catch (error) {
    menuCatalog.value = onlineFallbackMenu()
    orderMessage.value = error instanceof Error ? `菜單同步失敗：${error.message}` : '菜單同步失敗'
  } finally {
    isLoading.value = false
  }
}

const submitOnlineOrder = async (): Promise<void> => {
  if (!canSubmit.value) {
    formError.value = '請填寫姓名、電話並加入品項'
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
    note: customer.note.trim(),
    lines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
    subtotal: cartTotal.value,
    paymentMethod: paymentMethod.value,
    paymentStatus: 'pending',
    status: 'new',
    createdAt: now.toISOString(),
    printStatus: 'skipped',
    printJobs: [],
  }

  try {
    lastOrder.value = await createOrder(order)
    orderMessage.value = `${order.id} 已送出`
    clearCart()
    customer.note = ''
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '訂單送出失敗'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  void loadOnlineMenu()
})
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
            <strong>準備中</strong>
            <span>11:30 開始營業</span>
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
        <button v-for="item in filteredMenu" :key="item.id" class="consumer-product-tile" type="button" @click="addItem(item)">
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
        {{ isSubmitting ? '送出中' : '送出訂單' }}
      </button>

      <article v-if="lastOrder" class="consumer-confirmation">
        <CheckCircle2 :size="22" aria-hidden="true" />
        <div>
          <strong>{{ lastOrder.id }}</strong>
          <span>{{ formatCurrency(lastOrder.subtotal) }} · 門市接單中</span>
        </div>
      </article>
    </aside>
  </section>
</template>
