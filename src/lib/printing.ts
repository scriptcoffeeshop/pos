import type { PosOrder, PrintStation } from '../types/pos'
import { formatCurrency } from './formatters'

const escapeEzplText = (value: string): string => value.replaceAll('"', "'").replace(/\s+/g, ' ').trim().slice(0, 42)

export const buildEzplTicketPreview = (order: PosOrder, station: PrintStation): string => {
  const itemCommands = order.lines.flatMap((line, index) => {
    const y = 112 + index * 28
    const name = escapeEzplText(`${line.quantity}x ${line.name}`)
    const amount = escapeEzplText(formatCurrency(line.unitPrice * line.quantity))
    return [`A20,${y},0,2,1,1,N,"${name}"`, `A420,${y},0,2,1,1,N,"${amount}"`]
  })

  const totalY = 128 + order.lines.length * 28
  const note = escapeEzplText(order.note || '-')

  return [
    '^Q120,3',
    '^W80',
    '^H10',
    '^P1',
    '^S2',
    `A20,20,0,3,1,1,N,"Script Coffee POS"`,
    `A20,58,0,2,1,1,N,"${escapeEzplText(order.id)}"`,
    `A20,84,0,2,1,1,N,"${escapeEzplText(`${order.mode} ${station.name}`)}"`,
    ...itemCommands,
    `A20,${totalY},0,2,1,1,N,"TOTAL ${escapeEzplText(formatCurrency(order.subtotal))}"`,
    `A20,${totalY + 28},0,2,1,1,N,"NOTE ${note}"`,
    'E',
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
