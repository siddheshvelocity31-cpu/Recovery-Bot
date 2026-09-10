import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import type { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> },
): Promise<Response> {
  try {
    await requireRole("viewer");

    const { categoryId } = await params;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    const { data: category, error } = await adminAny
      .from("category")
      .select(
        `
        *,
        cadence_policy (
          *,
          cadence_step (*)
        ),
        persona (*),
        threshold_set (*)
        `,
      )
      .eq("id", categoryId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (error) throw error;
    if (!category) {
      return fail("NOT_FOUND", "Category not found.");
    }

    return ok({ data: category });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
