import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { writeEvent } from "@/lib/events/write";

/**
 * Verifies active commitments for a client (or all clients) against current time.
 * If a confirmed commitment's due date + grace period has elapsed and balance remains unpaid,
 * updates status to 'broken', fires 'commitment.broken' event, and triggers flag evaluation.
 */
export async function verifyCommitments(now: Date = new Date()): Promise<{ brokenCount: number; checkedCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;

  // 1. Fetch all confirmed commitments
  const { data: commitments, error } = await admin
    .from("commitment")
    .select(`
      id,
      case_id,
      due_at,
      amount_paise,
      status,
      recovery_case:recovery_case!inner(
        id,
        client_id,
        total_open_paise,
        client:client!inner(
          id,
          category:category(
            threshold_set:threshold_set(
              promise_grace_hours
            )
          )
        )
      )
    `)
    .eq("status", "confirmed");

  if (error) throw error;
  if (!commitments || commitments.length === 0) {
    return { brokenCount: 0, checkedCount: 0 };
  }

  let brokenCount = 0;

  for (const c of commitments) {
    if (!c.due_at) continue;

    const dueDate = new Date(c.due_at);
    const graceHours = c.recovery_case?.client?.category?.threshold_set?.promise_grace_hours ?? 24;
    const deadline = new Date(dueDate.getTime() + graceHours * 60 * 60 * 1000);

    // If deadline has passed
    if (now > deadline) {
      const clientId = c.recovery_case?.client_id;
      const caseId = c.case_id;

      // Check if open balance remains
      const openAmountPaise = BigInt(c.recovery_case?.total_open_paise ?? 0);

      if (openAmountPaise > 0n) {
        // Mark commitment as broken
        await admin
          .from("commitment")
          .update({
            status: "broken",
            updated_at: now.toISOString(),
          })
          .eq("id", c.id);

        brokenCount++;

        // Log commitment.broken event
        if (clientId) {
          await writeEvent({
            clientId,
            caseId: caseId ?? undefined,
            actorType: "system",
            type: "commitment.broken",
            payload: {
              commitment_id: c.id,
              due_at: c.due_at,
              deadline: deadline.toISOString(),
              total_open_paise: openAmountPaise.toString(),
            },
          });

          // Enqueue flag & case evaluation to trigger Red Flag & Case Transition
          await admin.from("job").insert([
            { kind: "flags.evaluate", payload: { client_id: clientId } },
            { kind: "case.evaluate", payload: { client_id: clientId } },
          ]);
        }
      }
    }
  }

  return { brokenCount, checkedCount: commitments.length };
}
