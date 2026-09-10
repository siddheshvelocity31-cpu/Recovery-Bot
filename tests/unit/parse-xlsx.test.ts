import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLedgerWorkbook, type ParsedLedger } from "@/lib/ledger/parse-xlsx";

const FIXTURE_PATH = join(
  __dirname,
  "../../tests/fixtures/Olectra_Client_Ledger_Report.xlsx",
);

let ledger: ParsedLedger;

beforeAll(async () => {
  const buffer = readFileSync(FIXTURE_PATH);
  ledger = await parseLedgerWorkbook(buffer);
});

describe("parseLedgerWorkbook — header fields", () => {
  it("extracts client_code", () => {
    expect(ledger.client_code).toBe("OL000001");
  });

  it("extracts client_name", () => {
    expect(ledger.client_name).toBe("OLECTRA GREENTECH LIMITED");
  });

  it("extracts period_from", () => {
    expect(ledger.period_from).toBe("2026-08-17");
  });

  it("extracts period_to", () => {
    expect(ledger.period_to).toBe("2026-08-28");
  });

  it("extracts opening_balance_paise", () => {
    expect(ledger.opening_balance_paise).toBe(513068700n);
  });

  it("extracts stated_closing_balance_paise", () => {
    expect(ledger.stated_closing_balance_paise).toBe(669766100n);
  });
});

describe("parseLedgerWorkbook — entry counts", () => {
  it("has exactly 107 entry rows", () => {
    expect(ledger.entries).toHaveLength(107);
  });

  it("has exactly 9 credit entries (negative bill_amount_paise)", () => {
    const credits = ledger.entries.filter(
      (e) => e.bill_amount_paise !== null && e.bill_amount_paise < 0n,
    );
    expect(credits).toHaveLength(9);
  });

  it("has exactly 4 entries with null bill_amount_paise", () => {
    const nullBills = ledger.entries.filter((e) => e.bill_amount_paise === null);
    expect(nullBills).toHaveLength(4);
  });

  it("has 103 distinct doc_code values", () => {
    const codes = new Set(ledger.entries.map((e) => e.doc_code));
    expect(codes.size).toBe(103);
  });
});

describe("parseLedgerWorkbook — money arithmetic", () => {
  it("sum of 107 bill_amount_paise equals 156697400n", () => {
    const sum = ledger.entries.reduce((acc, e) => {
      return acc + (e.bill_amount_paise ?? 0n);
    }, 0n);
    expect(sum).toBe(156697400n);
  });

  it("opening + sum === stated_closing", () => {
    const sum = ledger.entries.reduce((acc, e) => {
      return acc + (e.bill_amount_paise ?? 0n);
    }, 0n);
    expect(ledger.opening_balance_paise + sum).toBe(
      ledger.stated_closing_balance_paise,
    );
  });
});

describe("parseLedgerWorkbook — first entry", () => {
  it("first entry doc_date is 2026-08-17", () => {
    expect(ledger.entries[0]?.doc_date).toBe("2026-08-17");
  });

  it("first entry doc_code is DW26/304705", () => {
    expect(ledger.entries[0]?.doc_code).toBe("DW26/304705");
  });

  it("first entry entry_type is debit", () => {
    expect(ledger.entries[0]?.entry_type).toBe("debit");
  });
});

describe("parseLedgerWorkbook — natural keys", () => {
  it("all 107 natural_key values are distinct", () => {
    const keys = new Set(ledger.entries.map((e) => e.natural_key));
    expect(keys.size).toBe(107);
  });

  it("parsing same buffer twice produces identical natural keys", async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const ledger2 = await parseLedgerWorkbook(buffer);
    const keys1 = ledger.entries.map((e) => e.natural_key);
    const keys2 = ledger2.entries.map((e) => e.natural_key);
    expect(keys1).toEqual(keys2);
  });
});

describe("parseLedgerWorkbook — row_number", () => {
  it("row_number is 1-based and sequential", () => {
    ledger.entries.forEach((e, i) => {
      expect(e.row_number).toBe(i + 1);
    });
  });
});

describe("parseLedgerWorkbook — raw_row", () => {
  it("raw_row is a non-null Record for every entry", () => {
    for (const entry of ledger.entries) {
      expect(typeof entry.raw_row).toBe("object");
      expect(entry.raw_row).not.toBeNull();
    }
  });
});
