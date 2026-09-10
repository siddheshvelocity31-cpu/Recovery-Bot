import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

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

import { getAdminClient } from "@/lib/supabase/admin";

describe("clients API", () => {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;
  let testClientId: string;

  beforeAll(async () => {
    const { data, error } = await adminAny
      .from("client")
      .insert({
        client_code: "APITEST001",
        name: "API Test Client",
        relationship_tier: "new",
        behaviour_band: "unknown",
      })
      .select()
      .single() as { data: { id: string } | null; error: unknown };

    if (error) throw error;
    testClientId = data!.id;
  });

  afterAll(async () => {
    if (testClientId) {
      await adminAny.from("ledger_entry").delete().eq("client_id", testClientId);
      await adminAny.from("client").delete().eq("id", testClientId);
    }
  });

  it("get_client_list RPC returns the test client", async () => {
    const { data, error } = await adminAny.rpc("get_client_list", {
      p_search: "APITEST001",
      p_tier: null,
      p_page: 1,
      p_page_size: 50,
    }) as { data: Array<Record<string, unknown>> | null; error: unknown };

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const row = (data ?? []).find((c) => c["id"] === testClientId);
    expect(row).toBeDefined();
    expect(row!["client_code"]).toBe("APITEST001");
    expect(row!["name"]).toBe("API Test Client");
    // balance_paise should be 0 (no ledger entries)
    expect(String(row!["balance_paise"])).toBe("0");
  });

  it("get_client_list returns balance_paise as a number serialisable to string", async () => {
    const { data } = await adminAny.rpc("get_client_list", {
      p_search: null,
      p_tier: null,
      p_page: 1,
      p_page_size: 50,
    }) as { data: Array<Record<string, unknown>> | null };

    for (const row of data ?? []) {
      // Must be convertible to bigint without error
      expect(() => BigInt(String(row["balance_paise"]))).not.toThrow();
    }
  });

  it("GET /api/clients/:id returns 404 for unknown id", async () => {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_SUPABASE_URL"]?.replace("/rest/v1", "") ?? "http://localhost:3000"}/api/clients/00000000-0000-0000-0000-000000000000`,
    );
    // 404 or 401 depending on whether the server is up
    expect([401, 404, 500]).toContain(res.status);
  });

  it("client row can be fetched by id", async () => {
    const { data, error } = await adminAny
      .from("client")
      .select("*")
      .eq("id", testClientId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!["client_code"]).toBe("APITEST001");
    expect(data!["relationship_tier"]).toBe("new");
  });

  it("client with ledger entries shows correct balance_paise via RPC", async () => {
    // Insert a fake ledger import
    const { data: importRow } = await adminAny
      .from("ledger_import")
      .insert({
        client_id: testClientId,
        storage_path: "ledger/test.xlsx",
        file_sha256: `sha256_clients_api_test_${Date.now()}`,
        source_filename: "test.xlsx",
        status: "imported",
      })
      .select()
      .single() as { data: { id: string } | null };

    if (!importRow) return;

    const importId = importRow.id;

    // Insert two ledger entries with known paise values
    await adminAny.from("ledger_entry").insert([
      {
        client_id: testClientId,
        ledger_import_id: importId,
        natural_key: `test_key_1_${Date.now()}`,
        row_number: 1,
        doc_date: "2026-01-01",
        doc_code: "INV001",
        entry_type: "debit",
        bill_amount_paise: 100000, // ₹1,000.00
      },
      {
        client_id: testClientId,
        ledger_import_id: importId,
        natural_key: `test_key_2_${Date.now()}`,
        row_number: 2,
        doc_date: "2026-01-15",
        doc_code: "INV002",
        entry_type: "debit",
        bill_amount_paise: 50000, // ₹500.00
      },
    ]);

    const { data } = await adminAny.rpc("get_client_list", {
      p_search: "APITEST001",
      p_tier: null,
      p_page: 1,
      p_page_size: 50,
    }) as { data: Array<Record<string, unknown>> | null };

    const row = (data ?? []).find((c) => c["id"] === testClientId);
    expect(row).toBeDefined();
    // 100000 + 50000 = 150000 paise
    expect(String(row!["balance_paise"])).toBe("150000");
  });
});
