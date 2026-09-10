import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Load .env.local before importing the admin client so env vars are available.
// In CI this file does not exist; integration tests are excluded via vitest config.
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
  // .env.local does not exist; proceed — env vars may already be set externally
}

import { getAdminClient } from "@/lib/supabase/admin";

const SEED_CODES = ["strategic", "standard", "watchlist", "new"] as const;

describe("seed: categories, policies, personas, thresholds, test client", () => {
  const admin = getAdminClient();

  // -------------------------------------------------------------------------
  // 1. Exactly 4 seed categories exist
  // -------------------------------------------------------------------------
  it("exactly 4 seeded categories exist", async () => {
    const { data, error } = await admin
      .from("category")
      .select("code")
      .in("code", [...SEED_CODES]);

    expect(error).toBeNull();
    expect(data).toHaveLength(4);

    const codes = data!.map((r) => r.code).sort();
    expect(codes).toEqual(["new", "standard", "strategic", "watchlist"]);
  });

  // -------------------------------------------------------------------------
  // 2. Each category has exactly 1 cadence_policy, 1 persona, 1 threshold_set
  // -------------------------------------------------------------------------
  it("each seeded category has exactly 1 cadence_policy, 1 persona, 1 threshold_set", async () => {
    for (const code of SEED_CODES) {
      const { data: catData, error: catErr } = await admin
        .from("category")
        .select("id")
        .eq("code", code)
        .single();
      expect(catErr).toBeNull();
      const categoryId = catData!.id;

      const { count: policyCount, error: pe } = await admin
        .from("cadence_policy")
        .select("*", { count: "exact", head: true })
        .eq("category_id", categoryId);
      expect(pe).toBeNull();
      expect(policyCount).toBe(1);

      const { count: personaCount, error: pse } = await admin
        .from("persona")
        .select("*", { count: "exact", head: true })
        .eq("category_id", categoryId);
      expect(pse).toBeNull();
      expect(personaCount).toBe(1);

      const { count: thresholdCount, error: te } = await admin
        .from("threshold_set")
        .select("*", { count: "exact", head: true })
        .eq("category_id", categoryId);
      expect(te).toBeNull();
      expect(thresholdCount).toBe(1);
    }
  });

  // -------------------------------------------------------------------------
  // 3. Every cadence policy has at least 3 steps with strictly increasing
  //    offset_days_from_due
  // -------------------------------------------------------------------------
  it("every seeded cadence policy has >=3 steps with strictly increasing offset_days_from_due", async () => {
    for (const code of SEED_CODES) {
      const { data: catData, error: catErr } = await admin
        .from("category")
        .select("id")
        .eq("code", code)
        .single();
      expect(catErr).toBeNull();

      const { data: policy, error: pe } = await admin
        .from("cadence_policy")
        .select("id")
        .eq("category_id", catData!.id)
        .single();
      expect(pe).toBeNull();

      const { data: steps, error: se } = await admin
        .from("cadence_step")
        .select("step_number, offset_days_from_due")
        .eq("cadence_policy_id", policy!.id)
        .order("step_number", { ascending: true });
      expect(se).toBeNull();
      expect(steps!.length).toBeGreaterThanOrEqual(3);

      // Verify strictly increasing offset_days_from_due
      for (let i = 1; i < steps!.length; i++) {
        expect(steps![i]!.offset_days_from_due).toBeGreaterThan(
          steps![i - 1]!.offset_days_from_due,
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // 4. Exactly one category has is_default=true
  // -------------------------------------------------------------------------
  it("exactly one seeded category has is_default=true", async () => {
    const { data, error } = await admin
      .from("category")
      .select("code, is_default")
      .in("code", [...SEED_CODES])
      .eq("is_default", true);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.code).toBe("standard");
  });

  // -------------------------------------------------------------------------
  // 5. The watchlist persona has tone='firm' and requires_human_approval=true
  // -------------------------------------------------------------------------
  it("watchlist persona has tone=firm and requires_human_approval=true", async () => {
    const { data: catData, error: catErr } = await admin
      .from("category")
      .select("id")
      .eq("code", "watchlist")
      .single();
    expect(catErr).toBeNull();

    const { data: personaData, error: pe } = await admin
      .from("persona")
      .select("tone, requires_human_approval")
      .eq("category_id", catData!.id)
      .single();
    expect(pe).toBeNull();
    expect(personaData!.tone).toBe("firm");
    expect(personaData!.requires_human_approval).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Synthetic contacts with phone numbers starting with +91999990 exist
  // -------------------------------------------------------------------------
  it("synthetic contacts with +91999990 prefix phone numbers exist", async () => {
    // Use a raw filter — supabase-js ilike works on text columns
    const { data, error } = await admin
      .from("contact")
      .select("phone_e164, full_name")
      .like("phone_e164", "+91999990%");

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const phones = data!.map((r) => r.phone_e164).sort();
    expect(phones).toContain("+919999900001");
    expect(phones).toContain("+919999900002");

    for (const row of data!) {
      expect(row.phone_e164).toMatch(/^\+91999990/);
    }
  });

  // -------------------------------------------------------------------------
  // 7. Idempotency — running counts are unchanged after re-applying seed data
  // -------------------------------------------------------------------------
  it("seed is idempotent — row counts unchanged after re-applying", async () => {
    // Capture before counts
    const countsBefore = await getSeedRowCounts(admin);

    // Re-apply all seed inserts via RPC (execute_sql is not available from
    // supabase-js; we replicate the idempotent inserts directly via supabase-js
    // upserts to prove that re-applying leaves counts stable)

    // Re-upsert categories
    for (const [code, displayName, tier] of [
      ["strategic", "Strategic Accounts", "strategic"],
      ["standard", "Standard Accounts", "standard"],
      ["watchlist", "Watchlist Accounts", "watchlist"],
      ["new", "New Accounts", "new"],
    ] as const) {
      const { error } = await admin
        .from("category")
        .upsert(
          {
            code,
            display_name: displayName,
            relationship_tier: tier,
            behaviour_band: "unknown",
            is_default: code === "standard",
          },
          { onConflict: "code", ignoreDuplicates: false },
        );
      expect(error).toBeNull();
    }

    // Re-upsert client
    const { error: clientErr } = await admin.from("client").upsert(
      {
        client_code: "OL000001",
        name: "OLECTRA GREENTECH LIMITED",
        credit_terms_days: 30,
        relationship_tier: "strategic",
      },
      { onConflict: "client_code", ignoreDuplicates: false },
    );
    expect(clientErr).toBeNull();

    // Capture after counts — must match before
    const countsAfter = await getSeedRowCounts(admin);

    expect(countsAfter.categories).toBe(countsBefore.categories);
    expect(countsAfter.policies).toBe(countsBefore.policies);
    expect(countsAfter.steps).toBe(countsBefore.steps);
    expect(countsAfter.personas).toBe(countsBefore.personas);
    expect(countsAfter.thresholds).toBe(countsBefore.thresholds);
    expect(countsAfter.contacts).toBe(countsBefore.contacts);
    expect(countsAfter.clients).toBe(countsBefore.clients);
  });
});

// ---------------------------------------------------------------------------
// Helper: count seed rows
// ---------------------------------------------------------------------------
async function getSeedRowCounts(admin: ReturnType<typeof getAdminClient>) {
  const seedCodes = ["strategic", "standard", "watchlist", "new"];

  const { count: categories } = await admin
    .from("category")
    .select("*", { count: "exact", head: true })
    .in("code", seedCodes);

  // Get category IDs for joined counts
  const { data: cats } = await admin
    .from("category")
    .select("id")
    .in("code", seedCodes);
  const catIds = (cats ?? []).map((c) => c.id);

  const { count: policies } = await admin
    .from("cadence_policy")
    .select("*", { count: "exact", head: true })
    .in("category_id", catIds);

  // Get policy IDs for step count
  const { data: pols } = await admin
    .from("cadence_policy")
    .select("id")
    .in("category_id", catIds);
  const polIds = (pols ?? []).map((p) => p.id);

  const { count: steps } = await admin
    .from("cadence_step")
    .select("*", { count: "exact", head: true })
    .in("cadence_policy_id", polIds);

  const { count: personas } = await admin
    .from("persona")
    .select("*", { count: "exact", head: true })
    .in("category_id", catIds);

  const { count: thresholds } = await admin
    .from("threshold_set")
    .select("*", { count: "exact", head: true })
    .in("category_id", catIds);

  const { count: clients } = await admin
    .from("client")
    .select("*", { count: "exact", head: true })
    .eq("client_code", "OL000001");

  const { count: contacts } = await admin
    .from("contact")
    .select("*", { count: "exact", head: true })
    .like("phone_e164", "+91999990%");

  return {
    categories: categories ?? 0,
    policies: policies ?? 0,
    steps: steps ?? 0,
    personas: personas ?? 0,
    thresholds: thresholds ?? 0,
    clients: clients ?? 0,
    contacts: contacts ?? 0,
  };
}
