import type {
  CartLine,
  PosOrder,
  PrinterSettings,
  PrintLabelMode,
  PrintRuleSetting,
  PrintStation,
  PrintStationSetting,
} from '../types/pos'
import { formatCurrency } from './formatters'

const escapeEzplText = (value: string): string => value.replaceAll('"', "'").replace(/\s+/g, ' ').trim().slice(0, 42)

type PrintableMode = Exclude<PrintLabelMode, 'both'>

export interface PrintPayloadJob {
  id: string
  ruleId: string
  ruleName: string
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

const lineMatchesRule = (line: CartLine, rule: PrintRuleSetting): boolean => {
  if (rule.categories.length === 0 || !line.category) {
    return true
  }

  return rule.categories.includes(line.category)
}

const modesForRule = (mode: PrintLabelMode): PrintableMode[] => {
  if (mode === 'both') {
    return ['receipt', 'label']
  }

  return [mode]
}

const linesForMode = (lines: CartLine[], mode: PrintableMode): CartLine[] => {
  if (mode === 'receipt') {
    return lines
  }

  return lines.filter((line) => line.printLabel !== false)
}

const buildReceiptPayload = (
  order: PosOrder,
  station: PrintStation,
  lines: CartLine[],
  ruleName = station.name,
): string => {
  const itemCommands = lines.flatMap((line, index) => {
    const y = 112 + index * 28
    const name = escapeEzplText(`${line.quantity}x ${line.name}`)
    const amount = escapeEzplText(formatCurrency(line.unitPrice * line.quantity))
    return [`A20,${y},0,2,1,1,N,"${name}"`, `A420,${y},0,2,1,1,N,"${amount}"`]
  })

  const totalY = 128 + lines.length * 28
  const note = escapeEzplText(order.note || '-')

  return [
    '^Q120,3',
    '^W80',
    '^H10',
    '^P1',
    '^S2',
    `A20,20,0,3,1,1,N,"Script Coffee POS"`,
    `A20,58,0,2,1,1,N,"${escapeEzplText(order.id)}"`,
    `A20,84,0,2,1,1,N,"${escapeEzplText(`${order.mode} ${ruleName}`)}"`,
    ...itemCommands,
    `A20,${totalY},0,2,1,1,N,"TOTAL ${escapeEzplText(formatCurrency(lineTotal(lines)))}"`,
    `A20,${totalY + 28},0,2,1,1,N,"NOTE ${note}"`,
    'E',
  ].join('\n')
}

const buildLabelPayload = (
  order: PosOrder,
  station: PrintStation,
  lines: CartLine[],
  ruleName: string,
): string => {
  const labels = lines.flatMap((line) =>
    Array.from({ length: line.quantity }, (_, index) => ({
      line,
      sequence: index + 1,
    })),
  )

  return labels
    .map(({ line, sequence }) => {
      const options = line.options.length > 0 ? line.options.join(' / ') : '-'
      const quantityMark = line.quantity > 1 ? `${sequence}/${line.quantity}` : '1/1'

      return [
        '^Q70,3',
        '^W80',
        '^H10',
        '^P1',
        '^S2',
        `A20,18,0,2,1,1,N,"${escapeEzplText(order.id)}"`,
        `A20,46,0,3,1,1,N,"${escapeEzplText(line.name)}"`,
        `A20,82,0,2,1,1,N,"${escapeEzplText(options)}"`,
        `A20,108,0,2,1,1,N,"${escapeEzplText(`${order.mode} ${ruleName}`)}"`,
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
  ruleName: string,
): string => {
  if (mode === 'receipt') {
    return buildReceiptPayload(order, station, lines, ruleName)
  }

  return buildLabelPayload(order, station, lines, ruleName)
}

const buildSkippedReason = (settings: PrinterSettings, order: PosOrder): string => {
  const hasEnabledStation = settings.stations.some((station) => station.enabled && station.autoPrint)
  const hasModeRule = settings.rules.some((rule) => rule.enabled && rule.serviceMode === order.mode)

  if (!hasEnabledStation) {
    return '沒有啟用自動列印的出單機'
  }

  if (!hasModeRule) {
    return '沒有符合目前服務方式的啟用出單規則'
  }

  return '出單規則沒有符合此訂單品項或貼紙設定'
}

export const buildOrderPrintPlan = (order: PosOrder, settings: PrinterSettings): OrderPrintPlan => {
  const stationById = new Map(
    settings.stations
      .filter((station) => station.enabled && station.autoPrint)
      .map((station) => [station.id, stationSettingToRuntime(station)]),
  )
  const jobs: PrintPayloadJob[] = []

  for (const rule of settings.rules) {
    if (!rule.enabled || rule.serviceMode !== order.mode) {
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
          id: `${rule.id}-${mode}-${copy}`,
          ruleId: rule.id,
          ruleName: rule.name,
          mode,
          copy,
          station,
          lines: printableLines,
          payload: buildPayload(order, station, printableLines, mode, rule.name),
        })
      }
    }
  }

  const skippedReason = jobs.length === 0 ? buildSkippedReason(settings, order) : null
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
        `LINES ${job.lines.map((line) => `${line.quantity}x ${line.name}`).join(', ')}`,
        job.payload,
      ].join('\n'),
    )
    .join('\n\n')
}

export const buildEzplTicketPreview = (order: PosOrder, station: PrintStation): string =>
  buildReceiptPayload(order, station, order.lines)

export const buildPrinterHealthcheckPreview = (station: PrintStation): string =>
  [
    `PRINTER ${station.name}`,
    `HOST ${station.host}:${station.port}`,
    `PROTOCOL ${station.protocol}`,
    'PAYLOAD ^Q40,3',
    'PAYLOAD ^W80',
    'PAYLOAD A20,20,0,3,1,1,N,"Script Coffee POS TEST"',
    'PAYLOAD E',
  ].join('\n')
