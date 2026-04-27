import type { MenuCategory, MenuItem, OrderSource, OrderStatus, PaymentMethod, PaymentStatus, PosOrder, PrintStation, ServiceMode } from '../types/pos'

interface ApiProduct {
  id: string
  sku: string
  name: string
  category: MenuCategory
  price: number
  tags: string[] | null
  accent: string | null
  is_available: boolean
}

interface ApiOrderItem {
  id: string
  product_id: string | null
  product_sku: string
  name: string
  unit_price: number
  quantity: number
  options: unknown
}

interface ApiPrintJob {
  status: PosOrder['printStatus']
  printed_at: string | null
  created_at: string
}

interface ApiOrder {
  id: string
  order_number: string
  source: OrderSource
  service_mode: ServiceMode
  customer_name: string
  customer_phone: string
  note: string
  subtotal: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  status: OrderStatus
  created_at: string
  order_items?: ApiOrderItem[]
  print_jobs?: ApiPrintJob[]
}

interface CreateOrderResponse {
  order: ApiOrder
}

interface ProductsResponse {
  products: ApiProduct[]
}

interface OrdersResponse {
  orders: ApiOrder[]
}

interface PrintJobResponse {
  printJob: ApiPrintJob
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const apiBaseUrl = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/pos-api` : ''

export const isPosApiConfigured = Boolean(apiBaseUrl && supabaseAnonKey)

const request = async <ResponseBody>(path: string, init: RequestInit = {}): Promise<ResponseBody> => {
  if (!isPosApiConfigured || !supabaseAnonKey) {
    throw new Error('POS API is not configured')
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `POS API request failed with ${response.status}`)
  }

  return response.json() as Promise<ResponseBody>
}

const normalizeOptions = (options: unknown): string[] => {
  if (!Array.isArray(options)) {
    return []
  }
  return options.filter((option): option is string => typeof option === 'string')
}

const normalizePrintStatus = (order: ApiOrder): PosOrder['printStatus'] => {
  const newestPrintJob = [...(order.print_jobs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return newestPrintJob?.status ?? 'skipped'
}

export const normalizeProduct = (product: ApiProduct): MenuItem => ({
  id: product.id,
  sku: product.sku,
  name: product.name,
  category: product.category,
  price: product.price,
  tags: product.tags ?? [],
  accent: product.accent ?? '#0b6b63',
  available: product.is_available,
})

export const normalizeOrder = (order: ApiOrder): PosOrder => ({
  id: order.order_number,
  remoteId: order.id,
  source: order.source,
  mode: order.service_mode,
  customerName: order.customer_name,
  customerPhone: order.customer_phone,
  note: order.note,
  subtotal: order.subtotal,
  paymentMethod: order.payment_method,
  paymentStatus: order.payment_status,
  status: order.status,
  createdAt: order.created_at,
  printStatus: normalizePrintStatus(order),
  lines: (order.order_items ?? []).map((line) => {
    const cartLine = {
      itemId: line.product_id ?? line.product_sku,
      productSku: line.product_sku,
      name: line.name,
      unitPrice: line.unit_price,
      quantity: line.quantity,
      options: normalizeOptions(line.options),
    }

    return line.product_id ? { ...cartLine, productId: line.product_id } : cartLine
  }),
})

export const fetchProducts = async (): Promise<MenuItem[]> => {
  const data = await request<ProductsResponse>('/products')
  return data.products.map(normalizeProduct)
}

export const fetchOrders = async (limit = 50): Promise<PosOrder[]> => {
  const data = await request<OrdersResponse>(`/orders?limit=${limit}`)
  return data.orders.map(normalizeOrder)
}

export const createOrder = async (order: PosOrder): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: order.id,
      source: order.source,
      serviceMode: order.mode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      note: order.note,
      subtotal: order.subtotal,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      lines: order.lines.map((line) => ({
        productId: line.productId,
        productSku: line.productSku,
        name: line.name,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        options: line.options,
      })),
    }),
  })

  return normalizeOrder(data.order)
}

export const updateOrderStatus = async (order: PosOrder, status: OrderStatus): Promise<PosOrder> => {
  const data = await request<CreateOrderResponse>(`/orders/${order.remoteId ?? order.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

  return normalizeOrder(data.order)
}

export const createPrintJob = async (
  order: PosOrder,
  payload: string,
  station: PrintStation,
): Promise<PosOrder['printStatus']> => {
  if (!order.remoteId) {
    throw new Error('remote order id is required before creating print job')
  }

  const data = await request<PrintJobResponse>('/print-jobs', {
    method: 'POST',
    body: JSON.stringify({
      orderId: order.remoteId,
      payload,
      stationName: station.name,
      printerHost: station.host,
      printerPort: station.port,
      protocol: station.protocol,
    }),
  })

  return data.printJob.status
}
