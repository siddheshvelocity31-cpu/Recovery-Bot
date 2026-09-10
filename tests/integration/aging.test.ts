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
} catch {
  // .env.local does not exist; env vars may be set externally
}

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminClient } from "@/lib/supabase/admin";
import { handleAgingRecompute } from "@/lib/jobs/handlers/aging-recompute";
import type { Job } from "@/lib/jobs/queue";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal job-shaped object for aging-recompute with a client_id payload. */
function makeAgingJob(clientId: string): Job {
  return {
    id: "test-aging-job",
    kind: "aging.recompute",
    payload: { client_id: clientId },
    run_after: new Date().toISOString(),
    status: "running",
    attempts: 1,
    max_attempts: 3,
    locked_at: new Date().toISOString(),
    locked_by: "test",
    last_error: null,
    dedupe_key: null,
    completed_at: null,
  };
}

// ── skip guard ────────────────────────────────────────────────────────────────
// We perform a lightweight health ping before running tests. If the local
// Supabase is not running the describe block is skipped so CI stays clean.

let supabaseReachable = false;

try {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  if (url) {
    const res = await fetch(`${url}/rest/v1/`).catch(() => null);
    supabaseReachable = res !== null && res.status < 500;
  }
} catch {
  supabaseReachable = false;
}

// ── test data ─────────────────────────────────────────────────────────────────

const TEST_PREFIX = `aging_test_${Date.now()}`;

describe.skipIf(!supabaseReachable)("aging recompute (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  let testClientId: string;
  let testImportId: string;
  let openItemId: string;
  let bfItemId: string;

  beforeAll(async () => {
    // Create a test client
    const { data: client, error: clientErr } = await admin
      .from("client")
      .insert({
        client_code: `${TEST_PREFIX}_CLI`,
        name: "Aging Test Client",
        relationship_tier: "new",
        behaviour_band: "unknown",
      })
      .select("id")
      .single();

    if (clientErr) throw clientErr;
    testClientId = client.id as string;

    // Create a ledger import
    const { data: imp, error: impErr } = await admin
      .from("ledger_import")
      .insert({
        client_id: testClientId,
        storage_path: "ledger/aging_test.xlsx",
        file_sha256: `sha256_aging_test_${Date.now()}`,
        source_filename: "aging_test.xlsx",
        status: "imported",
      })
      .select("id")
      .single();

    if (impErr) throw impErr;
    testImportId = imp.id as string;

    // Insert a normal (aged) open item due 45 days ago → d31_60 bucket
    const due45DaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: item, error: itemErr } = await admin
      .from("open_item")
      .insert({
        client_id: testClientId,
        ledger_import_id: testImportId,
        source_doc_code: `INV_AGING_${Date.now()}`,
        issue_date: "2026-01-01",
        due_date: due45DaysAgo,
        gross_amount_paise: 500000,
        open_amount_paise: 500000,
        credits_applied_paise: 0,
        receipts_applied_paise: 0,
        status: "open",
        is_unaged: false,
      })
      .select("id")
      .single();

    if (itemErr) throw itemErr;
    openItemId = item.id as string;

    // Insert a B/F (is_unaged=true) open item — no due date
    const { data: bfItem, error: bfErr } = await admin
      .from("open_item")
      .insert({
        client_id: testClientId,
        ledger_import_id: testImportId,
        source_doc_code: `BF_${Date.now()}`,
        issue_date: "2025-04-01",
        due_date: null,
        gross_amount_paise: 200000,
        open_amount_paise: 200000,
        credits_applied_paise: 0,
        receipts_applied_paise: 0,
        status: "open",
        is_unaged: true,
      })
      .select("id")
      .single();

    if (bfErr) throw bfErr;
    bfItemId = bfItem.id as string;
  });

  afterAll(async () => {
    if (openItemId) await admin.from("open_item").delete().eq("id", openItemId);
    if (bfItemId) await admin.from("open_item").delete().eq("id", bfItemId);
    if (testImportId)
      await admin.from("ledger_import").delete().eq("id", testImportId);
    if (testClientId)
      await admin.from("client").delete().eq("id", testClientId);
  });

  // ── Test 1: Normal item gets correct bucket ──────────────────────────────

  it("normal open item with known due_date gets correct aging_bucket after recompute", async () => {
    const job = makeAgingJob(testClientId);
    await handleAgingRecompute(job);

    const { data: row, error } = await admin
      .from("open_item")
      .select("aging_bucket")
      .eq("id", openItemId)
      .single();

    expect(error).toBeNull();
    // Item due 45 days ago → d31_60
    expect(row.aging_bucket).toBe("d31_60");
  });

  // ── Test 2: B/F item stays 'unknown' ────────────────────────────────────

  it("B/F item (is_unaged=true) stays 'unknown' after recompute", async () => {
    const job = makeAgingJob(testClientId);
    await handleAgingRecompute(job);

    const { data: row, error } = await admin
      .from("open_item")
      .select("aging_bucket")
      .eq("id", bfItemId)
      .single();

    expect(error).toBeNull();
    expect(row.aging_bucket).toBe("unknown");
  });

  // ── Test 3: Idempotent — running twice gives same result ─────────────────

  it("running recompute twice on the same date produces the same bucket (idempotent)", async () => {
    const job = makeAgingJob(testClientId);

    await handleAgingRecompute(job);
    const { data: first } = await admin
      .from("open_item")
      .select("aging_bucket")
      .eq("id", openItemId)
      .single();

    await handleAgingRecompute(job);
    const { data: second } = await admin
      .from("open_item")
      .select("aging_bucket")
      .eq("id", openItemId)
      .single();

    expect(first.aging_bucket).toBe(second.aging_bucket);
    // Both must be a deterministic non-null value
    expect(second.aging_bucket).toBeTruthy();
  });
});
