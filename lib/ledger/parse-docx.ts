import mammoth from "mammoth";
import { parseRupeesToPaise } from "@/lib/money";
import { naturalKey } from "@/lib/ledger/natural-key";
import type { ParsedLedger, ParsedEntry } from "@/lib/ledger/parse-xlsx";

/**
 * Parses Word documents (.docx or raw text documents) containing payment/invoice statements.
 * Extracts client details, invoice line items, amounts, and dates.
 */
export async function parseDocxDocument(buffer: Buffer, originalFilename: string = "document.docx"): Promise<ParsedLedger> {
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value;
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let clientCode = "DOC_CLIENT";
  let clientName = "Document Client";
  let openingBalancePaise = 0n;
  let closingBalancePaise = 0n;
  const entries: ParsedEntry[] = [];

  // Match Client Name / Code
  const clientMatch = rawText.match(/(?:Client(?:\s+Name)?|Corporate|Customer|Account):\s*([^\n\r,]+)/i);
  if (clientMatch && clientMatch[1]) {
    clientName = clientMatch[1].trim();
    clientCode = clientName.replace(/[^A-Za-z0-9]/g, "_").toUpperCase().slice(0, 20);
  }

  let rowCounter = 1;
  const todayIso = new Date().toISOString().split("T")[0]!;

  for (const line of lines) {
    // Check for opening balance
    const openingMatch = line.match(/(?:Opening\s+Balance|B\/F|Balance\s+Brought\s+Forward)[:\s]+(?:Rs\.?|₹|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (openingMatch && openingMatch[1]) {
      try {
        const parsed = parseRupeesToPaise(openingMatch[1].replace(/,/g, ""));
        if (parsed != null) openingBalancePaise = parsed;
      } catch {
        // ignore
      }
      continue;
    }

    // Check for closing / total balance
    const closingMatch = line.match(/(?:Closing\s+Balance|Total\s+Due|Total\s+Outstanding|Grand\s+Total)[:\s]+(?:Rs\.?|₹|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (closingMatch && closingMatch[1]) {
      try {
        const parsed = parseRupeesToPaise(closingMatch[1].replace(/,/g, ""));
        if (parsed != null) closingBalancePaise = parsed;
      } catch {
        // ignore
      }
      continue;
    }

    // Check for invoice/doc code and amount in line
    const docCodeMatch = line.match(/\b([A-Z]{2,6}[-/]?\d{3,10}|\d{4,10}|INV[-_]?\d+)\b/i);
    const amountMatch = line.match(/(?:Rs\.?|INR|₹)?\s*([\d,]{3,}(?:\.\d{1,2})?)/i);
    const dateMatch = line.match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/);

    if (amountMatch && amountMatch[1]) {
      const cleanAmt = amountMatch[1].replace(/,/g, "");
      const num = parseFloat(cleanAmt);
      if (!isNaN(num) && num > 0) {
        let entryPaise: bigint;
        try {
          const parsed = parseRupeesToPaise(cleanAmt);
          if (parsed == null) continue;
          entryPaise = parsed;
        } catch {
          continue;
        }

        const docCode = docCodeMatch && docCodeMatch[1] ? docCodeMatch[1].toUpperCase() : `DOC-${rowCounter}`;
        let docDate = todayIso;
        if (dateMatch && dateMatch[1]) {
          const d = new Date(dateMatch[1]);
          if (!isNaN(d.getTime())) {
            docDate = d.toISOString().split("T")[0]!;
          }
        }

        const isCredit = /credit|payment|received|cr\b|refund/i.test(line);
        const entryType = isCredit ? "credit" : "debit";

        entries.push({
          row_number: rowCounter,
          doc_date: docDate,
          doc_code: docCode,
          entry_type: entryType,
          pax_name: line.slice(0, 50),
          bill_amount_paise: entryPaise,
          natural_key: naturalKey(clientCode, docCode, docDate, rowCounter, entryPaise),
          raw_row: { line_text: line },
        });

        rowCounter++;
      }
    }
  }

  // Fallback closing balance if not explicitly provided
  if (closingBalancePaise === 0n && entries.length > 0) {
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const e of entries) {
      if (e.bill_amount_paise != null) {
        if (e.entry_type === "debit") totalDebit += e.bill_amount_paise;
        else if (e.entry_type === "credit") totalCredit += e.bill_amount_paise;
      }
    }
    closingBalancePaise = openingBalancePaise + totalDebit - totalCredit;
  }

  return {
    client_code: clientCode,
    client_name: clientName,
    period_from: entries[0]?.doc_date || todayIso,
    period_to: entries[entries.length - 1]?.doc_date || todayIso,
    opening_balance_paise: openingBalancePaise,
    stated_closing_balance_paise: closingBalancePaise,
    entries,
    raw_header: [{ source: originalFilename, lineCount: lines.length }],
  };
}
