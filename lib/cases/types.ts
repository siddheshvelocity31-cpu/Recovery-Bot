export type CaseStatus =
  | 'open'
  | 'awaiting_reply'
  | 'promise_active'
  | 'escalated'
  | 'suppressed'
  | 'resolved'

export type CadenceStep = {
  step_number: number
  channel: 'whatsapp' | 'email' | 'voice' | 'human'
  offset_days_from_due: number
  template_key: string
  escalation_level: number
}

export type OpenItemSummary = {
  total_open_paise: bigint
  has_unaged_only: boolean       // true if the ONLY open items are is_unaged=true (B/F balance)
  earliest_due_date: string | null  // ISO date of the earliest non-null due_date among open items
}

export type CaseInput = {
  case_id: string
  current_status: CaseStatus
  current_step_number: number
  open_items: OpenItemSummary
  is_client_muted: boolean
  has_active_dispute: boolean
  has_pending_credit: boolean        // credit note awaiting allocation
  has_confirmed_commitment: boolean  // promise_active trigger
  commitment_due_at: Date | null     // for promise expiry check
  promise_grace_hours: number
  cadence_steps: CadenceStep[]
  now: Date  // injected clock — never call new Date() inside
}

export type Transition = {
  next_status: CaseStatus
  next_step_number: number
  next_action_at: Date | null   // null when no scheduled follow-up
  reason: string
}
