import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import type { NextRequest } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  severity: z.enum(["red", "amber", "grey"]).optional(),
  acknowledged: z
    .string()
    .optional()
    .transform((v) =>
      v === "true" ? true : v === "false" ? false : undefined,
    ),
});

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireRole("viewer");

    const { searchParams } = request.nextUrl;
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid query parameters", parsed.error.flatten());
    }

    const { severity, acknowledged } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    let query = adminAny.from("flag").select("*");

    if (severity !== undefined) {
      query = query.eq("severity", severity);
    }

    if (acknowledged === true) {
      query = query.not("acknowledged_at", "is", null);
    } else if (acknowledged === false) {
      query = query.is("acknowledged_at", null);
    }

    // Order: severity red first (red > amber > grey), then raised_at DESC
    // We use a custom order via multiple .order() calls with ascending=false on a case expression
    // Supabase doesn't support CASE in order; use ascending on severity (alphabetic) won't work.
    // Instead order by raised_at DESC, then rely on client to sort severity.
    // To approximate severity ordering we do two passes or use a raw query.
    // Best approach: order raised_at DESC and let clients sort by severity,
    // but we can chain order clauses for the same column only.
    // Use raised_at DESC as primary ordering and note severity ordering is informational.
    // Per spec: "order by severity (red first) then raised_at DESC"
    // Supabase supports .order() for multiple columns:
    query = query
      .order("raised_at", { ascending: false });

    const { data: flags, error } = await query as {
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    };

    if (error) throw error;

    const rows = flags ?? [];

    // Sort in JS: red > amber > grey, then raised_at DESC (already sorted)
    const severityOrder: Record<string, number> = { red: 0, amber: 1, grey: 2 };
    rows.sort((a, b) => {
      const aS = severityOrder[a["severity"] as string] ?? 99;
      const bS = severityOrder[b["severity"] as string] ?? 99;
      if (aS !== bS) return aS - bS;
      // raised_at DESC
      const aT = (a["raised_at"] as string) ?? "";
      const bT = (b["raised_at"] as string) ?? "";
      return bT.localeCompare(aT);
    });

    return ok({ data: rows });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
