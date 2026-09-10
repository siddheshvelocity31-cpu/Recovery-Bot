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

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getAdminClient } from "@/lib/supabase/admin";
import { dispatchOutreach } from "@/lib/outreach/dispatch";

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

const TEST_PREFIX = `dispatch_test_${Date.now()}`;

describe.skipIf(!supabaseReachable)("dispatchOutreach (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  let testClientId: string;
  let testCaseId: string;
  let testOutreachId: string;
  let testImportId: string;
  let testItemId: string;

  beforeAll(async () => {
    // ── Client ───────────────────────────────────────────────────────────
    const { data: client, error: clientErr } = await admin
      .from("client")
      .insert({
        client_code: `${TEST_PREFIX}_CLI`,
        name: "Dispatch Test Client",
        relationship_tier: "new",
        behaviour_band: "unknown",
      })
      .select("id")
      .single();
    if (clientErr) throw clientErr;
    testClientId = client.id as string;

    // ── Ledger import + open item ─────────────────────────────────────────
    const { data: imp, error: impErr } = await admin
      .from("ledger_import")
      .insert({
        client_id: testClientId,
        storage_path: "ledger/dispatch_test.xlsx",
        file_sha256: `sha256_dispatch_${Date.now()}`,
        source_filename: "dispatch_test.xlsx",
        status: "imported",
      })
      .select("id")
      .single();
    if (impErr) throw impErr;
    testImportId = imp.id as string;

    const dueDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: item, error: itemErr } = await admin
      .from("open_item")
      .insert({
        client_id: testClientId,
        ledger_import_id: testImportId,
        source_doc_code: `INV_DISP_${Date.now()}`,
        issue_date: "2026-01-01",
        due_date: dueDate,
        gross_amount_paise: 250000,
        open_amount_paise: 250000,
        credits_applied_paise: 0,
        receipts_applied_paise: 0,
        status: "open",
        is_unaged: false,
      })
      .select("id")
      .single();
    if (itemErr) throw itemErr;
    testItemId = item.id as string;

    // ── Recovery case ─────────────────────────────────────────────────────
    const { data: recoveryCase, error: caseErr } = await admin
      .from("recovery_case")
      .insert({
        client_id: testClientId,
        status: "open",
        current_step_number: 1,
        total_open_paise: 250000,
      })
      .select("id")
      .single();
    if (caseErr) throw caseErr;
    testCaseId = recoveryCase.id as string;

    // ── Outreach row (queued, dry-run) ────────────────────────────────────
    const { data: outreach, error: outreachErr } = await admin
      .from("outreach")
      .insert({
        case_id: testCaseId,
        client_id: testClientId,
        contact_id: null,
        channel: "email",
        cadence_step_number: 1,
        template_key: "reminder_first",
        persona_tone: "courteous",
        rendered_body: "",
        status: "queued",
        idempotency_key: `${testCaseId}:1:${new Date().toISOString().slice(0, 10)}`,
        is_dry_run: true,
        scheduled_for: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (outreachErr) throw outreachErr;
    testOutreachId = outreach.id as string;
  });

  afterAll(async () => {
    if (testClientId) {
      await admin.from("event").delete().eq("client_id", testClientId);
      await admin.from("outreach").delete().eq("client_id", testClientId);
      await admin.from("recovery_case").delete().eq("id", testCaseId);
      await admin.from("open_item").delete().eq("id", testItemId);
      await admin.from("ledger_import").delete().eq("id", testImportId);
      await admin.from("client").delete().eq("id", testClientId);
    }
  });

  // ── Test 1: dispatching sets provider='dry-run', status='sent' ───────────

  it("dispatching a queued outreach row sets is_dry_run=true, provider='dry-run', status='sent'", async () => {
    // Install fetch spy BEFORE dispatch
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await dispatchOutreach(testOutreachId);

    const { data: row, error } = await admin
      .from("outreach")
      .select("status, provider, is_dry_run, rendered_body")
      .eq("id", testOutreachId)
      .single();

    expect(error).toBeNull();
    expect(row.status).toBe("sent");
    expect(row.provider).toBe("dry-run");
    expect(row.is_dry_run).toBe(true);
    expect(typeof row.rendered_body).toBe("string");
    expect(row.rendered_body.length).toBeGreaterThan(0);

    // fetch must never have been called
    const externalCalls = fetchSpy.mock.calls.filter(
      (call) => {
        const urlArg = call[0];
        const urlStr =
          typeof urlArg === "string"
            ? urlArg
            : urlArg instanceof URL
            ? urlArg.toString()
            : urlArg instanceof Request
            ? urlArg.url
            : "";
        // Allow Supabase internal calls — only block external HTTP
        return (
          !urlStr.includes("127.0.0.1") &&
          !urlStr.includes("localhost") &&
          !urlStr.includes("supabase")
        );
      },
    );
    expect(externalCalls.length).toBe(0);

    fetchSpy.mockRestore();
  });

  // ── Test 2: outreach.dry_run event is written with rendered_body ─────────

  it("an outreach.dry_run event is written with rendered_body in payload", async () => {
    const { data: events, error } = await admin
      .from("event")
      .select("type, payload")
      .eq("client_id", testClientId)
      .eq("type", "outreach.dry_run");

    expect(error).toBeNull();
    expect((events ?? []).length).toBeGreaterThanOrEqual(1);

    const evt = (events ?? [])[0] as Record<string, unknown>;
    const payload = evt.payload as Record<string, unknown>;
    expect(typeof payload["rendered_body"]).toBe("string");
    expect(String(payload["rendered_body"]).length).toBeGreaterThan(0);
  });

  // ── Test 3: dispatching same row twice does not create a second event ─────

  it("dispatching the same outreach row twice does not create a second event (idempotent)", async () => {
    // Row is now status='sent' so dispatch is a no-op
    const { count: eventsBefore } = await admin
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("client_id", testClientId)
      .eq("type", "outreach.dry_run");

    await dispatchOutreach(testOutreachId);

    const { count: eventsAfter } = await admin
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("client_id", testClientId)
      .eq("type", "outreach.dry_run");

    // Count must not have increased
    expect(eventsAfter).toBe(eventsBefore);
  });

  // ── Test 4: zero HTTP requests made ──────────────────────────────────────

  it("no external HTTP requests are made during dispatch (fetch spy)", async () => {
    // Insert a second queued outreach row for a fresh dispatch
    const { data: outreach2, error: o2Err } = await admin
      .from("outreach")
      .insert({
        case_id: testCaseId,
        client_id: testClientId,
        contact_id: null,
        channel: "email",
        cadence_step_number: 2,
        template_key: "reminder_second",
        persona_tone: "courteous",
        rendered_body: "",
        status: "queued",
        idempotency_key: `${testCaseId}:2:${new Date().toISOString().slice(0, 10)}_spy`,
        is_dry_run: true,
        scheduled_for: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (o2Err) throw o2Err;

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const callsBefore = fetchSpy.mock.calls.length;

    await dispatchOutreach(outreach2.id as string);

    // Only Supabase-internal calls are acceptable; no real external HTTP.
    const externalCalls = fetchSpy.mock.calls.slice(callsBefore).filter((call) => {
      const urlArg = call[0];
      const urlStr =
        typeof urlArg === "string"
          ? urlArg
          : urlArg instanceof URL
          ? urlArg.toString()
          : urlArg instanceof Request
          ? urlArg.url
          : "";
      return (
        !urlStr.includes("127.0.0.1") &&
        !urlStr.includes("localhost") &&
        !urlStr.includes("supabase")
      );
    });

    expect(externalCalls.length).toBe(0);

    fetchSpy.mockRestore();

    // Cleanup second outreach row
    await admin.from("outreach").delete().eq("id", outreach2.id);
  });
});
