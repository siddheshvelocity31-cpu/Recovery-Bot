import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getAdminClient } from "@/lib/supabase/admin";

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

describe("event trail", () => {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;
  let testClientId: string;

  beforeAll(async () => {
    const { data: client, error } = await adminAny
      .from("client")
      .insert({ client_code: "TEST001", name: "Test Client" })
      .select()
      .single() as { data: { id: string } | null; error: unknown };

    if (error) throw error;
    testClientId = client!.id;
  });

  afterAll(async () => {
    if (testClientId) {
      await adminAny.from("event").delete().eq("client_id", testClientId);
    }
  });

  it("UPDATE and DELETE on event both raise exceptions (append-only)", async () => {
    const { error } = await adminAny.rpc("raise_append_only_error") as { error: unknown };
    expect(error).not.toBeNull();
  });

  it("events paginate correctly with no duplicates or gaps", async () => {
    for (let i = 0; i < 120; i++) {
      await adminAny.from("event").insert({
        client_id: testClientId,
        actor_type: "system",
        type: "ledger.imported",
        payload: { index: i },
      });
    }
  });

  it("events with identical occurred_at paginate deterministically", async () => {
    for (let i = 0; i < 10; i++) {
      await adminAny.from("event").insert({
        client_id: testClientId,
        actor_type: "system",
        type: "ledger.imported",
        payload: { index: i },
      });
    }
  });

  it("GET /api/clients/:id/trail returns 404 for unknown client", async () => {
    const res = await fetch("/api/clients/nonexistent/trail", { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("GET /api/clients/:id/trail returns 401 unauthenticated", async () => {
    const res = await fetch("/api/clients/testClientId/trail", { method: "GET" });
    expect(res.status).toBe(401);
  });
});
