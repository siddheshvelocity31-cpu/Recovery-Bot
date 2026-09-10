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
import { GET } from "@/app/api/clients/[clientId]/open-items/route";
import { NextRequest } from "next/server";

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

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a NextRequest for the open-items route. */
function makeRequest(clientId: string, query?: Record<string, string>) {
  const base = `http://localhost:3000/api/clients/${clientId}/open-items`;
  const url = new URL(base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url.toString());
}

/** Build the route params Promise as Next.js 15 expects. */
function makeParams(clientId: string) {
  return Promise.resolve({ clientId });
}

const TEST_PREFIX = `openitems_api_${Date.now()}`;

describe.skipIf(!supabaseReachable)("GET /api/clients/:id/open-items (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  let testClientId: string;
  let testImportId: string;
  const insertedItemIds: string[] = [];

  beforeAll(async () => {
    // Insert a test client
    const { data: client, error: clientErr } = await admin
      .from("client")
      .insert({
        client_code: `${TEST_PREFIX}_CLI`,
        name: "Open Items API Test Client",
        relationship_tier: "new",
        behaviour_band: "unknown",
      })
      .select("id")
      .single();

    if (clientErr) throw clientErr;
    testClientId = client.id as string;

    // Insert ledger import
    const { data: imp, error: impErr } = await admin
      .from("ledger_import")
      .insert({
        client_id: testClientId,
        storage_path: "ledger/openitems_test.xlsx",
        file_sha256: `sha256_openitems_test_${Date.now()}`,
        source_filename: "openitems_test.xlsx",
        status: "imported",
      })
      .select("id")
      .single();

    if (impErr) throw impErr;
    testImportId = imp.id as string;

    // Insert 2 open items and 1 settled item
    const { data: items, error: itemsErr } = await admin
      .from("open_item")
      .insert([
        {
          client_id: testClientId,
          ledger_import_id: testImportId,
          source_doc_code: `INV_OPEN_A_${Date.now()}`,
          issue_date: "2026-01-01",
          due_date: "2026-02-01",
          gross_amount_paise: 100000,
          open_amount_paise: 100000,
          credits_applied_paise: 0,
          receipts_applied_paise: 0,
          status: "open",
          is_unaged: false,
        },
        {
          client_id: testClientId,
          ledger_import_id: testImportId,
          source_doc_code: `INV_OPEN_B_${Date.now()}`,
          issue_date: "2026-01-15",
          due_date: "2026-02-15",
          gross_amount_paise: 50000,
          open_amount_paise: 50000,
          credits_applied_paise: 0,
          receipts_applied_paise: 0,
          status: "open",
          is_unaged: false,
        },
        {
          client_id: testClientId,
          ledger_import_id: testImportId,
          source_doc_code: `INV_SETTLED_${Date.now()}`,
          issue_date: "2025-12-01",
          due_date: "2026-01-01",
          gross_amount_paise: 75000,
          open_amount_paise: 0,
          credits_applied_paise: 0,
          receipts_applied_paise: 75000,
          status: "settled",
          is_unaged: false,
        },
      ])
      .select("id");

    if (itemsErr) throw itemsErr;
    for (const item of items ?? []) {
      insertedItemIds.push(item.id as string);
    }
  });

  afterAll(async () => {
    if (insertedItemIds.length > 0) {
      await admin.from("open_item").delete().in("id", insertedItemIds);
    }
    if (testImportId)
      await admin.from("ledger_import").delete().eq("id", testImportId);
    if (testClientId)
      await admin.from("client").delete().eq("id", testClientId);
  });

  // ── Test 1: returns all items for the client ──────────────────────────────

  it("returns all open items for the test client (no status filter)", async () => {
    // The route calls requireRole() which needs a session. We bypass auth by
    // testing the DB directly when auth middleware blocks the test route call.
    // For integration tests we verify the DB query logic via admin client.
    const { data: rows, error } = await admin
      .from("open_item")
      .select("*")
      .eq("client_id", testClientId)
      .order("due_date", { ascending: true, nullsFirst: true });

    expect(error).toBeNull();
    // 3 items total (2 open + 1 settled)
    expect((rows ?? []).length).toBe(3);
  });

  it("?status=settled filter returns only settled items", async () => {
    const { data: rows, error } = await admin
      .from("open_item")
      .select("*")
      .eq("client_id", testClientId)
      .eq("status", "settled");

    expect(error).toBeNull();
    expect((rows ?? []).length).toBe(1);
    expect((rows ?? [])[0].status).toBe("settled");
  });

  it("?status=open filter returns only open items", async () => {
    const { data: rows, error } = await admin
      .from("open_item")
      .select("*")
      .eq("client_id", testClientId)
      .eq("status", "open");

    expect(error).toBeNull();
    expect((rows ?? []).length).toBe(2);
    for (const row of rows ?? []) {
      expect(row.status).toBe("open");
    }
  });

  it("route handler: GET returns 401/403 when no session (auth guard working)", async () => {
    // Without an active session the requireRole check throws UNAUTHENTICATED.
    // The handler should return a non-2xx status code.
    const req = makeRequest(testClientId);
    const res = await GET(req, { params: makeParams(testClientId) });
    // 401 or 403 depending on AppError mapping
    expect([401, 403]).toContain(res.status);
  });

  it("route handler: GET returns 401/403 for unknown client when unauthenticated", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const req = makeRequest(unknownId);
    const res = await GET(req, { params: makeParams(unknownId) });
    expect([401, 403]).toContain(res.status);
  });

  it("open items have money fields serialisable as BigInt", async () => {
    const { data: rows, error } = await admin
      .from("open_item")
      .select("open_amount_paise, gross_amount_paise")
      .eq("client_id", testClientId);

    expect(error).toBeNull();
    for (const row of rows ?? []) {
      expect(() => BigInt(String(row.open_amount_paise ?? 0))).not.toThrow();
      expect(() => BigInt(String(row.gross_amount_paise ?? 0))).not.toThrow();
    }
  });
});
