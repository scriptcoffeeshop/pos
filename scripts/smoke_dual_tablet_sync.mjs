#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(repoRoot, 'output/playwright')
const apiPrefix = '/functions/v1/pos-api'
const leaseSeconds = 180

const nowIso = () => new Date().toISOString()

const productRows = [
  {
    id: 'americano-ice',
    sku: 'americano-ice',
    name: 'Ice Americano',
    category: 'coffee',
    price: 95,
    tags: ['ice'],
    accent: '#1f6f8b',
    is_available: true,
    sort_order: 10,
    pos_visible: true,
    online_visible: true,
    qr_visible: true,
    prep_station: 'bar',
    print_label: true,
    inventory_count: null,
    low_stock_threshold: null,
    sold_out_until: null,
    supply_windows: [],
    future_order_available: true,
  },
  {
    id: 'bagel',
    sku: 'bagel',
    name: 'Bagel',
    category: 'food',
    price: 75,
    tags: ['food'],
    accent: '#c47b47',
    is_available: true,
    sort_order: 20,
    pos_visible: true,
    online_visible: true,
    qr_visible: true,
    prep_station: 'kitchen',
    print_label: true,
    inventory_count: null,
    low_stock_threshold: null,
    sold_out_until: null,
    supply_windows: [],
    future_order_available: true,
  },
]

const initialFloorPlan = () => ({
  floors: [
    { id: '1F', label: '1F' },
    { id: '2F', label: '2F' },
  ],
  activeFloorId: '1F',
  tables: [
    { id: 'A1', floorId: '1F', label: 'A1', capacity: 4, x: 32, y: 56, width: 20 },
    { id: 'A2', floorId: '1F', label: 'A2', capacity: 2, x: 58, y: 30, width: 13 },
    { id: 'B1', floorId: '2F', label: 'B1', capacity: 4, x: 42, y: 40, width: 18 },
  ],
  display: {
    showPeople: true,
    showUnsubmittedWait: true,
    showTableStay: true,
    showWaitlinePeople: true,
    showWaitlineTime: true,
    showOrderLabels: false,
  },
  partySizes: {},
  waitline: [],
})

const onlineOrdering = {
  enabled: true,
  allowScheduledOrders: true,
  averagePrepMinutes: 20,
  unconfirmedReminderMinutes: 0,
  acceptanceRequired: true,
  acceptWithoutPrinting: false,
  soundEnabled: false,
  notificationRepeatMode: 'once',
  notificationVolume: 0,
  pauseMessage: 'Online ordering is paused',
  menuCategories: [],
  availableOptionChoices: [],
  menuOptionGroups: [],
  productOptionAssignments: {},
  noteSupplyStatuses: {},
}

const createOrder = (orderNumber, overrides = {}) => {
  const createdAt = overrides.created_at ?? new Date(Date.now() - 2 * 60_000).toISOString()

  return {
    id: overrides.id ?? randomUUID(),
    order_number: orderNumber,
    source: overrides.source ?? 'online',
    service_mode: overrides.service_mode ?? 'takeout',
    customer_name: overrides.customer_name ?? `Guest ${orderNumber}`,
    customer_phone: overrides.customer_phone ?? '0900-000-000',
    delivery_address: overrides.delivery_address ?? '',
    requested_fulfillment_at: overrides.requested_fulfillment_at ?? null,
    member_id: null,
    note: overrides.note ?? '',
    subtotal: overrides.subtotal ?? 95,
    order_labels: [],
    service_fee_rate: 0,
    service_fee_amount: 0,
    extra_fee_amount: 0,
    discount_amount: 0,
    points_redeemed: 0,
    coupon_code: '',
    member_points_earned: 0,
    payment_method: overrides.payment_method ?? 'line-pay',
    payment_status: overrides.payment_status ?? 'paid',
    status: overrides.status ?? 'new',
    created_at: createdAt,
    claimed_by: overrides.claimed_by ?? null,
    claimed_at: overrides.claimed_at ?? null,
    claim_expires_at: overrides.claim_expires_at ?? null,
    draft_lines: overrides.draft_lines ?? [],
    order_items: overrides.order_items ?? [
      {
        id: randomUUID(),
        product_id: 'americano-ice',
        product_sku: 'americano-ice',
        name: 'Ice Americano',
        unit_price: 95,
        quantity: 1,
        options: ['ice'],
      },
    ],
    print_jobs: [],
  }
}

const draftLinesFromInput = (input) => (
  Array.isArray(input.lines)
    ? input.lines.map((line) => ({
      product_id: line.productId ?? line.productSku,
      product_sku: line.productSku,
      name: line.name,
      unit_price: Number(line.unitPrice) || 0,
      quantity: Number(line.quantity) || 1,
      options: Array.isArray(line.options) ? line.options : [],
      print_paused: line.printPaused === true,
    }))
    : []
)

const applyDraftPayload = (order, input, stationId) => {
  const draftLines = draftLinesFromInput(input)
  order.source = 'counter'
  order.service_mode = input.serviceMode ?? order.service_mode ?? 'takeout'
  order.customer_name = input.customerName ?? order.customer_name ?? '現場客'
  order.customer_phone = input.customerPhone ?? order.customer_phone ?? ''
  order.delivery_address = input.deliveryAddress ?? order.delivery_address ?? ''
  order.requested_fulfillment_at = input.requestedFulfillmentAt ?? null
  order.note = input.note ?? order.note ?? ''
  order.subtotal = Number(input.subtotal) || draftLines.reduce((total, line) => total + line.unit_price * line.quantity, 0)
  order.payment_method = input.paymentMethod ?? order.payment_method ?? 'cash'
  order.payment_status = input.paymentStatus ?? order.payment_status ?? 'pending'
  order.status = 'new'
  order.claimed_by = stationId
  order.claimed_at = order.claimed_at ?? nowIso()
  order.claim_expires_at = order.claim_expires_at ?? new Date(Date.now() + leaseSeconds * 1000).toISOString()
  order.draft_lines = draftLines
  order.order_items = []
  return order
}

const createState = () => ({
  apiAvailable: true,
  failedRequests: 0,
  floorPlan: initialFloorPlan(),
  orders: [],
  reminderStates: new Map(),
  stations: new Map(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-pos-station-id',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
}

const sendJson = (res, status, body) => {
  res.writeHead(status, {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

const readJson = async (req) => {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }

  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : {}
}

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms))

const freePort = async () => {
  const server = createServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  await new Promise((resolveClose) => server.close(resolveClose))
  return address.port
}

const resolveOrder = (state, identifier) =>
  state.orders.find((order) => order.id === identifier || order.order_number === identifier)

const reminderRowsFor = (state, identifiers) => {
  const resolvedIds = new Set(
    identifiers
      .map((identifier) => resolveOrder(state, identifier))
      .filter(Boolean)
      .map((order) => order.id),
  )

  return [...state.reminderStates.values()].filter((row) => resolvedIds.has(row.order_id))
}

const createMockApiServer = async () => {
  const state = createState()
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }

    if (url.pathname === '/__test/state') {
      sendJson(res, 200, {
        apiAvailable: state.apiAvailable,
        failedRequests: state.failedRequests,
        floorPlan: state.floorPlan,
        orders: state.orders,
        reminderStates: [...state.reminderStates.values()],
      })
      return
    }

    if (url.pathname === '/__test/api-available' && req.method === 'POST') {
      const input = await readJson(req)
      state.apiAvailable = input.available !== false
      sendJson(res, 200, { apiAvailable: state.apiAvailable })
      return
    }

    if (url.pathname === '/__test/add-online-order' && req.method === 'POST') {
      const input = await readJson(req)
      const orderNumber = typeof input.orderNumber === 'string' && input.orderNumber
        ? input.orderNumber
        : `WEB-${String(state.orders.length + 1).padStart(3, '0')}`
      const order = createOrder(orderNumber, input)
      state.orders.unshift(order)
      sendJson(res, 201, { order })
      return
    }

    if (url.pathname === '/__test/add-waitline' && req.method === 'POST') {
      const input = await readJson(req)
      const entry = {
        id: `wait-${Date.now()}`,
        name: input.name ?? 'Reconnect Guest',
        phone: input.phone ?? '',
        customerType: 'walk-in',
        partySize: input.partySize ?? 2,
        createdAt: nowIso(),
        note: input.note ?? '',
      }
      state.floorPlan = {
        ...state.floorPlan,
        waitline: [...state.floorPlan.waitline, entry],
      }
      sendJson(res, 201, { entry, floorPlan: state.floorPlan })
      return
    }

    if (!url.pathname.startsWith(apiPrefix)) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    if (!state.apiAvailable) {
      state.failedRequests += 1
      sendJson(res, 503, { error: 'Mock POS API is offline' })
      return
    }

    const path = url.pathname.slice(apiPrefix.length) || '/'
    if (path === '/products' && req.method === 'GET') {
      sendJson(res, 200, { products: productRows })
      return
    }

    if (path === '/settings/runtime' && req.method === 'GET') {
      sendJson(res, 200, {
        printerSettings: { stations: [], rules: [] },
        onlineOrdering,
        posAppearance: {
          interfaceScale: 0,
          densityScale: 0,
          textSize: 0,
          darkMode: false,
          toolboxOpacity: 100,
        },
        floorPlan: state.floorPlan,
        engagementSettings: {
          orderLabels: [],
          customerTypes: ['General'],
          defaultServiceFeeRate: 0,
          recommendations: [],
          translations: [],
          hardwareDevices: [],
        },
      })
      return
    }

    if (path === '/register/current' && req.method === 'GET') {
      sendJson(res, 200, { session: null })
      return
    }

    if (path === '/station/heartbeat' && req.method === 'POST') {
      const input = await readJson(req)
      const stationId = input.stationId || req.headers['x-pos-station-id'] || 'tablet-unknown'
      const station = {
        station_id: stationId,
        station_label: input.stationLabel ?? stationId,
        platform: input.platform ?? 'web',
        app_version: input.appVersion ?? '',
        user_agent: input.userAgent ?? '',
        last_seen_at: nowIso(),
        created_at: state.stations.get(stationId)?.created_at ?? nowIso(),
      }
      state.stations.set(stationId, station)
      sendJson(res, 200, { station })
      return
    }

    if (path === '/orders' && req.method === 'GET') {
      sendJson(res, 200, { orders: state.orders })
      return
    }

    if (path === '/orders/drafts' && req.method === 'POST') {
      const input = await readJson(req)
      const stationId = input.stationId ?? req.headers['x-pos-station-id'] ?? 'tablet-unknown'
      const order = createOrder(input.orderNumber ?? `DRAFT-${String(state.orders.length + 1).padStart(3, '0')}`, {
        id: randomUUID(),
        source: 'counter',
        service_mode: input.serviceMode ?? 'takeout',
        customer_name: input.customerName ?? '現場客',
        customer_phone: input.customerPhone ?? '',
        delivery_address: input.deliveryAddress ?? '',
        requested_fulfillment_at: input.requestedFulfillmentAt ?? null,
        note: input.note ?? '',
        subtotal: Number(input.subtotal) || 0,
        payment_method: input.paymentMethod ?? 'cash',
        payment_status: input.paymentStatus ?? 'pending',
        status: 'new',
        claimed_by: stationId,
        claimed_at: nowIso(),
        claim_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
        draft_lines: draftLinesFromInput(input),
        order_items: [],
      })
      state.orders.unshift(order)
      sendJson(res, 201, { order })
      return
    }

    if (path === '/online-order-reminders/state' && req.method === 'GET') {
      const identifiers = (url.searchParams.get('orderIds') ?? '')
        .split(',')
        .map((identifier) => identifier.trim())
        .filter(Boolean)
      sendJson(res, 200, { states: reminderRowsFor(state, identifiers) })
      return
    }

    if (path === '/online-order-reminders/state' && (req.method === 'PATCH' || req.method === 'POST')) {
      const input = await readJson(req)
      const identifiers = Array.isArray(input.orderIds) ? input.orderIds : []
      const action = input.action
      const stationId = input.stationId ?? req.headers['x-pos-station-id'] ?? ''
      const updatedAt = nowIso()
      for (const identifier of identifiers) {
        const order = resolveOrder(state, identifier)
        if (!order) {
          continue
        }

        const existing = state.reminderStates.get(order.id)
        if (action === 'snooze' && existing?.status === 'seen') {
          continue
        }

        const row = {
          order_id: order.id,
          order_number: order.order_number,
          status: action === 'snooze' ? 'snoozed' : 'seen',
          snoozed_until: action === 'snooze' ? input.snoozedUntil : null,
          snoozed_by_station_id: action === 'snooze' ? stationId : '',
          seen_at: action === 'snooze' ? null : updatedAt,
          seen_by_station_id: action === 'snooze' ? '' : stationId,
          last_action: action,
          created_at: existing?.created_at ?? updatedAt,
          updated_at: updatedAt,
        }
        state.reminderStates.set(order.id, row)
      }

      sendJson(res, 200, { states: reminderRowsFor(state, identifiers) })
      return
    }

    if (path === '/admin/settings/floor_plan' && req.method === 'PATCH') {
      state.floorPlan = await readJson(req)
      sendJson(res, 200, { setting: { key: 'floor_plan', value: state.floorPlan } })
      return
    }

    const draftMatch = path.match(/^\/orders\/([^/]+)\/draft$/)
    if (draftMatch && req.method === 'PATCH') {
      const input = await readJson(req)
      const order = resolveOrder(state, draftMatch[1])
      if (!order) {
        sendJson(res, 404, { error: 'Order not found' })
        return
      }

      applyDraftPayload(order, input, input.stationId ?? req.headers['x-pos-station-id'] ?? 'tablet-unknown')
      sendJson(res, 200, { order })
      return
    }

    const floorMatch = path.match(/^\/orders\/([^/]+)\/floor$/)
    if (floorMatch && req.method === 'PATCH') {
      const input = await readJson(req)
      const order = resolveOrder(state, floorMatch[1])
      if (!order) {
        sendJson(res, 404, { error: 'Order not found' })
        return
      }

      order.service_mode = 'dine-in'
      order.customer_name = input.tableLabel ? `${input.tableLabel} ${order.customer_name}` : order.customer_name
      order.note = [
        input.floorLabel ? `樓層 ${input.floorLabel}` : '',
        input.tableLabel ? `桌位 ${input.tableLabel}` : '',
        Number.isFinite(Number(input.partySize)) ? `${Math.trunc(Number(input.partySize))}人` : '',
        order.note,
      ].filter(Boolean).join('、')
      sendJson(res, 200, { order })
      return
    }

    const claimMatch = path.match(/^\/orders\/([^/]+)\/claim$/)
    if (claimMatch && req.method === 'POST') {
      const input = await readJson(req)
      const stationId = input.stationId
      const order = resolveOrder(state, claimMatch[1])
      if (!order) {
        sendJson(res, 404, { error: 'Order not found' })
        return
      }

      const expiresAt = order.claim_expires_at ? new Date(order.claim_expires_at).getTime() : 0
      const leaseHeldByOther = order.claimed_by && order.claimed_by !== stationId && expiresAt > Date.now()
      if (['served', 'failed', 'voided'].includes(order.status) || leaseHeldByOther) {
        sendJson(res, 409, {
          error: leaseHeldByOther ? `Order is already claimed by ${order.claimed_by}` : 'Completed order',
          order,
        })
        return
      }

      const claimedAt = nowIso()
      order.claimed_by = stationId
      order.claimed_at = claimedAt
      order.claim_expires_at = new Date(Date.now() + leaseSeconds * 1000).toISOString()
      sendJson(res, 200, { order })
      return
    }

    const releaseMatch = path.match(/^\/orders\/([^/]+)\/release-claim$/)
    if (releaseMatch && req.method === 'POST') {
      const input = await readJson(req)
      const order = resolveOrder(state, releaseMatch[1])
      if (!order || order.claimed_by !== input.stationId) {
        sendJson(res, 409, { error: 'Order could not be released', order })
        return
      }

      order.claimed_by = null
      order.claimed_at = null
      order.claim_expires_at = null
      sendJson(res, 200, { order })
      return
    }

    sendJson(res, 404, { error: `Unhandled mock route: ${req.method} ${path}` })
  })

  server.on('upgrade', (_req, socket) => {
    socket.destroy()
  })

  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  }
}

const waitForHttp = async (url, timeoutMs = 30_000) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling until Vite is ready.
    }
    await wait(250)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

const runProcess = (command, args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', rejectRun)
    child.on('close', (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr })
        return
      }

      const error = new Error(`${command} ${args.join(' ')} exited with ${code}`)
      error.stdout = stdout
      error.stderr = stderr
      rejectRun(error)
    })
  })

const playwrightCliArgs = (session, commandArgs) => [
  '--yes',
  '--package',
  '@playwright/cli',
  'playwright-cli',
  '--session',
  session,
  ...commandArgs,
]

const runBrowserSmoke = async ({ appUrl, controlUrl }) => {
  const session = `dt${Date.now().toString(36).slice(-6)}`
  const runCodePath = join(outputDir, 'dual-tablet-run-code.mjs')
  const runCode = String.raw`async (page) => {
  const appUrl = __APP_URL__
  const controlUrl = __CONTROL_URL__
  const outputDir = __OUTPUT_DIR__
  const browser = page.context().browser()
  if (!browser) {
    throw new Error('Playwright browser is not available')
  }
  const apiRequest = page.context().request

  const steps = []
  const record = (name) => steps.push(name)
  const pause = (ms) => page.waitForTimeout(ms)
  const fail = (message) => {
    throw new Error(message)
  }
  const assert = (condition, message) => {
    if (!condition) {
      fail(message)
    }
  }
  const control = async (path, init = {}) => {
    const response = await apiRequest.fetch(controlUrl + path, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      data: init.body ? JSON.parse(init.body) : undefined,
    })
    if (!response.ok()) {
      throw new Error(path + ' failed with ' + response.status() + ': ' + await response.text())
    }
    return response.json()
  }
  const state = () => control('/state')
  const waitForState = async (predicate, label, timeoutMs = 10_000) => {
    const startedAt = Date.now()
    let latest = null
    while (Date.now() - startedAt < timeoutMs) {
      latest = await state()
      if (predicate(latest)) {
        return latest
      }
      await pause(250)
    }
    throw new Error('Timed out waiting for ' + label + '. Latest state: ' + JSON.stringify(latest))
  }
  const waitForText = async (targetPage, text, timeout = 12_000) => {
    await targetPage.getByText(text, { exact: false }).first().waitFor({ timeout })
  }
  const waitForSyncedUi = async (targetPage) => {
    await targetPage.waitForFunction(() => {
      const bodyText = document.body.innerText
      return (
        bodyText.includes('API 已同步') ||
        bodyText.includes('自動同步完成') ||
        bodyText.includes('桌位設定已由資料庫同步')
      )
    }, undefined, { timeout: 15_000 })
  }
  const waitForReminder = async (targetPage) => {
    await targetPage.locator('.online-reminder-banner').waitFor({ state: 'visible', timeout: 12_000 })
  }
  const waitForNoReminder = async (targetPage, timeoutMs = 12_000) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (await targetPage.locator('.online-reminder-banner').count() === 0) {
        return
      }
      await pause(250)
    }
    throw new Error('Online reminder banner stayed visible')
  }
  const openQueueWorkspace = async (targetPage) => {
    await targetPage.locator('.floor-mode-switch').getByRole('button', { name: '外帶 / 外送' }).click()
    await targetPage.locator('.queue-section').waitFor({ state: 'visible', timeout: 8_000 })
  }
  const openFloorWorkspaceFromToolbox = async (targetPage) => {
    await targetPage.locator('.floating-toolbox-button').click()
    await targetPage.locator('.toolbox-card').filter({ hasText: '桌位地圖' }).click()
    await targetPage.locator('.floor-section').waitFor({ state: 'visible', timeout: 8_000 })
  }
  const makeTablet = async (stationId) => {
    const consoleMessages = []
    const pageErrors = []
    const context = await browser.newContext({
      viewport: { width: 900, height: 1180 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: true,
      permissions: ['notifications'],
    })
    await context.addInitScript((id) => {
      window.localStorage.setItem('script-coffee-pos-station-id', id)
      window.localStorage.setItem('script-coffee-pos-backend-edit-mode', 'true')
    }, stationId)
    const tabletPage = await context.newPage()
    tabletPage.on('console', (message) => {
      consoleMessages.push(message.type() + ': ' + message.text())
    })
    tabletPage.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })
    await tabletPage.goto(appUrl)
    try {
      await waitForSyncedUi(tabletPage)
    } catch (error) {
      await tabletPage.screenshot({ path: outputDir + '/' + stationId + '-boot-failure.png', fullPage: true }).catch(() => {})
      const bodyText = await tabletPage.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
      throw new Error(
        'Tablet ' + stationId + ' did not reach API synced state. Body: ' + bodyText.slice(0, 1200) +
        ' Console: ' + consoleMessages.slice(-12).join(' | ') +
        ' Page errors: ' + pageErrors.join(' | ') +
        ' Cause: ' + error.message,
      )
    }
    return { context, page: tabletPage, stationId }
  }

  const tabletA = await makeTablet('tablet-A111')
  const tabletB = await makeTablet('tablet-B222')

  try {
    const waitlineName = 'Sync Guest A'
    await tabletA.page.locator('.waitline-form').getByPlaceholder('姓名/稱呼').fill(waitlineName)
    await tabletA.page.locator('.waitline-form').getByPlaceholder('電話').fill('0912-111-222')
    await tabletA.page.locator('.waitline-form').getByPlaceholder('備註/標籤').fill('floor-plan-sync')
    await tabletA.page.locator('.waitline-form-submit').click()
    await waitForState((snapshot) => snapshot.floorPlan.waitline.some((entry) => entry.name === waitlineName), 'A waitline persisted')
    await waitForText(tabletB.page, waitlineName)
    record('floor plan and waitline synced from tablet A to tablet B')

    await tabletA.page.locator('.waitline-row').filter({ hasText: waitlineName })
      .getByRole('button', { name: '提前點餐' })
      .click()
    await tabletA.page.getByRole('button', { name: /Bagel/ }).first().click()
    const preorderSnapshot = await waitForState((snapshot) => {
      const entry = snapshot.floorPlan.waitline.find((item) => item.name === waitlineName)
      const order = entry?.orderId ? snapshot.orders.find((item) => item.order_number === entry.orderId) : null
      return Boolean(order?.draft_lines?.length)
    }, 'waitline preorder draft synced')
    const preorderEntry = preorderSnapshot.floorPlan.waitline.find((entry) => entry.name === waitlineName)
    const preorderOrderCount = preorderSnapshot.orders.filter((order) => order.order_number === preorderEntry.orderId).length
    assert(preorderOrderCount === 1, 'Expected one waitline preorder draft, got ' + preorderOrderCount)
    await Promise.all([openFloorWorkspaceFromToolbox(tabletA.page), openFloorWorkspaceFromToolbox(tabletB.page)])
    await waitForText(tabletB.page, '尚未提前點餐', 1_000).catch(() => {})
    await waitForText(tabletB.page, '1 項', 12_000)
    await tabletA.page.locator('.waitline-row').filter({ hasText: waitlineName })
      .getByRole('button', { name: '開啟點餐' })
      .click()
    await waitForState((snapshot) => (
      snapshot.orders.filter((order) => order.order_number === preorderEntry.orderId).length === 1
    ), 'waitline preorder reopened without duplicate draft')
    record('waitline preorder order id synced and reopened without duplicate draft')

    await Promise.all([openFloorWorkspaceFromToolbox(tabletA.page), openFloorWorkspaceFromToolbox(tabletB.page)])
    await Promise.all([openQueueWorkspace(tabletA.page), openQueueWorkspace(tabletB.page)])

    const claimOrderNumber = 'WEB-CLAIM-001'
    await control('/add-online-order', {
      method: 'POST',
      body: JSON.stringify({ orderNumber: claimOrderNumber, customer_name: 'Claim Race' }),
    })
    await Promise.all([waitForReminder(tabletA.page), waitForReminder(tabletB.page)])
    await Promise.allSettled([
      tabletA.page.locator('.online-reminder-accept-button').first().click(),
      tabletB.page.locator('.online-reminder-accept-button').first().click(),
    ])
    const claimedSnapshot = await waitForState((snapshot) => {
      const order = snapshot.orders.find((entry) => entry.order_number === claimOrderNumber)
      return Boolean(order?.claimed_by)
    }, 'claim lease winner')
    const claimedOrder = claimedSnapshot.orders.find((entry) => entry.order_number === claimOrderNumber)
    assert(['tablet-A111', 'tablet-B222'].includes(claimedOrder.claimed_by), 'Unexpected claim owner ' + claimedOrder.claimed_by)
    await Promise.all([waitForNoReminder(tabletA.page), waitForNoReminder(tabletB.page)])
    record('claim lease allowed exactly one winner: ' + claimedOrder.claimed_by)

    const snoozeOrderNumber = 'WEB-SNOOZE-001'
    await control('/add-online-order', {
      method: 'POST',
      body: JSON.stringify({ orderNumber: snoozeOrderNumber, customer_name: 'Snooze Sync' }),
    })
    await Promise.all([waitForReminder(tabletA.page), waitForReminder(tabletB.page)])
    await tabletA.page.locator('.online-reminder-actions').getByRole('button', { name: '稍後提醒' }).click()
    await waitForState((snapshot) => snapshot.reminderStates.some((entry) => (
      entry.order_number === snoozeOrderNumber &&
      entry.status === 'snoozed' &&
      entry.snoozed_by_station_id === 'tablet-A111'
    )), 'snooze state persisted')
    await waitForNoReminder(tabletB.page)
    record('online order snooze state suppressed tablet B reminder')

    await control('/api-available', {
      method: 'POST',
      body: JSON.stringify({ available: false }),
    })
    await waitForState((snapshot) => snapshot.failedRequests > 0, 'frontend fallback request during API outage', 8_000)
    await control('/add-waitline', {
      method: 'POST',
      body: JSON.stringify({ name: 'Reconnect Guest', note: 'api-recovery' }),
    })
    await control('/api-available', {
      method: 'POST',
      body: JSON.stringify({ available: true }),
    })
    await openFloorWorkspaceFromToolbox(tabletB.page)
    await waitForText(tabletB.page, 'Reconnect Guest', 12_000)
    await waitForSyncedUi(tabletB.page)
    record('tablet B recovered after API outage and fallback polling pulled new floor plan')

    await tabletA.page.screenshot({ path: outputDir + '/dual-tablet-a-final.png', fullPage: true })
    await tabletB.page.screenshot({ path: outputDir + '/dual-tablet-b-final.png', fullPage: true })

    return {
      passed: steps,
      screenshots: [
        outputDir + '/dual-tablet-a-final.png',
        outputDir + '/dual-tablet-b-final.png',
      ],
    }
  } finally {
    await tabletA.context.close().catch(() => {})
    await tabletB.context.close().catch(() => {})
  }
}`
    .replace('__APP_URL__', JSON.stringify(appUrl))
    .replace('__CONTROL_URL__', JSON.stringify(controlUrl))
    .replace('__OUTPUT_DIR__', JSON.stringify(outputDir))

  await mkdir(outputDir, { recursive: true })
  await writeFile(runCodePath, runCode)

  const env = {
    TEST_APP_URL: appUrl,
    TEST_CONTROL_URL: controlUrl,
    TEST_OUTPUT_DIR: outputDir,
  }

  try {
    await runProcess('npx', playwrightCliArgs(session, ['open', 'about:blank']), { env })
    const result = await runProcess('npx', playwrightCliArgs(session, ['run-code', '--filename', runCodePath]), { env })
    if (result.stdout.includes('### Error') || result.stderr.includes('### Error')) {
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
      throw new Error('Playwright smoke failed')
    }
    const resultMatch = result.stdout.match(/### Result\n([\s\S]*?)\n### Ran Playwright code/)
    console.log(resultMatch?.[1]?.trim() ?? result.stdout.trim())
    process.stderr.write(result.stderr)
  } finally {
    await runProcess('npx', playwrightCliArgs(session, ['close']), { env }).catch(() => {})
  }
}

const main = async () => {
  await mkdir(outputDir, { recursive: true })
  const mockApi = await createMockApiServer()
  const vitePort = await freePort()
  const appUrl = `http://127.0.0.1:${vitePort}/`
  const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: mockApi.origin,
      VITE_SUPABASE_ANON_KEY: 'dual-tablet-smoke-key',
      VITE_POS_QUEUE_SYNC_INTERVAL_MS: '800',
      VITE_POS_STORE_ID: 'dual-tablet-smoke',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let viteOutput = ''
  vite.stdout.on('data', (chunk) => {
    viteOutput += chunk
  })
  vite.stderr.on('data', (chunk) => {
    viteOutput += chunk
  })

  try {
    await waitForHttp(appUrl)
    console.log(`Dual-tablet smoke app: ${appUrl}`)
    console.log(`Mock POS API: ${mockApi.origin}`)
    await runBrowserSmoke({
      appUrl,
      controlUrl: `${mockApi.origin}/__test`,
    })
    console.log('Dual-tablet smoke passed.')
  } catch (error) {
    console.error(viteOutput)
    throw error
  } finally {
    vite.kill('SIGTERM')
    await mockApi.close()
  }
}

main().catch((error) => {
  console.error(error?.stdout ?? '')
  console.error(error?.stderr ?? '')
  console.error(error)
  process.exit(1)
})
