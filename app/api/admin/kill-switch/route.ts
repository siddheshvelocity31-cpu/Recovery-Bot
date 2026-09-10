import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import { recordChange } from "@/lib/audit/record-change";
import type { NextRequest } from "next/server";
import { z } from "zod";

const KillSwitchBodySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().min(3),
});

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireRole("admin");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", "Invalid JSON body.");
    }

    const parsed = KillSwitchBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const { enabled, reason } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Read current value to diff
    const { data: config, error: readError } = await adminAny
      .from("system_config")
      .select("outreach_kill_switch")
      .single() as { data: { outreach_kill_switch: boolean } | null; error: unknown };

    if (readError) throw readError;
    if (!config) throw new Error("system_config singleton row missing");

    const old_value = config.outreach_kill_switch;

    // Update kill switch
    const { error: updateError } = await adminAny
      .from("system_config")
      .update({ outreach_kill_switch: enabled })
      .eq("id", "singleton") as { error: unknown };

    if (updateError) throw updateError;

    // Record the change (writes setting_change row; no client_id so no event from recordChange)
    await recordChange({
      actor_id: user.id,
      scope: "system_config",
      scope_id: null,
      field: "outreach_kill_switch",
      old_value,
      new_value: enabled,
      reason,
    });

    // Write settings.changed event at the system level (client_id = null)
    const { error: eventError } = await adminAny.from("event").insert({
      client_id: null,
      case_id: null,
      actor_type: "user",
      actor_id: user.id,
      type: "settings.changed",
      payload: { field: "outreach_kill_switch", enabled, reason },
      occurred_at: new Date().toISOString(),
    }) as { error: unknown };

    if (eventError) throw eventError;

    return ok({ enabled });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
