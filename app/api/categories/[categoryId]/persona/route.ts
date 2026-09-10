import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import { recordChange } from "@/lib/audit/record-change";
import type { NextRequest } from "next/server";
import { z } from "zod";

const PutPersonaSchema = z.object({
  tone: z.enum(["courteous", "neutral", "firm"]),
  salutation: z.string().min(1),
  language: z.string().min(1),
  signature: z.string().min(1),
  voice_script_style: z.string().nullable().optional(),
  requires_human_approval: z.boolean(),
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

    const parsed = PutPersonaSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const {
      tone,
      salutation,
      language,
      signature,
      voice_script_style,
      requires_human_approval,
      reason,
    } = parsed.data;

    // Validate: firm tone requires human approval
    if (tone === "firm" && !requires_human_approval) {
      return fail(
        "VALIDATION_FAILED",
        "requires_human_approval must be true when tone is 'firm'.",
      );
    }

    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Fetch existing persona
    const { data: existing, error: fetchError } = await adminAny
      .from("persona")
      .select("*")
      .eq("category_id", categoryId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (fetchError) throw fetchError;
    if (!existing) {
      return fail("NOT_FOUND", "Persona not found for this category.");
    }

    const personaId = existing["id"] as string;
    const oldValue = { ...existing };

    // UPDATE persona
    const { data: updated, error: updateError } = await adminAny
      .from("persona")
      .update({
        tone,
        salutation,
        language,
        signature,
        voice_script_style: voice_script_style ?? null,
        requires_human_approval,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personaId)
      .select("*")
      .single() as { data: Record<string, unknown> | null; error: unknown };

    if (updateError) throw updateError;

    // Record audit change
    await recordChange({
      actor_id: user.id,
      scope: "persona",
      scope_id: personaId,
      field: "persona",
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
