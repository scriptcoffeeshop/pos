import type {
  CartLine,
  PosOrder,
  PrinterSettings,
  PrintLabelMode,
  PrintRuleSetting,
  PrintRuleTiming,
  PrintStation,
  PrintStationSetting,
} from '../types/pos'
import { formatCurrency, formatOrderTime } from './formatters'

const escapeEzplText = (value: string): string => value.replaceAll('"', "'").replace(/\s+/g, ' ').trim().slice(0, 42)

type PrintableMode = Exclude<PrintLabelMode, 'both'>
const defaultPrintRuleTimings: PrintRuleTiming[] = ['order', 'reprint']

const printRuleTimingLabels: Record<PrintRuleTiming, string> = {
  order: '出單',
  reprint: '重印',
}

export interface PrintPayloadJob {
  id: string
  ruleId: string
  ruleName: string
  timing: PrintRuleTiming
  mode: PrintableMode
  copy: number
  station: PrintStation
  lines: CartLine[]
  payload: string
}

export interface OrderPrintPlan {
  jobs: PrintPayloadJob[]
  preview: string
  skippedReason: string | null
}

export interface OrderPrintPlanOptions {
  timing?: PrintRuleTiming
}

const modeLabels: Record<PrintableMode, string> = {
  receipt: '收據',
  label: '貼紙',
}

const stationSettingToRuntime = (station: PrintStationSetting): PrintStation => ({
  id: station.id,
  name: station.name,
  host: station.host,
  port: station.port,
  protocol: station.protocol,
  online: station.enabled,
  autoPrint: station.autoPrint,
  lastPrintAt: null,
})

const lineTotal = (lines: CartLine[]): number =>
  lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0)

const fulfillmentLinesForOrder = (order: PosOrder): string[] => {
  const fulfillmentLines: string[] = []

  if (order.requestedFulfillmentAt) {
    const action = order.mode === 'delivery' ? 'DELIVER' : 'PICKUP'
    fulfillmentLines.push(`${action} ${formatOrderTime(order.requestedFulfillmentAt)}`)
  }

  if (order.deliveryAddress) {
    fulfillmentLines.push(`ADDR ${order.deliveryAddress}`)
  }

  return fulfillmentLines
}

const invoiceLinesForOrder = (order: PosOrder): string[] => {
  const invoiceLines: string[] = []

  if (order.taxId) {
    invoiceLines.push(`TAX ID ${order.taxId}`)
  }

  if (order.invoiceCarrierBarcode) {
    invoiceLines.push(`CARRIER ${order.invoiceCarrierBarcode}`)
  }

  return invoiceLines
}

const paymentMethodLabels: Record<PosOrder['paymentMethod'], string> = {
  cash: 'CASH',
  card: 'CARD',
  'line-pay': 'LINE PAY',
  jkopay: 'JKOPAY',
  transfer: 'TRANSFER',
}

const paymentLinesForOrder = (order: PosOrder): string[] => {
  if (order.paymentBreakdown.length === 0) {
    return [`PAY ${paymentMethodLabels[order.paymentMethod]}`]
  }

  return order.paymentBreakdown
    .filter((payment) => payment.amount > 0)
    .map((payment) => `PAY ${paymentMethodLabels[payment.paymentMethod]} ${formatCurrency(payment.amount)}`)
}

const lineMatchesRule = (line: CartLine, rule: PrintRuleSetting): boolean => {
  const ruleCategories = rule.categories ?? []
  const ruleItemIds = rule.itemIds ?? []

  if (ruleItemIds.includes(line.itemId) || (line.productId && ruleItemIds.includes(line.productId))) {
    return true
  }

  if (line.comboItems?.some((item) => ruleItemIds.includes(item.productId) || ruleItemIds.includes(item.productSku))) {
    return true
  }

  return Boolean(line.category && ruleCategories.includes(line.category))
}

const lineExcludedFromRuleCount = (line: CartLine, rule: PrintRuleSetting): boolean => {
  const excludedCategories = rule.countExcludedCategories ?? []
  const excludedItemIds = rule.countExcludedItemIds ?? []

  if (excludedItemIds.includes(line.itemId) || (line.productId && excludedItemIds.includes(line.productId))) {
    return true
  }

  if (line.comboItems?.some((item) => excludedItemIds.includes(item.productId) || excludedItemIds.includes(item.productSku))) {
    return true
  }

  return Boolean(line.category && excludedCategories.includes(line.category))
}

const modesForRule = (mode: PrintLabelMode): PrintableMode[] => {
  if (mode === 'both') {
    return ['receipt', 'label']
  }

  return [mode]
}

const timingsForRule = (rule: PrintRuleSetting): PrintRuleTiming[] => {
  const timings = Array.isArray(rule.timings) ? rule.timings : []
  const normalized = timings.filter((timing): timing is PrintRuleTiming =>
    timing === 'order' || timing === 'reprint',
  )
  return normalized.length > 0 ? [...new Set(normalized)] : defaultPrintRuleTimings
}

const ruleMatchesTiming = (rule: PrintRuleSetting, timing: PrintRuleTiming): boolean =>
  timingsForRule(rule).includes(timing)

const linesForMode = (lines: CartLine[], mode: PrintableMode): CartLine[] => {
  const activeLines = lines.filter((line) => line.printPaused !== true)
  if (mode === 'receipt') {
    return activeLines
  }

  return activeLines.filter((line) => line.printLabel !== false)
}

const buildReceiptPayload = (
  order: PosOrder,
  station: PrintStation,
  lines: CartLine[],
  ruleName = station.name,
  title = 'Script Coffee POS',
): string => {
  const itemCommands = lines.flatMap((line, index) => {
    const y = 112 + index * 28
    const name = escapeEzplText(`${line.quantity}x ${line.name}`)
    const amount = escapeEzplText(formatCurrency(line.unitPrice * line.quantity))
    return [`A20,${y},0,2,1,1,N,"${name}"`, `A420,${y},0,2,1,1,N,"${amount}"`]
  })

  const totalY = 128 + lines.length * 28
  const note = escapeEzplText(order.note || '-')
  const footerLines = [
    `TOTAL ${formatCurrency(lineTotal(lines))}`,
    ...paymentLinesForOrder(order),
    ...fulfillmentLinesForOrder(order),
    ...invoiceLinesForOrder(order),
    `NOTE ${note}`,
  ]

  return [
    `^Q${Math.max(120, 70 + lines.length * 10 + footerLines.length * 9)},3`,
    '^W80',
    '^H10',
    '^P1',
    '^S2',
    `A20,20,0,3,1,1,N,"${escapeEzplText(title)}"`,
    `A20,58,0,2,1,1,N,"${escapeEzplText(order.id)}"`,
    `A20,84,0,2,1,1,N,"${escapeEzplText(`${order.mode} ${ruleName}`)}"`,
    ...itemCommands,
    ...footerLines.map((line, index) => `A20,${totalY + index * 28},0,2,1,1,N,"${escapeEzplText(line)}"`),
    'E',
  ].join('\n')
}

const buildLabelPayload = (
  order: PosOrder,
  station: PrintStation,
  lines: CartLine[],
  rule: PrintRuleSetting,
): string => {
  const totalCount = lines.reduce(
    (total, line) => total + (lineExcludedFromRuleCount(line, rule) ? 0 : line.quantity),
    0,
  )
  let countableSequence = 0
  const labels = lines.flatMap((line) => {
    const isCountExcluded = lineExcludedFromRuleCount(line, rule)
    return Array.from({ length: line.quantity }, (_, index) => ({
      line,
      sequence: index + 1,
      isCountExcluded,
      orderSequence: isCountExcluded ? null : (countableSequence += 1),
    }))
  })

  return labels
    .map(({ line, sequence, isCountExcluded, orderSequence }) => {
      const options = line.options.length > 0 ? line.options.join(' / ') : '-'
      const totalMark = Math.max(totalCount, 0)
      const quantityMark = isCountExcluded ? `NC/${totalMark}` : `${orderSequence ?? sequence}/${Math.max(totalMark, 1)}`

      return [
        '^Q70,3',
        '^W80',
        '^H10',
        '^P1',
        '^S2',
        `A20,18,0,2,1,1,N,"${escapeEzplText(order.id)}"`,
        `A20,46,0,3,1,1,N,"${escapeEzplText(line.name)}"`,
        `A20,82,0,2,1,1,N,"${escapeEzplText(options)}"`,
        `A20,108,0,2,1,1,N,"${escapeEzplText(`${order.mode} ${rule.name}`)}"`,
        `A420,18,0,2,1,1,N,"${escapeEzplText(quantityMark)}"`,
        `A420,82,0,2,1,1,N,"${escapeEzplText(station.name)}"`,
        'E',
      ].join('\n')
    })
    .join('\n')
}

const buildPayload = (
  order: PosOrder,
  station: PrintStation,
  lines: CartLine[],
  mode: PrintableMode,
  rule: PrintRuleSetting,
): string => {
  if (mode === 'receipt') {
    return buildReceiptPayload(order, station, lines, rule.name)
  }

  return buildLabelPayload(order, station, lines, rule)
}

const buildSkippedReason = (settings: PrinterSettings, order: PosOrder, timing: PrintRuleTiming): string => {
  const hasEnabledStation = settings.stations.some((station) => station.enabled && station.autoPrint)
  const hasModeRule = settings.rules.some((rule) => rule.enabled && rule.serviceMode === order.mode)
  const hasTimingRule = settings.rules.some((rule) =>
    rule.enabled && rule.serviceMode === order.mode && ruleMatchesTiming(rule, timing),
  )

  if (!hasEnabledStation) {
    return '沒有啟用自動列印的出單機'
  }

  if (!hasModeRule) {
    return '沒有符合目前服務方式的啟用出單規則'
  }

  if (!hasTimingRule) {
    return `沒有符合「${printRuleTimingLabels[timing]}」時機的啟用出單規則`
  }

  if (order.lines.length > 0 && order.lines.every((line) => line.printPaused === true)) {
    return '此訂單品項皆已暫停出單'
  }

  return '出單規則沒有符合此訂單品項或貼紙設定'
}

export const buildOrderPrintPlan = (
  order: PosOrder,
  settings: PrinterSettings,
  options: OrderPrintPlanOptions = {},
): OrderPrintPlan => {
  const timing = options.timing ?? 'order'
  const stationById = new Map(
    settings.stations
      .filter((station) => station.enabled && station.autoPrint)
      .map((station) => [station.id, stationSettingToRuntime(station)]),
  )
  const jobs: PrintPayloadJob[] = []

  for (const rule of settings.rules) {
    if (!rule.enabled || rule.serviceMode !== order.mode || !ruleMatchesTiming(rule, timing)) {
      continue
    }

    const station = stationById.get(rule.stationId)
    if (!station) {
      continue
    }

    const matchingLines = order.lines.filter((line) => lineMatchesRule(line, rule))
    if (matchingLines.length === 0) {
      continue
    }

    for (const mode of modesForRule(rule.labelMode)) {
      const printableLines = linesForMode(matchingLines, mode)
      if (printableLines.length === 0) {
        continue
      }

      for (let copy = 1; copy <= rule.copies; copy += 1) {
        jobs.push({
          id: `${rule.id}-${timing}-${mode}-${copy}`,
          ruleId: rule.id,
          ruleName: rule.name,
          timing,
          mode,
          copy,
          station,
          lines: printableLines,
          payload: buildPayload(order, station, printableLines, mode, rule),
        })
      }
    }
  }

  const skippedReason = jobs.length === 0 ? buildSkippedReason(settings, order, timing) : null
  const preview = buildPrintPlanPreview({ jobs, preview: '', skippedReason })
  return { jobs, preview, skippedReason }
}

export const buildPrintPlanPreview = (plan: OrderPrintPlan): string => {
  if (plan.jobs.length === 0) {
    return `SKIPPED ${plan.skippedReason ?? '沒有建立列印任務'}`
  }

  return plan.jobs
    .map((job, index) =>
      [
        `JOB ${index + 1}/${plan.jobs.length} ${job.station.name} ${modeLabels[job.mode]} copy ${job.copy}`,
        `RULE ${job.ruleName}`,
        `TIMING ${printRuleTimingLabels[job.timing]}`,
        `LINES ${job.lines.map((line) => `${line.quantity}x ${line.name}`).join(', ')}`,
        job.payload,
      ].join('\n'),
    )
    .join('\n\n')
}

export const buildEzplTicketPreview = (order: PosOrder, station: PrintStation): string =>
  buildReceiptPayload(order, station, order.lines)

const orderQrUrl = (order: PosOrder): string => {
  const params = new URLSearchParams({
    view: 'order',
    source: 'qr',
    order: order.remoteId ?? order.id,
    openedAt: order.createdAt,
  })

  if (order.mode === 'dine-in') {
    params.set('mode', 'dine-in')
  }

  if (order.note) {
    const floorMatch = order.note.match(/樓層\s*([^、，,]+)/i)
    if (floorMatch?.[1]) {
      params.set('floor', floorMatch[1].trim())
    }

    const tableMatch = order.note.match(/桌位\s*([A-Z0-9-]+)/i)
    if (tableMatch?.[1]) {
      params.set('table', tableMatch[1])
    }
  }

  return `https://order.scriptcoffee.com.tw/?${params.toString()}`
}

export const buildOrderQrCodePayload = (
  order: PosOrder,
  station: PrintStation,
  options: { url?: string; logoText?: string } = {},
): string => {
  const url = options.url ?? orderQrUrl(order)
  const logoText = (options.logoText?.trim() || 'Script Coffee').slice(0, 40)
  const qrData = url.slice(0, 180)

  return [
    '^Q90,3',
    '^W80',
    '^H10',
    '^P1',
    '^S2',
    `A20,18,0,3,1,1,N,"${escapeEzplText(`${logoText} QR`)}"`,
    `A20,52,0,2,1,1,N,"${escapeEzplText(order.id)}"`,
    `A20,78,0,2,1,1,N,"${escapeEzplText(`${order.customerName} ${order.mode}`)}"`,
    `W150,112,1,1,H,0,6,${qrData.length},0`,
    qrData,
    `A20,320,0,2,1,1,N,"${escapeEzplText('Scan to order')}"`,
    `A20,346,0,1,1,1,N,"${escapeEzplText(station.name)}"`,
    'E',
  ].join('\n')
}

export const buildCustomerReceiptPayload = (order: PosOrder, station: PrintStation): string =>
  buildReceiptPayload(order, station, order.lines, '顧客聯', 'Script Coffee 顧客聯')

export const buildTransactionDetailPayload = (order: PosOrder, station: PrintStation): string =>
  buildReceiptPayload(order, station, order.lines, '交易明細', 'Script Coffee 交易明細')

export const buildCashDrawerPulsePayload = (): string => '\x1bp\x00\x19\xfa'

export const buildPrinterHealthcheckPayload = (station: PrintStation, testedAt = new Date()): string =>
  [
    '^Q60,3',
    '^W80',
    '^H10',
    '^P1',
    '^S2',
    'A20,18,0,3,1,1,N,"Script Coffee POS TEST"',
    `A20,54,0,2,1,1,N,"${escapeEzplText(station.name)}"`,
    `A20,80,0,2,1,1,N,"${escapeEzplText(`${station.host}:${station.port}`)}"`,
    `A20,106,0,2,1,1,N,"${escapeEzplText(testedAt.toISOString())}"`,
    'E',
  ].join('\n')

export const buildPrinterHealthcheckPreview = (
  station: PrintStation,
  payload = buildPrinterHealthcheckPayload(station),
): string =>
  [
    `PRINTER ${station.name}`,
    `HOST ${station.host}:${station.port}`,
    `PROTOCOL ${station.protocol}`,
    'PAYLOAD',
    payload,
  ].join('\n')
