import { getAdminClient } from "@/lib/supabase/admin";
import type { WriteEventParams } from "@/lib/events/types";

export async function writeEvent(params: WriteEventParams) {
  const admin = getAdminClient();

  const { error } = await admin.from("event").insert({
    client_id: params.clientId,
    case_id: params.caseId,
    actor_type: params.actorType,
    actor_id: params.actorId,
    type: params.type,
    payload: (params.payload ?? {}) as import("@/lib/types/database").Json,
    occurred_at: new Date().toISOString(),
  });

  if (error) throw error;
}
