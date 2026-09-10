import { describe, it, expect } from "vitest"
import { checkRails } from "@/lib/policy/rails"
import type { RailsInput } from "@/lib/policy/rails"

// ---------------------------------------------------------------------------
// Factory — a fully-benign input that passes all 10 rules.
// Business time: 2026-08-29 12:30 IST (07:00 UTC), outside quiet hours 19:00-10:00.
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<RailsInput> = {}): RailsInput {
  return {
    now: new Date("2026-08-29T07:00:00Z"), // 12:30 IST — comfortably inside allowed hours
    is_kill_switch_on: false,
    is_client_muted: false,
    muted_until: null,
    is_suppressed: false,
    has_active_dispute: false,
    total_open_paise: 100_000n,           // ₹1,000 outstanding
    weekly_messages_sent: 0,
    max_messages_per_week: 7,
    quiet_hours_start: "19:00",
    quiet_hours_end: "10:00",
    channel: "email",
    contact_whatsapp_opt_in: true,
    contact_email_opt_in: true,
    contact_voice_opt_in: true,
    contact_phone_e164: "+919876543210",
    contact_email: "ap@client.example",
    requires_human_approval: false,
    has_human_approval: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// All 10 rules pass → allowed
// ---------------------------------------------------------------------------

describe("checkRails — all benign → allowed", () => {
  it("returns allowed=true when every rule is satisfied", () => {
    const result = checkRails(makeInput())
    expect(result.allowed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rule 1: kill_switch
// ---------------------------------------------------------------------------

describe("checkRails — Rule 1: kill_switch", () => {
  it("kill_switch=true blocks with rule='kill_switch'", () => {
    const result = checkRails(makeInput({ is_kill_switch_on: true }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("kill_switch")
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 2: mute
// ---------------------------------------------------------------------------

describe("checkRails — Rule 2: mute", () => {
  it("is_client_muted=true with muted_until in the future blocks with rule='mute'", () => {
    const result = checkRails(makeInput({
      is_client_muted: true,
      muted_until: new Date("2026-12-31T00:00:00Z"), // far future
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("mute")
    }
  })

  it("is_client_muted=true with muted_until=null (indefinite) blocks with rule='mute'", () => {
    const result = checkRails(makeInput({
      is_client_muted: true,
      muted_until: null,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("mute")
    }
  })

  it("is_client_muted=true but muted_until is in the past → NOT blocked by mute", () => {
    // muted_until is before now — mute has expired
    const result = checkRails(makeInput({
      is_client_muted: true,
      muted_until: new Date("2026-08-01T00:00:00Z"), // past
    }))
    // The mute rule should not fire; some other rule may or may not fire
    if (!result.allowed) {
      expect(result.rule).not.toBe("mute")
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 3: suppression
// ---------------------------------------------------------------------------

describe("checkRails — Rule 3: suppression", () => {
  it("is_suppressed=true blocks with rule='suppression'", () => {
    const result = checkRails(makeInput({ is_suppressed: true }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("suppression")
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 4: dispute
// ---------------------------------------------------------------------------

describe("checkRails — Rule 4: dispute", () => {
  it("has_active_dispute=true blocks with rule='dispute'", () => {
    const result = checkRails(makeInput({ has_active_dispute: true }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("dispute")
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 5: zero_balance
// ---------------------------------------------------------------------------

describe("checkRails — Rule 5: zero_balance", () => {
  it("total_open_paise=0n blocks with rule='zero_balance'", () => {
    const result = checkRails(makeInput({ total_open_paise: 0n }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("zero_balance")
    }
  })

  it("negative balance also blocks with rule='zero_balance'", () => {
    const result = checkRails(makeInput({ total_open_paise: -1n }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("zero_balance")
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 6: weekly_cap
// ---------------------------------------------------------------------------

describe("checkRails — Rule 6: weekly_cap", () => {
  it("weekly_messages_sent >= max_messages_per_week blocks with rule='weekly_cap'", () => {
    const result = checkRails(makeInput({
      weekly_messages_sent: 7,
      max_messages_per_week: 7,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("weekly_cap")
    }
  })

  it("weekly_messages_sent exceeding max also blocks", () => {
    const result = checkRails(makeInput({
      weekly_messages_sent: 10,
      max_messages_per_week: 7,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("weekly_cap")
    }
  })

  it("one below cap is allowed (rule does not fire)", () => {
    const result = checkRails(makeInput({
      weekly_messages_sent: 6,
      max_messages_per_week: 7,
    }))
    expect(result.allowed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rule 7: quiet_hours
// ---------------------------------------------------------------------------

describe("checkRails — Rule 7: quiet_hours", () => {
  // Quiet hours 19:00-10:00 IST (crosses midnight).
  // IST = UTC+5:30.

  it("23:00 IST (17:30 UTC) is within quiet hours → blocks with rule='quiet_hours'", () => {
    // 2026-08-29 17:30 UTC = 23:00 IST
    const result = checkRails(makeInput({ now: new Date("2026-08-29T17:30:00Z") }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("quiet_hours")
    }
  })

  it("02:00 IST next day (20:30 UTC) is within quiet hours → blocks with rule='quiet_hours'", () => {
    // 2026-08-29 20:30 UTC = 2026-08-30 02:00 IST (before 10:00 end boundary)
    const result = checkRails(makeInput({ now: new Date("2026-08-29T20:30:00Z") }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("quiet_hours")
    }
  })

  it("12:30 IST (07:00 UTC) is outside quiet hours → allowed", () => {
    // 2026-08-29 07:00 UTC = 12:30 IST — between 10:00 end and 19:00 start
    const result = checkRails(makeInput({ now: new Date("2026-08-29T07:00:00Z") }))
    expect(result.allowed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rule 8: opt_in
// ---------------------------------------------------------------------------

describe("checkRails — Rule 8: opt_in", () => {
  it("WhatsApp channel without opt-in blocks with rule='opt_in'", () => {
    const result = checkRails(makeInput({
      channel: "whatsapp",
      contact_whatsapp_opt_in: false,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("opt_in")
    }
  })

  it("email channel without opt-in blocks with rule='opt_in'", () => {
    const result = checkRails(makeInput({
      channel: "email",
      contact_email_opt_in: false,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("opt_in")
    }
  })

  it("voice channel without opt-in blocks with rule='opt_in'", () => {
    const result = checkRails(makeInput({
      channel: "voice",
      contact_voice_opt_in: false,
      contact_phone_e164: "+919876543210",
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("opt_in")
    }
  })

  it("voice channel with opt-in but no phone blocks with rule='opt_in'", () => {
    const result = checkRails(makeInput({
      channel: "voice",
      contact_voice_opt_in: true,
      contact_phone_e164: null,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("opt_in")
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 9: required_field
// ---------------------------------------------------------------------------

describe("checkRails — Rule 9: required_field", () => {
  it("WhatsApp channel with no phone blocks with rule='required_field'", () => {
    const result = checkRails(makeInput({
      channel: "whatsapp",
      contact_phone_e164: null,
      // opt-in is true so that rule 8 doesn't fire first
      contact_whatsapp_opt_in: true,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("required_field")
    }
  })

  it("email channel with no email address blocks with rule='required_field'", () => {
    const result = checkRails(makeInput({
      channel: "email",
      contact_email: null,
      contact_email_opt_in: true,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("required_field")
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 10: human_approval
// ---------------------------------------------------------------------------

describe("checkRails — Rule 10: human_approval", () => {
  it("requires_human_approval=true without approval blocks with rule='human_approval'", () => {
    const result = checkRails(makeInput({
      requires_human_approval: true,
      has_human_approval: false,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("human_approval")
    }
  })

  it("requires_human_approval=true WITH approval is allowed", () => {
    const result = checkRails(makeInput({
      requires_human_approval: true,
      has_human_approval: true,
    }))
    expect(result.allowed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Ordering: earlier rules shadow later ones
// ---------------------------------------------------------------------------

describe("checkRails — rule ordering", () => {
  it("mute fires before quiet_hours when both conditions are true", () => {
    // 23:00 IST → quiet_hours; also muted → mute should win (rule 2 < rule 7)
    const result = checkRails(makeInput({
      is_client_muted: true,
      muted_until: null,
      now: new Date("2026-08-29T17:30:00Z"), // 23:00 IST — inside quiet hours too
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("mute")
    }
  })

  it("kill_switch fires before all other rules", () => {
    const result = checkRails(makeInput({
      is_kill_switch_on: true,
      is_client_muted: true,
      has_active_dispute: true,
      total_open_paise: 0n,
    }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.rule).toBe("kill_switch")
    }
  })
})
