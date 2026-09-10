import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { writeEvent } from "@/lib/events/write"
import { resolvePolicy } from "@/lib/policy/resolve"
import { decideTransition } from "@/lib/cases/state-machine"
import type { CaseInput, OpenItemSummary, CadenceStep } from "@/lib/cases/types"
import type { PolicyInput, CategoryPolicy } from "@/lib/policy/types"

/**
 * Evaluate the recovery case for a given client and advance its state machine.
 *
 * This is the central orchestration point: it fetches all required data,
 * calls decideTransition(), persists the new state, and optionally schedules
 * the next outreach row.
 */
export async function evaluateCase(clientId: string, now: Date): Promise<void> {
  const admin = getAdminClient()

  // ── 1. Fetch client with category ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clientRow, error: clientError } = await (admin as any)
    .from("client")
    .select(`
      id,
      is_muted,
      muted_until,
      category_id,
      category:category(
        id,
        code,
        display_name,
        relationship_tier,
        behaviour_band,
        is_default,
        cadence_policy:cadence_policy(
          max_messages_per_week,
          cadence_step:cadence_step(
            step_number,
            channel,
            offset_days_from_due,
            template_key,
            escalation_level
          )
        ),
        persona:persona(
          tone,
          salutation,
          language,
          signature,
          voice_script_style,
          requires_human_approval
        ),
        threshold_set:threshold_set(
          amber_days,
          red_days,
          amber_amount_paise,
          red_amount_paise,
          quiet_hours_start,
          quiet_hours_end,
          promise_grace_hours,
          silence_attempts
        )
      )
    `)
    .eq("id", clientId)
    .single()

  if (clientError) throw clientError
  if (!clientRow) throw new Error(`Client not found: ${clientId}`)

  // ── 2. Fetch open items for this client ───────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: openItemRows, error: openItemsError } = await (admin as any)
    .from("open_item")
    .select("id, open_amount_paise, is_unaged, due_date, status")
    .eq("client_id", clientId)
    .in("status", ["open", "part_paid", "disputed"])

  if (openItemsError) throw openItemsError

  const items: Array<{
    id: string
    open_amount_paise: number | null
    is_unaged: boolean
    due_date: string | null
    status: string
  }> = openItemRows ?? []

  // ── 3. Compute OpenItemSummary ────────────────────────────────────────────
  let total_open_paise = 0n
  for (const item of items) {
    total_open_paise += BigInt(item.open_amount_paise ?? 0)
  }

  const has_unaged_only =
    items.length > 0 && items.every((i) => i.is_unaged === true)

  const dueDates = items
    .map((i) => i.due_date)
    .filter((d): d is string => d !== null)
    .sort()

  const earliest_due_date: string | null =
    dueDates.length > 0 ? dueDates[0]! : null

  const openItemSummary: OpenItemSummary = {
    total_open_paise,
    has_unaged_only,
    earliest_due_date,
  }

  // ── 4. Find or create a non-resolved recovery_case ────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingCase, error: caseSelectError } = await (admin as any)
    .from("recovery_case")
    .select("id, status, current_step_number")
    .eq("client_id", clientId)
    .not("status", "eq", "resolved")
    .maybeSingle()

  if (caseSelectError) throw caseSelectError

  let caseId: string
  let currentStatus: string
  let currentStepNumber: number

  if (existingCase) {
    caseId = existingCase.id as string
    currentStatus = existingCase.status as string
    currentStepNumber = existingCase.current_step_number as number
  } else {
    // Create a new case
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newCase, error: insertCaseError } = await (admin as any)
      .from("recovery_case")
      .insert({
        client_id: clientId,
        status: "open",
        current_step_number: 0,
        total_open_paise: Number(total_open_paise),
      })
      .select("id, status, current_step_number")
      .single()

    if (insertCaseError) throw insertCaseError
    if (!newCase) throw new Error("Failed to create recovery_case")

    caseId = newCase.id as string
    currentStatus = newCase.status as string
    currentStepNumber = newCase.current_step_number as number

    await writeEvent({
      clientId,
      caseId,
      actorType: "system",
      type: "case.opened",
      payload: { reason: "New case created during evaluation" },
    })
  }

  // ── 5. Fetch resolved policy ──────────────────────────────────────────────
  // Build CategoryPolicy from the joined category row, if present.
  const rawCategory = clientRow.category ?? null

  function buildCategoryPolicy(raw: Record<string, unknown> | null): CategoryPolicy | null {
    if (!raw) return null

    // Unwrap single-item array from join (Supabase may return array or object)
    const cat = Array.isArray(raw) ? (raw[0] as Record<string, unknown>) : raw

    if (!cat) return null

    const cadenceArr = cat.cadence_policy
    const cadence = Array.isArray(cadenceArr) ? cadenceArr[0] : cadenceArr

    const personaArr = cat.persona
    const personaRaw = Array.isArray(personaArr) ? personaArr[0] : personaArr

    const thresholdArr = cat.threshold_set
    const thresholdRaw = Array.isArray(thresholdArr)
      ? thresholdArr[0]
      : thresholdArr

    const stepsRaw: unknown[] = cadence?.cadence_step ?? []
    const steps: CadenceStep[] = (
      Array.isArray(stepsRaw) ? stepsRaw : []
    ).map((s: unknown) => {
      const step = s as Record<string, unknown>
      return {
        step_number: step.step_number as number,
        channel: step.channel as CadenceStep["channel"],
        offset_days_from_due: step.offset_days_from_due as number,
        template_key: step.template_key as string,
        escalation_level: step.escalation_level as number,
      }
    })

    return {
      id: cat.id as string,
      code: cat.code as string,
      display_name: cat.display_name as string,
      relationship_tier: cat.relationship_tier as CategoryPolicy["relationship_tier"],
      behaviour_band: cat.behaviour_band as CategoryPolicy["behaviour_band"],
      is_default: cat.is_default as boolean,
      cadence: cadence
        ? {
            max_messages_per_week: cadence.max_messages_per_week as number,
            steps,
          }
        : null,
      persona: personaRaw
        ? {
            tone: personaRaw.tone as "courteous" | "neutral" | "firm",
            salutation: personaRaw.salutation as string,
            language: personaRaw.language as string,
            signature: personaRaw.signature as string,
            voice_script_style: (personaRaw.voice_script_style as string | null) ?? null,
            requires_human_approval: personaRaw.requires_human_approval as boolean,
          }
        : null,
      thresholds: thresholdRaw
        ? {
            amber_days: thresholdRaw.amber_days as number,
            red_days: thresholdRaw.red_days as number,
            amber_amount_paise:
              thresholdRaw.amber_amount_paise != null
                ? BigInt(thresholdRaw.amber_amount_paise as number)
                : null,
            red_amount_paise:
              thresholdRaw.red_amount_paise != null
                ? BigInt(thresholdRaw.red_amount_paise as number)
                : null,
            quiet_hours_start: thresholdRaw.quiet_hours_start as string,
            quiet_hours_end: thresholdRaw.quiet_hours_end as string,
            promise_grace_hours: thresholdRaw.promise_grace_hours as number,
            silence_attempts: thresholdRaw.silence_attempts as number,
          }
        : null,
    }
  }

  const clientCategory = buildCategoryPolicy(rawCategory as Record<string, unknown> | null)

  // Fetch default category if client has none
  let defaultCategory: CategoryPolicy | null = null
  if (!clientCategory) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defCat, error: defCatError } = await (admin as any)
      .from("category")
      .select(`
        id, code, display_name, relationship_tier, behaviour_band, is_default,
        cadence_policy:cadence_policy(
          max_messages_per_week,
          cadence_step:cadence_step(
            step_number, channel, offset_days_from_due, template_key, escalation_level
          )
        ),
        persona:persona(
          tone, salutation, language, signature, voice_script_style, requires_human_approval
        ),
        threshold_set:threshold_set(
          amber_days, red_days, amber_amount_paise, red_amount_paise,
          quiet_hours_start, quiet_hours_end, promise_grace_hours, silence_attempts
        )
      `)
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle()

    if (defCatError) throw defCatError
    defaultCategory = buildCategoryPolicy(defCat as Record<string, unknown> | null)
  }

  // Fetch global config (max_messages_per_week ceiling)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sysConfig, error: sysConfigError } = await (admin as any)
    .from("system_config")
    .select("max_messages_per_week")
    .limit(1)
    .maybeSingle()

  if (sysConfigError) throw sysConfigError

  const globalMaxPerWeek: number = (sysConfig?.max_messages_per_week as number | null) ?? 7

  const policyInput: PolicyInput = {
    client_id: clientId,
    category: clientCategory,
    defaultCategory,
    currentStepNumber,
    clientOverrides: {},
    globalConfig: { max_messages_per_week: globalMaxPerWeek },
  }

  const resolvedPolicy = resolvePolicy(policyInput)

  // ── 6. Check flags affecting state ───────────────────────────────────────
  // has_active_dispute: any open item has status='disputed'
  const has_active_dispute = items.some((i) => i.status === "disputed")

  // has_pending_credit: any credit note awaiting allocation (allocation table with
  // amount_paise > 0 not yet fully applied). We approximate by checking
  // for open credit open_items — per schema open_item.status doesn't cover credits,
  // so we check ledger_entry credits with no allocation.
  // For now: no credit note check infrastructure is present yet; default false.
  const has_pending_credit = false

  // is_client_muted
  const is_client_muted: boolean =
    clientRow.is_muted === true &&
    (clientRow.muted_until === null ||
      new Date(clientRow.muted_until as string) > now)

  // has_confirmed_commitment: any commitment with status='confirmed' for this case
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: confirmedCommitments, error: commitmentError } = await (admin as any)
    .from("commitment")
    .select("id, due_at")
    .eq("case_id", caseId)
    .eq("status", "confirmed")
    .limit(1)

  if (commitmentError) throw commitmentError

  const confirmedCommitment =
    (confirmedCommitments ?? []).length > 0
      ? (confirmedCommitments as Array<{ id: string; due_at: string | null }>)[0]!
      : null

  const has_confirmed_commitment = confirmedCommitment !== null
  const commitment_due_at: Date | null =
    confirmedCommitment?.due_at != null
      ? new Date(confirmedCommitment.due_at)
      : null

  const promise_grace_hours: number =
    resolvedPolicy.thresholds.promise_grace_hours

  // ── 7. Build CaseInput and decide transition ──────────────────────────────
  const caseInput: CaseInput = {
    case_id: caseId,
    current_status: currentStatus as import("@/lib/cases/types").CaseStatus,
    current_step_number: currentStepNumber,
    open_items: openItemSummary,
    is_client_muted,
    has_active_dispute,
    has_pending_credit,
    has_confirmed_commitment,
    commitment_due_at,
    promise_grace_hours,
    cadence_steps: resolvedPolicy.category.cadence?.steps ?? [],
    now,
  }

  const transition = decideTransition(caseInput)

  // ── 8. UPDATE recovery_case ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateCaseError } = await (admin as any)
    .from("recovery_case")
    .update({
      status: transition.next_status,
      current_step_number: transition.next_step_number,
      next_action_at: transition.next_action_at?.toISOString() ?? null,
      total_open_paise: Number(total_open_paise),
      closed_at:
        transition.next_status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", caseId)

  if (updateCaseError) throw updateCaseError

  // ── 9. Schedule outreach if advancing ────────────────────────────────────
  if (transition.next_status === "open" && transition.next_action_at !== null) {
    const nextStepNumber = transition.next_step_number
    const nextStep = resolvedPolicy.category.cadence?.steps.find(
      (s) => s.step_number === nextStepNumber,
    ) ?? null

    if (nextStep !== null) {
      const todayIso = now.toISOString().slice(0, 10)
      const idempotencyKey = `${caseId}:${nextStep.step_number}:${todayIso}`

      // Find primary contact for the client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: primaryContact } = await (admin as any)
        .from("contact")
        .select("id")
        .eq("client_id", clientId)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle()

      const contactId: string | null =
        (primaryContact as { id: string } | null)?.id ?? null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: outreachError } = await (admin as any)
        .from("outreach")
        .upsert(
          {
            case_id: caseId,
            client_id: clientId,
            contact_id: contactId,
            channel: nextStep.channel,
            cadence_step_number: nextStep.step_number,
            template_key: nextStep.template_key,
            persona_tone: resolvedPolicy.persona.tone,
            rendered_body: "",
            status: "queued",
            idempotency_key: idempotencyKey,
            is_dry_run: true,
            scheduled_for: transition.next_action_at.toISOString(),
          },
          { onConflict: "idempotency_key", ignoreDuplicates: true },
        )

      if (outreachError) throw outreachError
    }
  }

  // ── 10. Write event for the transition ───────────────────────────────────
  const wasNew = !existingCase
  let eventType: import("@/lib/events/types").EventType

  if (wasNew) {
    // already wrote case.opened above
    eventType = "case.advanced"
  } else {
    switch (transition.next_status) {
      case "resolved":
        eventType = "case.resolved"
        break
      case "suppressed":
        eventType = "case.suppressed"
        break
      case "escalated":
        eventType = "case.escalated"
        break
      default:
        eventType = "case.advanced"
    }
  }

  await writeEvent({
    clientId,
    caseId,
    actorType: "system",
    type: eventType,
    payload: {
      from_status: currentStatus,
      to_status: transition.next_status,
      step_number: transition.next_step_number,
      next_action_at: transition.next_action_at?.toISOString() ?? null,
      reason: transition.reason,
    },
  })
}
