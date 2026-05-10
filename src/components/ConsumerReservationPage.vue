<script setup lang="ts">
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  Minus,
  Phone,
  Plus,
  TicketCheck,
} from 'lucide-vue-next'
import { computed, onMounted, reactive, ref } from 'vue'
import {
  createPublicReservation,
  defaultEngagementSettings,
  fetchRuntimeSettings,
  isPosApiConfigured,
} from '../lib/posApi'
import type {
  PosReservation,
  ReservationBusinessHour,
  ReservationWebsiteSettings,
} from '../types/pos'

const dayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
const brandLogoSrc = `${import.meta.env.BASE_URL}assets/script-coffee-logo.png`
const defaultReservationWebsite = defaultEngagementSettings().reservationWebsite

const reservationWebsite = ref<ReservationWebsiteSettings>(defaultReservationWebsite)
const isLoading = ref(true)
const isSubmitting = ref(false)
const formError = ref('')
const reservationMessage = ref('讀取訂位資訊中')
const lastReservation = ref<PosReservation | null>(null)
const reservationDraft = reactive({
  customerName: '',
  customerPhone: '',
  partySize: defaultReservationWebsite.minPartySize,
  reservedAt: '',
  note: '',
})

const toDatetimeLocal = (date: Date): string => {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16)
}

const earliestReservationTime = computed(() =>
  toDatetimeLocal(new Date(Date.now() + reservationWebsite.value.leadMinutes * 60_000)),
)

const latestReservationTime = computed(() =>
  toDatetimeLocal(new Date(Date.now() + reservationWebsite.value.bookingWindowDays * 24 * 60 * 60_000)),
)

const orderedBusinessHours = computed(() =>
  [...reservationWebsite.value.businessHours].sort((first, second) => first.day - second.day),
)

const activeBusinessHours = computed(() =>
  orderedBusinessHours.value.filter((period) => period.enabled),
)

const businessHoursSummary = computed(() => {
  if (activeBusinessHours.value.length === 0) {
    return '目前未設定開放時段'
  }

  return activeBusinessHours.value
    .map((period) => `${dayLabels[period.day]} ${period.start}-${period.end}`)
    .join(' · ')
})

const onlineStatusLabel = computed(() => reservationWebsite.value.enabled ? '開放訂位' : '暫停訂位')
const onlineStatusDetail = computed(() =>
  reservationWebsite.value.enabled
    ? `可預約 ${reservationWebsite.value.bookingWindowDays} 天內時段`
    : '門市尚未開放線上訂位',
)

const timeToMinutes = (value: string): number => {
  const [rawHours, rawMinutes] = value.split(':')
  return Number(rawHours) * 60 + Number(rawMinutes)
}

const matchingBusinessHour = (date: Date): ReservationBusinessHour | null => {
  const day = date.getDay()
  const minutes = date.getHours() * 60 + date.getMinutes()
  for (const period of reservationWebsite.value.businessHours) {
    if (!period.enabled || period.day !== day) {
      continue
    }

    const start = timeToMinutes(period.start)
    const end = timeToMinutes(period.end)
    const isWithinPeriod = start <= end
      ? minutes >= start && minutes <= end
      : minutes >= start || minutes <= end
    if (!isWithinPeriod) {
      continue
    }

    const slotMinutes = Math.max(reservationWebsite.value.slotMinutes, 1)
    const offset = start <= end || minutes >= start ? minutes - start : minutes + 24 * 60 - start
    if (offset % slotMinutes === 0) {
      return period
    }
  }

  return null
}

const selectedTimeMessage = computed(() => {
  if (!reservationDraft.reservedAt) {
    return `每 ${reservationWebsite.value.slotMinutes} 分鐘一格 · 用餐 ${reservationWebsite.value.durationMinutes} 分鐘 · 保留 ${reservationWebsite.value.seatHoldMinutes} 分鐘`
  }

  const reservedDate = new Date(reservationDraft.reservedAt)
  const period = Number.isNaN(reservedDate.getTime()) ? null : matchingBusinessHour(reservedDate)
  return period
    ? `${dayLabels[period.day]} ${period.start}-${period.end} 可預約`
    : '此時間不在開放訂位時段'
})

const canSubmit = computed(() =>
  reservationWebsite.value.enabled &&
  reservationDraft.customerName.trim().length > 0 &&
  reservationDraft.customerPhone.trim().length > 0 &&
  reservationDraft.partySize >= reservationWebsite.value.minPartySize &&
  reservationDraft.partySize <= reservationWebsite.value.maxPartySize &&
  reservationDraft.reservedAt.length > 0 &&
  !isSubmitting.value,
)

const loadReservationSettings = async (): Promise<void> => {
  isLoading.value = true
  formError.value = ''
  try {
    const runtime = await fetchRuntimeSettings()
    reservationWebsite.value = runtime.engagementSettings.reservationWebsite
    reservationDraft.partySize = Math.max(
      reservationWebsite.value.minPartySize,
      Math.min(reservationDraft.partySize, reservationWebsite.value.maxPartySize),
    )
    reservationMessage.value = reservationWebsite.value.announcement || '請選擇人數與訂位時間'
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '訂位資訊讀取失敗'
    reservationMessage.value = '無法取得最新訂位設定'
  } finally {
    isLoading.value = false
  }
}

const changePartySize = (delta: number): void => {
  const nextPartySize = reservationDraft.partySize + delta
  reservationDraft.partySize = Math.min(
    Math.max(nextPartySize, reservationWebsite.value.minPartySize),
    reservationWebsite.value.maxPartySize,
  )
}

const submitReservation = async (): Promise<void> => {
  if (!isPosApiConfigured) {
    formError.value = '尚未設定 POS API，無法送出線上訂位'
    return
  }

  if (!canSubmit.value) {
    formError.value = '請完整填寫姓名、電話、人數與訂位時間'
    return
  }

  const reservedDate = new Date(reservationDraft.reservedAt)
  if (Number.isNaN(reservedDate.getTime()) || !matchingBusinessHour(reservedDate)) {
    formError.value = '請選擇開放訂位時段'
    return
  }

  isSubmitting.value = true
  formError.value = ''
  try {
    lastReservation.value = await createPublicReservation({
      customerName: reservationDraft.customerName.trim(),
      customerPhone: reservationDraft.customerPhone.trim(),
      partySize: reservationDraft.partySize,
      reservedAt: reservedDate.toISOString(),
      note: reservationDraft.note.trim(),
    })
    reservationDraft.note = ''
    reservationMessage.value = '訂位已送出，門市可在 POS 後台查看'
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '線上訂位送出失敗'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  void loadReservationSettings()
})
</script>

<template>
  <section class="consumer-shell" aria-label="線上訂位">
    <section class="consumer-storefront">
      <div class="consumer-cover" aria-hidden="true">
        <img :src="brandLogoSrc" alt="" />
      </div>

      <div class="consumer-store-info">
        <div>
          <h2>{{ reservationWebsite.restaurantName }}</h2>
          <p class="consumer-status-line">
            <Clock3 :size="18" aria-hidden="true" />
            <strong>{{ onlineStatusLabel }}</strong>
            <span>{{ onlineStatusDetail }}</span>
          </p>
          <p class="consumer-status-line">
            <CalendarDays :size="18" aria-hidden="true" />
            <span>{{ reservationMessage }}</span>
          </p>
          <p v-if="reservationWebsite.phone || reservationWebsite.address" class="consumer-status-line">
            <Phone :size="18" aria-hidden="true" />
            <span>{{ reservationWebsite.phone || reservationWebsite.address }}</span>
          </p>
        </div>
        <button class="icon-button" type="button" title="餐廳資訊" @click="loadReservationSettings">
          <Info :size="20" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section class="consumer-menu-shell" aria-labelledby="consumer-reservation-title">
      <div class="consumer-menu-heading">
        <div>
          <h2 id="consumer-reservation-title">訂位資訊</h2>
          <span>{{ businessHoursSummary }}</span>
        </div>
        <span class="status-pill" :class="reservationWebsite.enabled ? 'status-pill--success' : 'status-pill--danger'">
          {{ isLoading ? '同步中' : onlineStatusLabel }}
        </span>
      </div>

      <div class="customer-grid consumer-customer-grid">
        <label>
          姓名
          <input v-model="reservationDraft.customerName" type="text" autocomplete="name" placeholder="訂位姓名" />
        </label>
        <label>
          電話
          <input v-model="reservationDraft.customerPhone" type="tel" autocomplete="tel" placeholder="聯絡電話" />
        </label>
        <label>
          人數
          <span class="quantity-stepper">
            <button type="button" title="減少" @click="changePartySize(-1)">
              <Minus :size="16" aria-hidden="true" />
            </button>
            <span>{{ reservationDraft.partySize }} 人</span>
            <button type="button" title="增加" @click="changePartySize(1)">
              <Plus :size="16" aria-hidden="true" />
            </button>
          </span>
        </label>
        <label>
          訂位時間
          <input
            v-model="reservationDraft.reservedAt"
            type="datetime-local"
            :min="earliestReservationTime"
            :max="latestReservationTime"
            :step="reservationWebsite.slotMinutes * 60"
          />
        </label>
        <label class="wide-field">
          備註
          <textarea v-model="reservationDraft.note" rows="3" placeholder="兒童椅、生日、座位偏好" />
        </label>
      </div>

      <p class="consumer-status-line">
        <CalendarDays :size="18" aria-hidden="true" />
        <span>{{ selectedTimeMessage }}</span>
      </p>
      <p v-if="formError" class="consumer-form-error">{{ formError }}</p>

      <button class="primary-button consumer-submit-button" type="button" :disabled="!canSubmit" @click="submitReservation">
        <TicketCheck v-if="!isSubmitting" :size="20" aria-hidden="true" />
        <Clock3 v-else :size="20" aria-hidden="true" />
        {{ isSubmitting ? '送出中' : (reservationWebsite.enabled ? '送出訂位' : '暫停訂位') }}
      </button>

      <article v-if="lastReservation" class="consumer-confirmation">
        <CheckCircle2 :size="22" aria-hidden="true" />
        <div>
          <strong>{{ lastReservation.customerName }} · {{ lastReservation.partySize }} 人</strong>
          <span>{{ new Date(lastReservation.reservedAt).toLocaleString('zh-TW') }} · {{ lastReservation.assignedTableIds.length > 0 ? `保留 ${lastReservation.assignedTableIds.join(' / ')}` : '門市可於訂位管理查看' }}</span>
        </div>
      </article>
    </section>
  </section>
</template>
