export interface CreditEntry {
  id: string;
  doc_code: string;
  narration: string | null;
  reference: string | null;
  ticket_no: string | null;
  pnr: string | null;
  bill_amount_paise: bigint; // negative value (credit)
}

export interface OpenItemForAllocation {
  id: string;
  source_doc_code: string;
  gross_amount_paise: bigint;
  credits_applied_paise: bigint;
  open_amount_paise: bigint; // = gross - credits - receipts (computed / stored)
}

export interface CreditAllocation {
  credit_entry_id: string;
  open_item_id: string;
  amount_paise: bigint; // positive: amount being applied
}

export interface AllocationResult {
  allocations: CreditAllocation[];
  unmatched_credit_ids: string[];
}

/**
 * Match credit entries to open items and compute how much of each credit
 * should be applied to which open item.
 *
 * Matching priority (first match wins):
 *   1. Credit narration contains the open item's `source_doc_code`.
 *   2. Credit `ticket_no` or `pnr` matches `source_doc_code`.
 *   3. Credit `reference` matches `source_doc_code`.
 *
 * Allocation is capped at `min(creditAbs, openItem.open_amount_paise)` so we
 * never over-allocate. The open item balances are updated in-memory as credits
 * are applied, allowing multiple credits to target the same open item in a
 * single pass.
 *
 * Credits with no matching open item are collected in `unmatched_credit_ids`.
 */
export function allocateCredits(
  credits: CreditEntry[],
  openItems: OpenItemForAllocation[],
): AllocationResult {
  // Work with mutable copies of open_amount_paise so successive credits against
  // the same open item are applied correctly within a single call.
  const remainingBalance = new Map<string, bigint>(
    openItems.map((item) => [item.id, item.open_amount_paise]),
  );

  // Build a lookup from source_doc_code → open item id for O(1) matching.
  const byDocCode = new Map<string, OpenItemForAllocation>(
    openItems.map((item) => [item.source_doc_code, item]),
  );

  const allocations: CreditAllocation[] = [];
  const unmatched_credit_ids: string[] = [];

  for (const credit of credits) {
    // Credit amounts are stored as negative; convert to positive.
    const creditAbs =
      credit.bill_amount_paise < 0n
        ? -credit.bill_amount_paise
        : credit.bill_amount_paise;

    if (creditAbs === 0n) {
      // Zero-value credit — nothing to allocate.
      unmatched_credit_ids.push(credit.id);
      continue;
    }

    // --- Try to find a matching open item ---
    let matchedItem: OpenItemForAllocation | undefined;

    // Priority 1: narration contains the target doc_code.
    if (matchedItem === undefined && credit.narration !== null) {
      for (const item of openItems) {
        if (credit.narration.includes(item.source_doc_code)) {
          matchedItem = item;
          break;
        }
      }
    }

    // Priority 2: ticket_no or pnr matches source_doc_code.
    if (matchedItem === undefined) {
      const ticketMatch =
        credit.ticket_no !== null
          ? byDocCode.get(credit.ticket_no)
          : undefined;
      const pnrMatch =
        credit.pnr !== null ? byDocCode.get(credit.pnr) : undefined;
      matchedItem = ticketMatch ?? pnrMatch;
    }

    // Priority 3: reference matches source_doc_code.
    if (matchedItem === undefined && credit.reference !== null) {
      matchedItem = byDocCode.get(credit.reference);
    }

    if (matchedItem === undefined) {
      unmatched_credit_ids.push(credit.id);
      continue;
    }

    const currentBalance = remainingBalance.get(matchedItem.id) ?? 0n;

    if (currentBalance <= 0n) {
      // The open item is already fully settled by earlier credits in this batch.
      unmatched_credit_ids.push(credit.id);
      continue;
    }

    // Allocate at most what the open item still needs.
    const applyAmount = creditAbs < currentBalance ? creditAbs : currentBalance;

    allocations.push({
      credit_entry_id: credit.id,
      open_item_id: matchedItem.id,
      amount_paise: applyAmount,
    });

    remainingBalance.set(matchedItem.id, currentBalance - applyAmount);
  }

  return { allocations, unmatched_credit_ids };
}
