// All types needed by the resolver — define these as plain TS, no DB dependency

export type CadenceStep = {
  step_number: number
  channel: 'whatsapp' | 'email' | 'voice' | 'human'
  offset_days_from_due: number
  template_key: string
  escalation_level: number
}

export type PersonaConfig = {
  tone: 'courteous' | 'neutral' | 'firm'
  salutation: string
  language: string
  signature: string
  voice_script_style: string | null
  requires_human_approval: boolean
}

export type ThresholdConfig = {
  amber_days: number
  red_days: number
  amber_amount_paise: bigint | null
  red_amount_paise: bigint | null
  quiet_hours_start: string  // "HH:MM"
  quiet_hours_end: string    // "HH:MM"
  promise_grace_hours: number
  silence_attempts: number
}

export type CategoryPolicy = {
  id: string
  code: string
  display_name: string
  relationship_tier: 'strategic' | 'standard' | 'watchlist' | 'new'
  behaviour_band: 'prompt' | 'slipping' | 'chronic' | 'unknown'
  is_default: boolean
  cadence: {
    max_messages_per_week: number
    steps: CadenceStep[]
  } | null
  persona: PersonaConfig | null
  thresholds: ThresholdConfig | null
}

export type ClientOverrides = {
  max_messages_per_week?: number  // client-level override, cannot exceed global ceiling
}

export type GlobalConfig = {
  max_messages_per_week: number   // hard ceiling that no scope can exceed
}

export type PolicyInput = {
  client_id: string
  category: CategoryPolicy | null         // null if client.category_id is null
  defaultCategory: CategoryPolicy | null  // null if no is_default=true category
  currentStepNumber: number               // 0 = no step taken yet
  clientOverrides: ClientOverrides
  globalConfig: GlobalConfig
}

export type ResolvedPolicy = {
  category: CategoryPolicy
  max_messages_per_week: number
  persona: PersonaConfig
  thresholds: ThresholdConfig
  nextStep: CadenceStep | null   // null when cadence exhausted
  resolution_trace: string[]     // e.g. ["weekly_cap: client(1) vs category(2) -> client wins (min)"]
}

export class NoCategoryError extends Error {
  constructor() {
    super("No category assigned and no default category configured — cannot resolve policy")
    this.name = "NoCategoryError"
  }
}
