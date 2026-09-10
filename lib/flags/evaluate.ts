import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { writeEvent } from "@/lib/events/write";
import {
  evaluateAllRules,
  type ClientForFlags,
  type OpenItemForFlags,
} from "@/lib/flags/rules";

/**
 * Evaluate all flag rules for a single client, persist new flags, and
 * auto-resolve flags whose conditions have cleared.
 *
 * Returns the count of newly raised and auto-resolved flags.
 */
export async function evaluateClientFlags(
  clientId: string,
  today: Date,
): Promise<{ raised: number; resolved: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  // 1. Fetch the client row joined to its category's threshold_set.
  const { data: clientRow, error: clientError } = await admin
    .from("client")
    .select(
      `
      id,
      category_id,
      category:category(
        threshold_set:threshold_set(
          amber_days,
          red_days,
          amber_amount_paise,
          red_amount_paise,
          silence_attempts
        )
      )
    `,
    )
    .eq("id", clientId)
    .single();

  if (clientError) throw clientError;
  if (!clientRow) throw new Error(`Client not found: ${clientId}`);

  // Pull thresholds from the joined category; fall back to safe defaults if
  // the client has no category or the category has no threshold_set.
  const thresholds = clientRow.category?.threshold_set ?? null;
  const amber_days: number = thresholds?.amber_days ?? 30;
  const red_days: number = thresholds?.red_days ?? 60;
  const amber_amount_paise: bigint | null =
    thresholds?.amber_amount_paise != null
      ? BigInt(thresholds.amber_amount_paise)
      : null;
  const red_amount_paise: bigint | null =
    thresholds?.red_amount_paise != null
      ? BigInt(thresholds.red_amount_paise)
      : null;
  const silence_attempts: number = thresholds?.silence_attempts ?? 3;

  // 2. Fetch all non-settled open items for this client.
  const { data: rawItems, error: itemsError } = await admin
    .from("open_item")
    .select(
      "id, source_doc_code, due_date, open_amount_paise, aging_bucket, is_unaged, status",
    )
    .eq("client_id", clientId)
    .not("status", "in", '("settled","written_off")');

  if (itemsError) throw itemsError;

  const items: OpenItemForFlags[] = (rawItems ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any): OpenItemForFlags => ({
      id: r.id,
      source_doc_code: r.source_doc_code,
      due_date: r.due_date ?? null,
      open_amount_paise: BigInt(r.open_amount_paise ?? 0),
      aging_bucket: r.aging_bucket,
      is_unaged: r.is_unaged,
      status: r.status,
    }),
  );

  // 3. Fetch outreach stats: consecutive failed outreach, days since last reply,
  //    and whether there is a broken commitment.

  // Consecutive failed outreach — count the tail of failed/queued outreach rows
  // with no intervening reply.  We approximate by counting outreach rows with
  // status='failed' that are newer than the latest reply (if any).
  const { data: latestReply, error: replyError } = await admin
    .from("reply")
    .select("received_at")
    .eq("client_id", clientId)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (replyError) throw replyError;

  const lastReplyAt: string | null = latestReply?.received_at ?? null;

  // Days since last reply
  const days_since_last_reply: number | null =
    lastReplyAt !== null
      ? Math.floor(
          (today.getTime() - new Date(lastReplyAt).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

  // Count failed outreach attempts since the last reply (or all time if no reply).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let failedQuery: any = admin
    .from("outreach")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "failed");

  if (lastReplyAt !== null) {
    failedQuery = failedQuery.gt("sent_at", lastReplyAt);
  }

  const { count: failedCount, error: failedError } = await failedQuery;
  if (failedError) throw failedError;

  const consecutive_failed_outreach: number = failedCount ?? 0;

  // Broken promise check — any commitment with status='broken' for this client's cases.
  const { data: brokenCommitments, error: commitmentError } = await admin
    .from("commitment")
    .select("id, case_id, recovery_case!inner(client_id)")
    .eq("recovery_case.client_id", clientId)
    .eq("status", "broken")
    .limit(1);

  if (commitmentError) throw commitmentError;
  const has_broken_promise = (brokenCommitments ?? []).length > 0;

  // 4. Compute totals needed by the rules.
  let total_open_paise = 0n;
  let total_unaged_paise = 0n;

  for (const item of items) {
    total_open_paise += item.open_amount_paise;
    if (item.is_unaged) {
      total_unaged_paise += item.open_amount_paise;
    }
  }

  // 5. Build ClientForFlags and evaluate all rules.
  const clientForFlags: ClientForFlags = {
    client_id: clientId,
    threshold_amber_days: amber_days,
    threshold_red_days: red_days,
    threshold_amber_amount_paise: amber_amount_paise,
    threshold_red_amount_paise: red_amount_paise,
    silence_attempts,
    consecutive_failed_outreach,
    has_broken_promise,
    days_since_last_reply,
    today,
  };

  const outputs = evaluateAllRules(
    clientForFlags,
    items,
    total_open_paise,
    total_unaged_paise,
  );

  const currentDedupeKeys = new Set(outputs.map((o) => o.dedupe_key));

  // 6. Fetch all currently live flags for this client (resolved_at IS NULL).
  const { data: liveFlags, error: liveFlagsError } = await admin
    .from("flag")
    .select("id, dedupe_key")
    .eq("client_id", clientId)
    .is("resolved_at", null);

  if (liveFlagsError) throw liveFlagsError;

  const liveFlagMap = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (liveFlags ?? []).map((f: any) => [f.dedupe_key as string, f.id as string]),
  );

  let raised = 0;
  let resolved = 0;

  // 7. Insert new flags for outputs whose dedupe_key has no live flag yet.
  for (const output of outputs) {
    if (liveFlagMap.has(output.dedupe_key)) {
      // Flag already live — do not duplicate.
      continue;
    }

    const { error: insertError } = await admin.from("flag").insert({
      client_id: clientId,
      open_item_id: output.open_item_id,
      rule: output.rule,
      severity: output.severity,
      message: output.message,
      dedupe_key: output.dedupe_key,
    });

    if (insertError) throw insertError;

    raised += 1;

    // Emit flag.raised event on the client trail.
    await writeEvent({
      clientId,
      actorType: "system",
      type: "flag.raised",
      payload: {
        rule: output.rule,
        severity: output.severity,
        dedupe_key: output.dedupe_key,
        message: output.message,
      },
    });
  }

  // 8. Auto-resolve live flags whose condition has cleared.
  const flagsToResolve = (liveFlags ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f: any) => !currentDedupeKeys.has(f.dedupe_key as string),
  );

  for (const flag of flagsToResolve) {
    const { error: resolveError } = await admin
      .from("flag")
      .update({
        resolved_at: new Date().toISOString(),
        resolution: "Condition cleared automatically",
      })
      .eq("id", flag.id);

    if (resolveError) throw resolveError;

    resolved += 1;

    // Emit flag.resolved event on the client trail.
    await writeEvent({
      clientId,
      actorType: "system",
      type: "flag.resolved",
      payload: {
        dedupe_key: flag.dedupe_key,
        resolution: "Condition cleared automatically",
      },
    });
  }

  return { raised, resolved };
}
