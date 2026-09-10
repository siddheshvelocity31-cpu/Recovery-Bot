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

describe("import flow", () => {
  const admin = getAdminClient();
  let testClientId: string;
  let testImportId: string;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("client")
      .insert({ client_code: "IMPORTTEST001", name: "Import Test Client" })
      .select()
      .single() as { data: { id: string } | null; error: unknown };

    if (error) throw error;
    testClientId = data!.id;
  });

  afterAll(async () => {
    if (testImportId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from("ledger_import").delete().eq("id", testImportId);
    }
    if (testClientId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from("client").delete().eq("id", testClientId);
    }
  });

  it("can insert a ledger_import with status pending", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("ledger_import")
      .insert({
        client_id: testClientId,
        storage_path: "ledger/test_import_flow.xlsx",
        file_sha256: `sha256_import_flow_test_${Date.now()}`,
        source_filename: "test.xlsx",
        status: "pending",
      })
      .select()
      .single() as { data: { id: string; status: string } | null; error: unknown };

    expect(error).toBeNull();
    expect(data?.status).toBe("pending");
    testImportId = data!.id;
  });

  it("duplicate file_sha256 on ledger_import returns unique violation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;
    const sha = `sha256_dup_test_${Date.now()}`;

    await adminAny
      .from("ledger_import")
      .insert({
        client_id: testClientId,
        storage_path: "ledger/dup_test_1.xlsx",
        file_sha256: sha,
        source_filename: "dup1.xlsx",
      });

    const { error } = await adminAny
      .from("ledger_import")
      .insert({
        client_id: testClientId,
        storage_path: "ledger/dup_test_2.xlsx",
        file_sha256: sha,
        source_filename: "dup2.xlsx",
      }) as { error: { code: string } | null };

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505");
  });
});
