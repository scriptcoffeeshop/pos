import { computed, onMounted, reactive, ref } from 'vue'
import { menuItems } from '../data/menu'
import { initialOrders } from '../data/orders'
import { formatDateKey } from '../lib/formatters'
import { isNativeLanPrinterAvailable, lanPrinterModeLabel, sendLanPrintPayload } from '../lib/lanPrinter'
import {
  createOrder,
  createPrintJob,
  fetchOrders,
  fetchProducts,
  fetchRuntimeSettings,
  isPosApiConfigured,
  updatePrintJobStatus,
  updateOrderStatus as persistOrderStatus,
} from '../lib/posApi'
import { buildEzplTicketPreview, buildPrinterHealthcheckPreview } from '../lib/printing'
import type {
  CartLine,
  CustomerDraft,
  MenuCategory,
  MenuItem,
  OrderStatus,
  PaymentMethod,
  PosOrder,
  PrintStation,
  ServiceMode,
} from '../types/pos'

type CategoryFilter = 'all' | MenuCategory
type BackendMode = 'syncing' | 'connected' | 'fallback'

interface UsePosSessionOptions {
  autoLoad?: boolean
}

interface BackendStatus {
  mode: BackendMode
  label: string
  detail: string
}

const paymentStatusFor = (method: PaymentMethod): PosOrder['paymentStatus'] => {
  if (method === 'cash' || method === 'transfer') {
    return 'pending'
  }
  return 'authorized'
}

const buildOrderId = (date: Date, sequence: number): string =>
  `POS-${formatDateKey(date)}-${String(sequence).padStart(3, '0')}`

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return '未知錯誤'
}

const nextSequenceFromOrders = (orders: PosOrder[]): number => {
  const maxSequence = orders.reduce((currentMax, order) => {
    const match = order.id.match(/-(\d{3,})$/)
    const sequence = match ? Number(match[1]) : 0
    return Number.isFinite(sequence) ? Math.max(currentMax, sequence) : currentMax
  }, 0)

  return maxSequence + 1
}

export const usePosSession = (options: UsePosSessionOptions = {}) => {
  const autoLoad = options.autoLoad ?? true
  const selectedCategory = ref<CategoryFilter>('all')
  const searchTerm = ref('')
  const serviceMode = ref<ServiceMode>('takeout')
  const paymentMethod = ref<PaymentMethod>('cash')
  const menuCatalog = ref<MenuItem[]>([...menuItems])
  const cartLines = ref<CartLine[]>([])
  const orderQueue = ref<PosOrder[]>([...initialOrders])
  const lastPrintPreview = ref('尚未送出列印資料')
  const nextSequence = ref(nextSequenceFromOrders(initialOrders))
  const isSubmitting = ref(false)
  const backendStatus = reactive<BackendStatus>({
    mode: isPosApiConfigured ? 'syncing' : 'fallback',
    label: isPosApiConfigured ? 'API 同步中' : '本機模式',
    detail: isPosApiConfigured ? '正在連線 POS API' : '尚未設定 Supabase URL 或 anon key',
  })
  const customer = reactive<CustomerDraft>({
    name: '現場客',
    phone: '',
    note: '',
  })
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

  const applyRuntimePrinterSettings = async (): Promise<void> => {
    const runtimeSettings = await fetchRuntimeSettings()
    const primaryStation = runtimeSettings.printerSettings.stations.find((station) => station.enabled)
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

  const filteredMenu = computed(() => {
    const keyword = searchTerm.value.trim().toLowerCase()
    return menuCatalog.value.filter((item) => {
      const matchesCategory = selectedCategory.value === 'all' || item.category === selectedCategory.value
      const matchesKeyword =
        keyword.length === 0 ||
        item.name.toLowerCase().includes(keyword) ||
        item.tags.some((tag) => tag.toLowerCase().includes(keyword))
      return item.available && matchesCategory && matchesKeyword
    })
  })

  const cartTotal = computed(() =>
    cartLines.value.reduce((total, line) => total + line.unitPrice * line.quantity, 0),
  )

  const cartQuantity = computed(() => cartLines.value.reduce((total, line) => total + line.quantity, 0))
  const pendingOrders = computed(() => orderQueue.value.filter((order) => order.status !== 'served'))

  const setBackendStatus = (mode: BackendMode, label: string, detail: string): void => {
    backendStatus.mode = mode
    backendStatus.label = label
    backendStatus.detail = detail
  }

  const replaceOrder = (orderId: string, nextOrder: PosOrder): void => {
    orderQueue.value = orderQueue.value.map((order) => (order.id === orderId ? nextOrder : order))
  }

  const appendPrintPreviewStatus = (message: string): void => {
    lastPrintPreview.value = `${lastPrintPreview.value}\n${message}`
  }

  const tryNativeLanPrint = async (payload: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!isNativeLanPrinterAvailable()) {
      appendPrintPreviewStatus(`STATUS ${lanPrinterModeLabel()}，尚未送出 TCP payload`)
      return { ok: false, error: 'native LAN printer is not available' }
    }

    try {
      const result = await sendLanPrintPayload(printStation, payload)
      appendPrintPreviewStatus(`STATUS 已送出 ${result.bytesWritten} bytes，耗時 ${result.elapsedMs}ms`)
      return { ok: true }
    } catch (error) {
      const message = getErrorMessage(error)
      printStation.online = false
      appendPrintPreviewStatus(`STATUS TCP 列印失敗：${message}`)
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
      const [remoteProducts, remoteOrders] = await Promise.all([fetchProducts(), fetchOrders()])
      await applyRuntimePrinterSettings()
      menuCatalog.value = remoteProducts
      orderQueue.value = remoteOrders
      nextSequence.value = nextSequenceFromOrders(remoteOrders)
      setBackendStatus('connected', 'API 已同步', `已載入 ${remoteProducts.length} 個商品、${remoteOrders.length} 張訂單`)
    } catch (error) {
      setBackendStatus('fallback', '本機模式', `POS API 載入失敗：${getErrorMessage(error)}`)
    }
  }

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

  const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }
    const previousStatus = order.status
    order.status = status

    if (!isPosApiConfigured || !order.remoteId) {
      return
    }

    try {
      const persistedOrder = await persistOrderStatus(order, status)
      replaceOrder(orderId, {
        ...persistedOrder,
        lines: persistedOrder.lines.length > 0 ? persistedOrder.lines : order.lines,
        printStatus: persistedOrder.printStatus === 'skipped' ? order.printStatus : persistedOrder.printStatus,
      })
      setBackendStatus('connected', 'API 已同步', `${orderId} 已更新為 ${status}`)
    } catch (error) {
      order.status = previousStatus
      setBackendStatus('fallback', '本機模式', `訂單狀態同步失敗：${getErrorMessage(error)}`)
    }
  }

  const submitCounterOrder = async (): Promise<PosOrder | null> => {
    if (cartLines.value.length === 0 || isSubmitting.value) {
      return null
    }

    isSubmitting.value = true
    const now = new Date()
    const order: PosOrder = {
      id: buildOrderId(now, nextSequence.value),
      source: 'counter',
      mode: serviceMode.value,
      customerName: customer.name.trim() || '現場客',
      customerPhone: customer.phone.trim(),
      note: customer.note.trim(),
      lines: cartLines.value.map((line) => ({ ...line, options: [...line.options] })),
      subtotal: cartTotal.value,
      paymentMethod: paymentMethod.value,
      paymentStatus: paymentStatusFor(paymentMethod.value),
      status: 'new',
      createdAt: now.toISOString(),
      printStatus: printStation.autoPrint ? 'queued' : 'skipped',
    }

    nextSequence.value += 1
    orderQueue.value.unshift(order)
    const printPreview = buildEzplTicketPreview(order, printStation)
    lastPrintPreview.value = printPreview
    if (printStation.autoPrint) {
      printStation.lastPrintAt = now.toISOString()
    }
    clearCart()

    if (!isPosApiConfigured) {
      isSubmitting.value = false
      return order
    }

    try {
      const persistedOrder = await createOrder(order)
      const nextOrder: PosOrder = {
        ...order,
        createdAt: persistedOrder.createdAt,
        lines: persistedOrder.lines.length > 0 ? persistedOrder.lines : order.lines,
      }

      if (persistedOrder.remoteId) {
        nextOrder.remoteId = persistedOrder.remoteId
      }

      replaceOrder(order.id, nextOrder)
      let backendDetail = `${order.id} 已建立`

      if (printStation.autoPrint) {
        try {
          const printJob = await createPrintJob(nextOrder, printPreview, printStation)
          nextOrder.printStatus = printJob.status

          if (isNativeLanPrinterAvailable()) {
            const printResult = await tryNativeLanPrint(printPreview)
            const updatedPrintJob = await updatePrintJobStatus(
              printJob.id,
              printResult.ok ? 'printed' : 'failed',
              printResult.ok ? undefined : printResult.error,
            )
            nextOrder.printStatus = updatedPrintJob.status
            backendDetail = printResult.ok ? `${order.id} 已建立並列印` : `${order.id} 已建立，列印失敗`
          }

          replaceOrder(order.id, nextOrder)
        } catch (error) {
          nextOrder.printStatus = 'failed'
          replaceOrder(order.id, nextOrder)
          backendDetail = `${order.id} 已建立，列印工作建立失敗：${getErrorMessage(error)}`
        }
      }

      setBackendStatus('connected', 'API 已同步', backendDetail)
      return nextOrder
    } catch (error) {
      setBackendStatus('fallback', '本機模式', `訂單保留在本機，雲端同步失敗：${getErrorMessage(error)}`)
      return order
    } finally {
      isSubmitting.value = false
    }
  }

  const sendPrinterHealthcheck = async (): Promise<void> => {
    const now = new Date()
    printStation.online = true
    printStation.lastPrintAt = now.toISOString()
    lastPrintPreview.value = buildPrinterHealthcheckPreview(printStation)
    await tryNativeLanPrint(lastPrintPreview.value)
  }

  onMounted(() => {
    if (autoLoad) {
      void refreshBackendData()
    }
  })

  return {
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
    searchTerm,
    selectedCategory,
    serviceMode,
    addItem,
    refreshBackendData,
    sendPrinterHealthcheck,
    submitCounterOrder,
    updateOrderStatus,
  }
}
