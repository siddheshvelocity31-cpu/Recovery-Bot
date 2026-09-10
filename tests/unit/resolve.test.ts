import { describe, it, expect } from "vitest"
import { resolvePolicy, NoCategoryError } from "../../lib/policy/resolve"
import type { PolicyInput, CategoryPolicy } from "../../lib/policy/types"

function makeCategory(overrides?: Partial<CategoryPolicy>): CategoryPolicy {
  return {
    id: "cat-1",
    code: "standard",
    display_name: "Standard",
    relationship_tier: "standard",
    behaviour_band: "unknown",
    is_default: true,
    cadence: {
      max_messages_per_week: 3,
      steps: [
        { step_number: 1, channel: "email", offset_days_from_due: 0, template_key: "reminder_first", escalation_level: 1 },
        { step_number: 2, channel: "email", offset_days_from_due: 7, template_key: "reminder_second", escalation_level: 1 },
        { step_number: 3, channel: "whatsapp", offset_days_from_due: 14, template_key: "escalation_ap_manager", escalation_level: 2 },
      ],
    },
    persona: { tone: "neutral", salutation: "Dear {name},", language: "en", signature: "Regards", voice_script_style: null, requires_human_approval: false },
    thresholds: { amber_days: 30, red_days: 60, amber_amount_paise: null, red_amount_paise: null, quiet_hours_start: "19:00", quiet_hours_end: "10:00", promise_grace_hours: 24, silence_attempts: 3 },
    ...overrides,
  }
}

function makeInput(overrides?: Partial<PolicyInput>): PolicyInput {
  return {
    client_id: "client-1",
    category: makeCategory(),
    defaultCategory: null,
    currentStepNumber: 0,
    clientOverrides: {},
    globalConfig: { max_messages_per_week: 7 },
    ...overrides,
  }
}

describe("resolvePolicy", () => {
  it("no category falls back to default", () => {
    const defaultCat = makeCategory({ id: "cat-default", code: "default", is_default: true })
    const input = makeInput({ category: null, defaultCategory: defaultCat })
    const result = resolvePolicy(input)
    expect(result.category.id).toBe("cat-default")
  })

  it("missing default throws NoCategoryError", () => {
    const input = makeInput({ category: null, defaultCategory: null })
    expect(() => resolvePolicy(input)).toThrow(NoCategoryError)
  })

  it("client cap of 1 beats category cap of 3", () => {
    const input = makeInput({ clientOverrides: { max_messages_per_week: 1 } })
    const result = resolvePolicy(input)
    expect(result.max_messages_per_week).toBe(1)
  })

  it("client cap of 5 does NOT beat global ceiling of 3", () => {
    const input = makeInput({
      clientOverrides: { max_messages_per_week: 5 },
      globalConfig: { max_messages_per_week: 3 },
    })
    const result = resolvePolicy(input)
    expect(result.max_messages_per_week).toBe(3)
  })

  it("currentStepNumber at last step returns null", () => {
    const input = makeInput({ currentStepNumber: 3 })
    const result = resolvePolicy(input)
    expect(result.nextStep).toBeNull()
  })

  it("resolution_trace names the scope that supplied weekly cap when client override wins", () => {
    const input = makeInput({ clientOverrides: { max_messages_per_week: 1 } })
    const result = resolvePolicy(input)
    expect(result.resolution_trace[0]).toContain("client")
  })

  it("currentStepNumber=0 returns step 1", () => {
    const input = makeInput({ currentStepNumber: 0 })
    const result = resolvePolicy(input)
    expect(result.nextStep?.step_number).toBe(1)
  })
})
