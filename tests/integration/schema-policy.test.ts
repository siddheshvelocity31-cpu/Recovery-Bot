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
import type { TablesInsert } from "@/lib/types/database";

const SUFFIX = Date.now();

// A helper that inserts a minimal valid category and returns its id.
async function insertCategory(
  admin: ReturnType<typeof getAdminClient>,
  overrides: Partial<TablesInsert<"category">> = {},
): Promise<string> {
  const base: TablesInsert<"category"> = {
    code: `CAT-${SUFFIX}-${Math.random().toString(36).slice(2, 7)}`,
    display_name: "Test Category",
    relationship_tier: "standard",
    behaviour_band: "prompt",
    ...overrides,
  };
  const { data, error } = await admin
    .from("category")
    .insert(base)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("schema: category, cadence_policy, persona, threshold_set, setting_change", () => {
  const admin = getAdminClient();

  // actor_id for setting_change FK tests — created via auth so the trigger
  // auto-creates the app_user row.
  let actorUserId: string;

  // Track test-created category IDs for cleanup.
  const categoryIds: string[] = [];

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `policy-test-${SUFFIX}@recovery-test.invalid`,
      password: "Test1234!",
      email_confirm: true,
    });
    if (error) throw error;
    actorUserId = data.user.id;
  });

  afterAll(async () => {
    // Delete categories (cascades to cadence_policy, persona, threshold_set).
    for (const id of categoryIds) {
      await admin.from("category").delete().eq("id", id);
    }
    // Delete auth user (cascades to app_user).
    if (actorUserId) {
      await admin.auth.admin.deleteUser(actorUserId);
    }
  });

  // -----------------------------------------------------------------------
  // 1. Only one is_default=true category
  // -----------------------------------------------------------------------
  it("second is_default=true category is rejected (unique violation)", async () => {
    const firstId = await insertCategory(admin, { is_default: true });
    categoryIds.push(firstId);

    const { error } = await admin.from("category").insert({
      code: `CAT-DEFAULT2-${SUFFIX}`,
      display_name: "Second Default",
      relationship_tier: "watchlist",
      behaviour_band: "slipping",
      is_default: true,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505"); // unique_violation on partial index
  });

  // -----------------------------------------------------------------------
  // 2. Duplicate (relationship_tier, behaviour_band) rejected
  // -----------------------------------------------------------------------
  it("duplicate (relationship_tier, behaviour_band) pair is rejected (unique violation)", async () => {
    const firstId = await insertCategory(admin, {
      relationship_tier: "new",
      behaviour_band: "chronic",
    });
    categoryIds.push(firstId);

    const { error } = await admin.from("category").insert({
      code: `CAT-DUOBAND-${SUFFIX}`,
      display_name: "Dup Band",
      relationship_tier: "new",
      behaviour_band: "chronic",
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505"); // unique_violation on category_tier_band_unique
  });

  // -----------------------------------------------------------------------
  // 3. threshold_set with red_days <= amber_days rejected
  // -----------------------------------------------------------------------
  it("threshold_set with red_days <= amber_days is rejected (check violation)", async () => {
    const catId = await insertCategory(admin, {
      relationship_tier: "strategic",
      behaviour_band: "unknown",
    });
    categoryIds.push(catId);

    const { error } = await admin.from("threshold_set").insert({
      category_id: catId,
      amber_days: 30,
      red_days: 20, // violates red_days > amber_days
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514"); // check_violation
  });

  // -----------------------------------------------------------------------
  // 4. persona with tone='firm' and requires_human_approval=false rejected
  // -----------------------------------------------------------------------
  it("persona with tone=firm and requires_human_approval=false is rejected (check violation)", async () => {
    const catId = await insertCategory(admin, {
      relationship_tier: "strategic",
      behaviour_band: "slipping",
    });
    categoryIds.push(catId);

    const { error } = await admin.from("persona").insert({
      category_id: catId,
      tone: "firm",
      signature: "Test Signature",
      requires_human_approval: false, // violates persona_firm_requires_approval
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514"); // check_violation
  });

  // -----------------------------------------------------------------------
  // 5. max_messages_per_week=8 rejected (> 7)
  // -----------------------------------------------------------------------
  it("cadence_policy with max_messages_per_week=8 is rejected (check violation)", async () => {
    const catId = await insertCategory(admin, {
      relationship_tier: "standard",
      behaviour_band: "chronic",
    });
    categoryIds.push(catId);

    const { error } = await admin.from("cadence_policy").insert({
      category_id: catId,
      max_messages_per_week: 8, // violates check (between 0 and 7)
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514"); // check_violation
  });

  // -----------------------------------------------------------------------
  // 6. Deleting a category sets client.category_id to NULL (on delete set null)
  // -----------------------------------------------------------------------
  it("deleting a category sets client.category_id to null", async () => {
    // Create a fresh category for this test
    const catId = await insertCategory(admin, {
      relationship_tier: "watchlist",
      behaviour_band: "prompt",
    });

    // Create a client pointing at that category
    const { data: clientData, error: clientErr } = await admin
      .from("client")
      .insert({
        client_code: `CLI-CATDEL-${SUFFIX}`,
        name: "Category Delete Test Client",
        category_id: catId,
      })
      .select("id")
      .single();
    expect(clientErr).toBeNull();
    const clientId = clientData!.id;

    // Delete the category
    const { error: delErr } = await admin
      .from("category")
      .delete()
      .eq("id", catId);
    expect(delErr).toBeNull();

    // Verify client.category_id is now null
    const { data: updatedClient, error: fetchErr } = await admin
      .from("client")
      .select("category_id")
      .eq("id", clientId)
      .single();
    expect(fetchErr).toBeNull();
    expect(updatedClient?.category_id).toBeNull();

    // Cleanup client
    await admin.from("client").delete().eq("id", clientId);
  });

  // -----------------------------------------------------------------------
  // 7. Deleting a category cascades to cadence_policy
  // -----------------------------------------------------------------------
  it("deleting a category cascades and removes associated cadence_policy", async () => {
    // Create a fresh category for this test
    const catId = await insertCategory(admin, {
      relationship_tier: "new",
      behaviour_band: "slipping",
    });

    // Create a cadence_policy for that category
    const { data: policyData, error: policyErr } = await admin
      .from("cadence_policy")
      .insert({ category_id: catId })
      .select("id")
      .single();
    expect(policyErr).toBeNull();
    const policyId = policyData!.id;

    // Delete the category
    const { error: delErr } = await admin
      .from("category")
      .delete()
      .eq("id", catId);
    expect(delErr).toBeNull();

    // Verify cadence_policy row is gone
    const { data: gone, error: fetchErr } = await admin
      .from("cadence_policy")
      .select("id")
      .eq("id", policyId)
      .maybeSingle();

    // maybeSingle returns null data (not an error) when no row is found
    expect(fetchErr).toBeNull();
    expect(gone).toBeNull();
  });
});
