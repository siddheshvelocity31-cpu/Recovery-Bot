import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail, AppError } from "@/lib/errors";
import { simulate } from "@/lib/policy/simulate";
import type { ClientForSimulation } from "@/lib/policy/simulate";
import type { NextRequest } from "next/server";
import { z } from "zod";

const CadenceStepSchema = z.object({
  step_number: z.number().int().positive(),
  channel: z.enum(["whatsapp", "email", "voice", "human"]),
  offset_days_from_due: z.number().int().min(0),
  template_key: z.string().min(1),
  escalation_level: z.number().int().min(1),
});

const SimulateBodySchema = z.object({
  window_days: z.number().int().min(1).max(90),
  proposed_steps: z.array(CadenceStepSchema),
  proposed_max_messages_per_week: z.number().int().min(0).max(7),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> },
): Promise<Response> {
  try {
    await requireRole("admin");

    const { categoryId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_FAILED", "Invalid JSON body.");
    }

    const parsed = SimulateBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_FAILED", "Invalid request body.", parsed.error.flatten());
    }

    const { window_days, proposed_steps, proposed_max_messages_per_week } = parsed.data;
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;

    // Fetch category + current cadence
    const { data: category, error: categoryError } = await adminAny
      .from("category")
      .select("id, cadence_policy(*, cadence_step(*))")
      .eq("id", categoryId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (categoryError) throw categoryError;
    if (!category) {
      return fail("NOT_FOUND", "Category not found.");
    }

    const cadencePolicy = category["cadence_policy"] as Record<string, unknown> | null;
    const currentMaxPerWeek =
      typeof cadencePolicy?.["max_messages_per_week"] === "number"
        ? (cadencePolicy["max_messages_per_week"] as number)
        : 2;

    const currentSteps = Array.isArray(cadencePolicy?.["cadence_step"])
      ? (cadencePolicy["cadence_step"] as Array<Record<string, unknown>>).map((s) => ({
          step_number: s["step_number"] as number,
          channel: s["channel"] as "whatsapp" | "email" | "voice" | "human",
          offset_days_from_due: s["offset_days_from_due"] as number,
          template_key: s["template_key"] as string,
          escalation_level: s["escalation_level"] as number,
        }))
      : [];

    // Fetch all clients in this category
    const { data: clients, error: clientsError } = await adminAny
      .from("client")
      .select("id, name, relationship_tier")
      .eq("category_id", categoryId) as {
        data: Array<{ id: string; name: string; relationship_tier: string }> | null;
        error: unknown;
      };

    if (clientsError) throw clientsError;

    const clientRows = clients ?? [];

    // For each client, fetch total_open_paise and earliest_due_date
    const clientsForSim: ClientForSimulation[] = await Promise.all(
      clientRows.map(async (c) => {
        const { data: openItems } = await adminAny
          .from("open_item")
          .select("open_amount_paise, due_date")
          .eq("client_id", c.id)
          .in("status", ["open", "part_paid"]) as {
            data: Array<{ open_amount_paise: number | null; due_date: string | null }> | null;
            error: unknown;
          };

        const items = openItems ?? [];
        let totalOpen = 0n;
        let earliestDue: string | null = null;

        for (const item of items) {
          if (item.open_amount_paise != null) {
            totalOpen += BigInt(item.open_amount_paise);
          }
          if (item.due_date !== null) {
            if (earliestDue === null || item.due_date < earliestDue) {
              earliestDue = item.due_date;
            }
          }
        }

        return {
          client_id: c.id,
          name: c.name,
          total_open_paise: totalOpen,
          earliest_due_date: earliestDue,
          category_id: categoryId,
          relationship_tier: c.relationship_tier,
        };
      }),
    );

    // Fetch global config
    const { data: systemConfig } = await adminAny
      .from("system_config")
      .select("global_max_messages_per_week")
      .limit(1)
      .maybeSingle() as {
        data: { global_max_messages_per_week: number } | null;
        error: unknown;
      };

    const globalMaxPerWeek = systemConfig?.global_max_messages_per_week ?? 7;

    const result = simulate({
      clients: clientsForSim,
      current_cadence: { steps: currentSteps, max_messages_per_week: currentMaxPerWeek },
      proposed_cadence: {
        steps: proposed_steps,
        max_messages_per_week: proposed_max_messages_per_week,
      },
      window_days,
      global_max_messages_per_week: globalMaxPerWeek,
    });

    return ok({ data: result });
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
