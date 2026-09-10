export interface LedgerEntryRow {
  id: string;
  client_id: string;
  doc_date: string; // ISO date
  doc_code: string;
  entry_type: "opening" | "debit" | "credit" | "total";
  narration: string | null;
  pax_name: string | null;
  reference: string | null;
  bill_amount_paise: bigint | null;
  natural_key: string;
}

export interface DerivedOpenItem {
  client_id: string;
  source_doc_code: string;
  source_reference: string | null;
  issue_date: string; // ISO date (from doc_date of first/only row in group)
  gross_amount_paise: bigint;
  is_unaged: boolean; // true only for entry_type='opening' (B/F)
  pax_names: string[]; // collected from all rows in group, nulls removed
}

/**
 * Derive open items from raw ledger entries.
 *
 * Rules:
 * - Only `entry_type` of `'opening'` or `'debit'` are processed; credits and totals are skipped.
 * - `opening` entries become a single B/F item with `is_unaged=true`.
 *   `gross_amount_paise` is `abs(bill_amount_paise)` because opening balances
 *   are typically stored as negative values in the fixture.
 * - `debit` entries are grouped by `doc_code`. Within each group the amounts are
 *   summed (null treated as 0). Groups where the sum ≤ 0 (credit-net) are dropped.
 * - `issue_date` for a debit group is the earliest `doc_date` in the group.
 * - `source_reference` is the first non-null `reference` in the group.
 * - `pax_names` collects all non-null `pax_name` values across the group.
 */
export function deriveOpenItems(entries: LedgerEntryRow[]): DerivedOpenItem[] {
  const result: DerivedOpenItem[] = [];

  // Separate opening entries from debit entries up-front.
  const openingEntries = entries.filter((e) => e.entry_type === "opening");
  const debitEntries = entries.filter((e) => e.entry_type === "debit");

  // --- B/F (opening balance) items ---
  for (const entry of openingEntries) {
    const raw = entry.bill_amount_paise ?? 0n;
    // Opening balances are stored as negative; take absolute value.
    const gross_amount_paise = raw < 0n ? -raw : raw;

    result.push({
      client_id: entry.client_id,
      source_doc_code: entry.doc_code,
      source_reference: entry.reference,
      issue_date: entry.doc_date,
      gross_amount_paise,
      is_unaged: true,
      pax_names: entry.pax_name !== null ? [entry.pax_name] : [],
    });
  }

  // --- Debit items grouped by doc_code ---
  // Preserve insertion order for deterministic output.
  const groups = new Map<
    string,
    {
      client_id: string;
      doc_dates: string[];
      sum_paise: bigint;
      first_reference: string | null;
      pax_names: string[];
    }
  >();

  for (const entry of debitEntries) {
    const key = entry.doc_code;
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, {
        client_id: entry.client_id,
        doc_dates: [entry.doc_date],
        sum_paise: entry.bill_amount_paise ?? 0n,
        first_reference: entry.reference,
        pax_names: entry.pax_name !== null ? [entry.pax_name] : [],
      });
    } else {
      existing.doc_dates.push(entry.doc_date);
      existing.sum_paise += entry.bill_amount_paise ?? 0n;
      if (existing.first_reference === null && entry.reference !== null) {
        existing.first_reference = entry.reference;
      }
      if (entry.pax_name !== null) {
        existing.pax_names.push(entry.pax_name);
      }
    }
  }

  for (const [doc_code, group] of groups) {
    // Skip credit-net groups.
    if (group.sum_paise <= 0n) continue;

    // Earliest doc_date — ISO strings sort lexicographically as calendar dates.
    const issue_date = group.doc_dates.slice().sort()[0]!;

    result.push({
      client_id: group.client_id,
      source_doc_code: doc_code,
      source_reference: group.first_reference,
      issue_date,
      gross_amount_paise: group.sum_paise,
      is_unaged: false,
      pax_names: group.pax_names,
    });
  }

  return result;
}
