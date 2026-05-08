import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  currentStationId,
  currentStationLabel,
  posApiConnection,
} from './posApi'
import type { OnlineOrderingSettings, PosOrder } from '../types/pos'

interface OnlineOrderNotificationOrder {
  id: string
  source: PosOrder['source']
  customerName: string
  subtotal: number
  createdAt: string
}

interface OnlineOrderNotifierConfigureOptions {
  apiBaseUrl: string
  anonKey: string
  stationId: string
  stationLabel: string
  acceptanceRequired: boolean
  reminderMinutes: number
  soundEnabled: boolean
  notificationRepeatMode: OnlineOrderingSettings['notificationRepeatMode']
  notificationVolume: number
  pollIntervalMs: number
}

interface OnlineOrderNotifierSyncOptions {
  activeOrders: OnlineOrderNotificationOrder[]
  acceptedOrderIds: string[]
  appActive: boolean
  acceptanceRequired: boolean
  reminderMinutes: number
  soundEnabled: boolean
  notificationRepeatMode: OnlineOrderingSettings['notificationRepeatMode']
  notificationVolume: number
}

interface OnlineOrderNotifierPlugin {
  configure(options: OnlineOrderNotifierConfigureOptions): Promise<{ enabled: boolean; notifications: string }>
  requestNotificationPermission(): Promise<{ notifications: string }>
  syncState(options: OnlineOrderNotifierSyncOptions): Promise<void>
  snooze(options: { orderIds: string[]; untilEpochMs: number }): Promise<void>
  markSeen(options: { orderIds: string[] }): Promise<void>
  setAppActive(options: { active: boolean }): Promise<void>
  clear(): Promise<void>
}

interface SyncOnlineOrderNotifierOptions {
  settings: OnlineOrderingSettings
  activeOrders: PosOrder[]
  acceptedOrderIds: string[]
  appActive: boolean
}

interface BackgroundNotifyOptions {
  signature: string
  orders: PosOrder[]
  settings: OnlineOrderingSettings
}

const OnlineOrderNotifier = registerPlugin<OnlineOrderNotifierPlugin>('OnlineOrderNotifier')
const nativePollIntervalMs = 20_000
let nativeConfigured = false
let requestedNativePermission = false
let webNotification: Notification | null = null
let lastWebNotificationSignature = ''

export const isNativeOnlineOrderNotifierAvailable = (): boolean => Capacitor.getPlatform() === 'android'

const toNotificationOrder = (order: PosOrder): OnlineOrderNotificationOrder => ({
  id: order.id,
  source: order.source,
  customerName: order.customerName || '線上顧客',
  subtotal: order.subtotal,
  createdAt: order.createdAt,
})

const syncNativeOnlineOrderNotifier = async ({
  settings,
  activeOrders,
  acceptedOrderIds,
  appActive,
}: SyncOnlineOrderNotifierOptions): Promise<void> => {
  if (!isNativeOnlineOrderNotifierAvailable()) {
    return
  }

  const connection = posApiConnection()
  if (!connection) {
    return
  }

  const baseOptions: OnlineOrderNotifierConfigureOptions = {
    apiBaseUrl: connection.apiBaseUrl,
    anonKey: connection.supabaseAnonKey,
    stationId: currentStationId(),
    stationLabel: currentStationLabel(),
    acceptanceRequired: settings.acceptanceRequired,
    reminderMinutes: Math.max(0, settings.unconfirmedReminderMinutes),
    soundEnabled: settings.soundEnabled,
    notificationRepeatMode: settings.notificationRepeatMode,
    notificationVolume: Math.min(Math.max(Math.trunc(settings.notificationVolume), 0), 100),
    pollIntervalMs: nativePollIntervalMs,
  }

  try {
    if (!nativeConfigured) {
      await OnlineOrderNotifier.configure(baseOptions)
      nativeConfigured = true
    }

    if (!requestedNativePermission) {
      requestedNativePermission = true
      void OnlineOrderNotifier.requestNotificationPermission().catch(() => undefined)
    }

    await OnlineOrderNotifier.syncState({
      activeOrders: activeOrders.map(toNotificationOrder),
      acceptedOrderIds,
      appActive,
      acceptanceRequired: baseOptions.acceptanceRequired,
      reminderMinutes: baseOptions.reminderMinutes,
      soundEnabled: baseOptions.soundEnabled,
      notificationRepeatMode: baseOptions.notificationRepeatMode,
      notificationVolume: baseOptions.notificationVolume,
    })
  } catch {
    nativeConfigured = false
  }
}

const canUseWebNotification = (): boolean =>
  typeof globalThis.Notification !== 'undefined' &&
  !isNativeOnlineOrderNotifierAvailable()

export const requestWebOnlineOrderNotificationPermission = async (): Promise<void> => {
  if (!canUseWebNotification() || globalThis.Notification.permission !== 'default') {
    return
  }

  try {
    await globalThis.Notification.requestPermission()
  } catch {
    // Browser fallback is best effort; foreground banner/audio still handles unsupported browsers.
  }
}

const showWebOnlineOrderNotification = ({ signature, orders, settings }: BackgroundNotifyOptions): boolean => {
  if (!canUseWebNotification() || !signature || globalThis.Notification.permission !== 'granted') {
    return false
  }

  if (signature === lastWebNotificationSignature) {
    return true
  }

  const title = `${orders.length} 張線上/掃碼新單待接單`
  const firstOrder = orders[0]
  const body = firstOrder
    ? `${firstOrder.id} · ${firstOrder.customerName || '線上顧客'} · $${firstOrder.subtotal}`
    : '返回 POS 查看待接單佇列'

  webNotification?.close()
  const notificationOptions: NotificationOptions & { renotify?: boolean } = {
    body,
    tag: 'script-coffee-pos-online-orders',
    renotify: settings.notificationRepeatMode === 'continuous',
    silent: !settings.soundEnabled || settings.notificationVolume <= 0,
  }
  webNotification = new globalThis.Notification(title, notificationOptions)
  lastWebNotificationSignature = signature
  const handleNotificationClick = (): void => {
    globalThis.focus?.()
    webNotification?.close()
    webNotification = null
  }
  webNotification.addEventListener('click', handleNotificationClick, { once: true })

  return true
}

export const syncOnlineOrderNotifier = (options: SyncOnlineOrderNotifierOptions): void => {
  void syncNativeOnlineOrderNotifier(options)

  if (options.appActive && options.activeOrders.length > 0) {
    void requestWebOnlineOrderNotificationPermission()
  }

  if (options.appActive) {
    webNotification?.close()
    webNotification = null
  }
}

export const notifyBackgroundOnlineOrders = (options: BackgroundNotifyOptions): boolean => {
  if (isNativeOnlineOrderNotifierAvailable()) {
    return true
  }

  return showWebOnlineOrderNotification(options)
}

export const snoozeOnlineOrderNotifier = (orderIds: string[], untilEpochMs: number): void => {
  if (orderIds.length === 0) {
    return
  }

  webNotification?.close()
  webNotification = null
  lastWebNotificationSignature = ''

  if (isNativeOnlineOrderNotifierAvailable()) {
    void OnlineOrderNotifier.snooze({ orderIds, untilEpochMs }).catch(() => undefined)
  }
}

export const markOnlineOrderNotifierSeen = (orderIds: string[]): void => {
  if (orderIds.length === 0) {
    return
  }

  if (isNativeOnlineOrderNotifierAvailable()) {
    void OnlineOrderNotifier.markSeen({ orderIds }).catch(() => undefined)
  }
}

export const setOnlineOrderNotifierAppActive = (active: boolean): void => {
  if (active) {
    webNotification?.close()
    webNotification = null
  }

  if (isNativeOnlineOrderNotifierAvailable()) {
    void OnlineOrderNotifier.setAppActive({ active }).catch(() => undefined)
  }
}

export const clearOnlineOrderNotifier = (): void => {
  webNotification?.close()
  webNotification = null
  lastWebNotificationSignature = ''

  if (isNativeOnlineOrderNotifierAvailable()) {
    void OnlineOrderNotifier.clear().catch(() => undefined)
  }
}
