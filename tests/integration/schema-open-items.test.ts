import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

// Load .env.local before importing the admin client so env vars are available.
// In CI this file does not exist; integration tests are excluded via vitest config.
try {
  const env = readFileSync(resolve(__dirname, "../../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local does not exist; proceed — env vars may already be set externally
}

import { getAdminClient } from "@/lib/supabase/admin";

const UNIQUE_SUFFIX = Date.now();
const TEST_CLIENT_CODE = `OI-TEST-${UNIQUE_SUFFIX}`;

const admin = getAdminClient();

let clientId: string;
let importId: string;
let ledgerEntryId: string;

describe("schema: open_item, receipt, allocation tables", () => {
  beforeAll(async () => {
    // Insert a test client
    const { data: clientData, error: clientErr } = await admin
      .from("client")
      .insert({ client_code: TEST_CLIENT_CODE, name: "Open Items Test Client" })
      .select("id")
      .single();
    if (clientErr) throw clientErr;
    clientId = clientData.id;

    // Insert a ledger_import so ledger_entry has a valid FK
    const { data: importData, error: importErr } = await admin
      .from("ledger_import")
      .insert({
        client_id: clientId,
        storage_path: `test/open-items/${UNIQUE_SUFFIX}/file.xlsx`,
        file_sha256: `sha256-oi-${UNIQUE_SUFFIX}`,
        source_filename: "test.xlsx",
      })
      .select("id")
      .single();
    if (importErr) throw importErr;
    importId = importData.id;

    // Insert a ledger_entry (needed for allocation credit_entry_id FK)
    const { data: entryData, error: entryErr } = await admin
      .from("ledger_entry")
      .insert({
        client_id: clientId,
        ledger_import_id: importId,
        natural_key: `NK-OI-${UNIQUE_SUFFIX}`,
        row_number: 1,
        doc_date: "2026-01-15",
        doc_code: "CN001",
        entry_type: "credit",
        raw_row: { test: true },
      })
      .select("id")
      .single();
    if (entryErr) throw entryErr;
    ledgerEntryId = entryData.id;
  });

  afterAll(async () => {
    // Deleting the client cascades contacts; allocation, open_item, receipt and
    // ledger_entry_rejected do not cascade from client, so clean up manually.
    // ledger_entry is append-only (no DELETE), so we clean allocations first,
    // then open_items and receipts, then the client (which cascades ledger rows
    // via ledger_import → but ledger_entry has no ON DELETE CASCADE).
    // We must delete allocations before open_items/receipts.
    if (clientId) {
      // Remove any allocations pointing at open_items for this client
      const { data: openItems } = await admin
        .from("open_item")
        .select("id")
        .eq("client_id", clientId);
      if (openItems && openItems.length > 0) {
        const openItemIds = openItems.map((r) => r.id);
        await admin
          .from("allocation")
          .delete()
          .in("open_item_id", openItemIds);
      }
      await admin.from("open_item").delete().eq("client_id", clientId);
      await admin.from("receipt").delete().eq("client_id", clientId);
      // ledger_import deletion will cascade to ledger_entry_rejected; ledger_entry is
      // append-only so we leave it in place (it orphans but tests are isolated by suffix).
      await admin.from("ledger_import").delete().eq("client_id", clientId);
      await admin.from("client").delete().eq("id", clientId);
    }
  });

  it("open_amount_paise auto-updates when receipts_applied_paise changes", async () => {
    // Insert an open item with gross=10000, receipts=0 → open=10000
    const { data: item, error: insertErr } = await admin
      .from("open_item")
      .insert({
        client_id: clientId,
        source_doc_code: `DOC-AUTO-${UNIQUE_SUFFIX}`,
        issue_date: "2026-01-01",
        gross_amount_paise: 10000,
      })
      .select("id, open_amount_paise")
      .single();

    expect(insertErr).toBeNull();
    expect(item?.open_amount_paise).toBe(10000);

    // Update receipts_applied_paise to 3000 → open should become 7000
    const { error: updateErr } = await admin
      .from("open_item")
      .update({ receipts_applied_paise: 3000 })
      .eq("id", item!.id);
    expect(updateErr).toBeNull();

    const { data: updated, error: selectErr } = await admin
      .from("open_item")
      .select("open_amount_paise")
      .eq("id", item!.id)
      .single();

    expect(selectErr).toBeNull();
    expect(updated?.open_amount_paise).toBe(7000);
  });

  it("allocation with BOTH receipt_id AND credit_entry_id is rejected (XOR check constraint)", async () => {
    // Create a throwaway open_item for this test
    const { data: item, error: itemErr } = await admin
      .from("open_item")
      .insert({
        client_id: clientId,
        source_doc_code: `DOC-XOR-BOTH-${UNIQUE_SUFFIX}`,
        issue_date: "2026-01-02",
        gross_amount_paise: 5000,
      })
      .select("id")
      .single();
    expect(itemErr).toBeNull();

    // Create a receipt to use as receipt_id
    const { data: receipt, error: receiptErr } = await admin
      .from("receipt")
      .insert({
        client_id: clientId,
        receipt_date: "2026-01-10",
        amount_paise: 5000,
        unallocated_paise: 5000,
      })
      .select("id")
      .single();
    expect(receiptErr).toBeNull();

    // Attempt allocation with both receipt_id and credit_entry_id set — must fail
    const { error } = await admin.from("allocation").insert({
      open_item_id: item!.id,
      receipt_id: receipt!.id,
      credit_entry_id: ledgerEntryId,
      amount_paise: 1000,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514"); // check_violation
  });

  it("allocation with NEITHER receipt_id NOR credit_entry_id is rejected (XOR check constraint)", async () => {
    // Create a throwaway open_item
    const { data: item, error: itemErr } = await admin
      .from("open_item")
      .insert({
        client_id: clientId,
        source_doc_code: `DOC-XOR-NONE-${UNIQUE_SUFFIX}`,
        issue_date: "2026-01-03",
        gross_amount_paise: 5000,
      })
      .select("id")
      .single();
    expect(itemErr).toBeNull();

    // Attempt allocation with neither FK set — must fail
    const { error } = await admin.from("allocation").insert({
      open_item_id: item!.id,
      receipt_id: null,
      credit_entry_id: null,
      amount_paise: 1000,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514"); // check_violation
  });

  it("second allocation for the same credit_entry_id is rejected (unique constraint)", async () => {
    // Create two open items to use for two allocations of the same credit note
    const { data: item1, error: item1Err } = await admin
      .from("open_item")
      .insert({
        client_id: clientId,
        source_doc_code: `DOC-CREDIT-1-${UNIQUE_SUFFIX}`,
        issue_date: "2026-01-04",
        gross_amount_paise: 5000,
      })
      .select("id")
      .single();
    expect(item1Err).toBeNull();

    const { data: item2, error: item2Err } = await admin
      .from("open_item")
      .insert({
        client_id: clientId,
        source_doc_code: `DOC-CREDIT-2-${UNIQUE_SUFFIX}`,
        issue_date: "2026-01-05",
        gross_amount_paise: 5000,
      })
      .select("id")
      .single();
    expect(item2Err).toBeNull();

    // First allocation — must succeed
    const { error: firstErr } = await admin.from("allocation").insert({
      open_item_id: item1!.id,
      credit_entry_id: ledgerEntryId,
      amount_paise: 500,
    });
    expect(firstErr).toBeNull();

    // Second allocation for the same credit_entry_id — must fail (unique constraint)
    const { error: secondErr } = await admin.from("allocation").insert({
      open_item_id: item2!.id,
      credit_entry_id: ledgerEntryId,
      amount_paise: 500,
    });

    expect(secondErr).not.toBeNull();
    expect(secondErr?.code).toBe("23505"); // unique_violation
  });

  it("over-allocated open item reaches negative open_amount_paise WITHOUT error", async () => {
    // gross=1000, receipts_applied=2000 → open should be -1000 (over-allocated)
    const { data: item, error: insertErr } = await admin
      .from("open_item")
      .insert({
        client_id: clientId,
        source_doc_code: `DOC-OVER-${UNIQUE_SUFFIX}`,
        issue_date: "2026-01-06",
        gross_amount_paise: 1000,
        receipts_applied_paise: 2000,
      })
      .select("id, open_amount_paise")
      .single();

    expect(insertErr).toBeNull();
    expect(item?.open_amount_paise).toBe(-1000);
  });
});
