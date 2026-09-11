import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { writeEvent } from "@/lib/events/write"
import { deriveOpenItems } from "@/lib/ledger/open-items"
import type { LedgerEntryRow } from "@/lib/ledger/open-items"
import type { Job } from "@/lib/jobs/queue"
import type { Json } from "@/lib/types/database"

export async function handleDeriveOpenItems(job: Job): Promise<void> {
  const import_id = job.payload.import_id as string
  const client_id = job.payload.client_id as string

  const admin = getAdminClient()

  // 1. Fetch all ledger_entry rows for the import_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawEntries, error: entriesError } = await (admin as any)
    .from("ledger_entry")
    .select(
      "id, client_id, doc_date, doc_code, entry_type, narration, pax_name, reference, bill_amount_paise, natural_key",
    )
    .eq("ledger_import_id", import_id)

  if (entriesError) throw entriesError

  // Convert DB number fields to BigInt for pure functions
  const entries: LedgerEntryRow[] = ((rawEntries ?? []) as Array<Record<string, unknown>>).map(
    (r): LedgerEntryRow => ({
      id: r.id as string,
      client_id: r.client_id as string,
      doc_date: r.doc_date as string,
      doc_code: r.doc_code as string,
      entry_type: r.entry_type as LedgerEntryRow["entry_type"],
      narration: (r.narration as string | null) ?? null,
      pax_name: (r.pax_name as string | null) ?? null,
      reference: (r.reference as string | null) ?? null,
      bill_amount_paise:
        r.bill_amount_paise != null ? BigInt(r.bill_amount_paise as number) : null,
      natural_key: r.natural_key as string,
    }),
  )

  // 2. Derive open items from entries
  const derived = deriveOpenItems(entries)

  // 3. Upsert each derived item; track which ones are newly created
  let created = 0
  let skipped = 0

  for (const item of derived) {
    // Check if the item already exists so we can emit the created event only for new ones
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (admin as any)
      .from("open_item")
      .select("id")
      .eq("client_id", item.client_id)
      .eq("source_doc_code", item.source_doc_code)
      .maybeSingle()

    const isNew = !existing

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (admin as any)
      .from("open_item")
      .upsert(
        {
          client_id: item.client_id,
          source_doc_code: item.source_doc_code,
          source_reference: item.source_reference,
          issue_date: item.issue_date,
          gross_amount_paise: Number(item.gross_amount_paise),
          is_unaged: item.is_unaged,
        },
        {
          onConflict: "client_id,source_doc_code",
          ignoreDuplicates: false,
        },
      )
      .select("id")

    if (upsertError) throw upsertError

    if (isNew) {
      // 4. Write open_item.created event for each new item
      await writeEvent({
        clientId: item.client_id,
        actorType: "system",
        type: "open_item.created",
        payload: {
          source_doc_code: item.source_doc_code,
          gross_amount_paise: item.gross_amount_paise.toString(),
          is_unaged: item.is_unaged,
          import_id,
        } as Record<string, unknown> as Record<string, Json>,
      })
      created += 1
    } else {
      skipped += 1
    }
  }

  // 5. Enqueue case.evaluate job for client_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: jobError } = await (admin as any)
    .from("job")
    .insert({
      kind: "case.evaluate",
      payload: { client_id } as unknown as Json,
    })

  if (jobError) throw jobError

  console.log(
    `[derive-open-items] import=${import_id} client=${client_id} derived=${derived.length} created=${created} skipped=${skipped}`,
  )
}
