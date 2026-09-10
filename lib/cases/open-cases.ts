import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";

export interface OpenCaseSummary {
  case_id: string;
  client_id: string;
  status: string;
  current_step_number: number;
  next_action_at: string | null;
  total_open_paise: string;
}

export async function findDueCases(now: Date): Promise<OpenCaseSummary[]> {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("recovery_case")
    .select("id, client_id, status, current_step_number, next_action_at, total_open_paise")
    .not("status", "in", '("resolved","suppressed")')
    .lte("next_action_at", now.toISOString())
    .order("next_action_at", { ascending: true })
    .limit(100) as { data: Array<Record<string, unknown>> | null; error: unknown };

  if (error) throw error;

  return (data ?? []).map((r) => ({
    case_id: String(r["id"]),
    client_id: String(r["client_id"]),
    status: String(r["status"]),
    current_step_number: Number(r["current_step_number"]),
    next_action_at: r["next_action_at"] != null ? String(r["next_action_at"]) : null,
    total_open_paise: String(r["total_open_paise"] ?? "0"),
  }));
}

export async function enqueueAllClientEvaluations(): Promise<number> {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("client")
    .select("id") as { data: Array<{ id: string }> | null; error: unknown };

  if (error) throw error;
  const clients = data ?? [];

  for (const client of clients) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("job").insert({
      kind: "case.evaluate",
      payload: { client_id: client.id },
    });
  }

  return clients.length;
}
