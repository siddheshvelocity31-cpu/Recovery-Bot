import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import type { Job } from "@/lib/jobs/queue"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleHealthCheck(_job: Job): Promise<void> {
  const admin = getAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any

  // --- Tick age check ---
  const { data: config } = await adminAny
    .from("system_config")
    .select("last_tick_at")
    .single() as { data: { last_tick_at: string | null } | null }

  const lastTick = config?.last_tick_at ? new Date(config.last_tick_at) : null
  const tickAgeSeconds = lastTick
    ? Math.floor((Date.now() - lastTick.getTime()) / 1000)
    : null

  if (tickAgeSeconds === null || tickAgeSeconds > 300) {
    logger.warn("[health-check] Tick age exceeds 5 minutes", {
      tick_age_seconds: tickAgeSeconds,
      last_tick_at: config?.last_tick_at ?? null,
    })
  }

  // --- Dead jobs check ---
  const { count: deadCount } = await adminAny
    .from("job")
    .select("id", { count: "exact", head: true })
    .eq("status", "dead") as { count: number | null }

  if ((deadCount ?? 0) > 0) {
    logger.warn("[health-check] Dead jobs detected", { dead_jobs: deadCount ?? 0 })
  }

  // --- Imports stuck in parsing for > 15 minutes ---
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  const { data: stuckImports } = await adminAny
    .from("ledger_import")
    .select("id, created_at")
    .eq("status", "parsing")
    .lt("created_at", fifteenMinutesAgo) as {
      data: Array<{ id: string; created_at: string }> | null
    }

  if (stuckImports && stuckImports.length > 0) {
    logger.warn("[health-check] Imports stuck in parsing for > 15 minutes", {
      count: stuckImports.length,
      import_ids: stuckImports.map((i) => i.id),
    })
  }

  // --- No successful import in the last 3 days ---
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const { count: recentImports } = await adminAny
    .from("ledger_import")
    .select("id", { count: "exact", head: true })
    .eq("status", "done")
    .gte("created_at", threeDaysAgo) as { count: number | null }

  if ((recentImports ?? 0) === 0) {
    logger.warn("[health-check] No successful import in the last 3 days")
  }

  // --- More than 20 live red flags ---
  const { count: redFlagCount } = await adminAny
    .from("flag")
    .select("id", { count: "exact", head: true })
    .eq("severity", "red")
    .is("resolved_at", null)
    .is("ack_until", null) as { count: number | null }

  if ((redFlagCount ?? 0) > 20) {
    logger.warn("[health-check] More than 20 live red flags", {
      red_flag_count: redFlagCount ?? 0,
    })
  }

  logger.info("[health-check] Health check complete", {
    tick_age_seconds: tickAgeSeconds,
    dead_jobs: deadCount ?? 0,
    stuck_imports: stuckImports?.length ?? 0,
    recent_imports: recentImports ?? 0,
    red_flags: redFlagCount ?? 0,
  })
}
