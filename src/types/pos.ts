export type MenuCategory = 'coffee' | 'tea' | 'food' | 'retail'
export type ServiceMode = 'dine-in' | 'takeout' | 'delivery'
export type PaymentMethod = 'cash' | 'card' | 'line-pay' | 'jkopay' | 'transfer'
export type OrderSource = 'counter' | 'qr' | 'online'
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'failed'
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'expired' | 'failed'

export interface MenuItem {
  id: string
  name: string
  category: MenuCategory
  price: number
  tags: string[]
  accent: string
  available: boolean
}

export interface CartLine {
  itemId: string
  name: string
  unitPrice: number
  quantity: number
  options: string[]
}

export interface CustomerDraft {
  name: string
  phone: string
  note: string
}

export interface PosOrder {
  id: string
  source: OrderSource
  mode: ServiceMode
  customerName: string
  customerPhone: string
  note: string
  lines: CartLine[]
  subtotal: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  status: OrderStatus
  createdAt: string
  printStatus: 'queued' | 'printed' | 'skipped'
}

export interface PrintStation {
  name: string
  host: string
  port: number
  protocol: string
  online: boolean
  autoPrint: boolean
  lastPrintAt: string | null
}
