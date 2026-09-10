import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";

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

describe("supabase wiring", () => {
  let supabaseAdmin: ReturnType<typeof getAdminClient>;

  beforeAll(() => {
    supabaseAdmin = getAdminClient();
  });

  it("connects with the service-role client", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any).rpc("health_check") as { data: unknown; error: unknown };

    expect(error).toBeNull();
    expect(typeof data).toBe("string");
  });
});
