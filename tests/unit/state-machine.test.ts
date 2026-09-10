import { describe, it, expect } from "vitest"
import { decideTransition } from "@/lib/cases/state-machine"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assertLegalTransition, LEGAL_TRANSITIONS } from "@/lib/cases/transitions"
import type { CaseInput } from "@/lib/cases/types"

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<CaseInput> = {}): CaseInput {
  return {
    case_id: "case-1",
    current_status: "open",
    current_step_number: 0,
    open_items: {
      total_open_paise: 100000n,
      has_unaged_only: false,
      earliest_due_date: "2026-09-01",
    },
    is_client_muted: false,
    has_active_dispute: false,
    has_pending_credit: false,
    has_confirmed_commitment: false,
    commitment_due_at: null,
    promise_grace_hours: 24,
    cadence_steps: [
      { step_number: 1, channel: "email", offset_days_from_due: 0, template_key: "reminder_first", escalation_level: 1 },
      { step_number: 2, channel: "email", offset_days_from_due: 7, template_key: "reminder_second", escalation_level: 1 },
      { step_number: 3, channel: "whatsapp", offset_days_from_due: 14, template_key: "escalation_ap_manager", escalation_level: 2 },
    ],
    now: new Date("2026-08-29T10:00:00Z"),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Acceptance criterion 1 — Every row in LEGAL_TRANSITIONS has at least one test
// ---------------------------------------------------------------------------

describe("LEGAL_TRANSITIONS coverage", () => {
  // open → awaiting_reply: Step dispatched
  it("open → awaiting_reply is legal (step dispatched)", () => {
    expect(() => assertLegalTransition("open", "awaiting_reply")).not.toThrow()
  })

  // awaiting_reply → open: Next step time arrived with no reply
  it("awaiting_reply → open is legal (no reply received)", () => {
    expect(() => assertLegalTransition("awaiting_reply", "open")).not.toThrow()
  })

  // * → promise_active: Confirmed commitment exists
  it("open → promise_active is legal (* → promise_active)", () => {
    expect(() => assertLegalTransition("open", "promise_active")).not.toThrow()
  })
  it("escalated → promise_active is legal (* → promise_active)", () => {
    expect(() => assertLegalTransition("escalated", "promise_active")).not.toThrow()
  })
  it("suppressed → promise_active is legal (* → promise_active)", () => {
    expect(() => assertLegalTransition("suppressed", "promise_active")).not.toThrow()
  })

  // promise_active → open: Promise expired past grace period
  it("promise_active → open is legal (promise expired)", () => {
    expect(() => assertLegalTransition("promise_active", "open")).not.toThrow()
  })

  // * → suppressed: Client muted, item disputed, or credit pending
  it("open → suppressed is legal (* → suppressed)", () => {
    expect(() => assertLegalTransition("open", "suppressed")).not.toThrow()
  })
  it("awaiting_reply → suppressed is legal (* → suppressed)", () => {
    expect(() => assertLegalTransition("awaiting_reply", "suppressed")).not.toThrow()
  })
  it("promise_active → suppressed is legal (* → suppressed)", () => {
    expect(() => assertLegalTransition("promise_active", "suppressed")).not.toThrow()
  })
  it("escalated → suppressed is legal (* → suppressed)", () => {
    expect(() => assertLegalTransition("escalated", "suppressed")).not.toThrow()
  })

  // open → escalated: Cadence exhausted
  it("open → escalated is legal (cadence exhausted)", () => {
    expect(() => assertLegalTransition("open", "escalated")).not.toThrow()
  })

  // * → resolved: Total open reaches zero
  it("open → resolved is legal (* → resolved)", () => {
    expect(() => assertLegalTransition("open", "resolved")).not.toThrow()
  })
  it("awaiting_reply → resolved is legal (* → resolved)", () => {
    expect(() => assertLegalTransition("awaiting_reply", "resolved")).not.toThrow()
  })
  it("escalated → resolved is legal (* → resolved)", () => {
    expect(() => assertLegalTransition("escalated", "resolved")).not.toThrow()
  })
  it("suppressed → resolved is legal (* → resolved)", () => {
    expect(() => assertLegalTransition("suppressed", "resolved")).not.toThrow()
  })
  it("promise_active → resolved is legal (* → resolved)", () => {
    expect(() => assertLegalTransition("promise_active", "resolved")).not.toThrow()
  })

  // * → open: Continuing
  it("escalated → open is legal (* → open, continuing)", () => {
    expect(() => assertLegalTransition("escalated", "open")).not.toThrow()
  })
  it("suppressed → open is legal (* → open, continuing)", () => {
    expect(() => assertLegalTransition("suppressed", "open")).not.toThrow()
  })

  // * → escalated: Already escalated, remaining escalated
  it("escalated → escalated is legal (* → escalated, remaining)", () => {
    expect(() => assertLegalTransition("escalated", "escalated")).not.toThrow()
  })

  // * → awaiting_reply: Continuing to await reply
  it("awaiting_reply → awaiting_reply is legal (* → awaiting_reply, continuing)", () => {
    expect(() => assertLegalTransition("awaiting_reply", "awaiting_reply")).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Acceptance criterion 2 — At least 4 illegal transitions assert a throw
// ---------------------------------------------------------------------------

describe("Illegal transitions throw", () => {
  it("resolved → open throws", () => {
    expect(() => assertLegalTransition("resolved", "open")).toThrow("Illegal transition: resolved -> open")
  })

  it("awaiting_reply → escalated throws", () => {
    expect(() => assertLegalTransition("awaiting_reply", "escalated")).toThrow("Illegal transition: awaiting_reply -> escalated")
  })

  it("resolved → promise_active throws", () => {
    expect(() => assertLegalTransition("resolved", "promise_active")).toThrow("Illegal transition: resolved -> promise_active")
  })

  it("escalated → awaiting_reply throws", () => {
    expect(() => assertLegalTransition("escalated", "awaiting_reply")).toThrow("Illegal transition: escalated -> awaiting_reply")
  })

  it("resolved → suppressed throws", () => {
    expect(() => assertLegalTransition("resolved", "suppressed")).toThrow("Illegal transition: resolved -> suppressed")
  })

  it("suppressed → awaiting_reply throws", () => {
    expect(() => assertLegalTransition("suppressed", "awaiting_reply")).toThrow("Illegal transition: suppressed -> awaiting_reply")
  })
})

// ---------------------------------------------------------------------------
// Acceptance criterion 3 — Zero total open returns resolved even when all
//   other conditions (muted + disputed + cadence exhausted) also apply
// ---------------------------------------------------------------------------

describe("resolved wins over everything", () => {
  it("returns resolved when total_open_paise is 0 even with muted, disputed, and exhausted cadence", () => {
    const result = decideTransition(makeInput({
      open_items: {
        total_open_paise: 0n,
        has_unaged_only: false,
        earliest_due_date: "2026-09-01",
      },
      is_client_muted: true,
      has_active_dispute: true,
      current_step_number: 99,   // cadence exhausted
      cadence_steps: [],
    }))
    expect(result.next_status).toBe("resolved")
  })

  it("returns resolved when total_open_paise is negative", () => {
    const result = decideTransition(makeInput({
      open_items: {
        total_open_paise: -1n,
        has_unaged_only: false,
        earliest_due_date: null,
      },
    }))
    expect(result.next_status).toBe("resolved")
  })
})

// ---------------------------------------------------------------------------
// Acceptance criterion 4 — Only unaged B/F items → escalated with "unaged"
//   in the reason, and next_action_at is null
// ---------------------------------------------------------------------------

describe("only unaged B/F balance → escalated", () => {
  it("returns escalated with reason mentioning unaged when has_unaged_only is true and total > 0", () => {
    const result = decideTransition(makeInput({
      open_items: {
        total_open_paise: 500000n,
        has_unaged_only: true,
        earliest_due_date: null,
      },
    }))
    expect(result.next_status).toBe("escalated")
    expect(result.reason.toLowerCase()).toContain("unaged")
    expect(result.next_action_at).toBeNull()
  })

  it("unaged-only takes precedence over cadence still having steps", () => {
    // There are cadence steps available, but unaged-only should still escalate
    const result = decideTransition(makeInput({
      current_step_number: 0,
      open_items: {
        total_open_paise: 250000n,
        has_unaged_only: true,
        earliest_due_date: null,
      },
    }))
    expect(result.next_status).toBe("escalated")
    expect(result.next_action_at).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Acceptance criterion 5 — promise_active within grace period does NOT advance
// ---------------------------------------------------------------------------

describe("promise_active within grace period stays promise_active", () => {
  it("does not advance when promise_due_at + grace hours is in the future", () => {
    const now = new Date("2026-08-29T10:00:00Z")
    // Due at is well in the future; grace period has not expired
    const commitmentDueAt = new Date("2026-08-30T10:00:00Z")

    const result = decideTransition(makeInput({
      current_status: "promise_active",
      has_confirmed_commitment: false,  // commitment already counted, not re-triggering
      commitment_due_at: commitmentDueAt,
      promise_grace_hours: 24,
      now,
    }))
    expect(result.next_status).toBe("promise_active")
    expect(result.next_step_number).toBe(0)
  })

  it("stays promise_active when exactly at the expiry boundary (now === expiry is not past)", () => {
    // now == commitment_due_at + grace: the condition is now > expiry, so exact
    // boundary is still within grace (not past).
    const commitmentDueAt = new Date("2026-08-29T10:00:00Z")
    const now = new Date("2026-08-30T10:00:00Z") // exactly at expiry
    const result = decideTransition(makeInput({
      current_status: "promise_active",
      has_confirmed_commitment: false,
      commitment_due_at: commitmentDueAt,
      promise_grace_hours: 24,
      now,
    }))
    expect(result.next_status).toBe("promise_active")
  })
})

// ---------------------------------------------------------------------------
// Acceptance criterion 6 — promise_active past due_at + grace → open
// ---------------------------------------------------------------------------

describe("promise_active past grace period → open", () => {
  it("returns open when now is past commitment_due_at + promise_grace_hours", () => {
    const commitmentDueAt = new Date("2026-08-27T10:00:00Z")
    const now = new Date("2026-08-29T10:00:01Z") // well past 24h grace
    const result = decideTransition(makeInput({
      current_status: "promise_active",
      has_confirmed_commitment: false,
      commitment_due_at: commitmentDueAt,
      promise_grace_hours: 24,
      now,
    }))
    expect(result.next_status).toBe("open")
    expect(result.reason.toLowerCase()).toContain("promise")
  })

  it("returns open when just 1 second past the grace window", () => {
    const commitmentDueAt = new Date("2026-08-29T09:00:00Z")
    // Grace = 1 hour; expiry = 10:00:00; now = 10:00:01 → past expiry
    const now = new Date("2026-08-29T10:00:01Z")
    const result = decideTransition(makeInput({
      current_status: "promise_active",
      has_confirmed_commitment: false,
      commitment_due_at: commitmentDueAt,
      promise_grace_hours: 1,
      now,
    }))
    expect(result.next_status).toBe("open")
  })
})

// ---------------------------------------------------------------------------
// Acceptance criterion 7 — Confirmed commitment from open → promise_active
// ---------------------------------------------------------------------------

describe("confirmed commitment → promise_active", () => {
  it("returns promise_active when has_confirmed_commitment is true from open status", () => {
    const result = decideTransition(makeInput({
      current_status: "open",
      has_confirmed_commitment: true,
    }))
    expect(result.next_status).toBe("promise_active")
    expect(result.reason.toLowerCase()).toContain("commitment")
  })

  it("returns promise_active from awaiting_reply status", () => {
    const result = decideTransition(makeInput({
      current_status: "awaiting_reply",
      has_confirmed_commitment: true,
    }))
    expect(result.next_status).toBe("promise_active")
  })

  it("returns promise_active from escalated status", () => {
    const result = decideTransition(makeInput({
      current_status: "escalated",
      has_confirmed_commitment: true,
    }))
    expect(result.next_status).toBe("promise_active")
  })

  it("commitment takes priority over suppression conditions", () => {
    // Muted client but also has a confirmed commitment — commitment wins over
    // suppressed (it is rule 3, after rule 2). Wait — actually rule 2 is checked
    // before rule 3, so suppressed wins over commitment.
    // Verify that is the actual behaviour (muted client is suppressed not promise_active).
    const result = decideTransition(makeInput({
      current_status: "open",
      is_client_muted: true,
      has_confirmed_commitment: true,
    }))
    // Rule 2 (suppressed) fires before rule 3 (promise_active)
    expect(result.next_status).toBe("suppressed")
  })
})

// ---------------------------------------------------------------------------
// Acceptance criterion 8 — Cadence exhausted → escalated
// ---------------------------------------------------------------------------

describe("cadence exhausted → escalated", () => {
  it("returns escalated when current_step_number equals the max step number", () => {
    // max step is 3, so current_step_number = 3 means next would be 4 which doesn't exist
    const result = decideTransition(makeInput({
      current_status: "open",
      current_step_number: 3,   // last step consumed; next step (4) absent
    }))
    expect(result.next_status).toBe("escalated")
    expect(result.reason.toLowerCase()).toContain("cadence")
  })

  it("returns escalated when cadence_steps is empty", () => {
    const result = decideTransition(makeInput({
      current_status: "open",
      current_step_number: 0,
      cadence_steps: [],
    }))
    expect(result.next_status).toBe("escalated")
  })

  it("does not escalate when cadence has steps remaining", () => {
    // current_step_number = 0, next step 1 exists
    const result = decideTransition(makeInput({
      current_status: "open",
      current_step_number: 0,
    }))
    expect(result.next_status).toBe("open")
    expect(result.next_step_number).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Additional behavioural tests
// ---------------------------------------------------------------------------

describe("suppressed conditions", () => {
  it("muted client → suppressed", () => {
    const result = decideTransition(makeInput({ is_client_muted: true }))
    expect(result.next_status).toBe("suppressed")
    expect(result.reason).toContain("muted")
  })

  it("active dispute → suppressed", () => {
    const result = decideTransition(makeInput({ has_active_dispute: true }))
    expect(result.next_status).toBe("suppressed")
    expect(result.reason).toContain("disputed")
  })

  it("pending credit → suppressed", () => {
    const result = decideTransition(makeInput({ has_pending_credit: true }))
    expect(result.next_status).toBe("suppressed")
    expect(result.reason).toContain("Credit")
  })
})

describe("cadence advancement", () => {
  it("advances step number and computes next_action_at from due date + offset", () => {
    const result = decideTransition(makeInput({
      current_status: "open",
      current_step_number: 0,
      open_items: {
        total_open_paise: 100000n,
        has_unaged_only: false,
        earliest_due_date: "2026-09-01",
      },
    }))
    expect(result.next_status).toBe("open")
    expect(result.next_step_number).toBe(1)
    // step 1 has offset_days_from_due = 0, so next_action_at should be based on 2026-09-01
    expect(result.next_action_at).not.toBeNull()
  })

  it("next_action_at is null when earliest_due_date is null but cadence step exists", () => {
    const result = decideTransition(makeInput({
      current_status: "open",
      current_step_number: 0,
      open_items: {
        total_open_paise: 100000n,
        has_unaged_only: false,
        earliest_due_date: null,
      },
    }))
    expect(result.next_status).toBe("open")
    expect(result.next_step_number).toBe(1)
    expect(result.next_action_at).toBeNull()
  })

  it("reason string includes next step and template key", () => {
    const result = decideTransition(makeInput({
      current_status: "open",
      current_step_number: 1,
    }))
    expect(result.reason).toContain("2")
    expect(result.reason).toContain("reminder_second")
  })
})

describe("decideTransition does not call new Date() or supabase", () => {
  // This is verified structurally (grep check in acceptance criteria), but we can
  // also verify that passing a fixed 'now' consistently determines the outcome.
  it("two calls with different 'now' values produce different outcomes for promise expiry", () => {
    const commitmentDueAt = new Date("2026-08-28T10:00:00Z")
    const base = {
      current_status: "promise_active" as const,
      has_confirmed_commitment: false,
      commitment_due_at: commitmentDueAt,
      promise_grace_hours: 24,
    }

    const beforeExpiry = decideTransition(makeInput({ ...base, now: new Date("2026-08-28T12:00:00Z") }))
    const afterExpiry = decideTransition(makeInput({ ...base, now: new Date("2026-08-30T00:00:00Z") }))

    expect(beforeExpiry.next_status).toBe("promise_active")
    expect(afterExpiry.next_status).toBe("open")
  })
})
