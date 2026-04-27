import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PrintStation } from '../types/pos'

interface LanPrinterSendOptions {
  host: string
  port: number
  payload: string
  timeoutMs?: number
}

interface LanPrinterSendResult {
  bytesWritten: number
  elapsedMs: number
}

interface LanPrinterPlugin {
  send(options: LanPrinterSendOptions): Promise<LanPrinterSendResult>
}

const LanPrinter = registerPlugin<LanPrinterPlugin>('LanPrinter')

export const isNativeLanPrinterAvailable = (): boolean => Capacitor.getPlatform() === 'android'

export const lanPrinterModeLabel = (): string =>
  isNativeLanPrinterAvailable() ? 'Android TCP socket' : '瀏覽器預覽模式'

export const sendLanPrintPayload = async (
  station: PrintStation,
  payload: string,
  timeoutMs = 4500,
): Promise<LanPrinterSendResult> => {
  if (!isNativeLanPrinterAvailable()) {
    throw new Error('LAN TCP 列印只能在 Android APK 內執行')
  }

  return LanPrinter.send({
    host: station.host,
    port: station.port,
    payload,
    timeoutMs,
  })
}
