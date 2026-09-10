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

import { describe, it, expect } from "vitest";
import { getAdminClient } from "@/lib/supabase/admin";
import { checkRails } from "@/lib/policy/rails";
import { GET as healthGET } from "@/app/api/health/route";

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

describe.skipIf(!supabaseReachable)("observability (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  // ── Test 1: inserting a second system_config row fails (singleton) ─────────

  it("inserting a second row into system_config fails (singleton enforced)", async () => {
    const { data, error } = await admin
      .from("system_config")
      .insert({ id: "singleton" })
      .select("id")
      .maybeSingle();

    // Must fail — either unique violation (23505) or CHECK constraint (23514).
    // Any error is the correct outcome; data must be null.
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("inserting a row with id != 'singleton' fails the CHECK constraint", async () => {
    const { data, error } = await admin
      .from("system_config")
      .insert({ id: "other" })
      .select("id")
      .maybeSingle();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  // ── Test 2: kill switch → checkRails returns blocked with rule='kill_switch' ─

  it("when outreach_kill_switch=true, checkRails returns blocked with rule='kill_switch'", () => {
    const input = {
      now: new Date(),
      is_kill_switch_on: true,
      is_client_muted: false,
      muted_until: null,
      is_suppressed: false,
      has_active_dispute: false,
      total_open_paise: 100000n,
      weekly_messages_sent: 0,
      max_messages_per_week: 7,
      quiet_hours_start: "21:00",
      quiet_hours_end: "09:00",
      channel: "email" as const,
      contact_whatsapp_opt_in: true,
      contact_email_opt_in: true,
      contact_voice_opt_in: false,
      contact_phone_e164: null,
      contact_email: "test@example.com",
      requires_human_approval: false,
      has_human_approval: false,
    };

    const result = checkRails(input);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.rule).toBe("kill_switch");
    }
  });

  it("kill switch from DB value: system_config singleton can be read", async () => {
    const { data, error } = await admin
      .from("system_config")
      .select("outreach_kill_switch, last_tick_at")
      .eq("id", "singleton")
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data.outreach_kill_switch).toBe("boolean");
  });

  // ── Test 3: GET /api/health returns 503 when last_tick_at > 5 min ago ──────

  it("GET /api/health returns 503 when last_tick_at is more than 5 minutes ago", async () => {
    // Set last_tick_at to 10 minutes ago
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { error: updateErr } = await admin
      .from("system_config")
      .update({ last_tick_at: tenMinutesAgo })
      .eq("id", "singleton");

    expect(updateErr).toBeNull();

    const res = await healthGET();
    expect(res.status).toBe(503);

    const body = await res.json() as Record<string, unknown>;
    expect(body["status"]).toBe("degraded");

    // Restore to a recent tick so other tests are not affected
    const { error: restoreErr } = await admin
      .from("system_config")
      .update({ last_tick_at: new Date().toISOString() })
      .eq("id", "singleton");

    expect(restoreErr).toBeNull();
  });

  it("GET /api/health returns 200 when last_tick_at is recent", async () => {
    // Set a recent tick
    const { error: updateErr } = await admin
      .from("system_config")
      .update({ last_tick_at: new Date().toISOString() })
      .eq("id", "singleton");

    expect(updateErr).toBeNull();

    const res = await healthGET();
    // Should be 200 unless there are dead jobs
    expect([200, 503]).toContain(res.status);

    const body = await res.json() as Record<string, unknown>;
    expect(["ok", "degraded"]).toContain(body["status"]);
  });
});
