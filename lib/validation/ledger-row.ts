import { parseRupeesToPaise } from "@/lib/money";

export interface LedgerRowValidation {
  errors: string[];
  warnings: string[];
}

export function validateLedgerRow(
  rawRow: Record<string, unknown>,
  rowIndex: number,
): LedgerRowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate that key fields exist
  if (rawRow.doc_date == null) {
    errors.push(`Row ${rowIndex}: doc_date is required`);
  }

  if (rawRow.doc_code == null) {
    errors.push(`Row ${rowIndex}: doc_code is required`);
  }

  // Validate money amount if present
  if (rawRow.bill_amount_paise != null) {
    const paise = parseRupeesToPaise(String(rawRow.bill_amount_paise));
    if (paise === null) {
      errors.push(`Row ${rowIndex}: invalid bill_amount_paise format`);
    }
  }

  return { errors, warnings };
}