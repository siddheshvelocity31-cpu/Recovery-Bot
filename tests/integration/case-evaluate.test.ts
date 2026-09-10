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
import { evaluateCase } from "@/lib/cases/evaluate";

// ── skip guard ────────────────────────────────────────────────────────────────

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

const TEST_PREFIX = `case_eval_${Date.now()}`;

describe.skipIf(!supabaseReachable)("evaluateCase (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  // Client with open items
  let clientWithItemsId: string;
  let clientWithItemsImportId: string;
  let insertedItemIds: string[] = [];

  // Muted client
  let mutedClientId: string;
  let mutedImportId: string;
  let mutedItemId: string;

  // Client with zero balance
  let zeroClientId: string;

  beforeAll(async () => {
    // ── Client 1: has open items ──────────────────────────────────────────
    const { data: c1, error: c1Err } = await admin
      .from("client")
      .insert({
        client_code: `${TEST_PREFIX}_ITEMS`,
        name: "Case Eval Test Client (Items)",
        relationship_tier: "new",
        behaviour_band: "unknown",
      })
      .select("id")
      .single();
    if (c1Err) throw c1Err;
    clientWithItemsId = c1.id as string;

    const { data: imp1, error: imp1Err } = await admin
      .from("ledger_import")
      .insert({
        client_id: clientWithItemsId,
        storage_path: "ledger/ce_test.xlsx",
        file_sha256: `sha256_ce_test_${Date.now()}`,
        source_filename: "ce_test.xlsx",
        status: "imported",
      })
      .select("id")
      .single();
    if (imp1Err) throw imp1Err;
    clientWithItemsImportId = imp1.id as string;

    // Insert open items (two invoices due in the past)
    const dueDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: items1, error: items1Err } = await admin
      .from("open_item")
      .insert([
        {
          client_id: clientWithItemsId,
          ledger_import_id: clientWithItemsImportId,
          source_doc_code: `INV_CE_A_${Date.now()}`,
          issue_date: "2026-01-01",
          due_date: dueDate,
          gross_amount_paise: 300000,
          open_amount_paise: 300000,
          credits_applied_paise: 0,
          receipts_applied_paise: 0,
          status: "open",
          is_unaged: false,
        },
        {
          client_id: clientWithItemsId,
          ledger_import_id: clientWithItemsImportId,
          source_doc_code: `INV_CE_B_${Date.now()}`,
          issue_date: "2026-01-15",
          due_date: dueDate,
          gross_amount_paise: 200000,
          open_amount_paise: 200000,
          credits_applied_paise: 0,
          receipts_applied_paise: 0,
          status: "open",
          is_unaged: false,
        },
      ])
      .select("id");
    if (items1Err) throw items1Err;
    insertedItemIds = (items1 ?? []).map((r: Record<string, unknown>) => r.id as string);

    // ── Client 2: muted client ────────────────────────────────────────────
    const mutedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: c2, error: c2Err } = await admin
      .from("client")
      .insert({
        client_code: `${TEST_PREFIX}_MUTED`,
        name: "Case Eval Test Client (Muted)",
        relationship_tier: "new",
        behaviour_band: "unknown",
        is_muted: true,
        muted_until: mutedUntil,
      })
      .select("id")
      .single();
    if (c2Err) throw c2Err;
    mutedClientId = c2.id as string;

    const { data: imp2, error: imp2Err } = await admin
      .from("ledger_import")
      .insert({
        client_id: mutedClientId,
        storage_path: "ledger/ce_muted.xlsx",
        file_sha256: `sha256_ce_muted_${Date.now()}`,
        source_filename: "ce_muted.xlsx",
        status: "imported",
      })
      .select("id")
      .single();
    if (imp2Err) throw imp2Err;
    mutedImportId = imp2.id as string;

    const { data: mi, error: miErr } = await admin
      .from("open_item")
      .insert({
        client_id: mutedClientId,
        ledger_import_id: mutedImportId,
        source_doc_code: `INV_MUTED_${Date.now()}`,
        issue_date: "2026-01-01",
        due_date: dueDate,
        gross_amount_paise: 150000,
        open_amount_paise: 150000,
        credits_applied_paise: 0,
        receipts_applied_paise: 0,
        status: "open",
        is_unaged: false,
      })
      .select("id")
      .single();
    if (miErr) throw miErr;
    mutedItemId = mi.id as string;

    // ── Client 3: zero-balance client (no open items) ─────────────────────
    const { data: c3, error: c3Err } = await admin
      .from("client")
      .insert({
        client_code: `${TEST_PREFIX}_ZERO`,
        name: "Case Eval Test Client (Zero)",
        relationship_tier: "new",
        behaviour_band: "unknown",
      })
      .select("id")
      .single();
    if (c3Err) throw c3Err;
    zeroClientId = c3.id as string;
  });

  afterAll(async () => {
    // Clean up: events, outreach, recovery_case, open_items, ledger_imports, clients
    for (const clientId of [clientWithItemsId, mutedClientId, zeroClientId]) {
      if (!clientId) continue;
      await admin.from("outreach").delete().eq("client_id", clientId);
      await admin.from("event").delete().eq("client_id", clientId);
      await admin.from("recovery_case").delete().eq("client_id", clientId);
    }

    if (insertedItemIds.length > 0) {
      await admin.from("open_item").delete().in("id", insertedItemIds);
    }
    if (mutedItemId) await admin.from("open_item").delete().eq("id", mutedItemId);

    if (clientWithItemsImportId)
      await admin.from("ledger_import").delete().eq("id", clientWithItemsImportId);
    if (mutedImportId)
      await admin.from("ledger_import").delete().eq("id", mutedImportId);

    for (const clientId of [clientWithItemsId, mutedClientId, zeroClientId]) {
      if (clientId) await admin.from("client").delete().eq("id", clientId);
    }
  });

  // ── Test 1: open items → exactly one recovery_case ───────────────────────

  it("calling evaluateCase for a client with open items opens exactly one recovery_case", async () => {
    await evaluateCase(clientWithItemsId, new Date());

    const { data: cases, error } = await admin
      .from("recovery_case")
      .select("id, status")
      .eq("client_id", clientWithItemsId)
      .not("status", "eq", "resolved");

    expect(error).toBeNull();
    expect((cases ?? []).length).toBe(1);
    expect((cases ?? [])[0]!.status).not.toBe("resolved");
  });

  // ── Test 2: calling again creates no second case (idempotent) ────────────

  it("calling evaluateCase again for same client does not create a second case", async () => {
    await evaluateCase(clientWithItemsId, new Date());

    const { data: cases, error } = await admin
      .from("recovery_case")
      .select("id")
      .eq("client_id", clientWithItemsId)
      .not("status", "eq", "resolved");

    expect(error).toBeNull();
    expect((cases ?? []).length).toBe(1);
  });

  // ── Test 3: outreach row has is_dry_run=true and status='queued' ─────────

  it("after evaluation, any created outreach row has is_dry_run=true and status='queued'", async () => {
    const { data: outreachRows, error } = await admin
      .from("outreach")
      .select("is_dry_run, status")
      .eq("client_id", clientWithItemsId);

    expect(error).toBeNull();
    // If an outreach row was created it must be dry-run and queued
    for (const row of outreachRows ?? []) {
      expect(row.is_dry_run).toBe(true);
      expect(row.status).toBe("queued");
    }
  });

  // ── Test 4: muted client → suppressed event, no outreach row ────────────

  it("muted client produces outreach.suppressed event path and no outreach row", async () => {
    await evaluateCase(mutedClientId, new Date());

    // Case should be suppressed
    const { data: cases } = await admin
      .from("recovery_case")
      .select("status")
      .eq("client_id", mutedClientId)
      .maybeSingle();

    // A suppressed client case transitions to 'suppressed' status
    expect(cases?.status).toBe("suppressed");

    // No queued outreach rows for the muted client
    const { data: outreachRows } = await admin
      .from("outreach")
      .select("id, status")
      .eq("client_id", mutedClientId);

    const queued = (outreachRows ?? []).filter(
      (r: Record<string, unknown>) => r.status === "queued",
    );
    expect(queued.length).toBe(0);
  });

  // ── Test 5: zero balance client resolves the case ────────────────────────

  it("client with total_open_paise=0 creates a case that resolves", async () => {
    await evaluateCase(zeroClientId, new Date());

    // Zero-balance client: case should be opened and immediately resolved
    const { data: cases } = await admin
      .from("recovery_case")
      .select("id, status")
      .eq("client_id", zeroClientId);

    expect((cases ?? []).length).toBeGreaterThanOrEqual(1);
    // The case must be resolved (zero balance → nothing to collect)
    const resolved = (cases ?? []).filter(
      (c: Record<string, unknown>) => c.status === "resolved",
    );
    expect(resolved.length).toBeGreaterThanOrEqual(1);
  });
});
