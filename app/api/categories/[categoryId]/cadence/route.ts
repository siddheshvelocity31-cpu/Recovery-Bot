import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import { recordChange } from "@/lib/audit/record-change";
import type { NextRequest } from "next/server";
import { z } from "zod";

const CadenceStepSchema = z.object({
  step_number: z.number().int().positive(),
  channel: z.enum(["whatsapp", "email", "voice", "human"]),
  offset_days_from_due: z.number().int().min(0),
  template_key: z.string().min(1),
  escalation_level: z.number().int().min(1),
});

const PutCadenceSchema = z.object({
  max_messages_per_week: z.number().int().min(0).max(7),
  steps: z.array(CadenceStepSchema).min(1),
  reason: z.string().min(1),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> },
): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const { categoryId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", "Invalid JSON body.");
    }

    const parsed = PutCadenceSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const { max_messages_per_week, steps, reason } = parsed.data;

    // Validate: offset_days_from_due strictly increasing
    for (let i = 1; i < steps.length; i++) {
      if ((steps[i]?.offset_days_from_due ?? 0) <= (steps[i - 1]?.offset_days_from_due ?? 0)) {
        return fail(
          "VALIDATION_FAILED",
          "offset_days_from_due must be strictly increasing across steps.",
        );
      }
    }

    // Validate: no duplicate (channel, offset_days_from_due)
    const seen = new Set<string>();
    for (const step of steps) {
      const key = `${step.channel}:${step.offset_days_from_due}`;
      if (seen.has(key)) {
        return fail(
          "VALIDATION_FAILED",
          `Duplicate (channel, offset_days_from_due) combination: ${step.channel} at ${step.offset_days_from_due}.`,
        );
      }
      seen.add(key);
    }

    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Fetch existing cadence_policy for this category
    const { data: existingPolicy, error: policyFetchError } = await adminAny
      .from("cadence_policy")
      .select("*, cadence_step(*)")
      .eq("category_id", categoryId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (policyFetchError) throw policyFetchError;
    if (!existingPolicy) {
      return fail("NOT_FOUND", "Cadence policy not found for this category.");
    }

    const policyId = existingPolicy["id"] as string;
    const oldValue = { ...existingPolicy };

    // UPDATE cadence_policy
    const { error: updateError } = await adminAny
      .from("cadence_policy")
      .update({ max_messages_per_week, updated_at: new Date().toISOString() })
      .eq("id", policyId);

    if (updateError) throw updateError;

    // DELETE old cadence_steps
    const { error: deleteError } = await adminAny
      .from("cadence_step")
      .delete()
      .eq("cadence_policy_id", policyId);

    if (deleteError) throw deleteError;

    // INSERT new cadence_steps
    const stepInserts = steps.map((step) => ({
      cadence_policy_id: policyId,
      step_number: step.step_number,
      channel: step.channel,
      offset_days_from_due: step.offset_days_from_due,
      template_key: step.template_key,
      escalation_level: step.escalation_level,
    }));

    const { error: insertError } = await adminAny
      .from("cadence_step")
      .insert(stepInserts);

    if (insertError) throw insertError;

    // Fetch updated cadence with steps
    const { data: updated, error: refetchError } = await adminAny
      .from("cadence_policy")
      .select("*, cadence_step(*)")
      .eq("id", policyId)
      .single() as { data: Record<string, unknown> | null; error: unknown };

    if (refetchError) throw refetchError;

    // Record audit change
    await recordChange({
      actor_id: user.id,
      scope: "cadence_policy",
      scope_id: policyId,
      field: "cadence_policy",
      old_value: oldValue,
      new_value: updated,
      reason,
    });

    return ok({ data: updated });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
