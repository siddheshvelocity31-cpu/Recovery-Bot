import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(): Promise<Response> {
  try {
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Query system_config for kill switch + last_tick_at
    const { data: config, error: configError } = await adminAny
      .from("system_config")
      .select("outreach_kill_switch, last_tick_at")
      .single() as { data: { outreach_kill_switch: boolean; last_tick_at: string | null } | null; error: unknown };

    if (configError) throw configError;

    const lastTick = config?.last_tick_at ? new Date(config.last_tick_at) : null;
    const tick_age_seconds = lastTick
      ? Math.floor((Date.now() - lastTick.getTime()) / 1000)
      : null;

    // Count pending jobs and find the oldest
    const { data: pendingJobs, error: pendingError } = await adminAny
      .from("job")
      .select("run_after")
      .eq("status", "pending")
      .order("run_after", { ascending: true }) as {
        data: Array<{ run_after: string }> | null;
        error: unknown;
      };

    if (pendingError) throw pendingError;

    const pending_jobs = (pendingJobs ?? []).length;
    const oldest_pending = pendingJobs && pendingJobs.length > 0 ? pendingJobs[0] : null;
    const oldest_pending_age_seconds = oldest_pending?.run_after
      ? Math.floor((Date.now() - new Date(oldest_pending.run_after).getTime()) / 1000)
      : null;

    // Count dead jobs
    const { count: dead_jobs, error: deadError } = await adminAny
      .from("job")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead") as { count: number | null; error: unknown };

    if (deadError) throw deadError;

    const dead = dead_jobs ?? 0;
    const kill_switch_enabled = config?.outreach_kill_switch ?? false;

    const degraded =
      (tick_age_seconds !== null && tick_age_seconds > 300) || dead > 0;

    return NextResponse.json(
      {
        status: degraded ? "degraded" : "ok",
        tick_age_seconds,
        pending_jobs,
        dead_jobs: dead,
        oldest_pending_age_seconds,
        kill_switch_enabled,
      },
      { status: degraded ? 503 : 200 },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", error: "health check failed" },
      { status: 503 },
    );
  }
}
