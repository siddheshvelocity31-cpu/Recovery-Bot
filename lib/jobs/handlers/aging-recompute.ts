import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { computeAgingBucket } from "@/lib/ledger/aging"
import type { OpenItemForAging } from "@/lib/ledger/aging"
import type { Job } from "@/lib/jobs/queue"

export async function handleAgingRecompute(job: Job): Promise<void> {
  const client_id = job.payload.client_id as string | undefined

  const admin = getAdminClient()

  // 1. Fetch open items — all non-settled for client_id, or all if no client_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from("open_item")
    .select("id, due_date, is_unaged")
    .not("status", "in", '("settled","written_off")')

  if (client_id !== undefined) {
    query = query.eq("client_id", client_id)
  }

  const { data: rawItems, error: itemsError } = await query

  if (itemsError) throw itemsError

  const items: Array<OpenItemForAging> = ((rawItems ?? []) as Array<Record<string, unknown>>).map(
    (r): OpenItemForAging => ({
      id: r.id as string,
      due_date: (r.due_date as string | null) ?? null,
      is_unaged: r.is_unaged as boolean,
    }),
  )

  const today = new Date()

  // 2. Compute aging bucket for each item and batch-update
  let updated = 0

  for (const item of items) {
    const bucket = computeAgingBucket(item, today)

    // 3. UPDATE aging_bucket on each open_item row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (admin as any)
      .from("open_item")
      .update({ aging_bucket: bucket })
      .eq("id", item.id)

    if (updateError) throw updateError

    updated += 1
  }

  // 4. Log count updated
  console.log(
    `[aging-recompute] client=${client_id ?? "ALL"} updated=${updated}`,
  )

  // Enqueue flags evaluation for this client
  if (client_id !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getAdminClient() as any).from("job").insert({
      kind: "flags.evaluate",
      payload: { client_id },
    })
  }
}
