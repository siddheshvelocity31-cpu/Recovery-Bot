import { readFileSync } from "node:fs";
import { resolve } from "node:path";
try {
  const env = readFileSync(resolve(__dirname, "../../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* env vars may be set externally */ }

import { describe, it, expect } from "vitest";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  claimJobs,
  markFailed,
  reclaimStuckJobs,
  type JobRow,
} from "@/lib/jobs/queue";

// ── helpers ──────────────────────────────────────────────────────────────────

const admin = getAdminClient();

/** Insert a pending job and return its id. */
async function enqueue(
  kind: string,
  payload: Record<string, unknown> = {},
  opts: { dedupe_key?: string; max_attempts?: number } = {},
): Promise<string> {
  const { data, error } = await admin
    .from("job")
    .insert({ kind, payload: payload as import("@/lib/types/database").Json, ...opts })
    .select("id")
    .single();
  if (error) throw new Error(`enqueue failed: ${error.message}`);
  if (!data) throw new Error("enqueue returned no data");
  return data.id;
}

/** Fetch a job row by id. */
async function fetchJob(id: string): Promise<JobRow> {
  const { data, error } = await admin
    .from("job")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(`fetchJob failed: ${error.message}`);
  if (!data) throw new Error(`job ${id} not found`);
  return data as JobRow;
}

/** Delete all jobs inserted during a test to keep tests isolated. */
async function cleanupJobs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await admin.from("job").delete().in("id", ids);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("job queue", () => {
  // ── Test 1: concurrent claims never overlap ──────────────────────────────
  it("two concurrent claimJobs calls never return the same job id", async () => {
    const ids: string[] = [];
    try {
      // Insert 5 pending jobs.
      for (let i = 0; i < 5; i++) {
        ids.push(await enqueue("noop", { i }));
      }

      // Claim concurrently — both calls race for the same pool.
      const [batchA, batchB] = await Promise.all([
        claimJobs(admin, 10),
        claimJobs(admin, 10),
      ]);

      const idsA = new Set(batchA.map((j) => j.id));
      const idsB = new Set(batchB.map((j) => j.id));

      // No id should appear in both batches.
      for (const id of idsA) {
        expect(idsB.has(id)).toBe(false);
      }

      // All 5 jobs must be accounted for across the two batches.
      const allClaimed = new Set([...idsA, ...idsB]);
      for (const id of ids) {
        expect(allClaimed.has(id)).toBe(true);
      }
    } finally {
      await cleanupJobs(ids);
    }
  });

  // ── Test 2: failing handler increments attempts and pushes run_after ─────
  it("markFailed increments attempts and pushes run_after forward", async () => {
    const ids: string[] = [];
    try {
      const id = await enqueue("noop");
      ids.push(id);

      const before = await fetchJob(id);
      const beforeRunAfter = new Date(before.run_after).getTime();

      // Claim (increments attempts to 1).
      await claimJobs(admin, 1);

      // Mark failed.
      await markFailed(admin, id, "test error");

      const after = await fetchJob(id);
      expect(after.status).toBe("failed");
      expect(after.attempts).toBe(1);
      expect(after.last_error).toBe("test error");

      const afterRunAfter = new Date(after.run_after).getTime();
      // run_after must be pushed forward relative to the original value.
      expect(afterRunAfter).toBeGreaterThan(beforeRunAfter);
    } finally {
      await cleanupJobs(ids);
    }
  });

  // ── Test 3: job at max_attempts becomes dead ──────────────────────────────
  it("a job at max_attempts becomes dead, not failed", async () => {
    const ids: string[] = [];
    try {
      // max_attempts=1 so the first failure exhausts it.
      const id = await enqueue("noop", {}, { max_attempts: 1 });
      ids.push(id);

      // Claim (attempts becomes 1 == max_attempts).
      await claimJobs(admin, 1);

      // Mark failed — should go dead because attempts >= max_attempts.
      await markFailed(admin, id, "terminal error");

      const job = await fetchJob(id);
      expect(job.status).toBe("dead");
      expect(job.last_error).toBe("terminal error");
    } finally {
      await cleanupJobs(ids);
    }
  });

  // ── Test 4: reclaimStuckJobs returns old running jobs to pending ──────────
  it("reclaimStuckJobs returns a 15-minute-old running job to pending", async () => {
    const ids: string[] = [];
    try {
      const id = await enqueue("noop");
      ids.push(id);

      // Directly set the job to running with a locked_at 15 minutes ago
      // (simulates a stuck worker).
      const { error: updateError } = await admin.rpc("claim_jobs", {
        p_limit: 1,
        p_worker: "test-worker",
      });
      if (updateError) throw new Error(updateError.message);

      // Force locked_at to 15 minutes ago via direct SQL update (service role).
      const { error: stuckError } = await admin
        .from("job")
        .update({
          locked_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        })
        .eq("id", id)
        .eq("status", "running");
      if (stuckError) throw new Error(`Could not simulate stuck job: ${stuckError.message}`);

      const reclaimed = await reclaimStuckJobs(admin);
      expect(reclaimed).toBeGreaterThanOrEqual(1);

      const job = await fetchJob(id);
      expect(job.status).toBe("pending");
      expect(job.locked_at).toBeNull();
      expect(job.locked_by).toBeNull();
    } finally {
      await cleanupJobs(ids);
    }
  });

  // ── Test 5: duplicate dedupe_key while pending is rejected ───────────────
  it("duplicate dedupe_key insert while one is pending is rejected", async () => {
    const ids: string[] = [];
    const key = `test-dedupe-${Date.now()}`;
    try {
      const id = await enqueue("noop", {}, { dedupe_key: key });
      ids.push(id);

      // Second insert with same key should fail with a unique violation.
      const { data, error } = await admin
        .from("job")
        .insert({ kind: "noop", payload: {}, dedupe_key: key })
        .select("id")
        .single();

      expect(error).not.toBeNull();
      // Postgres unique violation code is 23505.
      expect(error?.code).toBe("23505");
      expect(data).toBeNull();
    } finally {
      await cleanupJobs(ids);
    }
  });
});
