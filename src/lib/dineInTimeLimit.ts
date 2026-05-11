import type {
  OnlineDineInTimeLimitRule,
  OnlineDineInTimeLimitSettings,
} from '../types/pos'

const clampMinutes = (value: unknown, fallback: number, max = 720): number => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  return Math.min(Math.max(Math.trunc(numberValue), 0), max)
}

const normalizeDays = (value: unknown, fallback: number[] = []): number[] => {
  if (!Array.isArray(value)) {
    return [...fallback]
  }

  return [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
}

export const defaultDineInTimeLimitSettings = (): OnlineDineInTimeLimitSettings => ({
  enabled: false,
  mealMinutes: 120,
  lastOrderBeforeEndMinutes: 0,
  holidayRules: [],
})

export const defaultDineInTimeLimitHolidayRule = (index = 1): OnlineDineInTimeLimitRule => ({
  id: `holiday-${index}`,
  label: '假日規則',
  days: [0, 6],
  mealMinutes: 120,
  lastOrderBeforeEndMinutes: 30,
})

export const normalizeDineInTimeLimitSettings = (
  value: unknown,
  defaults = defaultDineInTimeLimitSettings(),
): OnlineDineInTimeLimitSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ...defaults,
      holidayRules: defaults.holidayRules.map((rule) => ({ ...rule, days: [...rule.days] })),
    }
  }

  const settings = value as Partial<OnlineDineInTimeLimitSettings>
  const holidayRules = Array.isArray(settings.holidayRules)
    ? settings.holidayRules.flatMap((entry, index): OnlineDineInTimeLimitRule[] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return []
      }

      const rule = entry as Partial<OnlineDineInTimeLimitRule>
      return [{
        id: typeof rule.id === 'string' && rule.id.trim() ? rule.id.trim().slice(0, 60) : `holiday-${index + 1}`,
        label: typeof rule.label === 'string' && rule.label.trim() ? rule.label.trim().slice(0, 40) : `假日規則 ${index + 1}`,
        days: normalizeDays(rule.days, [0, 6]),
        mealMinutes: clampMinutes(rule.mealMinutes, defaults.mealMinutes),
        lastOrderBeforeEndMinutes: clampMinutes(rule.lastOrderBeforeEndMinutes, defaults.lastOrderBeforeEndMinutes),
      }]
    }).slice(0, 12)
    : defaults.holidayRules.map((rule) => ({ ...rule, days: [...rule.days] }))

  return {
    enabled: settings.enabled === true,
    mealMinutes: clampMinutes(settings.mealMinutes, defaults.mealMinutes),
    lastOrderBeforeEndMinutes: clampMinutes(
      settings.lastOrderBeforeEndMinutes,
      defaults.lastOrderBeforeEndMinutes,
    ),
    holidayRules,
  }
}

export const activeDineInTimeLimitRule = (
  settings: OnlineDineInTimeLimitSettings,
  startedAt: Date,
): Pick<OnlineDineInTimeLimitRule, 'label' | 'mealMinutes' | 'lastOrderBeforeEndMinutes'> => {
  const day = startedAt.getDay()
  const holidayRule = settings.holidayRules.find((rule) => rule.days.includes(day))
  if (holidayRule) {
    return holidayRule
  }

  return {
    label: '預設規則',
    mealMinutes: settings.mealMinutes,
    lastOrderBeforeEndMinutes: settings.lastOrderBeforeEndMinutes,
  }
}

export interface DineInTimeLimitWindow {
  enabled: boolean
  ruleLabel: string
  startedAt: Date
  mealMinutes: number
  lastOrderBeforeEndMinutes: number
  mealEndsAt: Date | null
  lastOrderAt: Date | null
  isMealOver: boolean
  isLastOrderOver: boolean
}

export const calculateDineInTimeLimitWindow = (
  settings: OnlineDineInTimeLimitSettings,
  startedAtIso: string | null | undefined,
  nowMs = Date.now(),
): DineInTimeLimitWindow | null => {
  if (!settings.enabled || !startedAtIso) {
    return null
  }

  const startedAt = new Date(startedAtIso)
  if (!Number.isFinite(startedAt.getTime())) {
    return null
  }

  const rule = activeDineInTimeLimitRule(settings, startedAt)
  if (rule.mealMinutes <= 0) {
    return {
      enabled: true,
      ruleLabel: rule.label,
      startedAt,
      mealMinutes: 0,
      lastOrderBeforeEndMinutes: 0,
      mealEndsAt: null,
      lastOrderAt: null,
      isMealOver: false,
      isLastOrderOver: false,
    }
  }

  const mealEndsAt = new Date(startedAt.getTime() + rule.mealMinutes * 60_000)
  const lastOrderAt = new Date(
    mealEndsAt.getTime() - Math.min(rule.lastOrderBeforeEndMinutes, rule.mealMinutes) * 60_000,
  )

  return {
    enabled: true,
    ruleLabel: rule.label,
    startedAt,
    mealMinutes: rule.mealMinutes,
    lastOrderBeforeEndMinutes: rule.lastOrderBeforeEndMinutes,
    mealEndsAt,
    lastOrderAt,
    isMealOver: nowMs >= mealEndsAt.getTime(),
    isLastOrderOver: nowMs >= lastOrderAt.getTime(),
  }
}
