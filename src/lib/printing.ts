import type { PosOrder, PrintStation } from '../types/pos'
import { formatCurrency } from './formatters'

export const buildEzplTicketPreview = (order: PosOrder, station: PrintStation): string => {
  const lines = order.lines
    .map((line) => `${line.quantity}x ${line.name} ${formatCurrency(line.unitPrice * line.quantity)}`)
    .join('\n')

  return [
    `PRINTER ${station.host}:${station.port}`,
    `ORDER ${order.id}`,
    `MODE ${order.mode}`,
    lines,
    `TOTAL ${formatCurrency(order.subtotal)}`,
    order.note ? `NOTE ${order.note}` : 'NOTE -',
    'EZPL POC: send over Capacitor TCP socket in Phase 2',
  ].join('\n')
}

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
