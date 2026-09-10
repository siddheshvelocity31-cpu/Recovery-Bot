import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";

export interface SystemConfig {
  outreach_kill_switch: boolean;
  global_max_messages_per_week: number;
  last_tick_at: string | null;
}

export async function getSystemConfig(): Promise<SystemConfig> {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("system_config")
    .select("outreach_kill_switch, global_max_messages_per_week, last_tick_at")
    .single() as { data: SystemConfig | null; error: unknown };

  if (error) throw error;
  if (!data) throw new Error("system_config singleton row missing");
  return data;
}

export async function setKillSwitch(
  enabled: boolean,
  actorId: string,
  reason: string,
): Promise<void> {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("system_config")
    .update({ outreach_kill_switch: enabled })
    .eq("id", "singleton") as { error: unknown };

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("setting_change").insert({
    actor_id: actorId,
    scope: "system_config",
    scope_id: null,
    field: "outreach_kill_switch",
    old_value: !enabled,
    new_value: enabled,
    reason,
  });
}

export async function recordTick(): Promise<void> {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("system_config")
    .update({ last_tick_at: new Date().toISOString() })
    .eq("id", "singleton");
}
