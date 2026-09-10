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

const TEST_EMAIL = `test-auth-${Date.now()}@recovery-test.invalid`;
const TEST_PASSWORD = "testpassword123!";
let testUserId: string;

describe("auth wiring", () => {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    testUserId = data.user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await admin.auth.admin.deleteUser(testUserId);
    }
  });

  it("trigger creates an app_user row with role=viewer on auth user creation", async () => {
    const { data, error } = await adminAny
      .from("app_user")
      .select("*")
      .eq("id", testUserId)
      .single() as { data: { role: string; is_active: boolean; email: string } | null; error: unknown };

    expect(error).toBeNull();
    expect(data?.role).toBe("viewer");
    expect(data?.is_active).toBe(true);
    expect(data?.email).toBe(TEST_EMAIL);
  });

  it("can promote user to collector via direct update", async () => {
    const { error } = await adminAny
      .from("app_user")
      .update({ role: "collector" })
      .eq("id", testUserId) as { error: unknown };

    expect(error).toBeNull();

    const { data } = await adminAny
      .from("app_user")
      .select("role")
      .eq("id", testUserId)
      .single() as { data: { role: string } | null };

    expect(data?.role).toBe("collector");
  });

  it("can mark user inactive", async () => {
    const { error } = await adminAny
      .from("app_user")
      .update({ is_active: false })
      .eq("id", testUserId) as { error: unknown };

    expect(error).toBeNull();

    const { data } = await adminAny
      .from("app_user")
      .select("is_active")
      .eq("id", testUserId)
      .single() as { data: { is_active: boolean } | null };

    expect(data?.is_active).toBe(false);
  });
});
