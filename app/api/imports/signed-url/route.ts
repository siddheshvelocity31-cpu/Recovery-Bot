import "server-only";

import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/errors";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireRole("collector");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", "Request body must be valid JSON");
    }

    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as Record<string, unknown>)["client_code"] !== "string" ||
      typeof (body as Record<string, unknown>)["filename"] !== "string"
    ) {
      return fail("VALIDATION_FAILED", "client_code and filename are required");
    }

    const { client_code, filename } = body as { client_code: string; filename: string };

    // Sanitise: strip path traversal characters
    const safeName = filename.replace(/[/\\]/g, "_");
    const path = `${client_code}/${Date.now()}-${safeName}`;

    const admin = getAdminClient();
    const { data, error } = await admin.storage
      .from("ledger-imports")
      .createSignedUploadUrl(path);

    if (error || !data) {
      return fail("INTERNAL", "Could not generate signed upload URL");
    }

    return ok({ signed_url: data.signedUrl, path });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error");
  }
}
