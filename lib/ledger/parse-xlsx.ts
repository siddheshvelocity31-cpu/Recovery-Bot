import ExcelJS from "exceljs";
import { excelSerialToDate } from "@/lib/dates";
import { naturalKey } from "@/lib/ledger/natural-key";
import { validateLedgerRow } from "@/lib/validation/ledger-row";
import { parseRupeesToPaise } from "@/lib/money";

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

  // 1. Locate the header row (first cell trimmed to "Doc Date")
  let headerRowIndex = 8;
  for (let i = 1; i <= rowCount; i++) {
    const firstCell = worksheet.getCell(i, 1)?.value;
    if (
      firstCell !== null &&
      String(firstCell).trim().toLowerCase().replace(/\s+/g, " ") === "doc date"
    ) {
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
  const clientLine = headerBlock.find(
    (row) => row["col_1"] && /\[[A-Z0-9]+\]/.test(String(row["col_1"])),
  );
  if (clientLine) {
    const match = String(clientLine["col_1"]).match(/\[([A-Z0-9]+)\]/);
    if (match) client_code = match[1]!;
    client_name = String(clientLine["col_1"])
      .replace(/^Client\s+/i, "")
      .replace(/\[[A-Z0-9]+\]/, "")
      .trim();
  }

  // 4. Extract period_from / period_to from "Ledger Statement From ... to ..."
  let period_from = "";
  let period_to = "";
  const periodLine = headerBlock.find(
    (row) => row["col_1"] && String(row["col_1"]).includes("Ledger Statement From"),
  );
  if (periodLine) {
    const periodStr = String(periodLine["col_1"]);
    const match = periodStr.match(
      /Ledger Statement From\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+to\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
    );
    if (match) {
      period_from = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
      period_to = `${match[6]}-${match[5]!.padStart(2, "0")}-${match[4]!.padStart(2, "0")}`;
    }
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

  for (let i = headerRowIndex + 1; i <= rowCount; i++) {
    const row = worksheet.getRow(i);
    const docCodeIdx = findColumn(colHeaders, ["doc code", "code"]);
    const docCodeCell = docCodeIdx ? row.getCell(docCodeIdx) : undefined;
    const docCode = docCodeCell?.value;

    if (docCode == null || String(docCode).trim() === "") continue;

    const docDateIdx = findColumn(colHeaders, ["doc date"]);
    const docDateRaw = docDateIdx ? row.getCell(docDateIdx)?.value : undefined;
    const entryDocDate = toLedgerDate(docDateRaw);

    const codeIdx = findColumn(colHeaders, ["code"]);
    const code = codeIdx ? row.getCell(codeIdx)?.value : undefined;
    const isOpening = code != null && String(code).trim() === "B/F";
    const isTotal = code == null || String(code).trim() === "";

    const billAmountIdx = findColumn(colHeaders, ["bill amount"]);
    const rawAmount = billAmountIdx ? row.getCell(billAmountIdx)?.value : undefined;
    const paise: bigint | null = rawAmount != null && String(rawAmount).trim() !== ""
      ? (parseRupeesToPaise(String(rawAmount)) ?? null)
      : null;

    if (isOpening) {
      openingAmountPaise = paise ?? 0n;
      continue;
    }

    if (isTotal) continue;

    const isNegative = paise !== null && paise < 0n;

    entries.push({
      row_number: entries.length + 1,
      doc_date: entryDocDate,
      doc_code: String(docCode).trim(),
      entry_type: isNegative ? "credit" : "debit",
      pax_name: null,
      bill_amount_paise: paise,
      natural_key: naturalKey(
        client_code,
        String(docCode).trim(),
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
