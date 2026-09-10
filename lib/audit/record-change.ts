import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { writeEvent } from "@/lib/events/write";

export interface ChangeRecord {
  actor_id: string; // app_user.id
  scope: string; // e.g. "category", "client", "threshold_set"
  scope_id: string | null; // UUID of the affected row
  field: string; // e.g. "cadence_policy", "category_id", "tone"
  old_value: unknown;
  new_value: unknown;
  reason: string;
}

export async function recordChange(
  change: ChangeRecord,
  client_id?: string,
): Promise<void> {
  const admin = getAdminClient();

  const { error } = await admin.from("setting_change").insert({
    actor_id: change.actor_id,
    scope: change.scope,
    scope_id: change.scope_id,
    field: change.field,
    old_value: change.old_value as import("@/lib/types/database").Json,
    new_value: change.new_value as import("@/lib/types/database").Json,
    reason: change.reason,
  });

  if (error) throw error;

  if (client_id !== undefined) {
    await writeEvent({
      clientId: client_id,
      actorType: "user",
      actorId: change.actor_id,
      type: "settings.changed",
      payload: {
        scope: change.scope,
        field: change.field,
        reason: change.reason,
      },
    });
  }
}
