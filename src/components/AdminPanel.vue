<script setup lang="ts">
import {
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
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { categoryLabels } from '../data/menu'
import {
  fetchAdminAuditEvents,
  fetchAdminProducts,
  fetchAdminSettings,
  type ProductUpdateInput,
  updateAdminSetting,
  updateProduct,
} from '../lib/posApi'
import type {
  AccessControlSettings,
  AdminPermission,
  MenuCategory,
  MenuItem,
  PrinterSettings,
  PosAuditEvent,
  PrintLabelMode,
  PrintRuleSetting,
  RoleSetting,
  ServiceMode,
} from '../types/pos'

interface ProductDraft extends MenuItem {
  tagsText: string
  soldOutUntilInput: string
}

type AdminTab = 'products' | 'printing' | 'access' | 'audit'

const emit = defineEmits<{
  refreshPos: []
}>()

const adminTabs: Array<{ value: AdminTab; label: string }> = [
  { value: 'products', label: '商品菜單' },
  { value: 'printing', label: '出單規則' },
  { value: 'access', label: '權限' },
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
  'order.claim': '鎖單',
  'order.release_claim': '釋放鎖單',
  'order.status.update': '訂單狀態',
  'order.payment.update': '收款狀態',
  'order.void': '訂單作廢',
  'order.refund': '訂單退款',
}

const auditTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const auditActionLabel = (action: string): string => auditActionLabels[action] ?? action

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

const adminPin = ref(readStoredPin())
const activeAdminTab = ref<AdminTab>('products')
const searchTerm = ref('')
const selectedCategory = ref<'all' | MenuCategory>('all')
const productDrafts = ref<ProductDraft[]>([])
const printerSettings = ref<PrinterSettings>(emptyPrinterSettings())
const accessControl = ref<AccessControlSettings>(emptyAccessControl())
const auditEvents = ref<PosAuditEvent[]>([])
const auditLimit = ref(50)
const auditActionFilter = ref('all')
const isLoading = ref(false)
const isAuditLoading = ref(false)
const savingProductId = ref<string | null>(null)
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

const formatAuditTime = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '時間未知' : auditTimeFormatter.format(date)
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

const auditSubject = (event: PosAuditEvent): string => {
  const orderNumber = auditMetadataLabel(event, 'orderNumber')
  if (orderNumber) {
    return `訂單 ${orderNumber}`
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
    const [products, settings, events] = await Promise.all([
      fetchAdminProducts(adminPin.value.trim()),
      fetchAdminSettings(adminPin.value.trim()),
      fetchAdminAuditEvents(adminPin.value.trim(), auditLimit.value),
    ])
    productDrafts.value = products.map(toDraft)
    printerSettings.value = clonePrinterSettings(settings.printerSettings)
    accessControl.value = cloneAccessControl(settings.accessControl)
    auditEvents.value = events
    adminMessage.value = `已載入 ${products.length} 個商品、${settings.printerSettings.rules.length} 條出單規則、${events.length} 筆稽核`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '讀取後台資料失敗'
  } finally {
    isLoading.value = false
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
        <span>出單規則</span>
        <strong>{{ printRuleCount }}</strong>
      </article>
      <article>
        <span>權限角色</span>
        <strong>{{ roleCount }}</strong>
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
