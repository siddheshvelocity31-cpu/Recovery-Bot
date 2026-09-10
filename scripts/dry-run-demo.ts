/**
 * dry-run-demo.ts
 *
 * Demonstration script for the Receivables Recovery System.
 * Runs the full pipeline on a clean local Supabase database with a simulated
 * clock advancing 1 day per iteration for 45 days, printing a human-readable
 * summary each day. No messages leave the building — every outreach row has
 * is_dry_run=true.
 *
 * Usage:
 *   npm run demo
 *   (runs via: tsx scripts/dry-run-demo.ts)
 *
 * Prerequisites:
 *   - Local Supabase running: npx supabase start
 *   - Migrations applied: npx supabase db reset
 *   - .env.local present with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ── Load .env.local so env vars are available outside Next.js ─────────────────
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // env vars may already be set externally
}

// ── After env is loaded, import modules that need env vars ────────────────────
// NOTE: "server-only" is aliased to a no-op in vitest.config.ts; for tsx we
// need to set the alias here or accept that the imports will include it.
// The functions work fine in Node context; the server-only guard is a build-time
// check only.
import { handleJob } from "../lib/jobs/handlers/index";
import type { Job } from "../lib/jobs/queue";

// ── Constants ─────────────────────────────────────────────────────────────────

const FIXTURE_PATH = resolve(process.cwd(), "tests/fixtures/Olectra_Client_Ledger_Report.xlsx");
const SIMULATION_DAYS = 45;
// Olectra's seeded client_code from supabase/seed.sql
const OLECTRA_CLIENT_CODE = "OL000001";

// ── Admin client (service-role, bypasses RLS) ─────────────────────────────────

const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !serviceKey) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
  );
  console.error("       Copy .env.local.example to .env.local and fill in the values,");
  console.error("       then run: npx supabase start");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function banner(text: string): void {
  const line = "─".repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

function dayHeader(day: number, date: Date): void {
  const dateStr = date.toISOString().slice(0, 10);
  console.log(`\n  Day ${String(day).padStart(2, "0")} / ${dateStr}`);
}

/** Claim and drain all pending jobs from the queue, returning count processed. */
async function drainQueue(simDate: Date): Promise<{ processed: number; kinds: string[] }> {
  let processed = 0;
  const kindsSeen: string[] = [];

  // NOTE: claimJobs() uses FOR UPDATE SKIP LOCKED via the claim_jobs RPC.
  // We process in batches of 20 until there are no pending jobs left.

  // Step 1: Fetch all pending jobs that are due
  const { data: pendingJobs, error: fetchErr } = await admin
    .from("job")
    .select("*")
    .eq("status", "pending")
    .lte("run_after", simDate.toISOString())
    .order("run_after", { ascending: true })
    .limit(100);

  if (fetchErr) {
    console.error("  [drain] Error fetching pending jobs:", fetchErr.message);
    return { processed: 0, kinds: [] };
  }

  const jobs: Job[] = (pendingJobs ?? []).map((j: Record<string, unknown>): Job => ({
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
  }));

  for (const job of jobs) {
    // Mark as running
    await admin
      .from("job")
      .update({ status: "running", locked_at: simDate.toISOString(), locked_by: "demo" })
      .eq("id", job.id)
      .eq("status", "pending");

    try {
      await handleJob(job);
      // Mark as done
      await admin
        .from("job")
        .update({ status: "done", completed_at: simDate.toISOString() })
        .eq("id", job.id);

      processed += 1;
      kindsSeen.push(job.kind);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin
        .from("job")
        .update({ status: "failed", last_error: msg.slice(0, 512) })
        .eq("id", job.id);
      console.error(`  [drain] job ${job.id} (${job.kind}) failed: ${msg}`);
    }
  }

  return { processed, kinds: kindsSeen };
}

/** Fetch a summary of the current database state for one print line. */
async function fetchDaySummary(clientId: string): Promise<{
  caseStatus: string | null;
  openItemCount: number;
  outreachQueued: number;
  outreachSent: number;
  flagCount: number;
}> {
  const [caseRes, openItemsRes, outreachQueuedRes, outreachSentRes, flagsRes] =
    await Promise.all([
      admin
        .from("recovery_case")
        .select("status")
        .eq("client_id", clientId)
        .not("status", "eq", "resolved")
        .maybeSingle() as unknown as Promise<{ data: Record<string, unknown> | null }>,

      admin
        .from("open_item")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .not("status", "in", '("settled","written_off")') as unknown as Promise<{
        count: number | null;
      }>,

      admin
        .from("outreach")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("status", "queued") as unknown as Promise<{ count: number | null }>,

      admin
        .from("outreach")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("status", "sent") as unknown as Promise<{ count: number | null }>,

      admin
        .from("flag")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .is("resolved_at", null) as unknown as Promise<{ count: number | null }>,
    ]);

  return {
    caseStatus: (caseRes.data?.["status"] as string | null) ?? null,
    openItemCount: openItemsRes.count ?? 0,
    outreachQueued: outreachQueuedRes.count ?? 0,
    outreachSent: outreachSentRes.count ?? 0,
    flagCount: flagsRes.count ?? 0,
  };
}

// ── Step 1: Resolve Olectra client from seed data ─────────────────────────────

async function resolveOlectraClient(): Promise<string> {
  const { data, error } = await admin
    .from("client")
    .select("id, name")
    .eq("client_code", OLECTRA_CLIENT_CODE)
    .single();

  if (error) {
    throw new Error(
      `Could not find Olectra client (${OLECTRA_CLIENT_CODE}). ` +
        "Did you run: npx supabase db reset ?  " +
        `DB error: ${error.message}`,
    );
  }

  console.log(`  Found Olectra: ${data.name} (id=${data.id})`);
  return data.id as string;
}

// ── Step 2: Import the fixture XLSX ───────────────────────────────────────────
// The import pipeline works by:
//   1. Inserting a ledger_import row with a storage_path
//   2. Enqueueing a ledger.parse_chunk job (cursor=0)
//   3. The handler reads the XLSX from Supabase Storage (or a local path)
//
// For the demo we simulate this by inserting a ledger_import row and then
// directly enqueuing the parse job. The parse handler will read the XLSX
// via the configured Storage path. If Storage is not set up locally, the
// handler may fail gracefully.

async function importFixture(clientId: string): Promise<string> {
  console.log("  Inserting ledger_import row ...");

  // Check if this fixture has already been imported (idempotent demo)
  const { data: existing } = await admin
    .from("ledger_import")
    .select("id, status")
    .eq("client_id", clientId)
    .eq("source_filename", "Olectra_Client_Ledger_Report.xlsx")
    .maybeSingle();

  if (existing) {
    console.log(`  Re-using existing import ${existing.id} (status=${existing.status})`);
    return existing.id as string;
  }

  const { data: importRow, error: importErr } = await admin
    .from("ledger_import")
    .insert({
      client_id: clientId,
      // Storage path where the XLSX was uploaded. For local demo this may not
      // exist — the parse handler is expected to handle that gracefully.
      storage_path: `ledger/${OLECTRA_CLIENT_CODE}/Olectra_Client_Ledger_Report.xlsx`,
      file_sha256: `demo_sha256_${Date.now()}`,
      source_filename: "Olectra_Client_Ledger_Report.xlsx",
      status: "pending",
    })
    .select("id")
    .single();

  if (importErr) throw importErr;

  const importId = importRow.id as string;
  console.log(`  Created ledger_import ${importId}`);

  // Enqueue the first parse chunk job
  const { error: jobErr } = await admin.from("job").insert({
    kind: "ledger.parse_chunk",
    payload: { import_id: importId, cursor: 0 },
  });

  if (jobErr) throw jobErr;

  console.log("  Enqueued ledger.parse_chunk job");
  return importId;
}

// ── Step 3: Enqueue initial jobs ───────────────────────────────────────────────

async function enqueueBootstrapJobs(clientId: string): Promise<void> {
  // Enqueue aging recompute which will cascade to flags.evaluate
  const { error: agingErr } = await admin.from("job").insert({
    kind: "aging.recompute",
    payload: { client_id: clientId },
  });
  if (agingErr && agingErr.code !== "23505") throw agingErr;

  // Enqueue case evaluation
  const { error: caseErr } = await admin.from("job").insert({
    kind: "case.evaluate",
    payload: { client_id: clientId },
  });
  if (caseErr && caseErr.code !== "23505") throw caseErr;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  banner("Receivables Recovery System — Dry-Run Demo");

  console.log(`\n  Fixture : ${FIXTURE_PATH}`);
  console.log(`  Duration: ${SIMULATION_DAYS} simulated days`);
  console.log(
    "\n  IMPORTANT: All outreach is is_dry_run=true. No real messages sent.",
  );

  // ── Resolve Olectra client ────────────────────────────────────────────────
  banner("Step 1: Resolve Olectra client from seed data");
  const clientId = await resolveOlectraClient();

  // ── Import fixture XLSX ───────────────────────────────────────────────────
  banner("Step 2: Import ledger fixture (Olectra_Client_Ledger_Report.xlsx)");
  await importFixture(clientId);

  // ── Simulation loop ───────────────────────────────────────────────────────
  banner("Step 3: Simulate 45 days of the recovery pipeline");

  const startDate = new Date();
  let totalJobsProcessed = 0;

  for (let day = 1; day <= SIMULATION_DAYS; day++) {
    const simDate = new Date(startDate.getTime() + (day - 1) * 24 * 60 * 60 * 1000);
    dayHeader(day, simDate);

    // On day 3, enqueue aging + case evaluation to simulate the daily cron
    if (day === 3 || day % 7 === 0) {
      await enqueueBootstrapJobs(clientId);
    }

    // ── Drain the job queue ──────────────────────────────────────────────
    // This is the main loop: claim and execute every pending job in order.
    // Each job may itself enqueue more jobs (e.g. derive-open-items enqueues
    // case.evaluate; aging-recompute enqueues flags.evaluate).
    // We repeat until no pending jobs remain for this day.
    let totalProcessedThisDay = 0;
    const iterationKinds: string[] = [];
    let iterations = 0;
    const MAX_ITERATIONS = 20; // guard against infinite loops in handlers

    do {
      const { processed, kinds } = await drainQueue(simDate);
      totalProcessedThisDay += processed;
      iterationKinds.push(...kinds);
      iterations++;

      if (processed === 0) break;
    } while (iterations < MAX_ITERATIONS);

    totalJobsProcessed += totalProcessedThisDay;

    // ── Fetch and print day summary ──────────────────────────────────────
    const summary = await fetchDaySummary(clientId);

    const kindsStr =
      iterationKinds.length > 0
        ? [...new Set(iterationKinds)].join(", ")
        : "none";

    console.log(
      `    jobs processed : ${totalProcessedThisDay} (${kindsStr})`,
    );
    console.log(
      `    case status    : ${summary.caseStatus ?? "none"}`,
    );
    console.log(
      `    open items     : ${summary.openItemCount}`,
    );
    console.log(
      `    outreach       : ${summary.outreachQueued} queued / ${summary.outreachSent} sent`,
    );
    console.log(
      `    live flags     : ${summary.flagCount}`,
    );
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  banner("Simulation complete");

  const final = await fetchDaySummary(clientId);

  const { count: entryCount } = await admin
    .from("ledger_entry")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  const { count: openItemCount } = await admin
    .from("open_item")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  const { data: openItems } = await admin
    .from("open_item")
    .select("open_amount_paise")
    .eq("client_id", clientId)
    .not("status", "in", '("settled","written_off")');

  const totalOpenPaise: bigint = (openItems ?? []).reduce(
    (sum: bigint, r: Record<string, unknown>) =>
      sum + BigInt(String(r["open_amount_paise"] ?? 0)),
    0n,
  );

  const { count: allDryRunCount } = await admin
    .from("outreach")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("is_dry_run", true);

  const { count: nonDryRunCount } = await admin
    .from("outreach")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("is_dry_run", false);

  console.log(`\n  Total jobs processed over ${SIMULATION_DAYS} days : ${totalJobsProcessed}`);
  console.log(`  Ledger entries imported                          : ${entryCount ?? 0}`);
  console.log(`  Open items derived                               : ${openItemCount ?? 0}`);
  console.log(`  SUM(open_amount_paise)                           : ${totalOpenPaise}`);
  console.log(`  Final case status                                : ${final.caseStatus ?? "none"}`);
  console.log(`  Outreach rows (dry-run)                          : ${allDryRunCount ?? 0}`);
  console.log(`  Outreach rows (NOT dry-run) — MUST BE 0          : ${nonDryRunCount ?? 0}`);
  console.log(`  Live flags                                        : ${final.flagCount}`);

  if ((nonDryRunCount ?? 0) > 0) {
    console.error("\n  !! ALERT: Non-dry-run outreach rows found. Check the pipeline.");
    process.exit(1);
  }

  console.log("\n  Demo completed successfully. All outreach was dry-run only.");
  console.log(
    "  To inspect results: open Supabase Studio → Tables → outreach, event, flag",
  );
}

main().catch((err) => {
  console.error("\nDemo failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
