import type {
  CartLine,
  DiscountApplication,
  DiscountCampaign,
  DiscountSettings,
  MenuCategory,
  ServiceMode,
} from '../types/pos'

type DiscountChannel = 'pos' | 'online'

interface DiscountCalculationInput {
  lines: CartLine[]
  serviceMode: ServiceMode
  channel: DiscountChannel
  selectedCampaignIds?: string[]
  disabledCampaignIds?: string[]
  now?: Date
}

const allWeekdays = [1, 2, 3, 4, 5, 6, 0]
const allServiceModes: ServiceMode[] = ['dine-in', 'takeout', 'delivery']
const timePattern = /^\d{2}:\d{2}$/
const defaultSchedule = () => ({
  enabled: false,
  days: [...allWeekdays],
  start: '00:00',
  end: '23:59',
  allDay: true,
})

const sanitizeText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim().slice(0, 80) : fallback

const normalizeInteger = (value: unknown, fallback = 0): number => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback
}

const clampInteger = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.min(Math.max(normalizeInteger(value, fallback), min), max)

const normalizeDays = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [...allWeekdays]
  }

  const days = [...new Set(value.map((day) => normalizeInteger(day, -1)).filter((day) => day >= 0 && day <= 6))]
  return days.length > 0 ? days : [...allWeekdays]
}

export const defaultDiscountSettings = (): DiscountSettings => ({
  campaigns: [
    {
      id: 'manual-discount',
      name: '手動折扣',
      kind: 'manual',
      scope: 'whole-order',
      valueType: 'amount',
      discountValue: 0,
      minimumSubtotal: 0,
      enabled: true,
      sortOrder: 1,
      serviceModes: [...allServiceModes],
      categories: [],
      productIds: [],
      schedule: defaultSchedule(),
      usage: {
        posEnabled: true,
        posAutoApply: false,
        onlineEnabled: false,
        requiresVerification: true,
      },
    },
  ],
})

const normalizeCampaign = (entry: unknown, index: number): DiscountCampaign | null => {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const campaign = entry as Partial<DiscountCampaign>
  const id = sanitizeText(campaign.id, `discount-${index + 1}`).replace(/\s+/g, '-')
  const name = sanitizeText(campaign.name, index === 0 ? '手動折扣' : `優惠活動 ${index + 1}`)
  if (!id || !name) {
    return null
  }

  const scope = campaign.scope === 'categories' || campaign.scope === 'products' ? campaign.scope : 'whole-order'
  const valueType = campaign.valueType === 'percentage' ? 'percentage' : 'amount'
  const scheduleSource = campaign.schedule && typeof campaign.schedule === 'object' ? campaign.schedule : defaultSchedule()
  const usageSource = campaign.usage && typeof campaign.usage === 'object' ? campaign.usage : {}
  const normalizedServiceModes = Array.isArray(campaign.serviceModes)
    ? [...new Set(campaign.serviceModes.filter((mode): mode is ServiceMode =>
      mode === 'dine-in' || mode === 'takeout' || mode === 'delivery',
    ))]
    : [...allServiceModes]

  return {
    id,
    name,
    kind: campaign.kind === 'automatic' ? 'automatic' : 'manual',
    scope,
    valueType,
    discountValue: valueType === 'percentage'
      ? clampInteger(campaign.discountValue, 0, 0, 100)
      : clampInteger(campaign.discountValue, 0, 0, 999_999),
    minimumSubtotal: clampInteger(campaign.minimumSubtotal, 0, 0, 999_999),
    enabled: campaign.enabled !== false,
    sortOrder: clampInteger(campaign.sortOrder, index + 1, 1, 999),
    serviceModes: normalizedServiceModes.length > 0 ? normalizedServiceModes : [...allServiceModes],
    categories: Array.isArray(campaign.categories)
      ? [...new Set(campaign.categories.filter((category): category is MenuCategory => typeof category === 'string'))].slice(0, 40)
      : [],
    productIds: Array.isArray(campaign.productIds)
      ? [...new Set(campaign.productIds.filter((productId): productId is string => typeof productId === 'string'))].slice(0, 120)
      : [],
    schedule: {
      enabled: scheduleSource.enabled === true,
      days: normalizeDays(scheduleSource.days),
      start: typeof scheduleSource.start === 'string' && timePattern.test(scheduleSource.start)
        ? scheduleSource.start
        : '00:00',
      end: typeof scheduleSource.end === 'string' && timePattern.test(scheduleSource.end)
        ? scheduleSource.end
        : '23:59',
      allDay: scheduleSource.allDay !== false,
    },
    usage: {
      posEnabled: (usageSource as Partial<DiscountCampaign['usage']>).posEnabled !== false,
      posAutoApply: (usageSource as Partial<DiscountCampaign['usage']>).posAutoApply === true,
      onlineEnabled: (usageSource as Partial<DiscountCampaign['usage']>).onlineEnabled === true,
      requiresVerification: (usageSource as Partial<DiscountCampaign['usage']>).requiresVerification === true,
    },
  }
}

export const normalizeDiscountSettings = (value: unknown): DiscountSettings => {
  const defaults = defaultDiscountSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }

  const settings = value as Partial<DiscountSettings>
  if (!Array.isArray(settings.campaigns)) {
    return defaults
  }

  const seenIds = new Set<string>()
  const campaigns = settings.campaigns.flatMap((entry, index) => {
    const campaign = normalizeCampaign(entry, index)
    if (!campaign || seenIds.has(campaign.id)) {
      return []
    }
    seenIds.add(campaign.id)
    return [campaign]
  })

  return {
    campaigns: campaigns.length > 0
      ? campaigns.sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name, 'zh-TW'))
      : defaults.campaigns,
  }
}

const timeToMinutes = (value: string): number => {
  const [hour = '0', minute = '0'] = value.split(':')
  return Number(hour) * 60 + Number(minute)
}

const scheduleMatches = (campaign: DiscountCampaign, now: Date): boolean => {
  if (!campaign.schedule.enabled) {
    return true
  }

  const day = now.getDay()
  if (!campaign.schedule.days.includes(day)) {
    return false
  }

  if (campaign.schedule.allDay) {
    return true
  }

  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = timeToMinutes(campaign.schedule.start)
  const end = timeToMinutes(campaign.schedule.end)
  return start <= end
    ? minutes >= start && minutes <= end
    : minutes >= start || minutes <= end
}

const lineSubtotal = (line: CartLine): number => Math.max(0, Math.trunc(line.unitPrice || 0)) * Math.max(0, Math.trunc(line.quantity || 0))

const campaignBaseSubtotal = (campaign: DiscountCampaign, lines: CartLine[]): number => {
  if (campaign.scope === 'categories') {
    const categories = new Set(campaign.categories)
    return lines.reduce((total, line) => total + (line.category && categories.has(line.category) ? lineSubtotal(line) : 0), 0)
  }

  if (campaign.scope === 'products') {
    const productIds = new Set(campaign.productIds)
    return lines.reduce((total, line) => {
      const matchesProduct = Boolean(line.productId && productIds.has(line.productId)) || productIds.has(line.itemId)
      return total + (matchesProduct ? lineSubtotal(line) : 0)
    }, 0)
  }

  return lines.reduce((total, line) => total + lineSubtotal(line), 0)
}

const campaignSelected = (
  campaign: DiscountCampaign,
  channel: DiscountChannel,
  selectedCampaignIds: Set<string>,
  disabledCampaignIds: Set<string>,
): boolean => {
  if (disabledCampaignIds.has(campaign.id)) {
    return false
  }

  if (channel === 'online') {
    return campaign.kind === 'automatic' && campaign.usage.onlineEnabled
  }

  if (!campaign.usage.posEnabled) {
    return false
  }

  return (campaign.kind === 'automatic' && campaign.usage.posAutoApply) || selectedCampaignIds.has(campaign.id)
}

export const calculateDiscountApplications = (
  settings: DiscountSettings,
  input: DiscountCalculationInput,
): { applications: DiscountApplication[]; total: number } => {
  const normalizedSettings = normalizeDiscountSettings(settings)
  const selectedCampaignIds = new Set(input.selectedCampaignIds ?? [])
  const disabledCampaignIds = new Set(input.disabledCampaignIds ?? [])
  const originalSubtotal = input.lines.reduce((total, line) => total + lineSubtotal(line), 0)
  let remainingSubtotal = originalSubtotal
  const now = input.now ?? new Date()
  const applications: DiscountApplication[] = []

  for (const campaign of normalizedSettings.campaigns) {
    if (
      !campaign.enabled ||
      !campaign.serviceModes.includes(input.serviceMode) ||
      !campaignSelected(campaign, input.channel, selectedCampaignIds, disabledCampaignIds) ||
      !scheduleMatches(campaign, now)
    ) {
      continue
    }

    const baseSubtotal = campaignBaseSubtotal(campaign, input.lines)
    if (baseSubtotal < campaign.minimumSubtotal || baseSubtotal <= 0 || remainingSubtotal <= 0) {
      continue
    }

    const rawAmount = campaign.valueType === 'percentage'
      ? Math.round(baseSubtotal * campaign.discountValue / 100)
      : campaign.discountValue
    const amount = Math.min(Math.max(0, rawAmount), remainingSubtotal)
    if (amount <= 0) {
      continue
    }

    remainingSubtotal = Math.max(0, remainingSubtotal - amount)
    applications.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      amount,
      kind: campaign.kind,
      valueType: campaign.valueType,
    })
  }

  return {
    applications,
    total: applications.reduce((total, application) => total + application.amount, 0),
  }
}
