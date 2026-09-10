import { addDays, addHours } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import type { CaseInput, Transition, CaseStatus } from "./types"
import { assertLegalTransition } from "./transitions"

const BUSINESS_TZ = "Asia/Kolkata"

export function decideTransition(input: CaseInput): Transition {
  // Rule 1: resolved wins over everything — check first
  if (input.open_items.total_open_paise <= 0n) {
    return make(input.current_status, 'resolved', input.current_step_number, null, "Total open balance is zero")
  }

  // Rule 2: muted, disputed, or credit pending → suppressed
  if (input.is_client_muted || input.has_active_dispute || input.has_pending_credit) {
    return make(input.current_status, 'suppressed', input.current_step_number, null,
      input.is_client_muted ? "Client is muted"
      : input.has_active_dispute ? "Open item is disputed"
      : "Credit note pending allocation")
  }

  // Rule 3: confirmed commitment → promise_active
  if (input.has_confirmed_commitment) {
    return make(input.current_status, 'promise_active', input.current_step_number, null, "Confirmed commitment exists")
  }

  // Rule 4: promise expired
  if (input.current_status === 'promise_active' && input.commitment_due_at !== null) {
    const expiry = addHours(input.commitment_due_at, input.promise_grace_hours)
    if (input.now > expiry) {
      return make('promise_active', 'open', input.current_step_number, null, "Promise expired past grace period")
    }
    return make('promise_active', 'promise_active', input.current_step_number, null, "Promise still within grace period")
  }

  // Rule 5: only unaged items → escalated (can't schedule against B/F)
  if (input.open_items.has_unaged_only) {
    return make(input.current_status, 'escalated', input.current_step_number, null,
      "Only open item is the brought-forward unaged balance — no due date to schedule against")
  }

  // Rule 6: cadence exhausted → escalated
  const nextStepNumber = input.current_step_number + 1
  const nextStep = input.cadence_steps.find(s => s.step_number === nextStepNumber)
  if (!nextStep) {
    return make(input.current_status, 'escalated', input.current_step_number, null, "Cadence exhausted")
  }

  // Rule 7: compute next_action_at from earliest due_date + offset
  const dueDate = input.open_items.earliest_due_date
  let nextActionAt: Date | null = null
  if (dueDate) {
    const base = new Date(dueDate + "T00:00:00")
    // Add offset_days_from_due calendar days in IST
    const baseInTZ = toZonedTime(base, BUSINESS_TZ)
    nextActionAt = addDays(baseInTZ, nextStep.offset_days_from_due)
  }

  return make(input.current_status, 'open', nextStepNumber, nextActionAt,
    `Advancing to step ${nextStepNumber}: ${nextStep.template_key}`)
}

function make(
  from: CaseStatus,
  to: CaseStatus,
  stepNumber: number,
  nextActionAt: Date | null,
  reason: string,
): Transition {
  assertLegalTransition(from, to)
  return { next_status: to, next_step_number: stepNumber, next_action_at: nextActionAt, reason }
}
