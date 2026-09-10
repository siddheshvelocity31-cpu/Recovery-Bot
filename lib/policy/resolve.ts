// Pure function — no imports from supabase, no Date.now(), no fetch
import type { PolicyInput, ResolvedPolicy, CategoryPolicy, CadenceStep } from "./types"
import { NoCategoryError } from "./types"
export { NoCategoryError } from "./types"

export function resolvePolicy(input: PolicyInput): ResolvedPolicy {
  // 1. Resolve category: use client's assigned category, fall back to default
  const category = resolveCategory(input)  // throws NoCategoryError if none available

  // 2. Resolve weekly cap: min(client override, category cap, global ceiling)
  //    Narrower scopes can only make the system quieter, never louder
  const categoryWeeklyCap = category.cadence?.max_messages_per_week ?? input.globalConfig.max_messages_per_week
  const clientCap = input.clientOverrides.max_messages_per_week ?? categoryWeeklyCap
  const max_messages_per_week = Math.min(clientCap, categoryWeeklyCap, input.globalConfig.max_messages_per_week)
  // Build resolution trace for weekly cap
  const weeklyCapTrace = buildWeeklyCapTrace(clientCap, categoryWeeklyCap, input.globalConfig.max_messages_per_week, max_messages_per_week)

  // 3. Resolve persona (required — category must have one)
  const persona = category.persona
  if (!persona) throw new NoCategoryError()  // shouldn't happen with valid seed data

  // 4. Resolve thresholds (required)
  const thresholds = category.thresholds
  if (!thresholds) throw new NoCategoryError()

  // 5. Next step
  const nextStep = resolveNextStep(category.cadence?.steps ?? [], input.currentStepNumber)

  return {
    category,
    max_messages_per_week,
    persona,
    thresholds,
    nextStep,
    resolution_trace: [weeklyCapTrace],
  }
}

function resolveCategory(input: PolicyInput): CategoryPolicy {
  if (input.category !== null) return input.category
  if (input.defaultCategory !== null) return input.defaultCategory
  throw new NoCategoryError()
}

function resolveNextStep(steps: CadenceStep[], currentStepNumber: number): CadenceStep | null {
  // Steps are 1-based; return the step after currentStepNumber
  const nextStepNumber = currentStepNumber + 1
  return steps.find(s => s.step_number === nextStepNumber) ?? null
}

function buildWeeklyCapTrace(
  clientCap: number,
  categoryCap: number,
  globalCeiling: number,
  resolved: number,
): string {
  if (resolved === globalCeiling && globalCeiling < Math.min(clientCap, categoryCap)) {
    return `weekly_cap: global ceiling (${globalCeiling}) wins over category (${categoryCap}) and client (${clientCap})`
  }
  if (clientCap < categoryCap) {
    return `weekly_cap: client override (${clientCap}) wins over category (${categoryCap})`
  }
  return `weekly_cap: category (${categoryCap}) applies (no client override)`
}
