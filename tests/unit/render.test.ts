import { describe, it, expect } from "vitest"
import { renderMessage } from "@/lib/outreach/render"
import { formatPaise } from "@/lib/money"
import type { RenderInput, RenderContext } from "@/lib/outreach/render"

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    contact_name: "Priya Sharma",
    client_name: "Acme Corp",
    total_open: "₹1,000.00",
    oldest_due_date: "01 Sep 2026",
    invoice_count: "5",
    statement_period: "Apr 2026 – Aug 2026",
    ...overrides,
  }
}

function makeInput(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    template_key: "reminder_1",
    channel: "whatsapp",
    context: makeContext(),
    persona_tone: "neutral",
    salutation: "Dear Priya,",
    signature: "Regards, VSAR Technologies",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Happy path — all placeholders resolved
// ---------------------------------------------------------------------------

describe("renderMessage — happy path", () => {
  it("returns a body with no remaining {…} placeholders when all are supplied", () => {
    const result = renderMessage(makeInput())
    // Match any {word} pattern that wasn't resolved
    expect(/\{[^}]+\}/.test(result.body)).toBe(false)
  })

  it("body includes the salutation", () => {
    const result = renderMessage(makeInput({ salutation: "Dear Priya," }))
    expect(result.body).toContain("Dear Priya,")
  })

  it("body includes the signature", () => {
    const result = renderMessage(makeInput({ signature: "Best, VSAR" }))
    expect(result.body).toContain("Best, VSAR")
  })

  it("resolved body contains the contact_name", () => {
    const result = renderMessage(makeInput({
      context: makeContext({ contact_name: "Ravi Kumar" }),
    }))
    expect(result.body).toContain("Ravi Kumar")
  })

  it("subject is null for whatsapp channel", () => {
    const result = renderMessage(makeInput({ channel: "whatsapp" }))
    expect(result.subject).toBeNull()
  })

  it("subject is a non-null string for email channel", () => {
    const result = renderMessage(makeInput({ channel: "email" }))
    expect(result.subject).not.toBeNull()
    expect(typeof result.subject).toBe("string")
  })

  it("email subject contains the client_name", () => {
    const result = renderMessage(makeInput({
      channel: "email",
      context: makeContext({ client_name: "Globex Industries" }),
    }))
    expect(result.subject).toContain("Globex Industries")
  })
})

// ---------------------------------------------------------------------------
// Unresolved placeholder → throws
// ---------------------------------------------------------------------------

describe("renderMessage — unresolved placeholder throws", () => {
  it("throws when the template body contains a placeholder not in context", () => {
    // Inject a rogue placeholder into the context by using a template that already
    // uses {contact_name} but supplying a context whose contact_name is not
    // the placeholder pattern — instead, mangle the key lookup.
    // The easiest way: supply a context object that is missing a key the template uses.
    // We cast to bypass TS to simulate a missing field.
    const badContext = {
      client_name: "Acme Corp",
      // contact_name deliberately omitted
      total_open: "₹1,000.00",
      oldest_due_date: "01 Sep 2026",
      invoice_count: "5",
      statement_period: "Apr 2026 – Aug 2026",
    } as RenderContext

    expect(() =>
      renderMessage(makeInput({ context: badContext })),
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// {total_open} paise formatting
// ---------------------------------------------------------------------------

describe("renderMessage — {total_open} paise formatting", () => {
  it("669766100n paise formats as ₹66,97,661.00 via formatPaise", () => {
    const paise = 669_766_100n
    const formatted = formatPaise(paise)
    expect(formatted).toBe("₹66,97,661.00")
  })

  it("body contains the formatted rupee amount when passed as total_open context", () => {
    const paise = 669_766_100n
    const formattedAmount = formatPaise(paise)

    const result = renderMessage(makeInput({
      context: makeContext({ total_open: formattedAmount }),
    }))
    expect(result.body).toContain(formattedAmount)
  })

  it("no remaining placeholder after resolving {total_open} with formatted paise", () => {
    const result = renderMessage(makeInput({
      context: makeContext({ total_open: formatPaise(669_766_100n) }),
    }))
    expect(/\{[^}]+\}/.test(result.body)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Unknown template_key → throws
// ---------------------------------------------------------------------------

describe("renderMessage — unknown template_key", () => {
  it("throws an error when given a template_key that does not exist", () => {
    expect(() =>
      renderMessage(makeInput({ template_key: "this_template_does_not_exist" })),
    ).toThrow("Unknown template")
  })
})

// ---------------------------------------------------------------------------
// WhatsApp: tone (persona) does not change the raw template body
// ---------------------------------------------------------------------------

describe("renderMessage — WhatsApp body is tone-agnostic", () => {
  it("courteous and firm persona produce identical WhatsApp body (same salutation+signature)", () => {
    const sharedSalutation = "Dear Contact,"
    const sharedSignature = "Regards"

    const courteous = renderMessage(makeInput({
      channel: "whatsapp",
      persona_tone: "courteous",
      salutation: sharedSalutation,
      signature: sharedSignature,
    }))

    const firm = renderMessage(makeInput({
      channel: "whatsapp",
      persona_tone: "firm",
      salutation: sharedSalutation,
      signature: sharedSignature,
    }))

    expect(courteous.body).toBe(firm.body)
  })
})

// ---------------------------------------------------------------------------
// Email: different salutation/signature between tones produces different body
// ---------------------------------------------------------------------------

describe("renderMessage — email body varies when salutation or signature differs by tone", () => {
  it("courteous and firm email bodies differ when salutation differs", () => {
    const courteous = renderMessage(makeInput({
      channel: "email",
      persona_tone: "courteous",
      salutation: "Dear Priya, I hope this message finds you well.",
      signature: "Warm regards, VSAR",
    }))

    const firm = renderMessage(makeInput({
      channel: "email",
      persona_tone: "firm",
      salutation: "Dear Priya,",
      signature: "VSAR Technologies",
    }))

    expect(courteous.body).not.toBe(firm.body)
  })
})

// ---------------------------------------------------------------------------
// Voice channel
// ---------------------------------------------------------------------------

describe("renderMessage — voice channel", () => {
  it("returns a non-null body and null subject for voice channel", () => {
    const result = renderMessage(makeInput({ channel: "voice" }))
    expect(result.body).toBeTruthy()
    expect(result.subject).toBeNull()
  })

  it("voice body contains no unresolved placeholders", () => {
    const result = renderMessage(makeInput({ channel: "voice" }))
    expect(/\{[^}]+\}/.test(result.body)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// All TEMPLATES keys work without throwing
// ---------------------------------------------------------------------------

describe("renderMessage — all built-in template keys render cleanly", () => {
  const keys = ["reminder_1", "reminder_2", "escalation_1", "final_notice"]

  for (const key of keys) {
    it(`template_key="${key}" renders without error on all channels`, () => {
      for (const channel of ["whatsapp", "email", "voice"] as const) {
        expect(() =>
          renderMessage(makeInput({ template_key: key, channel })),
        ).not.toThrow()
      }
    })
  }
})
