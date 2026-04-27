<script setup lang="ts">
import { Eye, EyeOff, RefreshCw, Save, Search, ShieldCheck } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { categoryLabels } from '../data/menu'
import { formatCurrency } from '../lib/formatters'
import { fetchAdminProducts, type ProductUpdateInput, updateProduct } from '../lib/posApi'
import type { MenuCategory, MenuItem } from '../types/pos'

interface ProductDraft extends MenuItem {
  tagsText: string
}

const emit = defineEmits<{
  refreshPos: []
}>()

const categoryOptions: Array<{ value: 'all' | MenuCategory; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: categoryLabels.coffee },
  { value: 'tea', label: categoryLabels.tea },
  { value: 'food', label: categoryLabels.food },
  { value: 'retail', label: categoryLabels.retail },
]

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
    // Session storage can be unavailable in private contexts; the PIN still works for this page session.
  }
}

const adminPin = ref(readStoredPin())
const searchTerm = ref('')
const selectedCategory = ref<'all' | MenuCategory>('all')
const productDrafts = ref<ProductDraft[]>([])
const isLoading = ref(false)
const savingProductId = ref<string | null>(null)
const adminMessage = ref('尚未載入商品')

const visibleProducts = computed(() => productDrafts.value.filter((product) => product.available).length)
const hiddenProducts = computed(() => productDrafts.value.length - visibleProducts.value)
const averagePrice = computed(() => {
  if (productDrafts.value.length === 0) {
    return 0
  }
  return Math.round(productDrafts.value.reduce((total, product) => total + product.price, 0) / productDrafts.value.length)
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
})

const tagsFromText = (tagsText: string): string[] =>
  tagsText
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

const loadProducts = async (): Promise<void> => {
  if (!adminPin.value.trim()) {
    adminMessage.value = '請輸入管理 PIN'
    return
  }

  isLoading.value = true
  adminMessage.value = '讀取商品中'

  try {
    writeStoredPin(adminPin.value.trim())
    const products = await fetchAdminProducts(adminPin.value.trim())
    productDrafts.value = products.map(toDraft)
    adminMessage.value = `已載入 ${products.length} 個商品`
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '讀取商品失敗'
  } finally {
    isLoading.value = false
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
</script>

<template>
  <section class="admin-workspace" aria-label="POS 後台">
    <section class="admin-panel admin-access-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Back Office</p>
          <h2>前台顯示管理</h2>
          <span class="panel-note">商品、分類、排序、停售狀態</span>
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
        <button class="primary-button" type="button" :disabled="isLoading" @click="loadProducts">
          <RefreshCw :size="18" aria-hidden="true" />
          {{ isLoading ? '讀取中' : '載入商品' }}
        </button>
      </div>
      <p class="admin-message">{{ adminMessage }}</p>
    </section>

    <section class="overview-strip admin-summary-strip" aria-label="後台摘要">
      <article>
        <span>上架商品</span>
        <strong>{{ visibleProducts }}</strong>
      </article>
      <article>
        <span>停售商品</span>
        <strong>{{ hiddenProducts }}</strong>
      </article>
      <article>
        <span>平均售價</span>
        <strong>{{ formatCurrency(averagePrice) }}</strong>
      </article>
      <article>
        <span>商品總數</span>
        <strong>{{ productDrafts.length }}</strong>
      </article>
    </section>

    <section class="admin-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Products</p>
          <h2>商品設定</h2>
          <span class="panel-note">前台只顯示上架商品</span>
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
          <div class="admin-product-identity">
            <span class="product-swatch" :style="{ backgroundColor: product.accent }" aria-hidden="true"></span>
            <div>
              <strong>{{ product.name || '未命名商品' }}</strong>
              <span>{{ product.sku }}</span>
            </div>
          </div>

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

          <label class="toggle-row admin-availability">
            <input v-model="product.available" type="checkbox" />
            <Eye v-if="product.available" :size="18" aria-hidden="true" />
            <EyeOff v-else :size="18" aria-hidden="true" />
            {{ product.available ? '上架' : '停售' }}
          </label>

          <button
            class="primary-button admin-save-button"
            type="button"
            :disabled="savingProductId === product.id"
            @click="saveProduct(product)"
          >
            <Save :size="18" aria-hidden="true" />
            {{ savingProductId === product.id ? '儲存中' : '儲存' }}
          </button>
        </article>

        <div v-if="filteredProducts.length === 0" class="empty-state">
          <Search :size="24" aria-hidden="true" />
          <span>沒有符合條件的商品</span>
        </div>
      </div>
    </section>
  </section>
</template>
