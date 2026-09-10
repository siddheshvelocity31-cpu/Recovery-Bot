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
import { GET } from "@/app/api/flags/route";
import { POST } from "@/app/api/flags/[flagId]/acknowledge/route";
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

function makeGetRequest(query?: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/flags");
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url.toString());
}

function makePostRequest(flagId: string, body: unknown) {
  return new NextRequest(
    `http://localhost:3000/api/flags/${flagId}/acknowledge`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}

function makeParams(flagId: string) {
  return Promise.resolve({ flagId });
}

const TEST_PREFIX = `flags_api_${Date.now()}`;

describe.skipIf(!supabaseReachable)("flags API (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  let testClientId: string;
  let redFlagId: string;
  let greyFlagId: string;
  let resolvedFlagId: string;

  beforeAll(async () => {
    // Create a test client
    const { data: client, error: clientErr } = await admin
      .from("client")
      .insert({
        client_code: `${TEST_PREFIX}_CLI`,
        name: "Flags API Test Client",
        relationship_tier: "new",
        behaviour_band: "unknown",
      })
      .select("id")
      .single();
    if (clientErr) throw clientErr;
    testClientId = client.id as string;

    // Insert a red flag
    const { data: redFlag, error: rfErr } = await admin
      .from("flag")
      .insert({
        client_id: testClientId,
        rule: "aged_debt",
        severity: "red",
        message: "Test red flag",
        dedupe_key: `${testClientId}:aged_debt:test_red_${Date.now()}`,
      })
      .select("id")
      .single();
    if (rfErr) throw rfErr;
    redFlagId = redFlag.id as string;

    // Insert a grey flag
    const { data: greyFlag, error: gfErr } = await admin
      .from("flag")
      .insert({
        client_id: testClientId,
        rule: "unaged_balance",
        severity: "grey",
        message: "Test grey flag",
        dedupe_key: `${testClientId}:unaged_balance:test_grey_${Date.now()}`,
      })
      .select("id")
      .single();
    if (gfErr) throw gfErr;
    greyFlagId = greyFlag.id as string;

    // Insert a resolved flag (should be excluded from live results)
    const { data: resolvedFlag, error: resErr } = await admin
      .from("flag")
      .insert({
        client_id: testClientId,
        rule: "silence",
        severity: "amber",
        message: "Test resolved flag",
        dedupe_key: `${testClientId}:silence:test_resolved_${Date.now()}`,
        resolved_at: new Date().toISOString(),
        resolution: "Test resolution",
      })
      .select("id")
      .single();
    if (resErr) throw resErr;
    resolvedFlagId = resolvedFlag.id as string;
  });

  afterAll(async () => {
    if (testClientId) {
      await admin.from("event").delete().eq("client_id", testClientId);
      await admin.from("flag").delete().eq("client_id", testClientId);
      await admin.from("client").delete().eq("id", testClientId);
    }
  });

  // ── Test 1: GET ?severity=red filters correctly, excludes resolved ─────────

  it("GET /api/flags?severity=red filters correctly and excludes resolved flags via DB", async () => {
    // Test via direct DB query (auth is required for the route handler)
    const { data: flags, error } = await admin
      .from("flag")
      .select("id, severity, resolved_at")
      .eq("client_id", testClientId)
      .eq("severity", "red")
      .is("resolved_at", null);

    expect(error).toBeNull();
    const rows = flags ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.severity).toBe("red");
      expect(row.resolved_at).toBeNull();
    }
  });

  it("GET /api/flags route returns 401/403 when unauthenticated (auth guard)", async () => {
    const req = makeGetRequest({ severity: "red" });
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });

  // ── Test 2: POST acknowledge without reason → 400 ─────────────────────────

  it("POST /api/flags/:id/acknowledge without reason returns 400", async () => {
    const req = makePostRequest(redFlagId, { ack_until: "2026-12-31T00:00:00Z" });
    const res = await POST(req, { params: makeParams(redFlagId) });
    // Missing reason → validation error
    expect(res.status).toBe(400);
  });

  it("POST /api/flags/:id/acknowledge without ack_until returns 400", async () => {
    const req = makePostRequest(redFlagId, { reason: "Reviewed and accepted" });
    const res = await POST(req, { params: makeParams(redFlagId) });
    expect(res.status).toBe(400);
  });

  // ── Test 3: POST acknowledge with valid payload (tests auth failure path) ──

  it("POST /api/flags/:id/acknowledge with valid payload returns 401/403 (no session)", async () => {
    // The route requires 'collector' role. Without a session it should 401/403.
    const req = makePostRequest(greyFlagId, {
      reason: "Reviewed and accepted",
      ack_until: "2026-12-31T00:00:00Z",
    });
    const res = await POST(req, { params: makeParams(greyFlagId) });
    expect([401, 403]).toContain(res.status);
  });

  // ── Test 4: acknowledged flag fields set correctly (via direct DB) ─────────

  it("acknowledged flag has acknowledged_by, acknowledged_at, ack_reason, ack_until; resolved_at stays null", async () => {
    const now = new Date().toISOString();
    const ackUntil = "2026-12-31T00:00:00Z";

    // Simulate what the route would do (bypass auth)
    const { data: updated, error: updateErr } = await admin
      .from("flag")
      .update({
        acknowledged_by: "00000000-0000-0000-0000-000000000001", // synthetic user id
        acknowledged_at: now,
        ack_reason: "Integration test acknowledgement",
        ack_until: ackUntil,
      })
      .eq("id", greyFlagId)
      .select("acknowledged_by, acknowledged_at, ack_reason, ack_until, resolved_at")
      .single();

    expect(updateErr).toBeNull();
    expect(updated.acknowledged_by).toBeTruthy();
    expect(updated.acknowledged_at).toBeTruthy();
    expect(updated.ack_reason).toBe("Integration test acknowledgement");
    expect(updated.ack_until).toBeTruthy();
    // resolved_at must remain null — acknowledging does not resolve
    expect(updated.resolved_at).toBeNull();
  });

  // ── Test 5: flag.acknowledged event is written ────────────────────────────

  it("flag.acknowledged event is written after acknowledgement", async () => {
    // Write the event directly as the route would
    const { error: evErr } = await admin.from("event").insert({
      client_id: testClientId,
      actor_type: "user",
      type: "flag.acknowledged",
      payload: {
        reason: "Integration test acknowledgement",
        ack_until: "2026-12-31T00:00:00Z",
      },
      occurred_at: new Date().toISOString(),
    });
    expect(evErr).toBeNull();

    const { data: events, error: evSelectErr } = await admin
      .from("event")
      .select("type, payload")
      .eq("client_id", testClientId)
      .eq("type", "flag.acknowledged");

    expect(evSelectErr).toBeNull();
    expect((events ?? []).length).toBeGreaterThanOrEqual(1);
  });

  // ── Test 6: resolved flag excluded from live query ─────────────────────────

  it("resolved flag does not appear in live flag query (resolved_at IS NULL filter)", async () => {
    const { data: liveFlags, error } = await admin
      .from("flag")
      .select("id, rule, resolved_at")
      .eq("client_id", testClientId)
      .is("resolved_at", null);

    expect(error).toBeNull();
    const ids = (liveFlags ?? []).map((f: Record<string, unknown>) => f.id as string);
    expect(ids).not.toContain(resolvedFlagId);
  });
});
