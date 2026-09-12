import ExcelJS from "exceljs";
import { excelSerialToDate } from "@/lib/dates";
import { naturalKey } from "@/lib/ledger/natural-key";
import { validateLedgerRow } from "@/lib/validation/ledger-row";
import { parseRupeesToPaise } from "@/lib/money";

/**
 * Safely extract a plain string from an ExcelJS cell value.
 * Handles rich-text objects ({ richText: [...] }), formula results,
 * and other non-primitive cell values that would otherwise
 * stringify to "[object Object]".
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  // ExcelJS rich-text: { richText: [{ text: "..." }, ...] }
  if (typeof value === "object" && "richText" in value && Array.isArray((value as any).richText)) {
    return ((value as any).richText as Array<{ text: string }>)
      .map((seg) => seg.text ?? "")
      .join("");
  }
  // ExcelJS formula result: { formula: "...", result: <value> }
  if (typeof value === "object" && "result" in value) {
    return cellToString((value as any).result);
  }
  // ExcelJS hyperlink: { text: "...", hyperlink: "..." }
  if (typeof value === "object" && "text" in value) {
    return String((value as any).text);
  }
  // ExcelJS error: { error: { ... } }
  if (typeof value === "object" && "error" in value) {
    return "";
  }
  // Fallback — avoid "[object Object]"
  return "";
}

export interface ParsedLedger {
  client_code: string;
  client_name: string;
  period_from: string;
  period_to: string;
  opening_balance_paise: bigint;
  stated_closing_balance_paise: bigint;
  entries: ParsedEntry[];
  raw_header: Record<string, unknown>[];
}

export interface ParsedEntry {
  row_number: number;
  doc_date: string;
  doc_code: string;
  entry_type: "opening" | "debit" | "credit" | "total";
  pax_name: string | null;
  bill_amount_paise: bigint | null;
  natural_key: string;
  raw_row: Record<string, unknown>;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function getRawRow(row: ExcelJS.Row): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    raw[`col_${colNumber}`] = cell.value;
  });
  return raw;
}

function findColumn(colHeaders: string[], names: string[]): number {
  for (const name of names) {
    const idx = colHeaders.indexOf(name);
    if (idx !== -1) return idx + 1;
  }
  return 0;
}

function toLedgerDate(value: unknown): string {
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === "number") return toIsoDate(excelSerialToDate(value));
  return "";
}

export async function parseLedgerWorkbook(buffer: Buffer): Promise<ParsedLedger> {
  void validateLedgerRow; // available for callers
  const workbook = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(ab);

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) throw new Error("No worksheet found in workbook");
  const rowCount = worksheet.rowCount;

  // 1. Locate the header row (any cell containing "Doc Date" or "Doc No")
  let headerRowIndex = 8;
  for (let i = 1; i <= rowCount; i++) {
    const row = worksheet.getRow(i);
    let found = false;
    row.eachCell((cell) => {
      const val = cell.value != null ? String(cell.value).trim().toLowerCase().replace(/\s+/g, " ") : "";
      if (val === "doc date" || val === "doc no" || val === "doc code") {
        found = true;
      }
    });
    if (found) {
      headerRowIndex = i;
      break;
    }
  }

  // 2. Extract header block rows (above the header row)
  const headerBlock: Record<string, unknown>[] = [];
  for (let i = 1; i < headerRowIndex; i++) {
    const row: Record<string, unknown> = {};
    let firstValue: unknown = null;
    for (let j = 1; j <= worksheet.columnCount; j++) {
      const value = worksheet.getCell(i, j)?.value;
      row[`col_${j}`] = value;
      if (firstValue === null && value !== null && String(value).trim() !== "") {
        firstValue = value;
      }
    }
    row["col_1"] = firstValue;
    headerBlock.push(row);
  }

  // 3. Extract client_code and client_name from header
  let client_code = "";
  let client_name = "";
  for (const row of headerBlock) {
    for (let j = 1; j <= 10; j++) {
      const val = row[`col_${j}`];
      if (val != null && /\[[A-Za-z0-9_\-]+\]/.test(String(val))) {
        const match = String(val).match(/\[([A-Za-z0-9_\-]+)\]/);
        if (match) client_code = match[1]!;
        client_name = String(val)
          .replace(/^General\s+Ledger\s+/i, "")
          .replace(/^Client\s+/i, "")
          .replace(/\[[A-Za-z0-9_\-]+\]/, "")
          .trim();
        break;
      }
    }
    if (client_code) break;
  }

  // 4. Extract period_from / period_to from "Ledger Statement From ... to ..."
  let period_from = "";
  let period_to = "";
  for (const row of headerBlock) {
    for (let j = 1; j <= 10; j++) {
      const val = row[`col_${j}`];
      if (val != null && String(val).toLowerCase().includes("ledger statement from")) {
        const match = String(val).match(
          /Ledger Statement From\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+to\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
        );
        if (match) {
          period_from = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
          period_to = `${match[6]}-${match[5]!.padStart(2, "0")}-${match[4]!.padStart(2, "0")}`;
        }
        break;
      }
    }
    if (period_from) break;
  }

  // 5. Get column headers from the header row
  const colHeaderRow = worksheet.getRow(headerRowIndex);
  const colHeaders: string[] = [];
  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cellValue = colHeaderRow.getCell(j)?.value;
    colHeaders.push(cellValue !== null ? String(cellValue).trim().toLowerCase().replace(/\s+/g, " ") : "");
  }

  // 6. Classify and collect debit/credit entries
  const entries: ParsedEntry[] = [];
  let openingAmountPaise: bigint = 0n;

  const docDateIdx = findColumn(colHeaders, ["doc date", "date"]);
  const docCodeIdx = findColumn(colHeaders, ["doc no", "doc code", "code", "reference"]);
  const codeIdx = findColumn(colHeaders, ["code", "doc no", "type"]);
  const billAmountIdx = findColumn(colHeaders, ["bill amount", "amount", "debit", "balance"]);
  const debitIdx = findColumn(colHeaders, ["debit"]);
  const creditIdx = findColumn(colHeaders, ["credit"]);
  const narrationIdx = findColumn(colHeaders, ["description", "narration", "particulars", "reference"]);
  const paxIdx = findColumn(colHeaders, ["passenger", "pax name", "pax"]);

  for (let i = headerRowIndex + 1; i <= rowCount; i++) {
    const row = worksheet.getRow(i);

    const docCodeCell = docCodeIdx ? row.getCell(docCodeIdx)?.value : undefined;
    const docDateCell = docDateIdx ? row.getCell(docDateIdx)?.value : undefined;

    if (docCodeCell == null && docDateCell == null) continue;
    const docCodeStr = docCodeCell != null ? cellToString(docCodeCell).trim() : "";
    if (!docCodeStr && docDateCell == null) continue;

    const entryDocDate = toLedgerDate(docDateCell);

    const codeStr = codeIdx ? cellToString(row.getCell(codeIdx)?.value).trim() : "";
    const isOpening = docCodeStr.toUpperCase() === "B/F" || codeStr.toUpperCase() === "B/F" || docCodeStr.toUpperCase().includes("OPENING");
    const isTotal = docCodeStr.toUpperCase().includes("TOTAL") || codeStr.toUpperCase().includes("TOTAL");

    if (isTotal) continue;

    let paise: bigint | null = null;
    let isCredit = false;

    if (debitIdx && creditIdx) {
      const debitVal = row.getCell(debitIdx)?.value;
      const creditVal = row.getCell(creditIdx)?.value;
      const debitStr = cellToString(debitVal).trim();
      const creditStr = cellToString(creditVal).trim();
      const debitPaise = debitStr !== "" ? parseRupeesToPaise(debitStr) : 0n;
      const creditPaise = creditStr !== "" ? parseRupeesToPaise(creditStr) : 0n;

      if ((debitPaise ?? 0n) > 0n) {
        paise = debitPaise;
        isCredit = false;
      } else if ((creditPaise ?? 0n) > 0n) {
        paise = -(creditPaise ?? 0n);
        isCredit = true;
      } else {
        const rawAmount = billAmountIdx ? row.getCell(billAmountIdx)?.value : undefined;
        const rawStr = rawAmount != null ? cellToString(rawAmount).trim() : "";
        paise = rawStr !== "" ? (parseRupeesToPaise(rawStr) ?? null) : null;
      }
    } else {
      const rawAmount = billAmountIdx ? row.getCell(billAmountIdx)?.value : undefined;
      const rawStr = rawAmount != null ? cellToString(rawAmount).trim() : "";
      paise = rawStr !== "" ? (parseRupeesToPaise(rawStr) ?? null) : null;
      if (paise !== null && paise < 0n) isCredit = true;
    }

    if (isOpening) {
      openingAmountPaise = paise ?? 0n;
      continue;
    }

    const narration = narrationIdx ? cellToString(row.getCell(narrationIdx)?.value).trim() : null;
    const paxName = paxIdx ? cellToString(row.getCell(paxIdx)?.value).trim() : null;

    entries.push({
      row_number: entries.length + 1,
      doc_date: entryDocDate,
      doc_code: docCodeStr || `ROW_${i}`,
      entry_type: isCredit ? "credit" : "debit",
      pax_name: paxName || null,
      bill_amount_paise: paise,
      natural_key: naturalKey(
        client_code || "AUTO",
        docCodeStr || `ROW_${i}`,
        entryDocDate,
        entries.length + 1,
        paise ?? 0n,
      ),
      raw_row: getRawRow(row),
    });
  }

  const sum = entries.reduce((acc, e) => acc + (e.bill_amount_paise ?? 0n), 0n);
  const stated_closing_balance_paise = openingAmountPaise + sum;

  return {
    client_code,
    client_name,
    period_from,
    period_to,
    opening_balance_paise: openingAmountPaise,
    stated_closing_balance_paise,
    entries,
    raw_header: headerBlock,
  };
}
