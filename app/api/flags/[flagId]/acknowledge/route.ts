import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import { writeEvent } from "@/lib/events/write";
import type { NextRequest } from "next/server";
import { z } from "zod";

const AcknowledgeSchema = z.object({
  reason: z.string().min(1),
  ack_until: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ flagId: string }> },
): Promise<Response> {
  try {
    const user = await requireRole("collector");

    const { flagId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", "Invalid JSON body.");
    }

    const parsed = AcknowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const { reason, ack_until } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Fetch flag — 404 if not found
    const { data: flag, error: fetchError } = await adminAny
      .from("flag")
      .select("*")
      .eq("id", flagId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (fetchError) throw fetchError;
    if (!flag) {
      return fail("NOT_FOUND", "Flag not found.");
    }

    // 409 if already acknowledged
    if (flag["acknowledged_at"] !== null) {
      return fail("CONFLICT", "Flag has already been acknowledged.");
    }

    const now = new Date().toISOString();

    // UPDATE flag
    const { data: updated, error: updateError } = await adminAny
      .from("flag")
      .update({
        acknowledged_by: user.id,
        acknowledged_at: now,
        ack_reason: reason,
        ack_until,
      })
      .eq("id", flagId)
      .select("*")
      .single() as { data: Record<string, unknown> | null; error: unknown };

    if (updateError) throw updateError;

    // Write flag.acknowledged event
    await writeEvent({
      clientId: flag["client_id"] as string,
      actorType: "user",
      actorId: user.id,
      type: "flag.acknowledged",
      payload: { reason, ack_until },
    });

    return ok({ data: updated });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
