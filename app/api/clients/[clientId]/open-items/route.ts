import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import type { NextRequest } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  status: z
    .enum(["open", "part_paid", "settled", "disputed", "written_off"])
    .optional(),
});

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

    const { status } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Verify client exists
    const { data: client, error: clientError } = await adminAny
      .from("client")
      .select("id")
      .eq("id", clientId)
      .maybeSingle() as { data: { id: string } | null; error: unknown };

    if (clientError) throw clientError;
    if (!client) {
      return fail("NOT_FOUND", "Client not found.");
    }

    // Fetch open items
    let query = adminAny
      .from("open_item")
      .select("*")
      .eq("client_id", clientId)
      .order("due_date", { ascending: true, nullsFirst: true })
      .order("gross_amount_paise", { ascending: false });

    if (status !== undefined) {
      query = query.eq("status", status);
    }

    const { data: items, error: itemsError } = await query as {
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    };

    if (itemsError) throw itemsError;

    const rows = items ?? [];

    // Compute totals — DB stores paise as number (Postgres BIGINT returns as number in JS)
    let totalOpen = 0n;
    let unaged = 0n;

    for (const item of rows) {
      const openAmt = item["open_amount_paise"] != null
        ? BigInt(item["open_amount_paise"] as number)
        : 0n;
      totalOpen += openAmt;
      if (item["is_unaged"] === true) {
        unaged += openAmt;
      }
    }

    // Serialize money fields as strings
    const serialised = rows.map((item) => ({
      ...item,
      open_amount_paise: item["open_amount_paise"] != null
        ? String(item["open_amount_paise"])
        : null,
      gross_amount_paise: String(item["gross_amount_paise"]),
      credits_applied_paise: String(item["credits_applied_paise"]),
      receipts_applied_paise: String(item["receipts_applied_paise"]),
    }));

    return ok({
      data: serialised,
      totals: {
        total_open_paise: String(totalOpen),
        unaged_paise: String(unaged),
        count: rows.length,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
