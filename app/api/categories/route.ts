import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

const CreateCategorySchema = z.object({
  code: z.string().min(1),
  display_name: z.string().min(1),
  relationship_tier: z.enum(["strategic", "standard", "watchlist", "new"]),
  behaviour_band: z.enum(["prompt", "slipping", "chronic", "unknown"]),
});

export async function GET(): Promise<Response> {
  try {
    await requireRole("viewer");

    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    const { data: categories, error } = await adminAny
      .from("category")
      .select(
        `
        *,
        cadence_policy (
          *,
          cadence_step (*)
        ),
        persona (*),
        threshold_set (*)
        `,
      )
      .order("code", { ascending: true }) as {
        data: Array<Record<string, unknown>> | null;
        error: unknown;
      };

    if (error) throw error;

    return ok({ data: categories ?? [] });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireRole("admin");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", "Invalid JSON body.");
    }

    const parsed = CreateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const { code, display_name, relationship_tier, behaviour_band } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // INSERT category
    const { data: newCategory, error: categoryError } = await adminAny
      .from("category")
      .insert({ code, display_name, relationship_tier, behaviour_band })
      .select("*")
      .single() as { data: Record<string, unknown> | null; error: unknown };

    if (categoryError) throw categoryError;
    if (!newCategory) throw new Error("Failed to create category.");

    const categoryId = newCategory["id"] as string;

    // INSERT cadence_policy stub
    const { error: cadenceError } = await adminAny
      .from("cadence_policy")
      .insert({
        category_id: categoryId,
        max_messages_per_week: 2,
        is_active: true,
      });

    if (cadenceError) throw cadenceError;

    // INSERT persona stub
    const { error: personaError } = await adminAny
      .from("persona")
      .insert({
        category_id: categoryId,
        tone: "neutral",
        salutation: "Dear {contact_name},",
        language: "en",
        signature: "",
        requires_human_approval: false,
      });

    if (personaError) throw personaError;

    // INSERT threshold_set stub
    const { error: thresholdError } = await adminAny
      .from("threshold_set")
      .insert({
        category_id: categoryId,
        amber_days: 30,
        red_days: 60,
        quiet_hours_start: "20:00",
        quiet_hours_end: "08:00",
        promise_grace_hours: 24,
        silence_attempts: 3,
      });

    if (thresholdError) throw thresholdError;

    return NextResponse.json({ data: newCategory }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
