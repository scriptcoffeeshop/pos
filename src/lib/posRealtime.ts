import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

export type PosRealtimeTopic = 'orders' | 'runtime_settings' | 'register_sessions' | 'products'

export interface PosRealtimeEvent {
  id: string
  topic: PosRealtimeTopic
  eventName: 'INSERT' | 'UPDATE' | 'DELETE'
  sourceTable: string
  entityId: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface PosRealtimeStatus {
  status: string
  error?: string
}

interface PosRealtimeEventRow {
  id?: unknown
  topic?: unknown
  event_name?: unknown
  source_table?: unknown
  entity_id?: unknown
  payload?: unknown
  created_at?: unknown
}

interface PostgresInsertPayload {
  new: PosRealtimeEventRow
}

interface SubscribeOptions {
  topics: PosRealtimeTopic[]
  onEvent: (event: PosRealtimeEvent) => void
  onStatus?: (status: PosRealtimeStatus) => void
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isPosRealtimeConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let realtimeClient: ReturnType<typeof createClient> | null = null

const getRealtimeClient = (): ReturnType<typeof createClient> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('POS realtime is not configured')
  }

  realtimeClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return realtimeClient
}

const isTopic = (value: unknown): value is PosRealtimeTopic =>
  value === 'orders' ||
  value === 'runtime_settings' ||
  value === 'register_sessions' ||
  value === 'products'

const isEventName = (value: unknown): value is PosRealtimeEvent['eventName'] =>
  value === 'INSERT' || value === 'UPDATE' || value === 'DELETE'

const normalizeRealtimeEvent = (row: PosRealtimeEventRow): PosRealtimeEvent | null => {
  if (
    typeof row.id !== 'string' ||
    !isTopic(row.topic) ||
    !isEventName(row.event_name) ||
    typeof row.source_table !== 'string' ||
    typeof row.entity_id !== 'string' ||
    typeof row.created_at !== 'string'
  ) {
    return null
  }

  return {
    id: row.id,
    topic: row.topic,
    eventName: row.event_name,
    sourceTable: row.source_table,
    entityId: row.entity_id,
    payload: row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown>
      : {},
    createdAt: row.created_at,
  }
}

export const subscribeToPosRealtimeEvents = ({
  topics,
  onEvent,
  onStatus,
}: SubscribeOptions): (() => void) => {
  if (!isPosRealtimeConfigured) {
    onStatus?.({ status: 'DISABLED' })
    return () => {}
  }

  const allowedTopics = new Set(topics)
  const channelName = `pos-realtime-events-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const channel: RealtimeChannel = getRealtimeClient()
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'pos_realtime_events',
      },
      (payload: PostgresInsertPayload) => {
        const event = normalizeRealtimeEvent(payload.new)
        if (!event || !allowedTopics.has(event.topic)) {
          return
        }

        onEvent(event)
      },
    )

  void channel.subscribe((status, error) => {
    const errorMessage = error instanceof Error ? error.message : undefined
    onStatus?.(errorMessage ? { status, error: errorMessage } : { status })
  })

  return () => {
    void getRealtimeClient().removeChannel(channel)
  }
}
