import { getAdminClient } from "@/lib/supabase/admin";

export interface Job {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  run_after: string;
  status: "pending" | "running" | "done" | "failed" | "dead";
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  dedupe_key: string | null;
  completed_at: string | null;
}

export interface ClaimResult {
  jobs: Job[];
  claimed: boolean;
}

function rowToJob(j: Record<string, unknown>): Job {
  return {
    id: String(j["id"]),
    kind: String(j["kind"]),
    payload: (j["payload"] ?? {}) as Record<string, unknown>,
    run_after: String(j["run_after"]),
    status: j["status"] as Job["status"],
    attempts: Number(j["attempts"]),
    max_attempts: Number(j["max_attempts"]),
    locked_at: j["locked_at"] != null ? String(j["locked_at"]) : null,
    locked_by: j["locked_by"] != null ? String(j["locked_by"]) : null,
    last_error: j["last_error"] != null ? String(j["last_error"]) : null,
    dedupe_key: j["dedupe_key"] != null ? String(j["dedupe_key"]) : null,
    completed_at: j["completed_at"] != null ? String(j["completed_at"]) : null,
  };
}

export async function claimJobs(limit: number = 20): Promise<ClaimResult> {
  const admin = getAdminClient();

  const { data, error } = await admin.rpc("claim_jobs", {
    p_limit: limit,
    p_worker: "cron-tick",
  });

  if (error) throw error;

  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  return {
    claimed: rows.length > 0,
    jobs: rows.map(rowToJob),
  };
}

export async function reclaimStuckJobs(): Promise<Job[]> {
  const admin = getAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("reclaim_stuck_jobs") as {
    data: Record<string, unknown>[] | null;
    error: unknown;
  };

  if (error) throw error;

  return (data ?? []).map(rowToJob);
}

export async function failJob(jobId: string, errorText: string): Promise<void> {
  const admin = getAdminClient();

  const { error } = await admin.rpc("fail_job", {
    p_error: errorText,
    p_id: jobId,
  });

  if (error) throw error;
}
