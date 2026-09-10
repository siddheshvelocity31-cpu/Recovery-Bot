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
import { evaluateClientFlags } from "@/lib/flags/evaluate";

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

const TEST_PREFIX = `flags_test_${Date.now()}`;

describe.skipIf(!supabaseReachable)("evaluateClientFlags (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  // Client with only a B/F (is_unaged) item
  let bfClientId: string;
  let bfImportId: string;
  let bfItemId: string;

  beforeAll(async () => {
    // ── Client with only a B/F item ───────────────────────────────────────
    const { data: client, error: clientErr } = await admin
      .from("client")
      .insert({
        client_code: `${TEST_PREFIX}_BF`,
        name: "Flags Test Client (BF)",
        relationship_tier: "new",
        behaviour_band: "unknown",
      })
      .select("id")
      .single();
    if (clientErr) throw clientErr;
    bfClientId = client.id as string;

    const { data: imp, error: impErr } = await admin
      .from("ledger_import")
      .insert({
        client_id: bfClientId,
        storage_path: "ledger/flags_test.xlsx",
        file_sha256: `sha256_flags_test_${Date.now()}`,
        source_filename: "flags_test.xlsx",
        status: "imported",
      })
      .select("id")
      .single();
    if (impErr) throw impErr;
    bfImportId = imp.id as string;

    // A B/F open item — is_unaged=true, no due_date
    const { data: bfItem, error: bfErr } = await admin
      .from("open_item")
      .insert({
        client_id: bfClientId,
        ledger_import_id: bfImportId,
        source_doc_code: `BF_FLAGS_${Date.now()}`,
        issue_date: "2025-04-01",
        due_date: null,
        gross_amount_paise: 400000,
        open_amount_paise: 400000,
        credits_applied_paise: 0,
        receipts_applied_paise: 0,
        status: "open",
        is_unaged: true,
        aging_bucket: "unknown",
      })
      .select("id")
      .single();
    if (bfErr) throw bfErr;
    bfItemId = bfItem.id as string;
  });

  afterAll(async () => {
    if (bfClientId) {
      await admin.from("event").delete().eq("client_id", bfClientId);
      await admin.from("flag").delete().eq("client_id", bfClientId);
      await admin.from("open_item").delete().eq("id", bfItemId);
      await admin.from("ledger_import").delete().eq("id", bfImportId);
      await admin.from("client").delete().eq("id", bfClientId);
    }
  });

  // ── Test 1: only B/F item → exactly one unaged_balance (grey), zero aged_debt ─

  it("client with only B/F open item raises exactly one unaged_balance flag (severity grey) and zero aged_debt flags", async () => {
    await evaluateClientFlags(bfClientId, new Date());

    const { data: allFlags, error } = await admin
      .from("flag")
      .select("rule, severity, resolved_at")
      .eq("client_id", bfClientId)
      .is("resolved_at", null);

    expect(error).toBeNull();

    const unagedFlags = (allFlags ?? []).filter(
      (f: Record<string, unknown>) => f.rule === "unaged_balance",
    );
    const agedDebtFlags = (allFlags ?? []).filter(
      (f: Record<string, unknown>) => f.rule === "aged_debt",
    );

    expect(unagedFlags.length).toBe(1);
    expect(unagedFlags[0]!.severity).toBe("grey");
    expect(agedDebtFlags.length).toBe(0);
  });

  // ── Test 2: running 3 times leaves exactly one live flag per dedupe_key ───

  it("running flag evaluation 3 times leaves exactly one live flag per dedupe_key", async () => {
    // Run two more times (first run was in test 1)
    await evaluateClientFlags(bfClientId, new Date());
    await evaluateClientFlags(bfClientId, new Date());

    const { data: liveFlags, error } = await admin
      .from("flag")
      .select("dedupe_key")
      .eq("client_id", bfClientId)
      .is("resolved_at", null);

    expect(error).toBeNull();

    // Dedupe keys must be unique among live flags
    const keys = (liveFlags ?? []).map((f: Record<string, unknown>) => f.dedupe_key as string);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
    // Still exactly one unaged_balance flag
    expect(keys.length).toBe(1);
  });

  // ── Test 3: condition clears → flag auto-resolves + flag.resolved event ──

  it("when condition clears, re-evaluation auto-resolves the flag and writes flag.resolved event", async () => {
    // Mark the B/F item as settled so total_open_paise drops to 0
    const { error: updateErr } = await admin
      .from("open_item")
      .update({ status: "settled", open_amount_paise: 0 })
      .eq("id", bfItemId);
    expect(updateErr).toBeNull();

    await evaluateClientFlags(bfClientId, new Date());

    // All flags for this client should now be resolved
    const { data: liveFlags, error: lfErr } = await admin
      .from("flag")
      .select("id, resolved_at")
      .eq("client_id", bfClientId)
      .is("resolved_at", null);

    expect(lfErr).toBeNull();
    expect((liveFlags ?? []).length).toBe(0);

    // A flag.resolved event must have been written
    const { data: resolvedEvents, error: evErr } = await admin
      .from("event")
      .select("type, payload")
      .eq("client_id", bfClientId)
      .eq("type", "flag.resolved");

    expect(evErr).toBeNull();
    expect((resolvedEvents ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
