import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import { writeEvent } from "@/lib/events/write";
import type { NextRequest } from "next/server";
import { z } from "zod";

const MuteBodySchema = z.object({
  muted_until: z.string().datetime(),
  reason: z.string().min(3),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const user = await requireRole("collector");

    const { clientId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", "Invalid JSON body.");
    }

    const parsed = MuteBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const { muted_until, reason } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    const { data: client, error: updateError } = await adminAny
      .from("client")
      .update({
        is_muted: true,
        muted_until,
        mute_reason: reason,
      })
      .eq("id", clientId)
      .select("*")
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (updateError) throw updateError;
    if (!client) {
      return fail("NOT_FOUND", "Client not found.");
    }

    await writeEvent({
      clientId,
      actorType: "user",
      actorId: user.id,
      type: "client.muted",
      payload: { muted_until, reason },
    });

    return ok(client);
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
