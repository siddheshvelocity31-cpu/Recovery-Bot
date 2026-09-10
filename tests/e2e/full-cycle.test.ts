/**
 * E2E smoke test — full recovery pipeline cycle.
 *
 * Requires a fully seeded local Supabase (npx supabase db reset).
 * The describe block is skipped with describe.skip so CI stays green.
 *
 * To run locally:
 *   npx supabase start
 *   npx supabase db reset
 *   npm run test:e2e
 *
 * Key assertions (must ALL pass to declare the system safe to demo):
 *  - ledger_entry count >= 108 for Olectra after import
 *  - open_item count = 104 for Olectra after derive
 *  - SUM(open_amount_paise) = 669766100n
 *  - Exactly one non-resolved recovery_case for Olectra
 *  - All outreach rows have is_dry_run=true
 *  - No outreach row has provider other than 'dry-run' or null
 *  - One unaged_balance flag (grey), zero aged_debt flag on the B/F item
 *  - Event trail contains: ledger.imported, open_item.created, case.opened
 *  - Global fetch spy: never called during the entire run
 */

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

import { describe, it, expect, beforeAll, vi } from "vitest";
import { getAdminClient } from "@/lib/supabase/admin";
import { evaluateCase } from "@/lib/cases/evaluate";
import { evaluateClientFlags } from "@/lib/flags/evaluate";
import { dispatchOutreach } from "@/lib/outreach/dispatch";
import { handleAgingRecompute } from "@/lib/jobs/handlers/aging-recompute";
import { handleDeriveOpenItems } from "@/lib/jobs/handlers/ledger-derive-open-items";
import type { Job } from "@/lib/jobs/queue";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventRow {
  type: string;
  payload: Record<string, unknown>;
  client_id: string;
}

interface OutreachRow {
  id: string;
  is_dry_run: boolean;
  provider: string | null;
  status: string;
}

interface FlagRow {
  id: string;
  rule: string;
  severity: string;
  resolved_at: string | null;
}

interface CaseRow {
  id: string;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(kind: string, payload: Record<string, unknown>): Job {
  return {
    id: `e2e-job-${kind}-${Date.now()}`,
    kind,
    payload,
    run_after: new Date().toISOString(),
    status: "running",
    attempts: 1,
    max_attempts: 3,
    locked_at: new Date().toISOString(),
    locked_by: "e2e-test",
    last_error: null,
    dedupe_key: null,
    completed_at: null,
  };
}

// ── Full cycle test ──────────────────────────────────────────────────────────
// Uses describe.skip — remove 'skip' to run locally when Supabase is running.

describe.skip("E2E: full recovery pipeline cycle (Olectra)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  // Install global fetch spy BEFORE any other code runs in this describe block.
  // This is the most important assertion: zero real HTTP calls during the cycle.
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  let olectraClientId: string;
  let importId: string;

  // ── beforeAll: build state from seed ──────────────────────────────────────

  beforeAll(async () => {
    // Resolve Olectra client (seeded by supabase/seed.sql)
    const { data: clientRow, error: clientErr } = await admin
      .from("client")
      .select("id, name")
      .eq("client_code", "OL000001")
      .single();

    if (clientErr)
      throw new Error(
        `Olectra client not found. Did you run 'npx supabase db reset'? Error: ${clientErr.message}`,
      );

    olectraClientId = clientRow.id as string;

    // ── Import: create ledger_import row ──────────────────────────────────
    // In this test we insert a ledger_import row and then call the handlers
    // directly. The fixture XLSX is read by the parse handler from disk.
    const { data: importRow, error: importErr } = await admin
      .from("ledger_import")
      .insert({
        client_id: olectraClientId,
        storage_path: `ledger/OL000001/Olectra_Client_Ledger_Report.xlsx`,
        file_sha256: `e2e_sha256_${Date.now()}`,
        source_filename: "Olectra_Client_Ledger_Report.xlsx",
        status: "pending",
      })
      .select("id")
      .single();

    if (importErr) throw importErr;
    importId = importRow.id as string;

    // Write ledger.imported event (simulates what the upload handler does)
    await admin.from("event").insert({
      client_id: olectraClientId,
      actor_type: "system",
      type: "ledger.imported",
      payload: { import_id: importId },
      occurred_at: new Date().toISOString(),
    });

    // ── Derive open items ─────────────────────────────────────────────────
    // deriveOpenItems reads from ledger_entry — seed data should have entries
    // for OL000001. If the parse handler inserted entries, this step derives
    // open items from them.
    try {
      await handleDeriveOpenItems(
        makeJob("ledger.derive_open_items", {
          import_id: importId,
          client_id: olectraClientId,
        }),
      );
    } catch (err) {
      // If derive fails (e.g. no ledger entries from parse), log and continue.
      // The open_item count assertion below will catch the real failure.
      console.warn("[e2e] handleDeriveOpenItems failed:", err instanceof Error ? err.message : String(err));
    }

    // ── Aging recompute ───────────────────────────────────────────────────
    await handleAgingRecompute(
      makeJob("aging.recompute", { client_id: olectraClientId }),
    );

    // ── Case evaluation ───────────────────────────────────────────────────
    await evaluateCase(olectraClientId, new Date());

    // ── Flag evaluation ───────────────────────────────────────────────────
    await evaluateClientFlags(olectraClientId, new Date());

    // ── Dispatch any queued outreach ──────────────────────────────────────
    const { data: queuedOutreach } = await admin
      .from("outreach")
      .select("id")
      .eq("client_id", olectraClientId)
      .eq("status", "queued");

    for (const row of queuedOutreach ?? []) {
      await dispatchOutreach(row.id as string);
    }
  });

  // ── Assertion 1: ledger_entry count >= 108 ────────────────────────────────

  it("ledger_entry count >= 108 for Olectra after import", async () => {
    const { count, error } = await admin
      .from("ledger_entry")
      .select("id", { count: "exact", head: true })
      .eq("client_id", olectraClientId);

    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(108);
  });

  // ── Assertion 2: open_item count = 104 ───────────────────────────────────

  it("open_item count = 104 for Olectra after derive-open-items", async () => {
    const { count, error } = await admin
      .from("open_item")
      .select("id", { count: "exact", head: true })
      .eq("client_id", olectraClientId);

    expect(error).toBeNull();
    expect(count).toBe(104);
  });

  // ── Assertion 3: SUM(open_amount_paise) = 669766100n ─────────────────────

  it("SUM(open_amount_paise) = 669766100n (₹66,97,661.00) for Olectra", async () => {
    const { data: items, error } = await admin
      .from("open_item")
      .select("open_amount_paise")
      .eq("client_id", olectraClientId)
      .not("status", "in", '("settled","written_off")');

    expect(error).toBeNull();

    const total: bigint = (items ?? []).reduce(
      (sum: bigint, r: Record<string, unknown>) =>
        sum + BigInt(String(r["open_amount_paise"] ?? 0)),
      0n,
    );

    expect(total).toBe(669766100n);
  });

  // ── Assertion 4: exactly one non-resolved recovery_case ──────────────────

  it("exactly one non-resolved recovery_case exists for Olectra", async () => {
    const { data: cases, error } = await admin
      .from("recovery_case")
      .select("id, status")
      .eq("client_id", olectraClientId)
      .not("status", "eq", "resolved") as { data: CaseRow[] | null; error: unknown };

    expect(error).toBeNull();
    expect((cases ?? []).length).toBe(1);
  });

  // ── Assertion 5: all outreach rows have is_dry_run=true ──────────────────

  it("all outreach rows for Olectra have is_dry_run=true", async () => {
    const { data: rows, error } = await admin
      .from("outreach")
      .select("id, is_dry_run")
      .eq("client_id", olectraClientId) as { data: OutreachRow[] | null; error: unknown };

    expect(error).toBeNull();
    expect((rows ?? []).length).toBeGreaterThan(0);

    for (const row of rows ?? []) {
      expect(row.is_dry_run).toBe(true);
    }
  });

  // ── Assertion 6: no outreach row has provider other than 'dry-run' or null ─

  it("no outreach row has provider other than 'dry-run' or null", async () => {
    const { data: rows, error } = await admin
      .from("outreach")
      .select("id, provider")
      .eq("client_id", olectraClientId) as { data: OutreachRow[] | null; error: unknown };

    expect(error).toBeNull();

    for (const row of rows ?? []) {
      expect(row.provider === null || row.provider === "dry-run").toBe(true);
    }
  });

  // ── Assertion 7a: one unaged_balance flag (grey) ─────────────────────────

  it("exactly one unaged_balance flag with severity='grey' exists for Olectra", async () => {
    const { data: flags, error } = await admin
      .from("flag")
      .select("id, rule, severity, resolved_at")
      .eq("client_id", olectraClientId)
      .eq("rule", "unaged_balance")
      .is("resolved_at", null) as { data: FlagRow[] | null; error: unknown };

    expect(error).toBeNull();
    expect((flags ?? []).length).toBe(1);
    expect((flags ?? [])[0]!.severity).toBe("grey");
  });

  // ── Assertion 7b: no aged_debt flag on the B/F item ─────────────────────

  it("no aged_debt flag exists referencing the B/F open item", async () => {
    // B/F items have is_unaged=true — the aged_debt rule skips them.
    const { data: bfItems } = await admin
      .from("open_item")
      .select("id")
      .eq("client_id", olectraClientId)
      .eq("is_unaged", true);

    const bfIds = (bfItems ?? []).map((i: Record<string, unknown>) => i.id as string);

    if (bfIds.length === 0) {
      // No B/F items in this fixture → assertion trivially passes
      return;
    }

    const { data: agedDebtFlags, error } = await admin
      .from("flag")
      .select("id, rule, open_item_id")
      .eq("client_id", olectraClientId)
      .eq("rule", "aged_debt")
      .in("open_item_id", bfIds)
      .is("resolved_at", null);

    expect(error).toBeNull();
    expect((agedDebtFlags ?? []).length).toBe(0);
  });

  // ── Assertion 8: event trail completeness ────────────────────────────────

  it("event trail contains ledger.imported, open_item.created, case.opened", async () => {
    const { data: events, error } = await admin
      .from("event")
      .select("type")
      .eq("client_id", olectraClientId) as { data: EventRow[] | null; error: unknown };

    expect(error).toBeNull();

    const types = new Set((events ?? []).map((e) => e.type));

    expect(types.has("ledger.imported")).toBe(true);
    expect(types.has("open_item.created")).toBe(true);
    expect(types.has("case.opened")).toBe(true);
  });

  // ── Assertion 9: global fetch spy was never called with real external URLs ─

  it("global fetch spy was NEVER called with an external URL during the entire run", () => {
    const externalCalls = fetchSpy.mock.calls.filter((call) => {
      const urlArg = call[0];
      const urlStr =
        typeof urlArg === "string"
          ? urlArg
          : urlArg instanceof URL
          ? urlArg.toString()
          : urlArg instanceof Request
          ? urlArg.url
          : "";
      // Supabase local (127.0.0.1 / localhost) calls are acceptable.
      // Any other host means a real outbound request slipped through.
      return (
        urlStr.length > 0 &&
        !urlStr.includes("127.0.0.1") &&
        !urlStr.includes("localhost") &&
        !urlStr.includes("supabase") &&
        !urlStr.includes("kong") // Supabase local docker gateway
      );
    });

    if (externalCalls.length > 0) {
      console.error(
        "External fetch calls detected:",
        externalCalls.map((c) => c[0]),
      );
    }

    expect(externalCalls.length).toBe(0);
  });
});
