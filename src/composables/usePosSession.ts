import { computed, reactive, ref } from 'vue'
import { menuItems } from '../data/menu'
import { initialOrders } from '../data/orders'
import { formatDateKey } from '../lib/formatters'
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

const paymentStatusFor = (method: PaymentMethod): PosOrder['paymentStatus'] => {
  if (method === 'cash' || method === 'transfer') {
    return 'pending'
  }
  return 'authorized'
}

const buildOrderId = (date: Date, sequence: number): string =>
  `POS-${formatDateKey(date)}-${String(sequence).padStart(3, '0')}`

export const usePosSession = () => {
  const selectedCategory = ref<CategoryFilter>('all')
  const searchTerm = ref('')
  const serviceMode = ref<ServiceMode>('takeout')
  const paymentMethod = ref<PaymentMethod>('cash')
  const cartLines = ref<CartLine[]>([])
  const orderQueue = ref<PosOrder[]>([...initialOrders])
  const lastPrintPreview = ref('尚未送出列印資料')
  const nextSequence = ref(3)
  const customer = reactive<CustomerDraft>({
    name: '現場客',
    phone: '',
    note: '',
  })
  const printStation = reactive<PrintStation>({
    name: 'GODEX DT2X',
    host: import.meta.env.VITE_POS_PRINTER_HOST ?? '192.168.1.100',
    port: Number(import.meta.env.VITE_POS_PRINTER_PORT ?? 9100),
    protocol: 'EZPL over TCP',
    online: true,
    autoPrint: true,
    lastPrintAt: null,
  })

  const filteredMenu = computed(() => {
    const keyword = searchTerm.value.trim().toLowerCase()
    return menuItems.filter((item) => {
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

  const addItem = (item: MenuItem): void => {
    const existing = cartLines.value.find((line) => line.itemId === item.id)
    if (existing) {
      existing.quantity += 1
      return
    }

    cartLines.value.push({
      itemId: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: 1,
      options: item.tags.slice(0, 1),
    })
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

  const updateOrderStatus = (orderId: string, status: OrderStatus): void => {
    const order = orderQueue.value.find((entry) => entry.id === orderId)
    if (!order) {
      return
    }
    order.status = status
  }

  const submitCounterOrder = (): PosOrder | null => {
    if (cartLines.value.length === 0) {
      return null
    }

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
      printStatus: printStation.autoPrint ? 'printed' : 'queued',
    }

    nextSequence.value += 1
    orderQueue.value.unshift(order)
    lastPrintPreview.value = buildEzplTicketPreview(order, printStation)
    if (printStation.autoPrint) {
      printStation.lastPrintAt = now.toISOString()
    }
    clearCart()
    return order
  }

  const sendPrinterHealthcheck = (): void => {
    const now = new Date()
    printStation.online = true
    printStation.lastPrintAt = now.toISOString()
    lastPrintPreview.value = buildPrinterHealthcheckPreview(printStation)
  }

  return {
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
    serviceMode,
    addItem,
    sendPrinterHealthcheck,
    submitCounterOrder,
    updateOrderStatus,
  }
}
