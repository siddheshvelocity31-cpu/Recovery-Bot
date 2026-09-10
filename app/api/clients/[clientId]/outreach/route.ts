import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import type { NextRequest } from "next/server";
import { z } from "zod";

const PAGE_SIZE = 50;

const QuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v ?? "1", 10);
      return isNaN(n) || n < 1 ? 1 : n;
    }),
});

const OUTREACH_SELECT =
  "id, channel, cadence_step_number, template_key, persona_tone, rendered_body, status, is_dry_run, scheduled_for, sent_at, idempotency_key, suppression_reason";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    await requireRole("viewer");

    const { clientId } = await params;
    const { searchParams } = request.nextUrl;

    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid query parameters", parsed.error.flatten());
    }

    const { page } = parsed.data;
    const offset = (page - 1) * PAGE_SIZE;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    const { data: outreachRows, error, count } = await adminAny
      .from("outreach")
      .select(OUTREACH_SELECT, { count: "exact" })
      .eq("client_id", clientId)
      .order("scheduled_for", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1) as {
        data: Array<Record<string, unknown>> | null;
        error: unknown;
        count: number | null;
      };

    if (error) throw error;

    const total = count ?? 0;
    const has_more = offset + PAGE_SIZE < total;

    return ok(outreachRows ?? [], { page, has_more });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
