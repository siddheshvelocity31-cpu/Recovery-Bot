import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const version = process.env["VERCEL_GIT_COMMIT_SHA"] ?? "local";

  try {
    const admin = getAdminClient();
    const { error } = await admin.rpc("health_check");
    if (error) throw error;

    // System config — kill switch + last tick
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: config } = await (admin as any)
      .from("system_config")
      .select("outreach_kill_switch, last_tick_at")
      .single() as { data: Record<string, unknown> | null };

    const lastTick = config?.["last_tick_at"]
      ? new Date(String(config["last_tick_at"]))
      : null;
    const tickAgeMinutes = lastTick
      ? (Date.now() - lastTick.getTime()) / 60000
      : null;

    // Dead jobs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: deadJobs } = await (admin as any)
      .from("job")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead") as { count: number | null };

    const isStale = tickAgeMinutes !== null && tickAgeMinutes > 5;
    const hasDead = (deadJobs ?? 0) > 0;
    const degraded = isStale || hasDead;

    return NextResponse.json(
      {
        status: degraded ? "degraded" : "ok",
        version,
        db: "ok",
        kill_switch: config?.["outreach_kill_switch"] ?? false,
        last_tick_at: config?.["last_tick_at"] ?? null,
        tick_age_minutes: tickAgeMinutes !== null ? Math.round(tickAgeMinutes) : null,
        dead_jobs: deadJobs ?? 0,
      },
      { status: degraded ? 503 : 200 },
    );
  } catch {
    return NextResponse.json(
      { status: "error", version, db: "unavailable" },
      { status: 503 },
    );
  }
}
