import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import { recordChange } from "@/lib/audit/record-change";
import type { NextRequest } from "next/server";
import { z } from "zod";

const PutThresholdsSchema = z.object({
  amber_days: z.number().int().min(0),
  red_days: z.number().int().min(0),
  amber_amount_paise: z.number().int().nullable().optional(),
  red_amount_paise: z.number().int().nullable().optional(),
  quiet_hours_start: z.string().min(1),
  quiet_hours_end: z.string().min(1),
  promise_grace_hours: z.number().int().min(0),
  silence_attempts: z.number().int().min(0),
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

    const parsed = PutThresholdsSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const {
      amber_days,
      red_days,
      amber_amount_paise,
      red_amount_paise,
      quiet_hours_start,
      quiet_hours_end,
      promise_grace_hours,
      silence_attempts,
      reason,
    } = parsed.data;

    // Validate red_days > amber_days
    if (red_days <= amber_days) {
      return fail("VALIDATION_FAILED", "red_days must be greater than amber_days.");
    }

    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Fetch existing threshold_set
    const { data: existing, error: fetchError } = await adminAny
      .from("threshold_set")
      .select("*")
      .eq("category_id", categoryId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (fetchError) throw fetchError;
    if (!existing) {
      return fail("NOT_FOUND", "Threshold set not found for this category.");
    }

    const thresholdId = existing["id"] as string;
    const oldValue = { ...existing };

    // UPDATE threshold_set
    const { data: updated, error: updateError } = await adminAny
      .from("threshold_set")
      .update({
        amber_days,
        red_days,
        amber_amount_paise: amber_amount_paise ?? null,
        red_amount_paise: red_amount_paise ?? null,
        quiet_hours_start,
        quiet_hours_end,
        promise_grace_hours,
        silence_attempts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", thresholdId)
      .select("*")
      .single() as { data: Record<string, unknown> | null; error: unknown };

    if (updateError) throw updateError;

    // Record audit change
    await recordChange({
      actor_id: user.id,
      scope: "threshold_set",
      scope_id: thresholdId,
      field: "threshold_set",
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
