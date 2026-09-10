import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import type { NextRequest } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  q: z.string().optional(),
  tier: z.enum(["strategic", "standard", "watchlist", "new"]).optional(),
  has_flags: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  page: z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v ?? "1", 10);
      return isNaN(n) || n < 1 ? 1 : n;
    }),
});

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireRole("viewer");

    const { searchParams } = request.nextUrl;
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid query parameters", parsed.error.flatten());
    }

    const { q, tier, page } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clients, error } = await (admin as any).rpc("get_client_list", {
      p_search: q ?? null,
      p_tier: tier ?? null,
      p_page: page,
      p_page_size: 50,
    }) as { data: Array<Record<string, unknown>> | null; error: unknown };

    if (error) throw error;

    const serialised = (clients ?? []).map((c) => ({
      ...c,
      balance_paise: String(c["balance_paise"]),
    }));

    return ok({ data: serialised, page });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
