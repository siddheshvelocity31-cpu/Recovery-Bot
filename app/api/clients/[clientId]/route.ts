import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { recordChange } from "@/lib/audit/record-change";
import { writeEvent } from "@/lib/events/write";
import type { NextRequest } from "next/server";
import { z } from "zod";

const PAGE_SIZE = 50;

const PatchBodySchema = z.object({
  category_id: z.string().uuid().optional(),
  credit_terms_days: z.number().int().min(1).max(365).optional(),
  relationship_tier: z.enum(["strategic", "standard", "watchlist", "new"]).optional(),
  assigned_collector_id: z.string().uuid().optional(),
  reason: z.string().min(3),
});

const QuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v ?? "1", 10);
      return isNaN(n) || n < 1 ? 1 : n;
    }),
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

    const { page } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Fetch the client
    const { data: client, error: clientError } = await adminAny
      .from("client")
      .select("*")
      .eq("id", clientId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (clientError) throw clientError;
    if (!client) {
      return fail("NOT_FOUND", "Client not found.");
    }

    // Fetch ledger entries paginated
    const offset = (page - 1) * PAGE_SIZE;
    const { data: entries, error: entriesError, count } = await adminAny
      .from("ledger_entry")
      .select("*", { count: "exact" })
      .eq("client_id", clientId)
      .order("doc_date", { ascending: false })
      .order("row_number", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1) as {
        data: Array<Record<string, unknown>> | null;
        error: unknown;
        count: number | null;
      };

    if (entriesError) throw entriesError;

    // Compute balance via RPC to keep aggregation in SQL
    const { data: clientList, error: rpcError } = await adminAny.rpc("get_client_list", {
      p_search: null,
      p_tier: null,
      p_page: 1,
      p_page_size: 1000,
    }) as { data: Array<Record<string, unknown>> | null; error: unknown };

    if (rpcError) throw rpcError;

    const clientRow = (clientList ?? []).find((c) => c["id"] === clientId);
    const balance_paise = clientRow ? String(clientRow["balance_paise"]) : "0";

    // Serialise entries — bill_amount_paise comes as number from DB (not bigint)
    const serialisedEntries = (entries ?? []).map((e) => ({
      ...e,
      bill_amount_paise: e["bill_amount_paise"] != null ? String(e["bill_amount_paise"]) : null,
    }));

    return ok({
      data: {
        client,
        balance_paise,
        entry_count: count ?? 0,
        entries: serialisedEntries,
        page,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const { clientId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", "Invalid JSON body.");
    }

    const parsed = PatchBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const { reason, ...fields } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Fetch current client to diff
    const { data: current, error: fetchError } = await adminAny
      .from("client")
      .select("*")
      .eq("id", clientId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (fetchError) throw fetchError;
    if (!current) {
      return fail("NOT_FOUND", "Client not found.");
    }

    // Build update payload from only the provided fields
    const updatePayload: Record<string, unknown> = {};
    if (fields.category_id !== undefined) updatePayload["category_id"] = fields.category_id;
    if (fields.credit_terms_days !== undefined) updatePayload["credit_terms_days"] = fields.credit_terms_days;
    if (fields.relationship_tier !== undefined) updatePayload["relationship_tier"] = fields.relationship_tier;
    if (fields.assigned_collector_id !== undefined) updatePayload["assigned_collector_id"] = fields.assigned_collector_id;

    if (Object.keys(updatePayload).length === 0) {
      return fail("VALIDATION_FAILED", "No fields provided to update.");
    }

    const { data: updated, error: updateError } = await adminAny
      .from("client")
      .update(updatePayload)
      .eq("id", clientId)
      .select("*")
      .single() as { data: Record<string, unknown> | null; error: unknown };

    if (updateError) throw updateError;
    if (!updated) throw new Error("Update returned no data.");

    // Record a change audit entry for each changed field
    for (const [field, newValue] of Object.entries(updatePayload)) {
      await recordChange({
        actor_id: user.id,
        scope: "client",
        scope_id: clientId,
        field,
        old_value: current[field] ?? null,
        new_value: newValue,
        reason,
      });
    }

    // Emit client.categorised event if category_id changed
    if (fields.category_id !== undefined && fields.category_id !== current["category_id"]) {
      await writeEvent({
        clientId,
        actorType: "user",
        actorId: user.id,
        type: "client.categorised",
        payload: {
          old_category_id: current["category_id"] ?? null,
          new_category_id: fields.category_id,
          reason,
        },
      });
    }

    return ok(updated);
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
